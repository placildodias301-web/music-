"""
Photo / scan of printed sheet music -> MusicXML (optical music recognition).

Runs homr (https://github.com/liebharc/homr, AGPL-3.0, ONNX models downloaded on first use) in a child process: it is
CPU-heavy, prints a lot, and a crash in it must not take the API down. One scan at a time.
"""

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading

logger = logging.getLogger(__name__)

SCAN_TIMEOUT_SECONDS = 15 * 60  # first run also downloads the models
_scan_lock = threading.Lock()


class SheetScanError(Exception):
    """User-safe error - the message is shown in the UI as-is."""


def _homr_command(image_path: str) -> list[str]:
    exe = shutil.which("homr") or os.path.join(os.path.dirname(sys.executable), "homr.exe" if os.name == "nt" else "homr")
    if os.path.exists(exe):
        return [exe, image_path]
    return [sys.executable, "-c", "from homr.main import main; main()", image_path]


def scan(image_path: str) -> str:
    """Reads one image (png/jpg/webp/bmp/tiff) and returns MusicXML text."""
    try:
        import homr  # noqa: F401
    except ImportError:
        raise ImportError("homr is not installed")
    with tempfile.TemporaryDirectory(prefix="wilsify_omr_") as work:
        ext = os.path.splitext(image_path)[1].lower() or ".png"
        local = os.path.join(work, f"page{ext}")
        shutil.copyfile(image_path, local)
        with _scan_lock:
            try:
                proc = subprocess.run(
                    _homr_command(local), cwd=work, capture_output=True, text=True, timeout=SCAN_TIMEOUT_SECONDS,
                )
            except subprocess.TimeoutExpired:
                raise SheetScanError("Reading that page took too long. Try a smaller, sharper photo of one page.")
        out = os.path.join(work, "page.musicxml")
        if proc.returncode != 0 or not os.path.exists(out):
            logger.error("homr failed (%s): %s", proc.returncode, (proc.stderr or proc.stdout)[-1500:])
            raise SheetScanError("Couldn't find any music in that picture. Use a straight, well-lit photo of one page of printed notes.")
        with open(out, encoding="utf-8") as f:
            xml = f.read()
    if "<note" not in xml:
        raise SheetScanError("Couldn't find any notes in that picture. Use a straight, well-lit photo of one page of printed notes.")
    return xml
