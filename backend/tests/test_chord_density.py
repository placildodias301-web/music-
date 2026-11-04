"""
The chord timeline should read like a chord chart: real recordings used to come out at
80-200 chords a minute (vocal notes, bass runs and drum hits read as chords). These tests
pin the clean-up pass and the density on a real clip.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.analysis_engine import _consolidate_timeline, analyze  # noqa: E402

BEAT = 0.5  # 120 BPM


def seg(chord, start, beats, role="main", conf=0.99):
    return {"chord": chord, "start": start, "end": start + beats * BEAT, "confidence": conf,
            "role": role, "passing": role != "main"}


def build(*items):
    t, out = 0.0, []
    for chord, beats, *role in items:
        out.append(seg(chord, t, beats, *(role or ["main"])))
        t += beats * BEAT
    return out


def chords(tl):
    return [s["chord"] for s in tl]


def test_flickers_and_short_main_chords_merge_into_their_neighbours():
    tl = build(("G", 4), ("Em", 0.2), ("G", 4), ("C", 0.6), ("C", 4), ("Am", 0.5), ("D", 4))
    out = _consolidate_timeline(tl, BEAT)
    assert chords(out) == ["G", "C", "D"]
    assert out[0]["start"] == 0.0 and out[-1]["end"] == tl[-1]["end"]
    assert all(a["end"] == b["start"] for a, b in zip(out, out[1:]))  # no gaps, no overlaps


def test_melody_bounce_is_one_held_chord():
    out = _consolidate_timeline(build(("D", 4), ("Bm", 1.5), ("D", 4), ("G", 4)), BEAT)
    assert chords(out) == ["D", "G"]


def test_real_passing_and_filler_chords_survive():
    out = _consolidate_timeline(build(("G", 4), ("G/B", 1, "passing"), ("C", 4)), BEAT)
    assert chords(out) == ["G", "G/B", "C"] and out[1]["role"] == "passing"
    out = _consolidate_timeline(build(("D", 3), ("Dsus4", 0.7, "filler"), ("D", 3)), BEAT)
    assert chords(out) == ["D", "Dsus4", "D"] and out[1]["role"] == "filler"


def test_embellishment_chains_keep_the_strongest_and_one_per_bar():
    tl = build(("G", 4), ("Em/B", 0.8, "passing"), ("Asus2", 0.6, "passing"), ("F#m/A", 1, "passing"), ("D", 4))
    out = _consolidate_timeline(tl, BEAT)
    assert [s["chord"] for s in out if s["role"] != "main"] == ["F#m/A"]

    busy = build(("G", 2), ("G/B", 1, "passing"), ("C", 2), ("C/E", 1, "passing"), ("D", 2), ("D/F#", 1, "passing"), ("G", 2))
    kept = [s for s in _consolidate_timeline(busy, BEAT) if s["role"] != "main"]
    starts = [s["start"] for s in kept]
    assert all(b - a >= 4 * BEAT for a, b in zip(starts, starts[1:]))
    assert len(kept) < 3


def test_clean_progressions_are_untouched():
    tl = build(("G", 8), ("C", 8), ("D", 8), ("G", 8))
    assert _consolidate_timeline([dict(s) for s in tl], BEAT) == tl


CLIP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "evaluation", "clips", "TEST_001.mp4")


@pytest.mark.skipif(not os.path.exists(CLIP), reason="evaluation clip not present")
def test_real_recording_reads_like_a_chord_chart(monkeypatch):
    from services.audio_extract import cleanup, extract_audio_to_wav

    monkeypatch.setenv("GEMINI_API_KEY", "")
    wav = extract_audio_to_wav(CLIP)
    try:
        r = analyze(wav)
    finally:
        cleanup(wav)
    tl = r["chordTimeline"]
    beat = 60 / r["bpm"]
    per_minute = len(tl) / r["durationSeconds"] * 60
    assert per_minute <= 60, f"{per_minute:.0f} chords/min"  # was 162 before the clean-up pass
    assert sum(1 for s in tl if s["end"] - s["start"] < FRAGMENT * beat) == 0
    assert len({s["chord"] for s in tl}) <= 16  # was 28


FRAGMENT = 0.35
