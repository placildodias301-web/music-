"""
Unit tests for the Universal Audio Analysis Engine (`backend/services/analysis_engine.py`):
  1. Enharmonic & Key Consistency (`Gb Major` -> `Gb, Cb, Db, Ebm` & `A Major` -> `A, D, E, F#m`)
     with zero `?` uncertain out-of-key hallucinations.
  2. 1-Beat Passing Chords, Fillers & Slash Chords (`A -> E/G# -> F#m` and `G -> D/F# -> Em`)
     at both Slow (80 BPM) and Fast (145 BPM) tempos (verifying Stage A Adaptive Slowdown,
     Stage B Dual-Band CQT Chroma, Stage C Key-Aware HMM, and Stage D Beat/Sub-Beat Resolution).
  3. High-Precision BPM & Time Signature Detection (`4/4` vs `3/4`) within ±2 BPM.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import librosa
from services.analysis_engine import ANALYSIS_SR, LOW_CONFIDENCE, analyze_from_array


def _synth_track(
    events: list[tuple[int, list[int], float]],
    bpm: float,
    beats_per_bar: int = 4,
    sr: int = ANALYSIS_SR,
) -> np.ndarray:
    """
    Synthesizes realistic harmonic + bass + percussive audio from a list of
    (bass_midi, upper_midi_notes, duration_beats) events.
    """
    beat_sec = 60.0 / bpm
    parts = []
    rng = np.random.default_rng(42)

    beat_counter = 0
    for bass_midi, upper_midis, n_beats in events:
        dur = n_beats * beat_sec
        n_samples = int(round(dur * sr))
        t = np.linspace(0.0, dur, n_samples, endpoint=False)
        sig = np.zeros_like(t)

        # Bass note in C1-A3 (35-220 Hz) with fundamental + 2nd harmonic
        f_bass = librosa.midi_to_hz(bass_midi)
        sig += 0.95 * np.sin(2.0 * np.pi * f_bass * t)
        sig += 0.45 * np.sin(2.0 * np.pi * (2.0 * f_bass) * t)

        # Upper chord tones in C3-C6 (130-1000 Hz) with natural harmonic decay
        for m in upper_midis:
            f = librosa.midi_to_hz(m)
            sig += 0.55 * np.sin(2.0 * np.pi * f * t)
            sig += 0.28 * np.sin(2.0 * np.pi * (2.0 * f) * t)
            sig += 0.14 * np.sin(2.0 * np.pi * (3.0 * f) * t)

        # Gentle amplitude envelope
        env = 0.75 + 0.25 * np.exp(-t / max(dur * 0.6, 0.2))
        sig *= env

        # Add drum/percussive pulse on each beat (stronger accent on Beat 1 of each bar)
        for b in range(int(round(n_beats))):
            b_start = int(round(b * beat_sec * sr))
            is_downbeat = (beat_counter % beats_per_bar) == 0
            click_dur = min(int(0.035 * sr), n_samples - b_start)
            if click_dur > 0:
                click_t = np.linspace(0.0, 1.0, click_dur, endpoint=False)
                accent_amp = 1.65 if is_downbeat else 0.75
                # Low kick thump on downbeat + crisp snare/hi-hat transient
                kick = np.sin(2.0 * np.pi * 65.0 * (click_t ** 0.7) * 0.035) if is_downbeat else 0.0
                noise = rng.standard_normal(click_dur) * np.exp(-click_t * 6.0)
                sig[b_start: b_start + click_dur] += accent_amp * (0.6 * noise + 0.4 * kick)
            beat_counter += 1

        parts.append(sig)

    y = np.concatenate(parts).astype(np.float32)
    y /= float(np.max(np.abs(y)) + 1e-9)
    return y


def test_enharmonic_and_key_consistency_gb_major():
    """
    Test 1: Feed a progression in Gb Major (Gb -> Cb -> Db -> Ebm) and verify:
      - Detected Key is 'Gb Major'
      - Consistent flat enharmonic spelling ('Gb', 'Cb', 'Db', 'Ebm')
      - Zero '?' uncertain out-of-key hallucinations (all confidences >= LOW_CONFIDENCE)
    """
    # MIDI notes:
    # Gb: bass Gb2(42), upper Gb4(66), Bb4(70), Db5(73)
    # Cb: bass B2/Cb3(47), upper Cb4(59), Eb4(63), Gb4(66)
    # Db: bass Db2(37), upper Db4(61), F4(65), Ab4(68)
    # Ebm: bass Eb2(39), upper Eb4(63), Gb4(66), Bb4(70)
    pattern = [
        (42, [66, 70, 73], 4.0),  # Gb (1 bar)
        (47, [59, 63, 66], 4.0),  # Cb (1 bar)
        (37, [61, 65, 68], 4.0),  # Db (1 bar)
        (39, [63, 66, 70], 4.0),  # Ebm (1 bar)
        (42, [66, 70, 73], 4.0),  # Gb (resolve on tonic)
    ]
    y = _synth_track(pattern * 2, bpm=96.0, beats_per_bar=4)
    res = analyze_from_array(y, ANALYSIS_SR)

    assert res["key"] == "Gb Major"
    chords = res["chordProgression"]
    for expected in ("Gb", "Cb", "Db", "Ebm"):
        assert expected in chords, f"Expected {expected} in {chords}"

    # Never mix Gb with sharp spellings like F#, C#, D#m or uncertain '?' chords
    for seg in res["chordTimeline"]:
        assert "#" not in seg["chord"], f"Unexpected sharp chord {seg['chord']} in Gb Major"
        assert seg["confidence"] >= LOW_CONFIDENCE, f"Unexpected uncertain chord: {seg}"
    assert res["lowConfidenceSegments"] == 0


def test_passing_and_slash_chords_slow_and_fast_tempos():
    """
    Test 2: Synthesize a progression with 1-beat slash/passing chords on Beat 4:
      - A Major walkdown: A (3 beats) -> E/G# (1 beat) -> F#m (4 beats) -> D (4 beats) -> E (4 beats)
      - G Major walkdown: G (3 beats) -> D/F# (1 beat) -> Em (4 beats) -> C (4 beats) -> D (4 beats)
    Verify at both Slow (80 BPM) and Fast (145 BPM, triggering Stage A Adaptive Slowdown).
    """
    # 1. A -> E/G# -> F#m -> D -> A at 80 BPM (Slow) and 145 BPM (Fast)
    # A: bass A2(45), upper A3(57), C#4(61), E4(64)
    # E/G#: bass G#2(44), upper E4(64), G#4(68), B4(71)
    # F#m: bass F#2(42), upper F#3(54), A3(57), C#4(61)
    # D: bass D2(38), upper D4(62), F#4(66), A4(69)
    a_major_walk = [
        (45, [57, 61, 64], 3.0),  # A (3 beats)
        (44, [64, 68, 71], 1.0),  # E/G# (1 beat passing slash chord)
        (42, [54, 57, 61], 4.0),  # F#m (4 beats)
        (38, [62, 66, 69], 4.0),  # D (4 beats)
        (45, [57, 61, 64], 4.0),  # A (4 beats)
    ] * 2

    for target_bpm in (80.0, 145.0):
        y_a = _synth_track(a_major_walk, bpm=target_bpm, beats_per_bar=4)
        res_a = analyze_from_array(y_a, ANALYSIS_SR)
        chords_a = [s["chord"] for s in res_a["chordTimeline"]]
        assert "A" in chords_a
        assert "F#m" in chords_a
        assert "E/G#" in chords_a, f"Missed 1-beat E/G# slash chord at {target_bpm} BPM: {chords_a}"
        slash_segs = [s for s in res_a["chordTimeline"] if s["chord"] == "E/G#"]
        assert any(s.get("role") == "passing" and s.get("passing") is True for s in slash_segs)
        # Verify timestamp accuracy of first E/G# (starts at Beat 3 = 3 * 60 / target_bpm)
        beat_sec = 60.0 / target_bpm
        expected_start = 3.0 * beat_sec
        assert abs(slash_segs[0]["start"] - expected_start) <= beat_sec * 0.65

    # 2. G -> D/F# -> Em -> C -> G at 80 BPM and 145 BPM
    # G: bass G2(43), upper G3(55), B3(59), D4(62)
    # D/F#: bass F#2(42), upper D4(62), F#4(66), A4(69)
    # Em: bass E2(40), upper E3(52), G3(55), B3(59)
    # C: bass C2(36), upper C4(60), E4(64), G4(67)
    g_major_walk = [
        (43, [55, 59, 62], 3.0),  # G (3 beats)
        (42, [62, 66, 69], 1.0),  # D/F# (1 beat passing slash chord)
        (40, [52, 55, 59], 4.0),  # Em (4 beats)
        (36, [60, 64, 67], 4.0),  # C (4 beats)
        (43, [55, 59, 62], 4.0),  # G (4 beats)
    ] * 2

    for target_bpm in (80.0, 145.0):
        y_g = _synth_track(g_major_walk, bpm=target_bpm, beats_per_bar=4)
        res_g = analyze_from_array(y_g, ANALYSIS_SR)
        chords_g = [s["chord"] for s in res_g["chordTimeline"]]
        assert "G" in chords_g
        assert "Em" in chords_g
        assert "D/F#" in chords_g, f"Missed 1-beat D/F# slash chord at {target_bpm} BPM: {chords_g}"


def test_accurate_bpm_and_time_signature_4_4_vs_3_4():
    """
    Test 3: Verify that bpm, timeSignature ('4/4' vs '3/4'), beats, and downbeats
    match the ground truth within ±2 BPM.
    """
    # 4/4 track at 112 BPM (C -> G -> Am -> F, 4 beats per chord)
    prog_4_4 = [
        (36, [60, 64, 67], 4.0),  # C
        (43, [55, 59, 62], 4.0),  # G
        (45, [57, 60, 64], 4.0),  # Am
        (41, [53, 57, 60], 4.0),  # F
    ] * 3
    y_4_4 = _synth_track(prog_4_4, bpm=112.0, beats_per_bar=4)
    res_4_4 = analyze_from_array(y_4_4, ANALYSIS_SR)

    assert abs(res_4_4["bpm"] - 112.0) <= 2.0, f"Expected ~112 BPM, got {res_4_4['bpm']}"
    assert res_4_4["timeSignature"] == "4/4"
    assert res_4_4["beatsPerBar"] == 4
    assert len(res_4_4["beats"]) >= 40
    assert len(res_4_4["downbeats"]) >= 10

    # 3/4 waltz track at 105 BPM (G -> C -> D -> G, 3 beats per bar/chord)
    prog_3_4 = [
        (43, [55, 59, 62], 3.0),  # G (3 beats)
        (36, [60, 64, 67], 3.0),  # C (3 beats)
        (38, [62, 66, 69], 3.0),  # D (3 beats)
        (43, [55, 59, 62], 3.0),  # G (3 beats)
    ] * 4
    y_3_4 = _synth_track(prog_3_4, bpm=105.0, beats_per_bar=3)
    res_3_4 = analyze_from_array(y_3_4, ANALYSIS_SR)

    assert abs(res_3_4["bpm"] - 105.0) <= 2.0, f"Expected ~105 BPM, got {res_3_4['bpm']}"
    assert res_3_4["timeSignature"] == "3/4"
    assert res_3_4["beatsPerBar"] == 3
    assert len(res_3_4["downbeats"]) >= 12


def test_fingerstyle_intro_and_dual_hand_finger_mapper():
    """
    Test 4: Verify the Fingerstyle Intro / Arpeggio Detector & Dual-Hand Finger Mapper:
      - Maps A2 (MIDI 45), E3 (MIDI 52), C#4 (MIDI 61), E4 (MIDI 64) over an 'A' chord to:
        * A2 -> String 5 ('A (5th string)'), Fret 0, Left: 'Open (0)', Right: 'p (Thumb)'
        * E3 -> String 4 ('D (4th string)'), Fret 2, Left: 'Middle (2)', Right: 'p (Thumb)'
        * C#4 -> String 2 ('B (2nd string)'), Fret 2, Left: 'Ring (3)', Right: 'm (Middle)'
        * E4 -> String 1 ('e (1st string)'), Fret 0, Left: 'Open (0)', Right: 'a (Ring)'
      - Also verifies end-to-end fingerstyleIntro detection from synthesized plucked audio.
    """
    from services.analysis_engine import solve_fingerstyle_notes

    timeline = [{"chord": "A", "start": 0.0, "end": 4.0}]
    raw_events = [
        (0.42, 45),  # A2
        (0.68, 52),  # E3
        (0.94, 61),  # C#4
        (1.20, 64),  # E4
    ]
    mapped = solve_fingerstyle_notes(raw_events, timeline, tonic=9, mode="major")
    assert len(mapped) == 4
    assert mapped[0] == {
        "time": 0.42,
        "chord": "A",
        "noteName": "A2",
        "string": 5,
        "stringName": "A (5th string)",
        "fret": 0,
        "leftFinger": "Open (0)",
        "rightFinger": "p (Thumb)",
    }
    assert mapped[1] == {
        "time": 0.68,
        "chord": "A",
        "noteName": "E3",
        "string": 4,
        "stringName": "D (4th string)",
        "fret": 2,
        "leftFinger": "Middle (2)",
        "rightFinger": "p (Thumb)",
    }
    assert mapped[2] == {
        "time": 0.94,
        "chord": "A",
        "noteName": "C#4",
        "string": 2,
        "stringName": "B (2nd string)",
        "fret": 2,
        "leftFinger": "Ring (3)",
        "rightFinger": "m (Middle)",
    }
    assert mapped[3] == {
        "time": 1.20,
        "chord": "A",
        "noteName": "E4",
        "string": 1,
        "stringName": "e (1st string)",
        "fret": 0,
        "leftFinger": "Open (0)",
        "rightFinger": "a (Ring)",
    }

    # Synthesize a plucked arpeggio intro track and verify analyze_from_array populates fingerstyleIntro
    sr = ANALYSIS_SR
    plucked_midis = [45, 52, 57, 61, 64, 61, 57, 52] * 3  # A major arpeggio
    note_dur = 0.35
    chunks = []
    for m in plucked_midis:
        t = np.linspace(0.0, note_dur, int(round(note_dur * sr)), endpoint=False)
        f = librosa.midi_to_hz(m)
        pluck = (np.sin(2.0 * np.pi * f * t) + 0.35 * np.sin(2.0 * np.pi * 2.0 * f * t)) * np.exp(-t * 6.5)
        chunks.append(pluck)
    y_pluck = np.concatenate(chunks).astype(np.float32)
    y_pluck /= float(np.max(np.abs(y_pluck)) + 1e-9)

    res = analyze_from_array(y_pluck, sr)
    assert "fingerstyleIntro" in res
    fi = res["fingerstyleIntro"]
    assert fi["detected"] is True
    assert "Pattern" in fi["patternName"]
    assert len(fi["notes"]) >= 6
    for n in fi["notes"]:
        assert 1 <= n["string"] <= 6
        assert n["leftFinger"] in ("Open (0)", "Index (1)", "Middle (2)", "Ring (3)", "Pinky (4)")
        assert n["rightFinger"] in ("p (Thumb)", "i (Index)", "m (Middle)", "a (Ring)")

