"""
Stage 1: any audio/video upload -> 44.1 kHz stereo 16-bit WAV.

Always goes through FFmpeg (even for .wav input) so every later stage sees
one format. Stereo is kept because Demucs separates better from stereo.
Timestamps stay aligned with the original file: FFmpeg honours the
container's edit list (e.g. AAC priming in MP4/MOV), and we neither trim
nor pad.
"""

import json
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass

import soundfile as sf

from services.audio_extract import find_ffmpeg

from . import errors
from .errors import PipelineError

logger = logging.getLogger(__name__)


@dataclass
class ExtractedAudio:
    wav_path: str
    duration: float
    sample_rate: int
    # Container duration from ffprobe when available (None otherwise); used
    # only to warn when the decoded audio is noticeably shorter or longer.
    container_duration: float | None


def _find_ffprobe(ffmpeg_bin: str) -> str | None:
    sibling = os.path.join(os.path.dirname(ffmpeg_bin), "ffprobe" + (".exe" if ffmpeg_bin.lower().endswith(".exe") else ""))
    if os.path.isfile(sibling):
        return sibling
    return shutil.which("ffprobe")


def _container_duration(ffprobe_bin: str | None, input_path: str) -> float | None:
    if not ffprobe_bin:
        return None
    try:
        out = subprocess.run(
            [ffprobe_bin, "-v", "error", "-show_entries", "format=duration", "-of", "json", input_path],
            capture_output=True, text=True, timeout=30,
        )
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception:  # best effort: only feeds a warning
        return None


def _classify_ffmpeg_failure(stderr: str) -> PipelineError:
    text = stderr.lower()
    if "does not contain any stream" in text or "matches no streams" in text or "output file is empty" in text:
        return PipelineError(errors.NO_AUDIO_TRACK, "That file has no audio track. Upload a video with sound, or an audio file.")
    return PipelineError(errors.DECODE_FAILED, "Could not read audio from that file. Make sure it's a valid audio or video file.")


def extract_wav(input_path: str, out_dir: str, *, sample_rate: int, timeout_seconds: float,
                min_seconds: float, max_seconds: float) -> ExtractedAudio:
    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        raise PipelineError(
            errors.FFMPEG_MISSING,
            "FFmpeg is not installed on the server. Install it (winget install Gyan.FFmpeg) or set FFMPEG_PATH in backend/.env.",
        )

    wav_path = os.path.join(out_dir, "audio.wav")
    cmd = [
        ffmpeg_bin, "-nostdin", "-hide_banner", "-y",
        "-i", input_path,
        "-map", "0:a:0",          # first audio stream only; fails cleanly when there is none
        "-vn", "-sn", "-dn",
        "-ac", "2",
        "-ar", str(sample_rate),
        "-c:a", "pcm_s16le",
        "-f", "wav",
        wav_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=max(1.0, timeout_seconds))
    except subprocess.TimeoutExpired:
        raise PipelineError(errors.FFMPEG_TIMEOUT, "Extracting the audio took too long. Try a shorter or smaller file.")

    if result.returncode != 0 or not os.path.exists(wav_path) or os.path.getsize(wav_path) <= 44:
        logger.warning("ffmpeg failed (returncode=%s): %s", result.returncode, (result.stderr or "")[-2000:])
        raise _classify_ffmpeg_failure(result.stderr or "")

    try:
        info = sf.info(wav_path)
    except Exception:
        raise PipelineError(errors.DECODE_FAILED, "Could not read audio from that file. Make sure it's a valid audio or video file.")
    duration = float(info.frames) / float(info.samplerate)

    if duration < min_seconds:
        raise PipelineError(errors.AUDIO_TOO_SHORT, f"That audio is too short to analyse (under {min_seconds:g} s).")
    if duration > max_seconds:
        raise PipelineError(
            errors.AUDIO_TOO_LONG,
            f"That audio is {duration / 60:.1f} minutes long; the limit is {max_seconds / 60:.0f} minutes.",
        )

    return ExtractedAudio(
        wav_path=wav_path,
        duration=duration,
        sample_rate=int(info.samplerate),
        container_duration=_container_duration(_find_ffprobe(ffmpeg_bin), input_path),
    )
