"""
Stage 5: events from the rhythm and chord results plus stems/drums.wav.

  passing chords  chord spans re-typed "passing" + a chord_change event each
  possible fills  a "possible_fill" event with a 0–1 confidence

Nothing here can fail the job: the analysis already has its rhythm and
chords, so a fill-detection error only drops the fills, with a warning.
Downbeats are not repeated as events: they are already in result.downbeats.
"""

import logging
from dataclasses import dataclass, field

from .events import passing
from .events.drum_fills import FillResult, detect_fills

logger = logging.getLogger(__name__)

ENGINE = "heuristic"
FILLS_FAILED = "Drum fill detection failed; no possible fills are reported."


@dataclass
class EventsResult:
    chords: list[dict]
    events: list[dict]
    warnings: list[str] = field(default_factory=list)
    engine: str = ENGINE


def analyze_events(*, chords: list[dict], beats: list[float], downbeats: list[float], sections: list[dict],
                   drums_path: str, duration: float) -> EventsResult:
    chords, chord_events = passing.classify(chords, beats)
    try:
        fills = detect_fills(drums_path, duration=duration, beats=beats, downbeats=downbeats, sections=sections)
    except Exception:
        logger.exception("Drum fill detection failed")
        fills = FillResult([], [FILLS_FAILED])
    return EventsResult(chords=chords, events=chord_events + fills.events, warnings=fills.warnings)
