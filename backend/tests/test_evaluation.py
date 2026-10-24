"""
Evaluation harness (backend/evaluation): metric maths, report generation,
regression detection and missing-ground-truth handling. Offline: no audio
engine runs; engines are replaced by fakes.
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evaluation import metrics as m  # noqa: E402
from evaluation import report as rep  # noqa: E402
from evaluation import run_evaluation as ev  # noqa: E402


# ── metric calculations ────────────────────────────────────────────────────


def test_bpm_scores_absolute_percent_and_within_one():
    s = m.bpm_scores(121.0, 120.0)
    assert s["bpm_abs_error"] == pytest.approx(1.0)
    assert s["bpm_pct_error"] == pytest.approx(100 / 120)
    assert s["bpm_within_1"] == 1.0
    assert m.bpm_scores(121.5, 120.0)["bpm_within_1"] == 0.0


def test_bpm_octave_error_is_flagged_only_when_wrong():
    assert m.bpm_scores(240.0, 120.0)["bpm_octave_error"] == 1.0
    assert m.bpm_scores(60.0, 120.0)["bpm_octave_error"] == 1.0
    assert m.bpm_scores(120.5, 120.0)["bpm_octave_error"] == 0.0
    assert m.bpm_scores(131.0, 120.0)["bpm_octave_error"] == 0.0


def test_point_scores_match_one_to_one_within_tolerance():
    ref = [1.0, 2.0, 3.0, 4.0]
    est = [1.05, 2.0, 2.04, 4.5]  # 2.04 cannot claim a second hit on ref 2.0; 4.5 is out of range
    s = m.point_scores(est, ref, 0.07)
    assert s["precision"] == pytest.approx(2 / 4)
    assert s["recall"] == pytest.approx(2 / 4)
    assert s["f"] == pytest.approx(0.5)


def test_point_scores_edges():
    assert m.point_scores([1.0], [1.0], 0.07)["f"] == 1.0
    assert m.point_scores([], [1.0], 0.07)["f"] == 0.0
    assert m.point_scores([], [], 0.07)["f"] == 1.0  # nothing to find, nothing claimed
    assert m.point_scores(None, [1.0], 0.07) is None
    assert m.point_scores([1.0], None, 0.07) is None


def test_time_signature_correct_ignores_spacing_and_missing():
    assert m.time_signature_correct("3/4", "3 / 4") == 1.0
    assert m.time_signature_correct("4/4", "3/4") == 0.0
    assert m.time_signature_correct(None, "4/4") is None
    assert m.time_signature_correct("4/4", None) is None


@pytest.mark.parametrize("text,expected", [
    ("A Minor", (9, "minor")), ("Am", (9, "minor")), ("F#m", (6, "minor")), ("Bb", (10, "major")),
    ("C major", (0, "major")), ("G# Minor", (8, "minor")), ("H major", None), ("nonsense", None),
])
def test_parse_key(text, expected):
    assert m.parse_key(text) == expected


def test_key_scores_exact_related_and_alternatives():
    assert m.key_scores("A Minor", "A minor") == {"key_correct": 1.0, "key_related": 1.0}
    # relative major: wrong for key_correct, accepted by key_related
    assert m.key_scores("C Major", "A minor") == {"key_correct": 0.0, "key_related": 1.0}
    assert m.key_scores("D Major", "A minor") == {"key_correct": 0.0, "key_related": 0.0}
    # enharmonic spelling is the same key; a list of acceptable keys matches any
    assert m.key_scores("A# Major", "Bb major")["key_correct"] == 1.0
    assert m.key_scores("E Major", ["G major", "E major"])["key_correct"] == 1.0
    assert m.key_scores(None, "A minor") is None
    assert m.key_scores("A Minor", None) is None


def test_parse_chord_handles_slash_and_no_chord():
    assert m.parse_chord("Am7/G") == (9, "m7", 7)
    assert m.parse_chord("C/C") == (0, "", None)  # bass == root is a plain chord
    assert m.parse_chord("N") == (None, "N", None)
    assert m.parse_chord("Bb") == (10, "", None)


def test_chord_scores_time_weighted_root_and_symbol():
    ref = [{"start": 0, "end": 4, "chord": "C"}, {"start": 4, "end": 8, "chord": "Am7"}]
    est = [{"start": 0, "end": 4, "chord": "C"}, {"start": 4, "end": 6, "chord": "Am"},
           {"start": 6, "end": 8, "chord": "F"}]
    s = m.chord_scores(est, ref)
    assert s["chord_root_acc"] == pytest.approx((4 + 2) / 8)   # C ok, Am root ok, F wrong
    assert s["chord_symbol_acc"] == pytest.approx(4 / 8)       # only C is the exact symbol


def test_chord_scores_gaps_and_overrun():
    ref = [{"start": 0, "end": 4, "chord": "C"}]
    # estimate covers only half of the reference and runs past it: the overrun is ignored, the gap is wrong
    est = [{"start": 2, "end": 10, "chord": "C"}]
    assert m.chord_scores(est, ref)["chord_symbol_acc"] == pytest.approx(0.5)
    assert m.chord_scores(est, None) is None
    assert m.chord_scores(None, ref) is None


def test_chord_scores_no_chord_and_enharmonics():
    ref = [{"start": 0, "end": 2, "chord": "N"}, {"start": 2, "end": 4, "chord": "A#"}]
    est = [{"start": 0, "end": 2, "chord": "N"}, {"start": 2, "end": 4, "chord": "Bb"}]
    assert m.chord_scores(est, ref)["chord_symbol_acc"] == 1.0


def test_section_scores_boundaries_and_labels():
    ref = [{"start": 0, "end": 10, "label": "intro"}, {"start": 10, "end": 30, "label": "verse"},
           {"start": 30, "end": 50, "label": "chorus"}]
    est = [{"start": 0, "end": 11, "label": "Intro"}, {"start": 11, "end": 30, "label": "Verse 1"},
           {"start": 30, "end": 50, "label": "bridge"}]
    s = m.section_scores(est, ref)
    # boundaries 10 / 30 vs 11 / 30: both within 3 s, only 30 within 0.5 s
    assert s["section_f_3s"] == 1.0
    assert s["section_f_0.5s"] == pytest.approx(0.5)
    # labels: intro 10 s, verse 19 s (11..30), chorus 0 -> 29 of 50 reference seconds
    assert s["section_label_acc"] == pytest.approx((10 + 19) / 50)
    assert m.section_scores(None, ref) is None
    assert m.section_scores(est, []) is None


def test_passing_scores_precision_recall():
    s = m.passing_scores([1.0, 5.0, 9.0], [1.1, 5.2, 20.0, 30.0])
    assert s["passing_precision"] == pytest.approx(2 / 3)
    assert s["passing_recall"] == pytest.approx(2 / 4)
    assert m.passing_scores([], []) ["passing_precision"] == 1.0
    assert m.passing_scores([1.0], None) is None


def test_fill_scores_accept_times_and_intervals():
    ref = [{"start": 10.0, "end": 11.0}, 30.0, 50.0]
    s = m.fill_scores([10.4, 30.2, 70.0], ref)
    assert s["fill_precision"] == pytest.approx(2 / 3)
    assert s["fill_recall"] == pytest.approx(2 / 3)
    assert m.fill_scores([], [])["fill_f"] == 1.0
    assert m.fill_scores([1.0], None) is None


def test_warning_categories_and_scores():
    texts = ["Some clipping was found in the audio (0.20% of samples).",
             "The recording is very quiet (-40 LUFS); it was raised by 12.0 dB for analysis.",
             "Decoded audio is 3.00 s but the file reports 3.50 s; timestamps follow the decoded audio."]
    assert m.warning_categories(texts) == {"clipping", "low_volume"}  # unrelated text is ignored
    assert m.warning_scores(texts, ["clipping", "low_volume"])["warnings_exact"] == 1.0
    s = m.warning_scores(texts, ["clipping", "noise"])
    assert s["warnings_exact"] == 0.0
    assert s["warnings_missed"] == ["noise"] and s["warnings_spurious"] == ["low_volume"]
    assert m.warning_scores([], [])["warnings_exact"] == 1.0  # clean clip, nothing expected
    assert m.warning_scores(texts, None) is None


def test_real_preprocess_warning_texts_are_categorised():
    """The category patterns must keep matching the messages the pipeline really emits."""
    from services.pipeline import preprocess as p
    assert m.warning_categories([p.NOT_MUSICAL]) == {"not_musical"}
    assert m.warning_categories(["The audio is heavily clipped (4.0% of samples); chords and beats may be less reliable."]) == {"clipping"}
    assert m.warning_categories(["The recording has a lot of background noise; results may be less reliable."]) == {"noise"}
    assert m.warning_categories(["About 60% of the audio sounds like speech."]) == {"speech"}
    assert m.warning_categories(["No instruments were found (voice only); chords may be missing."]) == {"no_instruments"}
    assert m.warning_categories(["The instruments are very quiet next to the vocals; chords may be less reliable."]) == {"quiet_instruments"}
    assert m.warning_categories(["Some separated stems exceed full scale; the source is probably clipped."]) == {"stem_clipping"}


def test_cache_scores_requires_all_five_checks():
    ok = {"first_cached": False, "second_cached": True, "second_identical": True,
          "reload_cached": True, "reload_identical": True}
    assert m.cache_scores(ok) == {"cache_correct": 1.0}
    assert m.cache_scores({**ok, "reload_identical": False}) == {"cache_correct": 0.0}
    assert m.cache_scores({**ok, "first_cached": True}) == {"cache_correct": 0.0}
    assert m.cache_scores(None) is None


# ── missing ground truth ───────────────────────────────────────────────────


def test_score_clip_with_no_truth_scores_nothing():
    pred = {"supports": SUPPORTS_ALL, "bpm": 120.0, "key": "A Minor", "time_signature": "4/4",
            "chords": [{"start": 0, "end": 1, "chord": "C"}], "beats": [0.5], "warnings": []}
    truth = {f: None for f in ev.TRUTH_FIELDS}
    scores = m.score_clip(pred, truth)
    assert all(scores[name] is None for name in m.METRIC_NAMES if name in scores)
    agg = m.aggregate([scores])
    assert all(v == {"mean": None, "n": 0} for v in agg.values())


def test_score_clip_scores_only_the_truth_that_exists():
    pred = {"supports": SUPPORTS_ALL, "bpm": 120.0, "key": "A Minor", "time_signature": "4/4", "beats": [], "chords": []}
    truth = {**{f: None for f in ev.TRUTH_FIELDS}, "key": "A minor"}
    scores = m.score_clip(pred, truth)
    assert scores["key_correct"] == 1.0
    assert scores["bpm_within_1"] is None and scores["chord_root_acc"] is None


def test_engine_that_does_not_support_a_metric_is_not_scored_on_it():
    pred = {"supports": {"bpm"}, "bpm": 120.0, "sections": [{"start": 10, "end": 20, "label": "verse"}]}
    truth = {**{f: None for f in ev.TRUTH_FIELDS}, "bpm": 120.0,
             "sections": [{"start": 0, "end": 20, "label": "verse"}]}
    scores = m.score_clip(pred, truth)
    assert scores["bpm_within_1"] == 1.0
    assert scores["section_label_acc"] is None  # not "0.0": v2-style engines have no sections


SUPPORTS_ALL = set(ev.SUPPORTS["pipeline"])


def test_manifest_has_reference_clips_and_null_means_missing():
    clips = ev.load_manifest(ev.DEFAULT_MANIFEST)
    assert len(clips) >= 14
    assert len({c["id"] for c in clips}) == len(clips)
    assert all(set(c["truth"]) == set(ev.TRUTH_FIELDS) for c in clips)
    first = clips[0]
    assert first["truth"]["key"] is not None and "key" not in ev.missing_truth(first)
    assert "bpm" in ev.missing_truth(first)  # no BPM ground truth exists yet


def test_load_manifest_rejects_bad_files(tmp_path):
    path = tmp_path / "m.json"
    path.write_text(json.dumps({"clips": []}))
    with pytest.raises(ValueError):
        ev.load_manifest(str(path))
    path.write_text(json.dumps({"clips": [{"id": "A", "audio": "a.wav"}, {"id": "A", "audio": "b.wav"}]}))
    with pytest.raises(ValueError, match="duplicate"):
        ev.load_manifest(str(path))


# ── harness end to end with fake engines ───────────────────────────────────


def _clips():
    base = {f: None for f in ev.TRUTH_FIELDS}
    return [
        {"id": "T1", "audio": "t1.wav", "description": "first",
         "truth": {**base, "bpm": 100.0, "key": "A minor", "time_signature": "4/4",
                   "chords": [{"start": 0, "end": 4, "chord": "Am"}]}},
        {"id": "T2", "audio": "t2.wav", "truth": dict(base)},  # no ground truth at all
        {"id": "T3", "audio": "missing.wav", "truth": {**base, "bpm": 90.0}},  # audio not on disk
    ]


def _fake_runner(bpm, key, chord, *, fail_on=()):
    def run(audio_path, scratch):
        if os.path.basename(audio_path) in fail_on:
            raise RuntimeError("boom")
        assert os.path.isdir(scratch)
        return {"supports": sorted(SUPPORTS_ALL), "bpm": bpm, "time_signature": "4/4", "key": key,
                "beats": [], "downbeats": [], "chords": [{"start": 0, "end": 4, "chord": chord}],
                "sections": [], "passing": [], "fills": [], "warnings": [], "cache": None}
    return run


@pytest.fixture()
def clips_dir(tmp_path):
    d = tmp_path / "clips"
    d.mkdir()
    (d / "t1.wav").write_bytes(b"not really audio")
    (d / "t2.wav").write_bytes(b"not really audio")
    return str(d)


def _run(clips_dir, tmp_path, **kw):
    runners = kw.pop("runners", None) or {"v2": _fake_runner(101.0, "A Minor", "Am"),
                                          "pipeline": _fake_runner(110.0, "C Major", "C")}
    return ev.run_evaluation(_clips(), clips_dir=clips_dir, runners=runners, out_dir=str(tmp_path / "out"), **kw)


def test_run_scores_both_engines_and_skips_missing_audio(clips_dir, tmp_path):
    result = _run(clips_dir, tmp_path)
    assert result["summary"] == {"clips_total": 3, "clips_run": 2, "clips_skipped": 1}
    t3 = next(c for c in result["clips"] if c["id"] == "T3")
    assert t3["status"] == "skipped" and "missing.wav" in t3["reason"]
    t1 = next(c for c in result["clips"] if c["id"] == "T1")
    assert t1["engines"]["v2"]["metrics"]["bpm_within_1"] == 1.0
    assert t1["engines"]["pipeline"]["metrics"]["bpm_within_1"] == 0.0
    assert t1["engines"]["pipeline"]["metrics"]["key_correct"] == 0.0
    # only T1 has truth: T2 contributes nothing, so n == 1
    assert result["overall"]["v2"]["key_correct"] == {"mean": 1.0, "n": 1}
    cmp = result["comparison"]["metrics"]["chord_symbol_acc"]
    assert cmp["v2"] == 1.0 and cmp["pipeline"] == 0.0 and cmp["better"] == "v2"
    assert result["comparison"]["metrics"]["bpm_abs_error"]["better"] == "v2"  # lower error wins
    assert "bpm" in result["missing_ground_truth"] and result["missing_ground_truth"]["bpm"] == ["T2"]


def test_engine_failure_is_recorded_and_does_not_stop_the_run(clips_dir, tmp_path):
    runners = {"v2": _fake_runner(100.0, "A Minor", "Am", fail_on=("t1.wav",)),
               "pipeline": _fake_runner(100.0, "A Minor", "Am")}
    result = _run(clips_dir, tmp_path, runners=runners)
    t1 = next(c for c in result["clips"] if c["id"] == "T1")
    assert t1["engines"]["v2"]["status"] == "failed" and "boom" in t1["engines"]["v2"]["error"]
    assert t1["engines"]["pipeline"]["status"] == "ok"
    assert result["overall"]["v2"]["key_correct"]["n"] == 0


def test_all_truth_missing_report_still_generates(tmp_path, clips_dir):
    clips = [{"id": "T2", "audio": "t2.wav", "truth": {f: None for f in ev.TRUTH_FIELDS}}]
    result = ev.run_evaluation(clips, clips_dir=clips_dir, out_dir=str(tmp_path / "out"),
                               runners={"v2": _fake_runner(1, "A Minor", "Am"), "pipeline": _fake_runner(1, "A Minor", "Am")})
    text = open(result["files"]["latest.md"], encoding="utf-8").read()
    assert "No ground truth to score this clip yet." in text
    assert "No metric could be scored for both engines yet" in text
    assert all(len(ids) == 1 for ids in result["missing_ground_truth"].values())


def test_input_clips_are_never_modified(clips_dir, tmp_path):
    before = {f: open(os.path.join(clips_dir, f), "rb").read() for f in os.listdir(clips_dir)}
    _run(clips_dir, tmp_path)
    assert {f: open(os.path.join(clips_dir, f), "rb").read() for f in os.listdir(clips_dir)} == before
    assert sorted(os.listdir(clips_dir)) == ["t1.wav", "t2.wav"]


# ── report generation ──────────────────────────────────────────────────────


def test_reports_are_written_and_consistent(clips_dir, tmp_path):
    result = _run(clips_dir, tmp_path, run_id="run-a", pipeline_version=7)
    out = tmp_path / "out"
    for name in ("run-a.json", "run-a.md", "latest.json", "latest.md"):
        assert (out / name).is_file(), name
    saved = json.loads((out / "latest.json").read_text(encoding="utf-8"))
    assert saved["run_id"] == "run-a" and saved["meta"]["pipeline_version"] == 7
    assert saved["overall"] == json.loads(json.dumps(result["overall"]))
    # predictions are saved so a run can be re-scored without engines
    assert (out / "run-a_predictions" / "T1.v2.json").is_file()
    md = (out / "latest.md").read_text(encoding="utf-8")
    for heading in ("# Evaluation report run-a", "## Overall", "## pipeline vs v2", "## Per-song results",
                    "## Missing ground truth", "## Regression vs previous run", "## Skipped clips"):
        assert heading in md
    assert "### T1 – first" in md and "No previous run to compare against" in md
    assert "key_correct" in md and "100.0%" in md


def test_rescoring_saved_predictions_matches_the_original_run(clips_dir, tmp_path):
    first = _run(clips_dir, tmp_path, run_id="run-a")
    second = ev.run_evaluation(_clips(), clips_dir=None, runners={}, out_dir=str(tmp_path / "out2"), run_id="run-b",
                               from_predictions=str(tmp_path / "out" / "run-a_predictions"))
    assert second["overall"] == first["overall"]


# ── regression detection ───────────────────────────────────────────────────


def _report(metric_by_clip, engine="pipeline", status="ok", run_id="r"):
    clips = [{"id": cid, "status": "ok",
              "engines": {engine: {"status": status, "metrics": metrics}}} for cid, metrics in metric_by_clip.items()]
    return {"run_id": run_id, "created_at": "t", "engines": [engine], "clips": clips}


def test_no_previous_run_means_no_regression_section():
    assert rep.find_regressions(None, _report({"A": {"key_correct": 1.0}})) is None


def test_drop_in_accuracy_is_a_regression_per_clip_and_overall():
    prev = _report({"A": {"key_correct": 1.0, "chord_root_acc": 0.80}, "B": {"key_correct": 1.0, "chord_root_acc": 0.80}})
    cur = _report({"A": {"key_correct": 0.0, "chord_root_acc": 0.80}, "B": {"key_correct": 1.0, "chord_root_acc": 0.79}})
    reg = rep.find_regressions(prev, cur)
    assert reg["has_regression"]
    found = {(r["metric"], r["scope"]) for r in reg["regressions"]}
    assert ("key_correct", "A") in found and ("key_correct", "overall") in found
    assert ("chord_root_acc", "B") not in found  # a 1-point wobble is inside tolerance
    assert not reg["improvements"]


def test_lower_is_better_metrics_regress_when_they_rise():
    prev = _report({"A": {"bpm_abs_error": 0.5}})
    cur = _report({"A": {"bpm_abs_error": 4.0}})
    reg = rep.find_regressions(prev, cur)
    assert {(r["metric"], r["scope"]) for r in reg["regressions"]} == {("bpm_abs_error", "A"), ("bpm_abs_error", "overall")}
    better = rep.find_regressions(cur, prev)
    assert not better["regressions"] and len(better["improvements"]) == 2


def test_improvements_and_unchanged_are_not_regressions():
    prev = _report({"A": {"key_correct": 0.0}})
    cur = _report({"A": {"key_correct": 1.0}})
    reg = rep.find_regressions(prev, cur)
    assert not reg["has_regression"] and len(reg["improvements"]) == 2
    same = rep.find_regressions(cur, cur)
    assert not same["has_regression"] and not same["improvements"]


def test_engine_run_going_from_ok_to_failed_is_a_regression():
    prev = _report({"A": {"key_correct": 1.0}})
    cur = _report({"A": {}}, status="failed")
    reg = rep.find_regressions(prev, cur)
    assert reg["has_regression"]
    assert reg["status_changes"] == [{"engine": "pipeline", "clip": "A", "previous": "ok", "current": "failed"}]


def test_new_clips_and_newly_scored_metrics_are_not_regressions():
    prev = _report({"A": {"key_correct": 1.0}})
    cur = _report({"A": {"key_correct": 1.0, "chord_root_acc": 0.1}, "B": {"key_correct": 0.0}})
    reg = rep.find_regressions(prev, cur)
    assert not reg["has_regression"]  # B is new, chord_root_acc was unscored before


def test_custom_tolerance_is_respected():
    prev = _report({"A": {"chord_root_acc": 0.80}})
    cur = _report({"A": {"chord_root_acc": 0.70}})
    assert rep.find_regressions(prev, cur)["has_regression"]
    assert not rep.find_regressions(prev, cur, {"chord_root_acc": 0.2})["has_regression"]


def test_run_compares_against_previous_report_and_cli_flag_sets_exit_code(clips_dir, tmp_path, monkeypatch, capsys):
    good = {"v2": _fake_runner(100.0, "A Minor", "Am"), "pipeline": _fake_runner(100.0, "A Minor", "Am")}
    first = _run(clips_dir, tmp_path, runners=good, run_id="run-a")
    assert first["regression"] is None
    previous = rep.load_report(str(tmp_path / "out" / "latest.json"))
    bad = {"v2": _fake_runner(100.0, "A Minor", "Am"), "pipeline": _fake_runner(140.0, "D Major", "Dm")}
    second = _run(clips_dir, tmp_path, runners=bad, previous=previous, run_id="run-b")
    reg = second["regression"]
    assert reg["has_regression"] and reg["baseline_run_id"] == "run-a"
    assert {r["engine"] for r in reg["regressions"]} == {"pipeline"}
    assert "**Regressions**" in open(second["files"]["latest.md"], encoding="utf-8").read()

    # CLI: same previous report, engines faked, --fail-on-regression -> exit 1
    monkeypatch.setattr(ev, "run_v2", bad["v2"])
    monkeypatch.setattr(ev, "make_pipeline_runner", lambda: bad["pipeline"])
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"clips": _clips()[:1]}))
    args = ["--manifest", str(manifest), "--clips-dir", clips_dir, "--out-dir", str(tmp_path / "out"),
            "--baseline", str(tmp_path / "out" / "run-a.json")]
    assert ev.main(args) == 0
    assert ev.main(args + ["--fail-on-regression"]) == 1
    assert "REGRESSIONS" in capsys.readouterr().out


def test_cli_without_clips_dir_explains_itself(tmp_path, capsys):
    assert ev.main(["--clips-dir", str(tmp_path / "nope"), "--out-dir", str(tmp_path)]) == 2
    assert "Reference clips not found" in capsys.readouterr().err


# ── cache / reload correctness through the real JobManager ─────────────────


def test_pipeline_runner_checks_cache_and_reload(tmp_path):
    from services.pipeline.merge import build_result

    calls = []

    def fake_pipeline(ctx):
        calls.append(ctx.job_id)
        return build_result(audio_duration=4.0, sample_rate=44100, bpm=100.0, time_signature="4/4",
                            chords=[{"start": 0.0, "end": 4.0, "chord": "A:min", "simple": "Am", "type": "chord"}],
                            warnings=["Some clipping was found in the audio (0.20% of samples)."],
                            summary={"key": "A Minor"})

    clip = tmp_path / "clip.wav"
    clip.write_bytes(b"RIFFfake")
    work = tmp_path / "work"
    work.mkdir()
    pred = ev.make_pipeline_runner(pipeline=fake_pipeline, poll_seconds=0.01)(str(clip), str(work))
    assert len(calls) == 1  # the two cache checks did not re-run the pipeline
    assert pred["cache"] == {"first_cached": False, "second_cached": True, "second_identical": True,
                             "reload_cached": True, "reload_identical": True}
    assert pred["key"] == "A Minor" and pred["chords"] == [{"start": 0.0, "end": 4.0, "chord": "Am"}]
    assert m.cache_scores(pred["cache"]) == {"cache_correct": 1.0}
    assert clip.read_bytes() == b"RIFFfake"  # the original upload was copied, not consumed
    assert sorted(p.name for p in tmp_path.iterdir() if p.is_file()) == ["clip.wav"]


def test_pipeline_runner_reports_a_failed_job(tmp_path):
    from services.pipeline import errors
    from services.pipeline.errors import PipelineError

    def failing(ctx):
        raise PipelineError(errors.NO_MUSIC, "no music here")

    clip = tmp_path / "clip.wav"
    clip.write_bytes(b"x")
    work = tmp_path / "work"
    work.mkdir()
    with pytest.raises(RuntimeError, match="no music here"):
        ev.make_pipeline_runner(pipeline=failing, poll_seconds=0.01)(str(clip), str(work))


def test_normalize_pipeline_extracts_passing_fills_and_unrepresentable_chords():
    result = {"bpm": 90.0, "time_signature": "3/4", "key": "G Major",
              "chords": [{"start": 0, "end": 2, "chord": "G:maj", "simple": "G", "type": "chord"},
                         {"start": 2, "end": 3, "chord": "C:sus2/5", "simple": None, "type": "passing"},
                         {"start": 3, "end": 4, "chord": "N", "simple": "N", "type": "no_chord"}],
              "events": [{"time": 2.0, "type": "chord_change", "subtype": "passing", "value": "C"},
                         {"time": 2.5, "type": "chord_change", "subtype": None, "value": "G"},
                         {"time": 3.5, "type": "possible_fill"}],
              "warnings": ["w"], "beats": [0.0], "downbeats": [0.0], "sections": [{"start": 0, "end": 4, "label": "intro"}]}
    p = ev.normalize_pipeline(result)
    assert p["passing"] == [2.0] and p["fills"] == [3.5]
    assert [c["chord"] for c in p["chords"]] == ["G", "Csus2", "N"]


def test_normalize_v2_maps_the_existing_result_shape():
    p = ev.normalize_v2({"bpm": 100.0, "timeSignature": "3/4", "key": "E Minor", "beats": [0.5], "downbeats": [0.5],
                         "chordTimeline": [{"chord": "Em", "start": 0.0, "end": 2.0, "confidence": 0.9}]})
    assert p["time_signature"] == "3/4" and p["chords"] == [{"start": 0.0, "end": 2.0, "chord": "Em"}]
    assert "sections" not in p["supports"] and "bpm" in p["supports"]
