"""
Job API for the analysis pipeline.

    POST /api/pipeline/jobs        multipart `file`  -> 202 {job_id, status, cached, poll_url}
    GET  /api/pipeline/jobs/{id}                     -> JobView (status, stage, progress, error, result)
    GET  /api/pipeline/info                          -> which engine the app should use
    GET  /api/pipeline/health                        -> which stages are ready / need a download / will fail

The upload checks (extension, MIME, magic bytes, 100 MB cap, upload timeout)
are main.py's own, passed in, so both engines accept exactly the same files.
"""

import logging
from typing import Awaitable, Callable

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from services.pipeline.config import PIPELINE_VERSION
from services.pipeline.health import pipeline_health
from services.pipeline.jobs import get_manager
from services.pipeline.schemas import JobView

logger = logging.getLogger(__name__)


def create_pipeline_router(
    validate_upload: Callable[[UploadFile], str],
    save_upload: Callable[[UploadFile, str], Awaitable[tuple[str, int]]],
    display_name: Callable[[str | None], str],
) -> APIRouter:
    router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

    @router.get("/info")
    def pipeline_info():
        cfg = get_manager().config
        return {
            "analysis_engine": cfg.analysis_engine,
            "pipeline_version": PIPELINE_VERSION,
            "max_audio_seconds": cfg.max_audio_seconds,
            "job_timeout_seconds": cfg.job_timeout_seconds,
        }

    @router.get("/health")
    def health():
        # Sync on purpose: FastAPI runs it in the threadpool, so the allin1 probe never blocks the event loop.
        return pipeline_health(get_manager().config)

    @router.post("/jobs", status_code=202)
    async def create_job(file: UploadFile = File(...)):
        ext = validate_upload(file)
        upload_path, _size = await save_upload(file, ext)
        try:
            job_id, cached = await run_in_threadpool(get_manager().submit, upload_path, display_name(file.filename))
        except Exception:
            logger.exception("Could not queue pipeline job")
            raise HTTPException(status_code=500, detail="Could not start the analysis. Please try again.")
        view = get_manager().view(job_id)
        return JSONResponse(
            status_code=202,
            content={
                "job_id": job_id,
                "status": view.status if view else "queued",
                "cached": cached,
                "poll_url": f"/api/pipeline/jobs/{job_id}",
            },
        )

    @router.get("/jobs/{job_id}", response_model=JobView)
    def get_job(job_id: str):
        view = get_manager().view(job_id)
        if view is None:
            raise HTTPException(status_code=404, detail="That analysis job doesn't exist.")
        return view

    return router
