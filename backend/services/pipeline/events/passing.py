"""
Passing / transition chords, measured in beats of the song's own pulse.

A chord span is "passing" when
  1. it lasts less than one beat, or
  2. it lasts less than two beats and sits between two different chords that
     are each at least twice as long (C - G/B - Am: the G/B is a passing chord).

Spans are only re-labelled (type "passing"); none are removed. No-chord spans
are never passing. Without beats (no clear pulse) nothing is classified,
because "short" has no meaning without a beat to measure it against.
"""

from statistics import median
from typing import Optional

MAX_PASSING_BEATS = 1.0
MAX_BETWEEN_BEATS = 2.0
NEIGHBOUR_RATIO = 2.0


def beat_duration(beats: list[float]) -> Optional[float]:
    gaps = [b - a for a, b in zip(beats, beats[1:]) if b > a]
    return median(gaps) if gaps else None


def _is_chord(span: Optional[dict]) -> bool:
    return span is not None and span["type"] != "no_chord"


def classify(chords: list[dict], beats: list[float]) -> tuple[list[dict], list[dict]]:
    """(chords with passing spans re-typed, one chord_change event per passing chord)."""
    out = [dict(c) for c in chords]
    beat = beat_duration(beats)
    if beat is None:
        return out, []

    events = []
    for i, span in enumerate(chords):
        if not _is_chord(span):
            continue
        length = span["end"] - span["start"]
        prev = chords[i - 1] if i > 0 else None
        nxt = chords[i + 1] if i + 1 < len(chords) else None
        between = (
            length < MAX_BETWEEN_BEATS * beat
            and _is_chord(prev) and _is_chord(nxt)
            and prev["chord"] != span["chord"] and nxt["chord"] != span["chord"]
            and prev["end"] - prev["start"] >= NEIGHBOUR_RATIO * length
            and nxt["end"] - nxt["start"] >= NEIGHBOUR_RATIO * length
        )
        if length < MAX_PASSING_BEATS * beat or between:
            out[i]["type"] = "passing"
            events.append({"time": span["start"], "type": "chord_change",
                           "value": span["simple"] or span["chord"], "subtype": "passing"})
    return out, events
