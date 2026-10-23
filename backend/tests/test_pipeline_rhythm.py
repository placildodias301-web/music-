"""
Step 3 of the job pipeline: rhythm and structure. Offline — allin1 is a fake
module run through the real WSL/subprocess runner path, and beat_this's
model is replaced by a stand-in, so nothing is downloaded.
"""

import os
import sys
import time

import numpy as np
import pytest
import soundfile as sf

from services.pipeline import errors, rhythm_stage
from services.pipeline.config import PIPELINE_VERSION
from services.pipeline.errors import PipelineError
from services.pipeline.rhythm import RawRhythm, allin1_adapter, beat_this_adapter
from services.pipeline.rhythm_stage import NO_PULSE, SECTIONS_UNAVAILABLE, analyze_rhythm, estimate_meter, validate
from test_pipeline import (client, fake_demucs, install_manager, make_config, needs_ffmpeg,  # noqa: F401  (fixtures)
                           post_file, wait_done, wav_bytes)

pytestmark = pytest.mark.usefixtures("fake_demucs")

PYTHON = sys.executable.replace("\\", "/")


@pytest.fixture
def fake_rhythm():
    """Overrides conftest's stub: these tests run the real rhythm stage."""


def grid(duration, bpm=120.0, per_bar=4, start=0.5):
    """Beats and downbeats of a steady pulse."""
    step = 60.0 / bpm
    beats = [round(start + i * step, 3) for i in range(int((duration - start) / step) + 1)]
    return beats, beats[::per_bar]


def allin1_raw(duration=12.0, **kw):
    beats, downbeats = grid(duration)
    values = dict(engine="allin1@wsl2", bpm=120.0, beats=beats, downbeats=downbeats,
                  sections=[{"start": 0.0, "end": 4.5, "label": "intro"}, {"start": 4.5, "end": 99.0, "label": "Verse"}])
    values.update(kw)
    return RawRhythm(**values)


def beat_this_raw(duration=12.0, **kw):
    beats, downbeats = grid(duration)
    values = dict(engine="beat_this@cpu", beats=beats, downbeats=downbeats)
    values.update(kw)
    return RawRhythm(**values)


@pytest.fixture
def engines(monkeypatch):
    """Stand-ins for both adapters; set .allin1 / .beat_this to a RawRhythm or an exception."""
    class State:
        allin1 = allin1_raw()
        beat_this = beat_this_raw()
        calls = []

    def fake(name):
        def analyze(stem, *args, heartbeat, **kwargs):
            State.calls.append(name)
            heartbeat(50)
            outcome = getattr(State, name)
            if callable(outcome) and not isinstance(outcome, RawRhythm):
                outcome = outcome(heartbeat)
            if isinstance(outcome, BaseException):
                raise outcome
            return RawRhythm(**vars(outcome))  # a fresh copy per call
        return analyze

    monkeypatch.setattr(allin1_adapter, "analyze", fake("allin1"))
    monkeypatch.setattr(beat_this_adapter, "analyze", fake("beat_this"))
    return State


@pytest.fixture
def stem(tmp_path):
    path = tmp_path / "no_vocals.wav"
    path.write_bytes(wav_bytes(12.0))
    return str(path)


def run(stem_path, tmp_path, progress=lambda _p: None, **config):
    return analyze_rhythm(stem_path, str(tmp_path / "rhythm"), duration=12.0, config=make_config(tmp_path, **config),
                          remaining=lambda: 600.0, progress=progress)


# ── engine choice and fallback ─────────────────────────────────────────

def test_allin1_success_gives_sections_and_no_warnings(stem, tmp_path, engines):
    r = run(stem, tmp_path)
    assert engines.calls == ["allin1"]
    assert r.engine == "allin1@wsl2" and r.bpm == 120.0 and r.time_signature == "4/4"
    assert r.beats[:3] == [0.5, 1.0, 1.5] and r.downbeats[:2] == [0.5, 2.5]
    assert r.sections == [{"start": 0.0, "end": 4.5, "label": "intro"}, {"start": 4.5, "end": 99.0, "label": "verse"}]
    assert r.warnings == []


def test_beat_this_engine_has_no_sections_and_derives_bpm(stem, tmp_path, engines):
    r = run(stem, tmp_path, rhythm_engine="beat_this")
    assert engines.calls == ["beat_this"]
    assert r.engine == "beat_this@cpu" and r.bpm == 120.0 and r.time_signature == "4/4"
    assert r.sections == [] and r.warnings == [SECTIONS_UNAVAILABLE]


def test_wsl_disabled_goes_straight_to_beat_this(stem, tmp_path, engines):
    r = run(stem, tmp_path, wsl_enabled=False)
    assert engines.calls == ["beat_this"]
    assert r.engine == "beat_this@cpu" and r.sections == []
    assert r.warnings[0] == SECTIONS_UNAVAILABLE
    assert "PIPELINE_WSL_ENABLED=0" in r.warnings[1]


@pytest.mark.parametrize("code", [errors.WSL_UNAVAILABLE, errors.RHYTHM_ENGINE_MISSING, errors.ALLIN1_FAILED,
                                  errors.RHYTHM_TIMEOUT, errors.INVALID_RHYTHM_RESULT])
def test_any_allin1_failure_falls_back_to_beat_this(stem, tmp_path, engines, code):
    engines.allin1 = PipelineError(code, "nope")
    r = run(stem, tmp_path)
    assert engines.calls == ["allin1", "beat_this"]
    assert r.engine == "beat_this@cpu" and r.sections == []
    assert r.warnings[0] == SECTIONS_UNAVAILABLE and code in r.warnings[1] and "beat_this was used" in r.warnings[1]


def test_invalid_allin1_output_falls_back(stem, tmp_path, engines):
    engines.allin1 = allin1_raw(beats=[0.5, float("nan"), 1.5])
    assert run(stem, tmp_path).engine == "beat_this@cpu"


def test_beatless_allin1_result_is_kept_without_fallback(stem, tmp_path, engines):
    engines.allin1 = allin1_raw(bpm=None, beats=[], downbeats=[])
    r = run(stem, tmp_path)
    assert engines.calls == ["allin1"] and r.engine == "allin1@wsl2"
    assert (r.bpm, r.time_signature, r.beats, r.downbeats, r.sections) == (None, None, [], [], [])
    assert r.warnings == [NO_PULSE]


def test_beatless_beat_this_result_keeps_its_other_warnings(stem, tmp_path, engines):
    engines.beat_this = beat_this_raw(beats=[], downbeats=[])
    r = run(stem, tmp_path, wsl_enabled=False)
    assert r.bpm is None and r.beats == [] and r.sections == []
    assert r.warnings[0] == SECTIONS_UNAVAILABLE and r.warnings[-1] == NO_PULSE


def test_both_engines_failing_is_a_clear_error(stem, tmp_path, engines):
    engines.allin1 = PipelineError(errors.WSL_UNAVAILABLE, "WSL2 could not be started.")
    engines.beat_this = PipelineError(errors.BEAT_THIS_FAILED, "beat_this could not analyse this audio.")
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path)
    assert e.value.code == errors.BEAT_THIS_FAILED
    assert "allin1" in e.value.message and "beat_this" in e.value.message


def test_forced_allin1_does_not_fall_back(stem, tmp_path, engines):
    engines.allin1 = PipelineError(errors.ALLIN1_FAILED, "allin1 could not analyse this audio.")
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path, rhythm_engine="allin1")
    assert e.value.code == errors.ALLIN1_FAILED and engines.calls == ["allin1"]


def test_forced_allin1_with_wsl_disabled(stem, tmp_path, engines):
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path, rhythm_engine="allin1", wsl_enabled=False)
    assert e.value.code == errors.WSL_UNAVAILABLE and engines.calls == []


def test_job_timeout_is_never_turned_into_a_fallback(stem, tmp_path, engines):
    def deadline(pct):
        raise PipelineError(errors.JOB_TIMEOUT, "too slow")
    with pytest.raises(PipelineError) as e:
        run(stem, tmp_path, progress=deadline)
    assert e.value.code == errors.JOB_TIMEOUT and engines.calls == ["allin1"]


def test_missing_no_vocals_stem(tmp_path, engines):
    with pytest.raises(PipelineError) as e:
        run(str(tmp_path / "missing.wav"), tmp_path)
    assert e.value.code == errors.STEM_MISSING and engines.calls == []


def test_progress_is_forwarded(stem, tmp_path, engines):
    seen = []
    run(stem, tmp_path, rhythm_engine="beat_this", progress=seen.append)
    assert seen == [50]


# ── validation ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("beats", [[], [1.0], [-3.0, -1.0]])  # the last two clamp to one beat at 0.0
def test_no_clear_pulse_is_a_warning_not_an_error(beats):
    r = validate(beat_this_raw(beats=beats, downbeats=beats), 12.0)
    assert (r.bpm, r.time_signature, r.beats, r.downbeats, r.sections) == (None, None, [], [], [])
    assert r.warnings == [NO_PULSE]


@pytest.mark.parametrize("raw", [
    beat_this_raw(beats=[0.5, float("nan"), 1.5]),
    beat_this_raw(beats=["a", "b"]),
    beat_this_raw(beats=None),
    beat_this_raw(beats=[0.0, 0.05, 0.1, 0.15]),  # 1200 BPM
    allin1_raw(sections=[{"start": 0.0}]),
])
def test_invalid_engine_output_is_rejected(raw):
    with pytest.raises(PipelineError) as e:
        validate(raw, 12.0)
    assert e.value.code == errors.INVALID_RHYTHM_RESULT


def test_timestamps_are_clamped_sorted_and_deduplicated():
    raw = beat_this_raw(beats=[-1.0, 0.5, 0.5, 1.0, 13.0, 0.0], downbeats=[20.0, -2.0])
    r = validate(raw, 12.0)
    assert r.beats == [0.0, 0.5, 1.0, 12.0]
    assert r.downbeats == [0.0, 12.0]


def test_engine_bpm_is_kept_and_bad_engine_bpm_is_rederived():
    assert validate(allin1_raw(bpm=96.25), 12.0).bpm == 96.25
    assert validate(allin1_raw(bpm=float("nan")), 12.0).bpm == 120.0
    assert validate(allin1_raw(bpm="fast"), 12.0).bpm == 120.0


# ── time signature ─────────────────────────────────────────────────────

@pytest.mark.parametrize("per_bar,expected", [(4, "4/4"), (3, "3/4"), (6, "6/8"), (5, "5/4")])
def test_meter_from_beats_per_bar(per_bar, expected):
    beats, downbeats = grid(30.0, per_bar=per_bar)
    assert estimate_meter(beats, downbeats)[0] == expected


def test_two_beats_per_bar_is_ambiguous_and_warned():
    beats, downbeats = grid(30.0, per_bar=2)
    r = validate(beat_this_raw(beats=beats, downbeats=downbeats), 30.0)
    assert r.time_signature is None
    assert any("ambiguous" in w for w in r.warnings)


def test_irregular_bars_give_no_meter():
    beats, _ = grid(30.0)
    downbeats = [beats[i] for i in (0, 3, 7, 10, 15, 18, 22, 27)]  # 3,4,3,5,3,4,5 beats per bar
    r = validate(beat_this_raw(beats=beats, downbeats=downbeats), 30.0)
    assert r.time_signature is None
    assert any("same number of beats" in w for w in r.warnings)


def test_too_few_bars_or_no_downbeats_give_no_meter():
    beats, downbeats = grid(5.0)
    assert validate(beat_this_raw(beats=beats, downbeats=downbeats), 5.0).time_signature is None
    r = validate(beat_this_raw(beats=beats, downbeats=[]), 5.0)
    assert r.time_signature is None and any("no downbeats" in w for w in r.warnings)


def test_meter_tolerates_one_odd_bar():
    beats, downbeats = grid(30.0)
    downbeats = downbeats[:3] + [downbeats[3] + 0.5] + downbeats[4:]  # one 5-beat bar, one 3-beat bar
    assert estimate_meter(beats, downbeats)[0] == "4/4"


# ── allin1 adapter, through the real runner subprocess ─────────────────

FAKE_ALLIN1 = '''
import os, time

class Segment:
    def __init__(self, start, end, label):
        self.start, self.end, self.label = start, end, label

class Result:
    bpm = 100
    beats = [0.6, 1.2, 1.8, 2.4]
    downbeats = [0.6, 3.0]
    beat_positions = [1, 2, 3, 4]
    segments = [Segment(0.0, 0.6, "start"), Segment(0.6, 2.4, "chorus")]

def analyze(path, demix_dir=None, spec_dir=None, keep_byproducts=False):
    assert os.path.isfile(path), path
    assert demix_dir and spec_dir
    mode = os.environ.get("FAKE_ALLIN1_MODE", "ok")
    if mode == "raise":
        raise RuntimeError("natten kernel failed")
    if mode == "sleep":
        time.sleep(60)
    if mode == "crash":
        os._exit(9)
    return [Result()]
'''


@pytest.fixture
def fake_allin1(tmp_path, monkeypatch):
    site = tmp_path / "fake_site"
    site.mkdir()
    (site / "allin1.py").write_text(FAKE_ALLIN1)
    monkeypatch.setenv("PYTHONPATH", str(site))
    return site


def run_allin1(stem_path, tmp_path, command=f'"{PYTHON}"', timeout=60, heartbeat=lambda _p: None):
    return allin1_adapter.analyze(stem_path, str(tmp_path / "work"), command=command,
                                  timeout_seconds=timeout, heartbeat=heartbeat)


def test_allin1_runner_returns_result(stem, tmp_path, fake_allin1):
    raw = run_allin1(stem, tmp_path)
    assert raw.engine == "allin1@native"  # not started through wsl.exe
    assert raw.bpm == 100 and raw.beats == [0.6, 1.2, 1.8, 2.4] and raw.downbeats == [0.6, 3.0]
    assert raw.sections == [{"start": 0.0, "end": 0.6, "label": "start"}, {"start": 0.6, "end": 2.4, "label": "chorus"}]


def test_allin1_not_installed(stem, tmp_path, fake_allin1):
    (fake_allin1 / "allin1.py").write_text("raise ImportError('No module named natten')\n")
    with pytest.raises(PipelineError) as e:
        run_allin1(stem, tmp_path)
    assert e.value.code == errors.RHYTHM_ENGINE_MISSING


@pytest.mark.parametrize("mode", ["raise", "crash"])
def test_allin1_failure(stem, tmp_path, fake_allin1, monkeypatch, mode):
    monkeypatch.setenv("FAKE_ALLIN1_MODE", mode)
    with pytest.raises(PipelineError) as e:
        run_allin1(stem, tmp_path)
    assert e.value.code == errors.ALLIN1_FAILED
    assert "natten" not in e.value.message  # details stay in the log


def test_allin1_timeout_kills_the_process(stem, tmp_path, fake_allin1, monkeypatch):
    monkeypatch.setenv("FAKE_ALLIN1_MODE", "sleep")
    started = time.monotonic()
    with pytest.raises(PipelineError) as e:
        run_allin1(stem, tmp_path, timeout=1)
    assert e.value.code == errors.RHYTHM_TIMEOUT
    assert time.monotonic() - started < 15


def test_job_deadline_during_allin1_kills_the_process(stem, tmp_path, fake_allin1, monkeypatch):
    monkeypatch.setenv("FAKE_ALLIN1_MODE", "sleep")

    def deadline(pct):
        raise PipelineError(errors.JOB_TIMEOUT, "too slow")
    started = time.monotonic()
    with pytest.raises(PipelineError) as e:
        run_allin1(stem, tmp_path, heartbeat=deadline)
    assert e.value.code == errors.JOB_TIMEOUT and time.monotonic() - started < 15


def test_missing_wsl_command(stem, tmp_path):
    with pytest.raises(PipelineError) as e:
        run_allin1(stem, tmp_path, command="no-such-wsl-binary.exe -d Ubuntu -- python3")
    assert e.value.code == errors.WSL_UNAVAILABLE


def test_wsl_python_that_never_starts_the_runner(stem, tmp_path):
    with pytest.raises(PipelineError) as e:
        run_allin1(stem, tmp_path, command=f'"{PYTHON}" -c "import sys; sys.exit(1)"')
    assert e.value.code == errors.WSL_UNAVAILABLE


def test_wsl_paths_and_labels():
    assert allin1_adapter.to_wsl_path(r"C:\Users\me\job\no_vocals.wav") == "/mnt/c/Users/me/job/no_vocals.wav"
    argv = allin1_adapter.parse_command("wsl.exe -d Ubuntu -- /home/me/env/bin/python")
    assert argv == ["wsl.exe", "-d", "Ubuntu", "--", "/home/me/env/bin/python"]
    assert allin1_adapter.is_wsl(argv) and allin1_adapter.engine_label(argv) == "allin1@wsl2"
    assert not allin1_adapter.is_wsl(["python3"])


@pytest.mark.skipif(os.name != "nt", reason="drive-letter paths are Windows-only")
def test_unc_paths_cannot_be_passed_to_wsl():
    with pytest.raises(PipelineError) as e:
        allin1_adapter.to_wsl_path(r"\\server\share\a.wav")
    assert e.value.code == errors.WSL_UNAVAILABLE


# ── beat_this adapter, with the model replaced ─────────────────────────

@pytest.fixture
def tracker(monkeypatch):
    class State:
        load_error = None
        delay = 0.0
        error = None
        seen = []

    def call(signal, sr):
        State.seen.append((signal.shape, sr))
        time.sleep(State.delay)
        if State.error:
            raise State.error
        return np.array([0.5, 1.0, 1.5, 2.0]), np.array([0.5, 2.0])

    def load(device):
        if State.load_error:
            raise State.load_error
        return call

    monkeypatch.setattr(beat_this_adapter, "_load_tracker", load)
    return State


def run_beat_this(stem_path, timeout=60, heartbeat=lambda _p: None):
    return beat_this_adapter.analyze(stem_path, device="cpu", timeout_seconds=timeout, heartbeat=heartbeat)


def test_beat_this_reads_the_stem_and_returns_seconds(stem, tracker):
    raw = run_beat_this(stem)
    assert raw.engine == "beat_this@cpu" and raw.bpm is None and raw.sections == []
    assert raw.beats == [0.5, 1.0, 1.5, 2.0] and raw.downbeats == [0.5, 2.0]
    assert all(isinstance(t, float) for t in raw.beats)
    (shape, sr), = tracker.seen
    assert sr == 22050 and shape[0] == sf.info(stem).frames  # full stem, file's own rate


def test_beat_this_not_installed(stem, tracker):
    tracker.load_error = ImportError("No module named 'beat_this'")
    with pytest.raises(PipelineError) as e:
        run_beat_this(stem)
    assert e.value.code == errors.RHYTHM_ENGINE_MISSING and "pip install beat-this" in e.value.message


def test_beat_this_checkpoint_download_failure(stem, tracker):
    tracker.load_error = OSError("connection reset")
    with pytest.raises(PipelineError) as e:
        run_beat_this(stem)
    assert e.value.code == errors.BEAT_THIS_FAILED and "downloaded" in e.value.message


def test_beat_this_inference_failure(stem, tracker):
    tracker.error = RuntimeError("CUDA out of memory")
    with pytest.raises(PipelineError) as e:
        run_beat_this(stem)
    assert e.value.code == errors.BEAT_THIS_FAILED and "memory" in e.value.message


def test_beat_this_timeout_and_heartbeat(stem, tracker):
    tracker.delay = 2.0
    beats = []
    with pytest.raises(PipelineError) as e:
        run_beat_this(stem, timeout=0.6, heartbeat=beats.append)
    assert e.value.code == errors.RHYTHM_TIMEOUT
    assert beats and all(0 < p < 100 for p in beats)


# ── through the job API ────────────────────────────────────────────────

@needs_ffmpeg
def test_allin1_result_reaches_the_api_merged_and_clamped(client, install_manager, engines):
    install_manager()
    done = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])
    assert done["status"] == "completed", done
    result = done["result"]
    assert result["pipeline_version"] == PIPELINE_VERSION
    assert result["engines"] == {"extract": "ffmpeg", "separation": "demucs:htdemucs@cpu", "rhythm": "allin1@wsl2",
                                 "chords": "btc@cpu", "events": "heuristic"}
    assert result["bpm"] == 120.0 and result["time_signature"] == "4/4"
    assert result["beats"][:3] == [0.5, 1.0, 1.5] and result["downbeats"][:2] == [0.5, 2.5]
    assert result["sections"] == [{"start": 0.0, "end": 4.5, "label": "intro"},
                                  {"start": 4.5, "end": 12.0, "label": "verse"}]  # clamped to the audio
    assert max(result["beats"]) <= result["audio_duration"]
    assert result["events"] == [] and result["warnings"] == []


@needs_ffmpeg
def test_beat_this_fallback_reaches_the_api(client, install_manager, engines):
    install_manager()
    engines.allin1 = PipelineError(errors.WSL_UNAVAILABLE, "WSL2 could not be started.")
    result = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])["result"]
    assert result["engines"]["rhythm"] == "beat_this@cpu"
    assert result["sections"] == []
    assert result["warnings"][0] == SECTIONS_UNAVAILABLE


@needs_ffmpeg
def test_rhythm_progress_fills_its_slice_of_the_bar(client, install_manager, engines):
    manager = install_manager(rhythm_engine="beat_this")
    updates = []
    original = manager.store.update_job
    manager.store.update_job = lambda job_id, **f: (updates.append(f), original(job_id, **f))[1]
    assert wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])["status"] == "completed"
    assert [u["progress"] for u in updates if u.get("stage") == "rhythm"] == [45, 55.0]


@needs_ffmpeg
def test_failed_rhythm_is_not_cached_and_can_be_retried(client, install_manager, engines):
    install_manager()
    data = wav_bytes(12.0)
    engines.allin1 = PipelineError(errors.WSL_UNAVAILABLE, "WSL2 could not be started.")
    engines.beat_this = PipelineError(errors.BEAT_THIS_FAILED, "beat_this could not analyse this audio.")
    failed = wait_done(client, post_file(client, data).json()["job_id"])
    assert failed["status"] == "failed" and failed["error"]["code"] == errors.BEAT_THIS_FAILED

    engines.beat_this = beat_this_raw()
    retry = post_file(client, data).json()
    assert retry["cached"] is False
    assert wait_done(client, retry["job_id"])["status"] == "completed"
    assert post_file(client, data).json()["cached"] is True


@needs_ffmpeg
def test_job_timeout_during_rhythm(client, install_manager, engines):
    install_manager(job_timeout_seconds=2)

    def slow(heartbeat):
        while True:
            time.sleep(0.2)
            heartbeat(10)
    engines.allin1 = slow
    done = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])
    assert done["status"] == "failed" and done["error"]["code"] == errors.JOB_TIMEOUT
    assert engines.calls == ["allin1"]  # the deadline is not a reason to try beat_this


@needs_ffmpeg
def test_rhythm_timeout_in_the_job(client, install_manager, engines):
    install_manager(rhythm_engine="allin1")
    engines.allin1 = PipelineError(errors.RHYTHM_TIMEOUT, "allin1 took longer than 900 seconds and was stopped.")
    done = wait_done(client, post_file(client, wav_bytes(12.0)).json()["job_id"])
    assert done["status"] == "failed" and done["error"]["code"] == errors.RHYTHM_TIMEOUT

