"""GET /api/pipeline/health. Offline: caches, the allin1 probe and installs are all faked."""

import subprocess
import types

import pytest

from services.pipeline import health
from services.pipeline.health import DISABLED, NEEDS_DOWNLOAD, READY, UNAVAILABLE, pipeline_health
from test_pipeline import client, install_manager, make_config  # noqa: F401  (fixtures)


def status(s, detail="x"):
    return {"status": s, "detail": detail}


@pytest.fixture
def no_downloads(monkeypatch):
    """Any download attempt fails the test."""
    import huggingface_hub
    import torch

    def boom(*a, **k):
        raise AssertionError("health check tried to download")
    monkeypatch.setattr(huggingface_hub, "hf_hub_download", boom)
    monkeypatch.setattr(huggingface_hub, "snapshot_download", boom)
    monkeypatch.setattr(torch.hub, "load_state_dict_from_url", boom)
    monkeypatch.setattr(torch.hub, "download_url_to_file", boom)


@pytest.fixture
def probe(monkeypatch):
    """Fake allin1 probe: set .result to a CompletedProcess or an exception."""
    state = types.SimpleNamespace(result=subprocess.CompletedProcess([], 0, b"", b""), calls=[])

    def run(argv, **kwargs):
        state.calls.append(argv)
        if isinstance(state.result, BaseException):
            raise state.result
        return state.result
    monkeypatch.setattr(health.subprocess, "run", run)
    monkeypatch.setattr(health.shutil, "which", lambda p: f"/usr/bin/{p}")
    return state


def test_endpoint_reports_every_stage_without_downloading(client, install_manager, no_downloads, probe):
    install_manager()
    r = client.get("/api/pipeline/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body["stages"]) == {"extracting", "separating", "rhythm", "chords", "events"}
    assert set(body["components"]) == {"ffmpeg", "demucs", "allin1", "beat_this", "btc", "lv_chordia"}
    for s in list(body["stages"].values()) + list(body["components"].values()):
        assert s["status"] in (READY, NEEDS_DOWNLOAD, UNAVAILABLE, DISABLED) and s["detail"]
    assert body["ready"] == all(s["status"] == READY for s in body["stages"].values())
    assert body["will_fail"] == [n for n, s in body["stages"].items() if s["status"] == UNAVAILABLE]


# ── components ─────────────────────────────────────────────────────────

def test_ffmpeg(monkeypatch):
    monkeypatch.setattr(health, "find_ffmpeg", lambda: None)
    assert health.check_ffmpeg()["status"] == UNAVAILABLE
    monkeypatch.setattr(health, "find_ffmpeg", lambda: "C:/ffmpeg/bin/ffmpeg.exe")
    assert health.check_ffmpeg() == status(READY, "ffmpeg found.")  # no path in the response


def test_demucs_needs_its_cached_bag_and_weights(monkeypatch, tmp_path):
    bag = tmp_path / "htdemucs.yaml"
    bag.write_text("models: ['955717e8']\n")
    cached = {"htdemucs.yaml": str(bag)}
    monkeypatch.setattr(health, "_hf_cached", lambda repo, f, revision=None: cached.get(f))
    assert health.check_demucs()["status"] == NEEDS_DOWNLOAD
    cached["955717e8.safetensors"] = str(bag)
    assert health.check_demucs()["status"] == READY
    monkeypatch.setattr(health, "_installed", lambda m: m != "demucs")
    assert health.check_demucs()["status"] == UNAVAILABLE


def test_beat_this_checkpoint(monkeypatch, tmp_path):
    import torch
    monkeypatch.setattr(torch.hub, "get_dir", lambda: str(tmp_path))
    assert health.check_beat_this()["status"] in (NEEDS_DOWNLOAD, UNAVAILABLE)
    monkeypatch.setattr(health, "_installed", lambda m: True)
    assert health.check_beat_this()["status"] == NEEDS_DOWNLOAD
    (tmp_path / "checkpoints").mkdir()
    (tmp_path / "checkpoints" / "beat_this-final0.ckpt").write_bytes(b"ckpt")
    assert health.check_beat_this()["status"] == READY
    monkeypatch.setattr(health, "_installed", lambda m: m != "beat_this")
    assert health.check_beat_this()["status"] == UNAVAILABLE


def test_btc_checks_the_pinned_revision_in_the_cache(monkeypatch):
    seen = []
    monkeypatch.setattr(health, "_installed", lambda m: True)
    monkeypatch.setattr(health, "_hf_cached", lambda repo, f, revision=None: seen.append((repo, revision)) or "p")
    assert health.check_btc()["status"] == READY
    assert set(seen) == {("puar-playground/btc-chord", health.btc_adapter.REVISION)}
    monkeypatch.setattr(health, "_hf_cached", lambda repo, f, revision=None: None)
    assert health.check_btc()["status"] == NEEDS_DOWNLOAD
    monkeypatch.setattr(health, "_installed", lambda m: m != "transformers")
    assert health.check_btc()["status"] == UNAVAILABLE


def test_lv_chordia(monkeypatch):
    monkeypatch.setattr(health.lv_chordia_adapter, "unavailable_reason", lambda: "lv-chordia is not installed")
    assert health.check_lv_chordia() == status(UNAVAILABLE, "lv-chordia is not installed.")
    monkeypatch.setattr(health.lv_chordia_adapter, "unavailable_reason", lambda: None)
    assert health.check_lv_chordia()["status"] == READY


def test_allin1_probe(tmp_path, probe):
    cfg = make_config(tmp_path, wsl_command="wsl.exe -d Ubuntu -- /home/me/env/bin/python")
    assert health.check_allin1(cfg)["status"] == READY
    assert probe.calls == [["wsl.exe", "-d", "Ubuntu", "--", "/home/me/env/bin/python", "-c", "import allin1"]]

    probe.result = subprocess.CompletedProcess([], 1, b"", b"ModuleNotFoundError: No module named 'allin1'")
    assert health.check_allin1(cfg) == status(UNAVAILABLE, "allin1 is not installed in the WSL2 Python.")
    probe.result = subprocess.CompletedProcess([], 4294967295, b"", "There is no distribution".encode("utf-16-le"))
    assert health.check_allin1(cfg)["status"] == UNAVAILABLE
    probe.result = subprocess.TimeoutExpired("wsl", 20)
    assert "did not answer" in health.check_allin1(cfg)["detail"]


def test_allin1_disabled_or_missing_command(tmp_path, probe, monkeypatch):
    assert health.check_allin1(make_config(tmp_path, wsl_enabled=False))["status"] == DISABLED
    monkeypatch.setattr(health.shutil, "which", lambda p: None)
    assert health.check_allin1(make_config(tmp_path))["status"] == UNAVAILABLE
    assert probe.calls == []


# ── stages ─────────────────────────────────────────────────────────────

@pytest.fixture
def components(monkeypatch):
    state = types.SimpleNamespace(ffmpeg=status(READY), demucs=status(READY), allin1=status(UNAVAILABLE),
                                  beat_this=status(READY), btc=status(READY), lv_chordia=status(READY))
    for name in ("ffmpeg", "demucs", "beat_this", "btc", "lv_chordia"):
        monkeypatch.setattr(health, f"check_{name}", lambda name=name: getattr(state, name))
    monkeypatch.setattr(health, "check_allin1", lambda cfg: state.allin1)
    return state


def test_all_ready(tmp_path, components):
    h = pipeline_health(make_config(tmp_path))
    assert h["ready"] is True and h["will_fail"] == [] and h["needs_download"] == []
    assert h["stages"]["rhythm"]["engine"] == "beat_this" and "sections will be empty" in h["stages"]["rhythm"]["detail"]


def test_auto_rhythm_prefers_a_ready_allin1(tmp_path, components):
    components.allin1 = status(READY)
    assert pipeline_health(make_config(tmp_path))["stages"]["rhythm"]["engine"] == "allin1"


def test_forced_allin1_with_wsl_disabled_will_fail(tmp_path, components):
    components.allin1 = status(DISABLED)
    h = pipeline_health(make_config(tmp_path, rhythm_engine="allin1"))
    assert h["stages"]["rhythm"]["status"] == UNAVAILABLE and h["will_fail"] == ["rhythm"] and h["ready"] is False


def test_beat_this_download_pending(tmp_path, components):
    components.beat_this = status(NEEDS_DOWNLOAD)
    h = pipeline_health(make_config(tmp_path))
    assert h["needs_download"] == ["rhythm"] and h["will_fail"] == [] and h["ready"] is False


def test_chords_with_btc_download_pending_are_covered_by_lv_chordia(tmp_path, components):
    components.btc = status(NEEDS_DOWNLOAD)
    chords = pipeline_health(make_config(tmp_path))["stages"]["chords"]
    assert chords["status"] == READY and chords["engine"] == "btc" and "fallback" in chords["detail"]


def test_chords_without_btc_or_fallback(tmp_path, components):
    components.btc = status(UNAVAILABLE)
    components.lv_chordia = status(UNAVAILABLE, "lv-chordia is not installed.")
    h = pipeline_health(make_config(tmp_path))
    assert h["stages"]["chords"]["status"] == UNAVAILABLE and "chords" in h["will_fail"]
    components.btc = status(NEEDS_DOWNLOAD)
    assert pipeline_health(make_config(tmp_path))["needs_download"] == ["chords"]


def test_forced_chord_engines(tmp_path, components):
    components.lv_chordia = status(UNAVAILABLE)
    assert pipeline_health(make_config(tmp_path, chord_engine="lv_chordia"))["will_fail"] == ["chords"]
    assert pipeline_health(make_config(tmp_path, chord_engine="btc"))["stages"]["chords"]["status"] == READY


def test_missing_ffmpeg_and_demucs_will_fail(tmp_path, components):
    components.ffmpeg = status(UNAVAILABLE)
    components.demucs = status(UNAVAILABLE)
    assert pipeline_health(make_config(tmp_path))["will_fail"] == ["extracting", "separating"]
