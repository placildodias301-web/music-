"""
Ground-truth template and import workflow (backend/evaluation/import_ground_truth.py):
template contents, import, validation of every field format, and partial ground truth
flowing through the evaluation (missing fields are skipped, never scored as wrong).
"""

import csv
import json
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evaluation import import_ground_truth as gt  # noqa: E402
from evaluation import metrics as m  # noqa: E402
from evaluation import run_evaluation as ev  # noqa: E402


@pytest.fixture()
def manifest(tmp_path):
    path = tmp_path / "reference_clips.json"
    shutil.copy(gt.DEFAULT_MANIFEST, path)
    return str(path)


def write_csv(path, rows, columns=gt.COLUMNS):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in columns})
    return str(path)


def truth_of(manifest_path, clip_id):
    clips = json.load(open(manifest_path, encoding="utf-8"))["clips"]
    return next(c for c in clips if c["id"] == clip_id)


def run_import(tmp_path, manifest, rows, **kw):
    return gt.import_file(write_csv(tmp_path / "t.csv", rows), manifest, **kw)


GOOD = {"clip_id": "TEST_007", "bpm": "119.5", "time_signature": "4/4", "key": "E", "mode": "minor",
        "sections": "0-8 intro; 8-20 verse; 0:20-0:32 chorus", "main_chord_progression": "Em Am G D",
        "passing_chords": "12.5; 0:21", "fills": "10-10.8; 31", "notes": "capo 0", "verified_by": "wilbur",
        "verified_at": "2026-10-20"}


# ── template ───────────────────────────────────────────────────────────────


def test_committed_template_has_the_requested_columns_and_all_20_clips():
    with open(gt.DEFAULT_TEMPLATE, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    assert list(rows[0].keys()) == ["clip_id", "bpm", "time_signature", "key", "mode", "sections",
                                    "main_chord_progression", "passing_chords", "fills", "notes", "verified_by",
                                    "verified_at"]
    assert [r["clip_id"] for r in rows] == [f"TEST_{i:03d}" for i in range(1, 21)]


def test_template_prefills_only_the_known_keys_and_nothing_from_the_estimates_workbook(tmp_path, manifest):
    out = tmp_path / "t.csv"
    assert gt.write_template(str(out), manifest) == 20
    rows = {r["clip_id"]: r for r in csv.DictReader(open(out, encoding="utf-8-sig", newline=""))}
    assert (rows["TEST_007"]["key"], rows["TEST_007"]["mode"]) == ("E", "minor")
    assert rows["TEST_011"]["key"] == "G major; E major" and rows["TEST_011"]["mode"] == ""
    assert rows["TEST_010"]["key"] == "" and rows["TEST_010"]["verified_by"] == ""  # key unclear -> blank
    assert rows["TEST_007"]["verified_by"] and rows["TEST_007"]["verified_at"] == ""
    # BPM / meter / chords come only from the unverified estimates: they must stay blank
    for r in rows.values():
        assert not any(r[c] for c in ("bpm", "time_signature", "sections", "main_chord_progression",
                                      "passing_chords", "fills"))


def test_unmodified_template_imports_cleanly_and_is_idempotent(tmp_path, manifest):
    template = tmp_path / "t.csv"
    gt.write_template(str(template), manifest)
    before = open(manifest, encoding="utf-8").read()
    changed, problems = gt.import_file(str(template), manifest)
    assert not problems and len(changed) == 19  # TEST_010 has no truth
    again = open(manifest, encoding="utf-8").read()
    changed2, _ = gt.import_file(str(template), manifest)
    assert open(manifest, encoding="utf-8").read() == again
    assert json.loads(before)["clips"][0]["truth"]["key"] == json.loads(again)["clips"][0]["truth"]["key"]


def test_xlsx_template_round_trips(tmp_path, manifest):
    pytest.importorskip("openpyxl")
    xlsx = tmp_path / "t.xlsx"
    gt.write_template(str(xlsx), manifest)
    changed, problems = gt.import_file(str(xlsx), manifest, dry_run=True)
    assert not problems and len(changed) == 19


def test_excel_numeric_and_date_cells_are_accepted(tmp_path, manifest):
    openpyxl = pytest.importorskip("openpyxl")
    from datetime import datetime
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(gt.COLUMNS))
    ws.append(["TEST_007", 120.0, "4/4", "E", "minor", None, None, None, None, None, "wilbur",
               datetime(2026, 10, 20)])
    path = tmp_path / "filled.xlsx"
    wb.save(path)
    changed, problems = gt.import_file(str(path), manifest)
    assert not problems and changed["TEST_007"] == ["bpm", "time_signature", "key"]
    clip = truth_of(manifest, "TEST_007")
    assert clip["truth"]["bpm"] == 120.0 and clip["verified"] == {"by": "wilbur", "at": "2026-10-20"}


# ── import ─────────────────────────────────────────────────────────────────


def test_full_row_is_imported_in_manifest_format(tmp_path, manifest):
    changed, problems = run_import(tmp_path, manifest, [GOOD])
    assert not problems
    clip = truth_of(manifest, "TEST_007")
    t = clip["truth"]
    assert t["bpm"] == 119.5 and t["time_signature"] == "4/4" and t["key"] == "E minor"
    assert t["main_chord_progression"] == ["Em", "Am", "G", "D"]
    assert t["sections"] == [{"start": 0.0, "end": 8.0, "label": "intro"},
                             {"start": 8.0, "end": 20.0, "label": "verse"},
                             {"start": 20.0, "end": 32.0, "label": "chorus"}]
    assert t["passing_chords"] == [12.5, 21.0]
    assert t["fills"] == [{"start": 10.0, "end": 10.8}, 31.0]
    assert clip["verified"] == {"by": "wilbur", "at": "2026-10-20"} and clip["truth_notes"] == "capo 0"
    assert set(changed["TEST_007"]) == {"bpm", "time_signature", "key", "sections", "main_chord_progression",
                                        "passing_chords", "fills", "notes"}


def test_imported_manifest_still_loads_in_the_evaluation(tmp_path, manifest):
    run_import(tmp_path, manifest, [GOOD])
    clips = {c["id"]: c for c in ev.load_manifest(manifest)}
    assert clips["TEST_007"]["truth"]["bpm"] == 119.5
    assert "bpm" in ev.missing_truth(clips["TEST_008"])


def test_none_means_verified_empty_and_differs_from_blank(tmp_path, manifest):
    run_import(tmp_path, manifest, [{"clip_id": "TEST_008", "passing_chords": "none", "fills": "None",
                                     "verified_by": "wilbur"}])
    t = truth_of(manifest, "TEST_008")["truth"]
    assert t["passing_chords"] == [] and t["fills"] == []
    assert truth_of(manifest, "TEST_009")["truth"]["fills"] is None  # untouched clip: still unknown


def test_blank_cells_never_overwrite_existing_truth(tmp_path, manifest):
    run_import(tmp_path, manifest, [GOOD])
    run_import(tmp_path, manifest, [{"clip_id": "TEST_007", "bpm": "121", "verified_by": "wilbur"}])
    t = truth_of(manifest, "TEST_007")["truth"]
    assert t["bpm"] == 121.0 and t["key"] == "E minor" and t["main_chord_progression"] == ["Em", "Am", "G", "D"]


def test_dry_run_and_invalid_files_write_nothing(tmp_path, manifest):
    before = open(manifest, encoding="utf-8").read()
    changed, problems = run_import(tmp_path, manifest, [GOOD], dry_run=True)
    assert changed and not problems and open(manifest, encoding="utf-8").read() == before
    bad = {**GOOD, "clip_id": "TEST_008", "bpm": "9999"}
    changed, problems = run_import(tmp_path, manifest, [GOOD, bad])
    assert problems and changed == {}
    assert open(manifest, encoding="utf-8").read() == before  # the valid row was not imported either


# ── validation ─────────────────────────────────────────────────────────────


def errors_for(tmp_path, manifest, **cells):
    _, problems = run_import(tmp_path, manifest, [{"clip_id": "TEST_007", "verified_by": "wilbur", **cells}])
    return {(p["column"]): p["message"] for p in problems}


@pytest.mark.parametrize("value", ["abc", "20", "400", "-100", "12O"])
def test_bad_bpm_rejected(tmp_path, manifest, value):
    assert "bpm" in errors_for(tmp_path, manifest, bpm=value)


@pytest.mark.parametrize("value,ok", [("4/4", True), ("3 / 4", True), ("12/8", True), ("4/3", False),
                                      ("7/4", False), ("four four", False)])
def test_time_signature_validation(tmp_path, manifest, value, ok):
    assert ("time_signature" not in errors_for(tmp_path, manifest, time_signature=value)) is ok


@pytest.mark.parametrize("key,mode,expected", [
    ("A", "minor", "A minor"), ("F#m", "", "F#m".replace("F#m", "F# minor")), ("Bb", "major", "Bb major"),
    ("A minor", "", "A minor"), ("C maj", "major", "C major"), ("G major; E major", "", ["G major", "E major"]),
])
def test_valid_keys_are_normalised(key, mode, expected):
    assert gt.parse_key_cell(key, mode) == (expected, None)


@pytest.mark.parametrize("key,mode", [("A", ""), ("H", "major"), ("A minor", "major"), ("A", "dorian"),
                                      ("Ab#", "major"), ("G; E", "major"), ("", "")])
def test_invalid_keys_are_rejected(key, mode):
    value, error = gt.parse_key_cell(key, mode)
    assert value is None and error


def test_mode_without_key_is_an_error(tmp_path, manifest):
    assert "mode" in errors_for(tmp_path, manifest, mode="minor")


@pytest.mark.parametrize("text,expected", [
    ("Am F C G", ["Am", "F", "C", "G"]), ("Am - F - C - G", ["Am", "F", "C", "G"]),
    ("Am -> F -> C/E -> G", ["Am", "F", "C/E", "G"]), ("C, G, Am7, Fmaj7", ["C", "G", "Am7", "Fmaj7"]),
    ("Bb | Dm | Gsus4 | N", ["Bb", "Dm", "Gsus4", "N"]),
])
def test_chord_progression_notation_accepted(text, expected):
    assert gt.parse_progression(text) == (expected, None)


@pytest.mark.parametrize("text", ["Am H C", "am f c", "Cxyz G", "C/H", "H7", "", "Am Fm9b"])
def test_chord_progression_notation_rejected(text):
    value, error = gt.parse_progression(text)
    assert value is None and error


@pytest.mark.parametrize("text", ["0-12", "intro", "0 12 intro", "12-5 verse", "5-10 a; 8-20 b", "0-999 verse",
                                  "0:75-80 verse", "a-b intro"])
def test_bad_sections_rejected(text):
    value, error = gt.parse_sections(text, 30.0)
    assert value is None and error


def test_sections_accept_minutes_and_unsorted_input_is_an_error():
    ok, error = gt.parse_sections("0-0:30 intro; 0:30-1:00 verse", 61.0)
    assert error is None and ok[1] == {"start": 30.0, "end": 60.0, "label": "verse"}
    assert gt.parse_sections("30-60 verse; 0-30 intro", 61.0)[1]  # out of order


@pytest.mark.parametrize("text,allow_ranges,ok", [
    ("12.5; 0:31", False, True), ("10-11", True, True), ("10-11", False, False), ("abc", True, False),
    ("5; 99", True, False), ("11-10", True, False), ("none", False, True), ("", False, False),
])
def test_event_formats(text, allow_ranges, ok):
    value, error = gt.parse_events(text, 32.0, allow_ranges)
    assert (error is None) is ok


def test_dates_must_be_real_and_not_in_the_future(tmp_path, manifest):
    assert "verified_at" in errors_for(tmp_path, manifest, bpm="100", verified_at="20/10/2026")
    assert "verified_at" in errors_for(tmp_path, manifest, bpm="100", verified_at="2999-01-01")
    assert not errors_for(tmp_path, manifest, bpm="100", verified_at="2026-10-20")


def test_truth_without_verified_by_is_rejected_but_notes_alone_are_fine(tmp_path, manifest):
    _, problems = run_import(tmp_path, manifest, [{"clip_id": "TEST_007", "bpm": "100"}])
    assert [p["column"] for p in problems] == ["verified_by"]
    changed, problems = run_import(tmp_path, manifest, [{"clip_id": "TEST_007", "notes": "listen again"}])
    assert not problems and truth_of(manifest, "TEST_007")["truth_notes"] == "listen again"


def test_structural_problems_are_all_reported_together(tmp_path, manifest):
    rows = [{"clip_id": "TEST_999", "bpm": "100", "verified_by": "w"},
            {"clip_id": "TEST_007", "bpm": "x", "key": "Z", "verified_by": "w"},
            {"clip_id": "TEST_007", "verified_by": "w"}]
    _, problems = run_import(tmp_path, manifest, rows)
    found = {(p["where"].split()[1], p["column"]) for p in problems}
    assert ("2", "clip_id") in found and ("3", "bpm") in found and ("3", "key") in found
    assert ("4", "clip_id") in found  # duplicate


def test_unknown_or_missing_columns_are_reported(tmp_path, manifest):
    path = write_csv(tmp_path / "x.csv", [{"clip_id": "TEST_007", "tempo": "100"}], columns=("clip_id", "tempo"))
    _, problems = gt.import_file(path, manifest)
    assert any(p["column"] == "tempo" for p in problems)
    path = write_csv(tmp_path / "y.csv", [{"bpm": "100"}], columns=("bpm",))
    _, problems = gt.import_file(path, manifest)
    assert any(p["column"] == "clip_id" for p in problems)


def test_times_beyond_the_clip_length_are_rejected(tmp_path, manifest):
    errs = errors_for(tmp_path, manifest, passing_chords="500")  # TEST_007 is 32 s long
    assert "passing_chords" in errs and "end of the clip" in errs["passing_chords"]


def test_cli_reports_problems_and_exit_codes(tmp_path, manifest, capsys):
    bad = write_csv(tmp_path / "bad.csv", [{"clip_id": "TEST_007", "bpm": "nope", "verified_by": "w"}])
    assert gt.main([bad, "--manifest", manifest]) == 1
    err = capsys.readouterr().err
    assert "nothing was imported" in err and "row 2 (TEST_007) / bpm" in err
    good = write_csv(tmp_path / "good.csv", [GOOD])
    assert gt.main([good, "--manifest", manifest, "--dry-run"]) == 0
    assert "Would import TEST_007" in capsys.readouterr().out
    blank = write_csv(tmp_path / "blank.csv", [{"clip_id": "TEST_007"}])
    assert gt.main([blank, "--manifest", manifest]) == 0
    assert "nothing changed" in capsys.readouterr().out


# ── progression metrics ────────────────────────────────────────────────────


def seq(*chords):
    return [{"start": float(i), "end": i + 1.0, "chord": c} for i, c in enumerate(chords)]


def test_progression_found_allows_rotation_and_ignores_repeats_and_no_chord():
    est = seq("N", "C", "C", "G", "Am", "Am", "F", "C", "G", "Am", "F")
    s = m.progression_scores(est, ["Am", "F", "C", "G"])  # loop played from C: C G Am F
    assert s == {"progression_chord_recall": 1.0, "progression_found": 1.0}


def test_progression_not_found_when_order_differs_or_chord_missing():
    s = m.progression_scores(seq("C", "Am", "G", "F"), ["C", "G", "Am", "F"])
    assert s["progression_found"] == 0.0 and s["progression_chord_recall"] == 1.0
    s = m.progression_scores(seq("C", "G", "Am"), ["C", "G", "Am", "F"])
    assert s == {"progression_chord_recall": 0.75, "progression_found": 0.0}


def test_progression_missing_truth_or_prediction_is_not_scored():
    assert m.progression_scores(seq("C"), None) is None
    assert m.progression_scores(None, ["C"]) is None
    assert m.progression_scores(seq("C"), ["N"]) is None


# ── partial ground truth through the evaluation ────────────────────────────


def test_partial_truth_is_scored_only_where_present(tmp_path, manifest):
    run_import(tmp_path, manifest, [{"clip_id": "TEST_007", "bpm": "120", "main_chord_progression": "Em Am G D",
                                     "verified_by": "wilbur"}])
    clips = [c for c in ev.load_manifest(manifest) if c["id"] in ("TEST_007", "TEST_008")]
    clips_dir = tmp_path / "clips"
    clips_dir.mkdir()
    for c in clips:
        (clips_dir / c["audio"]).write_bytes(b"x")

    def runner(audio_path, scratch):
        return {"supports": sorted(ev.SUPPORTS["v2"]), "bpm": 140.0, "time_signature": "3/4", "key": "A minor",
                "beats": [], "downbeats": [], "chords": seq("Em", "Am", "G", "D")}

    result = ev.run_evaluation(clips, clips_dir=str(clips_dir), engines=["v2"], runners={"v2": runner},
                               out_dir=str(tmp_path / "out"), write=False)
    by_id = {c["id"]: c["engines"]["v2"]["metrics"] for c in result["clips"]}
    # TEST_007: BPM and progression truth exist (wrong BPM is scored as wrong); key truth is E minor
    assert by_id["TEST_007"]["bpm_within_1"] == 0.0 and by_id["TEST_007"]["progression_found"] == 1.0
    assert by_id["TEST_007"]["key_correct"] == 0.0
    # meter / chords / sections have no truth: skipped, not 0
    assert by_id["TEST_007"]["time_signature_correct"] is None and by_id["TEST_007"]["chord_root_acc"] is None
    # TEST_008 only has a key; its BPM and progression are skipped
    assert by_id["TEST_008"]["bpm_within_1"] is None and by_id["TEST_008"]["progression_found"] is None
    overall = result["overall"]["v2"]
    assert overall["bpm_within_1"] == {"mean": 0.0, "n": 1}
    assert overall["time_signature_correct"] == {"mean": None, "n": 0}
    assert result["missing_ground_truth"]["bpm"] == ["TEST_008"]
