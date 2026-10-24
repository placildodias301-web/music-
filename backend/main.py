"""
Wilsify AI MVP backend - real audio analysis. Accounts and per-user data
live in Supabase (the frontend talks to it directly).

POST /api/analyze accepts ANY audio or video file, extracts/decodes the
audio with ffmpeg, and runs genuine signal-processing analysis (librosa) to
return real key, tempo (BPM), estimated time signature, duration, and a
detected chord progression. Nothing is persisted - files are processed and
immediately deleted.
"""

import asyncio
import json
import logging
import os
import queue
import subprocess
import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import re
import unicodedata
from typing import Annotated, Literal, Optional
from urllib.parse import quote

from dotenv import load_dotenv

load_dotenv()  # before the service imports below, which read os.environ

import jwt
from fastapi import Body, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, StringConstraints, ValidationError

from services.analysis_engine import AnalysisInputError, analyze, analyze_from_array
from services.assistant_engine import answer_question
from services.audio_extract import TMP_DIR, AudioExtractionError, cleanup, extract_audio_to_wav, find_ffmpeg
from services.difficulty import rate_difficulty
from services.media_fetch import LINK_FALLBACK_MESSAGE, MediaFetchError, YOUTUBE_FALLBACK_MESSAGE, fetch_media, search_youtube
from services.midi_export import build_midi_bytes
from services.pdf_export import build_chord_chart_pdf, build_lead_sheet_pdf
from services.pitch_shift import pitch_shift_to_m4a
from services import sheet_generation, sheet_scan, stem_separation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wilsify")

FRONTEND_ORIGIN = os.environ.get(
    "FRONTEND_ORIGIN",
    "http://localhost:5173,http://localhost:5174,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4173",
)
ALLOWED_ORIGINS = [origin.strip() for origin in FRONTEND_ORIGIN.split(",") if origin.strip()]

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100MB
UPLOAD_TIMEOUT_SECONDS = 120.0

# Analysis is the one CPU-expensive, unauthenticated endpoint, so it gets a
# deliberately generous per-IP cap: high enough that no human demo can trip
# it, low enough that a script cannot pin the CPU. Set to 0 to disable.
ANALYZE_RATE_LIMIT_PER_MINUTE = int(os.environ.get("ANALYZE_RATE_LIMIT_PER_MINUTE", "60"))
_request_times: dict[str, deque] = defaultdict(deque)
# Fetching a link downloads media on the server, and YouTube search makes
# outbound requests, so both share the same cap.
RATE_LIMITED_PATHS = {
    "/api/analyze",
    "/api/analyze/stream",
    "/api/pitch-shift",
    "/api/stems/analyze",
    "/api/stems/separate",
    "/api/sheet/generate",
    "/api/pipeline/jobs",
    "/api/sheet/scan",
    "/api/fetch-media",
    "/api/youtube/search",
}

ALLOWED_PREFIXES = ("audio/", "video/")
ALLOWED_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma",
    ".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v",
}
ALLOWED_MIME_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave",
    "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/x-aac", "audio/aacp",
    "audio/ogg", "audio/vorbis", "audio/opus", "audio/flac", "audio/x-flac",
    "audio/x-ms-wma", "audio/webm", "audio/3gpp", "audio/3gpp2",
    "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
    "video/x-msvideo", "video/avi", "video/msvideo", "video/x-m4v", "video/3gpp",
    "application/ogg", "application/octet-stream", "",
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
    expose_headers=["X-Media-Name", "X-Request-ID", "X-Request-Id"],
)

_SAFE_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
ALLOWED_SOURCE_TYPES = {"file", "link", "youtube", "sample", "mic"}


def _resolve_request_id(request: Request) -> str:
    existing = getattr(request.state, "request_id", None)
    if isinstance(existing, str) and existing:
        return existing
    incoming = (request.headers.get("X-Request-ID") or request.headers.get("X-Request-Id") or "").strip()
    if incoming and _SAFE_REQUEST_ID_RE.match(incoming):
        req_id = incoming
    else:
        req_id = str(uuid.uuid4())
    request.state.request_id = req_id
    return req_id


def _resolve_source_type(request: Request) -> str:
    raw = (request.headers.get("X-Source-Type") or "file").strip().lower()
    return raw if raw in ALLOWED_SOURCE_TYPES else "file"


def _emit_structured_log(payload: dict) -> None:
    logger.info(json.dumps(payload, default=str))


@app.middleware("http")
async def rate_limit_analysis(request: Request, call_next):
    path = request.url.path
    if path in RATE_LIMITED_PATHS:
        limit, bucket, message = ANALYZE_RATE_LIMIT_PER_MINUTE, "media", "Too many analyses from this address. Please wait a moment and try again."
    else:
        limit = 0
    if limit > 0 and request.method in ("GET", "POST"):
        client = request.client.host if request.client else "unknown"
        now = time.time()
        hits = _request_times[f"{bucket}:{client}"]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= limit:
            if path in ("/api/analyze", "/api/analyze/stream"):
                request.state.telemetry = {
                    "analysis_stage": "rate_limit",
                    "analysis_status": "failed",
                    "processing_seconds": 0.0,
                    "file_size_bytes": 0,
                    "source_type": _resolve_source_type(request),
                    "failure_reason": "rate_limited",
                }
            return JSONResponse(status_code=429, content={"detail": message})
        hits.append(now)
    return await call_next(request)


@app.middleware("http")
async def request_telemetry_middleware(request: Request, call_next):
    request_id = _resolve_request_id(request)
    request.state.user_id = None
    if not hasattr(request.state, "telemetry"):
        request.state.telemetry = {}
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000.0, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Request-Id"] = request_id

    log_payload = {
        "event": "http_access",
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "duration_ms": duration_ms,
        "user_id": getattr(request.state, "user_id", None),
        "client": request.client.host if request.client else "unknown",
    }
    telemetry_extra = getattr(request.state, "telemetry", None)
    if isinstance(telemetry_extra, dict) and telemetry_extra:
        log_payload.update(telemetry_extra)
    _emit_structured_log(log_payload)
    return response


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)


class AssistantRequest(BaseModel):
    question: str = Field(max_length=2000)
    context: Optional[dict] = None
    # Earlier turns of the same chat, oldest first, so follow-ups like
    # "explain point 2" make sense. Capped to keep requests small.
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


MAX_EXPORT_CHORDS = 4096


class MidiExportRequest(BaseModel):
    chordProgression: list[str] = Field(max_length=MAX_EXPORT_CHORDS)
    bpm: float = Field(gt=0, le=400)


class PdfExportRequest(BaseModel):
    songTitle: str = Field(max_length=200)
    key: str = Field(max_length=60)
    scale: str = Field(max_length=120)
    bpm: float = Field(gt=0, le=400)
    timeSignature: str = Field(max_length=16)
    chordProgression: list[str] = Field(max_length=MAX_EXPORT_CHORDS)


# ── Lead sheet (built by frontend/src/lib/leadSheet.ts) ──────────────────
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
Alpha = Annotated[float, Field(ge=0, le=1)]
Fret = Annotated[int, Field(ge=0, le=24)]


class SheetChord(BaseModel):
    symbol: str = Field(max_length=24)
    label: str = Field(max_length=24)
    fg: HexColor
    fgOnLight: HexColor
    fill: HexColor
    fillAlpha: Alpha
    border: HexColor
    borderAlpha: Alpha
    uncertain: bool = False
    continuation: bool = False
    noChord: bool = False


class SheetBar(BaseModel):
    number: Optional[int] = Field(default=None, ge=0, le=100_000)
    pickup: bool = False
    chords: list[SheetChord] = Field(min_length=1, max_length=16)
    loopPass: Optional[int] = Field(default=None, ge=0, le=10_000)


class SheetDiagram(BaseModel):
    label: str = Field(max_length=24)
    fg: HexColor
    fgOnLight: HexColor
    name: Optional[str] = Field(default=None, max_length=80)
    frets: Optional[list[Optional[Fret]]] = Field(default=None, min_length=6, max_length=6)


class SheetStat(BaseModel):
    label: str = Field(max_length=40)
    value: str = Field(max_length=24)
    unit: str = Field(default="", max_length=12)
    note: str = Field(default="", max_length=160)
    color: HexColor


class SheetBadge(BaseModel):
    label: str = Field(max_length=60)
    color: HexColor


class SheetTranspose(BaseModel):
    hear: str = Field(max_length=80)
    play: str = Field(max_length=120)


class SheetPalette(BaseModel):
    bg: HexColor
    card: HexColor
    raised: HexColor
    border: HexColor
    borderStrong: HexColor
    purple: HexColor
    purpleLight: HexColor
    cyan: HexColor
    text: HexColor
    muted: HexColor
    dim: HexColor


class SheetLoop(BaseModel):
    label: str = Field(max_length=160)
    count: int = Field(ge=0, le=10_000)


class LeadSheetRequest(BaseModel):
    theme: Literal["dark", "light"] = "dark"
    title: str = Field(max_length=300)
    badges: list[SheetBadge] = Field(default=[], max_length=6)
    stats: list[SheetStat] = Field(max_length=4)
    transpose: SheetTranspose
    palette: SheetPalette
    beatsPerBar: int = Field(default=4, ge=1, le=16)
    bars: list[SheetBar] = Field(max_length=MAX_EXPORT_CHORDS)
    loop: Optional[SheetLoop] = None
    diagrams: list[SheetDiagram] = Field(default=[], max_length=64)
    notationLegend: Optional[str] = Field(default=None, max_length=200)
    generatedOn: str = Field(default="", max_length=40)


def _slug(title: str) -> str:
    title = re.sub(r"\.[a-z0-9]{2,4}$", "", title, flags=re.I)
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")[:60].rstrip("-")
    return slug or "song"


class FetchMediaRequest(BaseModel):
    url: str = Field(max_length=2048)


class RightsAttestationRequest(BaseModel):
    fileName: str = Field(max_length=400)


RIGHTS_ATTESTATION_LOG = os.path.join(TMP_DIR, "wilsify-rights-attestations.jsonl")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "wilsify-mvp-backend", "mode": "real-analysis"}


def _safe_display_name(raw_name: Optional[str]) -> str:
    """Sanitizes a user-supplied filename for display metadata only (never used as a path)."""
    cleaned = os.path.basename((raw_name or "upload").replace("\\", "/")).strip()
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", cleaned)
    return (cleaned[:255] or "upload")


def _verify_media_signature(header: bytes) -> bool:
    """
    Checks actual magic bytes / container signatures for supported audio & video formats:
    - WAV / AVI: RIFF....WAVE or RIFF....AVI
    - FLAC: fLaC
    - OGG: OggS
    - MP3 / AAC: ID3 tag or MPEG/ADTS frame sync (0xFF with top 3 bits set)
    - MP4 / M4A / MOV / M4V: ISO BMFF / QuickTime box header at offset 4
    - WebM / MKV: Matroska EBML header (0x1A 0x45 0xDF 0xA3)
    - WMA / ASF: ASF header GUID
    - AIFF: FORM....AIFF
    """
    if len(header) < 4:
        return False
    if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] in (b"WAVE", b"AVI "):
        return True
    if header.startswith(b"fLaC") or header.startswith(b"OggS") or header.startswith(b"ID3"):
        return True
    if header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:
        return True
    if len(header) >= 8 and header[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip", b"pnot", b"styp"):
        return True
    if header.startswith(b"\x1a\x45\xdf\xa3"):
        return True
    if len(header) >= 16 and header.startswith(b"\x30\x26\xb2\x75\x8e\x66\xcf\x11\xa6\xd9\x00\xaa\x00\x62\xce\x6c"):
        return True
    if header.startswith(b"FORM") and len(header) >= 12 and header[8:12] in (b"AIFF", b"AIFC"):
        return True
    return False


def _validate_upload_type(file: UploadFile) -> str:
    safe_name = _safe_display_name(file.filename)
    ext = os.path.splitext(safe_name)[1].lower()
    raw_content_type = (file.content_type or "").split(";")[0].strip().lower()
    if ext not in ALLOWED_EXTENSIONS or (
        raw_content_type not in ALLOWED_MIME_TYPES and not raw_content_type.startswith(ALLOWED_PREFIXES)
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload an audio or video file (mp3, wav, m4a, mp4, mov, webm, etc.).",
        )
    return ext


async def _save_upload(file: UploadFile, ext: str) -> tuple[str, int]:
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload an audio or video file (mp3, wav, m4a, mp4, mov, webm, etc.).",
        )
    os.makedirs(TMP_DIR, exist_ok=True)
    # Generate a random server-side UUID filename outside the web root; never use the user filename in paths.
    tmp_input_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}{ext}")
    size = 0
    header = bytearray()
    started = time.monotonic()
    try:
        with open(tmp_input_path, "wb") as f:
            while True:
                remaining = UPLOAD_TIMEOUT_SECONDS - (time.monotonic() - started)
                if remaining <= 0:
                    raise HTTPException(status_code=408, detail="Upload timed out. Please check your connection and try again.")
                try:
                    chunk = await asyncio.wait_for(file.read(1024 * 1024), timeout=remaining)
                except asyncio.TimeoutError:
                    raise HTTPException(status_code=408, detail="Upload timed out. Please check your connection and try again.")
                if not chunk:
                    break
                if len(header) < 64:
                    header.extend(chunk[: 64 - len(header)])
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="File is too large. Maximum size is 100 MB.",
                    )
                f.write(chunk)

        if size == 0:
            raise HTTPException(
                status_code=400,
                detail="File is empty. Please upload a non-empty audio or video file.",
            )

        if not _verify_media_signature(bytes(header)):
            raise HTTPException(
                status_code=400,
                detail="Could not read audio from that file. Make sure it's a valid audio or video file.",
            )
    except BaseException:
        cleanup(tmp_input_path)
        raise
    finally:
        try:
            await file.close()
        except Exception:
            pass
    return tmp_input_path, size


class AnalysisCancelled(Exception):
    """The client went away (pressed Cancel) — stop working on its upload."""


def _run_analysis(tmp_input_path: str, original_name: str, size: int, progress=None) -> dict:
    """
    Decode + analyze one saved upload. Raises HTTPException with a
    user-safe message on failure; always deletes the temp files.
    """
    report = progress or (lambda _stage, _pct: None)
    wav_path = None
    safe_name = _safe_display_name(original_name)
    try:
        start = time.time()
        report("decoding", 5)
        wav_path = extract_audio_to_wav(tmp_input_path)
        result = analyze(wav_path, report)
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
            "fileName": safe_name,
            "fileSizeBytes": size,
            "processingSeconds": elapsed,
            **result,
            "difficulty": difficulty,
        }

    except (AudioExtractionError, AnalysisInputError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (HTTPException, AnalysisCancelled):
        raise
    except Exception:
        # Log the real traceback server-side; return a generic message so
        # internal paths, library versions and stack details never reach
        # the browser.
        logger.exception("Analysis failed for upload %r", safe_name)
        raise HTTPException(
            status_code=500,
            detail="Analysis failed while processing that file. Please try another file.",
        )
    finally:
        cleanup(tmp_input_path, wav_path)


@app.post("/api/analyze")
async def analyze_upload(request: Request, file: UploadFile = File(...)):
    source_type = _resolve_source_type(request)
    current_stage = ["upload"]
    size = 0
    started = time.perf_counter()
    try:
        ext = _validate_upload_type(file)
        tmp_input_path, size = await _save_upload(file, ext)
    except HTTPException as e:
        request.state.telemetry = {
            "analysis_stage": current_stage[0],
            "analysis_status": "failed",
            "processing_seconds": round(time.perf_counter() - started, 3),
            "file_size_bytes": size,
            "source_type": source_type,
            "failure_reason": str(e.detail),
        }
        raise

    def track_stage(stage: str, _pct: int) -> None:
        current_stage[0] = stage

    try:
        result = _run_analysis(tmp_input_path, _safe_display_name(file.filename), size, track_stage)
        request.state.telemetry = {
            "analysis_stage": "complete",
            "analysis_status": "completed",
            "processing_seconds": result.get("processingSeconds", round(time.perf_counter() - started, 2)),
            "file_size_bytes": size,
            "source_type": source_type,
            "failure_reason": None,
        }
        return result
    except HTTPException as e:
        request.state.telemetry = {
            "analysis_stage": current_stage[0],
            "analysis_status": "failed",
            "processing_seconds": round(time.perf_counter() - started, 3),
            "file_size_bytes": size,
            "source_type": source_type,
            "failure_reason": str(e.detail),
        }
        raise
    finally:
        cleanup(tmp_input_path)


@app.post("/api/analyze/stream")
async def analyze_upload_stream(request: Request, file: UploadFile = File(...)):
    """
    Same analysis as /api/analyze, but streams newline-delimited JSON so the
    UI can show which stage is actually running:

        {"type": "progress", "stage": "beats", "progress": 40}
        ...
        {"type": "result", "analysis": {...}}      (or)
        {"type": "error", "status": 400, "detail": "..."}

    Validation errors that happen before processing starts (wrong file type,
    too large) are still returned as normal HTTP 400/413 responses.
    """
    request_id = _resolve_request_id(request)
    source_type = _resolve_source_type(request)
    client_host = request.client.host if request.client else "unknown"
    started = time.perf_counter()
    size = 0
    try:
        ext = _validate_upload_type(file)
        tmp_input_path, size = await _save_upload(file, ext)
    except HTTPException as e:
        request.state.telemetry = {
            "analysis_stage": "upload",
            "analysis_status": "failed",
            "processing_seconds": round(time.perf_counter() - started, 3),
            "file_size_bytes": size,
            "source_type": source_type,
            "failure_reason": str(e.detail),
        }
        raise

    original_name = _safe_display_name(file.filename)
    events: "queue.Queue[dict | None]" = queue.Queue()
    # Set when the client disconnects (Cancel in the app): the analysis
    # checks it at every stage and stops instead of finishing for nobody.
    cancelled = threading.Event()
    current_stage = ["uploaded"]
    analysis_status = ["running"]
    processing_seconds = [0.0]
    failure_reason: list[str | None] = [None]

    def report(stage: str, pct: int) -> None:
        if cancelled.is_set():
            raise AnalysisCancelled()
        current_stage[0] = stage
        events.put({"type": "progress", "stage": stage, "progress": pct})

    def worker():
        worker_start = time.perf_counter()
        try:
            result = _run_analysis(tmp_input_path, original_name, size, report)
            current_stage[0] = "complete"
            analysis_status[0] = "completed"
            processing_seconds[0] = float(result.get("processingSeconds", round(time.perf_counter() - worker_start, 2)))
            events.put({"type": "result", "analysis": result})
        except AnalysisCancelled:
            analysis_status[0] = "cancelled"
            processing_seconds[0] = round(time.perf_counter() - worker_start, 2)
            failure_reason[0] = "cancelled_by_client"
            logger.info("Analysis of %r cancelled by the client", original_name)
        except HTTPException as e:
            analysis_status[0] = "failed"
            processing_seconds[0] = round(time.perf_counter() - worker_start, 2)
            failure_reason[0] = str(e.detail)
            events.put({"type": "error", "status": e.status_code, "detail": e.detail})
        except Exception:  # pragma: no cover - _run_analysis already maps errors
            analysis_status[0] = "failed"
            processing_seconds[0] = round(time.perf_counter() - worker_start, 2)
            failure_reason[0] = "internal_error"
            logger.exception("Streaming analysis failed for %r", original_name)
            events.put({"type": "error", "status": 500, "detail": "Analysis failed. Please try another file."})
        finally:
            cleanup(tmp_input_path)
            events.put(None)

    try:
        threading.Thread(target=worker, daemon=True).start()
    except BaseException:
        cleanup(tmp_input_path)
        raise

    request.state.telemetry = {
        "analysis_stage": "uploaded",
        "analysis_status": "streaming",
        "processing_seconds": 0.0,
        "file_size_bytes": size,
        "source_type": source_type,
        "failure_reason": None,
    }

    async def stream():
        try:
            yield json.dumps({"type": "progress", "stage": "uploaded", "progress": 2}) + "\n"
            idle = 0.0
            while True:
                try:
                    event = await run_in_threadpool(events.get, True, 1.0)
                except queue.Empty:
                    idle += 1.0
                    if idle >= 10:
                        # Keep proxies from closing an idle connection on long songs.
                        idle = 0.0
                        yield json.dumps({"type": "heartbeat"}) + "\n"
                    continue
                idle = 0.0
                if event is None:
                    return
                yield json.dumps(event) + "\n"
        finally:
            # Normal end, or the client disconnected mid-analysis.
            cancelled.set()
            final_status = analysis_status[0] if analysis_status[0] != "running" else "cancelled"
            final_reason = failure_reason[0] if final_status != "cancelled" else (failure_reason[0] or "cancelled_by_client")
            total_ms = round((time.perf_counter() - started) * 1000.0, 2)
            _emit_structured_log({
                "event": "analysis_stream_complete",
                "request_id": request_id,
                "method": "POST",
                "path": "/api/analyze/stream",
                "status_code": 200,
                "duration_ms": total_ms,
                "user_id": getattr(request.state, "user_id", None),
                "client": client_host,
                "analysis_stage": current_stage[0],
                "analysis_status": final_status,
                "processing_seconds": processing_seconds[0] or round(total_ms / 1000.0, 2),
                "file_size_bytes": size,
                "source_type": source_type,
                "failure_reason": final_reason,
            })

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"X-Request-ID": request_id, "X-Request-Id": request_id},
    )


@app.post("/api/fetch-media")
def fetch_media_from_link(req: FetchMediaRequest, request: Request):
    """
    Downloads the audio behind a pasted link (YouTube, Instagram, TikTok, ...) and streams it back, so the
    browser can play it and send it through /api/analyze like any upload.
    The server copy is deleted as soon as the response has been sent.
    """
    request_id = _resolve_request_id(request)
    client_key = request.client.host if request.client else "unknown"
    try:
        path, name = fetch_media(req.url, client_key=client_key, request_id=request_id)
    except MediaFetchError as e:
        raise HTTPException(
            status_code=getattr(e, "status_code", 400),
            detail=str(e),
            headers={"X-Request-ID": request_id, "X-Request-Id": request_id},
        )
    except Exception:
        logger.exception("[%s] Fetching media failed unexpectedly for %r", request_id, req.url)
        raise HTTPException(
            status_code=502,
            detail=LINK_FALLBACK_MESSAGE,
            headers={"X-Request-ID": request_id, "X-Request-Id": request_id},
        )

    return FileResponse(
        path,
        filename=name,
        background=BackgroundTask(cleanup, path),
        headers={"X-Media-Name": quote(name), "X-Request-ID": request_id, "X-Request-Id": request_id},
    )


@app.get("/api/youtube/search")
def youtube_search(request: Request, q: str = "", limit: int = 12):
    """YouTube search results (metadata only) for the in-app video browser."""
    request_id = _resolve_request_id(request)
    client_key = request.client.host if request.client else "unknown"
    try:
        return {"results": search_youtube(q, limit, client_key=client_key, request_id=request_id)}
    except MediaFetchError as e:
        raise HTTPException(
            status_code=getattr(e, "status_code", 400),
            detail=str(e),
            headers={"X-Request-ID": request_id, "X-Request-Id": request_id},
        )
    except Exception:
        logger.exception("[%s] YouTube search failed unexpectedly for %r", request_id, q)
        raise HTTPException(
            status_code=502,
            detail=YOUTUBE_FALLBACK_MESSAGE,
            headers={"X-Request-ID": request_id, "X-Request-Id": request_id},
        )


# ── Signed-in users (Supabase Auth) ───────────────────────────────────────
# The frontend sends the Supabase access token; we check its signature
# against the project's public keys, so no secret key lives here.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
_supabase_keys = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True) if SUPABASE_URL else None


def require_user(request: Request, authorization: str = Header(default="")) -> str:
    """User id from a valid `Authorization: Bearer <token>`, else 401."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in to use this.")
    if _supabase_keys is None:
        raise HTTPException(status_code=503, detail="Sign-in isn't configured on the server (SUPABASE_URL).")
    try:
        key = _supabase_keys.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["ES256", "RS256"], audience="authenticated", issuer=f"{SUPABASE_URL}/auth/v1")
    except jwt.PyJWKClientError as e:
        logger.warning("Supabase key lookup failed: %s", e)
        raise HTTPException(status_code=503, detail="Couldn't check your sign-in right now. Please try again in a moment.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    user_id = claims["sub"]
    request.state.user_id = user_id
    return user_id


@app.post("/api/assistant")
def assistant(req: AssistantRequest, _user: str = Depends(require_user)):
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="question is required.")
    return answer_question(req.question, req.context, [t.model_dump() for t in req.history])


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
def export_pdf(body: dict = Body(...)):
    """
    Real, downloadable chord-chart PDF (lead sheet). Takes the lead sheet the
    Analysis page builds (bars, colours, voicings, transpose state); the
    older flat request (title + chord list) still works for other clients.
    """
    # Pick the format explicitly so a bad request is reported against the
    # format it was meant to be, not whichever one was tried last.
    model = LeadSheetRequest if "bars" in body else PdfExportRequest
    try:
        req = model.model_validate(body)
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_url=False), body=body)
    if isinstance(req, LeadSheetRequest):
        title = req.title
        pdf_bytes = build_lead_sheet_pdf(req.model_dump())
    else:
        title = req.songTitle
        pdf_bytes = build_chord_chart_pdf(
            song_title=req.songTitle,
            key=req.key,
            scale=req.scale,
            bpm=req.bpm,
            time_signature=req.timeSignature,
            chord_progression=req.chordProgression,
            generated_on=time.strftime("%d %b %Y"),
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={_slug(title)}_wilsify_lead_sheet.pdf"},
    )


@app.post("/api/pitch-shift")
async def pitch_shift(semitones: int, file: UploadFile = File(...)):
    """Returns the uploaded song transposed by `semitones`, same tempo, as AAC (.m4a)."""
    ext = _validate_upload_type(file)
    tmp_input_path, _size = await _save_upload(file, ext)
    try:
        output_path = await run_in_threadpool(pitch_shift_to_m4a, tmp_input_path, semitones)
    except AudioExtractionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Pitch shift failed for upload %r", _safe_display_name(file.filename))
        raise HTTPException(status_code=500, detail="Pitch shifting failed for that file.")
    finally:
        cleanup(tmp_input_path)
    return FileResponse(
        output_path,
        media_type="audio/mp4",
        background=BackgroundTask(cleanup, output_path),
    )


# ── Stem separation (Demucs) ───────────────────────────────────────────────
# Contract matches frontend/src/lib/stemJob.ts.


class StemSeparateRequest(BaseModel):
    upload_id: str = Field(max_length=64)
    stems: list[str] = Field(default_factory=list, max_length=20)
    format: Literal["wav", "flac"] = "wav"


@app.post("/api/stems/analyze")
async def stems_analyze(file: UploadFile = File(...)):
    """Stores the upload for a later /separate call and lists the stems we can produce."""
    stem_separation.sweep_expired()
    ext = _validate_upload_type(file)
    tmp_input_path, _size = await _save_upload(file, ext)
    try:
        upload_id = stem_separation.store_upload(tmp_input_path, ext)
        duration = await run_in_threadpool(stem_separation.duration_seconds, stem_separation.upload_path(upload_id))
    except stem_separation.StemError as e:
        cleanup(tmp_input_path)
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "upload_id": upload_id,
        "track": os.path.splitext(_safe_display_name(file.filename))[0],
        "duration_seconds": round(duration, 1),
        "estimated_seconds": round(duration * stem_separation.SECONDS_PER_AUDIO_SECOND) + 10,
        # Demucs always produces these four; whether a part is really in the
        # song is only known after separation, so none claims "high".
        "detected_stems": [
            {"id": sid, "label": label, "confidence": "medium", "available": True}
            for sid, label in stem_separation.STEMS.items()
        ],
    }


@app.post("/api/stems/separate")
def stems_separate(req: StemSeparateRequest):
    try:
        job_id = stem_separation.start_job(req.upload_id, req.stems, req.format)
    except stem_separation.StemError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"job_id": job_id}


def _stem_job_or_404(job_id: str) -> dict:
    job = stem_separation.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="That separation job doesn't exist or has expired.")
    return job


@app.get("/api/stems/job/{job_id}")
def stems_job_status(job_id: str):
    job = _stem_job_or_404(job_id)
    return {
        "status": job["status"],
        "progress": round(job["progress"], 1),
        "message": job["message"],
        "error": job["error"],
    }


@app.get("/api/stems/job/{job_id}/stems")
def stems_job_results(job_id: str, request: Request):
    job = _stem_job_or_404(job_id)
    if job["status"] != "complete":
        raise HTTPException(status_code=409, detail="Separation hasn't finished yet.")
    base = str(request.base_url).rstrip("/")
    stems = []
    for i, (sid, path) in enumerate(job["files"].items(), start=1):
        stems.append({
            "id": sid,
            "label": stem_separation.stem_label(sid, job["model"]),
            "confidence": "medium",
            "size_bytes": os.path.getsize(path),
            "url": f"{base}/api/stems/job/{job_id}/file/{sid}",
            "filename": f"{i:02d}_{sid}.{job['format']}",
            "warning": "",
        })
    # An unsure guitar/piano went into Other; if Other was itself dropped as silent,
    # that part simply isn't in the song, so list it with the left-out ones.
    folded = job["folded"] if "other" in job["files"] else []
    left_out = job["silent"] + [s for s in job["folded"] if s not in folded]
    silent = [stem_separation.stem_label(s, job["model"]) for s in left_out]
    notice = f"Not detected in this song (almost silent), so left out: {', '.join(silent)}. " if silent else ""
    if folded:
        notice += f"No clear {' or '.join(stem_separation.STEMS[s].lower() for s in folded)} found, so it stays in Other. "
    # Both the Stems page and the Analysis page show this notice above the results.
    notice += f"Download your stems now: they're deleted from our server after {stem_separation.STEM_TTL_SECONDS // 3600} hour."
    return {"stems": stems, "notice": notice}


@app.get("/api/stems/job/{job_id}/file/{stem}")
def stems_job_file(job_id: str, stem: str):
    path = stem_separation.job_file(job_id, stem)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="That stem file doesn't exist or has expired.")
    # filename= makes it an attachment: the browser saves the file instead of
    # opening a bare player page (the app's <a download> is ignored cross-origin).
    # <audio> playback of the same URL is unaffected.
    return FileResponse(
        path,
        media_type="audio/flac" if path.endswith(".flac") else "audio/wav",
        filename=os.path.basename(path),
    )


# ── AI sheet generation ────────────────────────────────────────────────────


@app.post("/api/sheet/generate")
async def sheet_generate(file: UploadFile = File(...), left_hand: str = "block"):
    """Song -> piano lead sheet (MusicXML): sung melody in the right hand, detected chords in the left.

    Synchronous: about the song's length on a laptop CPU (Demucs dominates).
    ponytail: one blocking request; move to the stems-style job queue if songs get long or users many.
    """
    ext = _validate_upload_type(file)
    tmp_input_path, _size = await _save_upload(file, ext)
    title = os.path.splitext(_safe_display_name(file.filename))[0] or "Song"
    try:
        return await run_in_threadpool(sheet_generation.generate, tmp_input_path, title, left_hand)
    except (sheet_generation.SheetError, AnalysisInputError, AudioExtractionError, stem_separation.StemError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ImportError:
        logger.exception("Sheet generation dependencies missing")
        raise HTTPException(status_code=503, detail="Sheet generation isn't installed on this server yet.")
    except Exception:
        logger.exception("Sheet generation failed for %r", title)
        raise HTTPException(status_code=500, detail="Couldn't make a sheet from that file. Please try another song.")
    finally:
        cleanup(tmp_input_path)


IMAGE_SIGNATURES = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"BM", b"II*\x00", b"MM\x00*")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


@app.post("/api/sheet/scan")
async def sheet_scan_image(file: UploadFile = File(...)):
    """Photo or scan of printed sheet music -> MusicXML (optical music recognition, can take a few minutes on CPU)."""
    ext = os.path.splitext(_safe_display_name(file.filename))[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Please upload a picture of the sheet music (png, jpg, webp, bmp or tiff).")
    os.makedirs(TMP_DIR, exist_ok=True)
    path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}{ext}")
    try:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if not data:
            raise HTTPException(status_code=400, detail="That file is empty.")
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File is too large. Maximum size is 100 MB.")
        if not (data.startswith(IMAGE_SIGNATURES) or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")):
            raise HTTPException(status_code=400, detail="That doesn't look like a picture. Please upload a png, jpg or webp of the sheet.")
        with open(path, "wb") as f:
            f.write(data)
        title = os.path.splitext(_safe_display_name(file.filename))[0] or "Sheet"
        xml = await run_in_threadpool(sheet_scan.scan, path)
        return {"title": title, "musicxml": xml}
    except sheet_scan.SheetScanError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ImportError:
        logger.exception("Sheet scanning dependency missing")
        raise HTTPException(status_code=503, detail="Reading sheet pictures isn't installed on this server yet. In backend/, run: pip install homr")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Sheet scan failed for %r", file.filename)
        raise HTTPException(status_code=500, detail="Couldn't read that picture. Please try another photo.")
    finally:
        cleanup(path)
        await file.close()


@app.post("/api/sheet/audio")
async def sheet_audio_mp3(file: UploadFile = File(...)):
    """WAV rendered in the browser -> MP3, which WhatsApp and phones accept (WAV is rejected as 'not supported')."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise HTTPException(status_code=503, detail="Making MP3 files needs ffmpeg, which isn't installed on the server.")
    os.makedirs(TMP_DIR, exist_ok=True)
    stem = os.path.join(TMP_DIR, uuid.uuid4().hex)
    src, dst = f"{stem}.wav", f"{stem}.mp3"
    try:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File is too large. Maximum size is 100 MB.")
        if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
            raise HTTPException(status_code=400, detail="That isn't a WAV file.")
        with open(src, "wb") as f:
            f.write(data)
        proc = await run_in_threadpool(
            subprocess.run,
            [ffmpeg, "-y", "-i", src, "-codec:a", "libmp3lame", "-b:a", "192k", dst],
            capture_output=True, timeout=120,
        )
        if proc.returncode != 0 or not os.path.exists(dst):
            logger.error("ffmpeg mp3 failed: %s", proc.stderr[-800:])
            raise HTTPException(status_code=500, detail="Couldn't make the MP3 file.")
        with open(dst, "rb") as f:
            return Response(content=f.read(), media_type="audio/mpeg")
    finally:
        cleanup(src, dst)
        await file.close()


class SheetNote(BaseModel):
    start: float = Field(ge=0, le=10_000)  # quarter notes from bar 1
    end: float = Field(ge=0, le=10_000)
    midi: int = Field(ge=21, le=108)  # piano range


class SheetChord(BaseModel):
    start: float = Field(ge=0, le=10_000)
    end: float = Field(ge=0, le=10_000)
    name: str = Field(min_length=1, max_length=12, pattern=r"^[A-G][#b]?[a-z0-9#b+]*$")


class SheetModel(BaseModel):
    title: str = Field(default="", max_length=200)
    bpm: float = Field(ge=20, le=320)
    beatsPerBar: int = Field(ge=2, le=12)
    key: str = Field(default="", max_length=20)
    notes: list[SheetNote] = Field(max_length=5000)
    chords: list[SheetChord] = Field(max_length=2000)


class SheetRenderRequest(BaseModel):
    model: SheetModel
    left_hand: Literal["block", "bass", "none"] = "block"
    semitones: int = Field(default=0, ge=-12, le=12)


@app.post("/api/sheet/render")
async def sheet_render(req: SheetRenderRequest):
    """Edited sheet model -> MusicXML (the editor calls this after every change)."""
    try:
        xml = await run_in_threadpool(sheet_generation.render, req.model.model_dump(), req.left_hand, req.semitones)
    except Exception:
        logger.exception("Sheet render failed")
        raise HTTPException(status_code=400, detail="Couldn't draw that sheet. Undo the last change and try again.")
    return {"musicxml": xml}


class SheetTransposeRequest(BaseModel):
    musicxml: str = Field(max_length=5_000_000)
    semitones: int = Field(ge=-12, le=12)


@app.post("/api/sheet/transpose")
async def sheet_transpose(req: SheetTransposeRequest):
    """Moves every pitch by `semitones` (notes, chord names, key signature); rhythm stays exactly the same."""
    try:
        return {"musicxml": await run_in_threadpool(sheet_generation.transpose_musicxml, req.musicxml, req.semitones)}
    except Exception:
        logger.exception("Sheet transpose failed")
        raise HTTPException(status_code=400, detail="Couldn't transpose that sheet. Is it a valid MusicXML file?")


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


# Job-based analysis pipeline (ANALYSIS_ENGINE=pipeline). Reuses this file's
# upload validation so both engines accept exactly the same files.
from routes.pipeline import create_pipeline_router  # noqa: E402

app.include_router(create_pipeline_router(_validate_upload_type, _save_upload, _safe_display_name))
