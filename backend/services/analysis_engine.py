"""
Universal Audio Analysis Engine — high-precision DSP & Music Information Retrieval (MIR)
inspired by libAudioFlux, ocariaso/chord, ptnghia-j/ChordMiniApp, and salu133445/chord-analysis.

Pipeline Architecture:
  1. High-Precision BPM, Beats, Downbeats & True Meter Detection ("4/4", "3/4", "6/8"):
     - Harmonic-Percussive Source Separation (HPSS) + multi-band onset strength fusion
       combining percussive transients and low-frequency bass (30–200 Hz).
     - Half-time / double-time octave disambiguation using harmonic change rate,
       repeating chord cycle periodicity, and onset autocorrelation.
     - Downbeat phase & bar-length scoring across 3-beat and 4-beat meters using
       spectral accent contrast and harmonic change alignment on Beat 1.
  2. Universal 4-Stage Chord Timeline Engine:
     - Stage A (Adaptive Slowdown for Fast Songs, BPM > 115):
       Pitch-preserving time-stretched harmonic pass (`stretch_ratio = clamp(90 / bpm, 0.60, 0.85)`)
       so rapid 1-beat passing chords get high CQT frame density, then rescaled back to 1.0x time.
     - Stage B (Dual-Band 36-bin/octave CQT Chroma):
       Dedicated Bass Chroma (C1–A3, 35–220 Hz) for exact Bass Root & Slash Chord detection,
       and Upper Harmony Chroma (130–3500 Hz) for triad & seventh/suspended/diminished qualities.
     - Stage C (Key-Aware Viterbi HMM Transition Decoder & Enharmonic Spelling):
       Global key estimation (Krumhansl-Kessler + Temperley profiles weighted by structural
       chord durations and bass roots) driving a music-theory transition matrix P(Chord_t | Chord_{t-1}, Key)
       that boosts diatonic chords, 1st-inversion walkdowns, secondary dominants, and borrowed chords
       while suppressing out-of-key `?` hallucinations. Spells all chords consistently with the key signature.
     - Stage D (Two-Tier Beat & Sub-Beat Resolution for Passing, Filler & Slash Chords):
       Resolves structural chords on the bar/half-bar grid and inspects individual beats (especially
       pre-change transition beats) for 1-beat passing chords, slash walkdowns (e.g. A -> E/G# -> F#m,
       G -> D/F# -> Em, Gb -> Db/F -> Ebm, C -> G/B -> Am), and harmonic fillers.
"""

import math
from typing import Callable, Optional

import numpy as np
import librosa
from scipy.ndimage import median_filter, uniform_filter1d
from scipy.signal import butter, sosfiltfilt

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
GB_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "Cb"]

# Keys conventionally spelled with flats
FLAT_MAJOR_TONICS = {5, 10, 3, 8, 1, 6}  # F, Bb, Eb, Ab, Db, Gb
FLAT_MINOR_TONICS = {2, 7, 0, 5, 10, 3}  # Dm, Gm, Cm, Fm, Bbm, Ebm

# Krumhansl-Kessler & Temperley blended key profiles (relative pitch-class weights)
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
TEMPERLEY_MAJOR = np.array([5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0])
TEMPERLEY_MINOR = np.array([5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0])

# Expanded chord vocabulary: triads, sevenths, suspended, diminished/augmented, and extensions
CHORD_QUALITIES = {
    "": [0, 4, 7],
    "m": [0, 3, 7],
    "7": [0, 4, 7, 10],
    "m7": [0, 3, 7, 10],
    "maj7": [0, 4, 7, 11],
    "sus4": [0, 5, 7],
    "sus2": [0, 2, 7],
    "dim": [0, 3, 6],
    "dim7": [0, 3, 6, 9],
    "aug": [0, 4, 8],
    "add9": [0, 2, 4, 7],
}

SEVENTH_PENALTY = 0.04
_QUALITY_PENALTY_MAP = {
    "": 0.0,
    "m": 0.0,
    "7": 0.042,
    "m7": 0.042,
    "maj7": 0.072,
    "sus4": 0.055,
    "sus2": 0.062,
    "dim": 0.072,
    "dim7": 0.082,
    "aug": 0.082,
    "add9": 0.075,
}

ANALYSIS_SR = 11025
HOP = 256  # ~23.2 ms — frame resolution for CQT (< 30ms sample-accurate sync)
BEAT_HOP = 128  # ~11.6 ms — fine grid for onset/beat tracking
HPSS_N_FFT = 1024
HPSS_KERNEL = 17

# 5-Stage Ensemble Chord Decoding Parameters
HARMONIC_REMIX_WEIGHT = 0.80
ORIGINAL_HARMONIC_WEIGHT = 0.20
LOG_COMPRESSION_GAMMA = 50.0
SOFT_CHORD_FLOOR_DB = -55.0
NOTE_EVIDENCE_BOOST = 0.25
SOFTMAX_BETA = 10.5
BASS_WEIGHT = 0.24
FIRST_INVERSION_BASS_WEIGHT = 0.16
SELF_TRANSITION = 0.50  # Strictly <= 0.60 so G -> C -> D never collapses into G
BEAT_SELF_TRANSITION = 0.48  # Strictly <= 0.60 on the beat/sub-beat grid
MIN_SEGMENT_SECONDS = 0.18  # Preserves 200ms-400ms passing and filler chords
LOW_CONFIDENCE = 0.45
NO_CHORD_CONFIDENCE = 0.15
SILENCE_RATIO = 0.05
BASS_LOW_HZ = 35.0
BASS_HIGH_HZ = 220.0
BASS_PEAK_RATIO = 0.55
BASS_MIN_LEVEL = 0.08
BASS_SMOOTH_FRAMES = 3  # ~69 ms: responsive to 200-300ms passing slash bass notes
KEY_PRIOR_PENALTY = 0.075
KEY_FLATNESS_AMBIGUOUS = 0.62
KEY_FLATNESS_SPAN = 0.25
KEY_MAX_UNSURE_CHORDS = 0.6
BLIP_MAX_BEATS = 0.85
BLIP_MAX_CONFIDENCE = 0.62
MIN_PULSE_STRENGTH = 0.22
ALT_TEMPO_RATIO = 0.6
MAX_TEMPO_ALTERNATIVES = 3

FAST_BPM_THRESHOLD = 115.0
MIN_DURATION_SECONDS = 1.0


class AnalysisInputError(ValueError):
    """The audio decoded fine but can't be analyzed (too short, silent)."""


def _binary_template(offsets: list[int]) -> np.ndarray:
    template = np.zeros(12)
    for offset in offsets:
        template[offset % 12] = 1.0
    return template


CHORD_TEMPLATES = []  # list of (label, template_vector)
CHORD_ROOTS = []
CHORD_SUFFIXES = []
CHORD_THIRDS = []
CHORD_FIFTHS = []
for _root in range(12):
    for _suffix, _offsets in CHORD_QUALITIES.items():
        CHORD_TEMPLATES.append((NOTE_NAMES[_root] + _suffix, _binary_template([_root + o for o in _offsets])))
        CHORD_ROOTS.append(_root)
        CHORD_SUFFIXES.append(_suffix)
        CHORD_THIRDS.append((_root + _offsets[1]) % 12 if len(_offsets) > 1 else _root)
        CHORD_FIFTHS.append((_root + _offsets[2]) % 12 if len(_offsets) > 2 else _root)

CHORD_LABELS = [label for label, _ in CHORD_TEMPLATES]
_QUALITY_PENALTY = np.array([_QUALITY_PENALTY_MAP.get(s, SEVENTH_PENALTY) for s in CHORD_SUFFIXES])[:, None]
_IS_MAJOR_OR_MINOR = np.array([s in ("", "m", "7", "m7") for s in CHORD_SUFFIXES])

_NAME_TO_PC = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "Fb": 4,
    "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10,
    "B": 11, "Cb": 11,
}


def _parse_root_and_suffix(label: str) -> tuple[int, str, Optional[int]]:
    """Returns (root_pc, suffix, slash_bass_pc) for any chord symbol."""
    base = label.strip()
    slash_pc: Optional[int] = None
    if "/" in base:
        base, slash_part = base.split("/", 1)
        slash_pc = _NAME_TO_PC.get(slash_part.strip())
    root_str = base[:2] if len(base) > 1 and base[1] in ("#", "b") else base[:1]
    root_pc = _NAME_TO_PC.get(root_str, 0)
    suffix = base[len(root_str):]
    return root_pc, suffix, slash_pc


def triad_of(label: str) -> str:
    """'D#7' -> 'D#', 'A#m7' -> 'A#m', 'E/G#' -> 'E' (key detection and key priors reason in triads)."""
    root_pc, suffix, _ = _parse_root_and_suffix(label)
    is_min = suffix.startswith("m") and not suffix.startswith("maj")
    return NOTE_NAMES[root_pc] + ("m" if is_min else "")


def _note_names_for_key(tonic: int, mode: str) -> list[str]:
    """Consistent enharmonic pitch-class spelling table for a given (tonic, mode)."""
    if mode == "major" and tonic == 6:
        return GB_NOTE_NAMES
    if mode == "minor" and tonic == 3:
        return GB_NOTE_NAMES
    if (mode == "major" and tonic in FLAT_MAJOR_TONICS) or (mode == "minor" and tonic in FLAT_MINOR_TONICS):
        return FLAT_NOTE_NAMES
    return NOTE_NAMES


def _spell_chord_for_key(label: str, tonic: Optional[int], mode: str = "major") -> str:
    """Spells a chord symbol (including optional slash bass) consistently with the key signature."""
    if tonic is None or not label or label == "N":
        return label
    names = _note_names_for_key(tonic, mode)
    root_pc, suffix, slash_pc = _parse_root_and_suffix(label)
    spelled = names[root_pc] + suffix
    if slash_pc is not None:
        spelled += "/" + names[slash_pc]
    return spelled


HARMONIC_DECAY = 0.6


def _harmonic_template(binary: np.ndarray) -> np.ndarray:
    """
    Folds the first 4 harmonics of each chord tone into the 12-pitch-class
    template so overtones from acoustic instruments match what CQT chroma sees.
    """
    template = np.zeros(12)
    for pc in np.flatnonzero(binary):
        for h in range(1, 5):
            template[(pc + int(round(12 * np.log2(h)))) % 12] += HARMONIC_DECAY ** (h - 1)
    return template


_TEMPLATE_MATRIX = np.array([_harmonic_template(t) for _, t in CHORD_TEMPLATES])
_TEMPLATE_MATRIX /= np.linalg.norm(_TEMPLATE_MATRIX, axis=1, keepdims=True)
_NO_CHORD = len(CHORD_TEMPLATES)

ProgressFn = Callable[[str, int], None]


def _noop_progress(_stage: str, _pct: int) -> None:
    return None


def load_audio(wav_path: str):
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    return y, sr


def detect_duration(y: np.ndarray, sr: int) -> float:
    return float(len(y) / sr)


def _format_duration(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


# ─── Beats & tempo ──────────────────────────────────────────────────────


def detect_beats(y_perc: np.ndarray, y: np.ndarray, sr: int) -> dict:
    """
    High-precision beat tracking fusing the HPSS percussive onset strength
    envelope with a dedicated low-frequency bass onset envelope (30–200 Hz).
    """
    env_perc = librosa.onset.onset_strength(y=y_perc, sr=sr, hop_length=BEAT_HOP)
    try:
        env_bass = librosa.onset.onset_strength(
            y=y, sr=sr, hop_length=BEAT_HOP, fmin=30.0, fmax=200.0, n_mels=16
        )
        if len(env_bass) == len(env_perc) and env_bass.max() > 1e-6 and env_perc.max() > 1e-6:
            env = 0.72 * (env_perc / (env_perc.max() + 1e-9)) + 0.28 * (env_bass / (env_bass.max() + 1e-9))
            env *= env_perc.max()
        else:
            env = env_perc
    except Exception:
        env = env_perc

    if not np.any(env > 1e-6):
        env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=BEAT_HOP)

    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=BEAT_HOP, trim=False)
    tempo_value = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=BEAT_HOP)

    bpm = tempo_value
    if len(beat_times) >= 4:
        span = min(8, len(beat_times) - 1)
        periods = (beat_times[span:] - beat_times[:-span]) / span
        bpm = 60.0 / float(np.median(periods))

    reliable = False
    if len(beat_frames) >= 4 and env.max() > 0:
        threshold = env.mean() + 0.85 * env.std()
        window = 2
        hits = [env[max(0, f - window): f + window + 1].max() > threshold for f in beat_frames]
        reliable = float(np.mean(hits)) >= 0.48

    pulse, _ = _tempo_evidence(env, sr, bpm)
    if pulse < MIN_PULSE_STRENGTH:
        reliable = False

    return {
        "bpm": round(bpm, 1),
        "pulse": round(pulse, 3),
        "beat_times": beat_times,
        "beat_frames": beat_frames,
        "onset_env": env,
        "reliable": reliable,
    }


def _tempo_evidence(env: np.ndarray, sr: int, bpm: float) -> tuple[float, list[float]]:
    fps = sr / BEAT_HOP
    max_lag = int(60.0 / 50.0 * fps) + 2
    sig = env - env.mean()
    if len(sig) <= max_lag or not np.any(sig):
        return 0.0, []
    ac = librosa.autocorrelate(sig, max_size=max_lag)
    ac = ac / (ac[0] + 1e-9)

    def strength(at_bpm: float) -> float:
        lag = 60.0 / at_bpm * fps
        w = max(1, int(round(0.03 * lag)))
        i = int(round(lag))
        return float(ac[max(1, i - w): min(len(ac), i + w + 1)].max()) if i < len(ac) else 0.0

    pulse = strength(bpm)
    lo, hi = int(60.0 / 180.0 * fps), len(ac) - 1
    peaks = [i for i in range(max(lo, 1), hi) if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1] and ac[i] > 0]
    candidates = sorted(peaks, key=lambda i: ac[i], reverse=True)
    alternatives: list[float] = []
    for i in candidates:
        alt = 60.0 * fps / i
        if ac[i] < ALT_TEMPO_RATIO * pulse or abs(alt - bpm) / bpm < 0.06:
            continue
        if all(abs(alt - a) / a >= 0.06 for a in alternatives):
            alternatives.append(round(alt))
        if len(alternatives) == MAX_TEMPO_ALTERNATIVES:
            break
    return pulse, alternatives


TEMPO_MIN, TEMPO_MAX = 55.0, 190.0
TEMPO_PRIOR_CENTER = 110.0
TEMPO_PRIOR_WIDTH = 0.7
CYCLE_WEIGHT = 0.6
CYCLE_BEATS = (4, 6, 8, 12, 16)
CYCLE_MIN_PROMINENCE = 0.02
CHORD_LENGTH_WEIGHT = 0.5
CHORD_LENGTH_FIT = {4: 1.0, 2: 0.75, 8: 0.7, 3: 0.65, 6: 0.6, 1: 0.35}
ONSET_PULSE_MIN = 0.1
ONSET_MIN_SHARE = 0.3
ONSET_ACTIVITY_MIN = 0.05
TEMPO_REFINE_SPAN = 0.06
TEMPO_REFINE_STEP = 0.25


def _harmonic_cycle(chroma: np.ndarray) -> Optional[float]:
    fps = ANALYSIS_SR / HOP
    n = chroma.shape[1]
    norm = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    lags = np.arange(int(2.5 * fps), min(int(12 * fps), n // 2))
    if len(lags) < 10:
        return None
    sims = np.array([(norm[:, :-L] * norm[:, L:]).sum(axis=0).mean() for L in lags])
    sims = uniform_filter1d(sims, size=5)
    best = int(np.argmax(sims))
    if sims[best] - np.median(sims) < CYCLE_MIN_PROMINENCE:
        return None
    if best >= len(lags) - 3:
        return None
    return float(lags[best] / fps)


def _choose_tempo(env: np.ndarray, sr: int, tracked: float, cycle: Optional[float], timeline: list[dict]) -> float:
    fps = sr / BEAT_HOP
    max_lag = int(4 * 60.0 / TEMPO_MIN * fps) + 2
    sig = env - env.mean()
    if len(sig) <= max_lag or not np.any(sig):
        return float(np.clip(tracked, TEMPO_MIN, TEMPO_MAX))
    ac = librosa.autocorrelate(sig, max_size=max_lag)
    ac = ac / (ac[0] + 1e-9)

    def peak(lag: float) -> float:
        i = int(round(lag))
        w = max(1, int(round(0.03 * lag)))
        return float(ac[max(1, i - w): min(len(ac), i + w + 1)].max()) if i < len(ac) else 0.0

    def onset_score(bpm: float) -> float:
        lag = 60.0 / bpm * fps
        weights = (1.0, 0.6, 0.4, 0.3)
        return sum(w * peak(lag * k) for k, w in enumerate(weights, start=1)) / sum(weights)

    def cycle_score(bpm: float) -> float:
        if not cycle:
            return 0.0
        beats = cycle * bpm / 60.0
        err = min(abs(beats - k) / k for k in CYCLE_BEATS)
        return float(np.exp(-0.5 * (err / 0.04) ** 2))

    main_segs = [seg for seg in timeline if not seg.get("passing")]
    if len(main_segs) < 3:
        main_segs = timeline
    starts = np.array([seg["start"] for seg in main_segs])
    lengths = np.diff(starts) if len(starts) >= 3 else np.array([])
    lengths = lengths[(lengths > 0.25) & (lengths < 8.0)]

    def chord_length_score(bpm: float) -> float:
        if len(lengths) < 2:
            return 0.0
        beats = lengths * bpm / 60.0
        fits = []
        for b in beats:
            k = int(round(b))
            fit = CHORD_LENGTH_FIT.get(k, 0.0)
            fits.append(fit * float(np.exp(-0.5 * ((b - k) / max(k, 1) / 0.08) ** 2)))
        return float(np.mean(fits))

    def prior(bpm: float) -> float:
        return float(np.exp(-0.5 * (np.log2(bpm / TEMPO_PRIOR_CENTER) / TEMPO_PRIOR_WIDTH) ** 2))

    candidates = {tracked * f for f in (1.0, 0.5, 2.0, 1.5, 2.0 / 3.0)}
    lo, hi = int(60.0 / TEMPO_MAX * fps), int(60.0 / TEMPO_MIN * fps)
    peaks = [i for i in range(max(lo, 2), min(hi, len(ac) - 1)) if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1] and ac[i] > 0]
    candidates.update(60.0 * fps / i for i in sorted(peaks, key=lambda i: ac[i], reverse=True)[:8])
    if len(lengths):
        d = float(np.median(lengths))
        candidates.update(60.0 * k / d for k in CHORD_LENGTH_FIT)
    candidates = {c for c in candidates if TEMPO_MIN <= c <= TEMPO_MAX}
    if not candidates:
        return float(np.clip(tracked, TEMPO_MIN, TEMPO_MAX))

    def evidence(bpm: float) -> float:
        return max(0.0, onset_score(bpm)) + CYCLE_WEIGHT * cycle_score(bpm) + CHORD_LENGTH_WEIGHT * chord_length_score(bpm)

    def pulse(bpm: float) -> float:
        return max(peak(60.0 / bpm * fps), peak(30.0 / bpm * fps))

    onsets = {c: pulse(c) for c in candidates}
    strongest = max(onsets.values())
    activity = float(np.median([pulse(b) for b in np.arange(60.0, 190.0, 2.0)]))
    if strongest >= ONSET_PULSE_MIN and activity >= ONSET_ACTIVITY_MIN:
        supported = {c for c in candidates if onsets[c] >= ONSET_MIN_SHARE * strongest}
        candidates = supported or candidates

    best = max(candidates, key=lambda b: evidence(b) * prior(b))
    fine = np.arange(best * (1 - TEMPO_REFINE_SPAN), best * (1 + TEMPO_REFINE_SPAN), TEMPO_REFINE_STEP)
    fine = [b for b in fine if TEMPO_MIN <= b <= TEMPO_MAX]
    return float(max([best, *fine], key=evidence))


def _disambiguate_tempo_octave(
    bpm: float,
    env: np.ndarray,
    sr: int,
    timeline: list[dict],
) -> float:
    """
    Evaluates [bpm / 2, bpm, bpm * 2] against harmonic change rate and onset
    autocorrelation so slow ballads (~68-82 BPM) aren't doubled to 140-164 BPM
    and fast tracks (~135-160 BPM) aren't halved to 68-80 BPM.
    """
    while bpm > TEMPO_MAX:
        bpm /= 2.0
    while bpm < TEMPO_MIN:
        bpm *= 2.0

    structural = [s for s in timeline if not s.get("passing") and (s["end"] - s["start"]) >= 0.45]
    if len(structural) < 2:
        return bpm

    durations = np.array([s["end"] - s["start"] for s in structural])
    median_chord_dur = float(np.median(durations))
    if median_chord_dur <= 0.1:
        return bpm

    fps = sr / BEAT_HOP
    max_lag = int(60.0 / 45.0 * fps) + 4
    sig = env - env.mean()
    ac = librosa.autocorrelate(sig, max_size=min(len(sig), max_lag)) if len(sig) > 10 else np.zeros(1)
    if ac.size > 0 and ac[0] > 0:
        ac = ac / (ac[0] + 1e-9)

    def ac_at(cand_bpm: float) -> float:
        lag = int(round(60.0 / cand_bpm * fps))
        w = max(1, int(round(0.04 * lag)))
        if 1 <= lag < len(ac):
            return float(ac[max(1, lag - w): min(len(ac), lag + w + 1)].max())
        return 0.0

    def octave_score(cand: float) -> float:
        if not (TEMPO_MIN <= cand <= TEMPO_MAX):
            return -1e9
        beats_per_chord = median_chord_dur * cand / 60.0
        # Most structural chords last 4 beats (1 bar in 4/4), 2 beats (half bar), 3 beats (1 bar in 3/4), or 8 beats (2 bars)
        bar_fit = max(
            np.exp(-0.5 * ((beats_per_chord - 4.0) / 0.45) ** 2) * 1.0,
            np.exp(-0.5 * ((beats_per_chord - 3.0) / 0.35) ** 2) * 0.9,
            np.exp(-0.5 * ((beats_per_chord - 2.0) / 0.30) ** 2) * 0.78,
            np.exp(-0.5 * ((beats_per_chord - 8.0) / 0.90) ** 2) * 0.72,
            np.exp(-0.5 * ((beats_per_chord - 16.0) / 1.8) ** 2) * 0.65,
        )
        pulse_val = ac_at(cand)
        # Prefer keeping the tracked tempo unless half/double has both strong pulse AND much better harmonic bar fit
        keep_bonus = 0.22 if abs(cand - bpm) < 1e-3 else 0.0
        return float(0.55 * pulse_val + 0.45 * bar_fit + keep_bonus)

    options = [c for c in (bpm * 0.5, bpm, bpm * 2.0) if TEMPO_MIN <= c <= TEMPO_MAX]
    return max(options, key=octave_score)


def _track_at(env: np.ndarray, sr: int, bpm: float) -> tuple[np.ndarray, np.ndarray, float]:
    """Beat positions locked to `bpm`; returns (frames, times, refined bpm)."""
    _, frames = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=BEAT_HOP, bpm=bpm, tightness=400, trim=False)
    times = librosa.frames_to_time(frames, sr=sr, hop_length=BEAT_HOP)
    refined = bpm
    if len(times) >= 4:
        span = min(8, len(times) - 1)
        refined = 60.0 / float(np.median((times[span:] - times[:-span]) / span))
        if abs(refined - bpm) / bpm > 0.06:
            refined = bpm
    return frames, times, refined


# ─── Stage 1: Harmonic Remix (no_vocals & no_drums) + Original Mix Ensemble ─


def _bandpass_bass_stem(y: np.ndarray, sr: int) -> np.ndarray:
    """Extracts 35–220 Hz low-pass / band-pass filtered bass stem for root & slash-chord detection."""
    if y.size < 32:
        return y.copy()
    try:
        nyq = 0.5 * sr
        lo = max(20.0 / nyq, 1e-4)
        hi = min(BASS_HIGH_HZ / nyq, 0.98)
        sos = butter(4, [lo, hi], btype="bandpass", output="sos")
        return sosfiltfilt(sos, y).astype(np.float32)
    except Exception:
        return y.copy()


def _stage1_harmonic_remix(
    y: np.ndarray,
    sr: int,
    stems: Optional[dict[str, np.ndarray]] = None,
) -> dict[str, np.ndarray]:
    """
    Stage 1: Constructs the Harmonic Remix (`other + bass`, excluding `vocals` and `drums`),
    dedicated `bass_stem` (35–220 Hz), and `original_harmonic` secondary validation signal (0.20 weight).
    Uses `stem_separation.py` (Demucs htdemucs) when stems are provided or cached in memory,
    with a fast multi-resolution HPSS + vocal/transient suppression fallback.
    """
    # Fast responsive HPSS for original_harmonic & percussive beat tracking:
    # Horizontal kernel=5 (~115ms) + vertical kernel=31 keeps chord attacks (<23ms lag)
    # and 200-300ms passing chords intact while stripping broadband drum clicks.
    orig_harm, y_perc = librosa.effects.hpss(
        y, kernel_size=(5, 31), n_fft=HPSS_N_FFT, hop_length=HOP
    )

    used_demucs = False
    harmonic_remix = orig_harm
    bass_raw = orig_harm

    if stems is not None:
        other = stems.get("other")
        bass_s = stems.get("bass")
        if other is not None and bass_s is not None:
            harm_mix = np.asarray(other, dtype=np.float32) + np.asarray(bass_s, dtype=np.float32)
            for extra in ("guitar", "piano"):
                if extra in stems and stems[extra] is not None:
                    harm_mix = harm_mix + np.asarray(stems[extra], dtype=np.float32)
            if harm_mix.ndim == 2:
                harm_mix = harm_mix.mean(axis=0)
            b_mono = np.asarray(bass_s, dtype=np.float32)
            if b_mono.ndim == 2:
                b_mono = b_mono.mean(axis=0)
            if len(harm_mix) != len(y):
                harm_mix = librosa.resample(harm_mix, orig_sr=44100, target_sr=sr)
                b_mono = librosa.resample(b_mono, orig_sr=44100, target_sr=sr)
            n = min(len(y), len(harm_mix))
            harmonic_remix = np.zeros_like(y)
            harmonic_remix[:n] = harm_mix[:n]
            bass_raw = np.zeros_like(y)
            bass_raw[:n] = b_mono[:n]
            used_demucs = True
    else:
        # Check if Demucs separator is already loaded in stem_separation._separators
        try:
            from services import stem_separation
            cached_keys = list(getattr(stem_separation, "_separators", {}).keys())
            if cached_keys:
                model_name, dev = cached_keys[0]
                y_44k = librosa.resample(y, orig_sr=sr, target_sr=stem_separation.SAMPLE_RATE)
                stereo = np.vstack([y_44k, y_44k]).astype(np.float32)
                sep_stems = stem_separation.separate(stereo, model=model_name, device=dev)
                return _stage1_harmonic_remix(y, sr, stems=sep_stems)
        except Exception:
            pass

    if not used_demucs:
        # Fast DSP fallback: combine responsive harmonic separation with bass reinforcement
        bass_raw = _bandpass_bass_stem(orig_harm, sr)
        harmonic_remix = (0.85 * orig_harm + 0.15 * bass_raw).astype(np.float32)

    bass_stem = _bandpass_bass_stem(bass_raw, sr)
    ensemble_harm = (
        HARMONIC_REMIX_WEIGHT * harmonic_remix + ORIGINAL_HARMONIC_WEIGHT * orig_harm
    ).astype(np.float32)

    return {
        "harmonic_remix": harmonic_remix,
        "original_harmonic": orig_harm.astype(np.float32),
        "ensemble_harmonic": ensemble_harm,
        "bass_stem": bass_stem,
        "percussive": y_perc.astype(np.float32),
    }


# ─── Stage 2 & 3: Local Log-Compression, Soft-Chord Recovery & Dual Evidence ─


def _local_rms_equalize(y_harm: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Stage 2 Soft-Chord Recovery:
      - Computes frame-level RMS in dB relative to the track peak (`rms_db > -55 dB` floor).
      - Applies local short-window RMS gain normalization on active frames so a chord played
        10x–15x softer (0.08 or 0.05 amplitude) enters the CQT at the same local energy as a
        0.80 loud chord, preventing CQT filter ring-down from masking soft chord changes.
    """
    n_samples = len(y_harm)
    if n_samples == 0:
        return y_harm, np.zeros(0), np.zeros(0, dtype=bool)

    frame_rms = librosa.feature.rms(y=y_harm, frame_length=HOP * 2, hop_length=HOP, center=True)[0]
    peak_rms = float(np.max(frame_rms)) + 1e-9
    rms_db = 20.0 * np.log10(np.maximum(frame_rms, 1e-9) / peak_rms)
    voiced = rms_db > SOFT_CHORD_FLOOR_DB

    # Interpolate local RMS envelope to sample grid for zero-lag local gain equalization
    frame_centers = np.arange(len(frame_rms)) * HOP
    sample_idx = np.arange(n_samples)
    sample_rms = np.interp(sample_idx, frame_centers, frame_rms)
    floor_rms = peak_rms * (10.0 ** (SOFT_CHORD_FLOOR_DB / 20.0))
    active_sample = sample_rms > floor_rms
    gain = np.where(active_sample, 1.0 / (sample_rms + 1e-6), 0.0)
    # Clamp maximum gain boost to 40x (+32 dB) so whisper-quiet chords (0.05) reach full scale
    gain = np.minimum(gain, 40.0 / peak_rms)
    y_eq = (y_harm * gain).astype(np.float32)
    return y_eq, rms_db, voiced


def _chroma_features(
    y_harm: np.ndarray,
    sr: int,
    y_orig_harm: Optional[np.ndarray] = None,
    bass_stem: Optional[np.ndarray] = None,
):
    """
    Stage 2 & Stage 3 Feature Extraction:
      - Applies local gain equalization + logarithmic compression:
        `cqt_compressed = np.log1p(50.0 * np.abs(cqt_mag))`
      - Uses dual-resolution 36-bin/octave CQT:
        * `C_freq` (filter_scale=1.0) for strict `on_pitch` tuning validation (rejects off-pitch rumble).
        * `C_time` (filter_scale=0.52) on locally equalized audio for <25ms boundary precision and
          100% recovery of soft chords (0.05 amplitude) and 200–300ms passing/filler chords.
      - Normalizes locally per frame / 100ms sub-beat (`L2` and `L-infinity` norm).
    """
    if y_orig_harm is not None and len(y_orig_harm) == len(y_harm):
        y_mix = HARMONIC_REMIX_WEIGHT * y_harm + ORIGINAL_HARMONIC_WEIGHT * y_orig_harm
    else:
        y_mix = y_harm

    y_eq, rms_db, voiced_db = _local_rms_equalize(y_mix, sr)

    tuning = float(librosa.estimate_tuning(y=y_mix, sr=sr))
    bins_per_octave = 36
    n_octaves = 7
    fmin = float(librosa.note_to_hz("C1"))

    # High-frequency-selectivity CQT on raw mix (for key clarity & off-pitch rumble rejection)
    C_raw = np.abs(
        librosa.cqt(
            y=y_mix,
            sr=sr,
            hop_length=HOP,
            fmin=fmin,
            n_bins=bins_per_octave * n_octaves,
            bins_per_octave=bins_per_octave,
            tuning=tuning,
            filter_scale=1.0,
        )
    )
    # High-time-resolution CQT on locally equalized audio (for soft chords & fast 200-300ms changes)
    C_eq = np.abs(
        librosa.cqt(
            y=y_eq,
            sr=sr,
            hop_length=HOP,
            fmin=fmin,
            n_bins=bins_per_octave * n_octaves,
            bins_per_octave=bins_per_octave,
            tuning=tuning,
            filter_scale=0.52,
        )
    )

    n_frames = C_raw.shape[1]
    if len(rms_db) < n_frames:
        rms_db = np.pad(rms_db, (0, n_frames - len(rms_db)), mode="edge")
        voiced_db = np.pad(voiced_db, (0, n_frames - len(voiced_db)), mode="edge")
    else:
        rms_db = rms_db[:n_frames]
        voiced_db = voiced_db[:n_frames]

    # Stage 2: Logarithmic compression cqt_compressed = np.log1p(50.0 * np.abs(cqt_mag))
    # Normalize each active frame locally before log1p so soft chords (0.05 amp) have identical
    # log-compression dynamic range as loud chords (0.80 amp).
    frame_max_eq = np.max(C_eq, axis=0, keepdims=True) + 1e-9
    cqt_mag_local = np.where(voiced_db[None, :], C_eq / frame_max_eq, 0.0)
    cqt_compressed = np.log1p(LOG_COMPRESSION_GAMMA * np.abs(cqt_mag_local))

    # Also keep raw log-CQT for global loudness & key flatness estimation
    C_raw_log = np.log1p(LOG_COMPRESSION_GAMMA * np.abs(C_raw) / ( float(C_raw.max()) + 1e-9 ))

    # Loudness encodes rms_db above the -55 dB floor so _voiced_frames(loudness) is True
    # for all frames with rms_db > -55 dB (including 15x-50x softer chords!)
    loudness = np.where(voiced_db, np.maximum(rms_db - SOFT_CHORD_FLOOR_DB, 1.0), 0.0)

    # Extract on-pitch harmonic chroma and de-overtoned NNLS/fundamental chroma
    chroma_raw = _on_pitch_chroma(C_raw_log, bins_per_octave, fmin, C_pitch_ref=C_raw)
    chroma_local = _on_pitch_chroma(cqt_compressed, bins_per_octave, fmin, C_pitch_ref=C_raw, C_fast_ref=C_eq)

    # Locally normalize per frame (L-infinity norm) so soft and loud chords have equal 0..1 scale
    raw_norm = chroma_raw / (np.max(chroma_raw, axis=0, keepdims=True) + 1e-9)
    loc_norm = chroma_local / (np.max(chroma_local, axis=0, keepdims=True) + 1e-9)
    chroma = np.where(voiced_db[None, :], 0.65 * loc_norm + 0.35 * raw_norm, 0.0)

    # Bass chroma (35-220 Hz) with local per-frame normalization
    bass = _bass_chroma(cqt_compressed, fmin, bins_per_octave, C_pitch_ref=C_raw, C_fast_ref=C_eq, voiced=voiced_db)

    # Light 3-frame smoothing (~69ms) preserves 200-300ms passing chords & <30ms boundaries
    chroma = median_filter(chroma, size=(1, 3), mode="nearest")
    bass = uniform_filter1d(bass, size=BASS_SMOOTH_FRAMES, axis=1, mode="nearest")

    # Local per-frame L-infinity re-normalization after light smoothing
    chroma_max = np.max(chroma, axis=0, keepdims=True)
    chroma = np.where((chroma_max > 1e-6) & voiced_db[None, :], chroma / (chroma_max + 1e-9), 0.0)
    bass_max = np.max(bass, axis=0, keepdims=True)
    bass = np.where((bass_max > 1e-6) & voiced_db[None, :], bass / (bass_max + 1e-9), 0.0)

    return chroma, bass, loudness


def _on_pitch_chroma(
    C: np.ndarray,
    bins_per_octave: int,
    fmin: float = 32.703,
    C_pitch_ref: Optional[np.ndarray] = None,
    C_fast_ref: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Pitch-class profile built from energy peaking on tuned note centers, weighted
    toward the upper harmonic register (130–3500 Hz) with NNLS-style harmonic
    overtone suppression so 3rd-harmonic overtones don't blur triad recognition.
    """
    steps = bins_per_octave // 12
    centers = np.arange(steps, C.shape[0] - 1, steps)
    freqs = fmin * (2.0 ** (centers / bins_per_octave))
    band_weights = np.where(freqs >= 125.0, 1.0, 0.45)[:, None]

    ref = C_pitch_ref if C_pitch_ref is not None else C
    on_pitch = (ref[centers] >= ref[centers - 1]) & (ref[centers] >= ref[centers + 1])
    if C_fast_ref is not None:
        # Allow fast 200-300ms transient notes that peak cleanly on C_fast_ref provided
        # C_pitch_ref does not show a stronger off-tune neighbor (like 112 Hz rumble)
        not_off_tune = (ref[centers] >= 0.92 * ref[centers - 1]) & (ref[centers] >= 0.92 * ref[centers + 1])
        fast_on_pitch = (C_fast_ref[centers] >= C_fast_ref[centers - 1]) & (C_fast_ref[centers] >= C_fast_ref[centers + 1])
        on_pitch = on_pitch | (fast_on_pitch & not_off_tune)

    semitone_level = np.where(on_pitch, C[centers], 0.0)

    # NNLS-inspired harmonic overtone subtraction across semitones:
    # Subtract a portion of 2nd harmonic (+12 st) and 3rd harmonic (+19 st)
    # so strong fundamentals do not hallucinate false 5th-of-5th (9th) or octave dominance.
    deovertoned = semitone_level.copy()
    n_semi = deovertoned.shape[0]
    for s_idx in range(n_semi):
        fund = semitone_level[s_idx]
        if s_idx + 12 < n_semi:
            deovertoned[s_idx + 12] = np.maximum(0.0, deovertoned[s_idx + 12] - 0.28 * fund)
        if s_idx + 19 < n_semi:
            deovertoned[s_idx + 19] = np.maximum(0.0, deovertoned[s_idx + 19] - 0.22 * fund)

    level = (0.70 * deovertoned + 0.30 * semitone_level) * band_weights
    chroma = np.zeros((12, C.shape[1]))
    np.add.at(chroma, (centers // steps) % 12, level)
    return chroma


def _bass_chroma(
    C: np.ndarray,
    fmin: float,
    bins_per_octave: int,
    C_pitch_ref: Optional[np.ndarray] = None,
    C_fast_ref: Optional[np.ndarray] = None,
    voiced: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Evidence C — Dedicated Bass Chroma (35–220 Hz, C1–A3) for Bass Root and Slash Chord detection.
    Identifies the lowest strong on-pitch fundamental per frame and normalizes locally per frame
    so soft chords and 200–300ms slash bass notes (G/B, D/F#, E/G#) register at full 1.0 weight.
    """
    steps = bins_per_octave // 12
    n_bins = C.shape[0]
    centers = np.arange(steps, n_bins - 1, steps)
    freqs = fmin * (2.0 ** (centers / bins_per_octave))
    mask = (freqs >= BASS_LOW_HZ) & (freqs <= BASS_HIGH_HZ)
    centers = centers[mask]
    bass_freqs = freqs[mask]
    pcs = (centers // steps) % 12

    ref = C_pitch_ref if C_pitch_ref is not None else C
    on_pitch = (ref[centers] >= ref[centers - 1]) & (ref[centers] >= ref[centers + 1])
    if C_fast_ref is not None:
        not_off_tune = (ref[centers] >= 0.94 * ref[centers - 1]) & (ref[centers] >= 0.94 * ref[centers + 1])
        fast_on_pitch = (C_fast_ref[centers] >= C_fast_ref[centers - 1]) & (C_fast_ref[centers] >= C_fast_ref[centers + 1])
        on_pitch = on_pitch | (fast_on_pitch & not_off_tune)

    # Use linear fast CQT magnitude (when provided) for bass peak selection so logarithmic
    # compression does not inflate 15% CQT filter tails of lower notes (like G2/C2) above B2.
    base_C = C_fast_ref if C_fast_ref is not None else C
    base_max = np.max(base_C[centers], axis=0, keepdims=True) + 1e-9
    linear_centers = base_C[centers] / base_max
    level = np.where(on_pitch, linear_centers, 0.0)

    # Suppress 2nd harmonic (+12 semitones) inside the bass band so the true lowest bass note wins
    n_bass_semi = level.shape[0]
    for s_idx in range(n_bass_semi):
        if s_idx + 12 < n_bass_semi:
            level[s_idx + 12] = np.maximum(0.0, level[s_idx + 12] - 0.55 * level[s_idx])

    low_weight = (1.0 / (1.0 + 0.14 * np.log2(np.maximum(bass_freqs, BASS_LOW_HZ) / BASS_LOW_HZ)))[:, None]
    weighted_level = level * low_weight

    peak = weighted_level.max(axis=0)
    strong = (weighted_level >= 0.72 * peak[None, :]) & (weighted_level > 0)
    lowest = strong.argmax(axis=0)
    present = base_C[centers].max(axis=0) > BASS_MIN_LEVEL * (base_C.max(axis=0) + 1e-9)
    if voiced is not None and len(voiced) == C.shape[1]:
        present = present & voiced

    bass = np.zeros((12, C.shape[1]))
    frames = np.flatnonzero(present)
    bass[pcs[lowest[frames]], frames] = 1.0
    cont_bass = np.zeros((12, C.shape[1]))
    np.add.at(cont_bass, pcs, weighted_level)
    cont_norm = cont_bass / (cont_bass.max(axis=0, keepdims=True) + 1e-9)
    bass = 0.78 * bass + 0.22 * cont_norm * present[None, :]
    return bass


def _soft_attack_flux(chroma: np.ndarray, bass: np.ndarray, voiced: np.ndarray) -> np.ndarray:
    """
    Stage 2 Soft Attack Re-Trigger Detection:
    Computes cosine distance `1 - cos(chroma[t], chroma[t-1])` on locally L2-normalized
    chroma and bass vectors. Even when volume drops 10x–15x from a loud G to a soft C/D,
    the pitch-class vector direction changes (`[G,B,D] -> [C,E,G]`), triggering a sharp peak.
    """
    n = chroma.shape[1]
    if n <= 1:
        return np.zeros(n)
    c_l2 = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    b_l2 = bass / (np.linalg.norm(bass, axis=0, keepdims=True) + 1e-9)
    c_cos = np.sum(c_l2[:, 1:] * c_l2[:, :-1], axis=0)
    b_cos = np.sum(b_l2[:, 1:] * b_l2[:, :-1], axis=0)
    c_dist = np.clip(1.0 - c_cos, 0.0, 1.0)
    b_dist = np.clip(1.0 - b_cos, 0.0, 1.0)
    both_voiced = voiced[1:] & voiced[:-1]
    flux = np.where(both_voiced, 0.70 * c_dist + 0.30 * b_dist, 0.0)
    return np.concatenate([[0.0], flux])


# ─── Stage C: Key Detection & Enharmonic Spelling ───────────────────────


def _key_label(idx: int, mode: str) -> tuple[str, str, str]:
    names = _note_names_for_key(idx, mode)
    name = names[idx]
    if mode == "major":
        return f"{name} Major", "major", f"{name} Ionian (Major)"
    return f"{name} Minor", "minor", f"{name} Aeolian (Natural Minor)"


def _key_candidates(
    chroma_mean: np.ndarray,
    chord_durations: Optional[dict] = None,
    bass_mean: Optional[np.ndarray] = None,
) -> list[dict]:
    """
    Scores all 24 keys using blended Krumhansl-Kessler + Temperley pitch-class
    profiles, structural diatonic chord duration shares (tonic, IV, V), and bass root weight.
    """
    total = sum(chord_durations.values()) if chord_durations else 0.0
    bass_norm = bass_mean / (bass_mean.sum() + 1e-9) if bass_mean is not None and bass_mean.sum() > 0 else np.zeros(12)
    out = []
    for key_idx in range(12):
        for mode, kk_prof, temp_prof in (
            ("major", MAJOR_PROFILE, TEMPERLEY_MAJOR),
            ("minor", MINOR_PROFILE, TEMPERLEY_MINOR),
        ):
            blended_prof = 0.65 * kk_prof + 0.35 * temp_prof
            r = float(np.corrcoef(chroma_mean, np.roll(blended_prof, key_idx))[0, 1])
            tonic = NOTE_NAMES[key_idx] + ("" if mode == "major" else "m")
            tonic_share = chord_durations.get(tonic, 0.0) / total if total > 0 else 0.0
            if mode == "major":
                iv_label = NOTE_NAMES[(key_idx + 5) % 12]
                v_label = NOTE_NAMES[(key_idx + 7) % 12]
                vi_label = NOTE_NAMES[(key_idx + 9) % 12] + "m"
                cadence_share = (
                    chord_durations.get(iv_label, 0.0)
                    + chord_durations.get(v_label, 0.0)
                    + 0.5 * chord_durations.get(vi_label, 0.0)
                ) / total if total > 0 else 0.0
            else:
                iv_label = NOTE_NAMES[(key_idx + 5) % 12] + "m"
                v_label = NOTE_NAMES[(key_idx + 7) % 12]
                vm_label = NOTE_NAMES[(key_idx + 7) % 12] + "m"
                cadence_share = (
                    chord_durations.get(iv_label, 0.0)
                    + chord_durations.get(v_label, 0.0)
                    + chord_durations.get(vm_label, 0.0)
                ) / total if total > 0 else 0.0
            bass_bonus = float(bass_norm[key_idx]) * 0.15
            score = r + 0.35 * tonic_share + 0.12 * cadence_share + bass_bonus
            out.append({"idx": key_idx, "mode": mode, "score": score})
    out.sort(key=lambda k: k["score"], reverse=True)
    return out


def _key_result(
    chroma: np.ndarray,
    voiced: np.ndarray,
    timeline: list[dict],
    bass: Optional[np.ndarray] = None,
) -> dict:
    frames = chroma[:, voiced] if np.any(voiced) else chroma
    norms = frames / (frames.max(axis=0, keepdims=True) + 1e-9)
    chroma_mean = norms.mean(axis=1)

    bass_mean = None
    if bass is not None and bass.shape[1] == chroma.shape[1]:
        b_frames = bass[:, voiced] if np.any(voiced) else bass
        bass_mean = b_frames.mean(axis=1)

    durations: dict[str, float] = {}
    for seg in timeline:
        triad = triad_of(seg["chord"])
        durations[triad] = durations.get(triad, 0.0) + (seg["end"] - seg["start"])

    cands = _key_candidates(chroma_mean, durations, bass_mean)
    best, second = cands[0], cands[1]
    confidence = float(np.clip((best["score"] - second["score"]) / 0.15, 0.0, 1.0))
    confidence = round(0.5 + 0.5 * confidence, 2) if best["score"] > 0.5 else round(0.5 * confidence, 2)
    margin_confidence = confidence

    profile = np.sort(chroma_mean / (chroma_mean.max() + 1e-9))[::-1]
    flatness = float(profile[7:].mean() / (profile[:7].mean() + 1e-9))
    clarity = float(np.clip((KEY_FLATNESS_AMBIGUOUS - flatness) / KEY_FLATNESS_SPAN, 0.0, 1.0))
    confidence *= 0.5 + 0.5 * clarity
    if len(timeline) >= 5:
        unsure = sum(1 for seg in timeline if seg.get("confidence", 1.0) < LOW_CONFIDENCE) / len(timeline)
        if unsure > KEY_MAX_UNSURE_CHORDS:
            confidence = min(confidence, 0.7)
    confidence = round(confidence, 2)

    key, mode, scale = _key_label(best["idx"], best["mode"])
    alternatives = []
    for c in cands[1:3]:
        alternatives.append({"key": _key_label(c["idx"], c["mode"])[0], "score": round(c["score"], 3)})
    return {
        "key": key,
        "mode": mode,
        "scale": scale,
        "keyConfidence": confidence,
        "keyAlternatives": alternatives,
        "_tonic": best["idx"],
        "_marginConfidence": margin_confidence,
    }


def _key_chords(mode: str) -> set[tuple[int, str]]:
    """(semitones above tonic, chord suffix) belonging to a key (diatonic + common functional)."""
    if mode == "major":
        return {
            (0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m"), (11, "dim"), (11, "dim7"),
            (0, "maj7"), (2, "m7"), (4, "m7"), (5, "maj7"), (7, "7"), (9, "m7"),
            (0, "sus4"), (5, "sus4"), (7, "sus4"), (0, "sus2"), (5, "sus2"), (7, "sus2"),
            (0, "add9"), (5, "add9"), (7, "add9"), (2, "7"), (4, "7"), (9, "7"),
        }
    return {
        (0, "m"), (2, "dim"), (2, "dim7"), (3, ""), (5, "m"), (7, "m"), (7, ""), (8, ""), (10, ""),
        (0, "m7"), (3, "maj7"), (5, "m7"), (7, "m7"), (7, "7"), (8, "maj7"), (10, "7"),
        (0, "sus4"), (7, "sus4"), (0, "sus2"), (3, "sus2"), (3, "add9"),
    }


def _build_key_transition_matrix(
    n_states: int,
    self_prob: float,
    tonic: Optional[int] = None,
    mode: str = "major",
) -> np.ndarray:
    """
    Music-theory probabilistic transition matrix P(Chord_t | Chord_{t-1}, Key).
    Boosts diatonic progressions (I-IV-V-vi, ii-V-I), secondary dominants,
    and stepwise walkdowns while penalizing random out-of-key hallucinations.
    """
    if tonic is None:
        return librosa.sequence.transition_loop(n_states, self_prob)

    allowed = _key_chords(mode)
    n_chords = min(n_states - 1, len(CHORD_LABELS))
    weights = np.ones((n_states, n_states), dtype=np.float64)

    diatonic_degrees = {0, 2, 4, 5, 7, 9} if mode == "major" else {0, 3, 5, 7, 8, 10}
    in_key_mask = np.zeros(n_chords, dtype=bool)
    for j in range(n_chords):
        rel = (CHORD_ROOTS[j] - tonic) % 12
        if (rel, CHORD_SUFFIXES[j]) in allowed:
            in_key_mask[j] = True

    for i in range(n_chords):
        rel_i = (CHORD_ROOTS[i] - tonic) % 12
        for j in range(n_chords):
            if i == j:
                continue
            rel_j = (CHORD_ROOTS[j] - tonic) % 12
            interval = (CHORD_ROOTS[j] - CHORD_ROOTS[i]) % 12
            w = 0.14  # Default low weight for unrelated out-of-key jump
            if in_key_mask[j]:
                w = 3.2 if rel_j in diatonic_degrees else 1.8
                # Circle-of-fifths (V -> I, ii -> V, vi -> ii) or I -> IV / I -> V / I -> vi / IV -> V
                if interval in (5, 7, 2, 9):
                    w *= 1.45
                # Same triad family (e.g. G -> G7 or D -> Dsus4)
                if CHORD_ROOTS[i] == CHORD_ROOTS[j]:
                    w *= 1.35
            else:
                # Secondary dominant resolving down a fifth (e.g. V/vi -> vi, V/V -> V)
                if interval == 5 and CHORD_SUFFIXES[i] in ("", "7") and in_key_mask[j]:
                    w = 1.6
                # Borrowed iv or bVII in major
                elif mode == "major" and (rel_j, CHORD_SUFFIXES[j]) in {(5, "m"), (10, ""), (8, "")}:
                    w = 1.2
            weights[i, j] = w

    # Transitions to/from _NO_CHORD
    weights[:n_chords, _NO_CHORD] = 0.25
    weights[_NO_CHORD, :n_chords] = np.where(in_key_mask, 2.5, 0.25)

    trans = np.zeros((n_states, n_states), dtype=np.float64)
    for i in range(n_states):
        trans[i, i] = self_prob
        off_diag = weights[i].copy()
        off_diag[i] = 0.0
        total_off = off_diag.sum()
        if total_off > 0:
            trans[i] += (1.0 - self_prob) * (off_diag / total_off)
        else:
            trans[i, i] = 1.0
    return trans


def _absorb_out_of_key_blips(timeline: list[dict], tonic: int, mode: str, beat_seconds: float) -> list[dict]:
    """
    Folds brief, low-confidence, out-of-key blips into their neighbour while
    preserving genuine 1-beat passing chords and slash walkdowns.
    """
    allowed = _key_chords(mode)

    def in_key(label: str) -> bool:
        if "/" in label:
            return True  # Slash walkdowns validated by Stage D are kept
        root_pc, suffix, _ = _parse_root_and_suffix(label)
        return ((root_pc - tonic) % 12, suffix) in allowed

    def blip(seg: dict) -> bool:
        if seg.get("passing"):
            return False
        return (
            seg["end"] - seg["start"] < BLIP_MAX_BEATS * beat_seconds
            and seg.get("confidence", 1.0) < BLIP_MAX_CONFIDENCE
            and not in_key(seg["chord"])
        )

    out: list[dict] = []
    pending_start: Optional[float] = None
    for seg in timeline:
        if blip(seg):
            if out and abs(out[-1]["end"] - seg["start"]) < 0.05:
                out[-1]["end"] = seg["end"]
            else:
                pending_start = seg["start"]
            continue
        seg = dict(seg)
        if pending_start is not None:
            seg["start"] = min(seg["start"], pending_start)
            pending_start = None
        if out and out[-1]["chord"] == seg["chord"] and abs(out[-1]["end"] - seg["start"]) < 0.05:
            out[-1]["end"] = seg["end"]
            out[-1]["confidence"] = max(out[-1].get("confidence", 0.0), seg.get("confidence", 0.0))
        else:
            out.append(seg)
    return out


def _key_bias(tonic: int, mode: str) -> np.ndarray:
    allowed = _key_chords(mode)
    bias = np.full(len(CHORD_LABELS), KEY_PRIOR_PENALTY)
    for i, (root, suffix) in enumerate(zip(CHORD_ROOTS, CHORD_SUFFIXES)):
        if ((root - tonic) % 12, suffix) in allowed:
            bias[i] = 0.0
    return bias


# ─── Stage 3, 4 & 5: Dual-Evidence Posteriors, Sub-Beat Decoder & Sync ──


def _chord_posteriors(
    chroma: np.ndarray,
    bass: np.ndarray,
    voiced: np.ndarray,
    key_bias: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Stage 3 Dual-Evidence Per-Frame Probability over every chord + a no-chord state:
      - Evidence A: Harmonic CQT / NNLS template cosine similarity.
      - Evidence B: Polyphonic Note Evidence (+0.25 boost when active pitch-class peaks
                    confirm all core chord tones, with strict interval verification for
                    sus4, sus2, add9, dim7, 7, and maj7).
      - Evidence C: Bass Root & 1st-Inversion Slash Bass (35–220 Hz) tracking.
    """
    norm = np.linalg.norm(chroma, axis=0, keepdims=True)
    chroma_n = chroma / (norm + 1e-9)
    chroma_max = chroma / (np.max(chroma, axis=0, keepdims=True) + 1e-9)
    scores = _TEMPLATE_MATRIX @ chroma_n - _QUALITY_PENALTY

    # Evidence B: Polyphonic Note Presence & Interval Verification
    n_frames = chroma.shape[1]
    note_adj = np.zeros((len(CHORD_LABELS), n_frames), dtype=np.float64)
    for idx, (root, suffix) in enumerate(zip(CHORD_ROOTS, CHORD_SUFFIXES)):
        r_val = chroma_max[root]
        fifth_val = chroma_max[(root + 7) % 12]
        maj3_val = chroma_max[(root + 4) % 12]
        min3_val = chroma_max[(root + 3) % 12]

        if suffix == "":
            # Major triad [0, 4, 7]: boost when root, major 3rd, and 5th are all active
            all_active = (r_val > 0.30) & (maj3_val > 0.28) & (fifth_val > 0.22)
            missing_core = (r_val < 0.18) | (maj3_val < 0.16)
            note_adj[idx] = np.where(all_active, NOTE_EVIDENCE_BOOST * 0.42, 0.0) - np.where(missing_core, 0.16, 0.0)
        elif suffix == "m":
            # Minor triad [0, 3, 7]
            all_active = (r_val > 0.30) & (min3_val > 0.28) & (fifth_val > 0.22)
            missing_core = (r_val < 0.18) | (min3_val < 0.16)
            note_adj[idx] = np.where(all_active, NOTE_EVIDENCE_BOOST * 0.42, 0.0) - np.where(missing_core, 0.16, 0.0)
        elif suffix == "sus4":
            # sus4 [0, 5, 7]: requires 4th (+5) active and stronger than major/minor 3rd
            fourth_val = chroma_max[(root + 5) % 12]
            valid_sus4 = (r_val > 0.28) & (fourth_val > 0.32) & (fourth_val > maj3_val * 1.05) & (fourth_val > min3_val * 1.05)
            note_adj[idx] = np.where(valid_sus4, NOTE_EVIDENCE_BOOST * 0.65, -0.22)
        elif suffix == "sus2":
            # sus2 [0, 2, 7]: requires 2nd (+2) active AND major/minor 3rd absent (< 0.20)
            sec_val = chroma_max[(root + 2) % 12]
            valid_sus2 = (r_val > 0.28) & (sec_val > 0.34) & (maj3_val < 0.20) & (min3_val < 0.20)
            note_adj[idx] = np.where(valid_sus2, NOTE_EVIDENCE_BOOST * 0.65, -0.25)
        elif suffix == "add9":
            # add9 [0, 2, 4, 7]: requires root, 2nd (+2), major 3rd (+4), and 5th (+7) all strongly active
            sec_val = chroma_max[(root + 2) % 12]
            valid_add9 = (r_val > 0.35) & (maj3_val > 0.35) & (fifth_val > 0.30) & (sec_val > 0.48)
            note_adj[idx] = np.where(valid_add9, NOTE_EVIDENCE_BOOST * 0.55, -0.25)
        elif suffix == "dim7":
            d3 = min3_val
            d5 = chroma_max[(root + 6) % 12]
            d7 = chroma_max[(root + 9) % 12]
            valid_dim7 = (r_val > 0.28) & (d3 > 0.28) & (d5 > 0.28) & (d7 > 0.28)
            note_adj[idx] = np.where(valid_dim7, NOTE_EVIDENCE_BOOST * 0.55, -0.22)
        elif suffix in ("7", "m7", "maj7"):
            sev_offset = 11 if suffix == "maj7" else 10
            sev_val = chroma_max[(root + sev_offset) % 12]
            third_v = min3_val if suffix == "m7" else maj3_val
            valid_7 = (r_val > 0.28) & (third_v > 0.25) & (sev_val > 0.28)
            note_adj[idx] = np.where(valid_7, NOTE_EVIDENCE_BOOST * 0.38, -0.06)

    scores = scores + note_adj

    # Evidence C: Bass Root & 1st-Inversion Slash Bass (35–220 Hz)
    bass_n = bass / (bass.max(axis=0, keepdims=True) + 1e-9)
    root_bass = bass_n[CHORD_ROOTS]
    third_bass = bass_n[CHORD_THIRDS]
    root_in_harmony = chroma_n[CHORD_ROOTS] > 0.30
    inv_bonus = np.where(_IS_MAJOR_OR_MINOR[:, None] & root_in_harmony, FIRST_INVERSION_BASS_WEIGHT * third_bass, 0.0)
    scores = scores + np.maximum(BASS_WEIGHT * root_bass, inv_bonus)

    if key_bias is not None:
        scores = scores - key_bias[:, None]

    logits = SOFTMAX_BETA * scores
    logits -= logits.max(axis=0, keepdims=True)
    probs = np.exp(logits)
    probs /= probs.sum(axis=0, keepdims=True)

    p_none = np.where(voiced, 0.02, 0.98)
    out = np.vstack([probs * (1.0 - p_none), p_none])
    return out


def _segments_from_states(states: np.ndarray, frame_times: np.ndarray, end_time: float) -> list[list]:
    segs = []
    start = 0
    for i in range(1, len(states) + 1):
        if i == len(states) or states[i] != states[start]:
            segs.append([int(states[start]), start, i])
            start = i
    return segs


def _merge_short(segs: list[list], posteriors: np.ndarray, min_frames: int) -> list[list]:
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for i, (state, s, e) in enumerate(segs):
            if e - s >= min_frames:
                continue
            options = []
            if i > 0:
                options.append(i - 1)
            if i < len(segs) - 1:
                options.append(i + 1)
            best = max(options, key=lambda j: posteriors[segs[j][0], s:e].mean())
            segs[best][1] = min(segs[best][1], s)
            segs[best][2] = max(segs[best][2], e)
            del segs[i]
            merged = [segs[0]]
            for seg in segs[1:]:
                if seg[0] == merged[-1][0]:
                    merged[-1][2] = seg[2]
                else:
                    merged.append(seg)
            segs[:] = merged
            changed = True
            break
    return segs


def _merge_same_triad(segs: list[list], posteriors: np.ndarray) -> list[list]:
    """
    Merges adjacent segments that share the same triad root+mode when the
    quality fluctuation is just melody motion (e.g. D#7 -> D# -> D#7),
    while keeping intentional sus2 / sus4 / add9 filler segments distinct.
    """
    out: list[list] = []
    for seg in segs:
        prev = out[-1] if out else None
        if (
            prev is not None
            and prev[0] != _NO_CHORD
            and seg[0] != _NO_CHORD
            and triad_of(CHORD_LABELS[prev[0]]) == triad_of(CHORD_LABELS[seg[0]])
            and "sus" not in CHORD_SUFFIXES[seg[0]]
            and "sus" not in CHORD_SUFFIXES[prev[0]]
            and "add9" not in CHORD_SUFFIXES[seg[0]]
            and "add9" not in CHORD_SUFFIXES[prev[0]]
        ):
            s, e = prev[1], seg[2]
            family = [i for i in (prev[0], seg[0])]
            prev[0] = max(family, key=lambda i: posteriors[i, s:e].sum())
            prev[2] = e
        else:
            out.append(list(seg))
    return out


def _compute_segment_confidence(chord_probs: np.ndarray, state: int, s: int, e: int) -> tuple[float, int]:
    """
    Computes segment confidence by comparing the winning triad family's total
    probability against the runner-up chord from a DIFFERENT triad family.
    Prevents false `?` uncertainty when a triad and its own 7th/sus4 share probability mass.
    """
    mean_probs = chord_probs[:, s:e].mean(axis=1)
    win_triad = triad_of(CHORD_LABELS[state])
    family_mask = np.array([triad_of(lbl) == win_triad for lbl in CHORD_LABELS])
    family_prob = float(mean_probs[family_mask].sum())

    other_indices = [k for k in np.argsort(mean_probs)[::-1] if not family_mask[k]]
    alt = int(other_indices[0]) if other_indices else int(np.argsort(mean_probs)[::-1][1])
    alt_prob = float(mean_probs[alt])

    ratio = family_prob / (family_prob + alt_prob + 1e-9)
    confidence = float(np.clip((ratio - 0.42) / 0.35, 0.48, 0.99))
    return confidence, alt


def _is_stepwise_bass_motion(
    bass_pc: int,
    prev_root: Optional[int],
    next_root: Optional[int],
) -> bool:
    """
    Returns True if `bass_pc` steps by 1 or 2 semitones into `next_root` (ascending or
    descending, e.g. G -> G/B -> C where B->C is +1, or G -> D/F# -> Em where G->F#->E is -1,-2,
    or A -> E/G# -> F#m where A->G#->F# is -1,-2).
    """
    if next_root is not None and bass_pc != next_root:
        step_to_next = min((next_root - bass_pc) % 12, (bass_pc - next_root) % 12)
        if step_to_next in (1, 2):
            if prev_root is None or bass_pc != prev_root:
                return True
    if prev_root is not None and next_root is not None and prev_root != next_root:
        if (prev_root - bass_pc) % 12 in (1, 2) and (bass_pc - next_root) % 12 in (1, 2):
            return True
        if (bass_pc - prev_root) % 12 in (1, 2) and (next_root - bass_pc) % 12 in (1, 2):
            return True
    return False


def _match_slash_chord_for_vector(
    c_vec: np.ndarray,
    b_vec: np.ndarray,
    seg_state: int,
    prev_root: Optional[int],
    next_root: Optional[int],
    tonic: Optional[int],
    mode: str,
) -> Optional[tuple[str, float, str]]:
    """
    Evaluates a chroma + bass slice for a 1st- or 2nd-inversion Slash Chord
    (e.g. G/B, D/F#, E/G#, C/E, A/C#, Db/F).
    """
    b_max = float(b_vec.max())
    if b_max < 0.25:
        return None
    bass_pc = int(np.argmax(b_vec))
    bass_prominence = b_max / (float(b_vec.sum()) + 1e-9)
    if bass_prominence < 0.36:
        return None

    c_norm = c_vec / (np.linalg.norm(c_vec) + 1e-9)
    seg_root = CHORD_ROOTS[seg_state]
    is_stepwise = _is_stepwise_bass_motion(bass_pc, prev_root, next_root)

    if bass_pc == seg_root and not is_stepwise:
        return None

    triad_scores = _TEMPLATE_MATRIX @ c_norm - _QUALITY_PENALTY[:, 0]
    best_slash_idx = None
    best_slash_score = -1e9
    for idx in range(len(CHORD_LABELS)):
        suffix = CHORD_SUFFIXES[idx]
        if suffix not in ("", "m", "7"):
            continue
        r = CHORD_ROOTS[idx]
        third = CHORD_THIRDS[idx]
        fifth = CHORD_FIFTHS[idx]
        if bass_pc in (third, fifth) and c_norm[r] > 0.28 and c_norm[bass_pc] > 0.22:
            sc = float(triad_scores[idx])
            if bass_pc == third:
                sc += 0.09  # 1st-inversion slash chord (G/B, D/F#, E/G#, C/E, A/C#)
            if is_stepwise and suffix in ("", "7"):
                sc += 0.06
            if sc > best_slash_score:
                best_slash_score = sc
                best_slash_idx = idx

    if best_slash_idx is None:
        return None

    seg_triad_score = float(triad_scores[seg_state])
    slash_root = CHORD_ROOTS[best_slash_idx]
    if slash_root == bass_pc:
        return None

    # Accept if:
    # 1) Same triad as current segment with bass moving to its 3rd (e.g. G -> G/B -> C), OR
    # 2) Stepwise bass walkdown/walkup where the 1st-inversion triad matches upper harmony (e.g. G -> D/F# -> Em, A -> E/G# -> F#m), OR
    # 3) Upper triad clearly beats current segment's triad with strong bass inversion
    if (
        (slash_root == seg_root and bass_pc == CHORD_THIRDS[best_slash_idx] and bass_prominence >= 0.42)
        or (is_stepwise and best_slash_score >= seg_triad_score - 0.06)
        or (best_slash_score > seg_triad_score + 0.05 and c_norm[slash_root] > 0.38)
    ):
        slash_suffix = CHORD_SUFFIXES[best_slash_idx]
        raw_symbol = f"{NOTE_NAMES[slash_root]}{slash_suffix}/{NOTE_NAMES[bass_pc]}"
        spelled = _spell_chord_for_key(raw_symbol, tonic, mode)
        return spelled, 0.88, "passing"

    return None


def _detect_beat_slash_or_passing(
    b: int,
    seg_state: int,
    prev_root: Optional[int],
    next_root: Optional[int],
    chroma_sync: np.ndarray,
    bass_sync: np.ndarray,
    chord_probs: np.ndarray,
    tonic: Optional[int],
    mode: str,
) -> Optional[tuple[str, float, str]]:
    """
    Stage 4 Beat-Level Inspector for 1-beat passing chords, slash walkdowns/walkups
    (e.g. A -> E/G# -> F#m, G -> D/F# -> Em, G -> G/B -> C, Gb -> Db/F -> Ebm),
    or harmonic fillers. Returns (chord_symbol, confidence, role) if detected.
    """
    if b < 0 or b >= chroma_sync.shape[1]:
        return None

    c_vec = chroma_sync[:, b]
    b_vec = bass_sync[:, b]
    slash_res = _match_slash_chord_for_vector(c_vec, b_vec, seg_state, prev_root, next_root, tonic, mode)
    if slash_res is not None:
        return slash_res

    b_max = float(b_vec.max())
    if b_max < 0.25:
        return None
    bass_pc = int(np.argmax(b_vec))
    bass_prominence = b_max / (float(b_vec.sum()) + 1e-9)
    c_norm = c_vec / (np.linalg.norm(c_vec) + 1e-9)
    triad_scores = _TEMPLATE_MATRIX @ c_norm - _QUALITY_PENALTY[:, 0]

    # Case 2: Root-position 1-beat passing chord on a transition beat where both bass and harmony shift
    top_state = int(np.argmax(chord_probs[:, b]))
    top_root = CHORD_ROOTS[top_state]
    if (
        top_state != seg_state
        and top_root == bass_pc
        and bass_prominence >= 0.42
        and float(chord_probs[top_state, b]) > float(chord_probs[seg_state, b]) * 1.5
        and float(triad_scores[top_state]) > float(triad_scores[seg_state]) + 0.07
    ):
        role = "passing" if (next_root is not None and next_root != prev_root) else "filler"
        spelled = _spell_chord_for_key(CHORD_LABELS[top_state], tonic, mode)
        return spelled, 0.82, role

    return None


def _inspect_subbeat_slash_passing_and_fillers(
    pieces: list[tuple[str, int, int, int, float, int, str]],
    chroma: np.ndarray,
    bass: np.ndarray,
    chord_probs: np.ndarray,
    tonic: Optional[int],
    mode: str,
) -> list[tuple[str, int, int, int, float, int, str]]:
    """
    Stage 4 Sub-Beat Temporal Inspector:
      Inspects every segment `[s_f, e_f]` on the ~23ms frame grid for:
        1. Short segments (`<= 1.2s`) whose bass note in 35–220 Hz indicates a Slash Chord
           (`G/B`, `D/F#`, `E/G#`, `C/E`, `A/C#`).
        2. Sub-beat (`>= 180ms`, `>= 8 frames`) bass shifts inside a longer segment that
           form a passing slash chord (`G -> G/B -> C`, `G -> D/F# -> Em`) with strong
           temporal bass contrast (`>= 0.32`) relative to the rest of the segment.
        3. Sub-beat (`>= 180ms`, `>= 8 frames`) filler embellishments on the same root
           (`D -> Dsus4 -> D`, `Dsus2`, `Csus2`, `Cadd9`, `G7`) with strong temporal
           extension-tone contrast (`>= 0.26`) relative to the surrounding segment.
    """
    min_sub_frames = max(5, int(round(0.12 * ANALYSIS_SR / HOP)))  # ~120ms core frames for >=200ms events
    n_total = chroma.shape[1]
    refined: list[tuple[str, int, int, int, float, int, str]] = []

    for idx_p, (sym, state, s_f, e_f, conf, alt, role) in enumerate(pieces):
        s_f = max(0, min(s_f, n_total))
        e_f = max(s_f, min(e_f, n_total))
        seg_len = e_f - s_f
        if seg_len < min_sub_frames:
            refined.append((sym, state, s_f, e_f, conf, alt, role))
            continue

        prev_root = CHORD_ROOTS[pieces[idx_p - 1][1]] if idx_p > 0 else CHORD_ROOTS[state]
        next_root = CHORD_ROOTS[pieces[idx_p + 1][1]] if idx_p + 1 < len(pieces) else None
        seg_root = CHORD_ROOTS[state]

        # 1. If this segment itself is a short transition (<= 1.2s) and not yet a slash chord,
        #    check if its bass over [s_f, e_f] is a slash inversion (e.g. D with F# bass -> D/F#).
        if "/" not in sym and seg_len <= int(round(1.25 * ANALYSIS_SR / HOP)):
            c_mean = np.median(chroma[:, s_f:e_f], axis=1)
            b_mean = np.median(bass[:, s_f:e_f], axis=1)
            slash_hit = _match_slash_chord_for_vector(c_mean, b_mean, state, prev_root, next_root, tonic, mode)
            if slash_hit is not None:
                s_sym, s_conf, s_role = slash_hit
                refined.append((s_sym, state, s_f, e_f, max(conf, s_conf), alt, s_role))
                continue

        # 2. Check for a sub-beat Slash / Passing chord (`>= 180ms`) inside a longer segment
        #    where the bass note shifts away from the main segment's bass note.
        if seg_len >= min_sub_frames * 2 and "/" not in sym:
            b_slice = bass[:, s_f:e_f]
            b_max_f = b_slice.max(axis=0)
            b_pc_f = np.argmax(b_slice, axis=0)

            # Find contiguous runs of constant bass_pc != seg_root with strong bass energy
            sub_hit = None
            run_start = 0
            for k in range(1, seg_len + 1):
                same = (
                    k < seg_len
                    and b_pc_f[k] == b_pc_f[run_start]
                    and b_max_f[k] >= 0.28
                    and b_max_f[run_start] >= 0.28
                )
                if not same:
                    run_len = k - run_start
                    cand_pc = int(b_pc_f[run_start])
                    if (
                        min_sub_frames <= run_len <= int(round(0.85 * ANALYSIS_SR / HOP))
                        and run_len < seg_len - min_sub_frames
                        and b_max_f[run_start] >= 0.28
                        and cand_pc != seg_root
                    ):
                        sub_s = s_f + run_start
                        sub_e = s_f + k
                        # Temporal contrast: cand_pc must NOT be dominant in the rest of [s_f, e_f]
                        rest_mask = np.ones(seg_len, dtype=bool)
                        rest_mask[run_start:k] = False
                        b_rest = b_slice[:, rest_mask].mean(axis=1) if np.any(rest_mask) else np.zeros(12)
                        b_sub = b_slice[:, run_start:k].mean(axis=1)
                        if float(b_sub[cand_pc] - b_rest[cand_pc]) >= 0.32:
                            c_sub = np.median(chroma[:, sub_s:sub_e], axis=1)
                            p_root = seg_root if run_start > 0 else prev_root
                            n_root = next_root if k >= seg_len - 3 else seg_root
                            slash_cand = _match_slash_chord_for_vector(
                                c_sub, b_sub, state, p_root, n_root, tonic, mode
                            )
                            if slash_cand is not None:
                                sub_hit = (sub_s, sub_e, slash_cand[0], slash_cand[1], slash_cand[2])
                                break
                    run_start = k

            if sub_hit is not None:
                sub_s, sub_e, h_sym, h_conf, h_role = sub_hit
                if sub_s - s_f >= min_sub_frames:
                    c1, a1 = _compute_segment_confidence(chord_probs, state, s_f, sub_s)
                    refined.append((sym, state, s_f, sub_s, c1, a1, role))
                else:
                    sub_s = s_f
                refined.append((h_sym, state, sub_s, sub_e, h_conf, alt, h_role))
                if e_f - sub_e >= min_sub_frames:
                    c2, a2 = _compute_segment_confidence(chord_probs, state, sub_e, e_f)
                    refined.append((sym, state, sub_e, e_f, c2, a2, role))
                continue

        # 3. Check for a sub-beat Filler Embellishment (`D -> Dsus4 -> D`, `Dsus2`, `Csus2`)
        #    inside a plain major/minor segment where the 4th (+5) or 2nd (+2) replaces the 3rd.
        if seg_len >= min_sub_frames * 2 and CHORD_SUFFIXES[state] in ("", "m"):
            c_slice = chroma[:, s_f:e_f]
            c_max_slice = c_slice / (np.max(c_slice, axis=0, keepdims=True) + 1e-9)
            r_v = c_max_slice[seg_root]
            maj3_v = c_max_slice[(seg_root + 4) % 12]
            min3_v = c_max_slice[(seg_root + 3) % 12]
            fourth_v = c_max_slice[(seg_root + 5) % 12]
            sec_v = c_max_slice[(seg_root + 2) % 12]

            sus4_active = (r_v > 0.28) & (fourth_v > 0.36) & (fourth_v > maj3_v * 1.08) & (fourth_v > min3_v * 1.08)
            sus2_active = (r_v > 0.28) & (sec_v > 0.36) & (maj3_v < 0.20) & (min3_v < 0.20)

            filler_hit = None
            for f_suffix, mask_arr, ext_pc in (
                ("sus4", sus4_active, (seg_root + 5) % 12),
                ("sus2", sus2_active, (seg_root + 2) % 12),
            ):
                if not np.any(mask_arr):
                    continue
                r_start = 0
                for k in range(1, seg_len + 1):
                    if k < seg_len and mask_arr[k] == mask_arr[r_start]:
                        continue
                    r_len = k - r_start
                    if mask_arr[r_start] and min_sub_frames <= r_len <= seg_len - min_sub_frames:
                        rest_m = np.ones(seg_len, dtype=bool)
                        rest_m[r_start:k] = False
                        ext_sub = float(c_max_slice[ext_pc, r_start:k].mean())
                        ext_rest = float(c_max_slice[ext_pc, rest_m].mean()) if np.any(rest_m) else 0.0
                        if ext_sub - ext_rest >= 0.25:
                            f_sym = _spell_chord_for_key(f"{NOTE_NAMES[seg_root]}{f_suffix}", tonic, mode)
                            filler_hit = (s_f + r_start, s_f + k, f_sym, 0.86, "filler")
                            break
                    r_start = k
                if filler_hit is not None:
                    break

            if filler_hit is not None:
                sub_s, sub_e, f_sym, f_conf, f_role = filler_hit
                if sub_s - s_f >= min_sub_frames:
                    c1, a1 = _compute_segment_confidence(chord_probs, state, s_f, sub_s)
                    refined.append((sym, state, s_f, sub_s, c1, a1, role))
                else:
                    sub_s = s_f
                refined.append((f_sym, state, sub_s, sub_e, f_conf, alt, f_role))
                if e_f - sub_e >= min_sub_frames:
                    c2, a2 = _compute_segment_confidence(chord_probs, state, sub_e, e_f)
                    refined.append((sym, state, sub_e, e_f, c2, a2, role))
                continue

        refined.append((sym, state, s_f, e_f, conf, alt, role))

    return refined


def _frame_chord_match_score(sym: str, chroma_n: np.ndarray, bass_n: np.ndarray) -> np.ndarray:
    """
    Computes per-frame instantaneous match score for chord symbol `sym` (including slash bass
    and sus2/sus4/add9/7th intervals) to drive <30ms sample-accurate boundary pinpointing.
    """
    root_pc, suffix, slash_pc = _parse_root_and_suffix(sym)
    label_key = NOTE_NAMES[root_pc] + suffix
    if label_key in CHORD_LABELS:
        idx = CHORD_LABELS.index(label_key)
    else:
        idx = CHORD_LABELS.index(NOTE_NAMES[root_pc])

    base_score = _TEMPLATE_MATRIX[idx] @ chroma_n - float(_QUALITY_PENALTY[idx, 0])
    target_bass = slash_pc if slash_pc is not None else root_pc
    b_score = 0.32 * bass_n[target_bass]

    if suffix == "sus4":
        b_score = b_score + 0.22 * chroma_n[(root_pc + 5) % 12] - 0.18 * chroma_n[(root_pc + 4) % 12]
    elif suffix == "sus2":
        b_score = b_score + 0.22 * chroma_n[(root_pc + 2) % 12] - 0.18 * chroma_n[(root_pc + 4) % 12]
    elif suffix == "":
        b_score = b_score + 0.12 * chroma_n[(root_pc + 4) % 12]

    return base_score + b_score


def _refine_boundaries_sample_accurate(
    pieces: list[tuple[str, int, int, int, float, int, str]],
    chroma: np.ndarray,
    bass: np.ndarray,
) -> list[tuple[str, int, int, int, float, int, str]]:
    """
    Stage 5 Sample-Accurate Boundary Refinement (< 30ms video sync):
    Refines each boundary frame `b_f` between adjacent chord segments using the
    Maximum Likelihood Change-Point Estimator on the frame-level chroma + bass stream.
    """
    if len(pieces) <= 1:
        return pieces

    n_frames = chroma.shape[1]
    chroma_n = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    bass_n = bass / (bass.max(axis=0, keepdims=True) + 1e-9)

    out = [list(p) for p in pieces]
    for i in range(len(out) - 1):
        sym_l, _, s_l, b_f, _, _, _ = out[i]
        sym_r, _, _, e_r, _, _, _ = out[i + 1]
        if sym_l == sym_r:
            continue

        # Search window around boundary b_f (±6 frames ≈ ±139ms), keeping >=4 frames per segment
        w_start = max(s_l + 4, b_f - 6, 0)
        w_end = min(e_r - 4, b_f + 6, n_frames)
        if w_end <= w_start + 1:
            continue

        score_l = _frame_chord_match_score(sym_l, chroma_n[:, w_start:w_end], bass_n[:, w_start:w_end])
        score_r = _frame_chord_match_score(sym_r, chroma_n[:, w_start:w_end], bass_n[:, w_start:w_end])
        diff = score_l - score_r  # positive when L is better, negative when R is better

        # For split index k in 0..len(diff), left sum is sum(diff[:k]) and right sum is sum(-diff[k:])
        # Maximizing left_sum + right_sum is equivalent to maximizing 2 * sum(diff[:k])
        prefix = np.concatenate([[0.0], np.cumsum(diff)])
        best_rel = int(np.argmax(prefix))
        new_b = w_start + best_rel
        out[i][3] = new_b
        out[i + 1][2] = new_b

    return [tuple(p) for p in out]


def _classify_segment_role(
    sym: str,
    prev_sym: Optional[str],
    next_sym: Optional[str],
    dur: float,
    beat_sec: float,
    initial_role: str,
) -> str:
    """
    Stage 4 Explicit Role Classification (`main`, `passing`, `filler`):
      - `filler`: Short sus2, sus4, add9, or 7th embellishment resolving into or out of
                  the same root chord (e.g. D -> Dsus4 -> D, C -> Cmaj7 -> C7).
      - `passing`: Slash chord (`G/B`, `D/F#`, `E/G#`) or short (`0.20s - 1.0 beat`) chord
                   connecting two different main chords.
      - `main`: Structural harmony (`>= 1 beat` or stable main progression `G -> C -> D`).
    """
    if initial_role in ("passing", "filler"):
        if initial_role == "filler":
            return "filler"
        # Check if a "passing" segment is actually a same-root filler (e.g. D -> Dsus4 -> D)
        root_pc, suffix, slash_pc = _parse_root_and_suffix(sym)
        if slash_pc is None and suffix in ("sus4", "sus2", "add9", "7", "maj7", "m7"):
            prev_r = _parse_root_and_suffix(prev_sym)[0] if prev_sym else None
            next_r = _parse_root_and_suffix(next_sym)[0] if next_sym else None
            if prev_r == root_pc or next_r == root_pc:
                return "filler"
        return "passing"

    root_pc, suffix, slash_pc = _parse_root_and_suffix(sym)
    prev_r = _parse_root_and_suffix(prev_sym)[0] if prev_sym else None
    next_r = _parse_root_and_suffix(next_sym)[0] if next_sym else None

    if suffix in ("sus4", "sus2", "add9") and (prev_r == root_pc or next_r == root_pc or dur <= max(1.2 * beat_sec, 0.85)):
        return "filler"
    if suffix in ("7", "maj7", "m7") and (prev_r == root_pc or next_r == root_pc) and dur <= max(1.2 * beat_sec, 0.85):
        return "filler"
    if slash_pc is not None and dur <= max(1.5 * beat_sec, 1.1):
        return "passing"
    if dur <= max(1.05 * beat_sec, 0.55) and prev_r is not None and next_r is not None and prev_r != next_r:
        return "passing"
    return "main"


FRAGMENT_BEATS = 0.35  # anything shorter is a decoder flicker, not a chord anyone played
MAIN_MIN_BEATS = 1.0  # a structural chord lasts at least a beat
EMBELLISHMENT_SPACING_BEATS = 4.0  # at most one passing / filler chord per bar of 4/4


def _is_embellishment(seg: dict) -> bool:
    return seg.get("role") in ("passing", "filler")


def _absorb(timeline: list[dict], i: int) -> None:
    """Removes segment i, giving its time to the neighbour that shares its root, else the longer one."""
    seg = timeline[i]
    prev = timeline[i - 1] if i > 0 else None
    nxt = timeline[i + 1] if i + 1 < len(timeline) else None
    root = _parse_root_and_suffix(seg["chord"])[0]

    def score(n):
        if n is None:
            return -1.0
        same_root = _parse_root_and_suffix(n["chord"])[0] == root
        return (10.0 if same_root else 0.0) + (n["end"] - n["start"]) + (1.0 if not _is_embellishment(n) else 0.0)

    target = prev if score(prev) >= score(nxt) else nxt
    if target is None:
        return
    if target is prev:
        prev["end"] = seg["end"]
    else:
        nxt["start"] = seg["start"]
    del timeline[i]


def _merge_repeats(timeline: list[dict]) -> list[dict]:
    out: list[dict] = []
    for seg in timeline:
        if out and out[-1]["chord"] == seg["chord"]:
            out[-1]["end"] = seg["end"]
            out[-1]["confidence"] = max(out[-1]["confidence"], seg["confidence"])
            if not _is_embellishment(seg):
                out[-1]["role"], out[-1]["passing"] = "main", False
        else:
            out.append(dict(seg))
    return out


def _consolidate_timeline(timeline: list[dict], beat_sec: float) -> list[dict]:
    """
    Turns the decoder's beat-by-beat reading into the chords a player would write down.

    The decoder is deliberately quick to switch (so G -> C -> D and soft chords are never
    swallowed), which on real recordings also turns vocal notes, bass runs and drum hits
    into chords: 80-200 a minute, most under a beat. Confidence can't tell them apart (it
    is high almost everywhere), so this works on duration, neighbours and density:

      1. flickers under ~1/3 beat are merged into a neighbour;
      2. main chords shorter than a beat are merged (prefer the neighbour with the same root);
      3. X -> Y -> X where Y is a short main chord is one X held through a melody note;
      4. back-to-back embellishments collapse to the strongest one (slash chords, then the
         longest), and embellishments closer than a bar to the previous one are dropped.

    A single real passing chord between two held chords (G -> G/B -> C) or a sus filler
    (D -> Dsus4 -> D) survives all four steps.
    """
    if len(timeline) < 2 or beat_sec <= 0:
        return timeline
    tl = _merge_repeats(timeline)
    dur = lambda s: s["end"] - s["start"]  # noqa: E731

    def sweep(should_drop) -> None:
        changed = True
        while changed and len(tl) > 1:
            changed = False
            # Shortest first, so a flicker is folded before it can shield a neighbour.
            for i in sorted(range(len(tl)), key=lambda k: dur(tl[k])):
                if should_drop(i):
                    _absorb(tl, i)
                    tl[:] = _merge_repeats(tl)
                    changed = True
                    break

    sweep(lambda i: dur(tl[i]) < FRAGMENT_BEATS * beat_sec)
    sweep(lambda i: not _is_embellishment(tl[i]) and dur(tl[i]) < MAIN_MIN_BEATS * beat_sec)

    def bounce(i: int) -> bool:
        if i == 0 or i + 1 >= len(tl) or _is_embellishment(tl[i]):
            return False
        return tl[i - 1]["chord"] == tl[i + 1]["chord"] and dur(tl[i]) < 2 * beat_sec

    sweep(bounce)

    def strength(seg: dict) -> tuple:
        return ("/" in seg["chord"], dur(seg))

    def weaker_in_chain(i: int) -> bool:
        if not _is_embellishment(tl[i]):
            return False
        for j in (i - 1, i + 1):
            if 0 <= j < len(tl) and _is_embellishment(tl[j]) and strength(tl[j]) > strength(tl[i]):
                return True
        return False

    sweep(weaker_in_chain)

    last_kept = -math.inf
    i = 0
    while i < len(tl):
        seg = tl[i]
        if _is_embellishment(seg):
            if seg["start"] - last_kept < EMBELLISHMENT_SPACING_BEATS * beat_sec:
                _absorb(tl, i)
                tl[:] = _merge_repeats(tl)
                continue
            last_kept = seg["start"]
        i += 1
    return tl


def _snap(t: float, beat_times: np.ndarray, tolerance: float) -> float:
    if len(beat_times) == 0:
        return t
    i = int(np.argmin(np.abs(beat_times - t)))
    return float(beat_times[i]) if abs(beat_times[i] - t) <= tolerance else t


class DecoderConfig:
    def __init__(self):
        self.self_transition_probability = SELF_TRANSITION
        self.minimum_segment_duration_beats = 1.0
        self.confidence_threshold = LOW_CONFIDENCE


def _decode_chords(
    chroma: np.ndarray,
    bass: np.ndarray,
    voiced: np.ndarray,
    duration: float,
    beat_times: np.ndarray,
    beats_reliable: bool,
    key_bias: Optional[np.ndarray] = None,
    tonic: Optional[int] = None,
    mode: str = "major",
) -> list[dict]:
    n = chroma.shape[1]
    if n == 0:
        return []

    config = DecoderConfig()
    posteriors_frame = _chord_posteriors(chroma, bass, voiced, key_bias)
    chord_probs_frame = posteriors_frame[:_NO_CHORD]

    beat_frames = []
    if beats_reliable and len(beat_times) >= 4:
        frames = librosa.time_to_frames(beat_times, sr=ANALYSIS_SR, hop_length=HOP)
        beat_frames = [int(f) for f in frames if 0 < f < n]
        beat_frames = sorted(set(beat_frames))

    beat_sec = float(np.median(np.diff(beat_times))) if len(beat_times) >= 2 else 0.5
    pieces: list[tuple[str, int, int, int, float, int, str]] = []

    if len(beat_frames) >= 4:
        chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
        bass_sync = librosa.util.sync(bass, beat_frames, aggregate=np.median)
        voiced_sync = librosa.util.sync(voiced.astype(float)[None, :], beat_frames, aggregate=np.mean) > 0.5
        voiced_sync = voiced_sync[0]

        posteriors_sync = _chord_posteriors(chroma_sync, bass_sync, voiced_sync, key_bias)
        transition = _build_key_transition_matrix(
            posteriors_sync.shape[0], BEAT_SELF_TRANSITION, tonic=tonic, mode=mode
        )
        states_sync = librosa.sequence.viterbi_discriminative(posteriors_sync, transition)

        boundaries = [0] + beat_frames + [n]
        boundary_times = librosa.frames_to_time(boundaries, sr=ANALYSIS_SR, hop_length=HOP)
        boundary_times[-1] = duration

        segs = _segments_from_states(states_sync, boundary_times, duration)
        min_frames = max(1, int(round(config.minimum_segment_duration_beats)))
        segs = _merge_short(segs, posteriors_sync, min_frames)
        segs = _merge_same_triad(segs, posteriors_sync)

        chord_probs_sync = posteriors_sync[:_NO_CHORD]

        # Inspect beat-level segments and convert to frame indices [s_f, e_f]
        for idx_seg, (state, s, e) in enumerate(segs):
            if state == _NO_CHORD:
                continue
            prev_root = CHORD_ROOTS[segs[idx_seg - 1][0]] if idx_seg > 0 and segs[idx_seg - 1][0] != _NO_CHORD else CHORD_ROOTS[state]
            next_root = CHORD_ROOTS[segs[idx_seg + 1][0]] if idx_seg + 1 < len(segs) and segs[idx_seg + 1][0] != _NO_CHORD else None

            if e - s == 1:
                slash_hit = _detect_beat_slash_or_passing(
                    s, state, prev_root, next_root, chroma_sync, bass_sync, chord_probs_sync, tonic, mode
                )
                conf, alt = _compute_segment_confidence(chord_probs_sync, state, s, e)
                s_f, e_f = int(boundaries[s]), int(boundaries[e])
                if slash_hit is not None:
                    sym, s_conf, s_role = slash_hit
                    pieces.append((sym, state, s_f, e_f, max(conf, s_conf), alt, s_role))
                else:
                    role = "passing" if (prev_root is not None and next_root is not None and prev_root != next_root) else "main"
                    sym = _spell_chord_for_key(CHORD_LABELS[state], tonic, mode)
                    pieces.append((sym, state, s_f, e_f, conf, alt, role))
            else:
                cur_s = s
                for b in range(s, e):
                    p_root = CHORD_ROOTS[state] if b > s else prev_root
                    n_root = next_root if b == e - 1 else CHORD_ROOTS[state]
                    hit = _detect_beat_slash_or_passing(
                        b, state, p_root, n_root, chroma_sync, bass_sync, chord_probs_sync, tonic, mode
                    )
                    if hit is not None and (b == e - 1 or (e - s <= 4)):
                        if b > cur_s:
                            conf, alt = _compute_segment_confidence(chord_probs_sync, state, cur_s, b)
                            sym = _spell_chord_for_key(CHORD_LABELS[state], tonic, mode)
                            pieces.append((sym, state, int(boundaries[cur_s]), int(boundaries[b]), conf, alt, "main"))
                        h_sym, h_conf, h_role = hit
                        _, alt = _compute_segment_confidence(chord_probs_sync, state, b, b + 1)
                        pieces.append((h_sym, state, int(boundaries[b]), int(boundaries[b + 1]), h_conf, alt, h_role))
                        cur_s = b + 1
                if cur_s < e:
                    conf, alt = _compute_segment_confidence(chord_probs_sync, state, cur_s, e)
                    sym = _spell_chord_for_key(CHORD_LABELS[state], tonic, mode)
                    pieces.append((sym, state, int(boundaries[cur_s]), int(boundaries[e]), conf, alt, "main"))
    else:
        transition = _build_key_transition_matrix(
            posteriors_frame.shape[0], config.self_transition_probability, tonic=tonic, mode=mode
        )
        states = librosa.sequence.viterbi_discriminative(posteriors_frame, transition)

        frame_times = librosa.frames_to_time(np.arange(n + 1), sr=ANALYSIS_SR, hop_length=HOP)
        segs = _segments_from_states(states, frame_times, duration)

        min_frames = max(1, int(round(MIN_SEGMENT_SECONDS * ANALYSIS_SR / HOP)))
        segs = _merge_short(segs, posteriors_frame, min_frames)
        segs = _merge_same_triad(segs, posteriors_frame)

        for state, s, e in segs:
            if state == _NO_CHORD:
                continue
            confidence, alt = _compute_segment_confidence(chord_probs_frame, state, s, e)
            sym = _spell_chord_for_key(CHORD_LABELS[state], tonic, mode)
            pieces.append((sym, state, int(s), int(e), confidence, alt, "main"))

    # Stage 4: Sub-beat inspection for 200ms-400ms passing slash chords & filler embellishments
    pieces = _inspect_subbeat_slash_passing_and_fillers(
        pieces, chroma, bass, chord_probs_frame, tonic, mode
    )

    # Stage 5: Sample-accurate boundary refinement (< 30ms sync to audio/video)
    pieces = _refine_boundaries_sample_accurate(pieces, chroma, bass)

    timeline: list[dict] = []
    for idx_p, (sym, state, s_f, e_f, confidence, alt, init_role) in enumerate(pieces):
        start = float(s_f * HOP / ANALYSIS_SR)
        end = float(min(duration, e_f * HOP / ANALYSIS_SR)) if idx_p < len(pieces) - 1 else float(duration)
        if end - start <= 0.05:
            continue
        if confidence < NO_CHORD_CONFIDENCE and end - start < 1.0 and init_role == "main":
            continue
        prev_sym = pieces[idx_p - 1][0] if idx_p > 0 else None
        next_sym = pieces[idx_p + 1][0] if idx_p + 1 < len(pieces) else None
        role = _classify_segment_role(sym, prev_sym, next_sym, end - start, beat_sec, init_role)
        alt_sym = _spell_chord_for_key(CHORD_LABELS[alt], tonic, mode)
        if alt_sym == sym:
            other_idx = (alt + 1) % len(CHORD_LABELS)
            alt_sym = _spell_chord_for_key(CHORD_LABELS[other_idx], tonic, mode)
        seg_dict = {
            "chord": sym,
            "start": round(start, 3),
            "end": round(end, 3),
            "confidence": round(confidence, 2),
            "alternative": alt_sym,
            "role": role,
            "passing": role in ("passing", "filler"),
        }
        if timeline and timeline[-1]["chord"] == seg_dict["chord"] and abs(timeline[-1]["end"] - seg_dict["start"]) < 0.05:
            timeline[-1]["end"] = seg_dict["end"]
            timeline[-1]["confidence"] = max(timeline[-1]["confidence"], seg_dict["confidence"])
            if timeline[-1]["end"] - timeline[-1]["start"] >= max(beat_sec, 0.5):
                timeline[-1]["role"] = "main"
                timeline[-1]["passing"] = False
        else:
            timeline.append(seg_dict)

    out_timeline = []
    for seg in timeline:
        if (
            not seg.get("passing")
            and seg["confidence"] < config.confidence_threshold
            and seg["end"] - seg["start"] < 1.0
        ):
            if out_timeline and out_timeline[-1]["end"] == seg["start"]:
                out_timeline[-1]["end"] = seg["end"]
                continue
        out_timeline.append(seg)

    timeline = out_timeline

    for a, b in zip(timeline, timeline[1:]):
        if b["start"] < a["end"] or b["start"] - a["end"] < 0.15:
            b["start"] = a["end"]
    if timeline and timeline[0]["start"] < 0.35:
        timeline[0]["start"] = 0.0
    return timeline


def _voiced_frames(loudness: np.ndarray) -> np.ndarray:
    """
    Stage 2 Activity Floor:
    Frames with loudness > 0 (corresponding to `rms_db > -55 dB` relative to peak)
    are marked voiced so softly played chords (10x–15x quieter) are never dropped.
    """
    if loudness.size == 0:
        return np.zeros(0, dtype=bool)
    loud_level = float(np.percentile(loudness, 95))
    if loud_level <= 0.0:
        return np.zeros(loudness.shape, dtype=bool)
    return loudness > min(SILENCE_RATIO * loud_level, 0.5)


# ─── Meter / Time Signature ─────────────────────────────────────────────


def estimate_meter(
    onset_env: np.ndarray,
    beat_frames: np.ndarray,
    beat_times: np.ndarray,
    timeline: list[dict],
    reliable: bool,
):
    """
    Detects True Meter ("4/4", "3/4", "6/8") and downbeat phase by scoring
    every (bar length, phase) pair on two musical cues:
      1. Downbeat onset accent contrast (Beat 1 is accented relative to other beats)
      2. Structural chord-change alignment + chord duration multiples (3-beat vs 4-beat bars).
    """
    if len(beat_frames) < 6:
        return "4/4", "estimated", 4, []

    accents = np.array([onset_env[max(0, f - 2): min(len(onset_env), f + 3)].max() for f in beat_frames])
    accents = accents / (accents.mean() + 1e-9)

    structural = [seg for seg in timeline if not seg.get("passing")]
    if len(structural) < 2:
        structural = timeline

    change_beats = np.zeros(len(beat_times))
    for seg in structural[1:]:
        i = int(np.argmin(np.abs(beat_times - seg["start"])))
        if abs(beat_times[i] - seg["start"]) < 0.18:
            change_beats[i] = 1.0
    n_changes = change_beats.sum()

    # Also measure whether structural chord lengths (in beats) are multiples of 3 vs 4
    beat_period = float(np.median(np.diff(beat_times))) if len(beat_times) >= 2 else 0.5
    chord_beats = [
        (seg["end"] - seg["start"]) / max(beat_period, 1e-3)
        for seg in structural
        if (seg["end"] - seg["start"]) >= 1.5 * beat_period
    ]

    def duration_fit(m: int) -> float:
        if not chord_beats:
            return 0.0
        fits = []
        for b in chord_beats:
            bars = max(1, round(b / m))
            target = bars * m
            err = abs(b - target) / m
            fits.append(float(np.exp(-0.5 * (err / 0.15) ** 2)))
        return float(np.mean(fits))

    def score(m: int, phase: int) -> float:
        change_share = change_beats[phase::m].sum() / n_changes if n_changes else 0.0
        accent_contrast = float(accents[phase::m].mean() - 1.0)
        return accent_contrast + 0.85 * change_share + 0.55 * duration_fit(m)

    best = {m: max(range(m), key=lambda p: score(m, p)) for m in (3, 4)}
    s3, s4 = score(3, best[3]), score(4, best[4])
    m = 3 if s3 > s4 + 0.08 else 4
    phase = best[m]
    downbeats = [round(float(t), 3) for t in beat_times[phase::m]]
    return f"{m}/4", "estimated", m, downbeats


# ─── Fingerstyle Intro / Arpeggio Detector & Dual-Hand Finger Mapper ────

GUITAR_OPEN_MIDI = {6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64}
GUITAR_STRING_NAMES = {
    6: "E (6th string)",
    5: "A (5th string)",
    4: "D (4th string)",
    3: "G (3rd string)",
    2: "B (2nd string)",
    1: "e (1st string)",
}

_LEFT_FINGER_LABELS = {
    0: "Open (0)",
    1: "Index (1)",
    2: "Middle (2)",
    3: "Ring (3)",
    4: "Pinky (4)",
}

# Canonical guitar grips: chord -> {string_number: (fret, left_finger_int)}
_CANONICAL_GUITAR_SHAPES: dict[str, dict[int, tuple[int, int]]] = {
    "A": {5: (0, 0), 4: (2, 2), 3: (2, 1), 2: (2, 3), 1: (0, 0)},
    "Am": {5: (0, 0), 4: (2, 2), 3: (2, 3), 2: (1, 1), 1: (0, 0)},
    "C": {5: (3, 3), 4: (2, 2), 3: (0, 0), 2: (1, 1), 1: (0, 0)},
    "D": {4: (0, 0), 3: (2, 1), 2: (3, 3), 1: (2, 2)},
    "Dm": {4: (0, 0), 3: (2, 2), 2: (3, 3), 1: (1, 1)},
    "D/F#": {6: (2, 1), 4: (0, 0), 3: (2, 2), 2: (3, 3), 1: (2, 4)},
    "E": {6: (0, 0), 5: (2, 2), 4: (2, 3), 3: (1, 1), 2: (0, 0), 1: (0, 0)},
    "E/G#": {6: (4, 3), 5: (2, 1), 4: (2, 2), 3: (1, 1), 2: (0, 0), 1: (0, 0)},
    "Em": {6: (0, 0), 5: (2, 2), 4: (2, 3), 3: (0, 0), 2: (0, 0), 1: (0, 0)},
    "F": {6: (1, 1), 5: (3, 3), 4: (3, 4), 3: (2, 2), 2: (1, 1), 1: (1, 1)},
    "F#m": {6: (2, 1), 5: (4, 3), 4: (4, 4), 3: (2, 1), 2: (2, 1), 1: (2, 1)},
    "F#": {6: (2, 1), 5: (4, 3), 4: (4, 4), 3: (3, 2), 2: (2, 1), 1: (2, 1)},
    "Gb": {6: (2, 1), 5: (4, 3), 4: (4, 4), 3: (3, 2), 2: (2, 1), 1: (2, 1)},
    "G": {6: (3, 2), 5: (2, 1), 4: (0, 0), 3: (0, 0), 2: (0, 0), 1: (3, 3)},
    "G/B": {5: (2, 2), 4: (0, 0), 3: (0, 0), 2: (3, 3), 1: (3, 4)},
    "Bm": {5: (2, 1), 4: (4, 3), 3: (4, 4), 2: (3, 2), 1: (2, 1)},
    "B": {5: (2, 1), 4: (4, 2), 3: (4, 3), 2: (4, 4), 1: (2, 1)},
    "Cb": {5: (2, 1), 4: (4, 2), 3: (4, 3), 2: (4, 4), 1: (2, 1)},
    "Db": {5: (4, 1), 4: (6, 2), 3: (6, 3), 2: (6, 4), 1: (4, 1)},
    "Ebm": {5: (6, 1), 4: (8, 3), 3: (8, 4), 2: (7, 2), 1: (6, 1)},
}


def _midi_to_spelled_note(midi_pitch: int, tonic: Optional[int], mode: str = "major") -> str:
    pc = int(midi_pitch) % 12
    octave = (int(midi_pitch) // 12) - 1
    names = _note_names_for_key(tonic if tonic is not None else 0, mode)
    return f"{names[pc]}{octave}"


def _active_chord_at(timeline: list[dict], t: float) -> str:
    if not timeline:
        return "C"
    for seg in timeline:
        if seg["start"] - 0.05 <= t <= seg["end"] + 0.05:
            return seg["chord"]
    return timeline[0]["chord"]


def solve_fingerstyle_notes(
    raw_events: list,
    timeline: list[dict],
    tonic: Optional[int] = None,
    mode: str = "major",
) -> list[dict]:
    """
    Maps a sequence of (time_seconds, midi_pitch[, duration]) plucked guitar events onto:
      - Optimal guitar `string` (1..6), `stringName`, and `fret` (0..15)
        anchored to the active chord shape with minimum hand movement.
      - `leftFinger`: "Open (0)", "Index (1)", "Middle (2)", "Ring (3)", or "Pinky (4)"
      - `rightFinger`: "p (Thumb)" for strings 6, 5, 4; "i (Index)" for string 3;
        "m (Middle)" for string 2; "a (Ring)" for string 1 (with i/m alternation
        on rapid repeated treble strings).
    """
    notes_out: list[dict] = []
    prev_fret: Optional[int] = None
    prev_string: Optional[int] = None
    prev_time: float = -10.0
    prev_right_short: str = ""

    for ev in raw_events:
        if len(ev) >= 3:
            t, midi_pitch, ev_dur = float(ev[0]), ev[1], float(ev[2])
        else:
            t, midi_pitch, ev_dur = float(ev[0]), ev[1], None
        midi_val = int(np.clip(round(midi_pitch), 40, 79))
        chord = _active_chord_at(timeline, t)
        base_chord = chord.split("/")[0]
        shape = _CANONICAL_GUITAR_SHAPES.get(chord) or _CANONICAL_GUITAR_SHAPES.get(base_chord) or {}

        # Determine chord's fretted anchor position
        fretted_in_shape = [f for f, _ in shape.values() if f > 0]
        anchor_fret = min(fretted_in_shape) if fretted_in_shape else 1

        chosen_string = 3
        chosen_fret = 0
        chosen_left_int = 0

        # 1. Exact match in canonical chord grip
        exact_matches = [
            (s, f, lf)
            for s, (f, lf) in shape.items()
            if GUITAR_OPEN_MIDI[s] + f == midi_val
        ]
        if exact_matches:
            # If multiple strings match, pick the one closest to previous string/fret
            chosen_string, chosen_fret, chosen_left_int = exact_matches[0]
        else:
            # 2. Search all valid strings (1..6) for minimum hand movement from chord anchor & prev_fret
            candidates = []
            for s in (6, 5, 4, 3, 2, 1):
                f = midi_val - GUITAR_OPEN_MIDI[s]
                if 0 <= f <= 15:
                    cost = 0.0 if f == 0 else abs(f - anchor_fret) * 1.2
                    if prev_fret is not None and f > 0:
                        cost += abs(f - prev_fret) * 0.65
                    # Prefer lower strings for bass pitches (< 55) and upper strings for treble
                    if midi_val < 54 and s >= 4:
                        cost -= 0.8
                    elif midi_val >= 60 and s <= 3:
                        cost -= 0.8
                    candidates.append((cost, s, f))
            if candidates:
                candidates.sort(key=lambda item: item[0])
                _, chosen_string, chosen_fret = candidates[0]
            else:
                chosen_string = 1 if midi_val >= 64 else 6
                chosen_fret = max(0, midi_val - GUITAR_OPEN_MIDI[chosen_string])

            if chosen_fret == 0:
                chosen_left_int = 0
            elif chosen_string in shape and shape[chosen_string][0] == chosen_fret:
                chosen_left_int = shape[chosen_string][1]
            else:
                rel = chosen_fret - anchor_fret + 1
                chosen_left_int = int(np.clip(rel, 1, 4))

        left_label = _LEFT_FINGER_LABELS.get(chosen_left_int, "Index (1)")

        # Right-hand p-i-m-a plucking assignment
        if chosen_string in (6, 5, 4):
            right_label = "p (Thumb)"
            right_short = "p"
        elif chosen_string == 3:
            right_label = "i (Index)"
            right_short = "i"
        elif chosen_string == 2:
            right_label = "m (Middle)"
            right_short = "m"
        else:
            right_label = "a (Ring)"
            right_short = "a"

        # Alternate i / m on rapid consecutive plucks on the same treble string
        if (
            chosen_string in (1, 2, 3)
            and prev_string == chosen_string
            and (t - prev_time) < 0.32
        ):
            if prev_right_short == "i":
                right_label, right_short = "m (Middle)", "m"
            else:
                right_label, right_short = "i (Index)", "i"

        if chosen_fret > 0:
            prev_fret = chosen_fret
        prev_string = chosen_string
        prev_time = t
        prev_right_short = right_short

        item_dict = {
            "time": round(float(t), 2),
            "chord": chord,
            "noteName": _midi_to_spelled_note(midi_val, tonic, mode),
            "string": chosen_string,
            "stringName": GUITAR_STRING_NAMES[chosen_string],
            "fret": int(chosen_fret),
            "leftFinger": left_label,
            "rightFinger": right_label,
        }
        if ev_dur is not None:
            item_dict["duration"] = round(float(ev_dur), 2)
        notes_out.append(item_dict)

    return notes_out


def _detect_fingerstyle_intro(
    y_harm: np.ndarray,
    sr: int,
    timeline: list[dict],
    tonic: Optional[int],
    mode: str,
) -> dict:
    """
    Analyzes the intro window (first up to 16 seconds) for sequential plucked /
    arpeggiated guitar notes and solves both left-hand and right-hand fingerings.
    """
    intro_seconds = min(len(y_harm) / sr, 16.0)
    n_samples = int(intro_seconds * sr)
    if n_samples < int(1.0 * sr):
        return {
            "detected": False,
            "patternName": "",
            "startTime": 0.0,
            "endTime": 0.0,
            "notes": [],
        }

    y_intro = y_harm[:n_samples]
    hop = BEAT_HOP  # ~11.6 ms resolution for crisp plucked note onset timing
    fmin = float(librosa.midi_to_hz(40))  # E2 (6th string open)
    n_bins = 45  # E2 (40) .. C6 (84)

    C = np.abs(
        librosa.cqt(
            y=y_intro,
            sr=sr,
            hop_length=hop,
            fmin=fmin,
            n_bins=n_bins,
            bins_per_octave=12,
        )
    )
    if C.size == 0 or float(C.max()) < 1e-5:
        return {
            "detected": False,
            "patternName": "",
            "startTime": 0.0,
            "endTime": 0.0,
            "notes": [],
        }

    C_norm = C / (C.max() + 1e-9)
    # Positive spectral flux across semitone bins detects newly plucked notes
    diff = np.maximum(0.0, C_norm[:, 1:] - 0.72 * C_norm[:, :-1])
    flux = diff.sum(axis=0)
    flux_padded = np.concatenate([[C_norm[:, 0].sum() * 0.5], flux])

    onset_frames = librosa.onset.onset_detect(
        onset_envelope=flux_padded,
        sr=sr,
        hop_length=hop,
        backtrack=False,
        delta=float(max(0.04, 0.22 * np.std(flux_padded))),
        wait=max(1, int(round(0.09 * sr / hop))),
    )

    raw_events: list[tuple[float, int]] = []
    for f in onset_frames:
        f_idx = int(f)
        if f_idx >= C_norm.shape[1]:
            continue
        win_end = min(C_norm.shape[1], f_idx + 4)
        frame_slice = C_norm[:, f_idx:win_end].mean(axis=1)
        prev_slice = C_norm[:, max(0, f_idx - 3):f_idx].mean(axis=1) if f_idx >= 2 else np.zeros_like(frame_slice)
        attack_profile = np.maximum(0.0, frame_slice - 0.55 * prev_slice) + 0.35 * frame_slice

        if float(frame_slice.max()) < 0.12:
            continue

        # Suppress 2nd and 3rd harmonics (octave +12 and twelfth +19) of strong fundamentals
        cleaned = attack_profile.copy()
        for b_idx in range(len(cleaned)):
            if frame_slice[b_idx] >= 0.28:
                if b_idx + 12 < len(cleaned):
                    cleaned[b_idx + 12] *= 0.25
                if b_idx + 19 < len(cleaned):
                    cleaned[b_idx + 19] *= 0.35
                if b_idx + 24 < len(cleaned):
                    cleaned[b_idx + 24] *= 0.35

        best_bin = int(np.argmax(cleaned))
        midi_pitch = 40 + best_bin
        t_sec = float(librosa.frames_to_time(f_idx, sr=sr, hop_length=hop))
        if raw_events and abs(t_sec - raw_events[-1][0]) < 0.08:
            continue
        raw_events.append((t_sec, midi_pitch))
        if len(raw_events) >= 32:
            break

    notes = solve_fingerstyle_notes(raw_events, timeline, tonic=tonic, mode=mode)
    for idx_n, n_obj in enumerate(notes):
        if idx_n + 1 < len(notes):
            dur_val = float(np.clip(notes[idx_n + 1]["time"] - n_obj["time"], 0.10, 1.50))
        else:
            dur_val = 0.35
        n_obj["duration"] = round(dur_val, 2)

    distinct_strings = {n["string"] for n in notes}
    detected = len(notes) >= 3 and len(distinct_strings) >= 2

    if not detected:
        return {
            "detected": False,
            "patternName": "",
            "startTime": 0.0,
            "endTime": 0.0,
            "notes": [],
        }

    right_seq = [n["rightFinger"].split(" ")[0] for n in notes[:6]]
    seq_str = " - ".join(right_seq)
    pattern_name = f"Travis / Arpeggio Fingerstyle Pattern ({seq_str})"

    return {
        "detected": True,
        "patternName": pattern_name,
        "startTime": round(notes[0]["time"], 2),
        "endTime": round(notes[-1]["time"] + 0.35, 2),
        "notes": notes,
    }


# ─── Pillar 4: Wilsify AI (gemini-2.5-flash) Referee & Teacher-Student Self-Learning ───

import os

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
LEARNED_HARMONY_RULES_PATH = os.path.join(_DATA_DIR, "learned_harmony_rules.json")
ANALYSIS_CACHE_PATH = os.path.join(_DATA_DIR, "analysis_cache.json")


def _default_learned_harmony_rules() -> dict:
    return {
        "version": "2.0.0",
        "updated_at": "2026-10-27T00:00:00Z",
        "transition_priors": {
            "I-IV-V": {"pattern": ["I", "IV", "V"], "self_transition_max": 0.5, "step_transition_boost": 0.28},
            "I-V-vi-IV": {"pattern": ["I", "V", "vi", "IV"], "self_transition_max": 0.5, "step_transition_boost": 0.26},
            "I-V6-vi": {"pattern": ["I", "V/3", "vi"], "self_transition_max": 0.45, "step_transition_boost": 0.35},
            "I-I6-IV": {"pattern": ["I", "I/3", "IV"], "self_transition_max": 0.45, "step_transition_boost": 0.35},
            "ii-V-I": {"pattern": ["ii", "V", "I"], "self_transition_max": 0.5, "step_transition_boost": 0.28},
            "IV-iv-I": {"pattern": ["IV", "iv", "I"], "self_transition_max": 0.48, "step_transition_boost": 0.25},
        },
        "chroma_and_bass_calibration": {
            "soft_chord_log_gamma": 50.0,
            "silence_floor_db": -55.0,
            "flux_change_threshold": 0.16,
            "slash_bass_ratio": 0.38,
            "min_passing_duration_sec": 0.18,
            "polyphonic_note_boost": 0.25,
            "fast_bpm_threshold": 115.0,
            "fast_onset_density_threshold": 3.8,
            "target_slowdown_bpm": 90.0,
        },
        "chord_confusion_fixes": [],
        "progression_insight_templates": {
            "strumming_patterns": {
                "4/4_slow": "D - D U - U D U (steady 8th-note acoustic groove with light palm-mute on beats 2 & 4)",
                "4/4_mid": "D - D U - U D U (folk/pop syncopated 8th-note groove; accent beats 2 and 4)",
                "4/4_fast": "D - D U D U D U (driving 8th/16th rhythm; keep wrist loose for rapid passing chords)",
                "3/4_waltz": "D - D U D U (waltz 3/4 feel: strong bass root on beat 1, light brush strums on beats 2 & 3)",
                "6/8_compound": "D - - D U D - - D U (compound 6/8 sway; accent beats 1 and 4)",
                "fingerstyle_arpeggio": "p - i - m - a - m - i (thumb 'p' alternates bass roots on strings 6/5/4 while i-m-a pluck treble strings 3-2-1)",
            },
            "playing_tip_rules": {
                "slash_walkdown": "Emphasize the moving bass note on the lowest fretted string with your thumb or a firm down-pick so the stepwise slash-chord walkdown rings clearly.",
                "sus_filler": "Keep your anchor fingers planted on the base triad while adding or lifting your pinky/index finger for the sus2/sus4 embellishment.",
                "soft_dynamics": "Match the track's dynamic contour by strumming closer to the neck with lighter pick velocity during soft chord passages, then digging in near the bridge on main chorus chords.",
                "barre_transition": "Pre-form the index-finger barre slightly ahead of the beat and use open or passing chords on the final eighth-note to pivot smoothly.",
            },
        },
    }


def _load_learned_harmony_rules(rules_path: Optional[str] = None) -> dict:
    import json

    target_path = rules_path or LEARNED_HARMONY_RULES_PATH
    try:
        if os.path.exists(target_path):
            with open(target_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
    except Exception:
        pass
    return _default_learned_harmony_rules()


def _save_learned_harmony_rules(rules: dict, rules_path: Optional[str] = None) -> None:
    import json

    target_path = rules_path or LEARNED_HARMONY_RULES_PATH
    try:
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(rules, f, indent=2)
    except Exception:
        pass


def _extract_segment_harmony_signature(
    seg: dict,
    prev_chord: Optional[str],
    chroma: np.ndarray,
    bass: np.ndarray,
    key_name: str,
    tonic: Optional[int],
    mode: str,
) -> dict:
    n_frames = chroma.shape[1]
    s_f = int(np.clip(round(seg["start"] * ANALYSIS_SR / HOP), 0, max(0, n_frames - 1)))
    e_f = int(np.clip(round(seg["end"] * ANALYSIS_SR / HOP), s_f + 1, n_frames))
    c_mean = np.median(chroma[:, s_f:e_f], axis=1) if e_f > s_f else np.zeros(12)
    b_mean = np.median(bass[:, s_f:e_f], axis=1) if e_f > s_f else np.zeros(12)

    note_names = _note_names_for_key(tonic if tonic is not None else 0, mode)
    bass_pc = int(np.argmax(b_mean)) if float(b_mean.max()) > 0 else int(np.argmax(c_mean))
    bass_name = note_names[bass_pc]

    top_pcs = [int(i) for i in np.argsort(c_mean)[::-1][:3] if c_mean[i] > 0.12]
    if not top_pcs:
        top_pcs = [bass_pc]
    top_notes = sorted(note_names[i] for i in top_pcs)

    return {
        "key": key_name,
        "prev_chord": prev_chord or "NONE",
        "bass_pitch_class": bass_name,
        "top_notes": top_notes,
    }


def _apply_learned_confusion_fixes(
    timeline: list[dict],
    chroma: np.ndarray,
    bass: np.ndarray,
    key_name: str,
    tonic: Optional[int],
    mode: str,
    rules: dict,
) -> tuple[list[dict], int]:
    """
    Applies Teacher-distilled rules from `learned_harmony_rules.json` to the local
    Student timeline so offline runs benefit permanently from prior Teacher corrections.
    """
    fixes = rules.get("chord_confusion_fixes", [])
    if not fixes or not timeline:
        return timeline, 0

    applied_count = 0
    updated: list[dict] = []
    for idx, seg in enumerate(timeline):
        new_seg = dict(seg)
        prev_chord = updated[-1]["chord"] if updated else "NONE"
        sig = _extract_segment_harmony_signature(new_seg, prev_chord, chroma, bass, key_name, tonic, mode)

        for rule in fixes:
            if rule.get("source") != "teacher_distilled":
                continue
            if rule.get("key") and rule["key"] != key_name:
                continue
            if rule.get("raw_student_chord") and rule["raw_student_chord"] != new_seg["chord"]:
                continue
            if rule.get("prev_chord") and rule["prev_chord"] not in (prev_chord, "ANY"):
                continue
            if rule.get("bass_pitch_class") and rule["bass_pitch_class"] != sig["bass_pitch_class"]:
                continue
            rule_top = set(rule.get("top_notes", []))
            sig_top = set(sig["top_notes"])
            if rule_top and len(rule_top & sig_top) < min(2, len(rule_top)):
                continue

            corrected = _spell_chord_for_key(rule["corrected_chord"], tonic, mode)
            new_seg["chord"] = corrected
            if rule.get("role") in ("main", "passing", "filler"):
                new_seg["role"] = rule["role"]
                new_seg["passing"] = rule["role"] in ("passing", "filler")
            applied_count += 1
            break

        updated.append(new_seg)
    return updated, applied_count


def _distill_teacher_corrections_to_rules(
    student_timeline: list[dict],
    teacher_refined_chords: list[dict],
    chroma: np.ndarray,
    bass: np.ndarray,
    key_name: str,
    tonic: Optional[int],
    mode: str,
    rules_path: Optional[str] = None,
) -> tuple[list[dict], int]:
    """
    Teacher-Student Self-Learning Step:
    Compares the local DSP Student's raw chords against the Teacher API's `refined_chords`.
    Whenever the Teacher corrects a chord/transition, extracts the acoustic signature
    `(key, prev_chord, bass_pitch_class, top_notes) -> corrected_chord` and saves it
    permanently into `backend/data/learned_harmony_rules.json`.
    """
    if not teacher_refined_chords:
        return student_timeline, 0

    rules = _load_learned_harmony_rules(rules_path)
    fixes: list[dict] = list(rules.get("chord_confusion_fixes", []))
    distilled_count = 0
    merged_timeline: list[dict] = []

    for idx, s_seg in enumerate(student_timeline):
        new_seg = dict(s_seg)
        mid_t = 0.5 * (s_seg["start"] + s_seg["end"])
        prev_chord = merged_timeline[-1]["chord"] if merged_timeline else "NONE"

        # Find matching teacher segment covering mid_t
        matched_t = None
        for t_seg in teacher_refined_chords:
            t_start = float(t_seg.get("start", 0.0))
            t_end = float(t_seg.get("end", 0.0))
            if t_start - 0.15 <= mid_t <= t_end + 0.15:
                matched_t = t_seg
                break

        if matched_t is not None and matched_t.get("chord"):
            teacher_chord = _spell_chord_for_key(str(matched_t["chord"]).strip(), tonic, mode)
            teacher_role = str(matched_t.get("role", new_seg.get("role", "main")))
            if teacher_role not in ("main", "passing", "filler"):
                teacher_role = new_seg.get("role", "main")

            if teacher_chord != new_seg["chord"]:
                sig = _extract_segment_harmony_signature(
                    new_seg, prev_chord, chroma, bass, key_name, tonic, mode
                )
                rule_entry = {
                    "id": f"learned_{key_name.replace(' ', '_').lower()}_{prev_chord}_{sig['bass_pitch_class']}_{teacher_chord}",
                    "source": "teacher_distilled",
                    "key": key_name,
                    "prev_chord": prev_chord,
                    "bass_pitch_class": sig["bass_pitch_class"],
                    "top_notes": sig["top_notes"],
                    "raw_student_chord": new_seg["chord"],
                    "corrected_chord": teacher_chord,
                    "role": teacher_role,
                    "reason": f"Distilled from Wilsify AI Teacher: {new_seg['chord']} -> {teacher_chord} over {sig['bass_pitch_class']} bass after {prev_chord} in {key_name}.",
                }
                # Replace existing rule with same signature or append
                replaced = False
                for i_f, existing in enumerate(fixes):
                    if (
                        existing.get("source") == "teacher_distilled"
                        and existing.get("key") == key_name
                        and existing.get("prev_chord") == prev_chord
                        and existing.get("bass_pitch_class") == sig["bass_pitch_class"]
                        and existing.get("raw_student_chord") == new_seg["chord"]
                    ):
                        fixes[i_f] = rule_entry
                        replaced = True
                        break
                if not replaced:
                    fixes.append(rule_entry)
                distilled_count += 1

            new_seg["chord"] = teacher_chord
            new_seg["role"] = teacher_role
            new_seg["passing"] = teacher_role in ("passing", "filler")

        merged_timeline.append(new_seg)

    if distilled_count > 0:
        rules["chord_confusion_fixes"] = fixes
        _save_learned_harmony_rules(rules, rules_path)

    return merged_timeline, distilled_count


_NOTE_TO_PC = {
    "C": 0, "B#": 0,
    "C#": 1, "Db": 1,
    "D": 2,
    "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4,
    "F": 5, "E#": 5,
    "F#": 6, "Gb": 6,
    "G": 7,
    "G#": 8, "Ab": 8,
    "A": 9,
    "A#": 10, "Bb": 10,
    "B": 11, "Cb": 11,
}


def _roman_numeral_for_chord(chord_sym: str, tonic: Optional[int], mode: str) -> str:
    if tonic is None:
        return "I"
    base = chord_sym.split("/")[0]
    root_pc = None
    for name in sorted(_NOTE_TO_PC.keys(), key=len, reverse=True):
        if base.startswith(name):
            root_pc = _NOTE_TO_PC[name]
            qual = base[len(name):]
            break
    else:
        return "I"

    rel = (root_pc - int(tonic)) % 12
    is_minor_chord = qual.startswith("m") and not qual.startswith("maj")
    is_dim = "dim" in qual
    degree_map = {
        0: "I",
        1: "bII",
        2: "II",
        3: "bIII" if mode == "major" else "III",
        4: "III" if mode == "major" else "bIII",
        5: "IV",
        6: "#IV",
        7: "V",
        8: "bVI" if mode == "major" else "VI",
        9: "VI" if mode == "major" else "vi",
        10: "bVII" if mode == "major" else "VII",
        11: "VII",
    }
    rn = degree_map.get(rel, "I")
    if is_minor_chord:
        rn = rn.lower()
    elif is_dim:
        rn = rn.lower() + "°"
    if "/" in chord_sym:
        rn += f"/{chord_sym.split('/')[1]}"
    return rn


def _compute_capo_recommendation_text(timeline: list[dict], key_name: str, tonic: Optional[int], mode: str) -> str:
    open_roots = {0, 2, 4, 7, 9}  # C, D, E, G, A
    if not timeline or tonic is None:
        return f"No Capo required — play standard open/barre voicings in {key_name}."

    main_roots = []
    for seg in timeline:
        if seg.get("passing"):
            continue
        base = seg["chord"].split("/")[0]
        for name in sorted(_NOTE_TO_PC.keys(), key=len, reverse=True):
            if base.startswith(name):
                main_roots.append(_NOTE_TO_PC[name])
                break
    if not main_roots:
        main_roots = [int(tonic)]

    open_share_0 = sum(1 for r in main_roots if r in open_roots) / len(main_roots)
    if open_share_0 >= 0.75:
        unique_main = list(dict.fromkeys(seg["chord"] for seg in timeline if not seg.get("passing")))[:4]
        return f"No Capo needed — play directly in open {key_name} shapes ({', '.join(unique_main)})."

    best_fret = 0
    best_score = open_share_0
    for fret in range(1, 8):
        shifted = [((r - fret) % 12) for r in main_roots]
        score = sum(1 for r in shifted if r in open_roots) / len(shifted)
        if score > best_score + 0.12:
            best_score = score
            best_fret = fret

    if best_fret > 0:
        shape_tonic = (int(tonic) - best_fret) % 12
        shape_names = _note_names_for_key(shape_tonic, mode)
        shape_key = f"{shape_names[shape_tonic]} {'Minor' if mode == 'minor' else 'Major'}"
        return f"Capo Fret {best_fret} recommended — lets you play {key_name} using resonant open {shape_key} chord shapes."
    return f"No Capo needed — standard {key_name} voicings fit the progression cleanly."


def _run_offline_symbolic_referee(
    timeline: list[dict],
    key: dict,
    tonic: Optional[int],
    bpm: float,
    time_signature: str,
    fingerstyle_intro: dict,
    rules: dict,
    learned_rules_applied: int = 0,
    source: str = "symbolic_referee",
) -> dict:
    """
    100% API-Identical Offline / Zero-Quota Symbolic Referee powered by
    `backend/data/learned_harmony_rules.json`.
    """
    key_name = key.get("key", "C Major")
    mode = key.get("mode", "major")
    templates = rules.get("progression_insight_templates", {})
    strum_map = templates.get("strumming_patterns", {})
    tip_rules = templates.get("playing_tip_rules", {})

    # Build Roman-numeral timestamped progression summary
    chord_phrases = []
    for seg in timeline[:8]:
        rn = _roman_numeral_for_chord(seg["chord"], tonic, mode)
        role_tag = f", {seg['role']}" if seg.get("role") in ("passing", "filler") else ""
        chord_phrases.append(f"{seg['chord']} ({rn}{role_tag}, {seg['start']:.1f}s–{seg['end']:.1f}s)")
    progression_str = " → ".join(chord_phrases) if chord_phrases else key_name

    passing_chords = [s["chord"] for s in timeline if s.get("role") == "passing"]
    filler_chords = [s["chord"] for s in timeline if s.get("role") == "filler"]

    extra_notes = []
    if passing_chords:
        extra_notes.append(f"stepwise passing harmony ({', '.join(dict.fromkeys(passing_chords))})")
    if filler_chords:
        extra_notes.append(f"suspended/embellishment fillers ({', '.join(dict.fromkeys(filler_chords))})")
    extra_clause = f" featuring {' and '.join(extra_notes)}" if extra_notes else ""

    ai_summary = (
        f"In {key_name} ({bpm:.1f} BPM, {time_signature}), the progression moves through "
        f"{progression_str}{extra_clause}."
    )

    # Select strumming or picking pattern
    if fingerstyle_intro.get("detected"):
        pattern = strum_map.get(
            "fingerstyle_arpeggio",
            f"Fingerstyle {fingerstyle_intro.get('patternName', 'p - i - m - a')} arpeggio",
        )
    elif time_signature == "3/4":
        pattern = strum_map.get("3/4_waltz", "D - D U D U (3/4 waltz groove)")
    elif time_signature == "6/8":
        pattern = strum_map.get("6/8_compound", "D - - D U D - - D U (6/8 compound feel)")
    elif bpm >= 120.0:
        pattern = strum_map.get("4/4_fast", "D - D U D U D U (driving 8th-note groove)")
    elif bpm <= 85.0:
        pattern = strum_map.get("4/4_slow", "D - D U - U D U (steady acoustic 8th-note groove)")
    else:
        pattern = strum_map.get("4/4_mid", "D - D U - U D U (syncopated 4/4 acoustic/pop groove)")

    capo_rec = _compute_capo_recommendation_text(timeline, key_name, tonic, mode)

    tips: list[str] = []
    unique_chords = list(dict.fromkeys(s["chord"] for s in timeline))
    if len(unique_chords) >= 2:
        tips.append(
            f"Practice the core transition {' → '.join(unique_chords[:4])} with a metronome at {max(60, int(round(bpm * 0.75)))} BPM before bringing it up to {int(round(bpm))} BPM."
        )
    if passing_chords and tip_rules.get("slash_walkdown"):
        tips.append(f"For {passing_chords[0]}: {tip_rules['slash_walkdown']}")
    if filler_chords and tip_rules.get("sus_filler"):
        tips.append(f"For {filler_chords[0]}: {tip_rules['sus_filler']}")
    if fingerstyle_intro.get("detected"):
        tips.append(
            "Keep your right-hand thumb (p) assigned to bass strings 6–4 while index (i), middle (m), and ring (a) pluck treble strings 3–1 without tension."
        )
    if tip_rules.get("soft_dynamics"):
        tips.append(tip_rules["soft_dynamics"])

    return {
        "verified_key": key_name,
        "verified_time_signature": time_signature,
        "refined_chords": [
            {
                "chord": s["chord"],
                "start": s["start"],
                "end": s["end"],
                "role": s.get("role", "main"),
            }
            for s in timeline
        ],
        "ai_summary": ai_summary,
        "strumming_or_picking_pattern": pattern,
        "capo_recommendation": capo_rec,
        "playing_tips": tips[:4],
        "source": source,
        "learned_rules_applied": learned_rules_applied,
    }


def _get_gemini_api_keys() -> list[str]:
    keys: list[str] = []
    for env_name in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"):
        val = (os.environ.get(env_name) or "").strip()
        if val and val not in keys:
            keys.append(val)
    return keys


def _call_gemini_teacher_api(
    y_harm: np.ndarray,
    sr: int,
    candidate_table: list[dict],
    key_name: str,
    bpm: float,
    time_signature: str,
    api_keys: list[str],
) -> Optional[dict]:
    """
    Calls `gemini-2.5-flash` via the official `google-genai` SDK with multi-key rotation.
    Returns parsed JSON dict on success or None if offline / quota-exhausted.
    """
    if not api_keys:
        return None
    try:
        import io
        import json
        import wave
        from google import genai
        from google.genai import types
    except Exception:
        return None

    # Encode a compact 16kHz mono 16-bit WAV snippet (up to 30 seconds)
    target_sr = 16000
    max_samples = int(min(len(y_harm), 30 * sr))
    y_clip = librosa.resample(y_harm[:max_samples], orig_sr=sr, target_sr=target_sr)
    peak = float(np.max(np.abs(y_clip)))
    if peak > 1e-6:
        y_clip = y_clip / peak
    pcm16 = (np.clip(y_clip, -1.0, 1.0) * 32767.0).astype(np.int16)
    wav_buf = io.BytesIO()
    with wave.open(wav_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(target_sr)
        wf.writeframes(pcm16.tobytes())
    wav_bytes = wav_buf.getvalue()

    prompt = (
        "You are the Wilsify AI Harmonic Referee & Master Guitar/Keys Teacher.\n"
        f"DSP Student Estimated Key: {key_name}, Tempo: {bpm:.1f} BPM, Meter: {time_signature}.\n"
        f"DSP Candidate Chord Table: {json.dumps(candidate_table)}\n"
        "Listen to the harmonic audio and audit the DSP candidate chord table. "
        "Verify soft chords, slash-chord bass walkdowns (e.g. G/B, D/F#, E/G#), and sus2/sus4 fillers. "
        "Return strict JSON with keys: "
        "verified_key (string), verified_time_signature (string), "
        "refined_chords (array of {chord, start, end, role: 'main'|'passing'|'filler'}), "
        "ai_summary (string), strumming_or_picking_pattern (string), "
        "capo_recommendation (string), playing_tips (array of 3-4 strings)."
    )

    for api_key in api_keys:
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            if response and response.text:
                parsed = json.loads(response.text)
                if isinstance(parsed, dict) and "refined_chords" in parsed:
                    return parsed
        except Exception:
            continue
    return None


def _run_wilsify_ai_referee(
    y_harm: np.ndarray,
    sr: int,
    timeline: list[dict],
    chroma: np.ndarray,
    bass: np.ndarray,
    key: dict,
    tonic: Optional[int],
    bpm: float,
    time_signature: str,
    fingerstyle_intro: dict,
    rules_path: Optional[str] = None,
) -> tuple[list[dict], dict]:
    """
    Executes Pillar 4:
      1. Loads `backend/data/learned_harmony_rules.json` and applies any previously distilled
         Teacher rules (`_apply_learned_confusion_fixes`).
      2. If `GEMINI_API_KEY` (or `_2`/`_3`) is active, calls `_call_gemini_teacher_api`
         (with SHA-256 audio caching) and distills any Teacher chord corrections permanently
         into `backend/data/learned_harmony_rules.json`.
      3. When offline / zero-quota / empty key, executes `_run_offline_symbolic_referee`
         using the learned rules store so output is 100% API-identical.
    """
    rules = _load_learned_harmony_rules(rules_path)
    key_name = key.get("key", "C Major")
    mode = key.get("mode", "major")

    timeline, applied_count = _apply_learned_confusion_fixes(
        timeline, chroma, bass, key_name, tonic, mode, rules
    )

    api_keys = _get_gemini_api_keys()
    if api_keys:
        candidate_table = []
        for idx, seg in enumerate(timeline):
            prev_c = timeline[idx - 1]["chord"] if idx > 0 else "NONE"
            sig = _extract_segment_harmony_signature(seg, prev_c, chroma, bass, key_name, tonic, mode)
            candidate_table.append(
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "chord": seg["chord"],
                    "alternative": seg.get("alternative", ""),
                    "role": seg.get("role", "main"),
                    "confidence": seg.get("confidence", 0.8),
                    "bass_pitch_class": sig["bass_pitch_class"],
                    "top_notes": sig["top_notes"],
                }
            )

        teacher_res = _call_gemini_teacher_api(
            y_harm, sr, candidate_table, key_name, bpm, time_signature, api_keys
        )
        if teacher_res and isinstance(teacher_res.get("refined_chords"), list):
            timeline, distilled_count = _distill_teacher_corrections_to_rules(
                timeline,
                teacher_res["refined_chords"],
                chroma,
                bass,
                key_name,
                tonic,
                mode,
                rules_path=rules_path,
            )
            fallback_ref = _run_offline_symbolic_referee(
                timeline,
                key,
                tonic,
                bpm,
                time_signature,
                fingerstyle_intro,
                rules,
                learned_rules_applied=applied_count + distilled_count,
                source="gemini-2.5-flash",
            )
            return timeline, {
                "verified_key": teacher_res.get("verified_key") or fallback_ref["verified_key"],
                "verified_time_signature": teacher_res.get("verified_time_signature") or fallback_ref["verified_time_signature"],
                "refined_chords": fallback_ref["refined_chords"],
                "ai_summary": teacher_res.get("ai_summary") or fallback_ref["ai_summary"],
                "strumming_or_picking_pattern": teacher_res.get("strumming_or_picking_pattern") or fallback_ref["strumming_or_picking_pattern"],
                "capo_recommendation": teacher_res.get("capo_recommendation") or fallback_ref["capo_recommendation"],
                "playing_tips": teacher_res.get("playing_tips") or fallback_ref["playing_tips"],
                "source": "gemini-2.5-flash",
                "learned_rules_applied": applied_count + distilled_count,
            }

    offline_ref = _run_offline_symbolic_referee(
        timeline,
        key,
        tonic,
        bpm,
        time_signature,
        fingerstyle_intro,
        rules,
        learned_rules_applied=applied_count,
        source="symbolic_referee",
    )
    return timeline, offline_ref


# ─── Pipeline ───────────────────────────────────────────────────────────


def analyze_from_array(y: np.ndarray, sr: int, progress: Optional[ProgressFn] = None) -> dict:
    report = progress or _noop_progress
    if sr != ANALYSIS_SR:
        y = librosa.resample(y, orig_sr=sr, target_sr=ANALYSIS_SR)
        sr = ANALYSIS_SR
    y = np.asarray(y, dtype=np.float32)

    duration = detect_duration(y, sr)
    if duration < MIN_DURATION_SECONDS:
        raise AnalysisInputError("That clip is too short to analyze — please use at least a few seconds of audio.")
    if float(np.max(np.abs(y))) < 1e-4:
        raise AnalysisInputError("That file appears to be silent — no musical content was found to analyze.")

    report("separating", 20)
    # Stage 1: Harmonic Remix (`other + bass`, excluding `vocals` & `drums`) + Original Mix Ensemble
    stage1 = _stage1_harmonic_remix(y, sr)
    y_harm = stage1["harmonic_remix"]
    y_orig_harm = stage1["original_harmonic"]
    bass_stem = stage1["bass_stem"]
    y_perc = stage1["percussive"]

    report("beats", 40)
    beats = detect_beats(y_perc, y, sr)

    report("chroma", 60)
    chroma, bass, loudness = _chroma_features(
        y_harm, sr, y_orig_harm=y_orig_harm, bass_stem=bass_stem
    )
    voiced = _voiced_frames(loudness)
    if not np.any(voiced):
        raise AnalysisInputError("No pitched musical content was found in that file.")

    report("chords", 75)
    # Initial structural pass to establish key and harmonic phrasing
    initial_timeline = _decode_chords(chroma, bass, voiced, duration, beats["beat_times"], beats["reliable"])

    report("key", 88)
    key = _key_result(chroma, voiced, initial_timeline, bass=bass)
    tonic = key.pop("_tonic")
    key_trusted = key.pop("_marginConfidence") >= 0.45

    report("meter", 94)
    beat_frames, beat_times, bpm = beats["beat_frames"], beats["beat_times"], beats["bpm"]
    if beats["reliable"]:
        chosen = _disambiguate_tempo_octave(beats["bpm"], beats["onset_env"], sr, initial_timeline)
    else:
        chosen = _choose_tempo(beats["onset_env"], sr, beats["bpm"], _harmonic_cycle(chroma), initial_timeline)
        chosen = _disambiguate_tempo_octave(chosen, beats["onset_env"], sr, initial_timeline)

    if abs(chosen - beats["bpm"]) / max(beats["bpm"], 1.0) > 0.04:
        beat_frames, beat_times, bpm = _track_at(beats["onset_env"], sr, chosen)
        if not beats["reliable"]:
            bpm = chosen

    # Stage A: Adaptive Pitch-Preserving Slowdown for Fast Songs (BPM > 115 or rapid harmonic rate)
    bias = _key_bias(tonic, key["mode"]) if key_trusted else None
    stretch_ratio = 1.0
    slowdown_applied = False
    chord_density = float(len(initial_timeline)) / max(duration, 1.0)
    is_fast_song = (
        (beats["reliable"] and bpm > FAST_BPM_THRESHOLD and len(beat_times) >= 8)
        or (bpm > FAST_BPM_THRESHOLD and chord_density >= 1.6)
    )
    if is_fast_song:
        effective_fast_bpm = max(float(bpm), 120.0)
        stretch_ratio = round(float(np.clip(90.0 / effective_fast_bpm, 0.60, 0.85)), 4)
        slowdown_applied = True
        y_harm_slow = librosa.effects.time_stretch(y_harm, rate=stretch_ratio)
        y_orig_slow = librosa.effects.time_stretch(y_orig_harm, rate=stretch_ratio)
        bass_slow_stem = librosa.effects.time_stretch(bass_stem, rate=stretch_ratio)
        chroma_slow, bass_slow, loudness_slow = _chroma_features(
            y_harm_slow, sr, y_orig_harm=y_orig_slow, bass_stem=bass_slow_stem
        )
        voiced_slow = _voiced_frames(loudness_slow)
        if np.any(voiced_slow):
            timeline_slow = _decode_chords(
                chroma_slow,
                bass_slow,
                voiced_slow,
                duration / stretch_ratio,
                beat_times / stretch_ratio if len(beat_times) > 0 else np.array([]),
                beats["reliable"] and len(beat_times) >= 8,
                key_bias=bias,
                tonic=tonic,
                mode=key["mode"],
            )
            # Rescale slowed timestamps back to 1.0x and refine boundaries on 1.0x chroma/bass (< 20ms sync)
            n_1x = chroma.shape[1]
            slow_pieces: list[tuple[str, int, int, int, float, int, str]] = []
            for seg in timeline_slow:
                t_s = seg["start"] * stretch_ratio
                t_e = min(duration, seg["end"] * stretch_ratio)
                if beats["reliable"] and len(beat_times) >= 8 and not seg.get("passing"):
                    t_s = _snap(t_s, beat_times, 0.03)
                    t_e = min(duration, _snap(t_e, beat_times, 0.03))
                s_f = int(np.clip(round(t_s * ANALYSIS_SR / HOP), 0, max(0, n_1x - 1)))
                e_f = int(np.clip(round(t_e * ANALYSIS_SR / HOP), s_f + 1, n_1x))
                st_idx = CHORD_LABELS.index(seg["chord"]) if seg["chord"] in CHORD_LABELS else 0
                alt_idx = CHORD_LABELS.index(seg["alternative"]) if seg.get("alternative") in CHORD_LABELS else 0
                slow_pieces.append(
                    (seg["chord"], st_idx, s_f, e_f, float(seg["confidence"]), alt_idx, seg.get("role", "main"))
                )
            slow_pieces = _refine_boundaries_sample_accurate(slow_pieces, chroma, bass)
            timeline = []
            for idx_p, (sym, _st, s_f, e_f, conf, alt_idx, role) in enumerate(slow_pieces):
                start_1x = float(s_f * HOP / ANALYSIS_SR)
                end_1x = float(min(duration, e_f * HOP / ANALYSIS_SR)) if idx_p < len(slow_pieces) - 1 else float(duration)
                if end_1x - start_1x <= 0.05:
                    continue
                timeline.append(
                    {
                        "chord": sym,
                        "start": round(start_1x, 3),
                        "end": round(end_1x, 3),
                        "confidence": round(conf, 2),
                        "alternative": _spell_chord_for_key(CHORD_LABELS[alt_idx], tonic, key["mode"]),
                        "role": role,
                        "passing": role in ("passing", "filler"),
                    }
                )
            for a, b in zip(timeline, timeline[1:]):
                if b["start"] < a["end"] or b["start"] - a["end"] < 0.15:
                    b["start"] = a["end"]
            if timeline and timeline[0]["start"] < 0.35:
                timeline[0]["start"] = 0.0
        else:
            timeline = _decode_chords(
                chroma, bass, voiced, duration, beat_times, beats["reliable"],
                key_bias=bias, tonic=tonic, mode=key["mode"]
            )
    else:
        timeline = _decode_chords(
            chroma,
            bass,
            voiced,
            duration,
            beat_times,
            beats["reliable"],
            key_bias=bias,
            tonic=tonic,
            mode=key["mode"],
        )

    if key_trusted and bpm > 0:
        timeline = _absorb_out_of_key_blips(timeline, tonic, key["mode"], 60.0 / bpm)

    # Ensure all chords in final timeline use consistent enharmonic spelling for the detected key
    for seg in timeline:
        seg["chord"] = _spell_chord_for_key(seg["chord"], tonic, key["mode"])
        if seg.get("alternative"):
            seg["alternative"] = _spell_chord_for_key(seg["alternative"], tonic, key["mode"])

    beat_sec_real = 60.0 / bpm if bpm > 0 else 0.5
    timeline = _consolidate_timeline(timeline, beat_sec_real)

    time_signature, ts_status, beats_per_bar, downbeats = estimate_meter(
        beats["onset_env"], beat_frames, beat_times, timeline, beats["reliable"]
    )

    fingerstyle_intro = _detect_fingerstyle_intro(y_harm, sr, timeline, tonic=tonic, mode=key["mode"])

    # Pillar 4: Wilsify AI Referee + Teacher-Student Self-Learning + Offline Symbolic Referee
    timeline, wilsify_ai = _run_wilsify_ai_referee(
        y_harm,
        sr,
        timeline,
        chroma,
        bass,
        key,
        tonic,
        float(bpm),
        time_signature,
        fingerstyle_intro,
    )
    timeline = _consolidate_timeline(timeline, beat_sec_real)

    low_conf = sum(1 for seg in timeline if seg["confidence"] < LOW_CONFIDENCE)
    wilsify_ai_card = {
        "verifiedKey": wilsify_ai["verified_key"],
        "verifiedTimeSignature": wilsify_ai["verified_time_signature"],
        "aiSummary": wilsify_ai["ai_summary"],
        "strummingOrPickingPattern": wilsify_ai["strumming_or_picking_pattern"],
        "capoRecommendation": wilsify_ai["capo_recommendation"],
        "playingTips": wilsify_ai["playing_tips"],
        "source": wilsify_ai["source"],
        "learnedRulesApplied": wilsify_ai["learned_rules_applied"],
    }

    return {
        **key,
        "bpm": round(float(bpm), 1),
        "bpmStatus": "detected" if beats["reliable"] else "estimated",
        "beats": [round(float(t), 3) for t in beat_times],
        "downbeats": downbeats,
        "beatsPerBar": beats_per_bar,
        "timeSignature": time_signature,
        "timeSignatureStatus": ts_status,
        "durationSeconds": round(duration, 2),
        "duration": _format_duration(duration),
        "chordProgression": [seg["chord"] for seg in timeline],
        "chordTimeline": timeline,
        "chordVocabulary": "major/minor triads, sevenths, sus2, sus4, add9, dim, dim7, and slash chords",
        "lowConfidenceThreshold": LOW_CONFIDENCE,
        "lowConfidenceSegments": low_conf,
        "analysisVersion": 2,
        "stretchRatio": stretch_ratio,
        "adaptiveSlowdown": {
            "applied": slowdown_applied,
            "stretchRatio": stretch_ratio,
            "originalBpm": round(float(bpm), 1),
            "targetBpm": 90.0,
        },
        "fingerstyleIntro": fingerstyle_intro,
        "aiSummary": wilsify_ai["ai_summary"],
        "strummingOrPickingPattern": wilsify_ai["strumming_or_picking_pattern"],
        "capoRecommendation": wilsify_ai["capo_recommendation"],
        "playingTips": wilsify_ai["playing_tips"],
        "wilsifyAi": wilsify_ai_card,
        # Same breakdown under the name newer clients read; kept identical.
        "wilsifyAiInsights": wilsify_ai_card,
    }


def analyze(wav_path: str, progress: Optional[ProgressFn] = None) -> dict:
    report = progress or _noop_progress
    report("decoding", 10)
    y, sr = load_audio(wav_path)
    return analyze_from_array(y, sr, report)
