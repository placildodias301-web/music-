"""
Stage 2: the extracted WAV -> vocals / no_vocals / drums stems.

The separation itself is services/stem_separation.py (htdemucs, shared with
the Stems page); this stage only picks the device, turns failures into
pipeline error codes and writes the three stems the later stages need:

    stems/vocals.wav     — for nothing yet (kept for lyrics/melody later)
    stems/no_vocals.wav  — drums + bass + other: chord recognition input
    stems/drums.wav      — drum-fill detection input

Stems are 32-bit float WAV at the extracted audio's 44.1 kHz and exactly the
same length, so stem timestamps equal the original upload's timestamps.

Timeout: the job deadline is checked in Demucs's per-chunk progress
callback, so a job past its deadline stops at the next chunk boundary
(chunks are ~8 s of audio). Work inside one chunk, and the first-time model
download/load, cannot be interrupted.
"""

import logging
import os
from dataclasses import dataclass
from typing import Callable

import numpy as np
import soundfile as sf

from services import stem_separation

from . import errors
from .errors import PipelineError

logger = logging.getLogger(__name__)

MODEL = stem_separation.MODEL_4  # htdemucs: vocals, drums, bass, other
STEM_FILES = ("vocals", "no_vocals", "drums")

INSTALL_HINT = (
    "Demucs isn't installed on this server. In backend/, run: "
    "pip install torch --index-url https://download.pytorch.org/whl/cpu ; pip install -r requirements.txt"
)


@dataclass
class SeparatedStems:
    paths: dict[str, str]  # "vocals" | "no_vocals" | "drums" -> wav path
    device: str
    model: str
    warnings: list[str]


def resolve_device(requested: str) -> tuple[str, str | None]:
    """The device to run on, plus a warning when the requested one can't be used."""
    try:
        import torch
    except ImportError:
        raise PipelineError(errors.DEMUCS_MISSING, INSTALL_HINT)

    requested = (requested or "cpu").strip().lower()
    if requested == "cpu":
        return "cpu", None
    if requested == "cuda" or requested.startswith("cuda:"):
        if torch.cuda.is_available():
            index = int(requested.split(":")[1]) if ":" in requested and requested.split(":")[1].isdigit() else 0
            if index < torch.cuda.device_count():
                return requested, None
        return "cpu", f"DEMUCS_DEVICE={requested} but no such CUDA GPU is available; stems were separated on the CPU."
    if requested == "mps":
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return "mps", None
        return "cpu", "DEMUCS_DEVICE=mps but Apple MPS is not available; stems were separated on the CPU."
    return "cpu", f"Unknown DEMUCS_DEVICE={requested!r} (use cpu, cuda, cuda:N or mps); stems were separated on the CPU."


def _read_stereo(wav_path: str) -> np.ndarray:
    audio, _sr = sf.read(wav_path, dtype="float32", always_2d=True)  # (samples, channels)
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    return np.ascontiguousarray(audio[:, :2].T)  # (2, samples), what separate() expects


def separate_stems(wav_path: str, out_dir: str, *, device: str,
                   progress: Callable[[float], None] = lambda _pct: None) -> SeparatedStems:
    """`progress` gets 0–100 per Demucs chunk; it may raise (e.g. the job timeout) to stop the run."""
    device, device_warning = resolve_device(device)
    warnings = [device_warning] if device_warning else []

    try:
        stem_separation.load_model(MODEL, device)
    except ImportError:
        logger.exception("Demucs import failed")
        raise PipelineError(errors.DEMUCS_MISSING, INSTALL_HINT)
    except Exception:
        # Network errors, HTTP errors, a bad checksum (demucs ModelLoadingError),
        # a truncated checkpoint, a full disk — all mean "no usable weights".
        logger.exception("Demucs model %s could not be loaded on %s", MODEL, device)
        raise PipelineError(
            errors.MODEL_DOWNLOAD_FAILED,
            "Could not download or load the Demucs model (~80 MB, downloaded once on first use). "
            "Check the server's internet connection and disk space, then try again.",
        )

    wav = _read_stereo(wav_path)
    try:
        stems = stem_separation.separate(wav, progress, MODEL, device=device)
    except PipelineError:
        raise  # the job timeout, raised from the progress callback
    except ImportError:
        logger.exception("Demucs import failed during separation")
        raise PipelineError(errors.DEMUCS_MISSING, INSTALL_HINT)
    except Exception as e:
        logger.exception("Demucs separation failed on %s", device)
        if "out of memory" in str(e).lower():
            raise PipelineError(
                errors.SEPARATION_FAILED,
                "Stem separation ran out of memory. Try a shorter file"
                + (", or set DEMUCS_DEVICE=cpu." if device != "cpu" else "."),
            )
        raise PipelineError(errors.SEPARATION_FAILED, "Stem separation failed on this file. Please try another file.")

    missing = [s for s in ("vocals", "drums", "bass", "other") if s not in stems]
    if missing or any(np.asarray(v).shape != wav.shape for v in stems.values()):
        logger.error("Demucs returned unexpected stems: %s", {k: np.asarray(v).shape for k, v in stems.items()})
        raise PipelineError(errors.SEPARATION_FAILED, "Stem separation failed on this file. Please try another file.")

    outputs = {
        "vocals": stems["vocals"],
        "no_vocals": stems["drums"] + stems["bass"] + stems["other"],
        "drums": stems["drums"],
    }
    os.makedirs(out_dir, exist_ok=True)
    paths = {}
    for name in STEM_FILES:
        path = os.path.join(out_dir, f"{name}.wav")
        sf.write(path, np.asarray(outputs[name], dtype=np.float32).T, stem_separation.SAMPLE_RATE, subtype="FLOAT")
        paths[name] = path
    return SeparatedStems(paths=paths, device=device, model=MODEL, warnings=warnings)
