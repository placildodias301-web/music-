"""
Guitar TAB pipeline: social-link ingestion, polyphonic transcription, the
string/fret Viterbi solver, articulations, and MusicXML with <technical> tags.
Offline: Demucs is replaced by a pass-through; Basic Pitch runs locally (ONNX).
"""
import os
import subprocess
import sys
import xml.etree.ElementTree as ET

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import audio_extract, guitar_tab, media_fetch, sheet_generation
from services.guitar_tab import (
    HAND_SPAN,
    STANDARD_TUNING,
    build_guitar_musicxml,
    solve_guitar_string_fret_sequence,
    transcribe_guitar,
)

SR = 44100


def _pluck(midi: int, dur: float, amp: float = 0.5, sr: int = SR) -> np.ndarray:
    """A plucked-string tone: harmonics 1-8 at 1/k, exponential decay."""
    f = 440.0 * 2 ** ((midi - 69) / 12)
    t = np.arange(int(dur * sr)) / sr
    y = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 9) if f * k < sr / 2)
    return (amp * y * np.exp(-3.0 * t)).astype(np.float32)


def _place(total_s: float, parts: list[tuple[float, np.ndarray]]) -> np.ndarray:
    y = np.zeros(int(total_s * SR), dtype=np.float32)
    for start, sig in parts:
        i = int(start * SR)
        y[i:i + len(sig)] += sig[: len(y) - i]
    return y


def _note(t, midi, dur=0.4, **kw):
    return {"start": t, "end": t + dur, "midi": midi, "velocity": kw.pop("velocity", 0.8), **kw}


def _check_playable(solved):
    for n in solved:
        assert 1 <= n["string"] <= 6
        assert 0 <= n["fret"] <= 22
        assert STANDARD_TUNING[n["string"]] + n["fret"] == n["midi"]
        assert n["leftFinger"] in (0, 1, 2, 3, 4)
        assert (n["fret"] == 0) == (n["leftFinger"] == 0)
        assert n["rightFinger"] == {6: "p", 5: "p", 4: "p", 3: "i", 2: "m", 1: "a"}[n["string"]]


# ── solver ─────────────────────────────────────────────────────────────────

def test_open_e4_lands_on_the_open_high_string():
    [n] = solve_guitar_string_fret_sequence([_note(0.0, 64)])
    assert (n["string"], n["fret"], n["leftFinger"], n["rightFinger"]) == (1, 0, 0, "a")


def test_simultaneous_notes_get_distinct_strings_within_a_hand_span():
    chord = [_note(0.0, m) for m in (40, 47, 52, 56, 59, 64)]  # open E major
    solved = solve_guitar_string_fret_sequence(chord, lambda _t: "E")
    assert len(solved) == 6
    assert len({n["string"] for n in solved}) == 6
    fretted = [n["fret"] for n in solved if n["fret"] > 0]
    assert max(fretted) - min(fretted) <= HAND_SPAN
    assert {(n["string"], n["fret"]) for n in solved} == {(6, 0), (5, 2), (4, 2), (3, 1), (2, 0), (1, 0)}
    _check_playable(solved)


def test_thumb_bass_and_melody_dyad_stay_two_voices():
    solved = solve_guitar_string_fret_sequence([_note(0.0, 45), _note(0.0, 69)], lambda _t: "A")
    assert len(solved) == 2
    bass, melody = sorted(solved, key=lambda n: n["midi"])
    assert bass["string"] >= 4 and bass["rightFinger"] == "p"
    assert melody["string"] <= 3 and melody["rightFinger"] in ("i", "m", "a")


def test_more_than_six_simultaneous_notes_drops_the_quietest():
    notes = [_note(0.0, m, velocity=v) for m, v in ((40, .9), (45, .9), (50, .9), (55, .9), (59, .9), (64, .9), (76, .1))]
    solved = solve_guitar_string_fret_sequence(notes)
    assert len(solved) <= 6 and 76 not in {n["midi"] for n in solved}
    assert len({n["string"] for n in solved}) == len(solved)


def test_chord_grip_is_preferred():
    # E3 is string 4 fret 2 inside a C grip, or string 5 fret 7 / string 6 fret 12 elsewhere.
    [n] = solve_guitar_string_fret_sequence([_note(0.0, 52)], lambda _t: "C")
    assert (n["string"], n["fret"], n["leftFinger"]) == (4, 2, 2)


def test_fast_run_stays_inside_a_hand_box():
    run = [_note(i * 0.1, m, dur=0.1) for i, m in enumerate((69, 71, 72, 74, 76, 77, 76, 74, 72))]
    solved = solve_guitar_string_fret_sequence(run)
    frets = [n["fret"] for n in solved if n["fret"] > 0]
    assert max(frets) - min(frets) <= HAND_SPAN + 1  # one position, at most a one-fret stretch
    hands = [n["fret"] for n in solved]
    assert all(abs(a - b) <= HAND_SPAN for a, b in zip(hands, hands[1:]))
    _check_playable(solved)


@pytest.mark.parametrize("second,glide,technique", [
    (71, 0.0, "hammer-on"),  # A4 -> B4 on string 1: fret 5 -> 7
    (67, 0.0, "pull-off"),   # A4 -> G4: fret 5 -> 3
    (72, 2.0, "slide"),      # A4 gliding up to C5: fret 5 -> 8
])
def test_legato_articulations(second, glide, technique):
    first = _note(0.0, 69, dur=0.12, onset=1.0, glide=glide)
    soft = _note(0.12, second, dur=0.3, onset=0.2, velocity=0.4)
    a, b = solve_guitar_string_fret_sequence([first, soft], lambda _t: "")
    assert a["string"] == b["string"]
    assert b["technique"] == technique and a["techniqueStart"] == technique


def test_a_hard_second_attack_is_a_new_pluck_not_a_slur():
    a, b = solve_guitar_string_fret_sequence(
        [_note(0.0, 69, dur=0.12, onset=1.0), _note(0.12, 71, onset=1.0)]
    )
    assert b["technique"] is None


def test_far_apart_notes_are_never_slurred():
    a, b = solve_guitar_string_fret_sequence(
        [_note(0.0, 69, onset=1.0), _note(0.5, 71, onset=0.1, velocity=0.2)]
    )
    assert b["technique"] is None


# ── transcription (CQT verification + recovery) ────────────────────────────

def test_cqt_verification_drops_model_ghosts_and_keeps_both_voices():
    y = _place(2.0, [(0.5, _pluck(45, 1.2)), (0.5, _pluck(69, 1.2))])
    events = [
        (0.5, 1.5, 45, 0.6, None),
        (0.5, 1.5, 69, 0.6, None),
        (0.5, 1.5, 50, 0.3, None),  # nothing at D3 in the audio
    ]
    notes = transcribe_guitar(y, SR, events=events)
    pitches = {n["midi"] for n in notes}
    assert {45, 69} <= pitches and 50 not in pitches
    for n in notes:
        assert n["brightness"] is None or 0.0 <= n["brightness"] <= 1.0


def test_cqt_recovers_a_pluck_basic_pitch_missed():
    # F#4 over A2: not one of A2's harmonics, so a missed F#4 is a real second string.
    y = _place(2.0, [(0.5, _pluck(45, 1.2)), (0.5, _pluck(66, 1.2))])
    notes = transcribe_guitar(y, SR, events=[(0.5, 1.5, 45, 0.6, None)])
    pitches = {n["midi"] for n in notes}
    assert 66 in pitches
    assert not pitches & {57, 64, 69, 73, 76, 79, 81}  # no harmonics of A2 invented


def test_basic_pitch_transcribes_a_plucked_arpeggio_polyphonically():
    pytest.importorskip("basic_pitch")
    arpeggio = [(0.3, 45), (0.3, 64), (0.8, 57), (1.3, 60), (1.8, 64), (2.3, 45), (2.3, 69)]
    y = _place(3.5, [(t, _pluck(m, 1.0)) for t, m in arpeggio])
    notes = transcribe_guitar(y, SR)
    found = {(round(n["start"] * 2) / 2, n["midi"]) for n in notes}
    hits = sum(1 for t, m in arpeggio if any(abs(ft - t) <= 0.1 and fm == m for ft, fm in
                                            ((n["start"], n["midi"]) for n in notes)))
    assert hits >= len(arpeggio) - 1, sorted(found)
    # The two dyads come out as simultaneous notes, not one melody line.
    assert sum(1 for n in notes if abs(n["start"] - 0.3) <= 0.05) >= 2


# ── MusicXML ───────────────────────────────────────────────────────────────

def _model(notes, chords=(), bpb=4):
    return {"instrument": "guitar", "title": "Reel", "bpm": 90, "beatsPerBar": bpb, "key": "A Major",
            "notes": notes, "chords": list(chords)}


def _solved_model():
    seconds = [_note(0.0, 45, dur=2.0), _note(0.0, 69, dur=0.12, onset=1.0), _note(0.12, 71, dur=0.5, onset=0.2, velocity=0.4),
               _note(1.0, 64, dur=1.0), _note(1.0, 57, dur=1.0), _note(2.5, 40, dur=1.5)]
    solved = solve_guitar_string_fret_sequence(seconds, lambda t: "A" if t < 2 else "E")
    spb = 60 / 90
    notes = [{**n, "start": round(n["start"] / spb * 4) / 4, "end": round(n["end"] / spb * 4) / 4} for n in solved]
    return _model(notes, [{"start": 0, "end": 3, "name": "A"}, {"start": 3, "end": 8, "name": "E/G#"}])


def test_musicxml_has_tab_staff_two_voices_and_technical_on_every_note():
    xml = build_guitar_musicxml(_solved_model())
    root = ET.fromstring(xml.split("\n", 2)[2])
    details = root.find(".//staff-details")
    assert details.findtext("staff-lines") == "6"
    tunings = {int(t.get("line")): t.findtext("tuning-step") + t.findtext("tuning-octave") for t in details.findall("staff-tuning")}
    assert tunings == {1: "E2", 2: "A2", 3: "D3", 4: "G3", 5: "B3", 6: "E4"}
    clef = root.find(".//clef")
    assert clef.findtext("sign") == "G" and clef.findtext("clef-octave-change") == "-1"

    pitched = [n for n in root.iter("note") if n.find("rest") is None]
    assert pitched
    for n in pitched:
        tech = n.find("notations/technical")
        assert tech is not None
        assert 1 <= int(tech.findtext("string")) <= 6 and 0 <= int(tech.findtext("fret")) <= 22
    heads = [n for n in pitched if n.find("tie[@type='stop']") is None]
    for n in heads:
        tech = n.find("notations/technical")
        assert tech.findtext("fingering") in {"0", "1", "2", "3", "4"}
        assert tech.findtext("pluck") in {"p", "i", "m", "a"}
    assert {n.findtext("voice") for n in pitched} == {"1", "2"}
    assert root.find(".//technical/hammer-on[@type='start']") is not None
    assert root.find(".//notations/slur[@type='start']") is not None
    assert root.find(".//notations/slur[@type='stop']") is not None
    assert any(n.find("chord") is not None for n in pitched) or len({n.findtext("voice") for n in pitched}) == 2

    # Every voice fills every bar exactly.
    for measure in root.iter("measure"):
        per_voice: dict[str, int] = {}
        for n in measure.iter("note"):
            if n.find("chord") is None:
                v = n.findtext("voice")
                per_voice[v] = per_voice.get(v, 0) + int(n.findtext("duration"))
        assert all(total == 16 for total in per_voice.values()), (measure.get("number"), per_voice)

    harmonies = [h.find("kind").get("text") for h in root.iter("harmony")]
    assert "/G#" in harmonies


def test_music21_reads_the_tab_musicxml():
    from music21 import converter

    score = converter.parseData(build_guitar_musicxml(_solved_model()))
    assert len(score.recurse().notes) > 0


def test_render_resolves_edited_and_transposed_guitar_models():
    model = _solved_model()
    model["notes"][0] = {**model["notes"][0], "midi": model["notes"][0]["midi"] + 1}  # an edit: stale string/fret
    xml = sheet_generation.render(model, semitones=2)
    root = ET.fromstring(xml.split("\n", 2)[2])
    for n in root.iter("note"):
        if n.find("rest") is not None:
            continue
        step, octave = n.findtext("pitch/step"), int(n.findtext("pitch/octave"))
        alter = int(n.findtext("pitch/alter") or 0)
        midi = 12 * (octave + 1) + "C D EF G A B".index(step) + alter
        string, fret = int(n.findtext(".//string")), int(n.findtext(".//fret"))
        assert STANDARD_TUNING[string] + fret == midi


def test_piano_render_is_unchanged_for_piano_models():
    xml = sheet_generation.render({"title": "x", "bpm": 100, "beatsPerBar": 4, "key": "C Major",
                                   "notes": [{"start": 0, "end": 1, "midi": 60}], "chords": []}, "none")
    assert "<staff-tuning" not in xml and "<step>C</step>" in xml


# ── API ────────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    import main

    main._request_times.clear()
    with TestClient(main.app) as c:
        yield c


def test_sheet_render_endpoint_accepts_guitar_models_and_slash_chords(client):
    model = _solved_model()
    r = client.post("/api/sheet/render", json={"model": model, "semitones": -1})
    assert r.status_code == 200, r.text
    assert "<staff-tuning" in r.json()["musicxml"]


def test_sheet_generate_accepts_a_link_and_the_guitar_instrument(client, monkeypatch, tmp_path):
    import main

    src = tmp_path / "reel.m4a"
    src.write_bytes(b"x")
    seen = {}

    def fake_fetch(url, client_key="global", request_id=None):
        seen["url"] = url
        return str(src), "Reel by someone.m4a"

    def fake_generate(path, title, left_hand, on_progress=None, instrument="piano"):
        seen.update(path=path, title=title, instrument=instrument)
        return {"title": title, "musicxml": "<score-partwise/>", "instrument": instrument}

    monkeypatch.setattr(main, "fetch_media", fake_fetch)
    monkeypatch.setattr(main.sheet_generation, "generate", fake_generate)
    r = client.post("/api/sheet/generate?instrument=guitar&sync=true",
                    data={"url": "https://www.instagram.com/reel/ABC123/?utm_source=ig_web_copy_link&igsh=xyz"})
    assert r.status_code == 200, r.text
    assert seen["instrument"] == "guitar" and seen["title"] == "Reel by someone"
    assert seen["path"] == str(src)


def test_sheet_generate_needs_a_file_or_a_link(client):
    r = client.post("/api/sheet/generate")
    assert r.status_code == 400


# ── ingestion ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("url,expected", [
    ("https://www.instagram.com/reel/ABC123/?utm_source=ig_web_copy_link&igsh=MWx0",
     "https://www.instagram.com/reel/ABC123/"),
    ("https://www.instagram.com/p/XYZ/?img_index=1&dlrf=1&srtk=abc", "https://www.instagram.com/p/XYZ/"),
    ("https://www.youtube.com/watch?v=abcdefghijk&si=Tr4ck&t=42", "https://www.youtube.com/watch?v=abcdefghijk&t=42"),
    ("https://youtube.com/shorts/abcdefghijk?feature=share", "https://youtube.com/shorts/abcdefghijk"),
    ("https://www.tiktok.com/@a/video/123?is_from_webapp=1&sender_device=pc", "https://www.tiktok.com/@a/video/123"),
])
def test_tracking_params_are_stripped(url, expected):
    assert media_fetch.strip_tracking_params(url) == expected


def test_fetch_media_strips_tracking_before_yt_dlp(monkeypatch):
    seen = {}
    monkeypatch.setattr(media_fetch, "_assert_public_host", lambda _u: None)
    monkeypatch.setattr(media_fetch, "_download_linked_media", lambda url, rid: seen.setdefault("url", url) and ("p", "n"))
    media_fetch.fetch_media("https://www.instagram.com/reel/ABC123/?utm_source=ig_web_copy_link&igsh=MWx0")
    assert seen["url"] == "https://www.instagram.com/reel/ABC123/"


def test_transcription_normalization_is_44k_pcm_with_rumble_removed(tmp_path):
    import soundfile as sf

    if not audio_extract.find_ffmpeg():
        pytest.skip("ffmpeg is not installed")
    t = np.arange(SR * 2) / SR
    rumble, tone = 0.4 * np.sin(2 * np.pi * 15 * t), 0.4 * np.sin(2 * np.pi * 220 * t)
    src = tmp_path / "in.wav"
    sf.write(src, np.stack([rumble + tone] * 2, axis=1), SR)
    out = audio_extract.normalize_for_transcription(str(src))
    try:
        info = sf.info(out)
        assert (info.samplerate, info.channels, info.subtype) == (44100, 2, "PCM_16")
        y, _ = sf.read(out)
        spec = np.abs(np.fft.rfft(y[:, 0]))
        freqs = np.fft.rfftfreq(len(y), 1 / SR)
        at = lambda f: spec[np.argmin(np.abs(freqs - f))]
        assert at(15) < 0.35 * at(220)  # rumble cut, the string's pitch kept
    finally:
        audio_extract.cleanup(out)


# ── end to end ─────────────────────────────────────────────────────────────

def test_generate_guitar_end_to_end_on_a_synthetic_clip(tmp_path, monkeypatch):
    pytest.importorskip("basic_pitch")
    import soundfile as sf

    if not audio_extract.find_ffmpeg():
        pytest.skip("ffmpeg is not installed")
    # Travis-style A: thumb on the beat, melody on top, at 90 BPM.
    beat = 60 / 90
    parts = []
    for bar in range(3):
        for b in range(4):
            t = 0.2 + (bar * 4 + b) * beat
            parts.append((t, _pluck(45 if b % 2 == 0 else 52, 0.6, 0.5)))
            if b in (0, 2):
                parts.append((t, _pluck(69 if b == 0 else 64, 0.6, 0.35)))
    y = _place(0.2 + 12 * beat + 1.0, parts)
    src = tmp_path / "reel.wav"
    sf.write(src, np.stack([y, y], axis=1), SR)
    monkeypatch.setattr(guitar_tab, "isolate_guitar", lambda mix: mix.mean(axis=0))  # no Demucs offline

    res = sheet_generation.generate(str(src), "Reel", instrument="guitar")
    assert res["instrument"] == "guitar" and res["noteCount"] > 0
    model_notes = res["model"]["notes"]
    pitches = {n["midi"] for n in model_notes}
    assert {45, 69} <= pitches
    starts: dict[float, set] = {}
    for n in model_notes:
        starts.setdefault(n["start"], set()).add(n["string"])
        assert STANDARD_TUNING[n["string"]] + n["fret"] == n["midi"]
    assert any(len(s) >= 2 for s in starts.values()), "bass + melody should sound together"
    assert "<staff-tuning" in res["musicxml"] and "<pluck>p</pluck>" in res["musicxml"]
