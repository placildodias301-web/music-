"""
Pitch-shifts an uploaded song by whole semitones without changing its
tempo — powers the "Audio and chords" transpose control on the Analysis
page, so a user can move the recording into a key they can sing or play.

Uses ffmpeg's Rubber Band filter (studio-quality, formant-aware) when the
local ffmpeg build has it, and otherwise falls back to resample + atempo,
which keeps the timing identical but sounds slightly more "processed".
"""

import functools
import os
import subprocess
import uuid

from services.audio_extract import TMP_DIR, AudioExtractionError, find_ffmpeg

MAX_SEMITONES = 12
OUTPUT_SAMPLE_RATE = 44100


@functools.lru_cache(maxsize=1)
def _has_rubberband(ffmpeg: str) -> bool:
    try:
        out = subprocess.run([ffmpeg, "-hide_banner", "-filters"], capture_output=True, text=True, timeout=20)
        return " rubberband " in out.stdout
    except (OSError, subprocess.SubprocessError):
        return False


def _filter_chain(ffmpeg: str, semitones: int) -> str:
    ratio = 2 ** (semitones / 12)
    if _has_rubberband(ffmpeg):
        return f"rubberband=pitch={ratio:.6f}:pitchq=quality:formant=preserved"
    # Speed the audio up/down by `ratio` (raises/lowers pitch), then undo the
    # speed change with atempo so the song still lines up with the chord timeline.
    return (
        f"aresample={OUTPUT_SAMPLE_RATE},"
        f"asetrate={OUTPUT_SAMPLE_RATE * ratio:.3f},"
        f"aresample={OUTPUT_SAMPLE_RATE},"
        f"atempo={1 / ratio:.6f}"
    )


def pitch_shift_to_m4a(input_path: str, semitones: int) -> str:
    """Writes a pitch-shifted AAC copy of `input_path` and returns its path."""
    if not -MAX_SEMITONES <= semitones <= MAX_SEMITONES:
        raise AudioExtractionError(f"Transpose must be between -{MAX_SEMITONES} and +{MAX_SEMITONES} semitones.")

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise AudioExtractionError("Pitch shifting needs ffmpeg, which isn't installed on the server.")

    output_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}.m4a")
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", input_path,
        "-vn",
        "-af", _filter_chain(ffmpeg, semitones),
        "-ar", str(OUTPUT_SAMPLE_RATE),
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        raise AudioExtractionError("Pitch shifting took too long for this file.")
    if result.returncode != 0 or not os.path.exists(output_path):
        raise AudioExtractionError("Couldn't pitch-shift this audio.")
    return output_path
