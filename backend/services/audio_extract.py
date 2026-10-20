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
import subprocess
import tempfile
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


def cleanup(*paths: str) -> None:
    for path in paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except OSError:
            pass
