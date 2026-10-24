"""
Offline evaluation harness: runs the v2 engine and the pipeline engine on the
reference clips and scores both against ground truth.

    cd backend
    python -m evaluation.run_evaluation                      # clips in evaluation/clips
    python -m evaluation.run_evaluation --clips-dir <folder with TEST_001.mp4 ...>

Nothing leaves the machine and no input file is touched: clips are only read
(v2) or copied into a temporary work folder (pipeline); the engines are the
backend's own services. Model weights must already be cached - model downloads
are switched off unless --allow-model-downloads is given.
"""

import argparse
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from typing import Callable, Optional, Sequence

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:  # allows `python evaluation/run_evaluation.py` as well as `-m`
    sys.path.insert(0, BACKEND_DIR)

from evaluation import clip_manifest, metrics, report  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MANIFEST = os.path.join(HERE, "reference_clips.json")
DEFAULT_OUT_DIR = os.path.join(HERE, "reports")
DEFAULT_CLIPS_DIR = clip_manifest.DEFAULT_CLIPS_DIR
ENGINES = ("v2", "pipeline")
TRUTH_FIELDS = ("bpm", "time_signature", "key", "beats", "downbeats", "chords", "main_chord_progression",
                "sections", "passing_chords", "fills", "expected_warnings")
SCHEMA_VERSION = 1

# What each engine can produce. Anything else is "not scored", not "wrong".
SUPPORTS = {
    "v2": {"bpm", "beats", "downbeats", "time_signature", "key", "chords"},
    "pipeline": {"bpm", "beats", "downbeats", "time_signature", "key", "chords", "sections", "passing", "fills",
                 "warnings", "cache"},
}

Runner = Callable[[str, str], dict]  # (audio path, scratch dir) -> normalised prediction


# ── manifest ───────────────────────────────────────────────────────────────


def load_manifest(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    clips = data.get("clips")
    if not isinstance(clips, list) or not clips:
        raise ValueError(f"{path}: no clips listed")
    seen = set()
    for clip in clips:
        if not clip.get("id") or not clip.get("audio"):
            raise ValueError(f"{path}: every clip needs an id and an audio file name")
        if clip["id"] in seen:
            raise ValueError(f"{path}: duplicate clip id {clip['id']}")
        seen.add(clip["id"])
        clip["truth"] = {f: (clip.get("truth") or {}).get(f) for f in TRUTH_FIELDS}
    return clips


def missing_truth(clip: dict) -> list[str]:
    return [f for f in TRUTH_FIELDS if clip["truth"].get(f) is None]


# ── normalising engine output ──────────────────────────────────────────────


def normalize_v2(result: dict) -> dict:
    return {
        "supports": sorted(SUPPORTS["v2"]),
        "bpm": result.get("bpm"),
        "time_signature": result.get("timeSignature"),
        "key": result.get("key"),
        "beats": list(result.get("beats") or []),
        "downbeats": list(result.get("downbeats") or []),
        "chords": [{"start": s["start"], "end": s["end"], "chord": s["chord"]}
                   for s in result.get("chordTimeline") or []],
    }


def _pipeline_label(span: dict) -> str:
    if span.get("type") == "no_chord" or span.get("chord") in ("N", "X"):
        return "N"
    if span.get("simple"):
        return span["simple"]
    # A quality the app has no symbol for: keep root + quality so root accuracy still counts.
    return str(span["chord"]).split("/")[0].replace(":", "")


def normalize_pipeline(result: dict, cache: Optional[dict] = None) -> dict:
    events = result.get("events") or []
    return {
        "supports": sorted(SUPPORTS["pipeline"]),
        "bpm": result.get("bpm"),
        "time_signature": result.get("time_signature"),
        "key": result.get("key"),
        "beats": list(result.get("beats") or []),
        "downbeats": list(result.get("downbeats") or []),
        "chords": [{"start": c["start"], "end": c["end"], "chord": _pipeline_label(c)}
                   for c in result.get("chords") or []],
        "sections": [dict(s) for s in result.get("sections") or []],
        "passing": [e["time"] for e in events if e.get("type") == "chord_change" and e.get("subtype") == "passing"],
        "fills": [e["time"] for e in events if e.get("type") == "possible_fill"],
        "warnings": list(result.get("warnings") or []),
        "cache": cache,
    }


# ── the real engines ───────────────────────────────────────────────────────


def run_v2(audio_path: str, workdir: str) -> dict:
    from services import analysis_engine
    from services.pipeline.ffmpeg_stage import extract_wav

    audio = extract_wav(audio_path, workdir, sample_rate=analysis_engine.ANALYSIS_SR, timeout_seconds=180,
                        min_seconds=1.0, max_seconds=900)
    return normalize_v2(analysis_engine.analyze(audio.wav_path))


def make_pipeline_runner(pipeline: Optional[Callable] = None, poll_seconds: float = 0.5) -> Runner:
    """
    Runs one clip through the JobManager, the same path an upload takes, then submits
    the same bytes twice more to check the cache: once on the same manager (cached,
    identical result) and once on a fresh manager over the same data folder (a "reload"
    after a restart). `pipeline` replaces the real stage sequence in tests.
    """
    from services.pipeline import jobs
    from services.pipeline.config import load_config

    def wait(manager, job_id: str, timeout: float):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            view = manager.view(job_id)
            if view and view.status in ("completed", "failed"):
                return view
            time.sleep(poll_seconds)
        raise TimeoutError(f"job {job_id} did not finish within {timeout:.0f} s")

    def run(audio_path: str, workdir: str) -> dict:
        config = load_config(data_dir=os.path.join(workdir, "pipeline_data"))
        timeout = config.job_timeout_seconds + 60
        suffix = os.path.splitext(audio_path)[1]

        def submit(manager) -> tuple:
            upload = os.path.join(workdir, f"upload{time.monotonic_ns()}{suffix}")
            shutil.copy2(audio_path, upload)  # submit() takes ownership of its file
            job_id, cached = manager.submit(upload, os.path.basename(audio_path))
            return wait(manager, job_id, timeout), cached

        manager = jobs.JobManager(config, **({"pipeline": pipeline} if pipeline else {}))
        reload_manager = None
        try:
            first, first_cached = submit(manager)
            if first.status != "completed" or first.result is None:
                err = first.error.message if first.error else "unknown error"
                raise RuntimeError(f"pipeline job failed: {err}")
            computed = first.result.model_dump()
            second, second_cached = submit(manager)
            reload_manager = jobs.JobManager(config, **({"pipeline": pipeline} if pipeline else {}))
            third, third_cached = submit(reload_manager)
            cache = {
                "first_cached": bool(first_cached or first.cached),
                "second_cached": bool(second_cached and second.cached),
                "second_identical": second.result is not None and second.result.model_dump() == computed,
                "reload_cached": bool(third_cached and third.cached),
                "reload_identical": third.result is not None and third.result.model_dump() == computed,
            }
            return normalize_pipeline(computed, cache)
        finally:
            manager.shutdown()
            if reload_manager:
                reload_manager.shutdown()

    return run


# ── evaluation ─────────────────────────────────────────────────────────────


def _prediction_path(pred_dir: str, clip_id: str, engine: str) -> str:
    return os.path.join(pred_dir, f"{clip_id}.{engine}.json")


def _load_prediction(pred_dir: str, clip_id: str, engine: str) -> Optional[dict]:
    try:
        with open(_prediction_path(pred_dir, clip_id, engine), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def evaluate_clip(clip: dict, audio_path: Optional[str], engines: Sequence[str], runners: dict[str, Runner],
                  scratch_root: str, save_dir: Optional[str] = None, from_dir: Optional[str] = None) -> dict:
    entry = {"id": clip["id"], "description": clip.get("description"), "audio": clip["audio"],
             "missing_truth": missing_truth(clip), "engines": {}}
    if from_dir is None and (audio_path is None or not os.path.isfile(audio_path)):
        entry.update(status="skipped", reason=f"audio file not found: {clip['audio']}")
        return entry
    entry["status"] = "ok"
    for engine in engines:
        run = {"status": "ok", "error": None, "seconds": None, "metrics": {}}
        entry["engines"][engine] = run
        started = time.perf_counter()
        try:
            if from_dir is not None:
                pred = _load_prediction(from_dir, clip["id"], engine)
                if pred is None:
                    raise FileNotFoundError(f"no saved prediction for {clip['id']} / {engine}")
            else:
                scratch = tempfile.mkdtemp(prefix=f"{clip['id']}_{engine}_", dir=scratch_root)
                try:
                    pred = runners[engine](audio_path, scratch)
                finally:
                    shutil.rmtree(scratch, ignore_errors=True)
            run["seconds"] = round(time.perf_counter() - started, 2)
            if save_dir and from_dir is None:
                with open(_prediction_path(save_dir, clip["id"], engine), "w", encoding="utf-8") as f:
                    json.dump(pred, f)
            pred = {**pred, "supports": set(pred.get("supports") or SUPPORTS.get(engine, ()))}
            run["metrics"] = metrics.score_clip(pred, clip["truth"])
            run["prediction"] = _summary(pred)
        except Exception as e:  # one failed engine/clip must not end the run
            run.update(status="failed", error=f"{type(e).__name__}: {e}")
    return entry


def _summary(pred: dict) -> dict:
    return {"bpm": pred.get("bpm"), "time_signature": pred.get("time_signature"), "key": pred.get("key"),
            "n_beats": len(pred.get("beats") or []), "n_downbeats": len(pred.get("downbeats") or []),
            "n_chords": len(pred.get("chords") or []), "n_sections": len(pred.get("sections") or []),
            "n_passing": len(pred.get("passing") or []), "n_fills": len(pred.get("fills") or []),
            "warnings": pred.get("warnings"), "cache": pred.get("cache")}


def git_commit() -> Optional[str]:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=HERE,
                             timeout=10)
        return out.stdout.strip() or None
    except Exception:
        return None


def run_evaluation(clips: list[dict], *, clips_dir: Optional[str], engines: Sequence[str] = ENGINES,
                   runners: Optional[dict[str, Runner]] = None, out_dir: str = DEFAULT_OUT_DIR,
                   previous: Optional[dict] = None, tolerance: Optional[dict] = None,
                   from_predictions: Optional[str] = None, pipeline_version: Optional[int] = None,
                   run_id: Optional[str] = None, write: bool = True,
                   clip_names: Optional[dict] = None) -> dict:
    """Runs every engine on every clip, builds the report (and writes it unless write=False)."""
    clips = copy.deepcopy(clips)
    runners = runners or {}
    for e in engines:
        if e not in runners and from_predictions is None:
            raise ValueError(f"no runner for engine {e!r}")
    now = datetime.now(timezone.utc)
    run_id = run_id or now.strftime("%Y%m%d-%H%M%S")
    pred_dir = os.path.join(out_dir, f"{run_id}_predictions")
    if write and from_predictions is None:
        os.makedirs(pred_dir, exist_ok=True)

    scratch_root = tempfile.mkdtemp(prefix="wilsify_eval_")
    try:
        entries = []
        for clip in clips:
            audio = os.path.join(clips_dir, clip_manifest.clip_filename(clip, clip_names or {})) if clips_dir else None
            entries.append(evaluate_clip(clip, audio, engines, runners, scratch_root,
                                         save_dir=pred_dir if write else None, from_dir=from_predictions))
    finally:
        shutil.rmtree(scratch_root, ignore_errors=True)

    ran = [c for c in entries if c["status"] == "ok"]
    out = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "created_at": now.isoformat(timespec="seconds"),
        "engines": list(engines),
        "meta": {"git_commit": git_commit(), "pipeline_version": pipeline_version,
                 "clips_dir": clips_dir, "from_predictions": from_predictions},
        "summary": {"clips_total": len(entries), "clips_run": len(ran), "clips_skipped": len(entries) - len(ran)},
        "clips": entries,
        "overall": report.compute_overall(ran, engines),
        "comparison": ({"engines": [engines[0], engines[1]],
                        "metrics": report.compute_comparison(ran, engines[0], engines[1])}
                       if len(engines) >= 2 else None),
        "missing_ground_truth": report.missing_ground_truth(entries, TRUTH_FIELDS),
    }
    out["regression"] = report.find_regressions(previous, out, tolerance)
    if write:
        out["files"] = report.write_reports(out, out_dir)
        # write_reports needs the finished report; refresh the JSON so it also lists its own files.
        report.write_reports(out, out_dir)
    return out


# ── CLI ────────────────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m evaluation.run_evaluation", description=__doc__.split("\n\n")[0])
    p.add_argument("--clips-dir", default=os.environ.get("WILSIFY_CLIPS_DIR") or DEFAULT_CLIPS_DIR,
                   help="folder holding the reference clips (default: $WILSIFY_CLIPS_DIR, else evaluation/clips)")
    p.add_argument("--clip-manifest", default=clip_manifest.DEFAULT_CLIP_MANIFEST,
                   help="clip_manifest.json: maps TEST IDs to file names")
    p.add_argument("--manifest", default=DEFAULT_MANIFEST, help="reference_clips.json")
    p.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="where reports are written")
    p.add_argument("--engines", default=",".join(ENGINES), help="comma list from: " + ", ".join(ENGINES))
    p.add_argument("--clips", default="", help="comma list of clip ids to run (default: all)")
    p.add_argument("--baseline", default=None, help="report JSON to compare with (default: <out-dir>/latest.json)")
    p.add_argument("--from-predictions", default=None,
                   help="re-score the saved predictions of an earlier run (<out-dir>/<run_id>_predictions) without running engines")
    p.add_argument("--fail-on-regression", action="store_true", help="exit 1 if a regression is found")
    p.add_argument("--allow-model-downloads", action="store_true",
                   help="do not force offline mode for Hugging Face / transformers model loading")
    return p


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.allow_model_downloads:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    engines = [e.strip() for e in args.engines.split(",") if e.strip()]
    bad = [e for e in engines if e not in ENGINES]
    if bad or not engines:
        print(f"unknown engine(s): {bad or engines}; choose from {ENGINES}", file=sys.stderr)
        return 2
    clips = load_manifest(args.manifest)
    if args.clips:
        wanted = {c.strip() for c in args.clips.split(",") if c.strip()}
        unknown = wanted - {c["id"] for c in clips}
        if unknown:
            print(f"unknown clip id(s): {sorted(unknown)}", file=sys.stderr)
            return 2
        clips = [c for c in clips if c["id"] in wanted]
    if not args.from_predictions and not (args.clips_dir and os.path.isdir(args.clips_dir)):
        print(f"Reference clips not found in {args.clips_dir}. Copy them there with "
              "`python -m evaluation.clip_manifest --source <folder>`, or pass --clips-dir <folder> "
              "(or set WILSIFY_CLIPS_DIR); the audio is not stored in git.", file=sys.stderr)
        return 2

    previous = report.load_report(args.baseline or os.path.join(args.out_dir, "latest.json"))
    runners: dict[str, Runner] = {}
    pipeline_version = None
    if not args.from_predictions:
        from services.pipeline.config import PIPELINE_VERSION
        pipeline_version = PIPELINE_VERSION
        if "v2" in engines:
            runners["v2"] = run_v2
        if "pipeline" in engines:
            runners["pipeline"] = make_pipeline_runner()

    result = run_evaluation(clips, clips_dir=args.clips_dir, engines=engines, runners=runners, out_dir=args.out_dir,
                            previous=previous, from_predictions=args.from_predictions,
                            pipeline_version=pipeline_version,
                            clip_names=clip_manifest.load_clip_manifest(args.clip_manifest))
    s = result["summary"]
    print(f"Evaluated {s['clips_run']}/{s['clips_total']} clips ({s['clips_skipped']} skipped).")
    for name, path in result["files"].items():
        if name.startswith("latest"):
            print(f"  {path}")
    reg = result["regression"]
    if reg is None:
        print("No previous run: this run is the new baseline.")
    elif reg["has_regression"]:
        print(f"REGRESSIONS vs {reg['baseline_run_id']}: {len(reg['regressions'])} metric(s), "
              f"{len(reg['status_changes'])} status change(s). See the Markdown report.")
    else:
        print(f"No regressions vs {reg['baseline_run_id']}.")
    return 1 if (args.fail_on_regression and reg and reg["has_regression"]) else 0


if __name__ == "__main__":
    sys.exit(main())
