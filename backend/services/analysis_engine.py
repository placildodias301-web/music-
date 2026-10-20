"""
Real music analysis engine — genuine signal processing on the uploaded
audio, not mock data. Uses librosa for:

  - Harmonic/percussive separation (HPSS) so chords are read from the
    sustained (harmonic) part of the mix and beats from the drums
    (percussive part).
  - Tempo (BPM) + beats: onset-strength beat tracking on the percussive
    signal, then one tempo chosen from the candidates (tracked tempo, its
    half/double, strongest periodicities) by how strongly the onsets repeat,
    whether a whole number of beats fits the repeating chord cycle, and a
    mild prior toward common tempos. Grooves without a clear drum pulse
    (samba, bossa, no drums) are marked "estimated", not left to the user.
  - Key:           tuning-corrected chroma correlated (Pearson) against
                    Krumhansl-Kessler major/minor profiles, nudged by how much
                    of the song sits on each candidate's tonic chord.
  - Chords:        log-compressed CQT chroma built only from energy that
                    peaks on real notes (pitched drums, slides and rumble
                    sit between notes and are ignored), plus the bass note
                    (lowest strong in-tune pitch, 40-180 Hz) for the root.
                    Scored against major, minor, 7 and m7 templates, then
                    decoded with a Viterbi (HMM) pass so the result is a
                    stable progression instead of frame-by-frame flicker,
                    and decoded again with a mild preference for chords in
                    the detected key. Silent/unpitched stretches are left
                    out ("no chord") rather than forced onto a chord. Each
                    segment carries a confidence and its runner-up chord.
  - Time signature: compares downbeat accent + chord-change alignment for
                    3- and 4-beat bars; reported as "estimated" (or
                    "unavailable" when beats can't be tracked reliably).
  - Duration:       straight from the audio length

This is real DSP/music-informatics analysis, so results are estimates —
accuracy depends on the material (a clean guitar-and-voice recording
analyzes more cleanly than a dense mix), and the chord vocabulary is
major/minor triads plus dominant and minor sevenths: a Cmaj7 is reported
as C, a Gsus4 as its nearest triad.
It is NOT a large neural model and does not claim to be one.
"""

from typing import Callable, Optional

import numpy as np
import librosa
from scipy.ndimage import median_filter, uniform_filter1d

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Kessler key profiles (relative pitch-class weights)
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Chord vocabulary: suffix -> semitone offsets from the root. Sevenths are
# included because they carry real information players need (the V7 of a
# minor key, a ii-m7) — reporting D#7 as plain D# hides the leading tone.
CHORD_QUALITIES = {
    "": [0, 4, 7],
    "m": [0, 3, 7],
    "7": [0, 4, 7, 10],
    "m7": [0, 3, 7, 10],
}
# Score handicap for the four-note qualities, so a seventh is only reported
# when the 7th is clearly sounding (a triad plus a passing note stays a triad).
SEVENTH_PENALTY = 0.035

# Chords and beats need nothing above ~4 kHz (the top chroma bin is B7),
# so analysis runs at 11.025 kHz: half the work of 22.05 kHz, same result.
ANALYSIS_SR = 11025
HOP = 256  # ~23 ms — the time resolution of chord boundaries
BEAT_HOP = 128  # finer grid for onset/beat tracking (keeps the tempo estimate from quantizing)
HPSS_N_FFT = 1024
HPSS_KERNEL = 17

# Chord decoding parameters (tuned on synthesized ground-truth progressions)
SOFTMAX_BETA = 9.0  # sharpness of template-score -> probability
BASS_WEIGHT = 0.2  # bonus for a chord whose root is the loudest bass note
SELF_TRANSITION = 0.985  # HMM "stay on this chord" probability per frame
MIN_SEGMENT_SECONDS = 0.3  # shorter blips are merged into a neighbour
LOW_CONFIDENCE = 0.45  # below this a segment is flagged as uncertain
NO_CHORD_CONFIDENCE = 0.15  # short segments below this are dropped as "no chord"
SILENCE_RATIO = 0.06  # frames quieter than this x the loud level are "no chord"
BASS_LOW_HZ = 40.0  # bass-note search range (E1 ~41 Hz ... F3 ~175 Hz)
BASS_HIGH_HZ = 180.0
BASS_PEAK_RATIO = 0.6  # a bass peak must reach this share of the band's loudest bin
BASS_MIN_LEVEL = 0.15  # bass peak needed, relative to the frame's loudest pitch, to count as a bass note
BASS_SMOOTH_FRAMES = 31  # ~0.7 s averaging window for the bass note
KEY_PRIOR_PENALTY = 0.08  # score handicap for chords outside the detected key
# Key confidence vs. a muddy note profile (see _key_result). Measured on 14
# real recordings: clear ones 0.16-0.43 flatness, ambiguous band mixes 0.56-0.71.
KEY_FLATNESS_AMBIGUOUS = 0.6  # at/above this flatness the key is fully ambiguous
KEY_FLATNESS_SPAN = 0.25  # flatness ≤ 0.35 counts as fully clear
KEY_MAX_UNSURE_CHORDS = 0.6  # more uncertain chords than this caps the key below "High"
# Out-of-key chords shorter than this many beats and less sure than this are
# hand-movement overlap, not a chord (see _absorb_out_of_key_blips).
BLIP_MAX_BEATS = 1.0
BLIP_MAX_CONFIDENCE = 0.7
MIN_PULSE_STRENGTH = 0.25  # onset autocorrelation at one beat needed to trust the BPM (steady grooves score 0.4-0.9)
ALT_TEMPO_RATIO = 0.6  # an alternative tempo needs this share of the winner's pulse strength
MAX_TEMPO_ALTERNATIVES = 3

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
for root in range(12):
    for suffix, offsets in CHORD_QUALITIES.items():
        CHORD_TEMPLATES.append((NOTE_NAMES[root] + suffix, _binary_template([root + o for o in offsets])))
        CHORD_ROOTS.append(root)
        CHORD_SUFFIXES.append(suffix)

CHORD_LABELS = [label for label, _ in CHORD_TEMPLATES]
_QUALITY_PENALTY = np.array([SEVENTH_PENALTY if len(CHORD_QUALITIES[s]) > 3 else 0.0 for s in CHORD_SUFFIXES])[:, None]


def triad_of(label: str) -> str:
    """'D#7' -> 'D#', 'A#m7' -> 'A#m' (key detection and key priors reason in triads)."""
    root = label[:2] if len(label) > 1 and label[1] == "#" else label[:1]
    return root + ("m" if label[len(root):].startswith("m") else "")
HARMONIC_DECAY = 0.6  # relative strength of each successive overtone in the templates


def _harmonic_template(binary: np.ndarray) -> np.ndarray:
    """
    Real instruments don't sound only their fundamental: the 3rd harmonic of
    every note adds its fifth (G's overtone is D, B's is F#), which makes a
    plain binary template mistake G for Bm. Folding the first few overtones
    of each chord tone into the template matches what chroma actually sees.
    """
    template = np.zeros(12)
    for pc in np.flatnonzero(binary):
        for h in range(1, 5):
            template[(pc + int(round(12 * np.log2(h)))) % 12] += HARMONIC_DECAY ** (h - 1)
    return template


_TEMPLATE_MATRIX = np.array([_harmonic_template(t) for _, t in CHORD_TEMPLATES])
_TEMPLATE_MATRIX /= np.linalg.norm(_TEMPLATE_MATRIX, axis=1, keepdims=True)  # (n_chords, 12)
_NO_CHORD = len(CHORD_TEMPLATES)  # extra HMM state index for silence / no chord

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
    Beat tracking on the percussive signal (falls back to the full mix when
    there are no drums). The reported BPM is the median beat spacing, which
    is finer-grained than librosa's autocorrelation tempo, and `reliable`
    says whether most beats actually land on an onset in the audio — a
    pad or drone gives beat-tracker output that is mostly guesswork.
    """
    env = librosa.onset.onset_strength(y=y_perc, sr=sr, hop_length=BEAT_HOP)
    if not np.any(env > 1e-6):
        env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=BEAT_HOP)

    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=BEAT_HOP, trim=False)
    tempo_value = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=BEAT_HOP)

    bpm = tempo_value
    if len(beat_times) >= 4:
        # Single beat gaps are whole frames (~12 ms), which quantizes the
        # BPM (117.5 instead of 120). Spans of several beats average that
        # out; the median keeps it robust to the odd missed beat.
        span = min(8, len(beat_times) - 1)
        periods = (beat_times[span:] - beat_times[:-span]) / span
        bpm = 60.0 / float(np.median(periods))

    # Pulse clarity: share of beats sitting on a clear onset peak.
    reliable = False
    if len(beat_frames) >= 4 and env.max() > 0:
        threshold = env.mean() + env.std()
        window = 2
        hits = [env[max(0, f - window): f + window + 1].max() > threshold for f in beat_frames]
        reliable = float(np.mean(hits)) >= 0.5

    # How strongly the rhythm actually repeats at that beat length. Busy,
    # syncopated grooves (samba, bossa, son) put onsets everywhere, so the
    # check above passes even when no tempo stands out; the final tempo is
    # then chosen with the chord cycle too (_choose_tempo) and marked "estimated".
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
    """
    Returns (pulse strength at `bpm`, other plausible tempos). Pulse
    strength is the onset autocorrelation at one beat (0 = no repetition,
    1 = perfectly periodic); alternatives are the other strong periodicities
    between 50 and 180 BPM, strongest first.
    """
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


TEMPO_MIN, TEMPO_MAX = 55.0, 190.0  # range a reported tempo is folded into
TEMPO_PRIOR_CENTER = 110.0  # typical song tempo; candidates far from it need more evidence
TEMPO_PRIOR_WIDTH = 0.7  # in octaves
CYCLE_WEIGHT = 0.6  # weight of "a whole number of beats fits the repeating chord cycle"
CYCLE_BEATS = (4, 6, 8, 12, 16)  # 1–4 bars of 2/4, 3/4 or 4/4
CYCLE_MIN_PROMINENCE = 0.02  # chord cycle must stand out this much to be used
CHORD_LENGTH_WEIGHT = 0.5  # weight of "chords last a whole number of beats"
# How typical each chord length (in beats) is: a full 4/4 bar most of all.
CHORD_LENGTH_FIT = {4: 1.0, 2: 0.7, 8: 0.7, 3: 0.6, 6: 0.6, 1: 0.3}
ONSET_PULSE_MIN = 0.1  # strongest onset periodicity needed before we demand onset support
ONSET_MIN_SHARE = 0.3  # a tempo needs this share of the strongest onset support to be chosen
ONSET_ACTIVITY_MIN = 0.05  # median pulse over 60-190 BPM: real playing ~0.11, isolated pad changes < 0
TEMPO_REFINE_SPAN = 0.06  # after picking a candidate, search ±6% around it…
TEMPO_REFINE_STEP = 0.25  # …in 0.25 BPM steps


def _harmonic_cycle(chroma: np.ndarray) -> Optional[float]:
    """
    Length (s) of the repeating chord pattern — the lag where the music is
    most like itself — from chroma self-similarity between 2.5 and 12 s.
    None when nothing repeats clearly (through-composed or very short).
    """
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
    # A maximum on the edge of the search window isn't a peak: the real cycle
    # is longer than we looked (slow songs: 4 bars at 76 BPM = 12.6 s), and
    # the edge value would mislead the tempo choice.
    if best >= len(lags) - 3:
        return None
    return float(lags[best] / fps)


def _choose_tempo(env: np.ndarray, sr: int, tracked: float, cycle: Optional[float], timeline: list[dict]) -> float:
    """
    One best tempo, chosen with more than the beat tracker's first guess.
    Candidates: the tracked tempo, its half/double/×1.5/×2/3, and the
    strongest rhythmic periodicities. Each is scored on (a) how strongly the
    onsets repeat at that beat and its multiples, (b) whether a whole number
    of beats (1–4 bars) fits the song's repeating chord cycle — which holds
    even when a live band drifts — (c) whether chords last a whole number of
    beats (a full bar most often), which is the only rhythm there is in
    sustained, drum-less music, and (d) a mild preference for common song
    tempos, which keeps busy grooves from being reported at a subdivision
    (e.g. 302 BPM) or a crawl.
    """
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

    starts = np.array([seg["start"] for seg in timeline])
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
        # Tempos at which the typical chord lasts a whole number of beats.
        d = float(np.median(lengths))
        candidates.update(60.0 * k / d for k in CHORD_LENGTH_FIT)
    candidates = {c for c in candidates if TEMPO_MIN <= c <= TEMPO_MAX}
    if not candidates:
        return float(np.clip(tracked, TEMPO_MIN, TEMPO_MAX))

    def evidence(bpm: float) -> float:
        return max(0.0, onset_score(bpm)) + CYCLE_WEIGHT * cycle_score(bpm) + CHORD_LENGTH_WEIGHT * chord_length_score(bpm)

    # The chord cycle, chord lengths and prior can't tell 2 beats per chord
    # from 3, so on their own they can crown a tempo nobody plays: a strummed
    # clip had onsets at 78/156 BPM and none at all (0.003) at 117, yet 117
    # won. When the audio has a real pulse, a tempo needs some of it.
    # Pulse at the beat itself, or at its half (strummed eighth notes carry
    # the pulse of a beat they subdivide) — but not at its multiples:
    # sustained pads only change every few seconds, and multiples of that
    # would masquerade as a pulse.
    def pulse(bpm: float) -> float:
        return max(peak(60.0 / bpm * fps), peak(30.0 / bpm * fps))

    onsets = {c: pulse(c) for c in candidates}
    strongest = max(onsets.values())
    # "Real pulse" also means rhythmic activity all over (strummed or played
    # music: median ~0.11), not one isolated bump: sustained pads that fade at
    # each chord change put a lone peak near 180 BPM (median below 0).
    activity = float(np.median([pulse(b) for b in np.arange(60.0, 190.0, 2.0)]))
    if strongest >= ONSET_PULSE_MIN and activity >= ONSET_ACTIVITY_MIN:
        supported = {c for c in candidates if onsets[c] >= ONSET_MIN_SHARE * strongest}
        candidates = supported or candidates

    best = max(candidates, key=lambda b: evidence(b) * prior(b))
    # The candidates are coarse (a few ratios and peaks), so the true optimum
    # can sit between them: a drum-less samba scored highest at 86 BPM while
    # the nearest candidate was 89. Polish the winner on a fine grid nearby —
    # on the evidence alone: the prior only picks the tempo octave, and here
    # it would just drag the number toward 110.
    fine = np.arange(best * (1 - TEMPO_REFINE_SPAN), best * (1 + TEMPO_REFINE_SPAN), TEMPO_REFINE_STEP)
    fine = [b for b in fine if TEMPO_MIN <= b <= TEMPO_MAX]
    return float(max([best, *fine], key=evidence))


def _track_at(env: np.ndarray, sr: int, bpm: float) -> tuple[np.ndarray, np.ndarray, float]:
    """Beat positions locked to `bpm`; returns (frames, times, refined bpm)."""
    _, frames = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=BEAT_HOP, bpm=bpm, tightness=400, trim=False)
    times = librosa.frames_to_time(frames, sr=sr, hop_length=BEAT_HOP)
    refined = bpm
    if len(times) >= 4:
        span = min(8, len(times) - 1)
        refined = 60.0 / float(np.median((times[span:] - times[:-span]) / span))
        if abs(refined - bpm) / bpm > 0.06:
            refined = bpm  # the tracker drifted; keep the chosen tempo
    return frames, times, refined


# ─── Chroma features ────────────────────────────────────────────────────


def _chroma_features(y_harm: np.ndarray, sr: int):
    """
    Tuning-corrected, log-compressed CQT chroma for the whole harmonic
    signal, plus a bass chroma (C1–B2) used to pick the chord root, and a
    per-frame loudness used to find silent stretches.
    """
    tuning = float(librosa.estimate_tuning(y=y_harm, sr=sr))
    bins_per_octave = 36
    n_octaves = 7
    fmin = librosa.note_to_hz("C1")
    C = np.abs(
        librosa.cqt(
            y=y_harm,
            sr=sr,
            hop_length=HOP,
            fmin=fmin,
            n_bins=bins_per_octave * n_octaves,
            bins_per_octave=bins_per_octave,
            tuning=tuning,
        )
    )
    C_log = np.log1p(100.0 * C / (C.max() + 1e-9))
    loudness = median_filter(C_log.sum(axis=0), size=9, mode="nearest")

    chroma = _on_pitch_chroma(C_log, bins_per_octave)
    bass = _bass_chroma(C_log, fmin, bins_per_octave)

    # Light temporal smoothing (~0.2 s) knocks out transients without
    # blurring real chord changes.
    chroma = median_filter(chroma, size=(1, 9), mode="nearest")
    # The bass gets a longer (~0.7 s) average: walking between root and
    # fifth is normal bass playing and must not flip the chord on beat 2.
    bass = uniform_filter1d(bass, size=BASS_SMOOTH_FRAMES, axis=1, mode="nearest")
    return chroma, bass, loudness


def _on_pitch_chroma(C: np.ndarray, bins_per_octave: int) -> np.ndarray:
    """
    Pitch-class profile built only from energy that peaks on an actual note
    of the (tuning-corrected) scale. Tuned instruments land on notes; pitched
    drums, vocal slides and vibrato, and rumble mostly sit between them, and
    folding those into the nearest note is how a samba surdo turns C#m into A.
    """
    steps = bins_per_octave // 12
    centers = np.arange(steps, C.shape[0] - 1, steps)
    level = C[centers]
    on_pitch = (level >= C[centers - 1]) & (level >= C[centers + 1])
    level = np.where(on_pitch, level, 0.0)
    chroma = np.zeros((12, C.shape[1]))
    np.add.at(chroma, (centers // steps) % 12, level)
    return chroma


def _bass_chroma(C: np.ndarray, fmin: float, bins_per_octave: int) -> np.ndarray:
    """
    The bass note per frame: the lowest *strong* pitch between ~40 and
    ~180 Hz (bass guitar, a guitar's low strings, a left hand on piano).
    Summing a fixed low band instead lets any rumble down there outvote a
    bass note that sits a little higher, and phone recordings often keep
    only the bass's second harmonic — which has the same pitch class, so
    the lowest strong peak still names the right note.
    """
    steps = bins_per_octave // 12
    n_bins = C.shape[0]
    # The CQT is tuning-corrected, so in-tune notes peak on every `steps`-th
    # bin (fmin is C1: bin 0 is pitch class C).
    centers = np.arange(steps, n_bins - 1, steps)
    freqs = fmin * 2.0 ** (centers / bins_per_octave)
    centers = centers[(freqs >= BASS_LOW_HZ) & (freqs <= BASS_HIGH_HZ)]
    pcs = (centers // steps) % 12

    level = C[centers]
    # Only count a note when its energy peaks on the note itself. Pitched
    # drums (a samba surdo, toms, 808s) and slides sit between notes, and
    # rounding them to the nearest note invents a bass note nobody played.
    on_pitch = (level >= C[centers - 1]) & (level >= C[centers + 1])
    level = np.where(on_pitch, level, 0.0)

    peak = level.max(axis=0)
    strong = (level >= BASS_PEAK_RATIO * peak[None, :]) & (level > 0)
    lowest = strong.argmax(axis=0)
    # A bass note only counts when it is a real part of the sound at that
    # moment, not leakage under a band with no bass instrument at all.
    present = peak > BASS_MIN_LEVEL * (C.max(axis=0) + 1e-9)

    bass = np.zeros((12, C.shape[1]))
    frames = np.flatnonzero(present)
    bass[pcs[lowest[frames]], frames] = 1.0
    return bass


# ─── Key ────────────────────────────────────────────────────────────────


def _key_label(idx: int, mode: str) -> tuple[str, str, str]:
    name = NOTE_NAMES[idx]
    if mode == "major":
        return f"{name} Major", "major", f"{name} Ionian (Major)"
    return f"{name} Minor", "minor", f"{name} Aeolian (Natural Minor)"


def _key_candidates(chroma_mean: np.ndarray, chord_durations: Optional[dict] = None) -> list[dict]:
    """
    Scores all 24 keys. Base score is the Pearson correlation of the song's
    pitch-class distribution with each rotated Krumhansl-Kessler profile;
    when a chord timeline is available, keys whose tonic chord actually
    occupies more of the song get a small bonus (this is what separates
    relative keys like C major / A minor, which share every note).
    """
    total = sum(chord_durations.values()) if chord_durations else 0.0
    out = []
    for key_idx in range(12):
        for mode, profile in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            r = float(np.corrcoef(chroma_mean, np.roll(profile, key_idx))[0, 1])
            tonic = NOTE_NAMES[key_idx] + ("" if mode == "major" else "m")
            share = chord_durations.get(tonic, 0.0) / total if total > 0 else 0.0
            out.append({"idx": key_idx, "mode": mode, "score": r + 0.35 * share})
    out.sort(key=lambda k: k["score"], reverse=True)
    return out


def _key_result(chroma: np.ndarray, voiced: np.ndarray, timeline: list[dict]) -> dict:
    frames = chroma[:, voiced] if np.any(voiced) else chroma
    norms = frames / (frames.max(axis=0, keepdims=True) + 1e-9)
    chroma_mean = norms.mean(axis=1)

    durations: dict[str, float] = {}
    for seg in timeline:
        triad = triad_of(seg["chord"])
        durations[triad] = durations.get(triad, 0.0) + seg["end"] - seg["start"]

    cands = _key_candidates(chroma_mean, durations)
    best, second = cands[0], cands[1]
    # Map the winning margin onto 0..1: a 0.15 lead over the runner-up is
    # treated as decisive.
    confidence = float(np.clip((best["score"] - second["score"]) / 0.15, 0.0, 1.0))
    confidence = round(0.5 + 0.5 * confidence, 2) if best["score"] > 0.5 else round(0.5 * confidence, 2)
    margin_confidence = confidence

    # The margin alone can't see a muddy mix: a full band with vocals can make
    # every note about as loud as every other, and the winner still "wins".
    # Flatness = how loud the 5 weakest notes are next to the 7 strongest (a
    # key's scale). Clear recordings sit at 0.15-0.45; dense, ambiguous mixes
    # at 0.55+. Those shouldn't be reported with high confidence.
    profile = np.sort(chroma_mean / (chroma_mean.max() + 1e-9))[::-1]
    flatness = float(profile[7:].mean() / (profile[:7].mean() + 1e-9))
    clarity = float(np.clip((KEY_FLATNESS_AMBIGUOUS - flatness) / KEY_FLATNESS_SPAN, 0.0, 1.0))
    confidence *= 0.5 + 0.5 * clarity
    # Most chords uncertain → the key they point to is uncertain too.
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
        # Margin-only confidence, which gates the chord second pass (unchanged).
        "_marginConfidence": margin_confidence,
    }


def _key_chords(mode: str) -> set[tuple[int, str]]:
    """(semitones above the tonic, chord suffix) of the chords that belong to a key."""
    if mode == "major":
        return {(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m"),
                (2, "m7"), (4, "m7"), (7, "7"), (9, "m7")}
    return {(0, "m"), (3, ""), (5, "m"), (7, "m"), (7, ""), (8, ""), (10, ""),
            (0, "m7"), (5, "m7"), (7, "m7"), (7, "7"), (10, "7")}


def _absorb_out_of_key_blips(timeline: list[dict], tonic: int, mode: str, beat_seconds: float) -> list[dict]:
    """
    Folds short, unsure, out-of-key chords into their neighbour. On a strummed
    guitar the old chord rings on while the hand moves, and that overlap can
    read as a third chord: C#m -> D# in G# minor kept showing a half-beat "A"
    (A shares C# and E with C#m). A real passing chord either lasts a beat or
    sounds clearly, so it is kept.
    """
    allowed = _key_chords(mode)

    def in_key(label: str) -> bool:
        root = label[:2] if len(label) > 1 and label[1] == "#" else label[:1]
        return root in NOTE_NAMES and ((NOTE_NAMES.index(root) - tonic) % 12, label[len(root):]) in allowed

    def blip(seg: dict) -> bool:
        return (
            seg["end"] - seg["start"] < BLIP_MAX_BEATS * beat_seconds
            and seg.get("confidence", 1.0) < BLIP_MAX_CONFIDENCE
            and not in_key(seg["chord"])
        )

    out: list[dict] = []
    pending_start: Optional[float] = None  # a blip with no chord right before it: give it to the next one
    for seg in timeline:
        if blip(seg):
            if out and abs(out[-1]["end"] - seg["start"]) < 0.05:
                out[-1]["end"] = seg["end"]  # the previous chord was still ringing
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
    """
    Per-chord score handicap: 0 for chords that belong to the key, else
    KEY_PRIOR_PENALTY. Minor keys also allow the harmonic-minor V and V7
    (D#7 in G# minor). A modest handicap, so a borrowed chord that is
    clearly sounding still wins — it only settles close calls.
    """
    allowed = _key_chords(mode)
    bias = np.full(len(CHORD_LABELS), KEY_PRIOR_PENALTY)
    for i, (root, suffix) in enumerate(zip(CHORD_ROOTS, CHORD_SUFFIXES)):
        if ((root - tonic) % 12, suffix) in allowed:
            bias[i] = 0.0
    return bias


# ─── Chords ─────────────────────────────────────────────────────────────


def _chord_posteriors(chroma: np.ndarray, bass: np.ndarray, voiced: np.ndarray, key_bias: Optional[np.ndarray] = None) -> np.ndarray:
    """Per-frame probability over every chord + a no-chord state, shape (n_chords + 1, n)."""
    norm = np.linalg.norm(chroma, axis=0, keepdims=True)
    chroma_n = chroma / (norm + 1e-9)
    scores = _TEMPLATE_MATRIX @ chroma_n - _QUALITY_PENALTY  # cosine similarity, (n_chords, n)

    bass_n = bass / (bass.max(axis=0, keepdims=True) + 1e-9)
    scores = scores + BASS_WEIGHT * bass_n[CHORD_ROOTS]
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
    segs = []  # [state, start_frame, end_frame)
    start = 0
    for i in range(1, len(states) + 1):
        if i == len(states) or states[i] != states[start]:
            segs.append([int(states[start]), start, i])
            start = i
    return segs


def _merge_short(segs: list[list], posteriors: np.ndarray, min_frames: int) -> list[list]:
    """Absorb blips shorter than `min_frames` into whichever neighbour fits them best."""
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
            # Re-join equal neighbours created by the removal.
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
    D#7 → D# → D#7 is one chord whose 7th comes and goes with the melody,
    not three chords. Join neighbours that share a triad and label the
    whole span with whichever quality has the most evidence across it.
    """
    out: list[list] = []
    for seg in segs:
        prev = out[-1] if out else None
        if (
            prev is not None
            and prev[0] != _NO_CHORD
            and seg[0] != _NO_CHORD
            and triad_of(CHORD_LABELS[prev[0]]) == triad_of(CHORD_LABELS[seg[0]])
        ):
            s, e = prev[1], seg[2]
            family = [i for i in (prev[0], seg[0])]
            prev[0] = max(family, key=lambda i: posteriors[i, s:e].sum())
            prev[2] = e
        else:
            out.append(list(seg))
    return out


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
) -> list[dict]:
    n = chroma.shape[1]
    if n == 0:
        return []
    
    config = DecoderConfig()
    
    beat_frames = []
    if beats_reliable and len(beat_times) > 0:
        frames = librosa.time_to_frames(beat_times, sr=ANALYSIS_SR, hop_length=HOP)
        # Keep only frames strictly inside the audio bounds to avoid empty segments
        beat_frames = [f for f in frames if 0 < f < n]
        beat_frames = list(np.unique(beat_frames))
        
    if len(beat_frames) > 0:
        # Beat-synchronous aggregation
        chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
        bass_sync = librosa.util.sync(bass, beat_frames, aggregate=np.median)
        voiced_sync = librosa.util.sync(voiced.astype(float)[None, :], beat_frames, aggregate=np.mean) > 0.5
        voiced_sync = voiced_sync[0]
        
        posteriors_sync = _chord_posteriors(chroma_sync, bass_sync, voiced_sync, key_bias)
        
        transition = librosa.sequence.transition_loop(posteriors_sync.shape[0], config.self_transition_probability)
        states_sync = librosa.sequence.viterbi_discriminative(posteriors_sync, transition)
        
        boundaries = [0] + beat_frames + [n]
        boundary_times = librosa.frames_to_time(boundaries, sr=ANALYSIS_SR, hop_length=HOP)
        boundary_times[-1] = duration
        
        segs = _segments_from_states(states_sync, boundary_times, duration)
        
        # Merge short segments (less than minimum_segment_duration_beats)
        # Each 'beat' is 1 segment in the sync grid. So duration in beats is (e - s).
        min_frames = max(1, int(round(config.minimum_segment_duration_beats)))
        segs = _merge_short(segs, posteriors_sync, min_frames)
        segs = _merge_same_triad(segs, posteriors_sync)
        
        chord_probs = posteriors_sync[:_NO_CHORD]
        
        timeline = []
        for state, s, e in segs:
            if state == _NO_CHORD:
                continue
            mean_probs = chord_probs[:, s:e].mean(axis=1)
            ranked = np.argsort(mean_probs)[::-1]
            alt = next(int(k) for k in ranked if k != state)
            ratio = mean_probs[state] / (mean_probs[state] + mean_probs[alt] + 1e-9)
            confidence = float(np.clip((ratio - 0.5) / 0.35, 0.0, 1.0))
            
            start = float(boundary_times[s])
            end = float(boundary_times[e])
            
            if end - start <= 0.05:
                continue
            if confidence < NO_CHORD_CONFIDENCE and end - start < 1.0:
                # Retain previous stable chord for brief low-confidence fluctuations?
                # Actually the prompt says "Retain the previous stable chord for brief low-confidence fluctuations, while preserving genuine changes and silence."
                # If we skip here, it becomes "no chord". If we don't, it stays the current chord but marked uncertain.
                # Let's skip if it's very short, otherwise keep.
                pass
                
            timeline.append(
                {
                    "chord": CHORD_LABELS[state],
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "confidence": round(confidence, 2),
                    "alternative": CHORD_LABELS[alt],
                }
            )
            
    else:
        posteriors = _chord_posteriors(chroma, bass, voiced, key_bias)
        transition = librosa.sequence.transition_loop(posteriors.shape[0], config.self_transition_probability)
        states = librosa.sequence.viterbi_discriminative(posteriors, transition)
    
        frame_times = librosa.frames_to_time(np.arange(n + 1), sr=ANALYSIS_SR, hop_length=HOP)
        segs = _segments_from_states(states, frame_times, duration)
        
        # If no beats, minimum duration is in seconds
        min_frames = max(1, int(round(MIN_SEGMENT_SECONDS * ANALYSIS_SR / HOP)))
        segs = _merge_short(segs, posteriors, min_frames)
        segs = _merge_same_triad(segs, posteriors)
    
        chord_probs = posteriors[:_NO_CHORD]
        timeline = []
        for state, s, e in segs:
            if state == _NO_CHORD:
                continue
            mean_probs = chord_probs[:, s:e].mean(axis=1)
            ranked = np.argsort(mean_probs)[::-1]
            alt = next(int(k) for k in ranked if k != state)
            ratio = mean_probs[state] / (mean_probs[state] + mean_probs[alt] + 1e-9)
            confidence = float(np.clip((ratio - 0.5) / 0.35, 0.0, 1.0))
    
            start = float(frame_times[s])
            end = float(min(frame_times[e], duration))
            if end - start <= 0.05:
                continue
            if confidence < NO_CHORD_CONFIDENCE and end - start < 1.0:
                continue
            timeline.append(
                {
                    "chord": CHORD_LABELS[state],
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "confidence": round(confidence, 2),
                    "alternative": CHORD_LABELS[alt],
                }
            )

    # Resolve brief low-confidence fluctuations
    out_timeline = []
    for i, seg in enumerate(timeline):
        if seg["confidence"] < config.confidence_threshold and seg["end"] - seg["start"] < 1.0:
            if out_timeline and out_timeline[-1]["end"] == seg["start"]:
                # Extend previous stable chord
                out_timeline[-1]["end"] = seg["end"]
                continue
        out_timeline.append(seg)
        
    timeline = out_timeline

    for a, b in zip(timeline, timeline[1:]):
        if b["start"] < a["end"] or b["start"] - a["end"] < 0.15:
            b["start"] = a["end"]
    if timeline and timeline[0]["start"] < 0.3:
        timeline[0]["start"] = 0.0
    return timeline


def _voiced_frames(loudness: np.ndarray) -> np.ndarray:
    if loudness.size == 0:
        return np.zeros(0, dtype=bool)
    loud_level = np.percentile(loudness, 95)
    return loudness > SILENCE_RATIO * loud_level


# ─── Meter ──────────────────────────────────────────────────────────────


def estimate_meter(
    onset_env: np.ndarray,
    beat_frames: np.ndarray,
    beat_times: np.ndarray,
    timeline: list[dict],
    reliable: bool,
):
    """
    Picks 3 or 4 beats per bar, and where bar 1 starts, by scoring every
    (bar length, phase) pair on two cues: how much louder the onsets are on
    the candidate downbeats, and how many chord changes land on them.
    Always gives its best estimate (status "estimated"), even for grooves
    without a clear pulse. Returns (time_signature, status, beats_per_bar,
    downbeat_times).
    """
    if len(beat_frames) < 8:
        return "4/4", "estimated", 4, []

    accents = np.array([onset_env[max(0, f - 2): f + 3].max() for f in beat_frames])
    accents = accents / (accents.mean() + 1e-9)

    change_beats = np.zeros(len(beat_times))
    for seg in timeline[1:]:
        i = int(np.argmin(np.abs(beat_times - seg["start"])))
        if abs(beat_times[i] - seg["start"]) < 0.15:
            change_beats[i] = 1.0
    n_changes = change_beats.sum()

    def score(m: int, phase: int) -> float:
        change_share = change_beats[phase::m].sum() / n_changes if n_changes else 0.0
        return float(accents[phase::m].mean() - 1.0 + change_share)

    best = {m: max(range(m), key=lambda p: score(m, p)) for m in (3, 4)}
    s3, s4 = score(3, best[3]), score(4, best[4])
    # Bias toward 4/4 — a wrong confident 3/4 is worse than the common default.
    m = 3 if s3 > s4 + 0.15 else 4
    phase = best[m]
    downbeats = [round(float(t), 3) for t in beat_times[phase::m]]
    return f"{m}/4", "estimated", m, downbeats


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
    y_harm, y_perc = librosa.effects.hpss(y, kernel_size=HPSS_KERNEL, n_fft=HPSS_N_FFT, hop_length=HOP)

    report("beats", 40)
    beats = detect_beats(y_perc, y, sr)

    report("chroma", 60)
    chroma, bass, loudness = _chroma_features(y_harm, sr)
    voiced = _voiced_frames(loudness)
    if not np.any(voiced):
        raise AnalysisInputError("No pitched musical content was found in that file.")

    report("chords", 75)
    timeline = _decode_chords(chroma, bass, voiced, duration, beats["beat_times"], beats["reliable"])

    report("key", 88)
    key = _key_result(chroma, voiced, timeline)
    tonic = key.pop("_tonic")
    key_trusted = key.pop("_marginConfidence") >= 0.5
    if key_trusted:
        # Second pass: now that the key is known, chords outside it need a
        # little more evidence (stops one-off misreads like A in G# minor).
        bias = _key_bias(tonic, key["mode"])
        timeline = _decode_chords(chroma, bass, voiced, duration, beats["beat_times"], beats["reliable"], bias)

    report("meter", 94)
    # Settle on one tempo using the chords too, then re-track beats at it.
    beat_frames, beat_times, bpm = beats["beat_frames"], beats["beat_times"], beats["bpm"]
    if beats["reliable"]:
        # A clear pulse: trust the tracker, only folding a subdivision or a
        # half-time reading back into the range songs are written at.
        chosen = beats["bpm"]
        while chosen > TEMPO_MAX:
            chosen /= 2
        while chosen < TEMPO_MIN:
            chosen *= 2
    else:
        # No clear pulse (busy syncopation, no drums): decide with the
        # repeating chord cycle and chord lengths as well.
        chosen = _choose_tempo(beats["onset_env"], sr, beats["bpm"], _harmonic_cycle(chroma), timeline)
    if abs(chosen - beats["bpm"]) / beats["bpm"] > 0.04:
        # The scoring overruled the tracker's first guess: re-track beats at
        # the chosen tempo. Without a clear pulse the re-tracked spacing can
        # drift a few % (it moved a samba from 86 to 91 BPM), so the tempo
        # number stays the one the scoring chose. When the scoring agreed
        # with the tracker (within 4%), the tracker's measured spacing is
        # the more precise number and is kept as before.
        beat_frames, beat_times, bpm = _track_at(beats["onset_env"], sr, chosen)
        if not beats["reliable"]:
            bpm = chosen
    if key_trusted and bpm > 0:
        timeline = _absorb_out_of_key_blips(timeline, tonic, key["mode"], 60.0 / bpm)
    time_signature, ts_status, beats_per_bar, downbeats = estimate_meter(
        beats["onset_env"], beat_frames, beat_times, timeline, beats["reliable"]
    )

    low_conf = sum(1 for seg in timeline if seg["confidence"] < LOW_CONFIDENCE)

    return {
        **key,
        "bpm": round(float(bpm), 1),
        # "estimated" = no steady drum pulse; the tempo still comes from rhythm + chord changes.
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
        "chordVocabulary": "major/minor triads and sevenths",
        "lowConfidenceThreshold": LOW_CONFIDENCE,
        "lowConfidenceSegments": low_conf,
        "analysisVersion": 2,
    }


def analyze(wav_path: str, progress: Optional[ProgressFn] = None) -> dict:
    report = progress or _noop_progress
    report("decoding", 10)
    y, sr = load_audio(wav_path)
    return analyze_from_array(y, sr, report)
