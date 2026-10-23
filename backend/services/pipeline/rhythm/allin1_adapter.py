"""
All-In-One (allin1) adapter: beats, downbeats, BPM and labelled song sections.

allin1 needs NATTEN and madmom, which don't install cleanly on native
Windows, so it runs in a separate Python, normally inside WSL2:

    PIPELINE_WSL_COMMAND="wsl.exe -d Ubuntu -- /home/<you>/allin1-env/bin/python"

allin1_runner.py is piped to that Python's stdin, so nothing has to be
copied into WSL. The subprocess can always be killed, so unlike the in-process
stages, a timeout here stops the work immediately.
"""

import json
import logging
import os
import re
import shlex
import shutil
import subprocess
import time

from .. import errors
from ..errors import PipelineError
from . import Heartbeat, RawRhythm, estimated_pct

logger = logging.getLogger(__name__)

RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "allin1_runner.py")
POLL_SECONDS = 1.0


def parse_command(command: str) -> list[str]:
    # Forward slashes only: shlex treats backslashes as escapes.
    return shlex.split(command)


def is_wsl(argv: list[str]) -> bool:
    return bool(argv) and os.path.basename(argv[0]).lower() in ("wsl", "wsl.exe")


def to_wsl_path(path: str) -> str:
    """C:\\Users\\me\\a.wav -> /mnt/c/Users/me/a.wav (WSL's default automount)."""
    m = re.match(r"^([A-Za-z]):[\\/](.*)$", os.path.abspath(path))
    if not m:
        raise PipelineError(errors.WSL_UNAVAILABLE,
                            "The job folder is not on a drive letter, so WSL2 cannot read it.")
    return f"/mnt/{m.group(1).lower()}/" + m.group(2).replace("\\", "/")


def engine_label(argv: list[str]) -> str:
    return "allin1@wsl2" if is_wsl(argv) else "allin1@native"


def analyze(stem_path: str, work_dir: str, *, command: str, timeout_seconds: float,
            heartbeat: Heartbeat, expected_seconds: float = 120.0) -> RawRhythm:
    argv = parse_command(command)
    if not argv or shutil.which(argv[0]) is None:
        raise PipelineError(errors.WSL_UNAVAILABLE,
                            f"Could not find '{argv[0] if argv else command}' to start allin1 "
                            "(check PIPELINE_WSL_COMMAND).")
    os.makedirs(work_dir, exist_ok=True)
    out_path = os.path.join(work_dir, "allin1.json")
    translate = to_wsl_path if is_wsl(argv) else os.path.abspath
    cmd = argv + ["-", translate(stem_path), translate(out_path), translate(work_dir)]

    with open(RUNNER, "rb") as f:
        script = f.read()
    started = time.monotonic()
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as e:
        raise PipelineError(errors.WSL_UNAVAILABLE, f"Could not start allin1 through WSL2 ({e.strerror or e}).")

    try:
        proc.stdin.write(script)
        proc.stdin.close()
    except OSError:
        pass  # the process already exited; its exit code and output say why
    try:
        while True:
            try:
                _, stderr = proc.communicate(timeout=POLL_SECONDS)
                break
            except subprocess.TimeoutExpired:
                elapsed = time.monotonic() - started
                if elapsed > timeout_seconds:
                    raise PipelineError(errors.RHYTHM_TIMEOUT,
                                        f"allin1 took longer than {int(timeout_seconds)} seconds and was stopped.")
                heartbeat(estimated_pct(elapsed, expected_seconds))  # may raise the job timeout
    except BaseException:
        proc.kill()
        proc.communicate()
        raise

    tail = stderr.decode("utf-8", "replace").replace("\x00", "")[-2000:]
    try:
        with open(out_path, encoding="utf-8") as f:
            payload = json.load(f)
    except FileNotFoundError:
        # The runner writes this file before anything else, so WSL or its Python never got going.
        logger.warning("allin1 runner never started (exit %s): %s", proc.returncode, tail)
        raise PipelineError(errors.WSL_UNAVAILABLE,
                            "WSL2 or its Python could not be started for allin1 (check PIPELINE_WSL_COMMAND).")
    except ValueError:
        logger.warning("allin1 runner wrote unreadable output (exit %s): %s", proc.returncode, tail)
        raise PipelineError(errors.INVALID_RHYTHM_RESULT, "allin1 returned output that could not be read.")

    if not payload.get("ok"):
        kind = payload.get("error")
        logger.warning("allin1 failed (%s, exit %s): %s | %s", kind, proc.returncode, payload.get("message"), tail)
        if kind == "missing":
            raise PipelineError(errors.RHYTHM_ENGINE_MISSING,
                                "allin1 is not installed in the WSL2 Python (pip install allin1 there).")
        if kind == "running":
            raise PipelineError(errors.ALLIN1_FAILED, "allin1 stopped unexpectedly (possibly out of memory).")
        raise PipelineError(errors.ALLIN1_FAILED, "allin1 could not analyse this audio.")

    try:
        return RawRhythm(
            engine=engine_label(argv),
            bpm=payload.get("bpm"),
            beats=list(payload["beats"]),
            downbeats=list(payload["downbeats"]),
            sections=[{"start": s["start"], "end": s["end"], "label": s["label"]} for s in payload.get("segments", [])],
        )
    except (KeyError, TypeError) as e:
        logger.warning("allin1 output is missing fields: %r", e)
        raise PipelineError(errors.INVALID_RHYTHM_RESULT, "allin1 returned an incomplete result.")
