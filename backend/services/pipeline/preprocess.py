"""
Preprocessing (after FFmpeg, before Demucs) and stem quality checks (after Demucs).

What it changes, and only this:
  * the format, if it isn't already 44.1 kHz stereo (FFmpeg normally guarantees it);
  * leading/trailing silence longer than TRIM_MIN_SECONDS (digital silence, below
    SILENCE_DBFS), keeping TRIM_MARGIN_SECONDS of it; silence inside the song is
    never touched;
  * one constant gain, only for very quiet audio, limited so the peak stays under
    -1 dBFS. No compression, limiting, EQ, resampling of the music, pitch or tempo
    change: the music is the same, only louder.

Every analysis time after this stage is relative to the trimmed audio, so the job
adds `offset` back before merging: result timestamps always match the original
upload, which is what the app plays.

What it measures (stored in result.preprocessing):
  * integrated loudness, ITU-R BS.1770-4 (K-weighting, 400 ms blocks, absolute and
    relative gates), and sample peak;
  * clipping: runs of 3+ samples at full scale (single full-scale peaks are normal
    in mastered music);
  * noise: the level and spectral flatness of the quietest active frames — a loud,
    noise-like floor is hiss/hum, a quiet or tonal one is just the music's quiet parts;
  * activity: 1 s windows as silence / music / speech-like. Speech-like = many
    pauses between syllables AND no sustained pitch (music holds notes and chords).
    A heuristic: on its own it only adds a warning. The job fails as "no music"
    only when Demucs also finds no instruments (check_stems), because rap,
    spoken word over a beat and sparse drums can all look speech-like.
"""

import logging
import math
import os
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

from . import errors
from .errors import PipelineError

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
CHANNELS = 2

SILENCE_DBFS = -60.0  # quieter than this is silence (a fade-out's tail, digital zero)
TRIM_MIN_SECONDS = 1.0  # shorter edge silences are left alone
TRIM_MARGIN_SECONDS = 0.5  # kept before the first and after the last sound

QUIET_LUFS = -30.0  # quieter than this gets gain
TARGET_LUFS = -23.0  # EBU R128 programme loudness: where quiet audio is raised to
MAX_GAIN_DB = 20.0
PEAK_CEILING_DBFS = -1.0
MIN_GAIN_DB = 1.0  # smaller corrections aren't worth changing the file for
LOW_VOLUME_LUFS = -35.0

CLIP_LEVEL = 0.999  # int16 full scale decodes to 0.99997 / -1.0
CLIP_RUN = 3
CLIPPING_FRACTION = 0.001  # 0.1 % of samples in clipped runs: "clipping"
HEAVY_CLIPPING_FRACTION = 0.01  # 1 %: "heavy clipping"

NOISE_FLOOR_DBFS = -40.0
NOISE_FLATNESS = 0.2  # white noise ~0.5+; held notes and chords ~0.0-0.1

ANALYSIS_SR = 22050
FRAME = 2048
HOP = 512
WINDOW_SECONDS = 1.0
SPEECH_PAUSE_RATIO = 0.3  # share of frames in a window that are pauses
SPEECH_MAX_STABILITY = 0.5  # share of frames whose strongest pitch class holds ~100 ms

# Stems (Demucs output).
STEM_SILENT_DBFS = -60.0
STEM_ACTIVE_DBFS = -50.0
WEAK_INSTRUMENTS_DB = -20.0  # no_vocals this far under the mix: weak
NO_INSTRUMENTS_DB = -30.0  # ...and this far: practically none
SPEECH_ONLY_FRACTION = 0.4
# "Musical" instruments: a beat, or held pitches. Measured with real Demucs on speech (Windows TTS and
# synthetic): pulse 0.13-0.21, pitch hold 0.44-0.47; on music (pads + drums): pulse 0.79-0.92, hold
# 0.92-0.98; a beatless arpeggio: hold 0.80. Thresholds sit in the gaps.
MIN_PULSE = 0.4
MIN_PITCH_HOLD = 0.6

NO_MUSIC_SILENT = "This file is silent — there is no audio to analyse. Please choose a file with music."
NOT_MUSICAL = "The instruments have no clear beat or held notes; chords and rhythm may be unreliable."
NO_MUSIC_SPEECH = ("This recording seems to be speech only, with no instruments. Wilsify needs music "
                   "with instruments to find chords — please choose a song.")


@dataclass
class Preprocessed:
    wav_path: str
    offset: float  # seconds trimmed from the start of the original audio
    duration: float  # analysed (trimmed) duration
    original_duration: float
    speech_fraction: float
    metrics: dict
    warnings: list[str] = field(default_factory=list)


def _db(x: float) -> float:
    return 20.0 * math.log10(max(x, 1e-12))


# ── loudness (ITU-R BS.1770-4) ─────────────────────────────────────────

def k_weighting(sr: int) -> tuple[tuple[list[float], list[float]], tuple[list[float], list[float]]]:
    """The two BS.1770 pre-filters for any sample rate (libebur128's derivation; at 48 kHz
    it reproduces the coefficients printed in the standard)."""
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(math.pi * f0 / sr)
    vh = 10.0 ** (gain / 20.0)
    vb = vh ** 0.4996667741545416
    a0 = 1.0 + k / q + k * k
    shelf = ([(vh + vb * k / q + k * k) / a0, 2.0 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0],
             [1.0, 2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0])
    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(math.pi * f0 / sr)
    a0 = 1.0 + k / q + k * k
    highpass = ([1.0, -2.0, 1.0], [1.0, 2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0])
    return shelf, highpass


def integrated_loudness(audio: np.ndarray, sr: int) -> Optional[float]:
    """LUFS of (samples, channels) audio; None when every block is below the -70 LUFS gate."""
    (b1, a1), (b2, a2) = k_weighting(sr)
    z = lfilter(b2, a2, lfilter(b1, a1, audio, axis=0), axis=0)
    block, step = int(0.4 * sr), int(0.1 * sr)
    if len(z) < block:
        return None
    power = z ** 2
    cumulative = np.vstack([np.zeros((1, power.shape[1])), np.cumsum(power, axis=0)])
    starts = np.arange(0, len(z) - block + 1, step)
    energy = ((cumulative[starts + block] - cumulative[starts]) / block).sum(axis=1)  # channel weights are 1 for L/R
    loudness = -0.691 + 10.0 * np.log10(np.maximum(energy, 1e-20))
    gated = energy[loudness > -70.0]
    if gated.size == 0:
        return None
    relative = -0.691 + 10.0 * math.log10(gated.mean()) - 10.0
    gated = energy[(loudness > -70.0) & (loudness > relative)]
    return round(-0.691 + 10.0 * math.log10(gated.mean()), 2)


# ── measurements ───────────────────────────────────────────────────────

def clipped_fraction(audio: np.ndarray) -> float:
    """Share of samples inside runs of CLIP_RUN+ consecutive full-scale samples, on any channel."""
    hot = np.abs(audio) >= CLIP_LEVEL
    if not hot.any():
        return 0.0
    total = 0
    for ch in range(hot.shape[1]):
        h = np.concatenate([[False], hot[:, ch], [False]]).astype(np.int8)
        edges = np.flatnonzero(np.diff(h))
        lengths = edges[1::2] - edges[::2]
        total += int(lengths[lengths >= CLIP_RUN].sum())
    return total / hot.size


def _frame_rms_db(mono: np.ndarray) -> np.ndarray:
    import librosa
    return librosa.amplitude_to_db(librosa.feature.rms(y=mono, frame_length=FRAME, hop_length=HOP)[0], ref=1.0)


def _edges(rms_db: np.ndarray, sr: int, duration: float) -> tuple[float, float, float]:
    """(start, end) in seconds of the audio worth keeping, and how long the sound itself lasts."""
    loud = np.flatnonzero(rms_db > SILENCE_DBFS)
    if loud.size == 0:
        return 0.0, 0.0, 0.0
    first = loud[0] * HOP / sr
    last = min(duration, (loud[-1] * HOP + FRAME) / sr)
    start = max(0.0, first - TRIM_MARGIN_SECONDS) if first >= TRIM_MIN_SECONDS else 0.0
    end = min(duration, last + TRIM_MARGIN_SECONDS) if duration - last >= TRIM_MIN_SECONDS else duration
    return start, end, last - first


def _noise(mono: np.ndarray, rms_db: np.ndarray) -> dict:
    import librosa
    active = rms_db > SILENCE_DBFS
    if active.sum() < 10:
        return {"floor_dbfs": None, "flatness": None, "excessive": False}
    floor = float(np.percentile(rms_db[active], 10))
    flat = librosa.feature.spectral_flatness(y=mono, n_fft=FRAME, hop_length=HOP)[0][: len(rms_db)]
    quiet = active & (rms_db <= floor + 3.0)
    flatness = float(np.median(flat[quiet])) if quiet.any() else 0.0
    return {"floor_dbfs": round(floor, 1), "flatness": round(flatness, 3),
            "excessive": floor > NOISE_FLOOR_DBFS and flatness > NOISE_FLATNESS}


def classify_regions(mono: np.ndarray, sr: int) -> dict:
    """Seconds of silence / music / speech-like audio, from 1 s windows (a heuristic, see module doc)."""
    import librosa
    rms = librosa.feature.rms(y=mono, frame_length=FRAME, hop_length=HOP)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=1.0)
    chroma = librosa.feature.chroma_stft(y=mono, sr=sr, n_fft=FRAME, hop_length=HOP)
    n = min(len(rms), chroma.shape[1])
    strongest = chroma[:, :n].argmax(axis=0)
    lag = max(1, int(round(0.1 * sr / HOP)))  # ~100 ms
    per = max(1, int(round(WINDOW_SECONDS * sr / HOP)))
    seconds = {"silence": 0.0, "music": 0.0, "speech_like": 0.0}
    for s in range(0, n, per):
        e = min(n, s + per)
        w = per if e - s == per else e - s
        length = w * HOP / sr
        if rms_db[s:e].max() <= SILENCE_DBFS + 5:
            seconds["silence"] += length
            continue
        mean = rms[s:e].mean()
        pauses = float(np.mean(rms[s:e] < 0.3 * mean))
        voiced = np.flatnonzero(rms_db[s:e] > SILENCE_DBFS + 5) + s
        voiced = voiced[voiced + lag < n]
        stability = float(np.mean(strongest[voiced] == strongest[voiced + lag])) if voiced.size else 0.0
        kind = "speech_like" if pauses > SPEECH_PAUSE_RATIO and stability < SPEECH_MAX_STABILITY else "music"
        seconds[kind] += length
    active = seconds["music"] + seconds["speech_like"]
    return {
        "music_seconds": round(seconds["music"], 1),
        "speech_like_seconds": round(seconds["speech_like"], 1),
        "silence_seconds": round(seconds["silence"], 1),
        "speech_fraction": round(seconds["speech_like"] / active, 3) if active else 0.0,
    }


# ── the stage ──────────────────────────────────────────────────────────

def _read(path: str) -> tuple[np.ndarray, int]:
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    return audio, sr


def preprocess_audio(wav_path: str, out_dir: str, *, min_seconds: float) -> Preprocessed:
    import librosa

    audio, sr = _read(wav_path)
    format_changed = False
    if audio.shape[1] == 1:
        audio = np.repeat(audio, CHANNELS, axis=1)
        format_changed = True
    elif audio.shape[1] > CHANNELS:
        audio = audio[:, :CHANNELS]
        format_changed = True
    if sr != SAMPLE_RATE:
        audio = librosa.resample(audio.T, orig_sr=sr, target_sr=SAMPLE_RATE).T.astype(np.float32)
        sr, format_changed = SAMPLE_RATE, True
    original = len(audio) / sr

    peak = float(np.abs(audio).max()) if audio.size else 0.0
    loudness = integrated_loudness(audio, sr)
    if loudness is None or peak < 10 ** (SILENCE_DBFS / 20):
        raise PipelineError(errors.NO_MUSIC, NO_MUSIC_SILENT)

    clipping = clipped_fraction(audio)  # on the decoded audio: the gain below never clips

    gain_db = 0.0
    if loudness < QUIET_LUFS:
        gain_db = min(TARGET_LUFS - loudness, MAX_GAIN_DB, PEAK_CEILING_DBFS - _db(peak))
        if gain_db < MIN_GAIN_DB:
            gain_db = 0.0
    if gain_db:
        audio = audio * np.float32(10 ** (gain_db / 20))

    # Silence, noise and activity are judged on the audio as analysed (after the gain), so a
    # quiet recording's music is not mistaken for silence and trimmed away.
    mono = librosa.resample(audio.mean(axis=1), orig_sr=sr, target_sr=ANALYSIS_SR)
    rms_db = _frame_rms_db(mono)
    start, end, sounding = _edges(rms_db, ANALYSIS_SR, original)
    if sounding < min_seconds:  # the sound itself, not the kept margins around it
        raise PipelineError(errors.NO_MUSIC, NO_MUSIC_SILENT if end <= start else
                            "There is less than a second of sound in this file — please choose a longer recording.")
    noise = _noise(mono, rms_db)
    regions = classify_regions(mono[int(start * ANALYSIS_SR):int(end * ANALYSIS_SR)], ANALYSIS_SR)

    # Whole samples, and the offset derived from them, so adding it back is exact.
    start_i, end_i = int(round(start * sr)), int(round(end * sr))
    start, end = start_i / sr, end_i / sr
    trimmed = audio[start_i:end_i]
    changed = format_changed or gain_db or start > 0 or end < original
    out_path = wav_path
    if changed:
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "preprocessed.wav")
        sf.write(out_path, trimmed, sr, subtype="FLOAT")

    warnings = []
    if clipping >= HEAVY_CLIPPING_FRACTION:
        warnings.append(f"The audio is heavily clipped ({clipping:.1%} of samples); chords and beats may be less reliable.")
    elif clipping >= CLIPPING_FRACTION:
        warnings.append(f"Some clipping was found in the audio ({clipping:.2%} of samples).")
    if loudness < LOW_VOLUME_LUFS:
        warnings.append(f"The recording is very quiet ({loudness:.0f} LUFS)"
                        + (f"; it was raised by {gain_db:.1f} dB for analysis." if gain_db else "."))
    if noise["excessive"]:
        warnings.append("The recording has a lot of background noise; results may be less reliable.")

    metrics = {
        "sample_rate": sr,
        "channels": CHANNELS,
        "format_converted": bool(format_changed),
        "original_duration": round(original, 3),
        "analysed_duration": round(len(trimmed) / sr, 3),
        "trimmed_start": round(start, 3),
        "trimmed_end": round(original - end, 3),
        "integrated_lufs": loudness,
        "peak_dbfs": round(_db(peak), 2),
        "gain_db": round(gain_db, 2),
        "low_volume": loudness < LOW_VOLUME_LUFS,
        "clipping": {"fraction": round(clipping, 5), "detected": clipping >= CLIPPING_FRACTION,
                     "heavy": clipping >= HEAVY_CLIPPING_FRACTION},
        "noise": noise,
        "regions": regions,
    }
    return Preprocessed(wav_path=out_path, offset=start, duration=len(trimmed) / sr,
                        original_duration=round(original, 3), speech_fraction=regions["speech_fraction"],
                        metrics=metrics, warnings=warnings)


# ── stem quality ───────────────────────────────────────────────────────

def pulse_strength(mono: np.ndarray, sr: int = ANALYSIS_SR) -> float:
    """0-1: how periodic the onsets are (autocorrelation peak at 0.25-1.5 s lags). A beat is ~0.8+,
    speech (and a speech leak in a stem) ~0.1-0.2."""
    import librosa
    env = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=HOP)
    if env.size < 4 or float(env.std()) < 1e-9:
        return 0.0
    ac = librosa.autocorrelate(env - env.mean())
    ac = ac / (ac[0] + 1e-9)
    lo, hi = int(0.25 * sr / HOP), min(len(ac), int(1.5 * sr / HOP))
    return round(float(ac[lo:hi].max()), 3) if hi > lo else 0.0


def pitch_hold(mono: np.ndarray, sr: int = ANALYSIS_SR) -> float:
    """0-1: share of sounding frames whose strongest pitch class is the same ~100 ms later.
    Notes and chords hold (~0.8-1.0); speech glides (~0.1 in a mix, ~0.45 as a stem leak)."""
    import librosa
    rms = librosa.feature.rms(y=mono, frame_length=FRAME, hop_length=HOP)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    chroma = librosa.feature.chroma_stft(y=mono, sr=sr, n_fft=FRAME, hop_length=HOP)
    n = min(len(rms_db), chroma.shape[1])
    top = chroma[:, :n].argmax(axis=0)
    lag = max(1, int(round(0.1 * sr / HOP)))
    # Within 30 dB of the stem's loudest frame, and above silence (else silence would "hold" perfectly).
    sounding = np.flatnonzero((rms_db[:n] > -30.0) & (rms[:n] > 10 ** (SILENCE_DBFS / 20)))
    sounding = sounding[sounding + lag < n]
    return round(float(np.mean(top[sounding] == top[sounding + lag])), 3) if sounding.size else 0.0


def _stem_report(audio: np.ndarray, mix_rms_db: float) -> dict:
    mono = audio.mean(axis=1)
    rms_db = _db(float(np.sqrt(np.mean(mono ** 2)))) if mono.size else -120.0
    frames = mono[: len(mono) // 4096 * 4096].reshape(-1, 4096) if len(mono) >= 4096 else mono.reshape(1, -1)
    frame_db = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1)) + 1e-12)
    over = float(np.mean(np.abs(audio) > 1.0))
    status = "silent" if rms_db < STEM_SILENT_DBFS else "ok"
    return {"rms_dbfs": round(rms_db, 1), "relative_db": round(rms_db - mix_rms_db, 1),
            "peak": round(float(np.abs(audio).max()) if audio.size else 0.0, 3),
            "active_fraction": round(float(np.mean(frame_db > STEM_ACTIVE_DBFS)), 3),
            "clipped_fraction": round(over, 5), "status": status}


def check_stems(stem_paths: dict[str, str], mix_path: str, prep: Preprocessed) -> tuple[dict, list[str]]:
    """Per-stem metrics and warnings; raises when a stem is unusable or there is no music."""
    mix, _ = _read(mix_path)
    mix_rms_db = _db(float(np.sqrt(np.mean(mix.mean(axis=1) ** 2))))
    report, warnings = {}, []
    for name, path in stem_paths.items():
        if not os.path.isfile(path):
            raise PipelineError(errors.SEPARATION_FAILED, "Stem separation failed on this file. Please try another file.")
        audio, sr = _read(path)
        if abs(len(audio) - len(mix)) > 1 or sr != SAMPLE_RATE:
            logger.error("Stem %s has %d samples at %d Hz; the mix has %d", name, len(audio), sr, len(mix))
            raise PipelineError(errors.SEPARATION_FAILED, "Stem separation failed on this file. Please try another file.")
        report[name] = _stem_report(audio, mix_rms_db)
        if name in ("no_vocals", "drums") and report[name]["status"] != "silent":
            import librosa
            mono = librosa.resample(audio.mean(axis=1), orig_sr=sr, target_sr=ANALYSIS_SR)
            report[name]["pulse"] = pulse_strength(mono)
            if name == "no_vocals":
                report[name]["pitch_hold"] = pitch_hold(mono)

    inst = report.get("no_vocals")
    if inst is not None:
        absent = inst["status"] == "silent" or inst["relative_db"] < NO_INSTRUMENTS_DB
        pulse = max(inst.get("pulse", 0.0), (report.get("drums") or {}).get("pulse", 0.0))
        # Speech leaking through Demucs fills the instrument stem with sound but neither a beat nor held notes.
        musical = not absent and (pulse >= MIN_PULSE or inst.get("pitch_hold", 0.0) >= MIN_PITCH_HOLD)
        inst["musical"] = musical
        if not musical and prep.speech_fraction >= SPEECH_ONLY_FRACTION:
            raise PipelineError(errors.NO_MUSIC, NO_MUSIC_SPEECH)
        if absent:
            inst["status"] = "silent" if inst["status"] == "silent" else "weak"
            warnings.append("No instruments were found (voice only); chords may be missing.")
        elif not musical:
            inst["status"] = "weak"
            warnings.append(NOT_MUSICAL)
        elif inst["relative_db"] < WEAK_INSTRUMENTS_DB or inst["active_fraction"] < 0.2:
            inst["status"] = "weak"
            warnings.append("The instruments are very quiet next to the vocals; chords may be less reliable.")
    vocals, drums = report.get("vocals"), report.get("drums")
    if (prep.speech_fraction >= 0.5 and vocals and inst and inst["status"] == "ok"
            and vocals["rms_dbfs"] - inst["rms_dbfs"] > 6.0):
        warnings.append(f"About {prep.speech_fraction:.0%} of the audio sounds like speech.")
    if drums and drums["status"] == "ok" and drums["relative_db"] < WEAK_INSTRUMENTS_DB - 10:
        drums["status"] = "weak"
    if any(r["clipped_fraction"] > CLIPPING_FRACTION for r in report.values()):
        warnings.append("Some separated stems exceed full scale; the source is probably clipped.")
    return report, warnings


def shift_times(offset: float, *, beats: list[float], downbeats: list[float], sections: list[dict],
                chords: list[dict], events: list[dict], analysed: float, total: float) -> dict:
    """Moves trimmed-audio times back onto the original upload's timeline and fills the
    trimmed edges with no-chord spans, so the chord timeline still covers the whole song."""
    def t(x):
        return round(x + offset, 3)
    moved = [{**c, "start": t(c["start"]), "end": t(c["end"])} for c in chords]
    nc = {"chord": "N", "simple": "N", "type": "no_chord"}
    if offset > 0 and moved:
        if moved[0]["type"] == "no_chord":
            moved[0]["start"] = 0.0
        else:
            moved.insert(0, {**nc, "start": 0.0, "end": round(offset, 3)})
    tail = round(offset + analysed, 3)
    if total - tail > 0.001 and moved:
        if moved[-1]["type"] == "no_chord":
            moved[-1]["end"] = round(total, 3)
        else:
            moved.append({**nc, "start": tail, "end": round(total, 3)})
    return {
        "beats": [t(b) for b in beats],
        "downbeats": [t(b) for b in downbeats],
        "sections": [{**s, "start": t(s["start"]), "end": t(s["end"])} for s in sections],
        "chords": moved,
        "events": [{**e, "time": t(e["time"])} for e in events],
    }
