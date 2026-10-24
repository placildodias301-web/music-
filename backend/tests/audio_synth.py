"""Synthetic test audio for the preprocessing tests: music, speech-like, noise, silence. No samples, no models."""

import numpy as np
import soundfile as sf

SR = 44100
CHORDS = {"C": [48, 52, 55, 60], "G": [43, 55, 59, 62], "Am": [45, 57, 60, 64], "F": [41, 57, 60, 65]}


def _hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def music(seconds=12.0, sr=SR, seed=1):
    """Pad chords (C G Am F, 2 s each) over a kick/snare/hat groove at 120 BPM, peak 0.5."""
    rng = np.random.default_rng(seed)
    n = int(seconds * sr)
    t = np.arange(n) / sr
    y = np.zeros(n)
    names = list(CHORDS)
    for i in range(int(np.ceil(seconds / 2))):
        a, b = int(i * 2 * sr), min(n, int((i + 1) * 2 * sr))
        tt = t[a:b] - t[a]
        for m in CHORDS[names[i % 4]]:
            y[a:b] += sum(np.sin(2 * np.pi * _hz(m) * k * tt) / k for k in range(1, 5)) * (0.6 + 0.4 * np.exp(-tt))
    y /= np.abs(y).max()
    for beat in np.arange(0, seconds, 0.5):
        i = int(beat * sr)
        k = np.arange(min(int(0.12 * sr), n - i))
        hit = np.sin(2 * np.pi * 60 * k / sr) if int(beat * 2) % 2 == 0 else rng.standard_normal(len(k)) * 0.5
        y[i:i + len(k)] += 0.5 * hit * np.exp(-k / (0.03 * sr))
    return 0.5 * y / np.abs(y).max()


def speech(seconds=12.0, sr=SR, seed=2):
    """Speech-like: syllables (120-250 ms) of a gliding glottal buzz through vowel formants, with
    short gaps between syllables and longer pauses between phrases. Not music: no held pitch."""
    from scipy.signal import lfilter
    rng = np.random.default_rng(seed)
    out = np.zeros(int(seconds * sr))
    pos = int(0.2 * sr)
    vowels = [(730, 1090, 2440), (270, 2290, 3010), (300, 870, 2240), (530, 1840, 2480), (570, 840, 2410)]
    syllable = 0
    while pos < len(out) - sr // 4:
        dur = int(rng.uniform(0.12, 0.25) * sr)
        f0 = rng.uniform(100, 170) * np.linspace(1.0, rng.uniform(0.75, 1.35), dur)  # pitch glides
        phase = np.cumsum(f0 / sr)
        buzz = (np.diff(np.floor(phase), prepend=0) > 0).astype(float)
        for f in vowels[rng.integers(len(vowels))]:
            r = np.exp(-np.pi * 90 / sr)
            buzz = lfilter([1 - r], [1, -2 * r * np.cos(2 * np.pi * f / sr), r * r], buzz)
        env = np.sin(np.linspace(0, np.pi, dur)) ** 1.5
        seg = buzz * env
        out[pos:pos + dur] += seg[: len(out) - pos]
        syllable += 1
        pos += dur + int((rng.uniform(0.35, 0.6) if syllable % 4 == 0 else rng.uniform(0.04, 0.1)) * sr)
    return 0.5 * out / np.abs(out).max()


def stereo(y):
    return np.stack([y, y], axis=1).astype(np.float32)


def write(path, y, sr=SR, subtype="PCM_16"):
    sf.write(str(path), stereo(y) if y.ndim == 1 else y, sr, subtype=subtype)
    return str(path)
