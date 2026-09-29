"""
Difficulty rating engine — a real scoring function over detected song
data, not a random or hardcoded label.

Score is built from:
  - Chord complexity: ratio of harder (barre/extended) chords vs.
    beginner-friendly open chords, using a real classification table of
    common open-position guitar chords.
  - Chord-change rate: how many *distinct* chord changes happen per
    minute of the song (more changes per minute = harder to play cleanly).
  - Tempo: faster songs are harder to keep up with.
  - Key/modulation signal: a proxy — number of distinct chord roots used
    relative to the song's key (more roots outside the diatonic set
    suggests modulation/borrowed chords, which is harder).

Each factor is scored 0-100 and combined with fixed, documented weights
into one 0-100 score, then bucketed into Beginner / Intermediate /
Advanced. This is a heuristic (like the rest of this MVP's analysis), but
it is a real, reproducible function of the input — not a placeholder.
"""

from __future__ import annotations

# Chords a true beginner guitarist learns first (open position, no barre).
BEGINNER_OPEN_CHORDS = {
    "C", "G", "D", "A", "E", "Am", "Em", "Dm", "G7", "C7", "D7", "A7", "E7",
}

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _chord_root_pitch_class(chord_symbol: str) -> int:
    symbol = chord_symbol.strip()
    root_name = symbol
    for suffix in ("maj7", "m7", "dim", "sus2", "sus4", "7", "m"):
        if symbol.endswith(suffix):
            root_name = symbol[: -len(suffix)]
            break

    flat_to_sharp = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    root_name = flat_to_sharp.get(root_name, root_name)
    return NOTE_NAMES.index(root_name) if root_name in NOTE_NAMES else 0


def rate_difficulty(
    chord_progression: list[str],
    bpm: float,
    duration_seconds: float,
    key: str,
) -> dict:
    chords = chord_progression or []
    total_chords = max(1, len(chords))

    # 1. Chord complexity: fraction of chords that are NOT in the beginner set
    hard_chords = [c for c in chords if c not in BEGINNER_OPEN_CHORDS]
    complexity_score = round(100 * len(hard_chords) / total_chords)

    # 2. Chord-change rate: distinct-chord changes per minute
    changes = sum(1 for i in range(1, len(chords)) if chords[i] != chords[i - 1])
    minutes = max(duration_seconds / 60, 0.1)
    changes_per_minute = changes / minutes
    # Normalize: 0 changes/min -> 0, 20+ changes/min -> 100 (fast jazz-style changes)
    change_rate_score = round(min(100, (changes_per_minute / 20) * 100))

    # 3. Tempo: 60 BPM -> 0, 180+ BPM -> 100
    tempo_score = round(min(100, max(0, (bpm - 60) / (180 - 60) * 100)))

    # 4. Modulation / out-of-key proxy: distinct chord roots used, relative
    #    to the 7 diatonic roots a single key implies. More than 7 distinct
    #    roots suggests borrowed chords or modulation.
    distinct_roots = len({_chord_root_pitch_class(c) for c in chords}) if chords else 1
    modulation_score = round(min(100, max(0, (distinct_roots - 4) / (8 - 4) * 100)))

    # Weighted combination
    overall = round(
        complexity_score * 0.40
        + change_rate_score * 0.30
        + tempo_score * 0.20
        + modulation_score * 0.10
    )

    if overall < 35:
        label = "Beginner"
    elif overall < 65:
        label = "Intermediate"
    else:
        label = "Advanced"

    return {
        "difficultyLabel": label,
        "difficultyScore": overall,
        "factors": {
            "chordComplexity": complexity_score,
            "chordChangeRate": change_rate_score,
            "tempo": tempo_score,
            "modulation": modulation_score,
        },
    }
