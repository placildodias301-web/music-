"""
Report building for the evaluation harness: overall engine comparison,
regression detection against a previous run, and the Markdown / JSON output.
Pure functions over plain dicts, so everything here is testable without audio.

Report shape (JSON):
  clips[]  = {id, status, reason, missing_truth[], engines: {name: {status, error, seconds, metrics, prediction}}}
  overall  = {engine: {metric: {mean, n}}}
  comparison = {metric: {engine_a, engine_b, delta, n, better}}   (clips scored by both)
"""

import json
import os
from typing import Optional, Sequence

from .metrics import LOWER_IS_BETTER, METRIC_NAMES, aggregate, mean

# A metric must get worse by more than this to count as a regression. 0..1 metrics move in
# whole clips (1 of 20 = 0.05), so 0.02 flags a one-clip flip but ignores float noise.
DEFAULT_TOLERANCE = {"default": 0.02, "bpm_abs_error": 0.5, "bpm_pct_error": 0.5}

PERCENT_METRICS = set(METRIC_NAMES) - {"bpm_abs_error", "bpm_pct_error"}


# ── overall numbers ────────────────────────────────────────────────────────


def engine_metrics(clip: dict, engine: str) -> dict:
    return ((clip.get("engines") or {}).get(engine) or {}).get("metrics") or {}


def compute_overall(clips: Sequence[dict], engines: Sequence[str]) -> dict:
    return {e: aggregate([engine_metrics(c, e) for c in clips]) for e in engines}


def compute_comparison(clips: Sequence[dict], engine_a: str, engine_b: str) -> dict:
    """Per metric, the mean of each engine over the clips where BOTH were scored, so the two numbers are comparable."""
    out = {}
    for name in METRIC_NAMES:
        pairs = [(engine_metrics(c, engine_a).get(name), engine_metrics(c, engine_b).get(name)) for c in clips]
        pairs = [(a, b) for a, b in pairs if a is not None and b is not None]
        a, b = mean(p[0] for p in pairs), mean(p[1] for p in pairs)
        delta = None if a is None or b is None else b - a
        better = None
        if delta is not None and abs(delta) > 1e-9:
            better = engine_b if (delta < 0) == (name in LOWER_IS_BETTER) else engine_a
        out[name] = {engine_a: a, engine_b: b, "delta": delta, "n": len(pairs), "better": better}
    return out


def missing_ground_truth(clips: Sequence[dict], fields: Sequence[str]) -> dict:
    """{truth field: [clip ids with no ground truth]} - what the baseline cannot yet measure."""
    return {f: [c["id"] for c in clips if f in (c.get("missing_truth") or [])] for f in fields}


# ── regression detection ───────────────────────────────────────────────────


def _tolerance(metric: str, tolerance: Optional[dict]) -> float:
    table = {**DEFAULT_TOLERANCE, **(tolerance or {})}
    return table.get(metric, table["default"])


def _worse(metric: str, previous: float, current: float, tol: float) -> bool:
    delta = current - previous
    return delta > tol if metric in LOWER_IS_BETTER else delta < -tol


def _better(metric: str, previous: float, current: float, tol: float) -> bool:
    return _worse(metric, current, previous, tol)


def find_regressions(previous: Optional[dict], current: dict, tolerance: Optional[dict] = None) -> Optional[dict]:
    """
    Compares two reports. None when there is no previous run. Otherwise:
      regressions / improvements: [{engine, metric, scope ("overall" or a clip id), previous, current, delta}]
      status_changes: clips whose engine run went ok -> failed (or back)
    Overall values are recomputed over the clips present in both runs, so adding a clip or
    ground truth between runs does not look like a change; a metric that was unscored in one
    run is skipped for that clip.
    """
    if not previous:
        return None
    prev_clips = {c["id"]: c for c in previous.get("clips", [])}
    regressions, improvements, status_changes = [], [], []
    compared = 0
    engines = [e for e in current.get("engines", []) if e in previous.get("engines", [])]
    for engine in engines:
        shared = [(prev_clips[c["id"]], c) for c in current.get("clips", []) if c["id"] in prev_clips]
        for p, c in shared:
            ps = ((p.get("engines") or {}).get(engine) or {}).get("status")
            cs = ((c.get("engines") or {}).get(engine) or {}).get("status")
            if ps and cs and ps != cs:
                status_changes.append({"engine": engine, "clip": c["id"], "previous": ps, "current": cs})
        for name in METRIC_NAMES:
            tol = _tolerance(name, tolerance)
            overall_pairs = []
            for p, c in shared:
                pv, cv = engine_metrics(p, engine).get(name), engine_metrics(c, engine).get(name)
                if pv is None or cv is None:
                    continue
                compared += 1
                overall_pairs.append((pv, cv))
                row = {"engine": engine, "metric": name, "scope": c["id"], "previous": pv, "current": cv,
                       "delta": cv - pv}
                if _worse(name, pv, cv, tol):
                    regressions.append(row)
                elif _better(name, pv, cv, tol):
                    improvements.append(row)
            if overall_pairs:
                pv, cv = mean(p for p, _ in overall_pairs), mean(c for _, c in overall_pairs)
                row = {"engine": engine, "metric": name, "scope": "overall", "previous": pv, "current": cv,
                       "delta": cv - pv, "n": len(overall_pairs)}
                if _worse(name, pv, cv, tol):
                    regressions.append(row)
                elif _better(name, pv, cv, tol):
                    improvements.append(row)
    failed = [s for s in status_changes if s["current"] != "ok" and s["previous"] == "ok"]
    return {
        "baseline_run_id": previous.get("run_id"),
        "baseline_created_at": previous.get("created_at"),
        "compared_values": compared,
        "regressions": regressions,
        "improvements": improvements,
        "status_changes": status_changes,
        "has_regression": bool(regressions or failed),
    }


# ── formatting ─────────────────────────────────────────────────────────────


def fmt(metric: str, value) -> str:
    if value is None:
        return "–"
    if metric in PERCENT_METRICS:
        return f"{100 * value:.1f}%"
    if metric == "bpm_pct_error":
        return f"{value:.2f}%"
    return f"{value:.2f}"


def _fmt_delta(metric: str, value) -> str:
    if value is None:
        return "–"
    if metric in PERCENT_METRICS:
        return f"{100 * value:+.1f} pp"
    return f"{value:+.2f}"


def _table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(" --- " for _ in headers) + "|"]
    lines += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return lines


def render_markdown(report: dict) -> str:
    engines = report["engines"]
    lines = [f"# Evaluation report {report['run_id']}", ""]
    meta = report.get("meta", {})
    lines += [f"- Created: {report['created_at']}",
              f"- Git commit: {meta.get('git_commit') or 'unknown'}",
              f"- Pipeline version: {meta.get('pipeline_version')}",
              f"- Engines: {', '.join(engines)}",
              f"- Clips: {report['summary']['clips_total']} listed, {report['summary']['clips_run']} run, "
              f"{report['summary']['clips_skipped']} skipped", ""]

    skipped = [c for c in report["clips"] if c["status"] != "ok"]
    if skipped:
        lines += ["## Skipped clips", ""] + _table(
            ["Clip", "Reason"], [[c["id"], c.get("reason", "")] for c in skipped]) + [""]

    lines += ["## Overall", "", "Mean over the clips that have ground truth for the metric (n). `–` = not scored."
              " Engines that do not produce an output are not scored on it.", ""]
    headers = ["Metric"] + [f"{e} (n)" for e in engines]
    rows = []
    for name in METRIC_NAMES:
        row = [name]
        for e in engines:
            cell = report["overall"][e][name]
            row.append(f"{fmt(name, cell['mean'])} ({cell['n']})")
        rows.append(row)
    lines += _table(headers, rows) + [""]

    cmp = report.get("comparison")
    if cmp:
        a, b = cmp["engines"]
        lines += [f"## {b} vs {a}", "", f"Only clips where both engines were scored. Delta = {b} − {a}.", ""]
        rows = []
        for name in METRIC_NAMES:
            c = cmp["metrics"][name]
            if c["n"] == 0:
                continue
            rows.append([name, fmt(name, c[a]), fmt(name, c[b]), _fmt_delta(name, c["delta"]), c["better"] or "tie",
                         c["n"]])
        lines += (_table(["Metric", a, b, "Delta", "Better", "n"], rows) if rows
                  else ["No metric could be scored for both engines yet (no ground truth)."]) + [""]

    lines += ["## Per-song results", ""]
    for c in report["clips"]:
        if c["status"] != "ok":
            continue
        lines += [f"### {c['id']}" + (f" – {c['description']}" if c.get("description") else ""), ""]
        rows = []
        for name in METRIC_NAMES:
            vals = [engine_metrics(c, e).get(name) for e in engines]
            if all(v is None for v in vals):
                continue
            rows.append([name] + [fmt(name, v) for v in vals])
        for e in engines:
            run = c["engines"].get(e) or {}
            if run.get("status") == "failed":
                lines.append(f"- **{e} failed:** {run.get('error')}")
        lines += (_table(["Metric"] + engines, rows) if rows else ["No ground truth to score this clip yet."]) + [""]

    lines += ["## Missing ground truth", ""]
    missing = report["missing_ground_truth"]
    total = report["summary"]["clips_total"]
    rows = [[f, f"{len(ids)}/{total}", "all" if ids and len(ids) == total else ", ".join(ids) or "none"]
            for f, ids in missing.items()]
    lines += _table(["Truth field", "Clips without it", "Which"], rows) + [""]

    reg = report.get("regression")
    lines += ["## Regression vs previous run", ""]
    if reg is None:
        lines += ["No previous run to compare against (this run becomes the baseline).", ""]
    else:
        lines += [f"Baseline: {reg['baseline_run_id']} ({reg['baseline_created_at']}), "
                  f"{reg['compared_values']} per-clip values compared.", ""]
        if not reg["regressions"] and not reg["status_changes"]:
            lines += ["**No regressions.**", ""]
        if reg["regressions"]:
            lines += ["**Regressions**", ""] + _table(
                ["Engine", "Metric", "Scope", "Previous", "Current", "Delta"],
                [[r["engine"], r["metric"], r["scope"], fmt(r["metric"], r["previous"]),
                  fmt(r["metric"], r["current"]), _fmt_delta(r["metric"], r["delta"])] for r in reg["regressions"]]
            ) + [""]
        if reg["status_changes"]:
            lines += ["**Engine run status changes**", ""] + _table(
                ["Engine", "Clip", "Previous", "Current"],
                [[s["engine"], s["clip"], s["previous"], s["current"]] for s in reg["status_changes"]]) + [""]
        if reg["improvements"]:
            lines += ["**Improvements**", ""] + _table(
                ["Engine", "Metric", "Scope", "Previous", "Current", "Delta"],
                [[r["engine"], r["metric"], r["scope"], fmt(r["metric"], r["previous"]),
                  fmt(r["metric"], r["current"]), _fmt_delta(r["metric"], r["delta"])] for r in reg["improvements"]]
            ) + [""]
    return "\n".join(lines).rstrip() + "\n"


# ── files ──────────────────────────────────────────────────────────────────


def load_report(path: str) -> Optional[dict]:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_reports(report: dict, out_dir: str) -> dict:
    """<run_id>.json / .md plus latest.json / latest.md. Returns the paths."""
    os.makedirs(out_dir, exist_ok=True)
    markdown = render_markdown(report)
    text = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    paths = {}
    for stem in (report["run_id"], "latest"):
        for ext, body in (("json", text), ("md", markdown)):
            path = os.path.join(out_dir, f"{stem}.{ext}")
            with open(path, "w", encoding="utf-8") as f:
                f.write(body)
            paths[f"{stem}.{ext}"] = path
    return paths
