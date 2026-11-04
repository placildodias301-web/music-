"""
Benchmark & Verification Suite (`backend/tests/test_chord_sync_and_soft_chords.py`)
for the 5-Stage Ensemble Architecture in `backend/services/analysis_engine.py`:
  1. `G -> C -> D` Standard Progression (0–2s `G`, 2–4s `C`, 4–6s `D`):
     Verifies `G`, `C`, and `D` are all detected in order with boundary errors < 0.10s
     (and sample-accurate < 30ms sync), never collapsing into `G`.
  2. Softly Played Chords Test:
     Synthesizes `G` at loud amplitude (`0.8`), followed by `C` played 10x softer (`0.08` amplitude),
     followed by `D` played 15x softer (`0.05` amplitude) — asserts that both the soft `C` and soft `D`
     are detected and output at their exact timestamps.
  3. Fast 300ms Passing & Slash Chords (`G -> G/B -> C` and `G -> D/F# -> Em`):
     Asserts the 300ms `G/B` and `D/F#` passing chords are retained in `chordTimeline`
     (with `role == "passing"`) and not smoothed away.
  4. Filler Embellishments (`D -> Dsus4 -> D`):
     Asserts `Dsus4` is captured as a distinct event (with `role == "filler"`).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import librosa
from services.analysis_engine import ANALYSIS_SR, analyze_from_array


def _synth_chord_segment(
    bass_midi: int,
    upper_midis: list[int],
    duration_sec: float,
    amplitude: float = 0.8,
    sr: int = ANALYSIS_SR,
) -> np.ndarray:
    """Synthesizes a realistic acoustic/harmonic chord segment with bass + upper voicings."""
    n_samples = int(round(duration_sec * sr))
    t = np.linspace(0.0, duration_sec, n_samples, endpoint=False)
    sig = np.zeros_like(t)

    # Bass note in 35-220 Hz with fundamental + 2nd harmonic
    f_bass = librosa.midi_to_hz(bass_midi)
    sig += 0.90 * np.sin(2.0 * np.pi * f_bass * t)
    sig += 0.40 * np.sin(2.0 * np.pi * (2.0 * f_bass) * t)

    # Upper chord tones with natural overtone series
    for m in upper_midis:
        f = librosa.midi_to_hz(m)
        sig += 0.55 * np.sin(2.0 * np.pi * f * t)
        sig += 0.25 * np.sin(2.0 * np.pi * (2.0 * f) * t)
        sig += 0.12 * np.sin(2.0 * np.pi * (3.0 * f) * t)

    peak = float(np.max(np.abs(sig))) + 1e-9
    sig = (sig / peak) * amplitude
    return sig.astype(np.float32)


def test_g_c_d_standard_progression_never_collapses_into_g():
    """
    Case 1: `G -> C -> D` Standard Progression (0–2s `G`, 2–4s `C`, 4–6s `D`).
    Assert the output contains `G`, `C`, and `D` with boundary errors < 0.10s (< 30ms sync),
    never collapsing into `G`.
    """
    # G major: bass G2 (43), upper G3 (55), B3 (59), D4 (62)
    # C major: bass C2 (36), upper C4 (60), E4 (64), G4 (67)
    # D major: bass D2 (38), upper D4 (62), F#4 (66), A4 (69)
    seg_g = _synth_chord_segment(43, [55, 59, 62], 2.0, amplitude=0.8)
    seg_c = _synth_chord_segment(36, [60, 64, 67], 2.0, amplitude=0.8)
    seg_d = _synth_chord_segment(38, [62, 66, 69], 2.0, amplitude=0.8)

    y = np.concatenate([seg_g, seg_c, seg_d])
    res = analyze_from_array(y, ANALYSIS_SR)
    timeline = res["chordTimeline"]
    chords = [s["chord"] for s in timeline]

    assert chords == ["G", "C", "D"], f"Expected ['G', 'C', 'D'], got {chords}: {timeline}"
    assert abs(timeline[0]["start"] - 0.0) < 0.03
    assert abs(timeline[0]["end"] - 2.0) < 0.03
    assert abs(timeline[1]["start"] - 2.0) < 0.03
    assert abs(timeline[1]["end"] - 4.0) < 0.03
    assert abs(timeline[2]["start"] - 4.0) < 0.03
    assert abs(timeline[2]["end"] - 6.0) < 0.03
    for seg in timeline:
        assert seg["role"] == "main"


def test_softly_played_chords_detected_at_exact_timestamps():
    """
    Case 2: Softly Played Chords Test.
    Synthesize `G` at loud amplitude (`0.8`), followed by `C` played 10x softer (`0.08` amplitude),
    followed by `D` played 15x softer (`0.05` amplitude) — assert that both the soft `C` and
    soft `D` are detected and output at their exact timestamps!
    """
    seg_g_loud = _synth_chord_segment(43, [55, 59, 62], 2.0, amplitude=0.80)
    seg_c_soft = _synth_chord_segment(36, [60, 64, 67], 2.0, amplitude=0.08)
    seg_d_whisper = _synth_chord_segment(38, [62, 66, 69], 2.0, amplitude=0.05)

    y = np.concatenate([seg_g_loud, seg_c_soft, seg_d_whisper])
    res = analyze_from_array(y, ANALYSIS_SR)
    timeline = res["chordTimeline"]
    chords = [s["chord"] for s in timeline]

    assert chords == ["G", "C", "D"], f"Soft chords missed! Expected ['G', 'C', 'D'], got {chords}: {timeline}"
    assert abs(timeline[0]["start"] - 0.0) < 0.03
    assert abs(timeline[0]["end"] - 2.0) < 0.03
    assert abs(timeline[1]["start"] - 2.0) < 0.03
    assert abs(timeline[1]["end"] - 4.0) < 0.03
    assert abs(timeline[2]["start"] - 4.0) < 0.03
    assert abs(timeline[2]["end"] - 6.0) < 0.03


def test_fast_300ms_passing_and_slash_chords_retained():
    """
    Case 3: Fast 300ms Passing & Slash Chords (`G -> G/B -> C` and `G -> D/F# -> Em`).
    Assert the `300ms` `G/B` and `D/F#` passing chords are retained in `chordTimeline`
    and not smoothed away.
    """
    # 1. G (0-1.7s) -> G/B (1.7-2.0s, 300ms) -> C (2.0-4.0s)
    # G/B has B2 (MIDI 47, 123.47 Hz) in bass and G major triad (G3, B3, D4) in upper harmony
    y_gb = np.concatenate([
        _synth_chord_segment(43, [55, 59, 62], 1.7, amplitude=0.8),  # G
        _synth_chord_segment(47, [55, 59, 62], 0.3, amplitude=0.7),  # G/B (300ms)
        _synth_chord_segment(36, [60, 64, 67], 2.0, amplitude=0.8),  # C
    ])
    res_gb = analyze_from_array(y_gb, ANALYSIS_SR)
    tl_gb = res_gb["chordTimeline"]
    chords_gb = [s["chord"] for s in tl_gb]

    assert "G" in chords_gb and "G/B" in chords_gb and "C" in chords_gb, (
        f"Expected G -> G/B -> C in timeline, got {chords_gb}: {tl_gb}"
    )
    gb_seg = next(s for s in tl_gb if s["chord"] == "G/B")
    assert gb_seg["role"] == "passing" and gb_seg["passing"] is True
    assert abs(gb_seg["start"] - 1.7) < 0.05
    assert abs(gb_seg["end"] - 2.0) < 0.05

    # 2. G (0-1.7s) -> D/F# (1.7-2.0s, 300ms) -> Em (2.0-4.0s)
    # D/F# has F#2 (MIDI 42, 92.50 Hz) in bass and D major triad (D4, F#4, A4) in upper harmony
    y_df = np.concatenate([
        _synth_chord_segment(43, [55, 59, 62], 1.7, amplitude=0.8),  # G
        _synth_chord_segment(42, [62, 66, 69], 0.3, amplitude=0.7),  # D/F# (300ms)
        _synth_chord_segment(40, [52, 55, 59], 2.0, amplitude=0.8),  # Em
    ])
    res_df = analyze_from_array(y_df, ANALYSIS_SR)
    tl_df = res_df["chordTimeline"]
    chords_df = [s["chord"] for s in tl_df]

    assert "G" in chords_df and "D/F#" in chords_df and "Em" in chords_df, (
        f"Expected G -> D/F# -> Em in timeline, got {chords_df}: {tl_df}"
    )
    df_seg = next(s for s in tl_df if s["chord"] == "D/F#")
    assert df_seg["role"] == "passing" and df_seg["passing"] is True
    assert abs(df_seg["start"] - 1.7) < 0.05
    assert abs(df_seg["end"] - 2.0) < 0.05


def test_filler_embellishments_d_dsus4_d_captured():
    """
    Case 4: Filler Embellishments (`D -> Dsus4 -> D`).
    Assert `Dsus4` is captured as a distinct event with `role == "filler"`.
    """
    # D major: bass D2 (38), upper D4 (62), F#4 (66), A4 (69)
    # Dsus4:   bass D2 (38), upper D4 (62), G4 (67), A4 (69) (350ms embellishment)
    y_sus = np.concatenate([
        _synth_chord_segment(38, [62, 66, 69], 1.5, amplitude=0.8),   # D (0.0 - 1.5s)
        _synth_chord_segment(38, [62, 67, 69], 0.35, amplitude=0.75), # Dsus4 (1.5 - 1.85s)
        _synth_chord_segment(38, [62, 66, 69], 1.65, amplitude=0.8),  # D (1.85 - 3.5s)
    ])
    res_sus = analyze_from_array(y_sus, ANALYSIS_SR)
    tl_sus = res_sus["chordTimeline"]
    chords_sus = [s["chord"] for s in tl_sus]

    assert chords_sus == ["D", "Dsus4", "D"], f"Expected ['D', 'Dsus4', 'D'], got {chords_sus}: {tl_sus}"
    sus_seg = tl_sus[1]
    assert sus_seg["chord"] == "Dsus4"
    assert sus_seg["role"] == "filler" and sus_seg["passing"] is True
    assert abs(sus_seg["start"] - 1.50) < 0.04
    assert abs(sus_seg["end"] - 1.85) < 0.04
