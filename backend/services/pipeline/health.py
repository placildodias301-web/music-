"""
Readiness of every pipeline engine, for GET /api/pipeline/health.

Nothing here downloads or loads a model: packages are found with
importlib.util.find_spec (no import), and weights are looked up in the local
caches the engines use (Hugging Face cache for Demucs 4.1 and BTC, torch hub
for beat_this, lv-chordia's own data folder). The one thing that runs is the
allin1 probe: `<PIPELINE_WSL_COMMAND> -c "import allin1"`, time-limited.

Statuses: ready | needs_download (works only if the first-use download
succeeds) | unavailable (will fail) | disabled (turned off in settings).
"""

import importlib.util
import logging
import os
import shutil
import subprocess
from typing import Optional

import yaml

from services.audio_extract import find_ffmpeg

from .chords import btc_adapter, lv_chordia_adapter
from .config import PIPELINE_VERSION, PipelineConfig
from .rhythm import allin1_adapter, beat_this_adapter

logger = logging.getLogger(__name__)

READY, NEEDS_DOWNLOAD, UNAVAILABLE, DISABLED = "ready", "needs_download", "unavailable", "disabled"
ALLIN1_PROBE_SECONDS = 20
DEMUCS_REPO = "adefossez/HTDemucs"  # where demucs 4.1 (demucs/hf.py) fetches htdemucs
BTC_FILES = ("modeling_btc.py", "btc_model_large_voca.pt", "btc_src/btc_model.py", "btc_src/features.py",
             "btc_src/transformer_modules.py")


def _status(status: str, detail: str) -> dict:
    return {"status": status, "detail": detail}


def _installed(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):
        return False


def _hf_cached(repo: str, filename: str, revision: Optional[str] = None) -> Optional[str]:
    """Local path of a cached Hugging Face file, or None. Never touches the network."""
    from huggingface_hub import try_to_load_from_cache
    path = try_to_load_from_cache(repo, filename, revision=revision)
    return path if isinstance(path, str) and os.path.isfile(path) else None


# ── components ─────────────────────────────────────────────────────────

def check_ffmpeg() -> dict:
    if find_ffmpeg():
        return _status(READY, "ffmpeg found.")
    return _status(UNAVAILABLE, "ffmpeg not found on PATH or at FFMPEG_PATH.")


def check_demucs() -> dict:
    if not (_installed("torch") and _installed("demucs")):
        return _status(UNAVAILABLE, "demucs/torch are not installed (pip install -r requirements.txt).")
    if not _installed("huggingface_hub"):
        return _status(NEEDS_DOWNLOAD, "demucs is installed; its weights cache could not be checked.")
    bag = _hf_cached(DEMUCS_REPO, "htdemucs.yaml")
    if bag:
        try:
            with open(bag, encoding="utf-8") as f:
                models = yaml.safe_load(f)["models"]
            if all(_hf_cached(DEMUCS_REPO, f"{sig}.safetensors") for sig in models):
                return _status(READY, "htdemucs weights are cached.")
        except Exception:  # unreadable bag file: treat as not cached
            logger.warning("Could not read the cached htdemucs.yaml", exc_info=True)
    return _status(NEEDS_DOWNLOAD, "htdemucs weights (~80 MB) download on first use.")


def check_allin1(cfg: PipelineConfig) -> dict:
    if not cfg.wsl_enabled:
        return _status(DISABLED, "PIPELINE_WSL_ENABLED=0.")
    argv = allin1_adapter.parse_command(cfg.wsl_command)
    if not argv or shutil.which(argv[0]) is None:
        return _status(UNAVAILABLE, "The PIPELINE_WSL_COMMAND program was not found.")
    try:
        proc = subprocess.run(argv + ["-c", "import allin1"], capture_output=True, timeout=ALLIN1_PROBE_SECONDS)
    except subprocess.TimeoutExpired:
        return _status(UNAVAILABLE, f"The allin1 Python did not answer within {ALLIN1_PROBE_SECONDS} seconds.")
    except OSError:
        return _status(UNAVAILABLE, "The PIPELINE_WSL_COMMAND program could not be started.")
    if proc.returncode == 0:
        return _status(READY, "allin1 imports in the WSL2 Python (its models download on first use).")
    err = proc.stderr.decode("utf-8", "replace").replace("\x00", "")
    if "No module named" in err and "allin1" in err:
        return _status(UNAVAILABLE, "allin1 is not installed in the WSL2 Python.")
    return _status(UNAVAILABLE, "WSL2 or its Python could not run allin1 (check PIPELINE_WSL_COMMAND).")


def beat_this_checkpoint_path() -> str:
    import torch
    return os.path.join(torch.hub.get_dir(), "checkpoints", f"beat_this-{beat_this_adapter.CHECKPOINT}.ckpt")


def check_beat_this() -> dict:
    if not (_installed("torch") and _installed("beat_this")):
        return _status(UNAVAILABLE, "beat_this is not installed (pip install beat-this).")
    if os.path.isfile(beat_this_checkpoint_path()):
        return _status(READY, f"The beat_this {beat_this_adapter.CHECKPOINT} checkpoint is cached.")
    return _status(NEEDS_DOWNLOAD, f"The beat_this {beat_this_adapter.CHECKPOINT} checkpoint downloads on first use "
                                   "from cloud.cp.jku.at.")


def check_btc() -> dict:
    if not (_installed("torch") and _installed("transformers")):
        return _status(UNAVAILABLE, "BTC needs transformers (pip install transformers).")
    revision = btc_adapter.REVISION[:7]
    if all(_hf_cached(btc_adapter.REPO, f, btc_adapter.REVISION) for f in BTC_FILES):
        return _status(READY, f"BTC {revision} is cached.")
    return _status(NEEDS_DOWNLOAD, f"BTC {revision} (~24 MB) downloads on first use from Hugging Face.")


def check_lv_chordia() -> dict:
    reason = lv_chordia_adapter.unavailable_reason()
    return _status(UNAVAILABLE, reason + ".") if reason else _status(READY, "lv-chordia and its weights are installed.")


# ── stages ─────────────────────────────────────────────────────────────

def _stage(component: dict, engine: str, detail: Optional[str] = None) -> dict:
    return {"status": component["status"], "engine": engine, "detail": detail or component["detail"]}


def _rhythm_stage(cfg: PipelineConfig, allin1: dict, beat_this: dict) -> dict:
    if cfg.rhythm_engine == "beat_this":
        return _stage(beat_this, "beat_this")
    if cfg.rhythm_engine == "allin1":
        return _stage(allin1 if allin1["status"] != DISABLED else _status(UNAVAILABLE, allin1["detail"]), "allin1")
    if allin1["status"] == READY:
        return _stage(allin1, "allin1")
    return _stage(beat_this, "beat_this",
                  f"allin1 is not used ({allin1['detail']}) {beat_this['detail']} Song sections will be empty.")


def _chord_stage(cfg: PipelineConfig, btc: dict, lv: dict) -> dict:
    if cfg.chord_engine == "btc":
        return _stage(btc, "btc")
    if cfg.chord_engine == "lv_chordia":
        return _stage(lv, "lv_chordia")
    if btc["status"] == READY:
        return _stage(btc, "btc")
    if lv["status"] == READY:
        # BTC is tried first; whether or not its download works, lv-chordia covers it.
        return _stage(lv, "btc" if btc["status"] == NEEDS_DOWNLOAD else "lv_chordia",
                      f"{btc['detail']} lv-chordia is ready as the fallback.")
    return _stage(btc, "btc", f"{btc['detail']} No fallback: {lv['detail']}")


def pipeline_health(cfg: PipelineConfig) -> dict:
    components = {
        "ffmpeg": check_ffmpeg(),
        "demucs": check_demucs(),
        "allin1": check_allin1(cfg),
        "beat_this": check_beat_this(),
        "btc": check_btc(),
        "lv_chordia": check_lv_chordia(),
    }
    events = (_status(READY, "librosa onset analysis of the drums stem.") if _installed("librosa")
              else _status(UNAVAILABLE, "librosa is not installed."))
    stages = {
        "extracting": _stage(components["ffmpeg"], "ffmpeg"),
        "separating": _stage(components["demucs"], "demucs:htdemucs"),
        "rhythm": _rhythm_stage(cfg, components["allin1"], components["beat_this"]),
        "chords": _chord_stage(cfg, components["btc"], components["lv_chordia"]),
        "events": _stage(events, "heuristic"),
    }
    return {
        "ready": all(s["status"] == READY for s in stages.values()),
        "pipeline_version": PIPELINE_VERSION,
        "stages": stages,
        "will_fail": [name for name, s in stages.items() if s["status"] == UNAVAILABLE],
        "needs_download": [name for name, s in stages.items() if s["status"] == NEEDS_DOWNLOAD],
        "components": components,
    }
