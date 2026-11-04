"""
Audio extraction — converts ANY uploaded audio or video file into a
standardized mono WAV using ffmpeg, so the analysis engine always works
from a consistent format regardless of what was uploaded (mp3, wav, m4a,
mp4, mov, webm, mkv, etc.).

ffmpeg handles the demuxing/decoding for both audio-only files and the
audio track of video files — this is what makes "upload any video" work.
"""

import logging
import os
import re
import subprocess
import tempfile
import time
import uuid

logger = logging.getLogger(__name__)

# Portable: honours TMPDIR/TEMP so this works on Windows, macOS and Linux
# alike (the previous hardcoded "/tmp/..." only behaved on POSIX).
TMP_DIR = os.path.join(tempfile.gettempdir(), "wilsify-mvp")
os.makedirs(TMP_DIR, exist_ok=True)

TARGET_SAMPLE_RATE = 22050


import shutil

class AudioExtractionError(Exception):
    pass


def find_ffmpeg() -> str | None:
    candidate = os.environ.get("FFMPEG_PATH")
    if candidate and os.path.isfile(candidate):
        return candidate
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        return which_ffmpeg
    candidates = [
        r"C:\Program Files\BlueStacks_nxt\ffmpeg.exe",
        r"C:\Users\Placildo Jayson Dias\AppData\Local\CapCut\Apps\7.1.0.2890\ffmpeg.exe",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None


def extract_audio_to_wav(input_path: str) -> str:
    """
    Extracts or converts `input_path` (audio or video file) into a
    standardized mono, 22.05kHz WAV file suitable for librosa analysis.
    Uses native soundfile decoding for WAV/FLAC/OGG when possible, and
    ffmpeg for MP3, MP4, MOV and other video/audio formats.
    """
    output_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}.wav")

    ext = os.path.splitext(input_path)[1].lower()
    if ext in (".wav", ".flac", ".ogg"):
        try:
            import soundfile as sf
            import librosa
            y, sr = sf.read(input_path)
            if y.ndim > 1:
                y = y.mean(axis=1)
            if sr != TARGET_SAMPLE_RATE:
                y = librosa.resample(y, orig_sr=sr, target_sr=TARGET_SAMPLE_RATE)
            sf.write(output_path, y, TARGET_SAMPLE_RATE, subtype="PCM_16")
            if os.path.exists(output_path):
                return output_path
        except Exception as e:
            logger.info("Direct soundfile read for %s failed, falling back to ffmpeg: %s", input_path, e)

    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        raise AudioExtractionError(
            "Could not read audio from that file. Make sure it's a valid "
            "audio or video file that actually contains an audio track."
        )

    cmd = [
        ffmpeg_bin,
        "-y",  # overwrite
        "-i", input_path,
        "-vn",  # drop any video stream — we only want audio
        "-ac", "1",  # mono
        "-ar", str(TARGET_SAMPLE_RATE),
        "-f", "wav",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0 or not os.path.exists(output_path):
        logger.warning(
            "ffmpeg failed (returncode=%s): %s",
            result.returncode,
            (result.stderr or "")[-2000:],
        )
        raise AudioExtractionError(
            "Could not read audio from that file. Make sure it's a valid "
            "audio or video file that actually contains an audio track."
        )

    return output_path


# ---------------------------------------------------------------------------
# Playback copies: every ingested input (upload, mic blob, fetched link) is
# also transcoded to plain 44.1 kHz 16-bit stereo PCM WAV and served from
# GET /api/audio/{media_id}. Browsers decode that everywhere, it seeks via
# Range requests, and it avoids the headerless MediaRecorder WebM and odd
# video codecs that make <audio> or decodeAudioData() fail mid-playback.
# Copies are temporary: swept after PLAYBACK_TTL_SECONDS or beyond
# PLAYBACK_MAX_FILES (oldest first).
# ---------------------------------------------------------------------------
PLAYBACK_DIR = os.path.join(TMP_DIR, "playback")
PLAYBACK_SAMPLE_RATE = 44100
PLAYBACK_TTL_SECONDS = int(os.environ.get("PLAYBACK_TTL_SECONDS", "7200"))
PLAYBACK_MAX_FILES = int(os.environ.get("PLAYBACK_MAX_FILES", "24"))
_MEDIA_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def sweep_playback_cache(now: float | None = None) -> None:
    """Deletes expired playback copies, then the oldest beyond the file cap."""
    if not os.path.isdir(PLAYBACK_DIR):
        return
    now = time.time() if now is None else now
    entries = []
    for name in os.listdir(PLAYBACK_DIR):
        path = os.path.join(PLAYBACK_DIR, name)
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            continue
        if now - mtime > PLAYBACK_TTL_SECONDS:
            cleanup(path)
        else:
            entries.append((mtime, path))
    entries.sort(reverse=True)
    for _mtime, path in entries[PLAYBACK_MAX_FILES:]:
        cleanup(path)


def normalize_for_playback(input_path: str) -> tuple[str, str]:
    """
    Transcodes `input_path` into a 44.1 kHz 16-bit stereo PCM WAV playback
    copy. Returns `(media_id, wav_path)`. Raises AudioExtractionError when
    ffmpeg is missing or the input has no decodable audio.
    """
    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        raise AudioExtractionError("ffmpeg is not available to normalize audio for playback.")
    os.makedirs(PLAYBACK_DIR, exist_ok=True)
    sweep_playback_cache()
    media_id = uuid.uuid4().hex
    output_path = os.path.join(PLAYBACK_DIR, f"{media_id}.wav")
    cmd = [
        ffmpeg_bin,
        "-y",
        "-v", "error",
        # Headerless MediaRecorder blobs report no duration: let ffmpeg
        # probe further and regenerate timestamps instead of failing.
        "-fflags", "+genpts+discardcorrupt",
        "-i", input_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", str(PLAYBACK_SAMPLE_RATE),
        "-ac", "2",
        "-f", "wav",
        output_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        cleanup(output_path)
        raise AudioExtractionError("Normalizing that file's audio took too long.")
    # A WAV header alone is 44 bytes: anything that small has no audio.
    if result.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) <= 44:
        logger.warning("ffmpeg playback normalization failed (returncode=%s): %s",
                       result.returncode, (result.stderr or "")[-2000:])
        cleanup(output_path)
        raise AudioExtractionError(
            "Could not read audio from that file. Make sure it's a valid "
            "audio or video file that actually contains an audio track."
        )
    return media_id, output_path


def normalize_for_transcription(input_path: str) -> str:
    """
    Input -> 44.1 kHz 16-bit stereo PCM WAV with a 35 Hz high-pass, for note
    transcription: rumble (handling noise, phone mics, room boom) masks the
    attack of plucked strings. Caller deletes the returned file.
    """
    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        raise AudioExtractionError("Could not read audio from that file.")
    output_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}-hp.wav")
    cmd = [
        ffmpeg_bin, "-y", "-v", "error",
        "-fflags", "+genpts+discardcorrupt",
        "-i", input_path,
        "-vn",
        "-af", "highpass=f=35",
        "-acodec", "pcm_s16le",
        "-ar", str(PLAYBACK_SAMPLE_RATE),
        "-ac", "2",
        "-f", "wav",
        output_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        cleanup(output_path)
        raise AudioExtractionError("Reading that file's audio took too long.")
    if result.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) <= 44:
        logger.warning("ffmpeg transcription normalization failed (returncode=%s): %s",
                       result.returncode, (result.stderr or "")[-2000:])
        cleanup(output_path)
        raise AudioExtractionError(
            "Could not read audio from that file. Make sure it's a valid "
            "audio or video file that actually contains an audio track."
        )
    return output_path


def playback_path(media_id: str) -> str | None:
    """Path of a live playback copy, or None for an unknown/expired/malformed id."""
    if not _MEDIA_ID_RE.match(media_id or ""):
        return None
    path = os.path.join(PLAYBACK_DIR, f"{media_id}.wav")
    return path if os.path.isfile(path) else None


def cleanup(*paths: str) -> None:
    for path in paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except OSError:
            pass
