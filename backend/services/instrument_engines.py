"""
Universal performance transcription: any instrument (or a whole band) -> sheet music.

  1. stems      Demucs htdemucs_6s splits vocals / drums / bass / guitar / piano / other.
  2. detection  the user's hint, or stem levels + a timbre profile (spectral centroid,
                attack time, sustain, pitch range, polyphony) pick the instrument(s).
  3. notes      polyphonic instruments: Basic Pitch + CQT verification (guitar_tab);
                one-note-at-a-time instruments: Basic Pitch kept where pYIN agrees.
  4. arrange    per-instrument rules on beat-quantized notes: piano hands / voices /
                fingering / dynamics / pedal; strings on string + fret (TAB) or
                position + bowing; wind slurs and staccato.
  5. write      score_writer -> MusicXML; one part per instrument in ensemble mode.

Arranging is deterministic from the plain notes, so a transposed sheet is re-arranged
(strings re-solved, fingering recomputed) instead of having its pitches shifted.
Everything is a draft: the detection and the rules are heuristics, stated as such.
"""

import logging
import math
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

from services import guitar_tab
from services.guitar_tab import BASS, CELLO, GUITAR, UKULELE, VIOLIN, StringSpec

logger = logging.getLogger(__name__)

HINTS = ("auto", "guitar", "piano", "bass", "violin", "ukulele", "brass_wind", "vocals", "ensemble")


@dataclass(frozen=True)
class Engine:
    key: str
    label: str
    kind: str  # piano | string | wind | vocal
    program: int  # General MIDI, 1-based
    midi_range: tuple[int, int]
    clefs: list = field(default_factory=lambda: [("G", 2, 0)])
    spec: Optional[StringSpec] = None


ENGINES = {e.key: e for e in (
    Engine("piano", "Acoustic Grand Piano (Grand Staff)", "piano", 1, (21, 108), [("G", 2, 0), ("F", 4, 0)]),
    Engine("guitar", GUITAR.label, "string", GUITAR.program, (GUITAR.lowest, 88), [GUITAR.clef], GUITAR),
    Engine("bass", BASS.label, "string", BASS.program, (BASS.lowest, 67), [BASS.clef], BASS),
    Engine("ukulele", UKULELE.label, "string", UKULELE.program, (UKULELE.lowest, 84), [UKULELE.clef], UKULELE),
    Engine("violin", "Violin (positions + bowing)", "string", VIOLIN.program, (VIOLIN.lowest, 100), [VIOLIN.clef], VIOLIN),
    Engine("cello", "Cello (positions + bowing)", "string", CELLO.program, (CELLO.lowest, 76), [CELLO.clef], CELLO),
    Engine("trumpet", "Trumpet (concert pitch)", "wind", 57, (52, 84)),
    Engine("alto_sax", "Alto Saxophone (concert pitch)", "wind", 66, (49, 81)),
    Engine("tenor_sax", "Tenor Saxophone (concert pitch)", "wind", 67, (44, 77), [("G", 2, -1)]),
    Engine("flute", "Flute", "wind", 74, (59, 98)),
    Engine("vocals", "Vocals (Lead Sheet)", "vocal", 53, (40, 88)),
)}

# Stems that carry each hinted instrument (Demucs files a solo instrument where it can).
HINT_STEMS = {
    "guitar": ("guitar", "bass", "other"), "ukulele": ("guitar", "other"), "piano": ("piano", "other"),
    "bass": ("bass",), "violin": ("other", "guitar"), "brass_wind": ("other",), "vocals": ("vocals",),
}
ACTIVE_DB = -20.0  # a stem this loud relative to the mix holds an instrument
ENSEMBLE_GAP_DB = 9.0  # auto mode writes an ensemble when the 2nd stem is within this of the 1st
MAX_PARTS = 5
# Score order, top to bottom: melody, keys / guitar, bowed strings, bass.
PART_RANK = {"vocals": 0, "trumpet": 1, "alto_sax": 1, "tenor_sax": 1, "flute": 1, "piano": 2, "guitar": 2,
             "ukulele": 2, "violin": 3, "cello": 3, "bass": 4}
BLACK_KEYS = {1, 3, 6, 8, 10}
PIANO_FINGER_NAMES = {1: "1 (Thumb)", 2: "2 (Index)", 3: "3 (Middle)", 4: "4 (Ring)", 5: "5 (Pinky)"}
STRING_FINGER_NAMES = {0: "Open (0)", 1: "Index (1)", 2: "Middle (2)", 3: "Ring (3)", 4: "Pinky (4)"}
DYNAMIC_STEPS = ((0.25, "pp"), (0.35, "p"), (0.45, "mp"), (0.6, "mf"), (0.75, "f"), (math.inf, "ff"))


# ── detection ──────────────────────────────────────────────────────────────

def profile_signal(y: np.ndarray, sr: int, notes: list[dict]) -> dict:
    """Timbre and playing profile of one signal: what the instrument rules decide on."""
    import librosa

    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = y.mean(axis=0)
    y22 = librosa.resample(y, orig_sr=sr, target_sr=22050) if sr != 22050 else y
    hop = 512
    rms = librosa.feature.rms(y=y22, hop_length=hop)[0]
    loud = rms > 0.1 * (rms.max() if len(rms) else 0)
    centroid = librosa.feature.spectral_centroid(y=y22, sr=22050, hop_length=hop)[0]
    centroid_hz = float(np.median(centroid[loud])) if loud.any() else 0.0

    attacks, sustains = [], []
    window, later = int(0.15 * 22050 / hop) + 1, int(0.25 * 22050 / hop)
    for f in librosa.onset.onset_detect(y=y22, sr=22050, hop_length=hop):
        seg = rms[f:f + window]
        if not len(seg) or seg.max() <= 0:
            continue
        k = int(np.argmax(seg))
        attacks.append(k * hop / 22050 * 1000)
        after = f + k + later
        if after < len(rms):
            sustains.append(float(rms[after] / seg[k]))

    pitches = np.array([n["midi"] for n in notes], dtype=float)
    starts = [n["start"] for n in notes]
    polyphony = (
        float(np.mean([sum(1 for m in notes if m["start"] <= t < m["end"]) for t in starts])) if notes else 0.0
    )
    median = float(np.median(pitches)) if len(pitches) else 60.0
    f0 = 440.0 * 2 ** ((median - 69) / 12)
    return {
        "centroidHz": round(centroid_hz, 1),
        "harmonicRatio": round(centroid_hz / f0, 2) if f0 > 0 else 0.0,
        "attackMs": round(float(np.median(attacks)), 1) if attacks else 0.0,
        "sustain": round(float(np.median(sustains)), 3) if sustains else 0.0,
        "medianMidi": median,
        "lowMidi": float(np.percentile(pitches, 5)) if len(pitches) else median,
        "highMidi": float(np.percentile(pitches, 95)) if len(pitches) else median,
        "polyphony": round(polyphony, 2),
        "noteCount": len(notes),
    }


def _wind_engine(p: dict) -> str:
    if p["medianMidi"] >= 67 and p["harmonicRatio"] < 2.5:
        return "flute"  # few overtones, high: a flute's near-sine tone
    if p["harmonicRatio"] >= 5.0:
        return "trumpet"  # brightest of the three
    return "alto_sax" if p["medianMidi"] >= 62 else "tenor_sax"


def _bowed_engine(p: dict) -> str:
    return "violin" if p["medianMidi"] >= 55 else "cello"


def classify(p: dict, stem: Optional[str] = None) -> str:
    """Engine key for a profile (plus the Demucs stem it came from, when known)."""
    plucked = p["sustain"] < 0.45 and p["attackMs"] < 40
    if stem == "vocals":
        return "vocals"
    if stem == "piano":
        return "piano"
    if stem == "bass":
        return "bass" if plucked or p["medianMidi"] < 43 else "cello"
    if stem == "guitar":
        return "ukulele" if p["lowMidi"] >= 58 and p["medianMidi"] >= 64 else "guitar"
    if plucked:
        if p["medianMidi"] < 43:
            return "bass"
        if p["lowMidi"] >= 58 and p["highMidi"] <= 84 and p["medianMidi"] >= 64:
            return "ukulele"
        if p["highMidi"] - p["lowMidi"] >= 30 or p["lowMidi"] < 40:
            return "piano"
        return "guitar"
    if p["polyphony"] >= 1.6:
        return "piano" if p["highMidi"] - p["lowMidi"] >= 24 else _bowed_engine(p)
    if p["medianMidi"] < 50 or p["attackMs"] >= 80:
        return _bowed_engine(p)  # slow bow attack, or too low for a wind
    return _wind_engine(p)


def _resolve_hint(hint: str, p: dict) -> str:
    if hint == "violin":
        return _bowed_engine(p)
    if hint == "brass_wind":
        return _wind_engine(p)
    return hint


# ── transcription ──────────────────────────────────────────────────────────

def _onset_strengths(y: np.ndarray, sr: int, times: list[float]) -> list[float]:
    import librosa

    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=256)
    if not len(env):
        return [0.0] * len(times)
    fr = [int(np.clip(round(t * sr / 256), 0, len(env) - 1)) for t in times]
    return [float(env[max(0, f - 1):f + 2].max()) for f in fr]


def transcribe_monophonic(y: np.ndarray, sr: int, midi_range: tuple[int, int], filter_talk: bool = False) -> list[dict]:
    """One-note-at-a-time line (voice, trumpet, sax, flute) with each note's attack strength and level."""
    import soundfile as sf

    from services.sheet_generation import transcribe_melody

    path = os.path.join(tempfile.gettempdir(), f"wilsify-mono-{uuid.uuid4().hex}.wav")
    try:
        sf.write(path, y, sr, subtype="PCM_16")
        melody = transcribe_melody(path, midi_range=midi_range, filter_talk=filter_talk)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    onsets = _onset_strengths(y, sr, [s for s, _, _ in melody])
    peak = max(onsets) if onsets and max(onsets) > 0 else 1.0
    return [
        {"start": s, "end": e, "midi": p, "onset": o, "velocity": round(0.3 + 0.6 * o / peak, 3)}
        for (s, e, p), o in zip(melody, onsets)
    ]


def _limit_polyphony(notes: list[dict], voices: int) -> list[dict]:
    """Keeps the `voices` loudest notes of every simultaneous slice (bowed strings: double stops)."""
    out, slice_ = [], []
    for n in sorted(notes, key=lambda n: n["start"]) + [None]:
        if n is not None and slice_ and n["start"] - slice_[0]["start"] <= guitar_tab.SIMULTANEOUS_S:
            slice_.append(n)
            continue
        out.extend(sorted(slice_, key=lambda m: -m.get("velocity", 0))[:voices])
        slice_ = [n] if n is not None else []
    return out


def transcribe_for(engine: str, y: np.ndarray, sr: int, poly_notes: Optional[list[dict]] = None) -> list[dict]:
    info = ENGINES[engine]
    lo, hi = info.midi_range
    if info.kind in ("wind", "vocal"):
        return transcribe_monophonic(y, sr, info.midi_range, filter_talk=info.kind == "vocal")
    notes = poly_notes if poly_notes is not None else guitar_tab.transcribe_guitar(y, sr, midi_range=info.midi_range)
    notes = [n for n in notes if lo <= n["midi"] <= hi]
    if info.spec is not None and info.spec.bowed:
        notes = _limit_polyphony(notes, 2)
    return notes


# ── quantize ───────────────────────────────────────────────────────────────

def quantize(parts: list[tuple[str, str, list[dict]]], analysis: dict) -> tuple[list[dict], list[dict]]:
    """[(engine, name, notes in seconds)] -> score-model parts in quarter notes from bar 1, plus chords."""
    from services.sheet_generation import _beat_clock, _chord_pitches, _quantize_beat

    bar = float(int(analysis.get("beatsPerBar") or 4))
    clock = _beat_clock(analysis)
    downbeats = analysis.get("downbeats") or analysis.get("beats") or [0.0]
    origin = float(clock(downbeats[0]))
    q = lambda t, grid=0.25: _quantize_beat(float(clock(t)) - origin, grid)  # noqa: E731

    placed = []
    for engine, name, notes in parts:
        qn = []
        for n in notes:
            s = q(n["start"])
            qn.append({
                "start": s, "end": max(q(n["end"]), s + 0.25), "midi": int(n["midi"]),
                "t0": round(float(n["start"]), 4), "t1": round(float(n["end"]), 4),
                **{k: round(float(n[k]), 4) for k in ("velocity", "onset", "brightness", "glide") if n.get(k) is not None},
            })
        placed.append((engine, name, qn))
    chords = [(q(c["start"], 1.0), q(c["end"], 1.0), str(c["chord"]).rstrip("?")) for c in analysis.get("chordTimeline") or []]
    earliest = min([n["start"] for _, _, ns in placed for n in ns] + [c[0] for c in chords] + [0.0])
    shift = math.ceil(-earliest / bar) * bar if earliest < 0 else 0.0

    out_parts = []
    for engine, name, notes in placed:
        for n in notes:
            n["start"] += shift
            n["end"] += shift
        if ENGINES[engine].kind in ("wind", "vocal"):
            notes = _monophonic(notes)
        else:
            best: dict[tuple, dict] = {}
            for n in notes:  # the same pitch twice on one grid slot is one note
                k = (n["start"], n["midi"])
                if k not in best or n.get("velocity", 0) > best[k].get("velocity", 0):
                    best[k] = n
            notes = sorted(best.values(), key=lambda n: (n["start"], n["midi"]))
        out_parts.append({"engine": engine, "name": name, "notes": notes})

    merged: list[list] = []
    for start, end, cname in sorted(chords):
        if end <= start or not _chord_pitches(cname.split("/")[0]):
            continue
        if merged and merged[-1][2] == cname and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end, cname])
    return out_parts, [{"start": s + shift, "end": e + shift, "name": c} for s, e, c in merged]


def _monophonic(notes: list[dict]) -> list[dict]:
    line: list[dict] = []
    for n in sorted(notes, key=lambda n: (n["start"], -n.get("velocity", 0))):
        if line and n["start"] <= line[-1]["start"]:
            continue  # two notes on one slot: keep the louder
        if line and line[-1]["end"] > n["start"]:
            line[-1]["end"] = n["start"]
        line.append(dict(n))
    return line


# ── arrange: piano ─────────────────────────────────────────────────────────

def _slices_q(notes: list[dict]) -> list[list[dict]]:
    by: dict[float, list[dict]] = {}
    for n in notes:
        by.setdefault(n["start"], []).append(n)
    return [sorted(by[s], key=lambda n: n["midi"]) for s in sorted(by)]


def split_hands(notes: list[dict]) -> None:
    """Sets n["hand"] (RH/LH): the split that keeps each hand near where it just was and within a 10th."""
    prev = {"RH": 67.0, "LH": 48.0}
    for sl in _slices_q(notes):
        best = None
        for k in range(len(sl) + 1):
            lh, rh = sl[:k], sl[k:]
            cost = 0.0
            for grp, hand in ((lh, "LH"), (rh, "RH")):
                if not grp:
                    continue
                cost += 0.15 * abs(np.mean([n["midi"] for n in grp]) - prev[hand])
                span = grp[-1]["midi"] - grp[0]["midi"]
                cost += 10.0 * max(0, span - 14) + (20.0 if len(grp) > 5 else 0.0)
            cost += sum(0.3 * max(0, n["midi"] - 64) for n in lh)  # a left hand above E4 is unusual
            cost += sum(0.3 * max(0, 55 - n["midi"]) for n in rh)  # a right hand below G3 too
            if best is None or cost < best[0]:
                best = (cost, k)
        k = best[1]
        for i, n in enumerate(sl):
            n["hand"] = "LH" if i < k else "RH"
        for hand, grp in (("LH", sl[:k]), ("RH", sl[k:])):
            if grp:
                prev[hand] = float(np.mean([n["midi"] for n in grp]))


def _chord_fingers(count: int, span: int) -> tuple[int, ...]:
    """Right-hand fingers for a chord, lowest note first."""
    if count == 2:
        return (1, 2) if span <= 2 else (1, 3) if span <= 4 else (1, 4) if span <= 7 else (1, 5)
    if count == 3:
        return (1, 3, 5) if span >= 6 else (1, 2, 4)
    if count == 4:
        return (1, 2, 3, 5)
    return (1, 2, 3, 4, 5)[:count]


def _finger_move_cost(d: int, f1: int, f2: int) -> float:
    """Cost of playing a note `d` semitones from the last one with finger f2 after f1 (right-hand view)."""
    if f1 == f2:
        return 0.0 if d == 0 else 3.0 + 0.2 * abs(d)
    if d == 0:
        return 2.0
    if f2 > f1:
        if d > 0:
            return 0.4 * abs(d - 2 * (f2 - f1))
        if f1 == 1 and f2 in (2, 3, 4) and d >= -5:
            return 1.5 + 0.2 * abs(d)  # crossing over the thumb
        return 6.0 + abs(d)
    if d < 0:
        return 0.4 * abs(-d - 2 * (f1 - f2))
    if f2 == 1 and f1 in (2, 3, 4) and d <= 5:
        return 1.5 + 0.2 * d + (0.5 if f1 == 4 else 0.0)  # thumb under (from the 4th finger is a reach)
    return 6.0 + abs(d)


def finger_hand(notes: list[dict], hand: str) -> None:
    """Sets n["fingering"] 1-5 for one hand: chord shapes, and a Viterbi path for the outer line."""
    slices = _slices_q(notes)
    if not slices:
        return
    mirror = hand == "LH"
    outer_states: list[list[int]] = []
    for sl in slices:
        if len(sl) == 1:
            outer_states.append([1, 2, 3, 4, 5])
            continue
        fingers = _chord_fingers(min(len(sl), 5), sl[-1]["midi"] - sl[0]["midi"])
        if mirror:
            fingers = tuple(reversed(fingers))
        for n, f in zip(sl, fingers):
            n["fingering"] = f
        outer_states.append([sl[0]["fingering"] if mirror else sl[-1]["fingering"]])

    def outer(sl):
        return sl[0] if mirror else sl[-1]

    def emit(n, f):
        black = n["midi"] % 12 in BLACK_KEYS
        return (1.0 if black and f == 1 else 0.0) + (0.5 if black and f == 5 else 0.0)

    cost = [emit(outer(slices[0]), f) for f in outer_states[0]]
    back = [[0] * len(cost)]
    for k in range(1, len(slices)):
        d = outer(slices[k])["midi"] - outer(slices[k - 1])["midi"]
        if mirror:
            d = -d  # a left hand moving down is a right hand moving up
        nc, nb = [], []
        for f2 in outer_states[k]:
            opts = [cost[j] + _finger_move_cost(d, f1, f2) for j, f1 in enumerate(outer_states[k - 1])]
            j = int(np.argmin(opts))
            nc.append(opts[j] + emit(outer(slices[k]), f2))
            nb.append(j)
        cost, back = nc, back + [nb]
    idx = int(np.argmin(cost))
    for k in range(len(slices) - 1, -1, -1):
        outer(slices[k])["fingering"] = outer_states[k][idx]
        idx = back[k][idx]
    for sl in slices:
        for n in sl:
            n.setdefault("fingering", 1)


def _dynamic_for(velocity: float) -> str:
    return next(name for limit, name in DYNAMIC_STEPS if velocity < limit)


def _dynamics(notes: list[dict], beats_per_bar: int) -> list[dict]:
    by_bar: dict[int, list[float]] = {}
    for n in notes:
        if n.get("velocity") is not None:
            by_bar.setdefault(int(n["start"] // beats_per_bar), []).append(n["velocity"])
    out, last = [], None
    for b in sorted(by_bar):
        level = _dynamic_for(float(np.median(by_bar[b])))
        if level != last:
            out.append({"start": float(b * beats_per_bar), "staff": 1, "dynamic": level})
            last = level
    return out


def _pedal(notes: list[dict], chords: list[dict], beats_per_bar: int) -> list[dict]:
    """Sustain pedal per chord (or bar) where most notes ring on past the next attack."""
    end = max([n["end"] for n in notes] + [0.0])
    segments = [(c["start"], c["end"]) for c in chords] or [
        (b * beats_per_bar, (b + 1) * beats_per_bar) for b in range(int(math.ceil(end / beats_per_bar)))
    ]
    starts = sorted({n["start"] for n in notes})
    out = []
    for s, e in segments:
        inside = [n for n in notes if s <= n["start"] < e]
        if len(inside) < 3:
            continue
        ringing = 0
        for n in inside:
            nxt = next((t for t in starts if t > n["start"]), None)
            if nxt is not None and n["end"] > nxt:
                ringing += 1
        if ringing / len(inside) >= 0.5:
            out += [{"start": s, "staff": 2, "pedal": "start"}, {"start": e, "staff": 2, "pedal": "stop"}]
    return [d for d in out if d["start"] < end + 1e-6]


def arrange_piano(notes: list[dict], ctx: dict) -> dict:
    notes = [dict(n) for n in notes]
    split_hands(notes)
    for hand, staff, outer_voice, inner_voice in (("RH", 1, 1, 2), ("LH", 2, 6, 5)):
        hand_notes = [n for n in notes if n["hand"] == hand]
        for sl in _slices_q(hand_notes):
            outer = sl[-1] if hand == "RH" else sl[0]
            for n in sl:
                n["staff"] = staff
                n["voice"] = outer_voice if n is outer else inner_voice
        finger_hand(hand_notes, hand)
    bpb = ctx["beatsPerBar"]
    return {
        "name": "Piano", "program": 1, "clefs": ENGINES["piano"].clefs, "tab": None,
        "showChords": ctx["showChords"], "notes": notes,
        "directions": _dynamics(notes, bpb) + _pedal(notes, ctx["chords"], bpb),
    }


# ── arrange: phrasing (bowed strings, winds) ───────────────────────────────

def phrase_marks(notes: list[dict], beats_per_bar: int, bowed: bool) -> None:
    """Slurs over legato runs, staccato on short detached notes (winds), bowing on phrase starts (strings)."""
    line = [sl[-1] for sl in _slices_q(notes)]  # the top note of each attack carries the marks
    groups: list[list[dict]] = []
    for a, b in zip([None] + line, line):
        # Inside a slur only the first note is tongued / bowed: later ones are soft next to it.
        legato = (
            a is not None and b["t0"] - a["t1"] <= 0.03
            and guitar_tab._is_soft(groups[-1][0], b) and len(groups[-1]) < 8
        )
        if legato:
            groups[-1].append(b)
        else:
            groups.append([b])
    for g in groups:
        if len(g) > 1:
            g[0]["slur"], g[-1]["slur"] = "start", "stop"
            for n in g:
                n["legato"] = True
        if bowed:
            beat = g[0]["start"] % beats_per_bar
            strong = beat == 0 or (beats_per_bar == 4 and beat == 2)
            g[0]["bow"] = "down" if strong else "up"
    if not bowed:
        for a, b in zip(line, line[1:]):
            ioi, dur = b["t0"] - a["t0"], a["t1"] - a["t0"]
            if not a.get("legato") and ioi < 0.6 and dur < 0.55 * ioi:
                a["staccato"] = True


# ── arrange: dispatch ──────────────────────────────────────────────────────

def _chord_at_beat(chords: list[dict]) -> Callable[[float], str]:
    def at(beat: float) -> str:
        return next((c["name"] for c in chords if c["start"] <= beat + 1e-6 < c["end"]), "")
    return at


def arrange_part(part: dict, ctx: dict) -> dict:
    """Score-model part (plain notes) -> score_writer part with every per-instrument marking."""
    info = ENGINES[part["engine"]]
    notes = [dict(n) for n in part.get("notes", [])]
    if info.kind == "piano":
        out = arrange_piano(notes, ctx)
    elif info.kind == "string":
        chord_at = _chord_at_beat(ctx["chords"])
        timed = [{**n, "chord": chord_at(n["start"]), "_q": (n["start"], n["end"]),
                  "start": n["t0"], "end": n["t1"]} for n in notes]
        solved = guitar_tab.solve_guitar_string_fret_sequence(timed, spec=info.spec)
        notes = []
        for n in solved:
            q0, q1 = n.pop("_q")
            n.pop("chord", None)
            notes.append({**n, "start": q0, "end": q1})
        last: dict[int, dict] = {}
        for n in sorted(notes, key=lambda n: n["start"]):  # a string stops when it is plucked again
            p = last.get(n["string"])
            if p is not None and p["end"] > n["start"]:
                p["end"] = n["start"]
            last[n["string"]] = n
        notes = [n for n in notes if n["end"] > n["start"]]
        if info.spec.bowed:
            phrase_marks(notes, ctx["beatsPerBar"], bowed=True)
        out = guitar_tab.string_part(notes, info.spec, ctx["showChords"], part.get("name"))
    else:
        phrase_marks(notes, ctx["beatsPerBar"], bowed=False)
        out = {"name": part.get("name") or info.label.split(" (")[0], "program": info.program,
               "clefs": info.clefs, "tab": None, "showChords": ctx["showChords"],
               "notes": [{**n, "staff": 1, "voice": 1} for n in notes]}
    out["engine"] = info.key
    out.setdefault("directions", [])
    return out


def _fold(midi: int, lo: int, hi: int) -> int:
    while midi < lo:
        midi += 12
    while midi > hi:
        midi -= 12
    return midi


def arrange_score(model: dict, semitones: int = 0) -> tuple[dict, list[dict]]:
    """Score model -> (score_writer input, arranged parts). Transposition re-arranges every part."""
    from services.sheet_generation import _transposed

    if semitones:
        moved = _transposed({**model, "notes": []}, semitones)
        model = {**model, "key": moved["key"], "chords": moved["chords"], "parts": [
            {**p, "notes": [{**n, "midi": _fold(int(n["midi"]) + semitones, *ENGINES[p["engine"]].midi_range)}
                            for n in p.get("notes", [])]}
            for p in model.get("parts", [])
        ]}
    ctx_base = {"beatsPerBar": int(model.get("beatsPerBar") or 4), "chords": model.get("chords", [])}
    arranged = [arrange_part(p, {**ctx_base, "showChords": i == 0}) for i, p in enumerate(model.get("parts", []))]
    return {**model, "parts": arranged}, arranged


def render_score(model: dict, semitones: int = 0) -> str:
    from services.score_writer import build_score_xml

    score, _ = arrange_score(model, semitones)
    return build_score_xml(score)


# ── metadata ───────────────────────────────────────────────────────────────

def note_events(arranged: list[dict], chords: list[dict], key_label: str, limit: int = 5000) -> list[dict]:
    """Every note as the app's instrumentNoteEvents: time, hand / string / finger, articulation, chord."""
    from services.sheet_generation import _key_signature, _spell

    key = _key_signature(key_label)
    chord_at = _chord_at_beat(chords)
    events = []
    for part in arranged:
        piano = part["engine"] == "piano"
        for n in part["notes"]:
            finger = n.get("fingering")
            label = (PIANO_FINGER_NAMES if piano else STRING_FINGER_NAMES).get(finger) if finger is not None else None
            articulation = (n.get("technique") or ("staccato" if n.get("staccato") else None)
                            or ("legato" if n.get("legato") else None) or "normal")
            events.append({
                "part": part["name"],
                "instrument": part["engine"],
                "time": round(float(n.get("t0", 0.0)), 3),
                "duration": round(float(n.get("t1", 0.0)) - float(n.get("t0", 0.0)), 3),
                "noteName": _spell(int(n["midi"]), key, lambda p: p).nameWithOctave.replace("-", "b"),
                "midi": int(n["midi"]),
                "hand": n.get("hand") if piano else None,
                "staff": int(n.get("staff") or 1),
                "finger": label,
                "pluck": n.get("pluck"),
                "string": n.get("string"),
                "fret": n.get("fret"),
                "position": n.get("position"),
                "bowing": n.get("bow"),
                "articulation": articulation,
                "chord": chord_at(n["start"]) or None,
            })
    events.sort(key=lambda e: (e["time"], e["midi"]))
    return events[:limit]


# ── routing + pipeline ─────────────────────────────────────────────────────

def _mono(x: np.ndarray) -> np.ndarray:
    return x.mean(axis=0) if x.ndim > 1 else x


def route_sources(hint: str, stems: dict, mix: np.ndarray) -> list[tuple[Optional[str], np.ndarray, Optional[str]]]:
    """[(engine or None to detect, mono signal, stem name)] for the hint and the separated stems."""
    from services import stem_separation as ss

    mono_mix = _mono(mix)
    levels = {k: ss.level_db(v, mix) for k, v in stems.items() if k != "drums"}
    active = sorted((k for k, lv in levels.items() if lv > ACTIVE_DB), key=lambda k: -levels[k])

    def blend(names) -> np.ndarray:
        found = [stems[k] for k in names if k in stems]
        if not found:
            return mono_mix
        sig = _mono(np.sum(found, axis=0))
        n = min(len(sig), len(mono_mix))
        return 0.8 * sig[:n] + 0.2 * mono_mix[:n]

    ensemble = hint == "ensemble" or (
        hint == "auto" and len(active) >= 2 and levels[active[1]] >= levels[active[0]] - ENSEMBLE_GAP_DB
    )
    if ensemble and active:
        fixed = {"vocals": "vocals", "piano": "piano", "bass": "bass"}
        return [(fixed.get(k), _mono(stems[k]), k) for k in active[:MAX_PARTS]]
    if hint in ("auto", "ensemble"):
        top = active[0] if active else None
        return [(None, blend([top]) if top else mono_mix, top)]
    return [(None if hint in ("violin", "brass_wind") else hint, blend(HINT_STEMS.get(hint, ())), None)]


def generate_universal(input_path: str, title: str = "Song", hint: str = "auto", on_progress=None,
                       separate: Optional[Callable] = None) -> dict:
    """Any performance -> instrument-accurate sheet music (one part, or one per instrument)."""
    from services import stem_separation as ss
    from services.analysis_engine import analyze
    from services.audio_extract import cleanup, extract_audio_to_wav, normalize_for_transcription
    from services.score_writer import build_score_xml
    from services.sheet_generation import SheetError, _key_label

    hint = hint if hint in HINTS else "auto"
    report = on_progress or (lambda _stage, _pct, _eta=None: None)
    report("audio", 5, 60.0)
    hp_wav = normalize_for_transcription(input_path)
    try:
        wav = extract_audio_to_wav(hp_wav)
        try:
            report("analysis", 12, 55.0)
            analysis = analyze(wav)
        finally:
            cleanup(wav)
        mix = ss.decode_stereo(hp_wav)
    finally:
        cleanup(hp_wav)

    report("stems", 25, 45.0)
    try:
        stems = (separate or (lambda w: ss.separate(w, model=ss.MODEL_6)))(mix)
    except Exception:
        logger.warning("Stem separation failed; transcribing the full mix", exc_info=True)
        stems = {}

    report("detect", 45, 30.0)
    sr = ss.SAMPLE_RATE
    found: list[tuple[str, str, list[dict], dict]] = []
    for engine, signal, stem in route_sources(hint, stems, mix):
        poly = None
        if engine is None or ENGINES[engine].kind in ("piano", "string"):
            poly = guitar_tab.transcribe_guitar(signal, sr, midi_range=(21, 108))
        profile = profile_signal(signal, sr, poly or [])
        if engine is None:
            engine = classify(profile, stem)
        else:
            engine = _resolve_hint(engine, profile)
        report("notes", 60, 15.0)
        notes = transcribe_for(engine, signal, sr, poly if ENGINES[engine].kind in ("piano", "string") else None)
        if notes:
            found.append((engine, ENGINES[engine].label.split(" (")[0], notes, profile))
    if not found:
        raise SheetError("No notes were found in this recording. Try a clip where the instrument is clearly audible.")

    found.sort(key=lambda f: PART_RANK[f[0]])
    report("arrange", 80, 5.0)
    parts, chords = quantize([(e, name, notes) for e, name, notes, _ in found], analysis)
    model = {
        "instrument": "score",
        "title": title,
        "bpm": round(float(analysis.get("bpm") or 120), 1),
        "beatsPerBar": int(analysis.get("beatsPerBar") or 4),
        "key": _key_label(analysis.get("key", "")),
        "chords": chords,
        "notes": [],
        "parts": parts,
    }
    report("render", 90, 2.0)
    score, arranged = arrange_score(model)
    xml = build_score_xml(score)

    ensemble = len(found) > 1
    detected = "ensemble" if ensemble else found[0][0]
    label = ("Ensemble: " + ", ".join(ENGINES[e].label.split(" (")[0] for e, *_ in found)) if ensemble else ENGINES[detected].label
    report("complete", 100, 0.0)
    return {
        "title": title,
        "instrument": "score",
        "detectedInstrument": detected,
        "instrumentLabel": label,
        "instrumentHint": hint,
        "parts": [
            {"name": p["name"], "instrument": p["engine"], "label": ENGINES[p["engine"]].label,
             "noteCount": len(p["notes"]), "profile": prof}
            for p, (_, _, _, prof) in zip(parts, found)
        ],
        "model": model,
        "musicxml": xml,
        "bpm": model["bpm"],
        "key": model["key"],
        "timeSignature": f"{model['beatsPerBar']}/4",
        "noteCount": sum(len(p["notes"]) for p in parts),
        "noteEvents": note_events(arranged, chords, model["key"]),
        "notice": f"Draft transcribed by AI as {label}. Instrument detection, fingering and string choices are "
                  "best guesses: check them against the recording.",
    }
