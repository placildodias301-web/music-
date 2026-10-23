"""
Harte chord labels (Harte et al., ISMIR 2005) -> the app's chord symbols.

    "C:maj" -> "C"     "A:min7" -> "Am7"     "B:hdim7" -> "Bm7b5"
    "G:maj/3" -> "G/B" "D:sus4(b7)" -> "D7sus4"  "N" -> "N"

Roots are spelled with sharps, like the v2 engine (services/analysis_engine.py
NOTE_NAMES). Suffixes are the Chord Library's (frontend/src/lib/chordTheory.ts).
A quality with no symbol there gets simple=None rather than a guessed chord.
"""

import re
from dataclasses import dataclass
from typing import Optional

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
_NATURAL = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
# Scale degree -> semitones above the root, for slash-chord basses ("/b7", "/3").
_DEGREE = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 2, 11: 5, 13: 9}

NO_CHORD = "N"
UNKNOWN = "X"  # BTC: a chord outside its vocabulary

# Every quality BTC's large vocabulary and lv-chordia's "submission" dictionary
# emit, plus the common Harte shorthands.
SUFFIXES = {
    "maj": "", "min": "m", "dim": "dim", "aug": "aug", "5": "5",
    "sus2": "sus2", "sus4": "sus4",
    "maj6": "6", "min6": "m6",
    "7": "7", "maj7": "maj7", "min7": "m7", "minmaj7": "mMaj7", "dim7": "dim7", "hdim7": "m7b5",
    "9": "9", "maj9": "maj9", "min9": "m9",
    "11": "11", "min11": "m11",
    "13": "13", "maj13": "maj13", "min13": "m13",
    "sus4(b7)": "7sus4", "sus2(b7)": "7sus2", "maj(9)": "add9", "min(9)": "madd9",
}

_LABEL = re.compile(r"^([A-G])([#b]*)(?::([^/]+))?(?:/([#b]*)(\d+))?$")


@dataclass(frozen=True)
class Chord:
    harte: str  # normalised: a bare root becomes "<root>:maj"
    simple: Optional[str]
    no_chord: bool


def parse(label: str) -> Chord:
    """Raises ValueError for a label that is not Harte notation at all."""
    label = label.strip()
    if label in (NO_CHORD, UNKNOWN):
        return Chord(label, NO_CHORD, True)
    m = _LABEL.match(label)
    if not m:
        raise ValueError(f"not a Harte chord label: {label!r}")
    letter, accidentals, quality, bass_accidentals, bass_degree = m.groups()
    quality = quality or "maj"
    harte = f"{letter}{accidentals}:{quality}" + (f"/{bass_accidentals}{bass_degree}" if bass_degree else "")

    root = (_NATURAL[letter] + accidentals.count("#") - accidentals.count("b")) % 12
    bass = None
    if bass_degree:
        if int(bass_degree) not in _DEGREE:
            raise ValueError(f"not a Harte bass degree: {label!r}")
        semis = _DEGREE[int(bass_degree)] + bass_accidentals.count("#") - bass_accidentals.count("b")
        bass = (root + semis) % 12

    suffix = SUFFIXES.get(quality)
    if suffix is None:
        return Chord(harte, None, False)
    simple = NOTE_NAMES[root] + suffix
    if bass is not None and bass != root:
        simple += "/" + NOTE_NAMES[bass]
    return Chord(harte, simple, False)
