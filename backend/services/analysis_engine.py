"""
Real music analysis engine — genuine signal processing on the uploaded
audio, not mock data. Uses librosa for:

  - Tempo (BPM):   onset-strength based beat tracking
  - Key:           chroma vector correlated against Krumhansl-Kessler
                    major/minor key profiles
  - Chords:        per-segment chroma correlated against major/minor
                    triad templates (root-third-fifth), then collapsed
                    into a chord progression
  - Time signature: lightweight heuristic comparing onset-envelope
                    periodicity at 3-beat vs 4-beat groupings
  - Duration:       straight from the audio length

This is real DSP/music-informatics analysis, so results are estimates —
like any such algorithm, accuracy depends on the material (a solo
acoustic guitar recording will analyze more cleanly than a dense mix).
It is NOT a large neural model and does not claim to be one.
"""

import numpy as np
import librosa

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Kessler key profiles (relative pitch-class weights)
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Chord templates: relative semitone offsets from the root
MAJOR_TRIAD_OFFSETS = [0, 4, 7]
MINOR_TRIAD_OFFSETS = [0, 3, 7]


def _binary_template(offsets: list[int]) -> np.ndarray:
    template = np.zeros(12)
    for offset in offsets:
        template[offset % 12] = 1.0
    return template


CHORD_TEMPLATES = []  # list of (label, template_vector)
for root in range(12):
    major_offsets = [(root + o) % 12 for o in MAJOR_TRIAD_OFFSETS]
    minor_offsets = [(root + o) % 12 for o in MINOR_TRIAD_OFFSETS]
    CHORD_TEMPLATES.append((NOTE_NAMES[root], _binary_template(major_offsets)))
    CHORD_TEMPLATES.append((f"{NOTE_NAMES[root]}m", _binary_template(minor_offsets)))


def load_audio(wav_path: str):
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    return y, sr


def detect_duration(y: np.ndarray, sr: int) -> float:
    return float(len(y) / sr)


def detect_bpm(y: np.ndarray, sr: int):
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    # librosa may return tempo as a 0-d/1-d array depending on version
    tempo_value = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    return round(tempo_value, 1), beat_times, onset_env


def _rotate(vec: np.ndarray, n: int) -> np.ndarray:
    return np.roll(vec, n)


def detect_key(y: np.ndarray, sr: int):
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    chroma_mean = chroma_mean / (np.linalg.norm(chroma_mean) + 1e-9)

    best_score = -np.inf
    best_key_idx = 0
    best_mode = "major"

    for key_idx in range(12):
        major_rot = _rotate(MAJOR_PROFILE, key_idx)
        minor_rot = _rotate(MINOR_PROFILE, key_idx)
        major_rot = major_rot / np.linalg.norm(major_rot)
        minor_rot = minor_rot / np.linalg.norm(minor_rot)

        major_score = float(np.dot(chroma_mean, major_rot))
        minor_score = float(np.dot(chroma_mean, minor_rot))

        if major_score > best_score:
            best_score = major_score
            best_key_idx = key_idx
            best_mode = "major"
        if minor_score > best_score:
            best_score = minor_score
            best_key_idx = key_idx
            best_mode = "minor"

    key_name = NOTE_NAMES[best_key_idx]
    if best_mode == "major":
        return f"{key_name} Major", "major", f"{key_name} Ionian (Major)"
    else:
        return f"{key_name} Minor", "minor", f"{key_name} Aeolian (Natural Minor)"


def detect_chord_timeline(y: np.ndarray, sr: int, beat_times: np.ndarray, max_segments: int = 256):
    """
    Chroma-vs-template chord detection that returns each
    collapsed chord segment WITH its start/end time in the song. This
    timing is what powers the "Contextual AI tutor" (knowing which chord
    is playing "right now") and Practice Mode's real-time accuracy
    tracking (knowing which chord the player *should* be playing).
    """
    hop_length = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    n_frames = chroma.shape[1]
    frame_times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=hop_length)

    if len(beat_times) >= 4:
        boundaries = beat_times
    else:
        duration = frame_times[-1] if len(frame_times) else 0
        boundaries = np.arange(0, duration, 1.0)

    if len(boundaries) < 2:
        boundaries = np.array([0, frame_times[-1] if len(frame_times) else 1.0])

    raw_segments = []  # (chord_label, start, end)
    for i in range(len(boundaries) - 1):
        start, end = float(boundaries[i]), float(boundaries[i + 1])
        mask = (frame_times >= start) & (frame_times < end)
        if not np.any(mask):
            continue
        segment_chroma = chroma[:, mask].mean(axis=1)
        norm = np.linalg.norm(segment_chroma)
        if norm < 1e-6:
            continue
        segment_chroma = segment_chroma / norm

        best_label, best_score = None, -np.inf
        for label, template in CHORD_TEMPLATES:
            score = float(np.dot(segment_chroma, template / np.linalg.norm(template)))
            if score > best_score:
                best_score = score
                best_label = label

        raw_segments.append((best_label, start, end))

    # Collapse consecutive duplicate chords into single spans
    collapsed = []
    for label, start, end in raw_segments:
        if collapsed and collapsed[-1]["chord"] == label:
            collapsed[-1]["end"] = round(end, 2)
        else:
            collapsed.append({"chord": label, "start": round(start, 2), "end": round(end, 2)})

    if not collapsed:
        return [{"chord": "C", "start": 0.0, "end": 1.0}]

    return collapsed[:max_segments]


def estimate_time_signature(onset_env: np.ndarray, beat_times: np.ndarray, sr: int, hop_length: int = 512) -> str:
    """
    Lightweight heuristic: compares the strength of periodicity in the
    onset envelope at 3-beat vs 4-beat groupings to guess between 3/4 and
    4/4. This is a best-effort estimate, not a guaranteed-correct
    downbeat/meter detector. Biased toward 4/4 (the overwhelmingly common
    case in popular music) unless there's a clearly stronger 3-beat
    periodicity signal.
    """
    if len(beat_times) < 8:
        return "4/4"

    avg_beat_period = float(np.mean(np.diff(beat_times)))
    if avg_beat_period <= 0:
        return "4/4"

    autocorr = librosa.autocorrelate(onset_env)

    lag_3 = int(round(avg_beat_period * 3 * sr / hop_length))
    lag_4 = int(round(avg_beat_period * 4 * sr / hop_length))
    lag_3 = min(max(lag_3, 1), len(autocorr) - 1)
    lag_4 = min(max(lag_4, 1), len(autocorr) - 1)

    score_3 = float(autocorr[lag_3])
    score_4 = float(autocorr[lag_4])

    # Require a clearly stronger 3-beat signal before overriding the 4/4
    # default — a wrong confident guess is worse than defaulting.
    return "3/4" if score_3 > score_4 * 1.3 else "4/4"


def analyze_from_array(y: np.ndarray, sr: int) -> dict:
    duration = detect_duration(y, sr)
    bpm, beat_times, onset_env = detect_bpm(y, sr)
    key, mode, scale = detect_key(y, sr)
    chord_timeline = detect_chord_timeline(y, sr, beat_times)
    chords = [seg["chord"] for seg in chord_timeline]
    time_signature = estimate_time_signature(onset_env, beat_times, sr)

    minutes = int(duration // 60)
    seconds = int(duration % 60)
    duration_str = f"{minutes:02d}:{seconds:02d}"

    return {
        "key": key,
        "mode": mode,
        "scale": scale,
        "bpm": bpm,
        "timeSignature": time_signature,
        "durationSeconds": round(duration, 2),
        "duration": duration_str,
        "chordProgression": chords,
        "chordTimeline": chord_timeline,
    }


def analyze(wav_path: str) -> dict:
    y, sr = load_audio(wav_path)
    return analyze_from_array(y, sr)
