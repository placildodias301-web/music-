"""Pipeline v6: key and difficulty, with the v2 engine's own key code. Offline, synthetic audio."""

import numpy as np
import pytest
import soundfile as sf

from services import analysis_engine
from services.pipeline import key_stage
from services.pipeline.config import PIPELINE_VERSION
from services.pipeline.key_stage import KEY_FAILED, NO_KEY, chord_symbols, estimate_key_and_difficulty
from services.difficulty import rate_difficulty
from services.pipeline.schemas import PipelineResult
from test_pipeline import client, fake_demucs, install_manager, needs_ffmpeg, post_file, wait_done  # noqa: F401

SR = 22050
NOTES = {"C": [48, 52, 55, 60], "G": [43, 55, 59, 62], "Am": [45, 57, 60, 64], "F": [41, 57, 60, 65],
         "Em": [40, 55, 59, 64], "Dm": [38, 57, 62, 65]}


@pytest.fixture
def fake_key():
    """Overrides conftest's stub: these tests run the real key step."""


def chord(start, end, simple, kind="chord"):
    return {"start": start, "end": end, "chord": simple, "simple": simple, "type": kind}


def progression(path, names, seconds=2.0):
    """A plain piano-like pad playing `names`, `seconds` each; returns the chord spans."""
    out, spans = [], []
    for i, name in enumerate(names):
        t = np.arange(int(seconds * SR)) / SR
        pad = sum(sum(np.sin(2 * np.pi * 440 * 2 ** ((m - 69) / 12) * k * t) / k for k in range(1, 5))
                  for m in NOTES[name]) * np.exp(-t * 0.6)
        out.append(pad)
        spans.append(chord(i * seconds, (i + 1) * seconds, name))
    y = np.concatenate(out)
    sf.write(str(path), (0.4 * y / np.abs(y).max()).astype(np.float32), SR)
    return spans


def test_key_and_difficulty_from_a_c_major_progression(tmp_path):
    spans = progression(tmp_path / "no_vocals.wav", ["C", "G", "Am", "F"] * 3)
    r = estimate_key_and_difficulty(str(tmp_path / "no_vocals.wav"), chords=spans, bpm=120.0, duration=24.0)
    assert r.warnings == []
    assert (r.key, r.mode, r.scale) == ("C Major", "major", "C Ionian (Major)")
    assert 0.0 <= r.key_confidence <= 1.0 and len(r.key_alternatives) == 2
    # Exactly v2's rule on the same chords (a change every 2 s plus an F rates Intermediate).
    assert r.difficulty == rate_difficulty(chord_progression=[s["simple"] for s in spans], bpm=120.0,
                                           duration_seconds=24.0, key="C Major")


def test_a_minor_progression(tmp_path):
    spans = progression(tmp_path / "no_vocals.wav", ["Am", "Dm", "Em", "Am"] * 3)
    r = estimate_key_and_difficulty(str(tmp_path / "no_vocals.wav"), chords=spans, bpm=90.0, duration=24.0)
    assert (r.key, r.mode) == ("A Minor", "minor")


def test_same_key_as_the_v2_engine_on_the_same_audio(tmp_path):
    path = tmp_path / "no_vocals.wav"
    spans = progression(path, ["G", "Em", "C", "G"] * 3)
    v2 = analysis_engine.analyze(str(path))
    assert estimate_key_and_difficulty(str(path), chords=spans, bpm=v2["bpm"], duration=24.0).key == v2["key"]


def test_no_chords_means_no_key(tmp_path):
    progression(tmp_path / "no_vocals.wav", ["C"])
    r = estimate_key_and_difficulty(str(tmp_path / "no_vocals.wav"), chords=[chord(0, 2, "N", "no_chord")],
                                    bpm=None, duration=2.0)
    assert r.key is None and r.difficulty is None and r.warnings == [NO_KEY]


def test_silent_stem_means_no_key(tmp_path):
    sf.write(str(tmp_path / "no_vocals.wav"), np.zeros(SR * 3, dtype=np.float32), SR)
    r = estimate_key_and_difficulty(str(tmp_path / "no_vocals.wav"), chords=[chord(0, 3, "C")], bpm=None, duration=3.0)
    assert r.key is None and r.warnings == [NO_KEY]


def test_a_key_error_never_fails_the_job(tmp_path, monkeypatch):
    def broken(*a, **k):
        raise RuntimeError("cqt exploded")
    monkeypatch.setattr(key_stage, "_key_from_audio", broken)
    r = estimate_key_and_difficulty("x.wav", chords=[chord(0, 3, "C")], bpm=120.0, duration=3.0)
    assert r.key is None and r.warnings == [KEY_FAILED]


def test_chord_symbols_skip_no_chord_and_unnamed():
    chords = [chord(0, 1, "C"), chord(1, 2, "N", "no_chord"), {**chord(2, 3, "x"), "simple": None},
              chord(3, 4, "G/B", "passing")]
    assert chord_symbols(chords) == ["C", "G/B"]


def test_older_results_without_a_key_still_validate():
    r = PipelineResult(pipeline_version=5, audio_duration=5.0, sample_rate=44100)
    assert r.key is None and r.difficulty is None and r.key_alternatives == []


@needs_ffmpeg
def test_key_and_difficulty_reach_the_api(client, install_manager, tmp_path, monkeypatch):
    from services.pipeline import jobs
    from services.pipeline.chord_stage import ChordResult
    spans = progression(tmp_path / "song.wav", ["C", "G", "Am", "F"] * 2)
    monkeypatch.setattr(jobs, "analyze_chords", lambda stem, **kw: ChordResult(engine="btc@cpu", chords=spans))
    install_manager()
    done = wait_done(client, post_file(client, (tmp_path / "song.wav").read_bytes()).json()["job_id"], timeout=60)
    assert done["status"] == "completed", done
    result = done["result"]
    assert result["pipeline_version"] == PIPELINE_VERSION
    assert result["key"] == "C Major" and result["mode"] == "major"
    assert result["difficulty"]["difficultyLabel"] in ("Beginner", "Intermediate", "Advanced")
