"""
Rhythm engines. Each adapter turns one stem into a RawRhythm and raises
PipelineError with its own code on failure; rhythm_stage picks the engine,
falls back and validates. Adapters never import each other, so a broken
install of one cannot break the other.
"""

from dataclasses import dataclass, field
from typing import Callable, Optional

# Called about once a second while an engine runs, with the engine's own
# estimate of how far it is (0–100). The job's report() behind it raises
# PipelineError once the job deadline has passed, which stops the engine.
Heartbeat = Callable[[float], None]


@dataclass
class RawRhythm:
    engine: str  # what result.engines.rhythm will say, e.g. "allin1@wsl2", "beat_this@cpu"
    beats: list[float]
    downbeats: list[float]
    bpm: Optional[float] = None  # None: the stage derives it from the beats
    sections: list[dict] = field(default_factory=list)  # {"start", "end", "label"}
    warnings: list[str] = field(default_factory=list)


def estimated_pct(elapsed: float, expected: float) -> float:
    """A progress guess for engines that report none: rises quickly, never reaches 100."""
    return round(95.0 * elapsed / (elapsed + max(expected, 1.0)), 1)
