"""
Builds the final JSON from whatever stages produced. Every time value is
clamped to [0, audio_duration], every list is sorted and identical events are
kept once, so the frontend can binary-search and draw without defensive checks.
"""

from typing import Iterable, Optional

from .config import PIPELINE_VERSION
from .schemas import ChordSpan, Event, PipelineResult, Section


def _clamp(t: float, duration: float) -> float:
    return round(min(max(float(t), 0.0), duration), 3)


def _times(values: Iterable[float], duration: float) -> list[float]:
    return sorted({_clamp(t, duration) for t in values})


def build_result(
    *,
    audio_duration: float,
    sample_rate: int,
    bpm: Optional[float] = None,
    time_signature: Optional[str] = None,
    beats: Iterable[float] = (),
    downbeats: Iterable[float] = (),
    sections: Iterable[dict] = (),
    chords: Iterable[dict] = (),
    events: Iterable[dict] = (),
    engines: Optional[dict[str, str]] = None,
    warnings: Iterable[str] = (),
    summary: Optional[dict] = None,
) -> PipelineResult:
    """`summary`: key, mode, scale, key_confidence, key_alternatives, difficulty, preprocessing (all optional)."""
    d = round(float(audio_duration), 3)

    clean_sections = []
    for s in sorted(sections, key=lambda s: s["start"]):
        start, end = _clamp(s["start"], d), _clamp(s["end"], d)
        if end > start:
            clean_sections.append(Section(start=start, end=end, label=str(s["label"])))

    clean_chords = []
    for c in sorted(chords, key=lambda c: c["start"]):
        start, end = _clamp(c["start"], d), _clamp(c["end"], d)
        if end > start:
            clean_chords.append(ChordSpan(**{**c, "start": start, "end": end}))

    unique = {}
    for e in events:
        confidence = e.get("confidence")
        event = Event(**{**e, "time": _clamp(e["time"], d),
                         "confidence": None if confidence is None else round(min(max(float(confidence), 0.0), 1.0), 2)})
        # One event per (time, type, value, subtype); a duplicate keeps the higher confidence.
        key = (event.time, event.type, event.value, event.subtype)
        if key not in unique or (event.confidence or 0) > (unique[key].confidence or 0):
            unique[key] = event
    clean_events = sorted(unique.values(), key=lambda e: (e.time, e.type, e.value or ""))

    return PipelineResult(
        pipeline_version=PIPELINE_VERSION,
        audio_duration=d,
        sample_rate=sample_rate,
        bpm=round(float(bpm), 2) if bpm else None,
        time_signature=time_signature,
        beats=_times(beats, d),
        downbeats=_times(downbeats, d),
        sections=clean_sections,
        chords=clean_chords,
        events=clean_events,
        engines=dict(engines or {}),
        warnings=list(warnings),
        **(summary or {}),
    )
