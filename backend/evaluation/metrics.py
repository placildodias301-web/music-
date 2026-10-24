"""
Pure metric functions for the evaluation harness. No audio, no models, no I/O.

Conventions
  * A metric returns None when it cannot be scored (no ground truth, or the
    engine does not produce that output). None is "not scored", never "wrong":
    aggregates skip it and the report counts it separately.
  * Times are seconds. Chord labels are the app's symbols ("C", "Am7", "G/B", "N").
  * Higher is better, except metrics listed in LOWER_IS_BETTER.
"""

import re
from typing import Iterable, Optional, Sequence

BEAT_TOLERANCE = 0.07  # seconds; the standard beat-tracking window (mir_eval)
PASSING_TOLERANCE = 0.25
FILL_TOLERANCE = 0.5
SECTION_TOLERANCES = (0.5, 3.0)

LOWER_IS_BETTER = frozenset({"bpm_abs_error", "bpm_pct_error"})

NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


# ── small helpers ──────────────────────────────────────────────────────────


def mean(values: Iterable[Optional[float]]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def f_measure(precision: Optional[float], recall: Optional[float]) -> Optional[float]:
    if precision is None or recall is None:
        return None
    return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)


def count_matches(est: Sequence[float], ref: Sequence[float], tolerance: float) -> int:
    """
    Size of the largest one-to-one matching with |est - ref| <= tolerance. For
    sorted points on a line the two-pointer sweep is optimal.
    """
    est, ref = sorted(est), sorted(ref)
    i = j = hits = 0
    while i < len(est) and j < len(ref):
        if abs(est[i] - ref[j]) <= tolerance:
            hits += 1
            i += 1
            j += 1
        elif est[i] < ref[j]:
            i += 1
        else:
            j += 1
    return hits


def point_scores(est: Optional[Sequence[float]], ref: Optional[Sequence[float]], tolerance: float) -> Optional[dict]:
    """Precision / recall / F of event times. None if either side is missing."""
    if est is None or ref is None:
        return None
    hits = count_matches(est, ref, tolerance)
    if not est and not ref:  # nothing to find and nothing claimed
        return {"precision": 1.0, "recall": 1.0, "f": 1.0, "n_est": 0, "n_ref": 0}
    precision = hits / len(est) if est else 0.0
    recall = hits / len(ref) if ref else 0.0
    return {"precision": precision, "recall": recall, "f": f_measure(precision, recall),
            "n_est": len(est), "n_ref": len(ref)}


# ── tempo and meter ────────────────────────────────────────────────────────


def bpm_scores(est: Optional[float], ref: Optional[float]) -> Optional[dict]:
    if est is None or ref is None or ref <= 0:
        return None
    err = abs(est - ref)
    return {
        "bpm_abs_error": err,
        "bpm_pct_error": 100.0 * err / ref,
        "bpm_within_1": 1.0 if err <= 1.0 else 0.0,
        "bpm_octave_error": 1.0 if err > 1.0 and _is_octave(est, ref) else 0.0,
    }


def _is_octave(est: float, ref: float) -> bool:
    """Off by a tempo-multiple only (half, double, 3/2, 2/3), the usual tracker mistake."""
    if est <= 0:
        return False
    return any(abs(est / ref - r) <= 0.03 for r in (0.5, 2.0, 1.5, 2 / 3))


def time_signature_correct(est: Optional[str], ref: Optional[str]) -> Optional[float]:
    if est is None or ref is None:
        return None
    return 1.0 if _norm_ts(est) == _norm_ts(ref) else 0.0


def _norm_ts(value: str) -> str:
    return re.sub(r"\s+", "", str(value))


# ── key ────────────────────────────────────────────────────────────────────


def parse_key(text: str) -> Optional[tuple[int, str]]:
    """'A Minor' / 'Am' / 'F#m' / 'Bb' / 'C major' -> (pitch class, 'major' | 'minor')."""
    m = re.match(r"^\s*([A-Ga-g])([#b♯♭]?)\s*(major|minor|maj|min|m)?\s*$", str(text), re.IGNORECASE)
    if not m:
        return None
    letter, accidental, mode = m.groups()
    pc = NOTE_PC[letter.upper()] + {"#": 1, "♯": 1, "b": -1, "♭": -1}.get(accidental, 0)
    minor = mode is not None and mode.lower() in ("minor", "min", "m")
    # "Bb" is B-flat major, but a bare lowercase letter ("a") is not a key we accept silently.
    if mode is None and letter.islower() and not accidental:
        return None
    return pc % 12, "minor" if minor else "major"


def key_scores(est: Optional[str], ref) -> Optional[dict]:
    """
    ref is a key string or a list of acceptable keys. `key_correct` is exact;
    `key_related` also accepts the relative major/minor (the usual capo or
    modal-ambiguity miss), reported separately so it never inflates `key_correct`.
    """
    if est is None or ref is None:
        return None
    refs = [parse_key(r) for r in (ref if isinstance(ref, (list, tuple)) else [ref])]
    refs = [r for r in refs if r is not None]
    if not refs:
        return None
    got = parse_key(est)
    if got is None:
        return {"key_correct": 0.0, "key_related": 0.0}
    exact = got in refs
    related = exact or any(got == _relative(r) for r in refs)
    return {"key_correct": float(exact), "key_related": float(related)}


def _relative(key: tuple[int, str]) -> tuple[int, str]:
    pc, mode = key
    return ((pc + 9) % 12, "minor") if mode == "major" else ((pc + 3) % 12, "major")


# ── chords ─────────────────────────────────────────────────────────────────

_CHORD = re.compile(r"^([A-G])([#b]?)(.*?)(?:/([A-G][#b]?))?$")


def parse_chord(label: str) -> Optional[tuple[Optional[int], str, Optional[int]]]:
    """'Am7/G' -> (root pc, quality, bass pc). 'N' -> (None, 'N', None). Unknown text -> None."""
    label = (label or "").strip()
    if label in ("N", "X", ""):
        return None if label == "" else (None, "N", None)
    m = _CHORD.match(label)
    if not m:
        return None
    letter, accidental, quality, bass = m.groups()
    root = (NOTE_PC[letter] + {"#": 1, "b": -1}.get(accidental, 0)) % 12
    bass_pc = None
    if bass:
        bass_pc = (NOTE_PC[bass[0]] + {"#": 1, "b": -1}.get(bass[1:], 0)) % 12
    return root, quality, (None if bass_pc == root else bass_pc)


def _chord_key(label: str, root_only: bool):
    parsed = parse_chord(label)
    if parsed is None:
        return ("?", label)
    root, quality, bass = parsed
    return ("N",) if root is None else ((root,) if root_only else (root, quality, bass))


def chord_scores(est: Optional[Sequence[dict]], ref: Optional[Sequence[dict]]) -> Optional[dict]:
    """
    Time-weighted chord accuracy over the reference timeline: the fraction of
    reference seconds during which the estimate says the same root
    (`chord_root_acc`) or the same full symbol, root + quality + bass
    (`chord_symbol_acc`). Estimated seconds outside [0, ref end] are ignored;
    reference seconds the estimate does not cover count as wrong.
    """
    if est is None or ref is None or not ref:
        return None
    ref = sorted(ref, key=lambda c: c["start"])
    est = sorted(est, key=lambda c: c["start"])
    cuts = sorted({t for c in list(ref) + list(est) for t in (c["start"], c["end"])})
    total = root_hits = symbol_hits = 0.0
    ri = ei = 0
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        while ri < len(ref) and ref[ri]["end"] <= mid:
            ri += 1
        while ei < len(est) and est[ei]["end"] <= mid:
            ei += 1
        if ri >= len(ref) or not ref[ri]["start"] <= mid:
            continue  # outside the reference timeline
        length = b - a
        total += length
        if ei < len(est) and est[ei]["start"] <= mid:
            r, e = ref[ri]["chord"], est[ei]["chord"]
            root_hits += length * (_chord_key(r, True) == _chord_key(e, True))
            symbol_hits += length * (_chord_key(r, False) == _chord_key(e, False))
    if total <= 0:
        return None
    return {"chord_root_acc": root_hits / total, "chord_symbol_acc": symbol_hits / total}


def _collapsed_symbols(chords: Sequence[dict]) -> list:
    """The estimate's chord symbols in order, with no-chord spans dropped and repeats merged."""
    out: list = []
    for c in sorted(chords, key=lambda c: c["start"]):
        key = _chord_key(c["chord"], False)
        if key == ("N",) or (out and out[-1] == key):
            continue
        out.append(key)
    return out


def progression_scores(est: Optional[Sequence[dict]], ref: Optional[Sequence[str]]) -> Optional[dict]:
    """
    The untimed "main chord progression" (a loop such as Am F C G).
    `progression_chord_recall`: share of its distinct chords the estimate uses at all.
    `progression_found`: 1.0 if the estimate plays the progression in order, starting
    anywhere in the loop (a rotation), as a run of consecutive chords.
    """
    if est is None or ref is None:
        return None
    loop = [k for k in (_chord_key(c, False) for c in ref) if k != ("N",)]
    if not loop:
        return None
    seq = _collapsed_symbols(est)
    distinct = list(dict.fromkeys(loop))
    recall = sum(k in seq for k in distinct) / len(distinct)
    found = any(seq[i:i + len(loop)] == loop[r:] + loop[:r]
                for r in range(len(loop)) for i in range(len(seq) - len(loop) + 1))
    return {"progression_chord_recall": recall, "progression_found": float(found)}


# ── sections ───────────────────────────────────────────────────────────────


def _norm_label(label: str) -> str:
    return re.sub(r"[\s_\-\d]+", "", str(label).lower())


def section_scores(est: Optional[Sequence[dict]], ref: Optional[Sequence[dict]]) -> Optional[dict]:
    """
    `section_f_0.5s` / `section_f_3s`: boundary F-measure on section start times
    (time 0 is excluded - every song has one). `section_label_acc`: the fraction
    of reference seconds whose estimated section label matches (case, spaces and
    numbering ignored: "Verse 2" == "verse").
    """
    if est is None or ref is None or not ref:
        return None
    ref = sorted(ref, key=lambda s: s["start"])
    est = sorted(est, key=lambda s: s["start"])
    out = {}
    est_b = [s["start"] for s in est if s["start"] > 0]
    ref_b = [s["start"] for s in ref if s["start"] > 0]
    for tol in SECTION_TOLERANCES:
        scores = point_scores(est_b, ref_b, tol)
        out[f"section_f_{tol:g}s"] = scores["f"]
    total = hits = 0.0
    for r in ref:
        length = r["end"] - r["start"]
        if length <= 0:
            continue
        total += length
        for e in est:
            overlap = min(r["end"], e["end"]) - max(r["start"], e["start"])
            if overlap > 0 and _norm_label(e["label"]) == _norm_label(r["label"]):
                hits += overlap
    out["section_label_acc"] = hits / total if total else None
    return out


# ── passing chords and fills ───────────────────────────────────────────────


def passing_scores(est: Optional[Sequence[float]], ref: Optional[Sequence[float]]) -> Optional[dict]:
    s = point_scores(est, ref, PASSING_TOLERANCE)
    return None if s is None else {"passing_precision": s["precision"], "passing_recall": s["recall"],
                                   "passing_f": s["f"]}


def _interval(fill) -> tuple[float, float]:
    return (fill["start"], fill["end"]) if isinstance(fill, dict) else (float(fill), float(fill))


def fill_scores(est: Optional[Sequence[float]], ref: Optional[Sequence[object]]) -> Optional[dict]:
    """A detected fill is right if it lands inside (± tolerance) a reference fill; a reference fill is found if any detection does."""
    if est is None or ref is None:
        return None
    spans = [_interval(f) for f in ref]
    if not est and not spans:
        return {"fill_precision": 1.0, "fill_recall": 1.0, "fill_f": 1.0}
    right = sum(any(a - FILL_TOLERANCE <= t <= b + FILL_TOLERANCE for a, b in spans) for t in est)
    found = sum(any(a - FILL_TOLERANCE <= t <= b + FILL_TOLERANCE for t in est) for a, b in spans)
    precision = right / len(est) if est else 0.0
    recall = found / len(spans) if spans else 0.0
    return {"fill_precision": precision, "fill_recall": recall, "fill_f": f_measure(precision, recall)}


# ── preprocessing warnings ─────────────────────────────────────────────────

# Message text -> category. First match wins; text that matches nothing is not a preprocessing warning.
WARNING_PATTERNS = (
    ("stem_clipping", re.compile(r"separated stems exceed", re.I)),
    ("clipping", re.compile(r"\bclipp", re.I)),
    ("quiet_instruments", re.compile(r"instruments are very quiet", re.I)),
    ("low_volume", re.compile(r"recording is very quiet", re.I)),
    ("noise", re.compile(r"background noise", re.I)),
    ("speech", re.compile(r"sounds like speech", re.I)),
    ("no_instruments", re.compile(r"no instruments were found", re.I)),
    ("not_musical", re.compile(r"no clear beat or held notes", re.I)),
)
WARNING_CATEGORIES = tuple(name for name, _ in WARNING_PATTERNS)


def warning_categories(warnings: Iterable[str]) -> set[str]:
    found = set()
    for text in warnings:
        for name, pattern in WARNING_PATTERNS:
            if pattern.search(text):
                found.add(name)
                break
    return found


def warning_scores(est: Optional[Iterable[str]], expected: Optional[Sequence[str]]) -> Optional[dict]:
    """
    `expected` lists the categories that should fire; [] means none should.
    Scored per clip: exact set match, plus the missed and spurious categories
    so the report can say what went wrong.
    """
    if est is None or expected is None:
        return None
    got, want = warning_categories(est), set(expected)
    return {
        "warnings_exact": float(got == want),
        "warnings_tp": len(got & want),
        "warnings_fp": len(got - want),
        "warnings_fn": len(want - got),
        "warnings_missed": sorted(want - got),
        "warnings_spurious": sorted(got - want),
    }


# ── cache / reload ─────────────────────────────────────────────────────────


def cache_scores(check: Optional[dict]) -> Optional[dict]:
    """
    `check` comes from the runner: first_cached (must be False), second_cached and
    reload_cached (must be True), second_identical / reload_identical (cached result
    equals the computed one). All five true -> cache_correct 1.0.
    """
    if check is None:
        return None
    ok = (check.get("first_cached") is False and check.get("second_cached") is True
          and check.get("second_identical") is True and check.get("reload_cached") is True
          and check.get("reload_identical") is True)
    return {"cache_correct": float(ok)}


# ── one clip ───────────────────────────────────────────────────────────────


def score_clip(pred: dict, truth: dict) -> dict:
    """
    Every metric for one clip and one engine. `pred` is the engine's normalised
    output (see run_evaluation.normalize_*); a key absent from `pred` means the
    engine does not produce it, a None value means it produced nothing.
    Returns {metric: value-or-None}; unscored metrics are simply None.
    """
    supported = pred.get("supports", set())
    out: dict = {}

    def add(scores: Optional[dict], names: Sequence[str]) -> None:
        for name in names:
            out[name] = None if scores is None else scores.get(name)

    def use(field: str, value):
        return value if field in supported else None

    add(bpm_scores(use("bpm", pred.get("bpm")), truth.get("bpm")),
        ("bpm_abs_error", "bpm_pct_error", "bpm_within_1", "bpm_octave_error"))
    beat = point_scores(use("beats", pred.get("beats")), truth.get("beats"), BEAT_TOLERANCE)
    out["beat_f"] = None if beat is None else beat["f"]
    down = point_scores(use("downbeats", pred.get("downbeats")), truth.get("downbeats"), BEAT_TOLERANCE)
    out["downbeat_f"] = None if down is None else down["f"]
    out["time_signature_correct"] = time_signature_correct(use("time_signature", pred.get("time_signature")),
                                                           truth.get("time_signature"))
    add(key_scores(use("key", pred.get("key")), truth.get("key")), ("key_correct", "key_related"))
    add(chord_scores(use("chords", pred.get("chords")), truth.get("chords")), ("chord_root_acc", "chord_symbol_acc"))
    add(progression_scores(use("chords", pred.get("chords")), truth.get("main_chord_progression")),
        ("progression_chord_recall", "progression_found"))
    add(section_scores(use("sections", pred.get("sections")), truth.get("sections")),
        ("section_f_0.5s", "section_f_3s", "section_label_acc"))
    add(passing_scores(use("passing", pred.get("passing")), truth.get("passing_chords")),
        ("passing_precision", "passing_recall"))
    add(fill_scores(use("fills", pred.get("fills")), truth.get("fills")), ("fill_precision", "fill_recall"))
    w = warning_scores(use("warnings", pred.get("warnings")), truth.get("expected_warnings"))
    out["warnings_exact"] = None if w is None else w["warnings_exact"]
    out["warnings_detail"] = None if w is None else {k: w[k] for k in
                                                     ("warnings_tp", "warnings_fp", "warnings_fn",
                                                      "warnings_missed", "warnings_spurious")}
    add(cache_scores(use("cache", pred.get("cache"))), ("cache_correct",))
    return out


METRIC_NAMES = (
    "bpm_abs_error", "bpm_pct_error", "bpm_within_1", "bpm_octave_error",
    "beat_f", "downbeat_f", "time_signature_correct", "key_correct", "key_related",
    "chord_root_acc", "chord_symbol_acc", "progression_chord_recall", "progression_found",
    "section_f_0.5s", "section_f_3s", "section_label_acc",
    "passing_precision", "passing_recall", "fill_precision", "fill_recall",
    "warnings_exact", "cache_correct",
)


def aggregate(per_clip: Sequence[dict]) -> dict:
    """{metric: {"mean": float|None, "n": clips scored}} over the clips where the metric was scored."""
    out = {}
    for name in METRIC_NAMES:
        values = [c.get(name) for c in per_clip if c.get(name) is not None]
        out[name] = {"mean": mean(values), "n": len(values)}
    return out
