"""
Universal multi-instrument transcription: detection rules, per-instrument
arrangement (piano hands / voices / fingering / dynamics / pedal, string TAB and
bowing, wind phrasing), multi-part MusicXML, noteEvents, routing and the API.
Offline: Demucs is replaced by synthesized stems; Basic Pitch / pYIN run locally.
"""
import os
import sys
import xml.etree.ElementTree as ET

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import instrument_engines as ie
from services import sheet_generation
from services.guitar_tab import BASS, UKULELE, VIOLIN

SR = 44100


def _tone(midi, dur, amp=0.4, decay=3.0, harmonics=8, sr=SR):
    f = 440.0 * 2 ** ((midi - 69) / 12)
    t = np.arange(int(dur * sr)) / sr
    y = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, harmonics + 1) if f * k < sr / 2)
    env = np.exp(-decay * t) if decay else np.minimum(1.0, t / 0.03) * np.minimum(1.0, (dur - t) / 0.03)
    return (amp * y * env).astype(np.float32)


def _place(total, parts):
    y = np.zeros(int(total * SR), dtype=np.float32)
    for start, sig in parts:
        i = int(start * SR)
        y[i:i + len(sig)] += sig[: len(y) - i]
    return y


def _profile(**kw):
    base = {"centroidHz": 1500.0, "harmonicRatio": 3.0, "attackMs": 20.0, "sustain": 0.3, "medianMidi": 60.0,
            "lowMidi": 48.0, "highMidi": 72.0, "polyphony": 1.0, "noteCount": 20}
    return {**base, **kw}


def _q(start, end, midi, t0=None, **kw):
    t0 = start * 0.5 if t0 is None else t0
    return {"start": start, "end": end, "midi": midi, "t0": t0, "t1": t0 + (end - start) * 0.5, **kw}


CTX = {"beatsPerBar": 4, "chords": [], "showChords": True}


# ── detection ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("profile,stem,expected", [
    (_profile(medianMidi=36, lowMidi=30, highMidi=45), None, "bass"),
    (_profile(medianMidi=67, lowMidi=60, highMidi=81), None, "ukulele"),
    (_profile(medianMidi=60, lowMidi=36, highMidi=84, polyphony=2.5), None, "piano"),
    (_profile(medianMidi=55, lowMidi=45, highMidi=72), None, "guitar"),
    (_profile(sustain=0.8, attackMs=30, medianMidi=79, harmonicRatio=1.6), None, "flute"),
    (_profile(sustain=0.8, attackMs=30, medianMidi=70, harmonicRatio=7.0), None, "trumpet"),
    (_profile(sustain=0.8, attackMs=30, medianMidi=64, harmonicRatio=3.5), None, "alto_sax"),
    (_profile(sustain=0.8, attackMs=30, medianMidi=55, harmonicRatio=3.5), None, "tenor_sax"),
    (_profile(sustain=0.8, attackMs=120, medianMidi=72), None, "violin"),
    (_profile(sustain=0.8, attackMs=120, medianMidi=45), None, "cello"),
    (_profile(), "vocals", "vocals"),
    (_profile(), "piano", "piano"),
    (_profile(medianMidi=64, lowMidi=60), "guitar", "ukulele"),
    (_profile(sustain=0.8, attackMs=90, medianMidi=48), "bass", "cello"),
])
def test_classify(profile, stem, expected):
    assert ie.classify(profile, stem) == expected


def test_profile_tells_plucked_from_sustained():
    plucked = _place(3.0, [(0.2 + i * 0.5, _tone(52 + i, 0.5, decay=8.0)) for i in range(5)])
    held = _place(3.0, [(0.2 + i * 0.5, _tone(64 + i, 0.5, decay=0)) for i in range(5)])
    p, h = ie.profile_signal(plucked, SR, []), ie.profile_signal(held, SR, [])
    assert p["sustain"] < h["sustain"]


# ── piano ──────────────────────────────────────────────────────────────────

def test_piano_hands_voices_and_chord_fingering():
    notes = [_q(0, 2, 48), _q(0, 2, 52), _q(0, 2, 55), _q(0, 1, 72), _q(0, 1, 67), _q(1, 2, 74)]
    part = ie.arrange_piano(notes, CTX)
    by = {(n["start"], n["midi"]): n for n in part["notes"]}
    assert all(by[(0, m)]["hand"] == "LH" and by[(0, m)]["staff"] == 2 for m in (48, 52, 55))
    assert all(by[k]["hand"] == "RH" and by[k]["staff"] == 1 for k in ((0, 72), (0, 67), (1, 74)))
    assert by[(0, 72)]["voice"] == 1 and by[(0, 67)]["voice"] == 2  # melody over inner harmony
    assert by[(0, 48)]["voice"] == 6 and by[(0, 52)]["voice"] == 5  # bass root under the chord
    assert [by[(0, m)]["fingering"] for m in (48, 52, 55)] == [5, 3, 1]  # LH triad
    assert part["clefs"] == [("G", 2, 0), ("F", 4, 0)] and part["program"] == 1


def test_right_hand_scale_uses_thumb_under():
    scale = [60, 62, 64, 65, 67, 69, 71, 72]
    part = ie.arrange_piano([_q(i * 0.5, i * 0.5 + 0.5, m) for i, m in enumerate(scale)], CTX)
    fingers = [n["fingering"] for n in sorted(part["notes"], key=lambda n: n["start"])]
    assert fingers == [1, 2, 3, 1, 2, 3, 4, 5]


def test_left_hand_descending_scale_mirrors_the_right():
    scale = [48, 47, 45, 43, 41, 40, 38, 36]
    notes = [_q(i * 0.5, i * 0.5 + 0.5, m) for i, m in enumerate(scale)]
    for n in notes:
        n["hand"] = "LH"
    ie.finger_hand(notes, "LH")
    assert [n["fingering"] for n in notes] == [1, 2, 3, 1, 2, 3, 4, 5]


def test_dynamics_follow_velocity_and_pedal_follows_ringing_notes():
    soft = [_q(b * 1.0, b * 1.0 + 3, 60 + b, velocity=0.2) for b in range(4)]  # bar 1: soft and ringing over
    loud = [_q(4 + b * 1.0, 4 + b * 1.0 + 0.5, 60 + b, velocity=0.8) for b in range(4)]  # bar 2: loud, detached
    part = ie.arrange_piano(soft + loud, CTX)
    dyn = [(d["start"], d["dynamic"]) for d in part["directions"] if "dynamic" in d]
    assert dyn == [(0.0, "pp"), (4.0, "ff")]
    pedal = [(d["start"], d["pedal"]) for d in part["directions"] if "pedal" in d]
    assert pedal == [(0.0, "start"), (4.0, "stop")]


# ── strings and winds ──────────────────────────────────────────────────────

def test_violin_slurs_bowing_positions_and_double_stops():
    line = [
        _q(0, 1, 69, t0=0.0, onset=1.0), _q(1, 2, 71, t0=0.5, onset=0.2),  # slurred pair from the downbeat
        _q(3, 4, 74, t0=1.6, onset=1.0),  # detached, on beat 4: up-bow
        _q(4, 6, 62, t0=2.5, onset=1.0), _q(4, 6, 69, t0=2.5, onset=1.0),  # D + A double stop
    ]
    for n in line:
        n["t1"] = n["t0"] + 0.5
    part = ie.arrange_part({"engine": "violin", "notes": line}, CTX)
    by = {(n["start"], n["midi"]): n for n in part["notes"]}
    assert by[(0, 69)]["slur"] == "start" and by[(1, 71)]["slur"] == "stop"
    assert by[(0, 69)]["bow"] == "down" and by[(3, 74)]["bow"] == "up"
    assert by[(4, 62)]["string"] != by[(4, 69)]["string"]  # a double stop sits on two strings
    for n in part["notes"]:
        assert VIOLIN.tuning[n["string"]] + n["fret"] == n["midi"]
        assert 1 <= n["position"] <= 7 and 0 <= n["fingering"] <= 4
    assert part["tab"] is None  # fretless: notation only


def test_wind_staccato_and_legato_slurs():
    line = [
        _q(0, 0.5, 72, t0=0.0, onset=1.0), _q(0.5, 1, 74, t0=0.25, onset=1.0),  # short, detached
        _q(2, 3, 76, t0=1.0, onset=1.0), _q(3, 4, 77, t0=1.5, onset=0.1), _q(4, 5, 79, t0=2.0, onset=0.1),
    ]
    line[0]["t1"], line[1]["t1"] = 0.08, 0.33
    for n in line[2:]:
        n["t1"] = n["t0"] + 0.5
    part = ie.arrange_part({"engine": "trumpet", "notes": line}, CTX)
    by = {n["midi"]: n for n in part["notes"]}
    assert by[72].get("staccato") is True
    assert by[76]["slur"] == "start" and by[79]["slur"] == "stop" and by[77].get("legato")
    assert part["program"] == 57


@pytest.mark.parametrize("engine,spec,lines", [("bass", BASS, "4"), ("ukulele", UKULELE, "4")])
def test_four_string_instruments_get_their_own_tab(engine, spec, lines):
    midis = [28, 33, 38, 43, 45] if engine == "bass" else [60, 64, 67, 69, 72]
    notes = [_q(i, i + 1, m, onset=1.0) for i, m in enumerate(midis)]
    model = {"instrument": "score", "title": "t", "bpm": 100, "beatsPerBar": 4, "key": "C Major", "chords": [],
             "parts": [{"engine": engine, "name": engine, "notes": notes}]}
    _, [part] = ie.arrange_score(model)
    for n in part["notes"]:
        assert spec.tuning[n["string"]] + n["fret"] == n["midi"]
    xml = ie.render_score(model)
    root = ET.fromstring(xml.split("\n", 2)[2])
    assert root.findtext(".//staff-details/staff-lines") == lines
    assert len(root.findall(".//staff-tuning")) == 4


# ── scores ─────────────────────────────────────────────────────────────────

def _ensemble_model():
    piano = [_q(0, 2, 48), _q(0, 2, 55), _q(0, 1, 72), _q(1, 2, 74), _q(2, 4, 50), _q(2, 4, 57), _q(2, 3, 76)]
    for n in piano:
        n["velocity"] = 0.5
    trumpet = [_q(0, 1, 67, onset=1.0), _q(1, 2, 69, onset=0.1), _q(2, 4, 71, onset=1.0)]
    bass = [_q(0, 2, 36, onset=1.0), _q(2, 4, 38, onset=1.0)]
    return {"instrument": "score", "title": "Band", "bpm": 96, "beatsPerBar": 4, "key": "C Major",
            "chords": [{"start": 0, "end": 2, "name": "C"}, {"start": 2, "end": 4, "name": "Dm"}],
            "parts": [{"engine": "trumpet", "name": "Trumpet", "notes": trumpet},
                      {"engine": "piano", "name": "Piano", "notes": piano},
                      {"engine": "bass", "name": "Bass", "notes": bass}]}


def test_ensemble_musicxml_has_every_part_with_its_layout():
    xml = ie.render_score(_ensemble_model())
    root = ET.fromstring(xml.split("\n", 2)[2])
    parts = root.findall("part")
    assert [p.findtext("part-name") for p in root.iter("score-part")] == ["Trumpet", "Piano", "Bass"]
    assert [int(p.findtext("midi-instrument/midi-program")) for p in root.iter("score-part")] == [57, 1, 34]
    piano = parts[1]
    assert piano.findtext(".//staves") == "2"
    assert {n.findtext("voice") for n in piano.iter("note") if n.find("rest") is None} >= {"1", "5", "6"}
    assert {n.findtext("staff") for n in piano.iter("note")} == {"1", "2"}
    assert all(n.find(".//fingering") is not None for n in piano.iter("note")
               if n.find("rest") is None and n.find("tie[@type='stop']") is None)
    assert piano.find(".//dynamics") is not None
    assert parts[2].find(".//staff-details") is not None  # bass TAB
    assert len(root.findall(".//harmony")) == 2 and parts[0].find(".//harmony") is not None  # chords once, on top
    for part in parts:
        for m in part.iter("measure"):
            per = {}
            for n in m.iter("note"):
                if n.find("chord") is None:
                    k = (n.findtext("staff"), n.findtext("voice"))
                    per[k] = per.get(k, 0) + int(n.findtext("duration"))
            assert set(per.values()) == {16}, (part.get("id"), m.get("number"), per)

    from music21 import converter

    assert len(converter.parseData(xml).parts) >= 3


def test_transposed_score_is_rearranged_not_shifted():
    model = _ensemble_model()
    xml = sheet_generation.render(model, semitones=3)
    root = ET.fromstring(xml.split("\n", 2)[2])
    assert root.findtext(".//key/fifths") == "-3"  # C major up 3 = Eb major
    bass_tab = root.findall("part")[2]
    for n in bass_tab.iter("note"):
        if n.find("rest") is None:
            assert n.findtext(".//string") is not None
    events = ie.note_events(ie.arrange_score(model, 3)[1], model["chords"], "Eb Major")
    assert any(e["noteName"].startswith("Eb") for e in events)


def test_note_events_shape():
    _, arranged = ie.arrange_score(_ensemble_model())
    events = ie.note_events(arranged, _ensemble_model()["chords"], "C Major")
    piano = [e for e in events if e["instrument"] == "piano"]
    bass = [e for e in events if e["instrument"] == "bass"]
    assert piano and bass
    e = next(e for e in piano if e["midi"] == 72)
    assert e["hand"] == "RH" and e["staff"] == 1 and e["finger"].endswith(")") and e["chord"] == "C"
    assert e["noteName"] == "C5" and e["string"] is None and e["time"] == 0.0
    b = bass[0]
    assert b["hand"] is None and b["string"] in (1, 2, 3, 4) and b["fret"] is not None
    assert {"time", "duration", "noteName", "midi", "hand", "staff", "finger", "string", "fret",
            "articulation", "chord"} <= set(e)


# ── routing ────────────────────────────────────────────────────────────────

def _stems(levels: dict[str, float], n=SR):
    mix = np.random.default_rng(0).normal(0, 0.1, (2, n)).astype(np.float32)
    return mix, {k: mix * (10 ** (db / 20)) for k, db in levels.items()}


def test_route_auto_solo_vs_ensemble():
    mix, stems = _stems({"piano": -2, "vocals": -40, "bass": -35, "drums": -1, "other": -30, "guitar": -40})
    [(engine, _, stem)] = ie.route_sources("auto", stems, mix)
    assert engine is None and stem == "piano"
    mix, stems = _stems({"vocals": -4, "piano": -8, "bass": -9, "drums": -2, "other": -35, "guitar": -40})
    routed = ie.route_sources("auto", stems, mix)
    assert [s for _, _, s in routed] == ["vocals", "piano", "bass"]
    assert [e for e, _, _ in routed] == ["vocals", "piano", "bass"]


def test_route_hint_and_no_stems():
    mix, stems = _stems({"bass": -3, "other": -10})
    [(engine, signal, _)] = ie.route_sources("bass", stems, mix)
    assert engine == "bass" and signal.ndim == 1
    [(engine, _, _)] = ie.route_sources("brass_wind", {}, mix)
    assert engine is None  # subtype decided from the profile
    assert ie._resolve_hint("violin", _profile(medianMidi=45)) == "cello"


# ── end to end ─────────────────────────────────────────────────────────────

def test_generate_universal_ensemble_end_to_end(tmp_path, monkeypatch):
    pytest.importorskip("basic_pitch")
    import soundfile as sf

    from services import audio_extract

    if not audio_extract.find_ffmpeg():
        pytest.skip("ffmpeg is not installed")
    beat = 60 / 90
    piano = _place(6.0, [(0.3 + i * 2 * beat, sum(_tone(m, 1.2, 0.3) for m in chord))
                         for i, chord in enumerate([(48, 52, 55, 72), (53, 57, 60, 72), (55, 59, 62, 74), (48, 52, 55, 72)])])
    bass = _place(6.0, [(0.3 + i * 2 * beat, _tone(m, 1.2, 0.5, decay=4.0)) for i, m in enumerate((36, 41, 43, 36))])
    mixdown = piano + bass
    src = tmp_path / "band.wav"
    sf.write(src, np.stack([mixdown, mixdown], axis=1), SR)

    def fake_separate(mix):
        n = mix.shape[1]
        z = np.zeros((2, n), dtype=np.float32)
        st = lambda y: np.stack([y[:n], y[:n]])  # noqa: E731
        return {"piano": st(piano), "bass": st(bass), "vocals": z, "drums": z, "guitar": z, "other": z}

    res = ie.generate_universal(str(src), "Band", "ensemble", separate=fake_separate)
    assert res["detectedInstrument"] == "ensemble"
    assert [p["instrument"] for p in res["parts"]] == ["piano", "bass"]
    assert res["noteCount"] > 0 and res["noteEvents"]
    piano_events = [e for e in res["noteEvents"] if e["instrument"] == "piano"]
    assert {e["hand"] for e in piano_events} == {"RH", "LH"}
    assert {36, 41, 43} <= {e["midi"] for e in res["noteEvents"] if e["instrument"] == "bass"}
    root = ET.fromstring(res["musicxml"].split("\n", 2)[2])
    assert len(root.findall("part")) == 2
    # The model re-renders (the editor's transpose path).
    assert "<score-partwise" in sheet_generation.render(res["model"], semitones=-2)


# ── API ────────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    import main

    main._request_times.clear()
    with TestClient(main.app) as c:
        yield c


def test_api_passes_the_instrument_hint(client, monkeypatch, tmp_path):
    import main

    seen = {}

    def fake_generate(path, title, left_hand, on_progress=None, instrument="piano", instrument_hint=None):
        seen.update(hint=instrument_hint)
        return {"title": title, "musicxml": "<score-partwise/>", "detectedInstrument": "piano"}

    monkeypatch.setattr(main.sheet_generation, "generate", fake_generate)
    wav = tmp_path / "a.wav"
    import soundfile as sf

    sf.write(wav, np.zeros(4410, dtype=np.float32), 44100)
    with open(wav, "rb") as fh:
        r = client.post("/api/sheet/generate?instrument_hint=ensemble&sync=true", files={"file": ("a.wav", fh, "audio/wav")})
    assert r.status_code == 200, r.text
    assert seen["hint"] == "ensemble"
    assert client.post("/api/sheet/generate?instrument_hint=kazoo&sync=true").status_code == 422


def test_render_endpoint_takes_score_models(client):
    r = client.post("/api/sheet/render", json={"model": _ensemble_model(), "semitones": 2})
    assert r.status_code == 200, r.text
    assert r.json()["musicxml"].count("<part id=") == 3


@pytest.mark.parametrize("param", ["psln", "cplk", "rpxt", "mdxt"])
def test_more_tracking_params_are_stripped(param):
    from services.media_fetch import strip_tracking_params

    assert strip_tracking_params(f"https://www.instagram.com/reel/A1/?{param}=x") == "https://www.instagram.com/reel/A1/"
