"""
Step 4 of the job pipeline: the chord timeline. Offline — `transformers` and
`lv_chordia` are replaced by fake modules, so no model is downloaded or run.
"""

import importlib.machinery
import os
import sys
import time
import types

import pytest

from services.pipeline import chord_stage, errors, jobs
from services.pipeline.chord_stage import NO_CHORDS_FOUND, analyze_chords, clean_chords
from services.pipeline.chords import RawChords, btc_adapter, harte, lv_chordia_adapter
from services.pipeline.config import PIPELINE_VERSION
from services.pipeline.errors import PipelineError
from services.pipeline.rhythm_stage import NO_PULSE, RhythmResult
from test_pipeline import (client, fake_demucs, install_manager, make_config, needs_ffmpeg,  # noqa: F401  (fixtures)
                           post_file, wait_done, wav_bytes)

pytestmark = pytest.mark.usefixtures("fake_demucs")


@pytest.fixture
def fake_chords():
    """Overrides conftest's stub: these tests run the real chord stage."""


def seg(start, end, chord):
    return {"start": start, "end": end, "chord": chord}


TIMELINE = [seg(0.0, 2.0, "N"), seg(2.0, 4.0, "C"), seg(4.0, 6.0, "C:maj"), seg(6.0, 9.0, "A:min7"),
            seg(9.0, 15.0, "G:maj/3")]


# ── Harte -> app symbols ───────────────────────────────────────────────

@pytest.mark.parametrize("label, harte_label, simple", [
    ("C", "C:maj", "C"),
    ("C:maj", "C:maj", "C"),
    ("A:min", "A:min", "Am"),
    ("A:min7", "A:min7", "Am7"),
    ("G:7", "G:7", "G7"),
    ("F:maj7", "F:maj7", "Fmaj7"),
    ("B:hdim7", "B:hdim7", "Bm7b5"),
    ("E:dim7", "E:dim7", "Edim7"),
    ("F#:minmaj7", "F#:minmaj7", "F#mMaj7"),
    ("D:sus4(b7)", "D:sus4(b7)", "D7sus4"),
    ("C:maj6", "C:maj6", "C6"),
    ("C:min9", "C:min9", "Cm9"),
    ("Bb:maj", "Bb:maj", "A#"),  # flats are spelled with sharps, like the v2 engine
    ("Cb:min", "Cb:min", "Bm"),
    ("G:maj/3", "G:maj/3", "G/B"),
    ("C:min/b3", "C:min/b3", "Cm/D#"),
    ("C:maj/b7", "C:maj/b7", "C/A#"),
    ("C/5", "C:maj/5", "C/G"),
    ("C:maj/1", "C:maj/1", "C"),  # bass on the root is no slash chord
])
def test_harte_labels_map_to_app_symbols(label, harte_label, simple):
    chord = harte.parse(label)
    assert (chord.harte, chord.simple, chord.no_chord) == (harte_label, simple, False)


@pytest.mark.parametrize("label", ["N", "X"])
def test_no_chord_and_unknown_chord(label):
    assert harte.parse(label) == harte.Chord(label, "N", True)


def test_quality_without_an_app_symbol_keeps_harte_and_no_simple():
    assert harte.parse("C:(1,3,5)") == harte.Chord("C:(1,3,5)", None, False)


@pytest.mark.parametrize("label", ["", "H:maj", "c:maj", "C:", "C:maj/x", "C:maj/8", "Cmaj7"])
def test_non_harte_labels_are_rejected(label):
    with pytest.raises(ValueError):
        harte.parse(label)


def test_every_btc_large_vocabulary_chord_has_an_app_symbol():
    # The quality list of btc_src/features.py at the pinned revision (index % 14 == 1 is the bare root).
    qualities = ["min", "maj", "dim", "aug", "min6", "maj6", "min7", "minmaj7", "maj7", "7", "dim7", "hdim7",
                 "sus2", "sus4"]
    for root in harte.NOTE_NAMES:
        for i, quality in enumerate(qualities):
            label = root if i == 1 else f"{root}:{quality}"
            assert harte.parse(label).simple, label


def test_every_lv_chordia_submission_chord_has_an_app_symbol():
    # lv_chordia/data/submission_chord_list.txt (1.1.0)
    for label in ["C:min/b7", "C:min/2", "C:maj/b7", "C:maj/2", "C:sus4(b7)", "C:sus2", "C:sus4", "C:13", "C:11",
                  "C:min9", "C:9", "C:maj9", "C:dim7", "C:hdim7", "C:min7", "C:7", "C:maj7", "C:min/5", "C:min/b3",
                  "C:maj/5", "C:maj/3", "C:dim", "C:aug", "C:min", "C:maj"]:
        assert harte.parse(label).simple, label


# ── cleaning ───────────────────────────────────────────────────────────

def test_spans_are_clamped_merged_and_labelled():
    chords, warnings = clean_chords(TIMELINE, 12.0)
    assert chords == [
        {"start": 0.0, "end": 2.0, "chord": "N", "simple": "N", "type": "no_chord"},
        {"start": 2.0, "end": 6.0, "chord": "C:maj", "simple": "C", "type": "chord"},  # "C" + "C:maj" merged
        {"start": 6.0, "end": 9.0, "chord": "A:min7", "simple": "Am7", "type": "chord"},
        {"start": 9.0, "end": 12.0, "chord": "G:maj/3", "simple": "G/B", "type": "chord"},  # clamped
    ]
    assert warnings == []


def test_empty_invalid_and_overlapping_spans():
    chords, _ = clean_chords([
        seg(-1.0, 1.0, "C"), seg(1.0, 1.0, "D"), seg(0.5, 3.0, "E:min"), seg(float("nan"), 4.0, "F"),
        seg(3.0, float("inf"), "G"), seg(13.0, 14.0, "A"), seg(3.0, 4.0, "E:min"),
    ], 12.0)
    # negative start clamped; zero-length, non-finite and past-the-end spans dropped; overlap trimmed;
    # E:min resumes within the merge gap.
    assert [(c["start"], c["end"], c["chord"]) for c in chords] == [(0.0, 1.0, "C:maj"), (1.0, 4.0, "E:min")]


def test_identical_chords_with_a_real_gap_stay_separate():
    chords, _ = clean_chords([seg(0.0, 1.0, "C"), seg(1.5, 2.0, "C")], 12.0)
    assert len(chords) == 2


def test_merge_tolerates_lv_chordia_rounding():
    chords, _ = clean_chords([seg(0.0, 1.0, "C:maj"), seg(1.01, 2.0, "C:maj")], 12.0)
    assert [(c["start"], c["end"]) for c in chords] == [(0.0, 2.0)]


@pytest.mark.parametrize("segments", [
    None,
    {"start": 0, "end": 1, "chord": "C"},
    [seg(0.0, 1.0, "C"), {"start": 1.0, "end": 2.0}],
    [seg("soon", 1.0, "C")],
    [seg(0.0, 1.0, "not a chord")],
    [seg(0.0, 1.0, 7)],
    ["C:maj"],
    [],
    [seg(5.0, 5.0, "C"), seg(13.0, 14.0, "D")],  # nothing usable left
])
def test_malformed_output_is_an_error(segments):
    with pytest.raises(PipelineError) as e:
        clean_chords(segments, 12.0)
    assert e.value.code == errors.INVALID_CHORD_RESULT


def test_all_no_chord_and_unnamed_quality_warnings():
    _, warnings = clean_chords([seg(0.0, 12.0, "N")], 12.0)
    assert warnings == [NO_CHORDS_FOUND]
    chords, warnings = clean_chords([seg(0.0, 12.0, "C:(1,3,5)")], 12.0)
    assert chords[0]["simple"] is None and "(1,3,5)" in warnings[0]


# ── engine choice and fallback ─────────────────────────────────────────

@pytest.fixture
def engines(monkeypatch):
    """Stand-ins for both adapters; set .btc / .lv to a segment list or an exception, .lv_reason to block lv."""
    class State:
        btc = list(TIMELINE)
        lv = [seg(0.0, 6.0, "D:min"), seg(6.0, 12.0, "G:7")]
        lv_reason = None
        calls = []
        devices = []

    def outcome(name, heartbeat):
        State.calls.append(name)
        heartbeat(50)
        value = getattr(State, name)
        if callable(value):
            value = value(heartbeat)
        if isinstance(value, BaseException):
            raise value
        return list(value)

    def btc(stem, *, device, timeout_seconds, heartbeat):
        State.devices.append(device)
        return RawChords(engine=f"btc@{device}", segments=outcome("btc", heartbeat))

    def lv(stem, *, timeout_seconds, heartbeat):
        return RawChords(engine="lv_chordia@cpu", segments=outcome("lv", heartbeat))

    monkeypatch.setattr(btc_adapter, "analyze", btc)
    monkeypatch.setattr(lv_chordia_adapter, "analyze", lv)
    monkeypatch.setattr(lv_chordia_adapter, "unavailable_reason", lambda: State.lv_reason)
    return State


@pytest.fixture
def stem(tmp_path):
    path = tmp_path / "no_vocals.wav"
    path.write_bytes(wav_bytes(12.0))
    return str(path)


def run(stem_path, tmp_path, progress=lambda _p: None, **config):
    return analyze_chords(stem_path, duration=12.0, config=make_config(tmp_path, **config),
                          remaining=lambda: 600.0, progress=progress)


def test_btc_success(stem, tmp_path, engines):
    r = run(stem, tmp_path)
    assert engines.calls == ["btc"] and engines.devices == ["cpu"]
    assert r.engine == "btc@cpu" and r.warnings == []
    assert [c["simple"] for c in r.chords] == ["N", "C", "Am7", "G/B"]


def test_device_is_configurable_and_falls_back_to_cpu_with_a_warning(stem, tmp_path, engines, monkeypatch):
    monkeypatch.setattr(chord_stage, "resolve_device", lambda d: (d, None))
    assert run(stem, tmp_path, chord_device="cuda:1").engine == "btc@cuda:1"
    monkeypatch.setattr(chord_stage, "resolve_device", lambda d: ("cpu", "no GPU"))
    r = run(stem, tmp_path, chord_device="cuda")
    assert r.engine == "btc@cpu" and r.warnings == [
        "PIPELINE_CHORD_DEVICE=cuda is not available; chords were recognised on the CPU."]


@pytest.mark.parametrize("code", [errors.CHORD_MODEL_MISSING, errors.CHORD_MODEL_DOWNLOAD_FAILED,
                                  errors.CHORD_INFERENCE_FAILED, errors.INVALID_CHORD_RESULT])
def test_btc_failure_falls_back_to_installed_lv_chordia(stem, tmp_path, engines, code):
    engines.btc = PipelineError(code, "nope")
    r = run(stem, tmp_path)
    assert engines.calls == ["btc", "lv"]
    assert r.engine == "lv_chordia@cpu" and [c["simple"] for c in r.chords] == ["Dm", "G7"]
    assert code in r.warnings[0] and "lv-chordia was used instead" in r.warnings[0]


def test_malformed_btc_output_falls_back(stem, tmp_path, engines):
    engines.btc = [seg(0.0, 1.0, "???")]
    assert run(stem, tmp_path).engine == "lv_chordia@cpu"


def test_no_fallback_available_is_a_clear_btc_error(stem, tmp_path, engines):
    engines.btc = PipelineError(errors.CHORD_MODEL_DOWNLOAD_FAILED, "The BTC chord model could not be downloaded.")
    engines.lv_reason = "lv-chordia is not installed"
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path)
    assert e.value.code == errors.CHORD_MODEL_DOWNLOAD_FAILED and engines.calls == ["btc"]
    assert "could not be downloaded" in e.value.message and "lv-chordia is not installed" in e.value.message


def test_both_engines_failing_is_a_clear_error(stem, tmp_path, engines):
    engines.btc = PipelineError(errors.CHORD_MODEL_DOWNLOAD_FAILED, "BTC download failed.")
    engines.lv = PipelineError(errors.CHORD_INFERENCE_FAILED, "lv-chordia could not recognise chords.")
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path)
    assert e.value.code == errors.CHORD_INFERENCE_FAILED
    assert "BTC download failed" in e.value.message and "lv-chordia could not" in e.value.message


def test_forced_btc_does_not_fall_back(stem, tmp_path, engines):
    engines.btc = PipelineError(errors.CHORD_INFERENCE_FAILED, "nope")
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path, chord_engine="btc")
    assert e.value.code == errors.CHORD_INFERENCE_FAILED and engines.calls == ["btc"]


def test_forced_lv_chordia_skips_btc(stem, tmp_path, engines):
    r = run(stem, tmp_path, chord_engine="lv_chordia")
    assert engines.calls == ["lv"] and r.engine == "lv_chordia@cpu" and r.warnings == []


@pytest.mark.parametrize("code", [errors.CHORD_TIMEOUT, errors.JOB_TIMEOUT])
def test_timeouts_never_fall_back(stem, tmp_path, engines, code):
    engines.btc = PipelineError(code, "too slow")
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path)
    assert e.value.code == code and engines.calls == ["btc"]


def test_missing_no_vocals_stem(tmp_path, engines):
    with pytest.raises(PipelineError) as e:
        run(str(tmp_path / "missing.wav"), tmp_path)
    assert e.value.code == errors.STEM_MISSING and engines.calls == []


def test_progress_is_forwarded(stem, tmp_path, engines):
    seen = []
    run(stem, tmp_path, progress=seen.append)
    assert seen == [50]


# ── BTC adapter (fake transformers module) ─────────────────────────────

@pytest.fixture
def transformers(monkeypatch):
    """A fake `transformers` whose AutoModel records the call and returns a model with .predict."""
    class Model:
        delay = 0.0
        output = [seg(0.0, 2.0, "C")]
        error = None

        def predict(self, path):
            Model.paths.append(path)
            time.sleep(Model.delay)
            if Model.error:
                raise Model.error
            return Model.output

    Model.paths = []
    calls = []

    class AutoModel:
        error = None

        @staticmethod
        def from_pretrained(repo, **kwargs):
            calls.append((repo, kwargs))
            if AutoModel.error:
                raise AutoModel.error
            return Model()

    module = types.ModuleType("transformers")
    module.AutoModel = AutoModel
    monkeypatch.setitem(sys.modules, "transformers", module)
    monkeypatch.setattr(btc_adapter, "_models", {})
    return types.SimpleNamespace(module=module, AutoModel=AutoModel, Model=Model, calls=calls)


def run_btc(stem_path, timeout=30.0, heartbeat=lambda _p: None):
    return btc_adapter.analyze(stem_path, device="cpu", timeout_seconds=timeout, heartbeat=heartbeat)


def test_btc_loads_the_pinned_revision_with_remote_code(stem, transformers):
    raw = run_btc(stem)
    assert raw.engine == "btc@cpu" and raw.segments == [seg(0.0, 2.0, "C")]
    assert transformers.calls == [("puar-playground/btc-chord", {
        "trust_remote_code": True, "revision": btc_adapter.REVISION, "code_revision": btc_adapter.REVISION,
        "device": "cpu"})]
    assert len(btc_adapter.REVISION) == 40 and int(btc_adapter.REVISION, 16)  # a commit hash, not a branch
    assert transformers.Model.paths == [stem]


def test_btc_model_is_loaded_once(stem, transformers):
    run_btc(stem)
    run_btc(stem)
    assert len(transformers.calls) == 1


def test_btc_without_transformers(stem, transformers, monkeypatch):
    monkeypatch.setitem(sys.modules, "transformers", None)
    with pytest.raises(PipelineError) as e:
        run_btc(stem)
    assert e.value.code == errors.CHORD_MODEL_MISSING and "pip install transformers" in e.value.message


def test_btc_remote_code_missing_a_dependency(stem, transformers):
    transformers.AutoModel.error = ImportError("No module named 'librosa'")
    with pytest.raises(PipelineError) as e:
        run_btc(stem)
    assert e.value.code == errors.CHORD_MODEL_MISSING


def test_btc_download_failure(stem, transformers):
    transformers.AutoModel.error = OSError("We couldn't connect to 'https://huggingface.co'")
    with pytest.raises(PipelineError) as e:
        run_btc(stem)
    assert e.value.code == errors.CHORD_MODEL_DOWNLOAD_FAILED and "huggingface.co" not in e.value.message
    transformers.AutoModel.error = None
    assert run_btc(stem).segments  # not cached as failed: the next job retries the download


def test_btc_inference_failure_and_out_of_memory(stem, transformers):
    transformers.Model.error = RuntimeError("shape mismatch")
    with pytest.raises(PipelineError) as e:
        run_btc(stem)
    assert e.value.code == errors.CHORD_INFERENCE_FAILED
    transformers.Model.error = RuntimeError("CUDA out of memory")
    with pytest.raises(PipelineError) as e:
        run_btc(stem)
    assert e.value.code == errors.CHORD_INFERENCE_FAILED and "memory" in e.value.message


def test_btc_timeout_and_heartbeat(stem, transformers):
    transformers.Model.delay = 2.0
    beats = []
    with pytest.raises(PipelineError) as e:
        run_btc(stem, timeout=0.6, heartbeat=beats.append)
    assert e.value.code == errors.CHORD_TIMEOUT
    assert beats and all(0 < p < 100 for p in beats)


def test_btc_job_deadline_stops_the_wait(stem, transformers):
    transformers.Model.delay = 2.0

    def deadline(_pct):
        raise PipelineError(errors.JOB_TIMEOUT, "too slow")
    with pytest.raises(PipelineError) as e:
        run_btc(stem, heartbeat=deadline)
    assert e.value.code == errors.JOB_TIMEOUT


# ── lv-chordia adapter (fake lv_chordia package) ───────────────────────

MODEL_NAMES = [f"model_s{i}.best" for i in range(5)]


@pytest.fixture
def lv(tmp_path, monkeypatch):
    """A fake installed lv_chordia with its five weight files in a temp cache dir."""
    cache = tmp_path / "cache_data"
    cache.mkdir()
    for name in MODEL_NAMES:
        (cache / f"{name}.sdict").write_bytes(b"weights")

    state = types.SimpleNamespace(rows=[{"start_time": 0.0, "end_time": 6.0, "chord": "D:min"},
                                        {"start_time": 6.0, "end_time": 12.0, "chord": "G:7"}],
                                  error=None, calls=[], cache=cache)

    def chord_recognition(path, chord_dict_name="submission"):
        state.calls.append((path, chord_dict_name))
        if state.error:
            raise state.error
        return state.rows

    def module(name, **attrs):
        m = types.ModuleType(name)
        m.__spec__ = importlib.machinery.ModuleSpec(name, None)
        m.__dict__.update(attrs)
        monkeypatch.setitem(sys.modules, name, m)
        return m

    module("lv_chordia", chord_recognition=chord_recognition)
    module("lv_chordia.chord_recognition", MODEL_NAMES=MODEL_NAMES, chord_recognition=chord_recognition)
    module("lv_chordia.mir")
    module("lv_chordia.mir.common", CACHE_DATA_PATH=str(cache))
    monkeypatch.setattr(lv_chordia_adapter, "_device", lambda: "cpu")
    return state


def run_lv(stem_path, timeout=30.0):
    return lv_chordia_adapter.analyze(stem_path, timeout_seconds=timeout, heartbeat=lambda _p: None)


def test_lv_chordia_success(stem, lv):
    assert lv_chordia_adapter.unavailable_reason() is None
    raw = run_lv(stem)
    assert raw.engine == "lv_chordia@cpu"
    assert raw.segments == [seg(0.0, 6.0, "D:min"), seg(6.0, 12.0, "G:7")]
    assert lv.calls == [(stem, "submission")]


def test_lv_chordia_not_installed(stem, monkeypatch):
    monkeypatch.setitem(sys.modules, "lv_chordia", None)  # find_spec() -> None, as when it isn't installed
    assert lv_chordia_adapter.unavailable_reason() == "lv-chordia is not installed"
    with pytest.raises(PipelineError) as e:
        run_lv(stem)
    assert e.value.code == errors.CHORD_MODEL_MISSING


def test_lv_chordia_without_its_weights_is_not_used(stem, lv):
    os.remove(lv.cache / f"{MODEL_NAMES[2]}.sdict")
    assert "model files are missing (1 of 5)" in lv_chordia_adapter.unavailable_reason()
    with pytest.raises(PipelineError) as e:
        run_lv(stem)
    assert e.value.code == errors.CHORD_MODEL_MISSING and lv.calls == []


def test_lv_chordia_that_cannot_be_imported(lv, monkeypatch):
    monkeypatch.setitem(sys.modules, "lv_chordia.chord_recognition", None)
    assert "not compatible" in lv_chordia_adapter.unavailable_reason()


def test_lv_chordia_inference_failure(stem, lv):
    lv.error = RuntimeError("bad CQT")
    with pytest.raises(PipelineError) as e:
        run_lv(stem)
    assert e.value.code == errors.CHORD_INFERENCE_FAILED


def test_lv_chordia_unexpected_rows(stem, lv):
    lv.rows = [{"start": 0.0, "end": 1.0, "chord": "C:maj"}]
    with pytest.raises(PipelineError) as e:
        run_lv(stem)
    assert e.value.code == errors.INVALID_CHORD_RESULT


# ── through the job API ────────────────────────────────────────────────

@needs_ffmpeg
def test_chords_reach_the_api_merged_and_clamped(client, install_manager, engines):
    install_manager()
    done = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])
    assert done["status"] == "completed", done
    result = done["result"]
    assert result["pipeline_version"] == PIPELINE_VERSION and result["engines"]["chords"] == "btc@cpu"
    assert [(c["start"], c["end"], c["chord"], c["simple"], c["type"]) for c in result["chords"]] == [
        (0.0, 2.0, "N", "N", "no_chord"), (2.0, 6.0, "C:maj", "C", "chord"),
        (6.0, 9.0, "A:min7", "Am7", "chord"), (9.0, 12.0, "G:maj/3", "G/B", "chord")]
    assert result["warnings"] == []


@needs_ffmpeg
def test_chord_progress_fills_its_slice_of_the_bar(client, install_manager, engines):
    manager = install_manager()
    updates = []
    original = manager.store.update_job
    manager.store.update_job = lambda job_id, **f: (updates.append(f), original(job_id, **f))[1]
    assert wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])["status"] == "completed"
    assert [u["progress"] for u in updates if u.get("stage") == "chords"] == [65, 75.0]


@needs_ffmpeg
def test_failed_chords_are_not_cached_and_can_be_retried(client, install_manager, engines):
    install_manager()
    data = wav_bytes(12.0)
    engines.btc = PipelineError(errors.CHORD_MODEL_DOWNLOAD_FAILED, "The BTC chord model could not be downloaded.")
    engines.lv_reason = "lv-chordia is not installed"
    failed = wait_done(client, post_file(client, data).json()["job_id"])
    assert failed["status"] == "failed" and failed["error"]["code"] == errors.CHORD_MODEL_DOWNLOAD_FAILED

    engines.btc = list(TIMELINE)
    retry = post_file(client, data).json()
    assert retry["cached"] is False
    assert wait_done(client, retry["job_id"])["status"] == "completed"
    assert post_file(client, data).json()["cached"] is True


@needs_ffmpeg
def test_job_timeout_during_chords(client, install_manager, engines):
    install_manager(job_timeout_seconds=2)

    def slow(heartbeat):
        while True:
            time.sleep(0.2)
            heartbeat(10)
    engines.btc = slow
    done = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])
    assert done["status"] == "failed" and done["error"]["code"] == errors.JOB_TIMEOUT
    assert engines.calls == ["btc"]  # the deadline is not a reason to try lv-chordia


@needs_ffmpeg
def test_beatless_song_still_gets_chords(client, install_manager, engines, monkeypatch):
    def beatless(stem_path, workdir, *, duration, config, remaining, progress):
        return RhythmResult(engine="beat_this@cpu", bpm=None, time_signature=None, beats=[], downbeats=[],
                            sections=[], warnings=[NO_PULSE])
    monkeypatch.setattr(jobs, "analyze_rhythm", beatless)
    install_manager()
    done = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])
    assert done["status"] == "completed", done
    result = done["result"]
    assert result["bpm"] is None and result["time_signature"] is None and result["beats"] == []
    assert len(result["chords"]) == 4 and result["warnings"] == [NO_PULSE]
