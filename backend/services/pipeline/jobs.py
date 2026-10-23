"""
Background jobs: one worker thread runs one analysis at a time (the later
stages are CPU-heavy; two at once would only make both slower). The API
thread only saves the upload, hashes it and queues it, so no HTTP request
waits on analysis.

Lifecycle: queued -> running (stage, progress) -> completed | failed.
"""

import hashlib
import logging
import os
import queue
import re
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, Optional

from . import errors
from .chord_stage import ChordResult, analyze_chords
from .config import PIPELINE_VERSION, PipelineConfig, load_config
from .demucs_stage import SeparatedStems, separate_stems
from .errors import PipelineError
from .events_stage import EventsResult, analyze_events
from .ffmpeg_stage import ExtractedAudio, extract_wav
from .merge import build_result
from .rhythm_stage import RhythmResult, analyze_rhythm
from .schemas import JobView, PipelineResult
from .store import Store

logger = logging.getLogger(__name__)

JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")

# Where each stage starts on the 0–100 progress bar. Steps 3–9 fill in the gaps.
STAGE_PROGRESS = {
    "queued": 0,
    "extracting": 5,
    "separating": 15,
    "rhythm": 45,
    "chords": 65,
    "events": 85,
    "merging": 95,
    "completed": 100,
}


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class JobContext:
    job_id: str
    workdir: str
    input_path: str
    config: PipelineConfig
    deadline: float
    report: Callable[[str, Optional[float]], None]
    audio: Optional[ExtractedAudio] = None
    stems: Optional[SeparatedStems] = None
    rhythm: Optional[RhythmResult] = None
    chords: Optional[ChordResult] = None
    events: Optional[EventsResult] = None
    engines: dict[str, str] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def remaining(self) -> float:
        return self.deadline - time.monotonic()


def _stage_span(stage: str, next_stage: str) -> Callable[[float], float]:
    """Maps a stage's own 0–100 onto its slice of the job's progress bar."""
    lo, hi = STAGE_PROGRESS[stage], STAGE_PROGRESS[next_stage]
    return lambda pct: round(lo + (hi - lo) * max(0.0, min(pct, 100.0)) / 100.0, 1)


def run_pipeline(ctx: JobContext) -> PipelineResult:
    """The stage sequence: FFmpeg -> Demucs -> rhythm -> chords -> events -> merge."""
    cfg = ctx.config

    ctx.report("extracting", None)
    ctx.audio = extract_wav(
        ctx.input_path, ctx.workdir,
        sample_rate=cfg.sample_rate,
        timeout_seconds=min(cfg.ffmpeg_timeout_seconds, ctx.remaining()),
        min_seconds=cfg.min_audio_seconds,
        max_seconds=cfg.max_audio_seconds,
    )
    ctx.engines["extract"] = "ffmpeg"
    container = ctx.audio.container_duration
    if container is not None and abs(container - ctx.audio.duration) > 0.5:
        ctx.warnings.append(
            f"Decoded audio is {ctx.audio.duration:.2f} s but the file reports {container:.2f} s; "
            "timestamps follow the decoded audio."
        )

    ctx.report("separating", None)
    to_job_pct = _stage_span("separating", "rhythm")
    # report() also enforces the job deadline, so a timed-out job stops at the next Demucs chunk.
    ctx.stems = separate_stems(
        ctx.audio.wav_path, os.path.join(ctx.workdir, "stems"),
        device=cfg.demucs_device,
        progress=lambda pct: ctx.report("separating", to_job_pct(pct)),
    )
    ctx.engines["separation"] = f"demucs:{ctx.stems.model}@{ctx.stems.device}"
    ctx.warnings.extend(ctx.stems.warnings)

    ctx.report("rhythm", None)
    rhythm_pct = _stage_span("rhythm", "chords")
    ctx.rhythm = analyze_rhythm(
        ctx.stems.paths["no_vocals"], os.path.join(ctx.workdir, "rhythm"),
        duration=ctx.audio.duration,
        config=cfg,
        remaining=ctx.remaining,
        progress=lambda pct: ctx.report("rhythm", rhythm_pct(pct)),
    )
    ctx.engines["rhythm"] = ctx.rhythm.engine
    ctx.warnings.extend(ctx.rhythm.warnings)

    ctx.report("chords", None)
    chords_pct = _stage_span("chords", "events")
    ctx.chords = analyze_chords(
        ctx.stems.paths["no_vocals"],
        duration=ctx.audio.duration,
        config=cfg,
        remaining=ctx.remaining,
        progress=lambda pct: ctx.report("chords", chords_pct(pct)),
    )
    ctx.engines["chords"] = ctx.chords.engine
    ctx.warnings.extend(ctx.chords.warnings)

    ctx.report("events", None)
    ctx.events = analyze_events(
        chords=ctx.chords.chords,
        beats=ctx.rhythm.beats,
        downbeats=ctx.rhythm.downbeats,
        sections=ctx.rhythm.sections,
        drums_path=ctx.stems.paths.get("drums", ""),
        duration=ctx.audio.duration,
    )
    ctx.engines["events"] = ctx.events.engine
    ctx.warnings.extend(ctx.events.warnings)

    ctx.report("merging", None)
    return build_result(
        audio_duration=ctx.audio.duration,
        sample_rate=ctx.audio.sample_rate,
        bpm=ctx.rhythm.bpm,
        time_signature=ctx.rhythm.time_signature,
        beats=ctx.rhythm.beats,
        downbeats=ctx.rhythm.downbeats,
        sections=ctx.rhythm.sections,
        chords=ctx.events.chords,
        events=ctx.events.events,
        engines=ctx.engines,
        warnings=ctx.warnings,
    )


def _timeout_message(seconds: int) -> str:
    limit = f"{seconds // 60} minutes" if seconds >= 120 else f"{seconds} seconds"
    return f"Analysis took longer than {limit} and was stopped."


class JobManager:
    def __init__(self, config: PipelineConfig, pipeline: Callable[[JobContext], PipelineResult] = run_pipeline):
        self.config = config
        self.pipeline = pipeline
        self.store = Store(config.db_path)
        os.makedirs(config.jobs_dir, exist_ok=True)
        self._queue: "queue.Queue[Optional[str]]" = queue.Queue()
        self._submit_lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        n = self.store.fail_interrupted_jobs(errors.INTERRUPTED, "The server restarted during this analysis. Please upload the file again.")
        if n:
            logger.warning("Marked %d unfinished pipeline job(s) as interrupted", n)

    # ── API side ───────────────────────────────────────────────────────
    def submit(self, upload_path: str, file_name: str) -> tuple[str, bool]:
        """
        Takes ownership of `upload_path` (moves or deletes it). Returns
        (job_id, cached). A cached file yields an already-completed job; a
        file that is already queued/running returns that job instead of
        analysing it twice.
        """
        try:
            file_hash = sha256_file(upload_path)
            with self._submit_lock:
                if self.store.get_result(file_hash, PIPELINE_VERSION) is not None:
                    job_id = uuid.uuid4().hex
                    self.store.create_job(job_id, file_hash, file_name, status="completed", stage="completed",
                                          progress=100, cached=True)
                    return job_id, True
                active = self.store.active_job_for_hash(file_hash)
                if active:
                    return active["id"], False

                job_id = uuid.uuid4().hex
                workdir = os.path.join(self.config.jobs_dir, job_id)
                os.makedirs(workdir)
                ext = os.path.splitext(upload_path)[1].lower()
                shutil.move(upload_path, os.path.join(workdir, "input" + ext))
                self.store.create_job(job_id, file_hash, file_name)
        finally:
            if os.path.exists(upload_path):
                os.remove(upload_path)
        self._ensure_worker()
        self._queue.put(job_id)
        return job_id, False

    def view(self, job_id: str) -> Optional[JobView]:
        if not JOB_ID_RE.match(job_id or ""):
            return None
        job = self.store.get_job(job_id)
        if not job:
            return None
        result = None
        if job["status"] == "completed":
            raw = self.store.get_result(job["file_hash"], PIPELINE_VERSION)
            result = PipelineResult(**raw) if raw else None
        end = job["finished_at"] or time.time()
        return JobView(
            job_id=job["id"],
            status=job["status"],
            stage=job["stage"],
            progress=round(job["progress"], 1),
            file_name=job["file_name"],
            cached=bool(job["cached"]),
            created_at=job["created_at"],
            updated_at=job["updated_at"],
            elapsed_seconds=round(end - job["created_at"], 2),
            error={"code": job["error_code"], "message": job["error_message"]} if job["status"] == "failed" else None,
            result=result,
        )

    # ── worker side ────────────────────────────────────────────────────
    def _ensure_worker(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._worker, name="pipeline-worker", daemon=True)
        self._thread.start()

    def shutdown(self, timeout: float = 5.0) -> None:
        if self._thread and self._thread.is_alive():
            self._queue.put(None)
            self._thread.join(timeout)

    def _worker(self) -> None:
        while True:
            job_id = self._queue.get()
            if job_id is None:
                return
            try:
                self._run(job_id)
            except Exception:  # never let one job kill the worker
                logger.exception("Pipeline worker crashed on job %s", job_id)

    def _run(self, job_id: str) -> None:
        job = self.store.get_job(job_id)
        if not job or job["status"] != "queued":
            return
        workdir = os.path.join(self.config.jobs_dir, job_id)
        inputs = [f for f in os.listdir(workdir) if f.startswith("input")] if os.path.isdir(workdir) else []
        deadline = time.monotonic() + self.config.job_timeout_seconds

        def report(stage: str, pct: Optional[float] = None) -> None:
            if time.monotonic() > deadline:
                raise PipelineError(errors.JOB_TIMEOUT, _timeout_message(self.config.job_timeout_seconds))
            self.store.update_job(job_id, stage=stage, progress=STAGE_PROGRESS.get(stage, 0) if pct is None else pct)

        started = time.perf_counter()
        succeeded = False
        try:
            if not inputs:
                raise PipelineError(errors.INTERNAL_ERROR, errors.GENERIC_FAILURE_MESSAGE)
            self.store.update_job(job_id, status="running")
            ctx = JobContext(job_id=job_id, workdir=workdir, input_path=os.path.join(workdir, inputs[0]),
                             config=self.config, deadline=deadline, report=report)
            result = self.pipeline(ctx)
            if time.monotonic() > deadline:
                raise PipelineError(errors.JOB_TIMEOUT, _timeout_message(self.config.job_timeout_seconds))
            self.store.save_result(job["file_hash"], PIPELINE_VERSION, result.model_dump())
            self.store.update_job(job_id, status="completed", stage="completed", progress=100)
            succeeded = True
            logger.info("Pipeline job %s completed in %.1f s", job_id, time.perf_counter() - started)
        except PipelineError as e:
            logger.info("Pipeline job %s failed: %s", job_id, e.code)
            self.store.update_job(job_id, status="failed", error_code=e.code, error_message=e.message)
        except Exception:
            # Real traceback stays in the server log; the user gets a generic message.
            logger.exception("Pipeline job %s crashed", job_id)
            self.store.update_job(job_id, status="failed", error_code=errors.INTERNAL_ERROR,
                                  error_message=errors.GENERIC_FAILURE_MESSAGE)
        finally:
            self._clean_workdir(workdir, keep_stems=succeeded and self.config.keep_stems)

    @staticmethod
    def _clean_workdir(workdir: str, keep_stems: bool) -> None:
        """Deletes the job's files; with PIPELINE_KEEP_STEMS only stems/ survives (and only after success)."""
        if not keep_stems or not os.path.isdir(os.path.join(workdir, "stems")):
            shutil.rmtree(workdir, ignore_errors=True)
            return
        for name in os.listdir(workdir):
            if name != "stems":
                path = os.path.join(workdir, name)
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    os.remove(path)


_manager: Optional[JobManager] = None
_manager_lock = threading.Lock()


def get_manager() -> JobManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = JobManager(load_config())
        return _manager


def set_manager(manager: Optional[JobManager]) -> None:
    """Tests swap in a manager with its own temp data dir (and fake stages)."""
    global _manager
    with _manager_lock:
        if _manager is not None and _manager is not manager:
            _manager.shutdown()
        _manager = manager
