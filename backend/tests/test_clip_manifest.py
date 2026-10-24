"""
Clip copy + manifest workflow (backend/evaluation/clip_manifest.py): manifest generation,
the default clips directory, the evaluator finding copied clips, and the ground-truth CSV
agreeing with the same TEST IDs. Offline; uses small fake files.
"""

import csv
import hashlib
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evaluation import clip_manifest as cm  # noqa: E402
from evaluation import import_ground_truth as gt  # noqa: E402
from evaluation import run_evaluation as ev  # noqa: E402

IDS = [f"TEST_{i:03d}" for i in range(1, 21)]


def make_source(tmp_path, names=None, extra=True):
    src = tmp_path / "Analysis demo folder"  # a space, like the real folder
    src.mkdir()
    for i, clip_id in enumerate(IDS):
        name = (names or {}).get(clip_id, f"{clip_id}.mp4")
        (src / name).write_bytes(f"audio-{i}".encode() * 50)
    if extra:  # things that live next to the clips and must be ignored
        (src / "Truth_Table.xlsx").write_bytes(b"x")
        (src / "analyze_all.py").write_bytes(b"x")
        (src / "analysis").mkdir()
    return src


def snapshot(folder):
    return {n: hashlib.sha256((folder / n).read_bytes()).hexdigest() for n in sorted(os.listdir(folder))
            if (folder / n).is_file()}


# ── manifest generation ────────────────────────────────────────────────────


def test_build_manifest_copies_and_maps_every_clip(tmp_path):
    src, dest = make_source(tmp_path), tmp_path / "clips"
    manifest = cm.build_manifest(str(src), str(dest), IDS)
    assert list(manifest) == IDS
    first = manifest["TEST_001"]
    assert first["original_filename"] == "TEST_001.mp4"
    assert first["source_path"].endswith("Analysis demo folder/TEST_001.mp4") and "\\" not in first["source_path"]
    assert first["copied_path"].endswith("clips/TEST_001.mp4") and "\\" not in first["copied_path"]
    assert first["sha256"] == hashlib.sha256((dest / "TEST_001.mp4").read_bytes()).hexdigest()
    assert first["size_bytes"] == (src / "TEST_001.mp4").stat().st_size
    assert sorted(os.listdir(dest)) == [f"{i}.mp4" for i in IDS]  # only the 20 clips, names unchanged


def test_originals_are_copied_not_moved_or_modified(tmp_path):
    src, dest = make_source(tmp_path), tmp_path / "clips"
    before = snapshot(src)
    mtimes = {n: (src / n).stat().st_mtime for n in before}
    cm.build_manifest(str(src), str(dest), IDS)
    assert snapshot(src) == before
    assert {n: (src / n).stat().st_mtime for n in before} == mtimes
    assert snapshot(dest) == {k: v for k, v in before.items() if k.startswith("TEST_")}


def test_rerun_is_idempotent_and_never_overwrites_a_different_copy_silently(tmp_path):
    src, dest = make_source(tmp_path), tmp_path / "clips"
    first = cm.build_manifest(str(src), str(dest), IDS)
    assert cm.build_manifest(str(src), str(dest), IDS) == first
    (dest / "TEST_003.mp4").write_bytes(b"tampered")
    with pytest.raises(cm.ClipManifestError, match="already exists and differs"):
        cm.build_manifest(str(src), str(dest), IDS)
    assert (dest / "TEST_003.mp4").read_bytes() == b"tampered"
    cm.build_manifest(str(src), str(dest), IDS, overwrite=True)
    assert (dest / "TEST_003.mp4").read_bytes() == (src / "TEST_003.mp4").read_bytes()


def test_missing_and_duplicate_clips_are_reported_together(tmp_path):
    src = make_source(tmp_path)
    os.remove(src / "TEST_005.mp4")
    os.remove(src / "TEST_009.mp4")
    (src / "TEST_012.m4a").write_bytes(b"dup")
    with pytest.raises(cm.ClipManifestError) as e:
        cm.build_manifest(str(src), str(tmp_path / "clips"), IDS)
    text = str(e.value)
    assert "TEST_005" in text and "TEST_009" in text and "TEST_012: several files" in text
    assert not (tmp_path / "clips").exists()  # nothing copied when the mapping is incomplete


def test_other_original_names_map_by_id_prefix(tmp_path):
    src = make_source(tmp_path, names={"TEST_002": "TEST_002_brunch.MP4"})
    assert cm.find_sources(str(src), IDS)["TEST_002"] == "TEST_002_brunch.MP4"
    assert cm.find_sources(str(src), ["TEST_001"]) == {"TEST_001": "TEST_001.mp4"}  # only the requested IDs


def test_cli_writes_manifest(tmp_path, capsys):
    src = make_source(tmp_path)
    out = tmp_path / "clip_manifest.json"
    assert cm.main(["--source", str(src), "--dest", str(tmp_path / "c"), "--manifest", str(out)]) == 0
    assert list(json.loads(out.read_text(encoding="utf-8"))) == IDS
    assert cm.main(["--source", str(tmp_path / "nope"), "--manifest", str(out)]) == 1
    assert "source folder not found" in capsys.readouterr().err


# ── default clips directory ────────────────────────────────────────────────


def test_default_clips_dir_is_evaluation_clips(monkeypatch):
    monkeypatch.delenv("WILSIFY_CLIPS_DIR", raising=False)
    expected = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "evaluation", "clips")
    assert os.path.normpath(cm.DEFAULT_CLIPS_DIR) == os.path.normpath(expected)
    assert ev.build_parser().parse_args([]).clips_dir == cm.DEFAULT_CLIPS_DIR


def test_clips_dir_precedence_flag_over_env_over_default(monkeypatch):
    monkeypatch.setenv("WILSIFY_CLIPS_DIR", "/from/env")
    assert ev.build_parser().parse_args([]).clips_dir == "/from/env"
    assert ev.build_parser().parse_args(["--clips-dir", "/from/flag"]).clips_dir == "/from/flag"


def test_clips_and_reports_are_git_ignored():
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    lines = {line.strip() for line in open(os.path.join(root, ".gitignore"), encoding="utf-8")}
    assert {"backend/evaluation/clips/", "backend/evaluation/reports/"} <= lines


# ── evaluator finds the copied clips ───────────────────────────────────────


def fake_runner(audio_path, scratch):
    assert os.path.isfile(audio_path)
    return {"supports": sorted(ev.SUPPORTS["v2"]), "bpm": 100.0, "time_signature": "4/4", "key": "C Major",
            "beats": [], "downbeats": [], "chords": []}


def test_cli_with_default_dir_finds_the_copied_clips(tmp_path, monkeypatch, capsys):
    default_dir = tmp_path / "evaluation_clips"
    cm.build_manifest(str(make_source(tmp_path)), str(default_dir), IDS)
    monkeypatch.delenv("WILSIFY_CLIPS_DIR", raising=False)
    monkeypatch.setattr(ev, "DEFAULT_CLIPS_DIR", str(default_dir))
    monkeypatch.setattr(ev, "run_v2", fake_runner)
    # no --clips-dir: the parser default (the patched evaluation/clips) must be used
    code = ev.main(["--engines", "v2", "--out-dir", str(tmp_path / "out")])
    assert code == 0 and "Evaluated 20/20 clips (0 skipped)" in capsys.readouterr().out


def test_evaluator_finds_clips_through_the_manifest_names(tmp_path):
    src = make_source(tmp_path, names={"TEST_002": "TEST_002_brunch.mp4"})
    dest = tmp_path / "clips"
    manifest = cm.build_manifest(str(src), str(dest), IDS)
    clips = ev.load_manifest(ev.DEFAULT_MANIFEST)  # reference_clips.json still says TEST_002.mp4
    result = ev.run_evaluation(clips, clips_dir=str(dest), engines=["v2"], runners={"v2": fake_runner},
                               out_dir=str(tmp_path / "out"), write=False, clip_names=manifest)
    assert result["summary"] == {"clips_total": 20, "clips_run": 20, "clips_skipped": 0}
    # without the manifest the renamed clip is reported as skipped, not as a crash
    result = ev.run_evaluation(clips, clips_dir=str(dest), engines=["v2"], runners={"v2": fake_runner},
                               out_dir=str(tmp_path / "out"), write=False)
    assert result["summary"]["clips_skipped"] == 1


def test_missing_clips_dir_explains_how_to_copy_them(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("WILSIFY_CLIPS_DIR", raising=False)
    assert ev.main(["--clips-dir", str(tmp_path / "none"), "--out-dir", str(tmp_path)]) == 2
    assert "evaluation.clip_manifest --source" in capsys.readouterr().err


# ── the committed files agree on the IDs ───────────────────────────────────


def test_committed_manifest_reference_clips_and_ground_truth_csv_use_the_same_ids():
    manifest = cm.load_clip_manifest()
    with open(cm.DEFAULT_REFERENCE, encoding="utf-8") as f:
        reference = [c["id"] for c in json.load(f)["clips"]]
    with open(gt.DEFAULT_CSV, encoding="utf-8-sig", newline="") as f:
        csv_ids = [r["clip_id"] for r in csv.DictReader(f)]
    assert reference == IDS
    assert list(manifest) == IDS
    assert csv_ids == IDS


def test_committed_manifest_entries_are_well_formed():
    for clip_id, e in cm.load_clip_manifest().items():
        assert e["original_filename"].upper().startswith(clip_id)
        assert e["copied_path"] == f"backend/evaluation/clips/{e['original_filename']}"
        assert e["source_path"].endswith("/" + e["original_filename"])
        assert len(e["sha256"]) == 64 and e["size_bytes"] > 0


def test_local_copies_match_the_manifest_when_present():
    """Skipped on a fresh checkout (the clips are git-ignored); on this machine it catches a stale or corrupted copy."""
    manifest = cm.load_clip_manifest()
    missing = [i for i, e in manifest.items()
               if not os.path.isfile(os.path.join(cm.DEFAULT_CLIPS_DIR, e["original_filename"]))]
    if missing:
        pytest.skip("evaluation/clips not populated (run python -m evaluation.clip_manifest --source <folder>)")
    for clip_id, e in manifest.items():
        path = os.path.join(cm.DEFAULT_CLIPS_DIR, e["original_filename"])
        assert os.path.getsize(path) == e["size_bytes"], clip_id
        assert cm.sha256_file(path) == e["sha256"], clip_id
