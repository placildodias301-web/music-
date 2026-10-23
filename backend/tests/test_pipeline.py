"""
Step 1 of the job pipeline: job lifecycle, FFmpeg stage, SQLite cache,
error handling. Fully offline — audio is synthesised; tests needing a real
ffmpeg binary are skipped when it isn't installed.
"""

import io
import os
import shutil
import subprocess
import sys
import threading
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["GEMINI_API_KEY"] = ""

import main  # noqa: E402
from main import app  # noqa: E402
from services.pipeline import errors, jobs  # noqa: E402
from services.pipeline.config import PipelineConfig  # noqa: E402
from services.pipeline.errors import PipelineError  # noqa: E402
from services.pipeline.ffmpeg_stage import extract_wav  # noqa: E402
from services.pipeline.merge import build_result  # noqa: E402

HAS_FFMPEG = shutil.which("ffmpeg") is not None
needs_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not on PATH")


def wav_bytes(seconds: float, sr: int = 22050, freq: float = 440.0) -> bytes:
    t = np.arange(int(seconds * sr)) / sr
    buf = io.BytesIO()
    sf.write(buf, (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32), sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def make_config(tmp_path, **overrides) -> PipelineConfig:
    values = dict(data_dir=str(tmp_path / "pipeline_data"), analysis_engine="pipeline",
                  job_timeout_seconds=60, ffmpeg_timeout_seconds=60, max_audio_seconds=900)
    values.update(overrides)
    return PipelineConfig(**values)


@pytest.fixture(autouse=True)
def fake_demucs(monkeypatch):
    """Demucs is never loaded in these tests: stems are fixed fractions of the mix."""
    from services import stem_separation
    monkeypatch.setattr(stem_separation, "load_model", lambda model=None, device=None: None)
    monkeypatch.setattr(stem_separation, "separate", lambda wav, progress=None, model=None, device=None: {
        "vocals": wav * 0.4, "drums": wav * 0.3, "bass": wav * 0.2, "other": wav * 0.1})


@pytest.fixture
def install_manager(tmp_path):
    """Swap in a manager with a temp data dir; returns a factory taking config overrides and a pipeline fn."""
    def install(pipeline=jobs.run_pipeline, **overrides):
        manager = jobs.JobManager(make_config(tmp_path, **overrides), pipeline=pipeline)
        jobs.set_manager(manager)
        return manager
    yield install
    jobs.set_manager(None)


@pytest.fixture
def client():
    main._request_times.clear()
    with TestClient(app) as c:
        yield c


def post_file(client, data: bytes, name: str = "clip.wav", mime: str = "audio/wav"):
    return client.post("/api/pipeline/jobs", files={"file": (name, data, mime)})


def wait_done(client, job_id: str, timeout: float = 30.0) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        body = client.get(f"/api/pipeline/jobs/{job_id}").json()
        if body["status"] in ("completed", "failed"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s")


# ── merge ──────────────────────────────────────────────────────────────

def test_merge_clamps_sorts_and_drops_empty_spans():
    r = build_result(
        audio_duration=10.0, sample_rate=44100,
        beats=[3.0, -1.0, 1.0, 12.0, 1.0],
        sections=[{"start": 5, "end": 20, "label": "chorus"}, {"start": 0, "end": 5, "label": "intro"},
                  {"start": 11, "end": 12, "label": "past-the-end"}],
        chords=[{"start": 2, "end": 2, "chord": "C:maj"}, {"start": 0, "end": 2, "chord": "N", "type": "no_chord"}],
        events=[{"time": 15, "type": "possible_fill", "confidence": 0.7}, {"time": 1, "type": "chord_change", "value": "C:maj"}],
    )
    assert r.beats == [0.0, 1.0, 3.0, 10.0]
    assert [(s.start, s.end, s.label) for s in r.sections] == [(0, 5, "intro"), (5, 10, "chorus")]
    assert [c.chord for c in r.chords] == ["N"]
    assert [e.time for e in r.events] == [1.0, 10.0]
    assert r.bpm is None and r.time_signature is None


# ── FFmpeg stage ───────────────────────────────────────────────────────

def test_extract_reports_missing_ffmpeg(tmp_path, monkeypatch):
    from services.pipeline import ffmpeg_stage
    monkeypatch.setattr(ffmpeg_stage, "find_ffmpeg", lambda: None)
    src = tmp_path / "in.wav"
    src.write_bytes(wav_bytes(2))
    with pytest.raises(PipelineError) as e:
        extract_wav(str(src), str(tmp_path), sample_rate=44100, timeout_seconds=30, min_seconds=1, max_seconds=900)
    assert e.value.code == errors.FFMPEG_MISSING
    assert "FFMPEG_PATH" in e.value.message


@needs_ffmpeg
def test_extract_makes_44k_stereo_wav_with_same_duration(tmp_path):
    src = tmp_path / "in.wav"
    src.write_bytes(wav_bytes(2.0, sr=22050))
    out = extract_wav(str(src), str(tmp_path), sample_rate=44100, timeout_seconds=30, min_seconds=1, max_seconds=900)
    info = sf.info(out.wav_path)
    assert (info.samplerate, info.channels) == (44100, 2)
    assert abs(out.duration - 2.0) < 0.01
    assert out.container_duration is None or abs(out.container_duration - 2.0) < 0.05


@needs_ffmpeg
def test_extract_rejects_video_without_audio(tmp_path):
    video = tmp_path / "silent.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=2", "-an", str(video)],
                   capture_output=True, check=True, timeout=60)
    with pytest.raises(PipelineError) as e:
        extract_wav(str(video), str(tmp_path), sample_rate=44100, timeout_seconds=30, min_seconds=1, max_seconds=900)
    assert e.value.code == errors.NO_AUDIO_TRACK


@needs_ffmpeg
def test_extract_rejects_too_short_and_too_long(tmp_path):
    src = tmp_path / "in.wav"
    src.write_bytes(wav_bytes(0.5))
    with pytest.raises(PipelineError) as e:
        extract_wav(str(src), str(tmp_path), sample_rate=44100, timeout_seconds=30, min_seconds=1, max_seconds=900)
    assert e.value.code == errors.AUDIO_TOO_SHORT
    src.write_bytes(wav_bytes(3.0))
    with pytest.raises(PipelineError) as e:
        extract_wav(str(src), str(tmp_path), sample_rate=44100, timeout_seconds=30, min_seconds=1, max_seconds=2)
    assert e.value.code == errors.AUDIO_TOO_LONG


@needs_ffmpeg
def test_extract_rejects_garbage_with_valid_header(tmp_path):
    src = tmp_path / "in.mp3"
    src.write_bytes(b"ID3" + os.urandom(4096))
    with pytest.raises(PipelineError) as e:
        extract_wav(str(src), str(tmp_path), sample_rate=44100, timeout_seconds=30, min_seconds=1, max_seconds=900)
    assert e.value.code in (errors.DECODE_FAILED, errors.NO_AUDIO_TRACK, errors.AUDIO_TOO_SHORT)


# ── job API ────────────────────────────────────────────────────────────

@needs_ffmpeg
def test_job_completes_with_required_shape(client, install_manager):
    manager = install_manager()
    r = post_file(client, wav_bytes(2.0))
    assert r.status_code == 202
    body = r.json()
    assert body["cached"] is False and body["poll_url"] == f"/api/pipeline/jobs/{body['job_id']}"

    done = wait_done(client, body["job_id"])
    assert done["status"] == "completed", done
    assert done["progress"] == 100 and done["error"] is None
    result = done["result"]
    for key in ("status", "audio_duration", "bpm", "time_signature", "beats", "downbeats", "sections", "chords", "events"):
        assert key in result
    assert result["status"] == "completed"
    assert abs(result["audio_duration"] - 2.0) < 0.01
    assert result["engines"] == {"extract": "ffmpeg", "separation": "demucs:htdemucs@cpu", "rhythm": "beat_this@cpu",
                                 "chords": "btc@cpu", "events": "heuristic"}
    assert [(c["chord"], c["simple"]) for c in result["chords"]] == [("C:maj", "C")]
    assert result["bpm"] == 120.0 and result["time_signature"] == "4/4" and result["beats"][:2] == [0.0, 0.5]
    # The job's working files (upload copy + WAV) are gone; only the cached result remains.
    assert os.listdir(manager.config.jobs_dir) == []


def test_same_file_is_served_from_cache(client, install_manager):
    calls = []

    def fake_pipeline(ctx):
        calls.append(ctx.job_id)
        ctx.report("extracting", None)
        return build_result(audio_duration=2.0, sample_rate=44100, engines={"extract": "fake"})

    install_manager(pipeline=fake_pipeline)
    data = wav_bytes(2.0)
    first = wait_done(client, post_file(client, data).json()["job_id"])
    assert first["status"] == "completed" and first["cached"] is False

    r = post_file(client, data, name="renamed.wav")
    assert r.status_code == 202 and r.json()["cached"] is True and r.json()["status"] == "completed"
    second = client.get(r.json()["poll_url"]).json()
    assert second["result"] == first["result"]
    assert second["file_name"] == "renamed.wav"
    assert len(calls) == 1

    # A different file is analysed again.
    wait_done(client, post_file(client, wav_bytes(2.0, freq=220.0)).json()["job_id"])
    assert len(calls) == 2


def test_cache_survives_a_new_manager(client, install_manager):
    install_manager(pipeline=lambda ctx: build_result(audio_duration=2.0, sample_rate=44100))
    data = wav_bytes(2.0)
    wait_done(client, post_file(client, data).json()["job_id"])

    def must_not_run(_ctx):
        raise AssertionError("cached file was analysed again")

    install_manager(pipeline=must_not_run)  # same data dir = same SQLite file, like a server restart
    assert post_file(client, data).json()["cached"] is True


def test_duplicate_upload_while_running_joins_the_same_job(client, install_manager):
    release = threading.Event()

    def slow_pipeline(ctx):
        ctx.report("extracting", None)
        release.wait(10)
        return build_result(audio_duration=2.0, sample_rate=44100)

    install_manager(pipeline=slow_pipeline)
    data = wav_bytes(2.0)
    a = post_file(client, data).json()["job_id"]
    b = post_file(client, data).json()["job_id"]
    assert a == b
    running = client.get(f"/api/pipeline/jobs/{a}").json()
    assert running["status"] in ("queued", "running") and running["result"] is None
    release.set()
    assert wait_done(client, a)["status"] == "completed"


def test_progress_is_reported_while_running(client, install_manager):
    at_stage = threading.Event()
    release = threading.Event()

    def staged_pipeline(ctx):
        ctx.report("extracting", None)
        at_stage.set()
        release.wait(10)
        return build_result(audio_duration=2.0, sample_rate=44100)

    install_manager(pipeline=staged_pipeline)
    job_id = post_file(client, wav_bytes(2.0)).json()["job_id"]
    assert at_stage.wait(10)
    body = client.get(f"/api/pipeline/jobs/{job_id}").json()
    assert (body["status"], body["stage"], body["progress"]) == ("running", "extracting", jobs.STAGE_PROGRESS["extracting"])
    release.set()
    wait_done(client, job_id)


def test_stage_error_code_reaches_the_client(client, install_manager):
    def failing(_ctx):
        raise PipelineError(errors.NO_AUDIO_TRACK, "That file has no audio track.")

    install_manager(pipeline=failing)
    done = wait_done(client, post_file(client, wav_bytes(2.0)).json()["job_id"])
    assert done["status"] == "failed"
    assert done["error"] == {"code": "no_audio_track", "message": "That file has no audio track."}
    assert done["result"] is None


def test_unexpected_crash_is_generic_and_not_cached(client, install_manager):
    def crashing(_ctx):
        raise RuntimeError(r"C:\secret\internal\path.py line 42")

    manager = install_manager(pipeline=crashing)
    data = wav_bytes(2.0)
    done = wait_done(client, post_file(client, data).json()["job_id"])
    assert done["error"]["code"] == errors.INTERNAL_ERROR
    assert "secret" not in done["error"]["message"]
    assert os.listdir(manager.config.jobs_dir) == []
    # A failure is never cached: the same file can be retried.
    assert post_file(client, data).json()["cached"] is False


def test_job_timeout(client, install_manager):
    install_manager(job_timeout_seconds=0)
    done = wait_done(client, post_file(client, wav_bytes(2.0)).json()["job_id"])
    assert done["status"] == "failed" and done["error"]["code"] == errors.JOB_TIMEOUT


def test_restart_marks_unfinished_jobs_interrupted(client, install_manager, tmp_path):
    manager = install_manager()
    manager.store.create_job("a" * 32, "hash", "song.mp3", status="running", stage="extracting")
    install_manager()  # simulates the server starting again
    body = client.get(f"/api/pipeline/jobs/{'a' * 32}").json()
    assert body["status"] == "failed" and body["error"]["code"] == errors.INTERRUPTED


def test_unsupported_upload_is_rejected_before_any_job(client, install_manager):
    manager = install_manager()
    r = post_file(client, b"just some text", name="notes.txt", mime="text/plain")
    assert r.status_code == 400
    assert os.listdir(manager.config.jobs_dir) == []


def test_fake_media_with_audio_extension_is_rejected(client, install_manager):
    install_manager()
    r = post_file(client, b"not really a wav file at all", name="song.wav", mime="audio/wav")
    assert r.status_code == 400


@pytest.mark.parametrize("job_id", ["0" * 32, "not-a-job", "..%2F..%2Fetc"])
def test_unknown_job_is_404(client, install_manager, job_id):
    install_manager()
    assert client.get(f"/api/pipeline/jobs/{job_id}").status_code == 404


def test_info_reports_engine(client, install_manager):
    install_manager()
    body = client.get("/api/pipeline/info").json()
    assert body["analysis_engine"] == "pipeline" and body["pipeline_version"] >= 1
