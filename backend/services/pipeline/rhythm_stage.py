"""
Stage 3: rhythm and structure from the no-vocals stem.

Engine choice (PIPELINE_RHYTHM_ENGINE):
  auto      allin1 through WSL2 when PIPELINE_WSL_ENABLED, else / on any
            allin1 failure beat_this, with a warning saying why
  allin1    allin1 only; its failure fails the job
  beat_this beat_this only

Only allin1 labels sections; with beat_this they stay empty (never guessed).
The job timeout always wins: it is never turned into a fallback.
"""

import logging
import math
import os
from collections import Counter
from dataclasses import dataclass, field
from statistics import median
from typing import Callable, Optional

from . import errors
from .config import PipelineConfig
from .demucs_stage import resolve_device
from .errors import PipelineError
from .rhythm import RawRhythm, allin1_adapter, beat_this_adapter

logger = logging.getLogger(__name__)

MIN_BPM, MAX_BPM = 30.0, 300.0
# Meter needs this many complete bars, and this share of them agreeing on beats per bar.
MIN_BARS = 4
MIN_METER_AGREEMENT = 0.75
# Beats per bar -> time signature. 2 is left out on purpose: a beat tracker
# counting 2 per bar can't tell 2/4 from 6/8 (felt as two dotted-quarter beats).
METERS = {3: "3/4", 4: "4/4", 5: "5/4", 6: "6/8"}

SECTIONS_UNAVAILABLE = "Song sections unavailable because allin1 was not used."
NO_PULSE = "No clear rhythmic pulse detected; chord analysis will still run."


@dataclass
class RhythmResult:
    engine: str
    bpm: Optional[float]
    time_signature: Optional[str]
    beats: list[float]
    downbeats: list[float]
    sections: list[dict]
    warnings: list[str] = field(default_factory=list)


def _clean_times(values, duration: float, what: str) -> list[float]:
    try:
        times = [float(t) for t in values]
    except (TypeError, ValueError):
        raise PipelineError(errors.INVALID_RHYTHM_RESULT, f"The rhythm engine returned non-numeric {what}.")
    if any(not math.isfinite(t) for t in times):
        raise PipelineError(errors.INVALID_RHYTHM_RESULT, f"The rhythm engine returned invalid {what}.")
    # Same 0..duration window and rounding as merge.py, so meter/BPM are computed on what the client gets.
    return sorted({round(min(max(t, 0.0), duration), 3) for t in times})


def bpm_from_beats(beats: list[float]) -> Optional[float]:
    gaps = [b - a for a, b in zip(beats, beats[1:]) if b > a]
    return round(60.0 / median(gaps), 2) if gaps else None


def estimate_meter(beats: list[float], downbeats: list[float]) -> tuple[Optional[str], float, Optional[int]]:
    """(time signature or None, agreement 0–1, most common beats per bar)."""
    counts = []
    for start, end in zip(downbeats, downbeats[1:]):  # complete bars only
        n = sum(1 for b in beats if start - 0.03 <= b < end - 0.03)
        if n:
            counts.append(n)
    if len(counts) < MIN_BARS:
        return None, 0.0, None
    per_bar, hits = Counter(counts).most_common(1)[0]
    agreement = hits / len(counts)
    if agreement < MIN_METER_AGREEMENT:
        return None, agreement, per_bar
    return METERS.get(per_bar), agreement, per_bar


def validate(raw: RawRhythm, duration: float) -> RhythmResult:
    beats = _clean_times(raw.beats, duration, "beats")
    downbeats = _clean_times(raw.downbeats, duration, "downbeats")
    warnings = list(raw.warnings)
    if len(beats) < 2:
        # Well-formed but beatless (ambient, rubato, spoken word): not an error,
        # so the chord stage still runs. Corrupt output is still rejected above.
        return RhythmResult(engine=raw.engine, bpm=None, time_signature=None, beats=[], downbeats=[],
                            sections=[], warnings=warnings + [NO_PULSE])

    bpm = raw.bpm
    if bpm is not None:
        try:
            bpm = float(bpm)
        except (TypeError, ValueError):
            bpm = None
    if bpm is None or not math.isfinite(bpm) or bpm <= 0:
        bpm = bpm_from_beats(beats)
    if bpm is None or not (MIN_BPM <= bpm <= MAX_BPM):
        raise PipelineError(errors.INVALID_RHYTHM_RESULT, f"The rhythm engine returned an implausible tempo ({bpm}).")

    sections = []
    for s in raw.sections:
        try:
            start, end = float(s["start"]), float(s["end"])
        except (KeyError, TypeError, ValueError):
            raise PipelineError(errors.INVALID_RHYTHM_RESULT, "The rhythm engine returned a malformed section.")
        if math.isfinite(start) and math.isfinite(end):
            sections.append({"start": start, "end": end, "label": str(s.get("label", "")).strip().lower() or "unknown"})

    meter, agreement, per_bar = estimate_meter(beats, downbeats)
    if meter is None:
        if not downbeats:
            why = "no downbeats were found"
        elif per_bar is None:
            why = "too few complete bars"
        elif agreement < MIN_METER_AGREEMENT:
            why = f"only {agreement:.0%} of bars have the same number of beats"
        else:
            why = f"{per_bar} beats per bar is ambiguous"
        warnings.append(f"Time signature could not be estimated confidently ({why}).")

    return RhythmResult(engine=raw.engine, bpm=round(bpm, 2), time_signature=meter, beats=beats,
                        downbeats=downbeats, sections=sections, warnings=warnings)


def _run_allin1(stem: str, workdir: str, cfg: PipelineConfig, timeout: float, heartbeat) -> RawRhythm:
    return allin1_adapter.analyze(stem, os.path.join(workdir, "allin1"), command=cfg.wsl_command,
                                  timeout_seconds=timeout, heartbeat=heartbeat)


def _run_beat_this(stem: str, cfg: PipelineConfig, timeout: float, heartbeat) -> RawRhythm:
    # Same device as Demucs (DEMUCS_DEVICE); the Demucs stage already warned if it fell back to the CPU.
    device, _warning = resolve_device(cfg.demucs_device)
    return beat_this_adapter.analyze(stem, device=device, timeout_seconds=timeout, heartbeat=heartbeat)


def analyze_rhythm(stem_path: str, workdir: str, *, duration: float, config: PipelineConfig,
                   remaining: Callable[[], float], progress: Callable[[float], None]) -> RhythmResult:
    """`progress` takes this stage's 0–100 and may raise the job timeout; `remaining` is the job's time left."""
    if not os.path.isfile(stem_path):
        raise PipelineError(errors.STEM_MISSING, "The no-vocals stem needed for rhythm analysis is missing.")

    def timeout() -> float:
        return max(1.0, min(float(config.rhythm_timeout_seconds), remaining()))

    engine = config.rhythm_engine
    if engine == "beat_this":
        return _with_sections_warning(validate(_run_beat_this(stem_path, config, timeout(), progress), duration))

    if engine == "allin1":
        if not config.wsl_enabled:
            raise PipelineError(errors.WSL_UNAVAILABLE,
                                "PIPELINE_RHYTHM_ENGINE=allin1 needs WSL2, but PIPELINE_WSL_ENABLED=0.")
        return validate(_run_allin1(stem_path, workdir, config, timeout(), progress), duration)

    # auto
    fallback_reason = "WSL2 is disabled (PIPELINE_WSL_ENABLED=0)"
    if config.wsl_enabled:
        try:
            return validate(_run_allin1(stem_path, workdir, config, timeout(), lambda pct: progress(pct * 0.8)),
                            duration)
        except PipelineError as e:
            if e.code == errors.JOB_TIMEOUT:
                raise
            logger.info("allin1 unavailable (%s), falling back to beat_this: %s", e.code, e.message)
            fallback_reason = f"{e.code}: {e.message}"

    try:
        result = validate(_run_beat_this(stem_path, config, timeout(), progress), duration)
    except PipelineError as e:
        if e.code == errors.JOB_TIMEOUT or not config.wsl_enabled:
            raise
        raise PipelineError(e.code, f"Rhythm analysis failed: allin1 was unavailable ({fallback_reason}) "
                                    f"and beat_this failed ({e.message})")
    result.warnings.insert(0, f"allin1 was not used ({fallback_reason}); beat_this was used instead.")
    return _with_sections_warning(result)


def _with_sections_warning(result: RhythmResult) -> RhythmResult:
    result.sections = []
    result.warnings.insert(0, SECTIONS_UNAVAILABLE)
    return result
