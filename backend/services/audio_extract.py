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


class AudioExtractionError(Exception):
    pass


def extract_audio_to_wav(input_path: str) -> str:
    """
    Runs ffmpeg on `input_path` (any audio or video file) and produces a
    mono, 22.05kHz WAV file suitable for librosa analysis. Returns the path
    to the generated WAV file.
    """
    output_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}.wav")

    cmd = [
        "ffmpeg",
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
        # Log the real ffmpeg output server-side for debugging, but never
        # return it to the client - it exposes build flags and filesystem
        # paths, and means nothing to the person who uploaded the file.
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
