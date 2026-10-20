"""
MIDI export — turns a detected chord progression + tempo into a real,
downloadable Standard MIDI File (.mid), so a song's detected chords can be
opened in any DAW or MIDI player.

This is a genuine MIDI file (correct tempo meta-message, correct note
on/off events, correct ticks-per-beat), not a renamed audio file or a
placeholder. Each chord in the progression is rendered as a sustained
triad for one bar (4 beats at the detected BPM), which is an honest,
simple mapping — real chord-voicing/rhythm reconstruction is a much
harder problem than this MVP's chord *detection* step, so this keeps the
scope to "here are the chords, playable back", not "here is the original
performance".
"""

from __future__ import annotations

from io import BytesIO

from mido import Message, MidiFile, MidiTrack, MetaMessage, bpm2tempo

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Root MIDI note numbers for octave 3 (C3 = 48), so triads sit in a
# comfortable, non-muddy register.
ROOT_MIDI_BASE = 48

# Semitone offsets for each chord quality the analysis (or a transpose of
# it) can produce. Anything unrecognised falls back to its major/minor triad.
CHORD_OFFSETS = {
    "": [0, 4, 7],
    "m": [0, 3, 7],
    "7": [0, 4, 7, 10],
    "m7": [0, 3, 7, 10],
    "maj7": [0, 4, 7, 11],
    "dim": [0, 3, 6],
    "aug": [0, 4, 8],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
}

TICKS_PER_BEAT = 480
BEATS_PER_CHORD = 4  # one bar of 4/4 per chord


def _parse_chord(chord_symbol: str) -> tuple[int, list[int]]:
    """
    Parses a chord symbol like "C", "C#m", "Bb7", "D#m7" or "G/B" into
    (root_pitch_class 0-11, semitone offsets of its notes).
    """
    symbol = chord_symbol.strip().split("/")[0]
    root_len = 2 if len(symbol) > 1 and symbol[1] in "#b" else 1
    root_name, suffix = symbol[:root_len], symbol[root_len:]

    # Normalize flats to sharps (e.g. "Bb" -> "A#") so lookup is simple.
    FLAT_TO_SHARP = {
        "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
    }
    root_name = FLAT_TO_SHARP.get(root_name, root_name)

    try:
        pitch_class = NOTE_NAMES.index(root_name)
    except ValueError:
        pitch_class = 0  # fall back to C rather than raising, for a robust export

    offsets = CHORD_OFFSETS.get(suffix)
    if offsets is None:
        minor = suffix.startswith("m") and not suffix.startswith("maj")
        offsets = CHORD_OFFSETS["m" if minor else ""]
    return pitch_class, offsets


def build_midi_bytes(chord_progression: list[str], bpm: float) -> bytes:
    """
    Renders the chord progression as sustained chords at the given tempo
    and returns the raw .mid file bytes, ready to send as a download.
    """
    midi = MidiFile(ticks_per_beat=TICKS_PER_BEAT)
    track = MidiTrack()
    midi.tracks.append(track)

    track.append(MetaMessage("track_name", name="Wilsify AI - Detected Chords", time=0))
    track.append(MetaMessage("set_tempo", tempo=bpm2tempo(max(20, min(300, round(bpm)))), time=0))

    ticks_per_chord = TICKS_PER_BEAT * BEATS_PER_CHORD

    if not chord_progression:
        chord_progression = ["C"]

    for chord_symbol in chord_progression:
        pitch_class, offsets = _parse_chord(chord_symbol)
        notes = [ROOT_MIDI_BASE + pitch_class + offset for offset in offsets]

        # Note-on events for every chord tone at time 0 (relative to previous event)
        for i, note in enumerate(notes):
            track.append(Message("note_on", note=note, velocity=70, time=0 if i > 0 else 0))

        # Note-off events: first one carries the full chord duration, rest at time 0
        for i, note in enumerate(notes):
            track.append(Message("note_off", note=note, velocity=64, time=ticks_per_chord if i == 0 else 0))

    buffer = BytesIO()
    midi.save(file=buffer)
    return buffer.getvalue()
