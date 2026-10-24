"""
Key and difficulty for a pipeline result, so it carries the same summary as
a v2 analysis (the app's transpose, capo and chord spelling need the key).

The key uses the v2 engine's own code (services/analysis_engine.py: tuned CQT
chroma, Krumhansl-Kessler profiles plus a bonus for the tonic chord's share
of the song) on the no-vocals stem, with the pipeline's chord timeline in
place of v2's. analysis_engine.py itself is not changed, so v2 results stay
exactly as they were. Difficulty is services/difficulty.py, as in v2.

Neither can fail the job: without chords or pitched sound the key is None,
with a warning.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from services import analysis_engine as v2
from services.difficulty import rate_difficulty

logger = logging.getLogger(__name__)

NO_KEY = "The key could not be estimated (no chords or pitched sound were found)."
KEY_FAILED = "Key estimation failed; the key is not shown."


@dataclass
class KeyResult:
    key: Optional[str] = None
    mode: Optional[str] = None
    scale: Optional[str] = None
    key_confidence: Optional[float] = None
    key_alternatives: list[dict] = field(default_factory=list)
    difficulty: Optional[dict] = None
    warnings: list[str] = field(default_factory=list)


def chord_symbols(chords: list[dict]) -> list[str]:
    """The app symbols of the real chords, one per span (what v2 calls chordProgression)."""
    return [c["simple"] for c in chords if c["type"] != "no_chord" and c.get("simple") not in (None, "N")]


def _key_from_audio(stem_path: str, chords: list[dict]) -> Optional[dict]:
    import librosa

    y, sr = librosa.load(stem_path, sr=v2.ANALYSIS_SR, mono=True)
    if y.size == 0 or float(np.max(np.abs(y))) < 1e-4:
        return None
    y_harm, _ = librosa.effects.hpss(y, kernel_size=v2.HPSS_KERNEL, n_fft=v2.HPSS_N_FFT, hop_length=v2.HOP)
    chroma, _bass, loudness = v2._chroma_features(y_harm, sr)
    voiced = v2._voiced_frames(loudness)
    if not np.any(voiced):
        return None
    timeline = [{"chord": c["simple"], "start": c["start"], "end": c["end"]}
                for c in chords if c["type"] != "no_chord" and c.get("simple") not in (None, "N")]
    key = v2._key_result(chroma, voiced, timeline)
    key.pop("_tonic", None)
    key.pop("_marginConfidence", None)
    return key


def estimate_key_and_difficulty(stem_path: str, *, chords: list[dict], bpm: Optional[float],
                                duration: float) -> KeyResult:
    symbols = chord_symbols(chords)
    if not symbols:
        return KeyResult(warnings=[NO_KEY])
    try:
        key = _key_from_audio(stem_path, chords)
    except Exception:
        logger.exception("Pipeline key estimation failed")
        return KeyResult(warnings=[KEY_FAILED])
    if key is None:
        return KeyResult(warnings=[NO_KEY])
    difficulty = rate_difficulty(chord_progression=symbols, bpm=float(bpm or 0.0), duration_seconds=duration,
                                 key=key["key"])
    return KeyResult(key=key["key"], mode=key["mode"], scale=key["scale"], key_confidence=key["keyConfidence"],
                     key_alternatives=key["keyAlternatives"], difficulty=difficulty)
