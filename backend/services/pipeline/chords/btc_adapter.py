"""
BTC (Bi-directional Transformer for Chord recognition, Park et al., ISMIR
2019) through its Hugging Face packaging, puar-playground/btc-chord, with the
170-chord large vocabulary.

Why the revision is pinned: trust_remote_code=True runs that repo's
modeling_btc.py and btc_src/ inside this server. A branch name ("main") would
run whatever is pushed next; a full commit hash is immutable, so the code and
weights stay exactly the ones reviewed. d436f2f (2026-07-09) is the repo's
latest commit; its code was read before pinning (plain torch/librosa
inference; no network, file or subprocess access beyond the download).
Bump REVISION only after reading the new diff.

The repo (~24 MB) downloads once into the Hugging Face cache (HF_HOME);
after that it loads from the cache without the network.
"""

import logging
import threading

from .. import errors
from ..errors import PipelineError
from . import Heartbeat, RawChords, run_with_heartbeat

logger = logging.getLogger(__name__)

REPO = "puar-playground/btc-chord"
REVISION = "d436f2f664f5107cd987774279b8ce171846e376"
INSTALL_HINT = "Install it in the backend venv: pip install transformers"

_models: dict = {}
_models_lock = threading.Lock()


def _load_model(device: str):
    """BTCForChordRecognition: .predict(path) -> [{"start", "end", "chord"}, ...] in seconds."""
    with _models_lock:
        if device not in _models:
            try:
                from transformers import AutoModel
            except ImportError:
                raise PipelineError(errors.CHORD_MODEL_MISSING, f"BTC needs the transformers package. {INSTALL_HINT}")
            try:
                # code_revision pins modeling_btc.py itself, not only the weights.
                _models[device] = AutoModel.from_pretrained(REPO, trust_remote_code=True, revision=REVISION,
                                                            code_revision=REVISION, device=device)
            except ImportError:
                logger.exception("BTC's code needs a package that is not installed")
                raise PipelineError(errors.CHORD_MODEL_MISSING,
                                    "A package the BTC chord model needs is not installed (see the server log).")
            except Exception as e:  # network, HTTP, cache, checkpoint load
                logger.exception("BTC model %s@%s could not be loaded", REPO, REVISION)
                raise PipelineError(errors.CHORD_MODEL_DOWNLOAD_FAILED,
                                    f"The BTC chord model could not be downloaded or loaded ({type(e).__name__}). "
                                    "Check the server's internet connection, then try again.")
        return _models[device]


def analyze(stem_path: str, *, device: str, timeout_seconds: float, heartbeat: Heartbeat,
            expected_seconds: float = 15.0) -> RawChords:
    def work():
        model = _load_model(device)
        try:
            return model.predict(stem_path)
        except Exception as e:
            logger.exception("BTC inference failed")
            if "out of memory" in str(e).lower():
                raise PipelineError(errors.CHORD_INFERENCE_FAILED, "BTC ran out of memory on this audio.")
            raise PipelineError(errors.CHORD_INFERENCE_FAILED, "BTC could not recognise chords in this audio.")

    segments = run_with_heartbeat(work, name="btc-chords", timeout_seconds=timeout_seconds,
                                  heartbeat=heartbeat, expected_seconds=expected_seconds)
    return RawChords(engine=f"btc@{device}", segments=segments)
