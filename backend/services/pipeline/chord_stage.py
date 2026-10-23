"""
Stage 4: the chord timeline from the no-vocals stem.

Engine choice (PIPELINE_CHORD_ENGINE):
  auto        BTC; if it cannot be downloaded or run, lv-chordia when it is
              already installed with its weights, with a warning saying why
  btc         BTC only
  lv_chordia  lv-chordia only

Each span: {"start", "end", "chord": Harte label, "simple": app symbol, "type"}.
Timestamps are clamped to the audio, overlaps trimmed, empty / non-finite
spans dropped and adjacent identical chords merged. Short chords are kept:
passing-chord detection (a later step) needs them.

Timeouts (the chord limit and the job deadline) are never turned into a
fallback: a machine too slow for BTC is slower still for lv-chordia's
five-model ensemble.
"""

import logging
import math
import os
from dataclasses import dataclass, field
from typing import Callable

from . import errors
from .chords import RawChords, btc_adapter, harte, lv_chordia_adapter
from .config import PipelineConfig
from .demucs_stage import resolve_device
from .errors import PipelineError

logger = logging.getLogger(__name__)

# Identical neighbours this close are one chord (lv-chordia rounds to 10 ms).
MERGE_GAP_SECONDS = 0.05
NO_CHORDS_FOUND = "No chords were recognised in the accompaniment."
TIMEOUTS = (errors.JOB_TIMEOUT, errors.CHORD_TIMEOUT)


@dataclass
class ChordResult:
    engine: str
    chords: list[dict]
    warnings: list[str] = field(default_factory=list)


def clean_chords(segments, duration: float) -> tuple[list[dict], list[str]]:
    """Validated, clamped, merged spans plus warnings. Malformed output raises INVALID_CHORD_RESULT."""
    if not isinstance(segments, list):
        raise PipelineError(errors.INVALID_CHORD_RESULT, "The chord model returned an unexpected result.")

    spans = []
    for seg in segments:
        try:
            start, end, label = float(seg["start"]), float(seg["end"]), seg["chord"]
            chord = harte.parse(label)
        except (KeyError, TypeError, ValueError, AttributeError):
            logger.warning("Malformed chord segment: %r", seg)
            raise PipelineError(errors.INVALID_CHORD_RESULT, "The chord model returned a malformed chord segment.")
        if math.isfinite(start) and math.isfinite(end):
            # Same 0..duration window and rounding as merge.py.
            spans.append((round(min(max(start, 0.0), duration), 3), round(min(max(end, 0.0), duration), 3), chord))

    chords: list[dict] = []
    for start, end, chord in sorted(spans, key=lambda s: s[0]):
        if chords:
            start = max(start, chords[-1]["end"])  # no overlaps
        if end <= start:
            continue
        prev = chords[-1] if chords else None
        if prev and prev["chord"] == chord.harte and start - prev["end"] <= MERGE_GAP_SECONDS:
            prev["end"] = end
            continue
        chords.append({"start": start, "end": end, "chord": chord.harte, "simple": chord.simple,
                       "type": "no_chord" if chord.no_chord else "chord"})

    if not chords:
        raise PipelineError(errors.INVALID_CHORD_RESULT, "The chord model returned no usable chord spans.")

    warnings = []
    unnamed = sorted({c["chord"].split(":", 1)[1] for c in chords if c["simple"] is None})
    if unnamed:
        warnings.append(f"Some chords have no symbol in the app ({', '.join(unnamed)}); their simple label is empty.")
    if all(c["type"] == "no_chord" for c in chords):
        warnings.append(NO_CHORDS_FOUND)
    return chords, warnings


def _resolve_device(requested: str) -> tuple[str, list[str]]:
    try:
        device, warning = resolve_device(requested)
    except PipelineError:  # torch itself is missing
        raise PipelineError(errors.CHORD_MODEL_MISSING, "PyTorch is not installed, so chords cannot be recognised.")
    if warning:
        return device, [f"PIPELINE_CHORD_DEVICE={requested} is not available; chords were recognised on the CPU."]
    return device, []


def analyze_chords(stem_path: str, *, duration: float, config: PipelineConfig,
                   remaining: Callable[[], float], progress: Callable[[float], None]) -> ChordResult:
    """`progress` takes this stage's 0–100 and may raise the job timeout; `remaining` is the job's time left."""
    if not os.path.isfile(stem_path):
        raise PipelineError(errors.STEM_MISSING, "The no-vocals stem needed for chord recognition is missing.")

    def timeout() -> float:
        return max(1.0, min(float(config.chord_timeout_seconds), remaining()))

    def finish(raw: RawChords, warnings: list[str]) -> ChordResult:
        chords, more = clean_chords(raw.segments, duration)
        return ChordResult(engine=raw.engine, chords=chords, warnings=warnings + more)

    def run_lv_chordia(heartbeat) -> RawChords:
        return lv_chordia_adapter.analyze(stem_path, timeout_seconds=timeout(), heartbeat=heartbeat)

    if config.chord_engine == "lv_chordia":
        return finish(run_lv_chordia(progress), [])

    device, warnings = _resolve_device(config.chord_device)
    try:
        return finish(btc_adapter.analyze(stem_path, device=device, timeout_seconds=timeout(), heartbeat=progress),
                      warnings)
    except PipelineError as e:
        if config.chord_engine == "btc" or e.code in TIMEOUTS:
            raise
        btc_error = e

    reason = lv_chordia_adapter.unavailable_reason()
    if reason:
        raise PipelineError(btc_error.code, f"{btc_error.message} No fallback chord model is available ({reason}).")
    logger.info("BTC failed (%s), falling back to lv-chordia: %s", btc_error.code, btc_error.message)
    try:
        result = finish(run_lv_chordia(lambda pct: progress(50 + pct / 2)), [])
    except PipelineError as e:
        if e.code in TIMEOUTS:
            raise
        raise PipelineError(e.code, f"Chord recognition failed: BTC failed ({btc_error.message}) "
                                    f"and lv-chordia failed ({e.message})")
    result.warnings.insert(0, f"BTC was not used ({btc_error.code}: {btc_error.message}); "
                              "lv-chordia was used instead.")
    return result
