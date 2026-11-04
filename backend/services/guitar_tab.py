"""
Guitar performance -> every plucked note, its string (1-6) and fret (0-22), both
hands' fingers and the articulation, written as MusicXML that alphaTab draws as
standard notation + 6-string TAB.

  transcription  Basic Pitch (polyphonic) on the guitar stem, cross-checked
                 against a log-compressed, locally normalized 36-bin/octave CQT,
                 which also recovers quiet plucks Basic Pitch missed.
  string/fret    Viterbi over "slices" of simultaneous notes: every slice's
                 candidates put each note on its own string with a fret span of
                 at most 4; the path minimises fret height, hand shifts and
                 timbre mismatch, and prefers the active chord's grip.
  articulation   same string, < 180 ms apart, soft second attack: hammer-on (up),
                 pull-off (down), slide (Basic Pitch saw the pitch glide).

Everything here is deterministic DSP + search; nothing is learned at runtime.
"""

import itertools
import logging
import math
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

logger = logging.getLogger(__name__)

# String number -> open-string MIDI pitch (standard tuning; 1 = high e).
STANDARD_TUNING = {6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64}
TUNING_SPELLING = {6: ("E", 2), 5: ("A", 2), 4: ("D", 3), 3: ("G", 3), 2: ("B", 3), 1: ("E", 4)}
MAX_FRET = 22
HAND_SPAN = 4  # max fret - min fretted fret inside one slice
MIDI_MIN, MIDI_MAX = 40, 88  # E2 .. E6

# Basic Pitch settings tuned for fingerstyle guitar (soft plucks, short notes).
BP_ONSET_THRESHOLD = 0.42
BP_FRAME_THRESHOLD = 0.28
BP_MIN_NOTE_MS = 35

# CQT verification grid.
CQT_SR = 22050
CQT_HOP = 256
CQT_BPO = 36  # 3 bins per semitone
CQT_MIDI_MIN = 24  # C1: low enough for a bass guitar's E1 and a cello's C2
CQT_FMIN = 440.0 * 2 ** ((CQT_MIDI_MIN - 69) / 12)
CQT_OCTAVES = 8  # up to ~8.4 kHz: room for the harmonics the timbre cue reads
LOCAL_NORM_S = 0.10
FLOOR_DB = -55.0
VERIFY_MIN = 0.25  # locally normalized CQT level a Basic Pitch note needs ...
VERIFY_LOUD = 0.50  # ... unless Basic Pitch itself is this sure
RECOVER_MIN = 0.75  # level a CQT peak needs to become a note Basic Pitch missed

SIMULTANEOUS_S = 0.035  # onsets this close are one plucked "slice"
LEGATO_S = 0.18  # hammer-on / pull-off / slide window
LEGATO_MAX_FRETS = 3
SOFT_ONSET_RATIO = 0.6  # second attack below this share of the first counts as soft
GLIDE_SEMITONES = 0.5

# Viterbi cost weights.
W_FRET = 0.12
W_SPAN = 0.3
W_SHIFT = 1.0
W_LEAVE_BOX = 2.0
W_TIMBRE = 1.0
CHORD_GRIP_BONUS = -3.0
LEGATO_SAME_STRING_BONUS = -0.5
MAX_FINGERINGS = 30  # cheapest fingerings kept per slice (each fans out to <= 4 hand boxes)

RIGHT_FINGER = {6: "p", 5: "p", 4: "p", 3: "i", 2: "m", 1: "a"}

# Violin-family positions: semitones from the open string to the 1st finger -> position.
_POSITION_OF_ANCHOR = {1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6, 12: 7}


@dataclass(frozen=True)
class StringSpec:
    """
    One string instrument for the solver and the score: tuning (string 1 = the
    highest-sounding string, as MusicXML and TAB number them), how far the hand
    reaches, which right-hand finger plucks each string, and how it is written.
    """
    key: str
    label: str
    tuning: dict  # string number -> open-string MIDI pitch
    spelling: dict  # string number -> (step, octave) for <staff-tuning>
    program: int  # General MIDI, 1-based as MusicXML writes it
    clef: tuple  # (sign, line, octave change)
    max_fret: int = 22
    hand_span: int = HAND_SPAN  # widest stretch inside one slice (frets / semitones)
    box: int = 4  # frets the hand covers without shifting
    right_finger: dict = field(default_factory=dict)
    grips: bool = False  # guitar chord shapes inform the solver
    bowed: bool = False  # no frets: positions, bowing and slurs instead of TAB techniques
    tab: bool = True

    @property
    def lowest(self) -> int:
        return min(self.tuning.values())

    @property
    def highest(self) -> int:
        return max(self.tuning.values()) + self.max_fret


GUITAR = StringSpec(
    "guitar", "Acoustic Guitar (Notation + TAB)", STANDARD_TUNING, TUNING_SPELLING, 26, ("G", 2, -1),
    right_finger=RIGHT_FINGER, grips=True,
)
BASS = StringSpec(
    "bass", "Bass Guitar (Notation + TAB)", {4: 28, 3: 33, 2: 38, 1: 43},
    {4: ("E", 1), 3: ("A", 1), 2: ("D", 2), 1: ("G", 2)}, 34, ("F", 4, -1), max_fret=20,
    right_finger={4: "i", 3: "i", 2: "m", 1: "m"},
)
UKULELE = StringSpec(
    "ukulele", "Ukulele (Notation + TAB)", {4: 67, 3: 60, 2: 64, 1: 69},
    {4: ("G", 4), 3: ("C", 4), 2: ("E", 4), 1: ("A", 4)}, 25, ("G", 2, 0), max_fret=15,
    right_finger={4: "p", 3: "p", 2: "i", 1: "m"},
)
VIOLIN = StringSpec(
    "violin", "Violin", {4: 55, 3: 62, 2: 69, 1: 76},
    {4: ("G", 3), 3: ("D", 4), 2: ("A", 4), 1: ("E", 5)}, 41, ("G", 2, 0), max_fret=15,
    hand_span=7, box=6, bowed=True, tab=False,
)
CELLO = StringSpec(
    "cello", "Cello", {4: 36, 3: 43, 2: 50, 1: 57},
    {4: ("C", 2), 3: ("G", 2), 2: ("D", 3), 1: ("A", 3)}, 43, ("F", 4, 0), max_fret=15,
    hand_span=6, box=5, bowed=True, tab=False,
)
STRING_SPECS = {sp.key: sp for sp in (GUITAR, BASS, UKULELE, VIOLIN, CELLO)}


# ── transcription ──────────────────────────────────────────────────────────

def _local_log_cqt(y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """(raw |CQT|, log-compressed CQT normalized per ~100 ms window with a -55 dB floor)."""
    import librosa
    from scipy.ndimage import maximum_filter1d

    mag = np.abs(librosa.cqt(
        y, sr=sr, hop_length=CQT_HOP, fmin=CQT_FMIN,
        n_bins=CQT_BPO * CQT_OCTAVES, bins_per_octave=CQT_BPO,
    ))
    comp = np.log1p(50.0 * mag)
    width = max(1, int(round(LOCAL_NORM_S * sr / CQT_HOP)))
    local_max = maximum_filter1d(comp.max(axis=0), size=width, mode="nearest")
    norm = comp / np.maximum(local_max, 1e-9)[None, :]
    norm[norm < 10 ** (FLOOR_DB / 20.0)] = 0.0
    return mag, norm


def _bin(midi: float) -> int:
    return int(round((midi - CQT_MIDI_MIN) * CQT_BPO / 12))


def _level(norm: np.ndarray, midi: int, f0: int, f1: int) -> float:
    b = _bin(midi)
    if b < 1 or b + 1 >= norm.shape[0] or f1 <= f0:
        return 0.0
    return float(norm[b - 1:b + 2, f0:f1].max(axis=0).mean())


def _brightness(mag: np.ndarray, midi: int, f0: int, f1: int) -> Optional[float]:
    """Upper-harmonic share at the attack: 0 = dark (wound / high up the neck), 1 = bright."""
    def energy(semis: tuple[int, ...]) -> float:
        total = 0.0
        for s in semis:
            b = _bin(midi + s)
            if 0 <= b < mag.shape[0]:
                total += float(mag[b, f0:f1].mean()) if f1 > f0 else 0.0
        return total

    low = energy((0, 12))  # harmonics 1, 2
    high = energy((19, 24, 28, 31))  # harmonics 3, 4, 5, 6
    if low <= 1e-9:
        return None
    return float(np.clip(high / (high + low) * 2.0, 0.0, 1.0))


def _glide(bends) -> float:
    """Net pitch movement across a note in semitones (Basic Pitch bends are 1/3 semitone)."""
    if not bends or len(bends) < 4:
        return 0.0
    q = max(1, len(bends) // 4)
    return float((np.mean(bends[-q:]) - np.mean(bends[:q])) / 3.0)


def _basic_pitch_events(y: np.ndarray, sr: int, midi_range: tuple[int, int] = (MIDI_MIN, MIDI_MAX)) -> list:
    import os
    import tempfile
    import uuid

    import soundfile as sf
    from basic_pitch.inference import predict

    from services.sheet_generation import _basic_pitch

    path = os.path.join(tempfile.gettempdir(), f"wilsify-guitar-{uuid.uuid4().hex}.wav")
    try:
        sf.write(path, y, sr, subtype="PCM_16")
        _, _, events = predict(
            path,
            _basic_pitch(),
            onset_threshold=BP_ONSET_THRESHOLD,
            frame_threshold=BP_FRAME_THRESHOLD,
            minimum_note_length=BP_MIN_NOTE_MS,
            minimum_frequency=440.0 * 2 ** ((midi_range[0] - 69) / 12),
            maximum_frequency=440.0 * 2 ** ((midi_range[1] - 69) / 12),
            melodia_trick=False,  # keep every voice: the trick favours one melody line
        )
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return list(events)


def transcribe_guitar(
    y: np.ndarray, sr: int, events: Optional[list] = None, midi_range: tuple[int, int] = (MIDI_MIN, MIDI_MAX)
) -> list[dict]:
    """
    Mono guitar signal -> every plucked note as
    {start, end, midi, velocity, brightness, onset, glide} (seconds), polyphony kept.

    `events` (Basic Pitch's (start, end, midi, amplitude, bends) list) can be passed
    in by tests; otherwise Basic Pitch runs on `y`. `midi_range` is the instrument's
    range (E2-E6 for guitar); any plucked or bowed string instrument works.
    """
    lo, hi = midi_range
    import librosa

    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = y.mean(axis=0)
    if events is None:
        events = _basic_pitch_events(y, sr, midi_range)
    y22 = librosa.resample(y, orig_sr=sr, target_sr=CQT_SR) if sr != CQT_SR else y
    mag, norm = _local_log_cqt(y22, CQT_SR)
    fps = CQT_SR / CQT_HOP
    n_frames = norm.shape[1]
    attack = max(2, int(round(0.06 * fps)))
    onset_env = librosa.onset.onset_strength(y=y22, sr=CQT_SR, hop_length=CQT_HOP)

    def frames(t: float) -> tuple[int, int]:
        f0 = int(np.clip(round(t * fps), 0, max(n_frames - 1, 0)))
        return f0, min(n_frames, f0 + attack)

    def onset_strength_at(t: float) -> float:
        f = int(np.clip(round(t * fps), 0, len(onset_env) - 1)) if len(onset_env) else 0
        return float(onset_env[max(0, f - 1):f + 2].max()) if len(onset_env) else 0.0

    notes: list[dict] = []
    for ev in events:
        s, e, p, amp = float(ev[0]), float(ev[1]), int(ev[2]), float(ev[3])
        bends = ev[4] if len(ev) > 4 else None
        if not (lo <= p <= hi) or e <= s:
            continue
        f0, f1 = frames(s)
        if _level(norm, p, f0, f1) < VERIFY_MIN and amp < VERIFY_LOUD:
            continue  # nothing at that pitch in the spectrum: a model ghost
        notes.append({"start": s, "end": e, "midi": p, "velocity": amp, "glide": _glide(bends)})

    # Octave ghosts: a weak note an octave above a much louder simultaneous note is
    # that note's 2nd harmonic, not a second string.
    keep = []
    for n in notes:
        ghost = any(
            abs(m["start"] - n["start"]) <= SIMULTANEOUS_S and m["midi"] == n["midi"] - 12
            and m["velocity"] > 2 * n["velocity"]
            and _level(norm, n["midi"], *frames(n["start"])) < 0.5
            for m in notes
        )
        if not ghost:
            keep.append(n)
    notes = keep

    # Recovery: strong CQT peaks at detected onsets with no Basic Pitch note
    # (quiet grace notes, a thumb note under a loud melody).
    onset_times = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=CQT_SR, hop_length=CQT_HOP, backtrack=False, units="time"
    )
    for t in onset_times:
        f0, f1 = frames(float(t))
        if f1 <= f0:
            continue
        profile = norm[:, f0:f1].mean(axis=1)
        present = {n["midi"] for n in notes if abs(n["start"] - t) <= 0.05}
        added = 0
        for midi in range(lo, hi + 1):
            b = _bin(midi)
            if b < 1 or b + 1 >= len(profile) or midi in present:
                continue
            v = profile[b]
            if v < RECOVER_MIN or v < profile[b - 1] or v < profile[b + 1]:
                continue
            if any((midi - k) in present for k in (12, 19, 24, 28, 31, 34, 36)):
                continue  # a harmonic of a note already there
            end = float(t)
            fr = f0
            while fr < n_frames and norm[max(b - 1, 0):b + 2, fr].max() >= 0.3 and end - t < 2.0:
                fr += 1
                end = fr / fps
            if end - t < BP_MIN_NOTE_MS / 1000:
                continue
            notes.append({"start": float(t), "end": end, "midi": midi, "velocity": float(v) * 0.5, "glide": 0.0})
            present.add(midi)
            added += 1
            if added >= 3:
                break

    for n in notes:
        f0, f1 = frames(n["start"])
        n["brightness"] = _brightness(mag, n["midi"], f0, f1)
        n["onset"] = onset_strength_at(n["start"])
    notes.sort(key=lambda n: (n["start"], n["midi"]))
    return notes


def isolate_guitar(mix: np.ndarray, separate: Optional[Callable] = None) -> np.ndarray:
    """
    (2, samples) mix -> mono guitar signal: Demucs htdemucs_6s guitar + bass + other
    (a solo guitar's thumb notes often land in "bass"), blended 80/20 with the mix so
    pick and nail transients on the plain strings survive. Falls back to the mix.
    """
    mono_mix = mix.mean(axis=0)
    if separate is None:
        try:
            from services import stem_separation as ss

            separate = lambda wav: ss.separate(wav, model=ss.MODEL_6)  # noqa: E731
        except Exception:
            return mono_mix
    try:
        stems = separate(mix)
        parts = [stems[k] for k in ("guitar", "bass", "other") if k in stems]
        if not parts:
            return mono_mix
        guitar = np.sum(parts, axis=0).mean(axis=0)
        n = min(len(guitar), len(mono_mix))
        return 0.8 * guitar[:n] + 0.2 * mono_mix[:n]
    except Exception:
        logger.warning("Guitar stem isolation failed; transcribing the full mix", exc_info=True)
        return mono_mix


# ── string / fret solver ───────────────────────────────────────────────────

def _chord_grip(chord: str, spec: StringSpec = GUITAR) -> set[tuple[int, int]]:
    """(string, fret) positions of the chord's open / CAGED grip near the nut."""
    from services.analysis_engine import _CANONICAL_GUITAR_SHAPES
    from services.sheet_generation import _chord_pitches

    if not chord:
        return set()
    name = chord.rstrip("?")
    if spec.bowed:
        return set()  # no chord grips on a fretless bowed instrument
    shape = (_CANONICAL_GUITAR_SHAPES.get(name) or _CANONICAL_GUITAR_SHAPES.get(name.split("/")[0])) if spec.grips else None
    if shape:
        return {(s, f) for s, (f, _finger) in shape.items()}
    pcs = {p % 12 for p in _chord_pitches(name.split("/")[0])}
    if not pcs:
        return set()
    # No stored grip: every chord tone in the first position (frets 0-4).
    return {(s, f) for s, open_midi in spec.tuning.items() for f in range(0, 5) if (open_midi + f) % 12 in pcs}


def _candidates(midi: int, spec: StringSpec = GUITAR) -> list[tuple[int, int]]:
    return [(s, midi - o) for s, o in spec.tuning.items() if 0 <= midi - o <= spec.max_fret]


def _expected_brightness(string: int, fret: int, spec: StringSpec = GUITAR) -> float:
    # Plain strings in open position ring brightest; wound strings high up are darkest.
    return 1.0 - ((string - 1) / max(len(spec.tuning) - 1, 1) * 0.6 + fret / spec.max_fret * 0.4)


def _slice_assignments(slice_notes: list[dict], grip: set, spec: StringSpec = GUITAR) -> list[tuple[float, tuple, Optional[int]]]:
    """
    Every playable way to fret a slice, as (emission cost, ((string, fret), ...), anchor).
    `anchor` is the fret under the index finger: the hand box covers anchor..anchor+3
    (a span of 4 needs a pinky stretch). All-open slices have no anchor.
    """
    options = [_candidates(n["midi"], spec) for n in slice_notes]
    fingerings = []
    for combo in itertools.product(*options):
        strings = [s for s, _ in combo]
        if len(set(strings)) != len(strings):
            continue  # two simultaneous notes can't share a string
        fretted = [f for _, f in combo if f > 0]
        span = (max(fretted) - min(fretted)) if fretted else 0
        if span > spec.hand_span:
            continue
        cost = W_SPAN * span
        for n, (s, f) in zip(slice_notes, combo):
            cost += W_FRET * f
            if (s, f) in grip:
                cost += CHORD_GRIP_BONUS
            b = n.get("brightness")
            if b is not None:
                cost += W_TIMBRE * abs(b - _expected_brightness(s, f, spec))
        fingerings.append((cost, combo, fretted))
    fingerings.sort(key=lambda x: x[0])
    states = []
    for cost, combo, fretted in fingerings[:MAX_FINGERINGS]:
        if not fretted:
            states.append((cost, combo, None))
            continue
        lo, hi = min(fretted), max(fretted)
        anchors = range(max(1, hi - (spec.box - 1)), lo + 1) or [lo]
        states.extend((cost, combo, a) for a in anchors)
    return states


def _playable_slice(slice_notes: list[dict], grip: set, spec: StringSpec = GUITAR) -> tuple[list[dict], list]:
    """Drops the quietest notes (and duplicates) until the slice fits on the instrument's strings."""
    notes = sorted({n["midi"]: n for n in slice_notes}.values(), key=lambda n: -n.get("velocity", 0.5))
    notes = [n for n in notes if _candidates(n["midi"], spec)]
    while notes:
        states = _slice_assignments(notes, grip, spec)
        if states:
            return notes, states
        notes = notes[:-1]
    return [], []


def _is_soft(first: dict, second: dict) -> bool:
    a, b = first.get("onset"), second.get("onset")
    if a is not None and b is not None and a > 0:
        return b < SOFT_ONSET_RATIO * a
    return second.get("velocity", 1.0) < SOFT_ONSET_RATIO * first.get("velocity", 1.0)


def _slices(notes: list[dict]) -> list[list[int]]:
    order = sorted(range(len(notes)), key=lambda i: (notes[i]["start"], notes[i]["midi"]))
    groups: list[list[int]] = []
    for i in order:
        if groups and notes[i]["start"] - notes[groups[-1][0]]["start"] <= SIMULTANEOUS_S:
            groups[-1].append(i)
        else:
            groups.append([i])
    return groups


def _state_arrays(states: list) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Emission costs, anchors (nan = open), and the string / fret of single-note slices (-1 otherwise)."""
    anchor = np.array([np.nan if a is None else a for _, _, a in states], dtype=float)
    single = len(states[0][1]) == 1
    string = np.array([c[0][0] if single else -1 for _, c, _ in states], dtype=float)
    fret = np.array([c[0][1] if single else -1 for _, c, _ in states], dtype=float)
    return np.array([c for c, _, _ in states], dtype=float), anchor, string, fret


def solve_guitar_string_fret_sequence(
    notes: list[dict], chord_at: Optional[Callable[[float], str]] = None, spec: StringSpec = GUITAR
) -> list[dict]:
    """
    Assigns string (1-6), fret (0-22), leftFinger (0-4), rightFinger (p/i/m/a) and
    technique (hammer-on / pull-off / slide / None) to every note.

    `notes`: dicts with start/end in seconds and midi (optionally velocity,
    brightness, onset, glide; an optional "chord" overrides `chord_at`). Returns
    new dicts in time order; notes no hand could play in their slice are dropped.
    `spec` picks the instrument (guitar by default; bass, ukulele, violin, cello).
    """
    if not notes:
        return []
    chord_at = chord_at or (lambda _t: "")

    slice_notes: list[list[dict]] = []
    slice_states: list[list] = []
    for g in _slices(notes):
        members = [notes[i] for i in g]
        chord = members[0].get("chord") or chord_at(members[0]["start"])
        kept, states = _playable_slice(members, _chord_grip(chord, spec), spec)
        if states:
            slice_notes.append(kept)
            slice_states.append(states)
    if not slice_states:
        return []

    # Viterbi over slices; state = (fingering, hand box). Moving the box costs,
    # moving fingers inside it does not.
    cost, p_anchor, p_string, p_fret = _state_arrays(slice_states[0])
    back: list[np.ndarray] = [np.full(len(cost), -1)]
    for k in range(1, len(slice_states)):
        prev_notes, cur_notes = slice_notes[k - 1], slice_notes[k]
        gap = cur_notes[0]["start"] - prev_notes[0]["start"]
        scale = W_SHIFT * (1.0 if gap < 0.5 else 0.5)
        legato = (gap < LEGATO_S and len(prev_notes) == 1 and len(cur_notes) == 1
                  and _is_soft(prev_notes[0], cur_notes[0]))
        emit, c_anchor, c_string, c_fret = _state_arrays(slice_states[k])
        new_cost = np.empty(len(emit))
        new_back = np.empty(len(emit), dtype=int)
        for i in range(len(emit)):
            shift = np.abs(c_anchor[i] - p_anchor)
            shift = np.where(np.isnan(shift), 0.0, shift)
            total = cost + scale * shift + W_LEAVE_BOX * (shift > spec.box)
            if legato:
                # A quick soft second note a few frets away is usually slurred on the same string.
                d = np.abs(c_fret[i] - p_fret)
                total = total + LEGATO_SAME_STRING_BONUS * ((p_string == c_string[i]) & (d > 0) & (d <= LEGATO_MAX_FRETS))
            j = int(np.argmin(total))
            new_cost[i], new_back[i] = total[j] + emit[i], j
        cost, p_anchor, p_string, p_fret = new_cost, c_anchor, c_string, c_fret
        back.append(new_back)
    path = [int(np.argmin(cost))]
    for k in range(len(slice_states) - 1, 0, -1):
        path.append(int(back[k][path[-1]]))
    path.reverse()

    out: list[dict] = []
    for k, (members, idx) in enumerate(zip(slice_notes, path)):
        _, combo, anchor = slice_states[k][idx]
        for n, (s, f) in zip(members, combo):
            note = {**n, "string": s, "fret": f, "leftFinger": _left_finger(n, s, f, anchor, chord_at, spec),
                    "rightFinger": spec.right_finger.get(s), "technique": None}
            if spec.bowed:
                note["position"] = _POSITION_OF_ANCHOR.get(anchor, 7 if anchor else 1) if anchor else 1
            out.append(note)

    if not spec.bowed:
        _assign_articulations(out)
    if spec.key == "bass":
        _alternate_bass_fingers(out)
    order = sorted(range(len(out)), key=lambda i: (out[i]["start"], -out[i]["string"]))
    return [out[i] for i in order]


def _alternate_bass_fingers(out: list[dict]) -> None:
    """Bass players alternate index and middle (i-m) instead of tying a finger to a string."""
    finger = "m"
    for n in sorted(out, key=lambda n: n["start"]):
        finger = "i" if finger == "m" else "m"
        n["rightFinger"] = finger


def _left_finger(n: dict, string: int, fret: int, anchor: Optional[int], chord_at: Callable, spec: StringSpec = GUITAR) -> int:
    """0 = open; else the chord grip's own finger when it matches, or the finger over that fret in the hand box."""
    from services.analysis_engine import _CANONICAL_GUITAR_SHAPES

    if fret == 0:
        return 0
    if spec.bowed:
        # No frets: fingers sit about a whole step apart from the 1st finger at the anchor.
        d = fret - (anchor if anchor is not None else fret)
        return int(np.clip(1 + round(d / 1.75), 1, 4))
    if not spec.grips:
        return int(np.clip(fret - (anchor if anchor is not None else fret) + 1, 1, 4))
    chord = (n.get("chord") or chord_at(n["start"]) or "").rstrip("?")
    shape = _CANONICAL_GUITAR_SHAPES.get(chord) or _CANONICAL_GUITAR_SHAPES.get(chord.split("/")[0]) or {}
    grip = shape.get(string)
    if grip and grip[0] == fret and grip[1] > 0:
        return int(grip[1])
    return int(np.clip(fret - (anchor if anchor is not None else fret) + 1, 1, 4))


def _assign_articulations(out: list[dict]) -> None:
    last_on_string: dict[int, int] = {}
    for i in sorted(range(len(out)), key=lambda i: out[i]["start"]):
        n = out[i]
        j = last_on_string.get(n["string"])
        last_on_string[n["string"]] = i
        if j is None:
            continue
        p = out[j]
        delta = n["fret"] - p["fret"]
        if n["start"] - p["start"] >= LEGATO_S or delta == 0 or not _is_soft(p, n):
            continue
        glide = p.get("glide") or 0.0
        if abs(glide) >= GLIDE_SEMITONES and np.sign(glide) == np.sign(delta):
            n["technique"], p["techniqueStart"] = "slide", "slide"
        elif 0 < delta <= LEGATO_MAX_FRETS:
            n["technique"], p["techniqueStart"] = "hammer-on", "hammer-on"
        elif -LEGATO_MAX_FRETS <= delta < 0:
            n["technique"], p["techniqueStart"] = "pull-off", "pull-off"


# ── MusicXML ───────────────────────────────────────────────────────────────

def string_part(notes: list[dict], spec: "StringSpec" = None, show_chords: bool = True, name: Optional[str] = None) -> dict:
    """Solved string-instrument notes (quarter-note times) -> a score_writer part, notation + TAB when fretted."""
    spec = spec or GUITAR
    part_notes = []
    for n in notes:
        # Guitar: melody strings in voice 1, thumb strings in voice 2. Four-string instruments: one voice.
        voice = 1 if len(spec.tuning) < 6 or n["string"] <= 3 else 2
        part_notes.append({
            **n, "staff": 1, "voice": voice,
            "fingering": n.get("leftFinger", 0),
            "pluck": n.get("rightFinger") if not spec.bowed else None,
        })
    return {
        "name": name or spec.label.split(" (")[0],
        "program": spec.program,
        "clefs": [spec.clef],
        "tab": {"tuning": spec.tuning, "spelling": spec.spelling} if spec.tab else None,
        "showChords": show_chords,
        "notes": part_notes,
    }


def build_guitar_musicxml(model: dict) -> str:
    """Guitar sheet model (quarter-note times, solved string/fret) -> MusicXML with standard staff + TAB data."""
    from services.score_writer import build_score_xml

    return build_score_xml({**model, "parts": [string_part(model.get("notes", []), GUITAR)]})


# ── sheet model ────────────────────────────────────────────────────────────

def guitar_sheet_model(notes: list[dict], analysis: dict, title: str = "Song") -> dict:
    """Solved notes (seconds) + analysis -> the editable guitar model in quarter notes from bar 1."""
    from services.sheet_generation import _beat_clock, _chord_pitches, _key_label, _quantize_beat

    beats_per_bar = int(analysis.get("beatsPerBar") or 4)
    bar = float(beats_per_bar)
    clock = _beat_clock(analysis)
    downbeats = analysis.get("downbeats") or analysis.get("beats") or [0.0]
    origin = float(clock(downbeats[0]))

    placed = []
    for n in notes:
        qs = _quantize_beat(float(clock(n["start"])) - origin)
        qe = _quantize_beat(float(clock(n["end"])) - origin)
        placed.append((qs, max(qe, qs + 0.25), n))
    chords = [
        (_quantize_beat(float(clock(c["start"])) - origin, 1.0), _quantize_beat(float(clock(c["end"])) - origin, 1.0),
         str(c["chord"]).rstrip("?"))
        for c in analysis.get("chordTimeline") or []
    ]
    earliest = min([p[0] for p in placed] + [c[0] for c in chords] + [0.0])
    shift = math.ceil(-earliest / bar) * bar if earliest < 0 else 0.0

    # Same string, same grid slot: one pluck. A string can't ring past its next pluck.
    out: dict[tuple[float, int], dict] = {}
    for qs, qe, n in placed:
        k = (qs + shift, n["string"])
        if k not in out or n.get("velocity", 0) > out[k].get("velocity", 0):
            out[k] = {
                "start": qs + shift, "end": qe + shift, "midi": int(n["midi"]),
                "string": int(n["string"]), "fret": int(n["fret"]),
                "leftFinger": int(n.get("leftFinger", 0)), "rightFinger": n.get("rightFinger", RIGHT_FINGER[n["string"]]),
                "technique": n.get("technique"), "techniqueStart": n.get("techniqueStart"),
                "brightness": n.get("brightness"), "onset": n.get("onset"), "glide": n.get("glide", 0.0),
                "velocity": round(float(n.get("velocity", 0.5)), 3),
            }
    model_notes = sorted(out.values(), key=lambda n: (n["start"], -n["string"]))
    last: dict[int, dict] = {}
    for n in model_notes:
        p = last.get(n["string"])
        if p is not None and p["end"] > n["start"]:
            p["end"] = n["start"]
        last[n["string"]] = n
    model_notes = [n for n in model_notes if n["end"] > n["start"]]

    merged: list[list] = []
    for start, end, name in sorted(chords):
        if end <= start or not _chord_pitches(name.split("/")[0]):
            continue
        if merged and merged[-1][2] == name and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end, name])

    return {
        "instrument": "guitar",
        "title": title,
        "bpm": round(float(analysis.get("bpm") or 120), 1),
        "beatsPerBar": beats_per_bar,
        "key": _key_label(analysis.get("key", "")),
        "tuning": [STANDARD_TUNING[s] for s in (6, 5, 4, 3, 2, 1)],
        "notes": model_notes,
        "chords": [{"start": s + shift, "end": e + shift, "name": n} for s, e, n in merged],
    }


def _model_is_solved(notes: list[dict]) -> bool:
    for n in notes:
        s, f = n.get("string"), n.get("fret")
        if s not in STANDARD_TUNING or f is None or not (0 <= int(f) <= MAX_FRET):
            return False
        if STANDARD_TUNING[s] + int(f) != int(n["midi"]):
            return False
    return True


def render_guitar(model: dict, semitones: int = 0) -> str:
    """Guitar model -> MusicXML. Edited or transposed notes are re-solved onto strings first."""
    from services.sheet_generation import _transposed

    if semitones:
        model = _transposed(model, semitones)
    notes = [n for n in model.get("notes", []) if float(n["end"]) > float(n["start"])]
    # Notes moved off the guitar's range fold back into it by octaves.
    for n in notes:
        m = int(n["midi"])
        while m < MIDI_MIN:
            m += 12
        while m > STANDARD_TUNING[1] + MAX_FRET:
            m -= 12
        n["midi"] = m
    if not _model_is_solved(notes):
        spb = 60.0 / max(float(model.get("bpm") or 120), 1.0)
        chords = sorted((float(c["start"]), c["name"]) for c in model.get("chords", []))

        def chord_at_beat(beat: float) -> str:
            name = ""
            for s, c in chords:
                if s <= beat + 1e-6:
                    name = c
            return name

        timed = [
            {**n, "chord": chord_at_beat(float(n["start"])), "start": float(n["start"]) * spb,
             "end": float(n["end"]) * spb, "_beat": (float(n["start"]), float(n["end"]))}
            for n in notes
        ]
        solved = solve_guitar_string_fret_sequence(timed)
        notes = []
        for n in solved:
            b0, b1 = n.pop("_beat")
            n.pop("chord", None)
            notes.append({**n, "start": b0, "end": b1})
    return build_guitar_musicxml({**model, "notes": notes})
