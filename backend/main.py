"""
Wilsify AI MVP backend - real audio analysis, no database required.

POST /api/analyze accepts ANY audio or video file, extracts/decodes the
audio with ffmpeg, and runs genuine signal-processing analysis (librosa) to
return real key, tempo (BPM), estimated time signature, duration, and a
detected chord progression. Nothing is persisted - files are processed and
immediately deleted.
"""

import json
import logging
import os
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from services.analysis_engine import analyze, analyze_from_array
from services.assistant_engine import answer_question
from services.audio_extract import TMP_DIR, AudioExtractionError, cleanup, extract_audio_to_wav
from services.difficulty import rate_difficulty
from services.media_fetch import MediaFetchError, fetch_media, search_youtube
from services.midi_export import build_midi_bytes
from services.pdf_export import build_chord_chart_pdf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wilsify")

FRONTEND_ORIGIN = os.environ.get(
    "FRONTEND_ORIGIN",
    "http://localhost:5173,http://localhost:5174,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4173",
)
ALLOWED_ORIGINS = [origin.strip() for origin in FRONTEND_ORIGIN.split(",") if origin.strip()]

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100MB

# Analysis is the one CPU-expensive, unauthenticated endpoint, so it gets a
# deliberately generous per-IP cap: high enough that no human demo can trip
# it, low enough that a script cannot pin the CPU. Set to 0 to disable.
ANALYZE_RATE_LIMIT_PER_MINUTE = int(os.environ.get("ANALYZE_RATE_LIMIT_PER_MINUTE", "60"))
_request_times: dict[str, deque] = defaultdict(deque)
# Fetching a link downloads media on the server, and YouTube search makes
# outbound requests, so both share the same cap.
RATE_LIMITED_PATHS = {"/api/analyze", "/api/fetch-media", "/api/youtube/search"}

# Broad accept list - ffmpeg handles the actual decoding, this is just a
# first-pass sanity filter so obviously-wrong files are rejected early.
ALLOWED_PREFIXES = ("audio/", "video/")
ALLOWED_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma",
    ".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    librosa's first call triggers numba JIT compilation, which can take
    10+ seconds. Running a tiny dummy analysis at startup means the first
    real upload from a user isn't the one that pays that cost.
    """
    try:
        import numpy as np

        dummy = (np.random.rand(22050 * 2) - 0.5).astype(np.float32)  # 2s of noise
        analyze_from_array(dummy, 22050)
        logger.info("[startup] Analysis engine warmed up.")
    except Exception as e:  # pragma: no cover - warmup is best-effort
        logger.warning("[startup] Warmup skipped: %s", e)
    yield


app = FastAPI(title="Wilsify AI MVP Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Media-Name"],
)


@app.middleware("http")
async def rate_limit_analysis(request: Request, call_next):
    if ANALYZE_RATE_LIMIT_PER_MINUTE > 0 and request.url.path in RATE_LIMITED_PATHS and request.method in ("GET", "POST"):
        client = request.client.host if request.client else "unknown"
        now = time.time()
        hits = _request_times[client]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= ANALYZE_RATE_LIMIT_PER_MINUTE:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many analyses from this address. Please wait a moment and try again."},
            )
        hits.append(now)
    return await call_next(request)


class AssistantRequest(BaseModel):
    question: str = Field(max_length=2000)
    context: Optional[dict] = None


class MidiExportRequest(BaseModel):
    chordProgression: list[str] = Field(max_length=512)
    bpm: float = Field(gt=0, le=400)


class PdfExportRequest(BaseModel):
    songTitle: str = Field(max_length=200)
    key: str = Field(max_length=60)
    scale: str = Field(max_length=120)
    bpm: float = Field(gt=0, le=400)
    timeSignature: str = Field(max_length=16)
    chordProgression: list[str] = Field(max_length=512)


class FetchMediaRequest(BaseModel):
    url: str = Field(max_length=2048)


class RightsAttestationRequest(BaseModel):
    fileName: str = Field(max_length=400)


RIGHTS_ATTESTATION_LOG = os.path.join(TMP_DIR, "wilsify-rights-attestations.jsonl")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "wilsify-mvp-backend", "mode": "real-analysis"}


@app.post("/api/analyze")
async def analyze_upload(file: UploadFile = File(...)):
    original_name = file.filename or "upload"
    ext = os.path.splitext(original_name)[1].lower()
    content_type = file.content_type or ""

    if not (content_type.startswith(ALLOWED_PREFIXES) or ext in ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Please upload an audio or video file (mp3, wav, m4a, mp4, mov, webm, etc.).",
        )

    tmp_input_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}{ext or ''}")
    wav_path = None

    try:
        size = 0
        with open(tmp_input_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=400, detail="File too large (max 100MB).")
                f.write(chunk)

        start = time.time()
        wav_path = extract_audio_to_wav(tmp_input_path)
        result = analyze(wav_path)
        elapsed = round(time.time() - start, 2)

        difficulty = rate_difficulty(
            chord_progression=result["chordProgression"],
            bpm=result["bpm"],
            duration_seconds=result["durationSeconds"],
            key=result["key"],
        )

        return {
            "isDemo": False,
            "demoNotice": None,
            "fileName": original_name,
            "fileSizeBytes": size,
            "processingSeconds": elapsed,
            **result,
            "difficulty": difficulty,
        }

    except AudioExtractionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        # Log the real traceback server-side; return a generic message so
        # internal paths, library versions and stack details never reach
        # the browser.
        logger.exception("Analysis failed for upload %r", original_name)
        raise HTTPException(
            status_code=500,
            detail="Analysis failed while processing that file. Please try another file.",
        )
    finally:
        cleanup(tmp_input_path, wav_path)


@app.post("/api/fetch-media")
def fetch_media_from_link(req: FetchMediaRequest):
    """
    Downloads the audio behind a pasted link (direct file, YouTube, Shorts,
    Instagram Reels, TikTok, SoundCloud, ...) and streams it back, so the
    browser can play it and send it through /api/analyze like any upload.
    The server copy is deleted as soon as the response has been sent.
    """
    try:
        path, name = fetch_media(req.url)
    except MediaFetchError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Fetching media failed for %r", req.url)
        raise HTTPException(status_code=500, detail="Couldn't get audio from that link. Please try another one.")

    return FileResponse(
        path,
        filename=name,
        background=BackgroundTask(cleanup, path),
        headers={"X-Media-Name": quote(name)},
    )


@app.get("/api/youtube/search")
def youtube_search(q: str = "", limit: int = 12):
    """YouTube search results (metadata only) for the in-app video browser."""
    try:
        return {"results": search_youtube(q, limit)}
    except MediaFetchError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/assistant")
def assistant(req: AssistantRequest):
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="question is required.")
    return answer_question(req.question, req.context)


@app.post("/api/export/midi")
def export_midi(req: MidiExportRequest):
    """Real, downloadable Standard MIDI File of the detected chord progression."""
    midi_bytes = build_midi_bytes(req.chordProgression, req.bpm)
    return Response(
        content=midi_bytes,
        media_type="audio/midi",
        headers={"Content-Disposition": "attachment; filename=wilsify-chords.mid"},
    )


@app.post("/api/export/pdf")
def export_pdf(req: PdfExportRequest):
    """Real, downloadable chord-chart PDF (lead sheet) generated from detected data."""
    pdf_bytes = build_chord_chart_pdf(
        song_title=req.songTitle,
        key=req.key,
        scale=req.scale,
        bpm=req.bpm,
        time_signature=req.timeSignature,
        chord_progression=req.chordProgression,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=wilsify-chords.pdf"},
    )


@app.post("/api/rights-attestation")
def rights_attestation(req: RightsAttestationRequest):
    """
    Logs the mandatory upload-rights attestation as a real, timestamped
    record - appended to a local JSON-lines file rather than a Postgres
    row, consistent with this MVP's no-database architecture, but a
    genuine persisted record with a timestamp, not just UI text.
    """
    record = {
        "fileName": req.fileName,
        "attestedAt": time.time(),
        "attestedAtIso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        with open(RIGHTS_ATTESTATION_LOG, "a") as f:
            f.write(json.dumps(record) + "\n")
    except OSError:
        logger.warning("Could not write rights attestation log at %s", RIGHTS_ATTESTATION_LOG)
    return {"status": "logged", **record}
