"""
Step 2 of the job pipeline: the Demucs stage. Offline — the model calls in
services.stem_separation are replaced by stand-ins, so nothing is downloaded
and no network is used.
"""

import os
import threading
import time
import urllib.error
from types import SimpleNamespace

import numpy as np
import pytest
import soundfile as sf

from services import stem_separation
from services.pipeline import demucs_stage, errors
from services.pipeline.errors import PipelineError
from test_pipeline import client, install_manager, needs_ffmpeg, post_file, wait_done, wav_bytes  # noqa: F401  (fixtures)


def stems_of(wav):
    return {"vocals": wav * 0.4, "drums": wav * 0.3, "bass": wav * 0.2, "other": wav * 0.1}


@pytest.fixture
def demucs(monkeypatch):
    """A controllable stand-in for stem_separation.load_model / separate."""
    state = SimpleNamespace(load_calls=[], sep_calls=[], load_error=None, sep_error=None,
                            result=stems_of, progress_steps=(0, 50, 99), before_progress=None, returned=False)

    def load_model(model=None, device=None):
        state.load_calls.append((model, device))
        if state.load_error:
            raise state.load_error

    def separate(wav, progress=None, model=None, device=None):
        state.sep_calls.append((model, device, wav.shape))
        for pct in state.progress_steps:
            if state.before_progress:
                state.before_progress()
            progress(pct)
        if state.sep_error:
            raise state.sep_error
        state.returned = True
        return state.result(wav)

    monkeypatch.setattr(stem_separation, "load_model", load_model)
    monkeypatch.setattr(stem_separation, "separate", separate)
    return state


def write_wav(path, seconds=2.0, sr=44100, channels=2) -> np.ndarray:
    t = np.arange(int(seconds * sr)) / sr
    mono = (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    data = mono if channels == 1 else np.stack([mono, mono * 0.5], axis=1)
    sf.write(str(path), data, sr, subtype="FLOAT")
    return data


def run_stage(tmp_path, device="cpu", progress=lambda _p: None):
    src = tmp_path / "audio.wav"
    if not src.exists():
        write_wav(src)
    return demucs_stage.separate_stems(str(src), str(tmp_path / "stems"), device=device, progress=progress)


# ── the stage ──────────────────────────────────────────────────────────

def test_writes_vocals_no_vocals_and_drums_aligned_with_the_input(tmp_path, demucs):
    original = write_wav(tmp_path / "audio.wav", seconds=2.0)
    out = run_stage(tmp_path)

    assert set(out.paths) == {"vocals", "no_vocals", "drums"}
    assert (out.model, out.device, out.warnings) == ("htdemucs", "cpu", [])
    assert demucs.load_calls == [("htdemucs", "cpu")]
    for name, gain in (("vocals", 0.4), ("no_vocals", 0.6), ("drums", 0.3)):
        data, sr = sf.read(out.paths[name], dtype="float32", always_2d=True)
        assert sr == 44100 and data.shape == original.shape  # same length = same timestamps
        np.testing.assert_allclose(data, original * gain, atol=1e-6)


def test_mono_audio_is_given_to_demucs_as_stereo(tmp_path, demucs):
    write_wav(tmp_path / "audio.wav", seconds=1.0, channels=1)
    run_stage(tmp_path)
    assert demucs.sep_calls[0][2] == (2, 44100)


def test_progress_is_forwarded(tmp_path, demucs):
    seen = []
    run_stage(tmp_path, progress=seen.append)
    assert seen == [0, 50, 99]


def test_unavailable_gpu_falls_back_to_cpu_with_a_warning(tmp_path, demucs, monkeypatch):
    import torch
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    out = run_stage(tmp_path, device="cuda")
    assert out.device == "cpu" and "no such CUDA GPU" in out.warnings[0]
    assert demucs.load_calls == [("htdemucs", "cpu")] and demucs.sep_calls[0][1] == "cpu"


def test_resolve_device(monkeypatch):
    import torch
    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    monkeypatch.setattr(torch.cuda, "device_count", lambda: 1)
    assert demucs_stage.resolve_device("cuda") == ("cuda", None)
    assert demucs_stage.resolve_device("CUDA:0") == ("cuda:0", None)
    assert demucs_stage.resolve_device("cuda:3")[0] == "cpu"
    assert demucs_stage.resolve_device("cpu") == ("cpu", None)
    device, warning = demucs_stage.resolve_device("tpu")
    assert device == "cpu" and "Unknown DEMUCS_DEVICE" in warning


def test_missing_demucs(tmp_path, demucs):
    demucs.load_error = ImportError("No module named 'demucs'")
    with pytest.raises(PipelineError) as e:
        run_stage(tmp_path)
    assert e.value.code == errors.DEMUCS_MISSING and "pip install" in e.value.message


@pytest.mark.parametrize("failure", [
    urllib.error.URLError("getaddrinfo failed"),
    ConnectionResetError("connection reset"),
    RuntimeError("PytorchStreamReader failed reading zip archive"),
    "checksum",
])
def test_model_download_or_load_failure(tmp_path, demucs, failure):
    if failure == "checksum":
        from demucs.repo import ModelLoadingError
        failure = ModelLoadingError("Invalid checksum for file 955717e8-8726e21a.th")
    demucs.load_error = failure
    with pytest.raises(PipelineError) as e:
        run_stage(tmp_path)
    assert e.value.code == errors.MODEL_DOWNLOAD_FAILED
    assert "955717e8" not in e.value.message and "getaddrinfo" not in e.value.message
    assert demucs.sep_calls == []


def test_separation_failure(tmp_path, demucs):
    demucs.sep_error = RuntimeError(r"internal error in C:\torch\lib")
    with pytest.raises(PipelineError) as e:
        run_stage(tmp_path)
    assert e.value.code == errors.SEPARATION_FAILED and "torch" not in e.value.message


def test_out_of_memory_is_explained(tmp_path, demucs):
    demucs.sep_error = RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB")
    with pytest.raises(PipelineError) as e:
        run_stage(tmp_path)
    assert e.value.code == errors.SEPARATION_FAILED and "out of memory" in e.value.message


def test_unexpected_demucs_output_is_a_separation_failure(tmp_path, demucs):
    demucs.result = lambda wav: {"vocals": wav, "drums": wav}  # no bass / other
    with pytest.raises(PipelineError) as e:
        run_stage(tmp_path)
    assert e.value.code == errors.SEPARATION_FAILED


def test_an_error_raised_by_the_progress_callback_stops_the_stage(tmp_path, demucs):
    def deadline_passed(_pct):
        raise PipelineError(errors.JOB_TIMEOUT, "too long")
    with pytest.raises(PipelineError) as e:
        run_stage(tmp_path, progress=deadline_passed)
    assert e.value.code == errors.JOB_TIMEOUT and demucs.returned is False


# ── stem_separation: device + one-at-a-time ────────────────────────────

class FakeSeparator:
    made = []
    active = 0
    max_active = 0
    lock = threading.Lock()

    def __init__(self, model, device, **_kw):
        FakeSeparator.made.append((model, device))

    def update_parameter(self, callback=None):
        self.callback = callback

    def separate_tensor(self, wav, sr):
        with FakeSeparator.lock:
            FakeSeparator.active += 1
            FakeSeparator.max_active = max(FakeSeparator.max_active, FakeSeparator.active)
        time.sleep(0.05)
        with FakeSeparator.lock:
            FakeSeparator.active -= 1
        return wav, {"vocals": wav, "drums": wav, "bass": wav, "other": wav}


@pytest.fixture
def fake_separator(monkeypatch):
    import demucs.api
    FakeSeparator.made, FakeSeparator.active, FakeSeparator.max_active = [], 0, 0
    monkeypatch.setattr(demucs.api, "Separator", FakeSeparator)
    monkeypatch.setattr(stem_separation, "_separators", {})
    return FakeSeparator


def test_models_are_loaded_once_per_model_and_device(fake_separator, monkeypatch):
    monkeypatch.setattr(stem_separation, "DEFAULT_DEVICE", "cpu")
    stem_separation.load_model("htdemucs")
    stem_separation.load_model("htdemucs", "cpu")
    stem_separation.load_model("htdemucs", "cuda")
    assert fake_separator.made == [("htdemucs", "cpu"), ("htdemucs", "cuda")]


def test_demucs_device_env_sets_the_default(fake_separator, monkeypatch):
    monkeypatch.setattr(stem_separation, "DEFAULT_DEVICE", "mps")
    stem_separation.load_model("htdemucs")
    assert fake_separator.made == [("htdemucs", "mps")]


def test_only_one_separation_runs_at_a_time(fake_separator):
    wav = np.zeros((2, 4410), dtype=np.float32)
    threads = [threading.Thread(target=stem_separation.separate, args=(wav,)) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert fake_separator.max_active == 1


# ── through the job API ────────────────────────────────────────────────

@needs_ffmpeg
def test_separating_progress_fills_its_slice_of_the_bar(client, install_manager, demucs):
    manager = install_manager()
    updates = []
    original = manager.store.update_job
    manager.store.update_job = lambda job_id, **f: (updates.append(f), original(job_id, **f))[1]

    done = wait_done(client, post_file(client, wav_bytes(2.0)).json()["job_id"])
    assert done["status"] == "completed", done
    separating = [u["progress"] for u in updates if u.get("stage") == "separating"]
    assert separating == [15, 15.0, 30.0, 44.7]
    assert done["result"]["engines"]["separation"] == "demucs:htdemucs@cpu"


@needs_ffmpeg
def test_failed_separation_is_not_cached_and_can_be_retried(client, install_manager, demucs):
    install_manager()
    data = wav_bytes(2.0)
    demucs.sep_error = RuntimeError("boom")
    failed = wait_done(client, post_file(client, data).json()["job_id"])
    assert failed["status"] == "failed" and failed["error"]["code"] == errors.SEPARATION_FAILED

    demucs.sep_error = None
    retry = post_file(client, data).json()
    assert retry["cached"] is False
    assert wait_done(client, retry["job_id"])["status"] == "completed"
    assert post_file(client, data).json()["cached"] is True


@needs_ffmpeg
def test_failed_model_download_is_retryable(client, install_manager, demucs):
    install_manager()
    data = wav_bytes(2.0)
    demucs.load_error = urllib.error.URLError("offline")
    failed = wait_done(client, post_file(client, data).json()["job_id"])
    assert failed["error"]["code"] == errors.MODEL_DOWNLOAD_FAILED
    demucs.load_error = None
    assert wait_done(client, post_file(client, data).json()["job_id"])["status"] == "completed"


@needs_ffmpeg
def test_job_timeout_stops_separation_at_a_chunk_boundary(client, install_manager, demucs):
    install_manager(job_timeout_seconds=1)
    demucs.before_progress = lambda: time.sleep(0.6)
    done = wait_done(client, post_file(client, wav_bytes(2.0)).json()["job_id"])
    assert done["status"] == "failed" and done["error"]["code"] == errors.JOB_TIMEOUT
    assert "longer than 1 seconds" in done["error"]["message"]  # not "0 minutes"
    assert demucs.returned is False


@needs_ffmpeg
def test_gpu_fallback_warning_reaches_the_result(client, install_manager, demucs, monkeypatch):
    import torch
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    install_manager(demucs_device="cuda")
    result = wait_done(client, post_file(client, wav_bytes(2.0)).json()["job_id"])["result"]
    assert result["engines"]["separation"] == "demucs:htdemucs@cpu"
    assert any("CUDA" in w for w in result["warnings"])


@needs_ffmpeg
def test_keep_stems_leaves_only_the_three_stems(client, install_manager, demucs):
    manager = install_manager(keep_stems=True)
    job_id = post_file(client, wav_bytes(2.0)).json()["job_id"]
    assert wait_done(client, job_id)["status"] == "completed"
    job_dir = os.path.join(manager.config.jobs_dir, job_id)
    assert os.listdir(job_dir) == ["stems"]
    assert sorted(os.listdir(os.path.join(job_dir, "stems"))) == ["drums.wav", "no_vocals.wav", "vocals.wav"]


@needs_ffmpeg
def test_keep_stems_still_deletes_a_failed_job(client, install_manager, demucs):
    manager = install_manager(keep_stems=True)
    demucs.result = lambda wav: {"vocals": wav}
    job_id = post_file(client, wav_bytes(2.0)).json()["job_id"]
    assert wait_done(client, job_id)["status"] == "failed"
    assert os.listdir(manager.config.jobs_dir) == []
