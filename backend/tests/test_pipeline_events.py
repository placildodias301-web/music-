"""
Step 5 of the job pipeline: passing chords, possible drum fills and the event
merge. Offline — drums are synthesised (tests/drum_synth.py) and the earlier
model stages are stubbed.
"""

import pytest
from drum_synth import drum_track, grid

from services.pipeline import events_stage, jobs
from services.pipeline.chord_stage import ChordResult
from services.pipeline.config import PIPELINE_VERSION
from services.pipeline.events import passing
from services.pipeline.events.drum_fills import MISSING, NO_SIGNAL, detect_fills
from services.pipeline.events_stage import FILLS_FAILED, analyze_events
from services.pipeline.merge import build_result
from services.pipeline.rhythm_stage import RhythmResult
from services.pipeline.schemas import Event, PipelineResult
from test_pipeline import client, fake_demucs, install_manager, needs_ffmpeg, post_file, wait_done  # noqa: F401

pytestmark = pytest.mark.usefixtures("fake_demucs")


@pytest.fixture
def fake_events():
    """Overrides conftest's stub: these tests run the real events stage."""


def chord(start, end, label, simple, kind="chord"):
    return {"start": start, "end": end, "chord": label, "simple": simple, "type": kind}


BEATS = [round(i * 0.5, 3) for i in range(41)]  # 120 BPM: one beat = 0.5 s


# ── passing chords ─────────────────────────────────────────────────────

def test_beat_duration_is_the_median_gap():
    assert passing.beat_duration(BEATS) == 0.5
    assert passing.beat_duration([0.0, 0.5, 1.0, 2.5, 3.0]) == 0.5
    assert passing.beat_duration([1.0]) is None and passing.beat_duration([]) is None


def test_shorter_than_one_beat_is_passing():
    chords = [chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 4.4, "D:min", "Dm"), chord(4.4, 8.0, "G:maj", "G")]
    out, events = passing.classify(chords, BEATS)
    assert [c["type"] for c in out] == ["chord", "passing", "chord"]
    assert events == [{"time": 4.0, "type": "chord_change", "value": "Dm", "subtype": "passing"}]


def test_short_chord_between_two_longer_different_chords_is_passing():
    # C (8 beats) - G/B (1.5 beats) - Am (8 beats)
    chords = [chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 4.75, "G:maj/3", "G/B"), chord(4.75, 8.75, "A:min", "Am")]
    out, events = passing.classify(chords, BEATS)
    assert [c["type"] for c in out] == ["chord", "passing", "chord"]
    assert events[0]["value"] == "G/B" and events[0]["time"] == 4.0


@pytest.mark.parametrize("chords", [
    # 1.5 beats, but the neighbours are not twice as long
    [chord(0.0, 1.0, "C:maj", "C"), chord(1.0, 1.75, "G:maj", "G"), chord(1.75, 3.0, "A:min", "Am")],
    # 2 beats is a real chord even between long ones
    [chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 5.0, "G:maj", "G"), chord(5.0, 9.0, "A:min", "Am")],
    # 1.5 beats next to no-chord: rule 2 needs real chords on both sides
    [chord(0.0, 4.0, "N", "N", "no_chord"), chord(4.0, 4.75, "G:maj", "G"), chord(4.75, 8.75, "A:min", "Am")],
])
def test_regular_chords_stay_chords(chords):
    out, events = passing.classify(chords, BEATS)
    assert [c["type"] for c in out] == [c["type"] for c in chords] and events == []


def test_no_chord_is_never_passing_and_labels_are_kept():
    chords = [chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 4.2, "N", "N", "no_chord"), chord(4.2, 4.4, "C:(1,3,5)", None),
              chord(4.4, 8.0, "F:maj", "F")]
    out, events = passing.classify(chords, BEATS)
    assert [c["type"] for c in out] == ["chord", "no_chord", "passing", "chord"]
    assert out[2]["chord"] == "C:(1,3,5)" and out[2]["simple"] is None
    assert events == [{"time": 4.2, "type": "chord_change", "value": "C:(1,3,5)", "subtype": "passing"}]


def test_nothing_is_deleted_or_mutated():
    chords = [chord(0.0, 0.2, "C:maj", "C"), chord(0.2, 4.0, "G:maj", "G")]
    out, _ = passing.classify(chords, BEATS)
    assert len(out) == 2 and chords[0]["type"] == "chord" and out[0]["type"] == "passing"


def test_without_beats_nothing_is_classified():
    chords = [chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 4.1, "D:min", "Dm"), chord(4.1, 8.0, "G:maj", "G")]
    out, events = passing.classify(chords, [])
    assert out == chords and events == []


# ── drum fills ─────────────────────────────────────────────────────────

def run_fills(path, beats, downbeats, sections=()):
    return detect_fills(str(path), duration=beats[-1] + 1.0, beats=beats, downbeats=downbeats, sections=list(sections))


def test_a_clear_fill_is_found_at_its_bar(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=12, fill_bars=(7,))
    r = run_fills(tmp_path / "drums.wav", beats, downbeats)
    fill_start = beats[7 * 4 + 2]  # beats 3–4 of bar 8
    assert r.warnings == []
    assert [e["type"] for e in r.events] == ["possible_fill"]
    assert abs(r.events[0]["time"] - fill_start) < 0.05
    assert 0.5 <= r.events[0]["confidence"] <= 1.0


def test_a_constant_groove_has_no_fills(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=12)
    r = run_fills(tmp_path / "drums.wav", beats, downbeats)
    assert r.events == [] and r.warnings == []


def test_a_lasting_change_of_groove_is_not_a_fill(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=20, fill_bars=range(8, 20))
    assert run_fills(tmp_path / "drums.wav", beats, downbeats).events == []


def test_fills_before_a_section_boundary_weigh_more(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=12, fill_bars=(3, 7))
    plain = run_fills(tmp_path / "drums.wav", beats, downbeats).events
    boundary = downbeats[8]  # the bar after the second fill
    sections = [{"start": 0.0, "end": boundary, "label": "verse"}, {"start": boundary, "end": 30.0, "label": "chorus"}]
    weighted = run_fills(tmp_path / "drums.wav", beats, downbeats, sections).events
    assert len(plain) == len(weighted) == 2
    assert weighted[0]["confidence"] == plain[0]["confidence"]
    assert weighted[1]["confidence"] > plain[1]["confidence"]
    assert all(0.0 <= e["confidence"] <= 1.0 for e in weighted)


def test_fills_without_downbeats_or_beats(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=12, fill_bars=(7,))
    assert len(run_fills(tmp_path / "drums.wav", beats, []).events) == 1
    r = detect_fills(str(tmp_path / "drums.wav"), duration=beats[-1] + 1.0, beats=[], downbeats=[], sections=[])
    assert len(r.events) == 1


def test_missing_drums_stem(tmp_path):
    beats, downbeats = grid(12)
    assert run_fills(tmp_path / "nope.wav", beats, downbeats).events == []
    r = detect_fills("", duration=10.0, beats=beats, downbeats=downbeats, sections=[])
    assert r.events == [] and r.warnings == [MISSING]


def test_a_quiet_or_drumless_stem_gives_no_fills(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=12, fill_bars=(7,), gain=0.001)  # Demucs bleed level
    r = run_fills(tmp_path / "drums.wav", beats, downbeats)
    assert r.events == [] and r.warnings == [NO_SIGNAL]
    import numpy as np
    import soundfile as sf
    sf.write(str(tmp_path / "silent.wav"), np.zeros((44100 * 5, 2), dtype=np.float32), 44100)
    assert run_fills(tmp_path / "silent.wav", *grid(2)).events == []


def test_too_short_to_judge(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=1, fill_bars=(0,))
    r = run_fills(tmp_path / "drums.wav", beats, downbeats)
    assert r.events == [] and r.warnings == [NO_SIGNAL]


# ── events stage ───────────────────────────────────────────────────────

def test_stage_combines_passing_chords_and_fills(tmp_path):
    beats, downbeats = drum_track(tmp_path / "drums.wav", bars=12, fill_bars=(7,))
    chords = [chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 4.3, "D:min", "Dm"), chord(4.3, 25.0, "G:maj", "G")]
    r = analyze_events(chords=chords, beats=beats, downbeats=downbeats, sections=[],
                       drums_path=str(tmp_path / "drums.wav"), duration=25.0)
    assert r.engine == "heuristic" and r.warnings == []
    assert [c["type"] for c in r.chords] == ["chord", "passing", "chord"]
    assert [e["type"] for e in r.events] == ["chord_change", "possible_fill"]


def test_a_fill_detection_error_never_fails_the_job(tmp_path, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("librosa exploded")
    monkeypatch.setattr(events_stage, "detect_fills", broken)
    chords = [chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 4.3, "D:min", "Dm"), chord(4.3, 8.0, "G:maj", "G")]
    r = analyze_events(chords=chords, beats=BEATS, downbeats=BEATS[::4], sections=[], drums_path="x.wav",
                       duration=8.0)
    assert r.warnings == [FILLS_FAILED] and len(r.events) == 1 and r.chords[1]["type"] == "passing"


# ── merge ──────────────────────────────────────────────────────────────

def test_events_are_clamped_sorted_and_deduplicated():
    r = build_result(audio_duration=10.0, sample_rate=44100, events=[
        {"time": 12.0, "type": "possible_fill", "confidence": 0.6},
        {"time": 4.0, "type": "chord_change", "value": "Dm", "subtype": "passing"},
        {"time": -1.0, "type": "possible_fill", "confidence": 1.7},
        {"time": 4.0, "type": "chord_change", "value": "Dm", "subtype": "passing"},  # identical
        {"time": 4.0, "type": "possible_fill", "confidence": 0.55},
        {"time": 4.0, "type": "possible_fill", "confidence": 0.81},  # same fill, higher confidence wins
        {"time": 10.0, "type": "possible_fill", "confidence": 0.5},  # 12.0 clamps onto this one
    ])
    assert [(e.time, e.type, e.value, e.subtype, e.confidence) for e in r.events] == [
        (0.0, "possible_fill", None, None, 1.0),
        (4.0, "chord_change", "Dm", "passing", None),
        (4.0, "possible_fill", None, None, 0.81),
        (10.0, "possible_fill", None, None, 0.6),
    ]


def test_result_json_stays_backward_compatible():
    # A version-4 result (no subtype, no events) still validates, and new fields are optional.
    old = {"pipeline_version": 4, "audio_duration": 5.0, "sample_rate": 44100,
           "chords": [{"start": 0.0, "end": 5.0, "chord": "C:maj", "simple": "C", "type": "chord"}],
           "events": [{"time": 1.0, "type": "chord_change", "value": "C:maj"}]}
    r = PipelineResult(**old)
    assert r.events[0].subtype is None and r.chords[0].type == "chord"
    assert set(Event(time=0.0, type="possible_fill").model_dump()) == {"time", "type", "value", "subtype", "confidence"}


# ── through the job API ────────────────────────────────────────────────

@needs_ffmpeg
def test_events_reach_the_api(client, install_manager, monkeypatch, tmp_path):
    beats, downbeats = drum_track(tmp_path / "song.wav", bars=12, fill_bars=(7,))

    def rhythm(stem_path, workdir, *, duration, config, remaining, progress):
        return RhythmResult(engine="beat_this@cpu", bpm=120.0, time_signature="4/4", beats=beats,
                            downbeats=downbeats, sections=[], warnings=[])

    def chords(stem_path, *, duration, config, remaining, progress):
        return ChordResult(engine="btc@cpu", chords=[
            chord(0.0, 4.0, "C:maj", "C"), chord(4.0, 4.3, "D:min", "Dm"), chord(4.3, duration, "G:maj", "G")])

    monkeypatch.setattr(jobs, "analyze_rhythm", rhythm)
    monkeypatch.setattr(jobs, "analyze_chords", chords)
    manager = install_manager()
    updates = []
    original = manager.store.update_job
    manager.store.update_job = lambda job_id, **f: (updates.append(f), original(job_id, **f))[1]

    done = wait_done(client, post_file(client, (tmp_path / "song.wav").read_bytes()).json()["job_id"])
    assert done["status"] == "completed", done
    result = done["result"]
    assert result["pipeline_version"] == PIPELINE_VERSION == 5
    assert result["engines"]["events"] == "heuristic"
    assert [c["type"] for c in result["chords"]] == ["chord", "passing", "chord"]
    events = result["events"]
    assert [e["type"] for e in events] == ["chord_change", "possible_fill"]
    assert events[0] == {"time": 4.0, "type": "chord_change", "value": "Dm", "subtype": "passing", "confidence": None}
    assert abs(events[1]["time"] - beats[30]) < 0.05 and 0.5 <= events[1]["confidence"] <= 1.0
    assert [e["time"] for e in events] == sorted(e["time"] for e in events)
    assert any(u.get("stage") == "events" for u in updates)


@needs_ffmpeg
def test_a_drumless_song_completes_without_fills(client, install_manager):
    from test_pipeline import wav_bytes
    install_manager()
    done = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])
    assert done["status"] == "completed", done
    assert [e for e in done["result"]["events"] if e["type"] == "possible_fill"] == []
    assert NO_SIGNAL in done["result"]["warnings"]
