"""
Runs inside WSL2 (or any Python that has allin1 installed). The backend pipes
this file to `python3 - <audio> <out.json> <work_dir>`; it never imports the
backend, so it only needs allin1 and the standard library there.

It writes {"ok": false, "error": "running"} first, so the backend can tell
"Python never started" (no file) from "crashed while analysing" (file still
says running), then replaces it with the result or a classified error.
"""

import json
import os
import sys
import traceback


def write(path, payload):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f)
    os.replace(tmp, path)


def main():
    audio_path, out_path, work_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    write(out_path, {"ok": False, "error": "running"})
    try:
        import allin1
    except ImportError as e:
        write(out_path, {"ok": False, "error": "missing", "message": str(e)})
        return 3

    try:
        # demix_dir/spec_dir default to ./demix and ./spec; keep them inside the job folder.
        result = allin1.analyze(
            audio_path,
            demix_dir=os.path.join(work_dir, "demix"),
            spec_dir=os.path.join(work_dir, "spec"),
            keep_byproducts=False,
        )
        if isinstance(result, list):
            result = result[0]
        payload = {
            "ok": True,
            "version": getattr(allin1, "__version__", None),
            "bpm": None if result.bpm is None else float(result.bpm),
            "beats": [float(t) for t in result.beats],
            "downbeats": [float(t) for t in result.downbeats],
            "beat_positions": [int(p) for p in result.beat_positions],
            "segments": [
                {"start": float(s.start), "end": float(s.end), "label": str(s.label)}
                for s in result.segments
            ],
        }
    except Exception as e:  # report every failure as data; the backend decides what the user sees
        traceback.print_exc()
        write(out_path, {"ok": False, "error": "failed", "message": "%s: %s" % (type(e).__name__, e)})
        return 4
    write(out_path, payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
