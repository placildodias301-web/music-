"""
Ground-truth template and import for the reference clips.

    python -m evaluation.import_ground_truth                         # imports evaluation/ground_truth.csv
    python -m evaluation.import_ground_truth my_truth.xlsx --dry-run # another file; --dry-run only checks
    python -m evaluation.import_ground_truth --write-template my_truth.csv   # a fresh pre-filled copy

You fill the template (CSV or Excel) by ear; the importer validates every cell and
copies the values into reference_clips.json. A blank cell means "no ground truth":
it leaves whatever the manifest already has and the evaluation skips that metric.
Nothing is written unless every row is valid.

Columns
  clip_id                 TEST_001 ...
  bpm                     30-300, e.g. 104 or 104.5
  time_signature          4/4, 3/4, 6/8, 12/8 ...
  key, mode               key "A" + mode "minor", or key "A minor" / "F#m"; several acceptable keys: "G major; E major"
  sections                "0-12 intro; 12-40 verse; 40-60 chorus" (seconds or m:ss; ascending, no overlap)
  main_chord_progression  the repeating loop, e.g. "Am F C G" (also "Am - F - C - G", "Am -> F")
  passing_chords          start times of passing chords, "12.5; 0:31"; "none" = verified there are none
  fills                   drum fills: times or ranges, "10.2-11; 0:45"; "none" = verified there are none
  notes                   free text
  verified_by, verified_at  who checked it by ear and when (YYYY-MM-DD). Required whenever the row has any truth value.
"""

import argparse
import csv
import io
import json
import os
import re
import sys
from datetime import date, datetime
from typing import Optional, Sequence

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from evaluation.metrics import parse_key  # noqa: E402
from services.pipeline.chords.harte import SUFFIXES  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MANIFEST = os.path.join(HERE, "reference_clips.json")
DEFAULT_CSV = os.path.join(HERE, "ground_truth.csv")  # the file you fill in by ear
DEFAULT_TEMPLATE = DEFAULT_CSV

COLUMNS = ("clip_id", "bpm", "time_signature", "key", "mode", "sections", "main_chord_progression",
           "passing_chords", "fills", "notes", "verified_by", "verified_at")
TRUTH_COLUMNS = ("bpm", "time_signature", "key", "mode", "sections", "main_chord_progression", "passing_chords",
                 "fills")

BPM_RANGE = (30.0, 300.0)
TIME_SIGNATURES = ("2/4", "3/4", "4/4", "5/4", "6/8", "9/8", "12/8")
CHORD_QUALITIES = frozenset(SUFFIXES.values())
TIME_SLACK = 1.0  # seconds a time may run past the clip's listed duration
PREFILLED_SOURCE = "Wilsify_demo_truth.xlsx (played key)"

_TIME = r"(?:\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?)"
_SECTION = re.compile(rf"^({_TIME})\s*-\s*({_TIME})\s+(\S.*)$")
_RANGE = re.compile(rf"^({_TIME})\s*-\s*({_TIME})$")
_CHORD = re.compile(r"^([A-G][#b]?)([^/]*)(?:/([A-G][#b]?))?$")
_KEY = re.compile(r"^([A-G][#b]?)\s*(major|minor|maj|min|m)?$", re.IGNORECASE)


class Problems(list):
    """Collects (row label, column, message) so one run reports every mistake."""

    def add(self, where: str, column: str, message: str) -> None:
        self.append({"where": where, "column": column, "message": message})

    def format(self) -> str:
        return "\n".join(f"  {p['where']} / {p['column']}: {p['message']}" for p in self)


# ── cell parsers: each returns (value, error message or None) ──────────────


def parse_bpm(text: str):
    try:
        value = float(text)
    except ValueError:
        return None, f"{text!r} is not a number"
    if not BPM_RANGE[0] <= value <= BPM_RANGE[1]:
        return None, f"{value:g} is outside {BPM_RANGE[0]:g}-{BPM_RANGE[1]:g} BPM"
    return value, None


def parse_time_signature(text: str):
    value = re.sub(r"\s+", "", text)
    if value not in TIME_SIGNATURES:
        return None, f"{text!r} is not one of {', '.join(TIME_SIGNATURES)}"
    return value, None


def parse_time(text: str) -> Optional[float]:
    """'12.5' or '1:05.5' -> seconds; None if not a time."""
    text = text.strip()
    if not re.fullmatch(_TIME, text):
        return None
    if ":" in text:
        minutes, seconds = text.split(":")
        value = int(minutes) * 60 + float(seconds)
        return None if float(seconds) >= 60 else value
    return float(text)


def parse_key_cell(key: str, mode: str):
    """-> (normalised key string or list of alternatives, error)."""
    parts = [p.strip() for p in re.split(r"[;|]", key) if p.strip()]
    if not parts:
        return None, "empty key"
    mode = mode.strip().lower()
    if mode and mode not in ("major", "minor"):
        return None, f"mode {mode!r} must be major or minor"
    out = []
    for part in parts:
        m = _KEY.match(part)
        if not m or parse_key(part) is None:
            return None, f"{part!r} is not a key (examples: 'A minor', 'F#m', 'Bb major')"
        tonic, own = m.group(1), (m.group(2) or "").lower()
        own_mode = {"major": "major", "maj": "major", "minor": "minor", "min": "minor", "m": "minor"}.get(own)
        if own_mode and mode and len(parts) == 1 and own_mode != mode:
            return None, f"key {part!r} says {own_mode} but mode says {mode}"
        use = own_mode or (mode if len(parts) == 1 else "")
        if not use:
            return None, f"{part!r} has no mode: add major/minor (in the mode column or the key itself)"
        out.append(f"{tonic[0].upper()}{tonic[1:]} {use}")
    return (out[0] if len(out) == 1 else out), None


def check_chord(label: str) -> Optional[str]:
    """Error message, or None if the label is a chord symbol the app understands."""
    if label == "N":
        return None
    m = _CHORD.match(label)
    if not m:
        return f"{label!r} is not a chord symbol (examples: C, Am7, F#m, Bb, G/B, N)"
    if m.group(2) not in CHORD_QUALITIES:
        return f"{label!r} has an unknown chord quality {m.group(2)!r}"
    return None


def parse_progression(text: str):
    tokens = [t for t in re.split(r"\s*(?:->|→|[>|,;\-\s])\s*", text.strip()) if t]
    if not tokens:
        return None, "empty progression"
    for token in tokens:
        error = check_chord(token)
        if error:
            return None, error
    return tokens, None


def parse_sections(text: str, duration: Optional[float]):
    items = [i.strip() for i in re.split(r"[;\n]", text) if i.strip()]
    out = []
    for item in items:
        m = _SECTION.match(item)
        if not m:
            return None, f"{item!r} must look like '0-12 intro' (start-end label, seconds or m:ss)"
        start, end = parse_time(m.group(1)), parse_time(m.group(2))
        if start is None or end is None:
            return None, f"{item!r} has a bad time"
        if end <= start:
            return None, f"{item!r}: end must be after start"
        if out and start < out[-1]["end"]:
            return None, f"{item!r} overlaps or is out of order (previous section ends at {out[-1]['end']:g} s)"
        if duration is not None and end > duration + TIME_SLACK:
            return None, f"{item!r} ends after the clip ({duration:g} s)"
        out.append({"start": start, "end": end, "label": m.group(3).strip()})
    return out or None, (None if out else "no sections found")


def parse_events(text: str, duration: Optional[float], allow_ranges: bool):
    """passing_chords / fills: times (and for fills, ranges). 'none' -> [] (verified empty)."""
    if text.strip().lower() == "none":
        return [], None
    out = []
    for item in (i.strip() for i in re.split(r"[;\n,]", text) if i.strip()):
        m = _RANGE.match(item)
        if m:
            if not allow_ranges:
                return None, f"{item!r}: ranges are only allowed for fills; give a single time"
            start, end = parse_time(m.group(1)), parse_time(m.group(2))
            if end <= start:
                return None, f"{item!r}: end must be after start"
            value, last = {"start": start, "end": end}, end
        else:
            t = parse_time(item)
            if t is None:
                return None, f"{item!r} is not a time (use seconds like 12.5 or m:ss like 0:12)"
            value, last = t, t
        if duration is not None and last > duration + TIME_SLACK:
            return None, f"{item!r} is after the end of the clip ({duration:g} s)"
        out.append(value)
    if not out:
        return None, "no times found (write 'none' if there are none)"
    out.sort(key=lambda v: v["start"] if isinstance(v, dict) else v)
    return out, None


def parse_verified_at(text: str):
    try:
        value = date.fromisoformat(text.strip())
    except ValueError:
        return None, f"{text!r} is not a date (use YYYY-MM-DD)"
    if value > date.today():
        return None, f"{text} is in the future"
    return value.isoformat(), None


# ── reading files ──────────────────────────────────────────────────────────


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def read_rows(path: str) -> list[dict]:
    """Rows as {column: text}. CSV (UTF-8, with or without BOM) or Excel (first sheet)."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        try:
            import openpyxl
        except ImportError as e:
            raise SystemExit("Reading Excel needs openpyxl (pip install openpyxl); or save the sheet as CSV.") from e
        sheet = openpyxl.load_workbook(path, data_only=True, read_only=True).worksheets[0]
        grid = [[_cell(c) for c in row] for row in sheet.iter_rows(values_only=True)]
    elif ext == ".csv":
        with open(path, encoding="utf-8-sig", newline="") as f:
            grid = [[_cell(c) for c in row] for row in csv.reader(f)]
    else:
        raise SystemExit(f"{path}: expected a .csv or .xlsx file")
    grid = [r for r in grid if any(r)]
    if not grid:
        raise SystemExit(f"{path}: the file is empty")
    header = [h.strip().lower() for h in grid[0]]
    return [{h: (r[i] if i < len(r) else "") for i, h in enumerate(header) if h} for r in grid[1:]]


# ── validation ─────────────────────────────────────────────────────────────


def validate_rows(rows: Sequence[dict], clips_by_id: dict) -> tuple[dict, Problems]:
    """
    -> ({clip_id: update}, problems). An update is {"truth": {...}, "notes": str|None, "verified": {...}|None}
    containing only the fields the row filled in.
    """
    problems = Problems()
    updates: dict = {}
    if rows:
        columns = set().union(*(r.keys() for r in rows))
        unknown = sorted(columns - set(COLUMNS))
        if unknown:
            problems.add("header", ", ".join(unknown), f"unknown column(s); expected {', '.join(COLUMNS)}")
        if "clip_id" not in columns:
            problems.add("header", "clip_id", "missing column")
            return updates, problems
    for n, row in enumerate(rows, start=2):  # row 1 is the header
        clip_id = row.get("clip_id", "").strip()
        where = f"row {n} ({clip_id or 'no clip_id'})"
        if clip_id not in clips_by_id:
            problems.add(where, "clip_id", f"unknown clip; expected one of {', '.join(sorted(clips_by_id))}")
            continue
        if clip_id in updates:
            problems.add(where, "clip_id", "appears more than once")
            continue
        duration = clips_by_id[clip_id].get("duration_sec")
        truth: dict = {}

        def parse(column: str, fn, *args):
            text = row.get(column, "").strip()
            if not text:
                return
            value, error = fn(text, *args)
            if error:
                problems.add(where, column, error)
            else:
                truth[column] = value

        parse("bpm", parse_bpm)
        parse("time_signature", parse_time_signature)
        parse("sections", parse_sections, duration)
        parse("main_chord_progression", parse_progression)
        parse("passing_chords", parse_events, duration, False)
        parse("fills", parse_events, duration, True)
        if row.get("key", "").strip():
            value, error = parse_key_cell(row["key"], row.get("mode", ""))
            if error:
                problems.add(where, "key", error)
            else:
                truth["key"] = value
        elif row.get("mode", "").strip():
            problems.add(where, "mode", "mode is given without a key")
        truth.pop("mode", None)

        verified = None
        by, at = row.get("verified_by", "").strip(), row.get("verified_at", "").strip()
        if at:
            at, error = parse_verified_at(at)
            if error:
                problems.add(where, "verified_at", error)
                at = ""
        if truth and not by:
            problems.add(where, "verified_by", "required: say who checked these values by ear "
                                               "(values with no verified_by are not accepted as ground truth)")
        if by:
            verified = {"by": by, "at": at or None}
        updates[clip_id] = {"truth": truth, "notes": row.get("notes", "").strip() or None, "verified": verified}
    return updates, problems


# ── manifest update and template ───────────────────────────────────────────


def apply_updates(manifest: dict, updates: dict) -> dict:
    """Returns {clip_id: [fields set]} and changes `manifest` in place. Blank cells change nothing."""
    changed = {}
    for clip in manifest["clips"]:
        update = updates.get(clip["id"])
        if not update:
            continue
        fields = []
        for field, value in update["truth"].items():
            clip["truth"][field] = value
            fields.append(field)
        if update["truth"] and update["verified"]:
            clip["verified"] = update["verified"]
        if update["notes"]:
            clip["truth_notes"] = update["notes"]
            fields.append("notes")
        if fields:
            changed[clip["id"]] = fields
    return changed


def import_file(path: str, manifest_path: str = DEFAULT_MANIFEST, dry_run: bool = False) -> tuple[dict, Problems]:
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    clips_by_id = {c["id"]: c for c in manifest["clips"]}
    for clip in manifest["clips"]:
        clip.setdefault("truth", {})
    updates, problems = validate_rows(read_rows(path), clips_by_id)
    if problems:
        return {}, problems
    changed = apply_updates(manifest, updates)
    if changed and not dry_run:
        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return changed, problems


def _fmt_time(t: float) -> str:
    return f"{t:g}"


def _format_truth(clip: dict) -> dict:
    """A manifest clip as template cells (the inverse of validation, for pre-filling)."""
    t = clip.get("truth") or {}
    cells = {c: "" for c in COLUMNS}
    cells["clip_id"] = clip["id"]
    if t.get("bpm") is not None:
        cells["bpm"] = f"{t['bpm']:g}"
    cells["time_signature"] = t.get("time_signature") or ""
    key = t.get("key")
    if isinstance(key, list):
        cells["key"] = "; ".join(key)
    elif key:
        tonic, mode = key.split()
        cells["key"], cells["mode"] = tonic, mode
    if t.get("sections"):
        cells["sections"] = "; ".join(f"{_fmt_time(s['start'])}-{_fmt_time(s['end'])} {s['label']}"
                                      for s in t["sections"])
    if t.get("main_chord_progression"):
        cells["main_chord_progression"] = " ".join(t["main_chord_progression"])
    for field in ("passing_chords", "fills"):
        if t.get(field) is not None:
            cells[field] = "none" if not t[field] else "; ".join(
                f"{_fmt_time(v['start'])}-{_fmt_time(v['end'])}" if isinstance(v, dict) else _fmt_time(v)
                for v in t[field])
    verified = clip.get("verified") or {}
    has_truth = any(cells[c] for c in TRUTH_COLUMNS)
    cells["verified_by"] = verified.get("by") or (PREFILLED_SOURCE if has_truth else "")
    cells["verified_at"] = verified.get("at") or ""
    cells["notes"] = clip.get("truth_notes") or ""
    return cells


def write_template(path: str, manifest_path: str = DEFAULT_MANIFEST) -> int:
    """CSV (UTF-8 with BOM, so Excel opens it correctly) or .xlsx. Returns the number of clips."""
    with open(manifest_path, encoding="utf-8") as f:
        clips = json.load(f)["clips"]
    rows = [_format_truth(c) for c in clips]
    if path.lower().endswith(".xlsx"):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "ground_truth"
        ws.append(list(COLUMNS))
        for r in rows:
            ws.append([r[c] for c in COLUMNS])
        wb.save(path)
    else:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            f.write(buf.getvalue())
    return len(rows)


# ── CLI ────────────────────────────────────────────────────────────────────


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(prog="python -m evaluation.import_ground_truth", description=__doc__.split("\n\n")[0])
    p.add_argument("file", nargs="?", default=DEFAULT_CSV,
                   help="completed template (.csv or .xlsx); default: evaluation/ground_truth.csv")
    p.add_argument("--write-template", metavar="PATH", help="write a template (.csv or .xlsx) pre-filled from the manifest")
    p.add_argument("--manifest", default=DEFAULT_MANIFEST)
    p.add_argument("--dry-run", action="store_true", help="validate and report, write nothing")
    args = p.parse_args(argv)
    if args.write_template:
        n = write_template(args.write_template, args.manifest)
        print(f"Wrote {n} clips to {args.write_template}")
        return 0
    changed, problems = import_file(args.file, args.manifest, args.dry_run)
    if problems:
        print(f"{len(problems)} problem(s) found; nothing was imported:\n{problems.format()}", file=sys.stderr)
        return 1
    verb = "Would import" if args.dry_run else "Imported"
    if not changed:
        print("No ground truth in the file (all cells blank); nothing changed.")
    for clip_id, fields in changed.items():
        print(f"{verb} {clip_id}: {', '.join(fields)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
