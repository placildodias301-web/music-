"""
Errors a pipeline stage may raise. `message` is shown to the user, so it
never contains paths, tracebacks or library versions; `code` is stable so
the frontend (and tests) can branch on it.
"""


class PipelineError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# Codes used so far; later stages add their own.
FFMPEG_MISSING = "ffmpeg_missing"
FFMPEG_TIMEOUT = "ffmpeg_timeout"
NO_AUDIO_TRACK = "no_audio_track"
DECODE_FAILED = "decode_failed"
AUDIO_TOO_SHORT = "audio_too_short"
AUDIO_TOO_LONG = "audio_too_long"
DEMUCS_MISSING = "demucs_missing"
MODEL_DOWNLOAD_FAILED = "model_download_failed"
SEPARATION_FAILED = "separation_failed"
STEM_MISSING = "stem_missing"
RHYTHM_ENGINE_MISSING = "rhythm_engine_missing"
WSL_UNAVAILABLE = "wsl_unavailable"
ALLIN1_FAILED = "allin1_failed"
BEAT_THIS_FAILED = "beat_this_failed"
RHYTHM_TIMEOUT = "rhythm_timeout"
INVALID_RHYTHM_RESULT = "invalid_rhythm_result"
CHORD_MODEL_MISSING = "chord_model_missing"
CHORD_MODEL_DOWNLOAD_FAILED = "chord_model_download_failed"
CHORD_INFERENCE_FAILED = "chord_inference_failed"
CHORD_TIMEOUT = "chord_timeout"
INVALID_CHORD_RESULT = "invalid_chord_result"
JOB_TIMEOUT = "timeout"
INTERRUPTED = "interrupted"
INTERNAL_ERROR = "internal_error"

GENERIC_FAILURE_MESSAGE = "Analysis failed while processing that file. Please try another file."
