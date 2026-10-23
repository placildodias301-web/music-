"""Synthetic drum stems for the fill-detection tests (no samples, no models)."""

import numpy as np
import soundfile as sf

SR = 44100
rng = np.random.default_rng(7)


def _hit(kind: str, amp: float) -> np.ndarray:
    n = int(0.15 * SR)
    t = np.arange(n) / SR
    if kind == "kick":
        return amp * np.sin(2 * np.pi * (50 + 60 * np.exp(-t * 40)) * t) * np.exp(-t * 25)
    if kind == "snare":
        return amp * (0.7 * rng.standard_normal(n) + 0.3 * np.sin(2 * np.pi * 190 * t)) * np.exp(-t * 30)
    if kind == "tom":
        return amp * (np.sin(2 * np.pi * 140 * t) + 0.3 * rng.standard_normal(n)) * np.exp(-t * 18)
    hat = rng.standard_normal(n)
    hat = np.diff(hat, prepend=0.0)  # crude high-pass
    return amp * 0.5 * hat * np.exp(-t * 120)


def grid(bars: int, bpm: float = 120.0, per_bar: int = 4, start: float = 0.5):
    step = 60.0 / bpm
    beats = [round(start + i * step, 4) for i in range(bars * per_bar + 1)]
    return beats, beats[::per_bar]


def drum_track(path, *, bars=16, bpm=120.0, fill_bars=(), start=0.5, gain=1.0):
    """
    Rock groove: kick on 1 and 3, snare on 2 and 4, hi-hat on eighths. Each bar
    in `fill_bars` replaces beats 3–4 with sixteenth-note tom/snare hits.
    Returns (beats, downbeats).
    """
    step = 60.0 / bpm
    total = start + bars * 4 * step + 1.0
    y = np.zeros(int(total * SR))

    def place(t, sound):
        i = int(t * SR)
        seg = sound[: max(0, len(y) - i)]
        y[i:i + len(seg)] += seg

    for bar in range(bars):
        t0 = start + bar * 4 * step
        fill = bar in fill_bars
        for beat in range(4):
            tb = t0 + beat * step
            if fill and beat >= 2:
                for k in range(4):
                    place(tb + k * step / 4, _hit("tom" if k % 2 else "snare", 0.8))
                continue
            place(tb, _hit("kick" if beat % 2 == 0 else "snare", 0.9 if beat % 2 == 0 else 0.7))
            place(tb, _hit("hat", 0.25))
            place(tb + step / 2, _hit("hat", 0.25))
    y = gain * 0.5 * y / np.abs(y).max()
    sf.write(str(path), np.stack([y, y], 1).astype(np.float32), SR, subtype="FLOAT")
    return grid(bars, bpm, start=start)
