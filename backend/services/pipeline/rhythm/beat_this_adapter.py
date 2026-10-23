"""
Beat This! adapter: beats and downbeats, in this backend's own venv.

It has no section model, so sections are always empty, and no tempo
output, so the stage derives BPM from the beats. Uses the "final0"
checkpoint (downloaded once into the torch hub cache) with the "minimal"
postprocessor, which needs no madmom.

Inference runs in a helper thread so the job can keep reporting progress
and give up at the rhythm/job timeout; Python cannot kill that thread, so
on timeout it finishes in the background and its result is discarded.
"""

import logging
import threading
import time

import numpy as np
import soundfile as sf

from .. import errors
from ..errors import PipelineError
from . import Heartbeat, RawRhythm, estimated_pct

logger = logging.getLogger(__name__)

CHECKPOINT = "final0"
POLL_SECONDS = 0.5
INSTALL_HINT = "Install it in the backend venv: pip install beat-this"

_trackers: dict = {}
_trackers_lock = threading.Lock()


def _load_tracker(device: str):
    """beat_this.inference.Audio2Beats: (signal, sr) -> (beats, downbeats), both in seconds."""
    with _trackers_lock:
        if device not in _trackers:
            from beat_this.inference import Audio2Beats
            _trackers[device] = Audio2Beats(checkpoint_path=CHECKPOINT, device=device, dbn=False)
        return _trackers[device]


def analyze(stem_path: str, *, device: str, timeout_seconds: float, heartbeat: Heartbeat,
            expected_seconds: float = 20.0) -> RawRhythm:
    try:
        tracker = _load_tracker(device)
    except ImportError:
        raise PipelineError(errors.RHYTHM_ENGINE_MISSING, f"beat_this is not installed. {INSTALL_HINT}")
    except Exception as e:  # checkpoint download/load
        logger.exception("beat_this model could not be loaded")
        raise PipelineError(errors.BEAT_THIS_FAILED,
                            f"The beat_this model could not be downloaded or loaded ({type(e).__name__}).")

    try:
        signal, sr = sf.read(stem_path, dtype="float32", always_2d=True)  # (frames, channels); averaged to mono inside
    except (OSError, RuntimeError) as e:
        raise PipelineError(errors.BEAT_THIS_FAILED, f"The no-vocals stem could not be read ({type(e).__name__}).")

    outcome: dict = {}

    def run():
        try:
            outcome["value"] = tracker(signal, sr)
        except BaseException as e:  # handed to the waiting thread
            outcome["error"] = e

    worker = threading.Thread(target=run, name="beat-this", daemon=True)
    started = time.monotonic()
    worker.start()
    while worker.is_alive():
        worker.join(POLL_SECONDS)
        elapsed = time.monotonic() - started
        if worker.is_alive():
            if elapsed > timeout_seconds:
                raise PipelineError(errors.RHYTHM_TIMEOUT,
                                    f"beat_this took longer than {int(timeout_seconds)} seconds and was stopped.")
            heartbeat(estimated_pct(elapsed, expected_seconds))

    if "error" in outcome:
        e = outcome["error"]
        logger.error("beat_this inference failed", exc_info=e)
        if "out of memory" in str(e).lower():
            raise PipelineError(errors.BEAT_THIS_FAILED, "beat_this ran out of memory on this audio.")
        raise PipelineError(errors.BEAT_THIS_FAILED, "beat_this could not analyse this audio.")
    try:
        beats, downbeats = outcome["value"]
        return RawRhythm(engine=f"beat_this@{device}",
                         beats=np.asarray(beats, dtype=float).ravel().tolist(),
                         downbeats=np.asarray(downbeats, dtype=float).ravel().tolist())
    except (KeyError, TypeError, ValueError):
        raise PipelineError(errors.INVALID_RHYTHM_RESULT, "beat_this returned an unexpected result.")
