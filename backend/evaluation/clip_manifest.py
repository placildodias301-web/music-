"""
Copies the reference clips into backend/evaluation/clips/ and writes clip_manifest.json,
which maps each stable evaluation ID (TEST_001 ...) to the file it came from.

    python -m evaluation.clip_manifest --source "C:\\Users\\wilbu\\OneDrive\\Desktop\\Analysis_demo folder"

The source folder is only read: files are copied, never moved, renamed or deleted, and
the copies keep their original file names. The clips folder is git-ignored; the manifest
(names, paths, checksums, no audio) is committed.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from typing import Optional, Sequence

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(BACKEND_DIR)
DEFAULT_CLIPS_DIR = os.path.join(HERE, "clips")
DEFAULT_CLIP_MANIFEST = os.path.join(HERE, "clip_manifest.json")
DEFAULT_REFERENCE = os.path.join(HERE, "reference_clips.json")

MEDIA_EXTENSIONS = (".mp4", ".m4a", ".mp3", ".wav", ".mov", ".webm", ".mkv", ".flac", ".ogg")
_ID = re.compile(r"^(TEST_\d{3})(?![0-9])", re.IGNORECASE)


class ClipManifestError(Exception):
    pass


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def reference_ids(reference_path: str = DEFAULT_REFERENCE) -> list[str]:
    with open(reference_path, encoding="utf-8") as f:
        return [c["id"] for c in json.load(f)["clips"]]


def load_clip_manifest(path: str = DEFAULT_CLIP_MANIFEST) -> dict:
    """{} when the file does not exist (the evaluator then falls back to reference_clips.json names)."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def find_sources(source_dir: str, ids: Sequence[str]) -> dict[str, str]:
    """
    {clip ID: file name} for the clips in `source_dir`, matched by the TEST_NNN prefix of the file name.
    Other files (spreadsheets, notes) are ignored. Raises if an ID has no file or two files.
    """
    if not os.path.isdir(source_dir):
        raise ClipManifestError(f"source folder not found: {source_dir}")
    found: dict[str, list[str]] = {}
    for name in sorted(os.listdir(source_dir)):
        m = _ID.match(name)
        if m and name.lower().endswith(MEDIA_EXTENSIONS) and os.path.isfile(os.path.join(source_dir, name)):
            found.setdefault(m.group(1).upper(), []).append(name)
    problems = [f"{i}: no media file named {i}.*" for i in ids if i not in found]
    problems += [f"{i}: several files match ({', '.join(names)})" for i, names in found.items()
                 if len(names) > 1 and i in ids]
    if problems:
        raise ClipManifestError("cannot map every reference clip:\n  " + "\n  ".join(problems))
    return {i: found[i][0] for i in ids}


def _posix(path: str) -> str:
    return os.path.abspath(path).replace("\\", "/")


def _repo_relative(path: str) -> str:
    try:
        return os.path.relpath(os.path.abspath(path), REPO_DIR).replace("\\", "/")
    except ValueError:  # different drive
        return _posix(path)


def build_manifest(source_dir: str, dest_dir: str = DEFAULT_CLIPS_DIR, ids: Optional[Sequence[str]] = None,
                   overwrite: bool = False) -> dict:
    """
    Copies each clip (shutil.copy2) into dest_dir and returns the manifest dict. A copy that
    already exists with identical content is left alone; a different file there is an error
    unless overwrite=True (only the copy is ever replaced - never the source).
    """
    ids = list(ids if ids is not None else reference_ids())
    sources = find_sources(source_dir, ids)
    os.makedirs(dest_dir, exist_ok=True)
    manifest = {}
    for clip_id in sorted(sources):
        name = sources[clip_id]
        src, dst = os.path.join(source_dir, name), os.path.join(dest_dir, name)
        digest = sha256_file(src)
        if os.path.exists(dst) and sha256_file(dst) != digest:
            if not overwrite:
                raise ClipManifestError(f"{dst} already exists and differs from the source; "
                                        "use --overwrite to replace the copy")
        if not os.path.exists(dst) or sha256_file(dst) != digest:
            shutil.copy2(src, dst)
        manifest[clip_id] = {
            "original_filename": name,
            "source_path": _posix(src),
            "copied_path": _repo_relative(dst),
            "sha256": digest,
            "size_bytes": os.path.getsize(src),
        }
    return manifest


def write_manifest(manifest: dict, path: str = DEFAULT_CLIP_MANIFEST) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


def clip_filename(clip: dict, clip_manifest: dict) -> str:
    """The file name to look for in a clips folder: the manifest's, else the one in reference_clips.json."""
    entry = clip_manifest.get(clip["id"])
    return entry["original_filename"] if entry else clip["audio"]


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(prog="python -m evaluation.clip_manifest", description=__doc__.split("\n\n")[0])
    p.add_argument("--source", required=True, help="folder holding the original clips (read only)")
    p.add_argument("--dest", default=DEFAULT_CLIPS_DIR, help="where the copies go (default: evaluation/clips)")
    p.add_argument("--manifest", default=DEFAULT_CLIP_MANIFEST)
    p.add_argument("--reference", default=DEFAULT_REFERENCE, help="reference_clips.json (the list of IDs)")
    p.add_argument("--overwrite", action="store_true", help="replace a copy that differs from its source")
    args = p.parse_args(argv)
    try:
        manifest = build_manifest(args.source, args.dest, reference_ids(args.reference), args.overwrite)
    except ClipManifestError as e:
        print(e, file=sys.stderr)
        return 1
    write_manifest(manifest, args.manifest)
    print(f"Copied/verified {len(manifest)} clips in {args.dest}; wrote {args.manifest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
