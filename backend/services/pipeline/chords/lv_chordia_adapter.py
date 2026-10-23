"""
lv-chordia (Jiang et al., ISMIR 2019 large-vocabulary chord recognition):
the fallback when BTC cannot be downloaded or run. Never installed by this
code — it is used only when it is already in the venv and usable.

"Usable" includes its weights: lv-chordia's NetworkInterface silently keeps
random weights when a model file is missing, which would give confident
nonsense, so all five ensemble files are checked before it is run.

It has no device option: it uses CUDA by itself whenever torch sees a GPU.
"""

import importlib.util
import logging
import os
from typing import Optional

from .. import errors
from ..errors import PipelineError
from . import Heartbeat, RawChords, run_with_heartbeat

logger = logging.getLogger(__name__)

CHORD_DICT = "submission"  # its default: maj/min, 7ths, 9/11/13, sus, dim/aug, inversions


def unavailable_reason() -> Optional[str]:
    """None when lv-chordia can run; otherwise why not."""
    if importlib.util.find_spec("lv_chordia") is None:
        return "lv-chordia is not installed"
    try:
        from lv_chordia.chord_recognition import MODEL_NAMES
        from lv_chordia.mir.common import CACHE_DATA_PATH
    except Exception as e:  # ImportError, or a dependency that fails to import
        logger.warning("lv-chordia is installed but cannot be imported: %r", e)
        return "lv-chordia is installed but not compatible with this environment"
    missing = [n for n in MODEL_NAMES if not os.path.isfile(os.path.join(CACHE_DATA_PATH or "", f"{n}.sdict"))]
    if missing:
        return f"lv-chordia's model files are missing ({len(missing)} of {len(MODEL_NAMES)})"
    return None


def _device() -> str:
    import torch
    return "cuda" if torch.cuda.device_count() > 0 else "cpu"


def analyze(stem_path: str, *, timeout_seconds: float, heartbeat: Heartbeat,
            expected_seconds: float = 60.0) -> RawChords:
    reason = unavailable_reason()
    if reason:
        raise PipelineError(errors.CHORD_MODEL_MISSING, f"The lv-chordia chord model is not available: {reason}.")

    def work():
        from lv_chordia import chord_recognition
        try:
            return chord_recognition(stem_path, CHORD_DICT)
        except Exception as e:
            logger.exception("lv-chordia inference failed")
            if "out of memory" in str(e).lower():
                raise PipelineError(errors.CHORD_INFERENCE_FAILED, "lv-chordia ran out of memory on this audio.")
            raise PipelineError(errors.CHORD_INFERENCE_FAILED, "lv-chordia could not recognise chords in this audio.")

    rows = run_with_heartbeat(work, name="lv-chordia", timeout_seconds=timeout_seconds,
                              heartbeat=heartbeat, expected_seconds=expected_seconds)
    try:
        segments = [{"start": r["start_time"], "end": r["end_time"], "chord": r["chord"]} for r in rows]
    except (KeyError, TypeError):
        raise PipelineError(errors.INVALID_CHORD_RESULT, "lv-chordia returned an unexpected result.")
    return RawChords(engine=f"lv_chordia@{_device()}", segments=segments)
