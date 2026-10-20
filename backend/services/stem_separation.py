"""
Stem separation (MVP feature 9): splits a song into vocals / drums / bass /
other with Demucs `htdemucs` (MIT licence, runs locally, no paid API).

Jobs run one at a time on a single background thread: separation is the
heaviest thing this server does, and two at once on a CPU would just make
both twice as slow. Uploads and finished stems live under TMP_DIR/stems and
are deleted after STEM_TTL_SECONDS.
"""

import logging
import os
import queue
import shutil
import subprocess
import threading
import time
import uuid

import numpy as np
import soundfile as sf

from services.audio_extract import TMP_DIR, AudioExtractionError, find_ffmpeg

logger = logging.getLogger(__name__)

STEMS_DIR = os.path.join(TMP_DIR, "stems")
STEM_TTL_SECONDS = 60 * 60
SAMPLE_RATE = 44100  # what htdemucs was trained on
MODEL_4 = "htdemucs"  # vocals, drums, bass, other
MODEL_6 = "htdemucs_6s"  # + guitar, piano (Demucs calls it experimental; piano is weak)
SIX_ONLY = ("guitar", "piano")
# Measured 0.35-0.45x on an i7-12650H laptop (CPU only, shifts=0, real clips); used
# for the UI's time estimate. A small 2-vCPU cloud server will be several times slower.
SECONDS_PER_AUDIO_SECOND = 0.5

STEMS = {
    "vocals": "Vocals",
    "drums": "Drums",
    "bass": "Bass",
    "guitar": "Guitar",
    "piano": "Piano / keys",
    "other": "Other (guitar, keys, everything else)",
    "music": "Music (everything except vocals)",  # every stem but vocals, for the 2-stem mode
}
# A stem this far below the mix is treated as "not in the song" and left out
# (e.g. bass and drums of a vocal + guitar recording measured -40 to -57 dB).
# ponytail: level-only check; guitar strums leaking into "drums" can still pass it.
SILENT_DB = -30.0
# Guitar / piano quieter than this aren't trusted and go back into "other", so
# nothing is lost. Real guitars measured -3 to -11 dB; on a keyboard-only song the
# model put -23 dB in "guitar" and -33 dB in "piano".
UNSURE_DB = -20.0


def stem_label(stem: str, model: str) -> str:
    if stem == "other" and model == MODEL_6:
        return "Other (everything else)"
    return STEMS[stem]


class StemError(Exception):
    """User-safe error - the message is shown in the UI as-is."""


# ── audio in / out ─────────────────────────────────────────────────────────

def decode_stereo(path: str) -> np.ndarray:
    """Any audio/video file -> float32 array shaped (2, samples) at 44.1 kHz."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise StemError("Could not read audio from that file.")
    cmd = [ffmpeg, "-v", "error", "-i", path, "-vn", "-ac", "2", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"]
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    if result.returncode != 0 or not result.stdout:
        logger.warning("ffmpeg decode failed: %s", result.stderr[-1000:])
        raise StemError("Could not read audio from that file. Make sure it has an audio track.")
    return np.frombuffer(result.stdout, dtype=np.float32).reshape(-1, 2).T.copy()


def duration_seconds(path: str) -> float:
    try:
        return sf.info(path).duration
    except Exception:
        return decode_stereo(path).shape[1] / SAMPLE_RATE


# ── model ──────────────────────────────────────────────────────────────────

_separators: dict = {}
_separator_lock = threading.Lock()


def _get_separator(model: str, callback):
    """Loads each model once (first use downloads its weights, ~80 MB)."""
    with _separator_lock:
        if model not in _separators:
            from demucs.api import Separator

            # shifts=0: no random time shift, so the same song always gives the same
            # stems. With shifts=1 a guitar song's "bass" swung between -27 and -50 dB
            # from run to run, flipping whether it counted as silent.
            _separators[model] = Separator(model=model, device="cpu", shifts=0, overlap=0.25, split=True)
        _separators[model].update_parameter(callback=callback)
        return _separators[model]


def separate(wav: np.ndarray, progress=lambda _pct: None, model: str = MODEL_4) -> dict[str, np.ndarray]:
    """(2, samples) mix -> {"vocals": (2, samples), "drums": ..., ...}, one entry per model source."""
    import torch

    total = wav.shape[1]

    def on_chunk(info: dict) -> None:
        if info.get("state") == "end":
            progress(min(99, int(100 * (info.get("segment_offset", 0) / max(total, 1)))))

    separator = _get_separator(model, on_chunk)
    _, stems = separator.separate_tensor(torch.from_numpy(wav), SAMPLE_RATE)
    return {name: tensor.numpy() for name, tensor in stems.items()}


def level_db(stem: np.ndarray, mix: np.ndarray) -> float:
    """Loudness of a stem relative to the whole mix, in dB (0 = as loud as the mix)."""
    rms = lambda x: float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))
    return 20 * np.log10(max(rms(stem), 1e-9) / max(rms(mix), 1e-9))


# ── jobs ───────────────────────────────────────────────────────────────────

_jobs: dict[str, dict] = {}
_queue: "queue.Queue[str]" = queue.Queue()
_worker_started = False
_worker_lock = threading.Lock()


def upload_path(upload_id: str) -> str | None:
    folder = os.path.join(STEMS_DIR, "uploads")
    if not upload_id.isalnum() or not os.path.isdir(folder):
        return None
    for name in os.listdir(folder):
        if name.startswith(upload_id + "."):
            return os.path.join(folder, name)
    return None


def store_upload(tmp_path: str, ext: str) -> str:
    folder = os.path.join(STEMS_DIR, "uploads")
    os.makedirs(folder, exist_ok=True)
    upload_id = uuid.uuid4().hex
    shutil.move(tmp_path, os.path.join(folder, upload_id + ext))
    return upload_id


def start_job(upload_id: str, stems: list[str], fmt: str) -> str:
    source = upload_path(upload_id)
    if not source:
        raise StemError("That upload has expired. Please upload the song again.")
    wanted = [s for s in stems if s in STEMS] or list(STEMS)
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {
        "status": "queued", "progress": 0, "message": "Waiting for the separator…",
        "source": source, "stems": wanted, "format": fmt if fmt in ("wav", "flac") else "wav",
        "model": MODEL_6 if set(wanted) & set(SIX_ONLY) else MODEL_4,
        "files": {}, "silent": [], "folded": [], "created": time.time(), "error": None,
    }
    _ensure_worker()
    _queue.put(job_id)
    return job_id


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


def job_file(job_id: str, stem: str) -> str | None:
    job = _jobs.get(job_id)
    return (job or {}).get("files", {}).get(stem)


def _ensure_worker() -> None:
    global _worker_started
    with _worker_lock:
        if not _worker_started:
            threading.Thread(target=_worker, daemon=True, name="stem-worker").start()
            _worker_started = True


def _worker() -> None:
    while True:
        job_id = _queue.get()
        try:
            _run_job(job_id)
        except ImportError:  # torch / demucs not installed on this machine
            logger.exception("Stem job %s: Demucs is not installed", job_id)
            _jobs[job_id].update(
                status="failed",
                error="Stem separation isn't installed on this server yet. In backend/, run: "
                "pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt",
            )
        except Exception:  # never let one bad job kill the worker
            logger.exception("Stem job %s crashed", job_id)
            _jobs[job_id].update(status="failed", error="Separation failed. Please try another file.")


def _run_job(job_id: str) -> None:
    job = _jobs[job_id]
    started = time.perf_counter()
    job.update(status="analyzing", progress=2, message="Decoding audio…")
    try:
        wav = decode_stereo(job["source"])
    except (StemError, AudioExtractionError) as e:
        job.update(status="failed", error=str(e))
        return

    def report(pct: int) -> None:
        job.update(status="separating", progress=5 + pct * 0.9, message="Separating stems…")

    stems = separate(wav, report, job["model"])
    # Unsure guitar / piano go back into "other" rather than becoming a stem of bleed.
    for name in SIX_ONLY:
        if name in stems and level_db(stems[name], wav) < UNSURE_DB:
            stems["other"] = stems["other"] + stems.pop(name)
            if name in job["stems"]:
                job["folded"].append(name)
    stems["music"] = sum(v for k, v in stems.items() if k != "vocals")

    job.update(status="exporting", progress=96, message="Writing files…")
    wanted = [n for n in job["stems"] if n in stems]
    silent = [n for n in wanted if n != "music" and level_db(stems[n], wav) < SILENT_DB]
    keep = [n for n in wanted if n not in silent] or wanted or ["other"]  # never return nothing
    job["silent"] = [n for n in silent if n not in keep]
    out_dir = os.path.join(STEMS_DIR, job_id)
    os.makedirs(out_dir, exist_ok=True)
    for name in keep:
        path = os.path.join(out_dir, f"{name}.{job['format']}")
        sf.write(path, stems[name].T, SAMPLE_RATE, subtype="PCM_16")
        job["files"][name] = path
    elapsed = time.perf_counter() - started
    job.update(status="complete", progress=100, message="Done", seconds=round(elapsed, 1))
    logger.info("Stem job %s: %.1f s audio separated in %.1f s", job_id, wav.shape[1] / SAMPLE_RATE, elapsed)


def sweep_expired(now: float | None = None) -> None:
    """Deletes uploads, stems and job records older than STEM_TTL_SECONDS."""
    now = now or time.time()
    for job_id, job in list(_jobs.items()):
        if now - job["created"] > STEM_TTL_SECONDS and job["status"] in ("complete", "failed"):
            shutil.rmtree(os.path.join(STEMS_DIR, job_id), ignore_errors=True)
            _jobs.pop(job_id, None)
    uploads = os.path.join(STEMS_DIR, "uploads")
    if os.path.isdir(uploads):
        for name in os.listdir(uploads):
            path = os.path.join(uploads, name)
            if now - os.path.getmtime(path) > STEM_TTL_SECONDS:
                try:
                    os.remove(path)
                except OSError:
                    pass
