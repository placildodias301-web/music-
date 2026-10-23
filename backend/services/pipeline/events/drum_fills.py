"""
Possible drum fills in stems/drums.wav. A heuristic, not a fill detector:
results are "possible_fill" events with a 0–1 confidence.

The drums stem is cut into one window per beat. Each window is compared with
the windows at the same position in the bar over the surrounding bars (so a
backbeat is compared with other backbeats, not with the kick on beat 1):

  density   onsets per second against that baseline (a fill is busier) — the main cue
  strength  mean onset strength against the baseline (toms/crashes hit harder)
  pattern   how differently the onsets are placed inside the beat

A window sparser than its baseline never counts (a break is not a fill). A
busier run longer than one bar is a groove change, not a fill, and is dropped.
Windows in the bar before a section boundary get extra weight, since that is
where fills are played.

No events at all when the stem is missing, quiet (Demucs bleed only) or has
too few beats to build a baseline from: no signal must not become a fill.
"""

import logging
import math
import os
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)

SR = 22050
HOP = 256  # ~12 ms
MIN_STEM_DBFS = -45.0  # below this the drums stem is Demucs bleed, not drums
ONSET_FLOOR_DB = 35.0  # onsets this far under the stem's loudest frame are ignored
MIN_WINDOWS = 8
CONTEXT_BARS = 8
MIN_BASELINE = 3
PATTERN_BINS = 12
THRESHOLD = 0.5
SECTION_BOOST = 1.25
FALLBACK_WINDOW_SECONDS = 0.5  # used when there are no beats

MISSING = "Drum fill detection skipped: the drums stem is missing."
NO_SIGNAL = "Drum fill detection skipped: the drums stem has no clear drum signal."


@dataclass
class FillResult:
    events: list[dict]
    warnings: list[str] = field(default_factory=list)


def _clip01(x: float) -> float:
    return float(min(max(x, 0.0), 1.0))


def _windows(beats: list[float], duration: float) -> list[tuple[float, float]]:
    if len(beats) >= 2:
        return [(a, b) for a, b in zip(beats, beats[1:]) if b > a]
    edges = np.arange(0.0, duration, FALLBACK_WINDOW_SECONDS)
    return [(float(a), float(min(a + FALLBACK_WINDOW_SECONDS, duration))) for a in edges]


def _bar_positions(windows: list[tuple[float, float]], downbeats: list[float]) -> tuple[list[int], int]:
    """Beat-in-bar index of every window, and beats per bar (all 0 / 1 without downbeats)."""
    starts = np.array([s for s, _ in windows])
    if len(downbeats) < 2 or len(starts) == 0:
        return [0] * len(windows), 1
    counts = [int(np.sum((starts >= a - 0.03) & (starts < b - 0.03))) for a, b in zip(downbeats, downbeats[1:])]
    counts = [c for c in counts if c]
    per_bar = int(np.median(counts)) if counts else 4
    anchor = int(np.argmin(np.abs(starts - downbeats[0])))
    return [(i - anchor) % per_bar for i in range(len(windows))], max(per_bar, 1)


def _pattern(env: np.ndarray, times: np.ndarray, start: float, end: float) -> np.ndarray:
    grid = np.linspace(start, end, PATTERN_BINS, endpoint=False)
    vec = np.interp(grid, times, env)
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 1e-9 else np.zeros(PATTERN_BINS)


def detect_fills(drums_path: str, *, duration: float, beats: list[float], downbeats: list[float],
                 sections: list[dict]) -> FillResult:
    if not drums_path or not os.path.isfile(drums_path):
        return FillResult([], [MISSING])

    import librosa

    y, _sr = librosa.load(drums_path, sr=SR, mono=True)
    if y.size == 0 or 20 * math.log10(float(np.sqrt(np.mean(y ** 2))) + 1e-12) < MIN_STEM_DBFS:
        return FillResult([], [NO_SIGNAL])

    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    times = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=HOP)
    rms_db = librosa.amplitude_to_db(librosa.feature.rms(y=y, hop_length=HOP)[0], ref=1.0)
    onset_frames = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP)
    loud = rms_db.max() - ONSET_FLOOR_DB
    onsets = np.array([times[f] for f in onset_frames if rms_db[min(f, len(rms_db) - 1)] >= loud])

    windows = _windows(beats, duration)
    if len(windows) < MIN_WINDOWS or len(onsets) < MIN_WINDOWS:
        return FillResult([], [NO_SIGNAL])
    positions, per_bar = _bar_positions(windows, downbeats)

    density, strength, patterns = [], [], []
    for start, end in windows:
        n = int(np.sum((onsets >= start - 0.02) & (onsets < end - 0.02)))
        density.append(n / (end - start))
        frames = (times >= start) & (times < end)
        strength.append(float(env[frames].mean()) if frames.any() else 0.0)
        patterns.append(_pattern(env, times, start, end))
    density, strength = np.array(density), np.array(strength)

    boundaries = [float(s["start"]) for s in sections if float(s["start"]) > 0.0]
    bar_seconds = per_bar * float(np.median([e - s for s, e in windows]))

    scores = np.zeros(len(windows))
    context = CONTEXT_BARS * per_bar
    for i, (start, end) in enumerate(windows):
        peers = [j for j in range(max(0, i - context), min(len(windows), i + context + 1))
                 if j != i and positions[j] == positions[i]]
        if len(peers) < MIN_BASELINE:
            continue
        base_density = max(float(np.median(density[peers])), 1.0 / (end - start))
        ratio = density[i] / base_density
        if ratio < 1.0:
            continue  # sparser than usual: a break or a drop-out, not a fill
        base_strength = max(float(np.median(strength[peers])), 1e-6)
        base_pattern = np.median([patterns[j] for j in peers], axis=0)
        norm = np.linalg.norm(base_pattern)
        similarity = float(patterns[i] @ (base_pattern / norm)) if norm > 1e-9 else 1.0

        score = (0.6 * _clip01((ratio - 1.25) / 0.75)
                 + 0.2 * _clip01((strength[i] / base_strength - 1.2) / 1.0)
                 + 0.2 * _clip01((1.0 - similarity - 0.25) / 0.5))
        if any(b - bar_seconds - 0.05 <= start and end <= b + 0.1 for b in boundaries):
            score *= SECTION_BOOST
        scores[i] = _clip01(score)

    max_run = per_bar if per_bar > 1 else 4  # a busier run longer than a bar is a groove change
    events = []
    i = 0
    while i < len(windows):
        if scores[i] < THRESHOLD:
            i += 1
            continue
        j = i
        while j + 1 < len(windows) and scores[j + 1] >= THRESHOLD:
            j += 1
        if j - i + 1 <= max_run:
            events.append({"time": round(windows[i][0], 3), "type": "possible_fill",
                           "confidence": round(float(scores[i:j + 1].max()), 2)})
        i = j + 1
    return FillResult(events)
