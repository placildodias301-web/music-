"""Chord engine adapters (BTC, lv-chordia) and what they share."""

import threading
import time
from dataclasses import dataclass
from typing import Callable, TypeVar

from .. import errors
from ..errors import PipelineError
from ..rhythm import Heartbeat, estimated_pct

POLL_SECONDS = 0.5

T = TypeVar("T")


@dataclass
class RawChords:
    """An engine's own output: [{"start", "end", "chord"}, ...] with Harte labels, not yet validated."""
    engine: str
    segments: list


def run_with_heartbeat(work: Callable[[], T], *, name: str, timeout_seconds: float, heartbeat: Heartbeat,
                       expected_seconds: float) -> T:
    """
    Runs `work` (model load + inference) in a helper thread so the job keeps
    reporting progress and can give up at the chord/job timeout. Python cannot
    kill that thread, so on timeout it finishes in the background and its
    result is discarded. Exceptions from `work` are re-raised here unchanged.
    """
    outcome: dict = {}

    def run():
        try:
            outcome["value"] = work()
        except BaseException as e:  # handed to the waiting thread
            outcome["error"] = e

    worker = threading.Thread(target=run, name=name, daemon=True)
    started = time.monotonic()
    worker.start()
    while worker.is_alive():
        worker.join(POLL_SECONDS)
        elapsed = time.monotonic() - started
        if worker.is_alive():
            if elapsed > timeout_seconds:
                raise PipelineError(errors.CHORD_TIMEOUT,
                                    f"Chord recognition took longer than {int(timeout_seconds)} seconds and was stopped.")
            heartbeat(estimated_pct(elapsed, expected_seconds))  # may raise the job timeout
    if "error" in outcome:
        raise outcome["error"]
    return outcome["value"]
