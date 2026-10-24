"""
AI sheet generation (MVP feature 10): a song -> a piano lead sheet in MusicXML.

  right hand  = the sung melody: Demucs vocals -> Basic Pitch notes (Spotify, Apache-2.0),
                kept only where pYIN agrees (drops harmonics / guitar bleed), with intro/outro
                talking removed by PANNs (code MIT, weights CC-BY-4.0: credit the authors).
  left hand   = built from the chord analysis we already have, not "heard" from the recording:
                transcribing an accompaniment is far less reliable than voicing known chords.
  chord names = the same chord timeline, so guitar/ukulele players can strum along.

Timing is snapped to the song's own detected beats (not a fixed tempo grid), so a singer who
drifts a little still lands on the right beat. The result is a draft: the app's editor is
where wrong notes get fixed.
"""

import logging
import math
import os
import tempfile
import threading
import uuid

import numpy as np
import soundfile as sf

from services import stem_separation as ss
from services.analysis_engine import analyze
from services.audio_extract import cleanup, extract_audio_to_wav

logger = logging.getLogger(__name__)

PITCH_SR, PITCH_HOP = 22050, 256
FPS = PITCH_SR / PITCH_HOP
AGREE = 0.35  # share of a note's sung frames where pYIN is within half a semitone
SLIDE_STD = 0.8  # semitones: held (sung) notes stay put, slides/speech wander
MERGE_GAP = 0.12  # s: same pitch split by a tiny gap is one note
ONSET_PULL = 0.12  # s: a note start may move back to a vocal onset this much earlier
MIN_NOTE = 0.07  # s
TALK_RUN_S = 2  # seconds of talking in a row (at the clip's start or end) to drop
GRID = 0.5  # quarter lengths: eighth notes. ponytail: 16ths/triplets are simplified; finer grid once the editor exists
LEFT_HAND_STYLES = ("block", "bass", "none")


class SheetError(Exception):
    """User-safe error - the message is shown in the UI as-is."""


# ── melody ─────────────────────────────────────────────────────────────────

_models: dict = {}
_models_lock = threading.Lock()


def _basic_pitch():
    with _models_lock:
        if "bp" not in _models:
            from basic_pitch import ICASSP_2022_MODEL_PATH
            from basic_pitch.inference import Model

            _models["bp"] = Model(ICASSP_2022_MODEL_PATH)  # ONNX runtime, no TensorFlow needed
        return _models["bp"]


PANNS_DIR = os.path.join(os.path.expanduser("~"), "panns_data")
PANNS_FILES = {  # panns_inference fetches these with `wget`, which Windows doesn't have
    "class_labels_indices.csv": "http://storage.googleapis.com/us_audioset/youtube_corpus/v1/csv/class_labels_indices.csv",
    "Cnn14_mAP=0.431.pth": "https://zenodo.org/record/3987831/files/Cnn14_mAP%3D0.431.pth?download=1",  # ~312 MB
}


def _ensure_panns_files() -> None:
    import httpx

    os.makedirs(PANNS_DIR, exist_ok=True)
    for name, url in PANNS_FILES.items():
        path = os.path.join(PANNS_DIR, name)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            continue
        tmp = path + ".part"
        with httpx.stream("GET", url, follow_redirects=True, timeout=60) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in r.iter_bytes(1 << 20):
                    f.write(chunk)
        os.replace(tmp, path)


def _talk_tagger():
    """PANNs audio tagger, or None if it isn't installed / its weights can't be loaded."""
    with _models_lock:
        if "panns" not in _models:
            try:
                _ensure_panns_files()
                from panns_inference import AudioTagging, labels

                tagger = AudioTagging(checkpoint_path=None, device="cpu")
                speech = labels.index("Speech")
                sing = [labels.index(n) for n in ("Singing", "Male singing", "Female singing", "Choir", "Child singing")]
                _models["panns"] = (tagger, speech, sing)
            except Exception:
                logger.warning("PANNs not available; talking won't be filtered out of the melody", exc_info=True)
                _models["panns"] = None
        return _models["panns"]


def talk_seconds(vocals_path: str) -> set[int]:
    """Whole seconds of intro/outro talking. Mid-song "talk" is more often fast singing, so it stays."""
    tagger = _talk_tagger()
    if tagger is None:
        return set()
    import librosa

    model, speech, sing = tagger
    y, _ = librosa.load(vocals_path, sr=32000, mono=True)
    if not len(y):
        return set()
    chunks = np.stack([np.pad(y[i:i + 32000], (0, max(0, 32000 - len(y[i:i + 32000])))) for i in range(0, len(y), 32000)])
    probs, _ = model.inference(chunks)
    talk = [p[speech] > p[sing].max() and p[speech] > 0.2 for p in probs]
    out, run = set(), []
    for i, t in enumerate(talk + [False]):
        if t:
            run.append(i)
            continue
        if len(run) >= TALK_RUN_S and (run[0] <= 1 or run[-1] >= len(talk) - 2):
            out.update(run)
        run = []
    return out


def transcribe_melody(vocals_path: str) -> list[tuple[float, float, int]]:
    """The sung line as (start_s, end_s, midi), one note at a time."""
    import librosa
    from basic_pitch.inference import predict

    talk = talk_seconds(vocals_path)
    y, _ = librosa.load(vocals_path, sr=PITCH_SR, mono=True)
    f0, voiced, prob = librosa.pyin(y, fmin=70, fmax=1100, sr=PITCH_SR, hop_length=PITCH_HOP)
    f0m = librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0))
    voiced = voiced & (prob > 0.3)
    onsets = librosa.onset.onset_detect(y=y, sr=PITCH_SR, hop_length=PITCH_HOP, backtrack=True, units="time")
    _, _, events = predict(
        vocals_path, _basic_pitch(), onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=80,
        minimum_frequency=80, maximum_frequency=1100, melodia_trick=True,
    )

    kept = []
    for s, e, p, *_ in events:
        if int((s + e) / 2) in talk:
            continue
        fr = np.arange(int(s * FPS), min(len(f0), int(e * FPS) + 1))
        v = fr[voiced[fr]] if len(fr) else fr
        if len(v) < 2:
            continue
        agree = float(np.mean(np.abs(f0m[v] - p) <= 0.5))
        if agree < AGREE or np.std(f0m[v]) > SLIDE_STD:
            continue
        kept.append([float(s), float(e), int(p), agree])

    line: list[list] = []  # one note at a time: keep the one pYIN agrees with more
    for n in sorted(kept):
        if line and n[0] < line[-1][1]:
            if n[3] <= line[-1][3]:
                continue
            line[-1][1] = n[0]
            if line[-1][1] - line[-1][0] < MIN_NOTE:
                line.pop()
        line.append(n)

    merged: list[list] = []
    for n in line:
        if merged and n[2] == merged[-1][2] and n[0] - merged[-1][1] < MERGE_GAP:
            merged[-1][1] = max(merged[-1][1], n[1])
        else:
            merged.append(n)

    prev_end = 0.0
    for n in merged:
        earlier = onsets[(onsets < n[0]) & (onsets >= n[0] - ONSET_PULL) & (onsets >= prev_end)]
        if len(earlier):
            n[0] = float(earlier[-1])
        prev_end = n[1]
    return [(s, e, p) for s, e, p, _ in merged if e - s >= MIN_NOTE]


# ── score ──────────────────────────────────────────────────────────────────

def _beat_clock(analysis: dict):
    """seconds -> beats (quarter notes), following the detected beats so tempo drift is absorbed."""
    beats = np.asarray(analysis.get("beats") or [], dtype=float)
    spb = 60.0 / max(float(analysis.get("bpm") or 120.0), 1.0)
    if len(beats) < 2:
        return lambda t: np.asarray(t, dtype=float) / spb

    def clock(t):
        t = np.asarray(t, dtype=float)
        inside = np.interp(t, beats, np.arange(len(beats)))
        before = (t - beats[0]) / spb
        after = len(beats) - 1 + (t - beats[-1]) / spb
        return np.where(t < beats[0], before, np.where(t > beats[-1], after, inside))

    return clock


def _key_signature(label: str):
    from music21 import key as m21key

    parts = (label or "").replace("Minor", "minor").replace("Major", "major").split()
    if not parts:
        return None
    tonic = parts[0]
    mode = "minor" if (len(parts) > 1 and parts[1].lower() == "minor") or tonic.endswith("m") else "major"
    try:
        k = m21key.Key(tonic.rstrip("m").replace("b", "-") if len(tonic) > 1 else tonic, mode)
    except Exception:
        return None
    if abs(k.sharps) > 6:  # the engine names keys with sharps: D# major (9 sharps) is written E-flat major (3 flats)
        k = m21key.Key(k.tonic.getEnharmonic().name, mode)
    return k


def _key_label(label: str) -> str:
    """The key as written on the sheet ("D# Major" from the engine -> "Eb Major")."""
    k = _key_signature(label)
    return f"{k.tonic.name.replace('-', 'b')} {k.mode.capitalize()}" if k is not None else label


_FLAT_ROOTS = {"C#": "D-", "D#": "E-", "F#": "G-", "G#": "A-", "A#": "B-"}


def _chord_figure(name: str, key) -> str:
    """Engine chord name -> music21 figure, spelled with flats in flat keys (E-flat major shows Ab, not G#)."""
    if len(name) > 1 and name[1] == "b":
        return name[0] + "-" + name[2:]
    root = name[:2] if len(name) > 1 and name[1] == "#" else name[:1]
    if key is not None and key.sharps < 0 and root in _FLAT_ROOTS:
        return _FLAT_ROOTS[root] + name[len(root):]
    return name


def _spell(midi: int, key, cls):
    """A note (or other pitched object via `cls`) named the way the key writes it: A# in G# minor, not Bb."""
    from music21 import pitch

    p = pitch.Pitch(midi=midi)
    if key is not None:
        names = {sp.pitchClass: sp.name for sp in key.getScale().getPitches()}
        want = names.get(p.pitchClass)
        options = [p, p.getEnharmonic(), p.getHigherEnharmonic(), p.getLowerEnharmonic()]
        match = next((o for o in options if o is not None and want and o.name == want), None)
        if match is None:  # not in the scale: sharps in sharp keys, flats in flat keys
            accidental = "sharp" if key.sharps >= 0 else "flat"
            match = next((o for o in options if o is not None and o.accidental is not None and o.accidental.name == accidental), p)
        p = match
    return cls(p)


def _to_xml(score) -> str:
    """MusicXML text without music21's fillers: its name as "composer" and the title repeated as movement."""
    import re

    from music21.musicxml.m21ToXml import GeneralObjectExporter

    xml = GeneralObjectExporter(score).parse().decode("utf-8")
    xml = re.sub(r"\s*<creator type=\"composer\">Music21</creator>", "", xml)
    return re.sub(r"\s*<movement-title>[^<]*</movement-title>", "", xml)


def transpose_musicxml(xml: str, semitones: int) -> str:
    """Same notes and rhythm, every pitch moved: notes, chord names and key signature together."""
    from music21 import converter, metadata

    score = converter.parseData(xml)
    md = score.metadata
    title = (md.title or md.movementName or "") if md else ""
    if semitones:
        score = score.transpose(semitones)
    # Without this music21 writes its own name ("Music21") as the title of the copy.
    score.metadata = metadata.Metadata(title=title)
    return _to_xml(score)


def _chord_pitches(name: str) -> list[int]:
    from music21 import harmony

    if not name or name in ("N", "N.C.", "-"):
        return []
    fig = name[0] + name[1:].replace("b", "-", 1) if len(name) > 1 and name[1] == "b" else name
    try:
        return [p.midi for p in harmony.ChordSymbol(fig).pitches]
    except Exception:
        return []


def sheet_model(melody: list[tuple[float, float, int]], analysis: dict, title: str = "Song") -> dict:
    """AI result -> the editable sheet: notes and chords in quarter notes from bar 1, plus tempo/meter/key.

    This is what the editor changes; `render` turns it into MusicXML each time.
    """
    beats_per_bar = int(analysis.get("beatsPerBar") or 4)
    bar = float(beats_per_bar)
    clock = _beat_clock(analysis)
    downbeats = analysis.get("downbeats") or analysis.get("beats") or [0.0]
    origin = float(clock(downbeats[0]))
    q = lambda sec, grid: round((float(clock(sec)) - origin) / grid) * grid

    notes = [(q(s, GRID), q(e, GRID), p) for s, e, p in melody]
    chords = [(q(c["start"], 1.0), q(c["end"], 1.0), c["chord"]) for c in analysis.get("chordTimeline") or []]
    earliest = min([n[0] for n in notes] + [c[0] for c in chords] + [0.0])
    shift = math.ceil(-earliest / bar) * bar if earliest < 0 else 0.0  # whole pickup bars of rest

    # A male voice sits low for the treble staff, so lift the line an octave when needed.
    pitches = [p for *_, p in notes]
    lift = 12 if pitches and np.median(pitches) < 60 else 0
    clean: list[list] = []
    for start, end, p in sorted(notes):
        start, end = start + shift, max(end, start + GRID) + shift
        if clean and start < clean[-1][1]:
            if start <= clean[-1][0]:
                continue  # two notes snapped onto the same slot: keep the first
            clean[-1][1] = start
        clean.append([start, end, p + lift])
    for i in range(len(clean)):
        nxt = clean[i + 1][0] if i + 1 < len(clean) else clean[i][1]
        if 0 < nxt - clean[i][1] <= GRID:
            clean[i][1] = nxt  # legato over tiny gaps: fewer stray eighth rests

    merged: list[list] = []
    for start, end, name in sorted(chords):
        if end <= start or not _chord_pitches(name):
            continue
        if merged and merged[-1][2] == name and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end, name])

    return {
        "title": title,
        "bpm": round(float(analysis.get("bpm") or 120), 1),
        "beatsPerBar": beats_per_bar,
        "key": _key_label(analysis.get("key", "")),
        "notes": [{"start": s, "end": e, "midi": int(p)} for s, e, p in clean],
        "chords": [{"start": s + shift, "end": e + shift, "name": n} for s, e, n in merged],
    }


def render(model: dict, left_hand: str = "block", semitones: int = 0) -> str:
    """Sheet model -> piano grand-staff MusicXML (melody right hand, chords left hand, chord names on top)."""
    from music21 import chord, clef, harmony, instrument, layout, metadata, meter, note, stream, tempo, tie

    beats_per_bar = int(model.get("beatsPerBar") or 4)
    bar = float(beats_per_bar)
    key_label = model.get("key", "")
    ks = _key_signature(key_label)

    rh, lh = stream.PartStaff(id="RH"), stream.PartStaff(id="LH")
    for part, c in ((rh, clef.TrebleClef()), (lh, clef.BassClef())):
        part.insert(0, instrument.Piano())
        part.insert(0, c)
        part.insert(0, meter.TimeSignature(f"{beats_per_bar}/4"))
        k = _key_signature(key_label)
        if k is not None:
            part.insert(0, k)
    rh.insert(0, tempo.MetronomeMark(number=round(float(model.get("bpm") or 120))))

    clean = sorted([float(n["start"]), float(n["end"]), int(n["midi"])] for n in model.get("notes", []) if n["end"] > n["start"])
    for i in range(1, len(clean)):  # an edit may leave overlaps: the later note wins
        if clean[i - 1][1] > clean[i][0]:
            clean[i - 1][1] = clean[i][0]
    clean = [n for n in clean if n[1] > n[0]]
    merged = sorted(
        [float(c["start"]), float(c["end"]), c["name"]] for c in model.get("chords", []) if c["end"] > c["start"] and _chord_pitches(c["name"])
    )

    # Right hand: notes and the rests between them, split (tied) wherever a chord changes, so every
    # chord name starts on a note or rest. A name in the middle of a held note makes music21 write
    # an extra voice 0, which alphaTab can't read, and alphaTab drops names placed mid-note anyway.
    changes = sorted({s for s, _, _ in merged})
    end_of_music = max([n[1] for n in clean] + [e for _, e, _ in merged] + [bar])
    end_of_music = math.ceil(end_of_music / bar) * bar  # finish the last bar with rests
    events, t = [], 0.0
    for start, end, p in clean + [[end_of_music, end_of_music, None]]:
        if start > t:
            events.append((t, start, None))  # rest
        if p is not None:
            events.append((start, end, p))
        t = max(t, end)
    for start, end, p in events:
        cuts = [start] + [c for c in changes if start < c < end] + [end]
        for i, (a, b) in enumerate(zip(cuts, cuts[1:])):
            el = note.Rest() if p is None else _spell(p, ks, note.Note)
            el.quarterLength = b - a
            if p is not None and len(cuts) > 2:
                el.tie = tie.Tie("start" if i == 0 else "stop" if i == len(cuts) - 2 else "continue")
            rh.insert(a, el)
    rh.makeNotation(inPlace=True)
    bars = list(rh.getElementsByClass("Measure"))

    for start, end, name in merged:
        symbol = harmony.ChordSymbol(_chord_figure(name, ks))
        symbol.quarterLength = 0  # a label, not a sounding note
        m = next((m for m in bars if m.offset <= start < m.offset + m.barDuration.quarterLength), None)
        if m is not None:
            m.insert(start - m.offset, symbol)
        if left_hand == "none":
            continue
        pcs = [p % 12 for p in _chord_pitches(name)]
        root = 36 + pcs[0] if pcs[0] >= 4 else 48 + pcs[0]  # root between E2 and D#3
        if left_hand == "bass":
            el = _spell(root, ks, note.Note)
        else:
            midis = sorted({root} | {root + ((pc - pcs[0]) % 12) for pc in pcs})
            el = chord.Chord([_spell(p, ks, note.Note) for p in midis])
        el.quarterLength = end - start
        lh.insert(start, el)

    score = stream.Score()
    score.metadata = metadata.Metadata(title=model.get("title") or "")
    score.insert(0, rh)
    score.insert(0, lh)
    score.insert(0, layout.StaffGroup([rh, lh], name="Piano", abbreviation="Pno.", symbol="brace"))
    if semitones:
        score = score.transpose(semitones)
        score.metadata = metadata.Metadata(title=model.get("title") or "")
    return _to_xml(score)


def build_score(melody: list[tuple[float, float, int]], analysis: dict, left_hand: str = "block", title: str = "Song") -> str:
    """Melody (seconds) + analysis -> MusicXML in one go."""
    return render(sheet_model(melody, analysis, title), left_hand)


# ── whole pipeline ─────────────────────────────────────────────────────────

def generate(input_path: str, title: str = "Song", left_hand: str = "block") -> dict:
    """Upload -> analysis + vocals -> melody -> sheet model + MusicXML. Takes roughly the song's length on a laptop CPU."""
    if left_hand not in LEFT_HAND_STYLES:
        left_hand = "block"
    wav = extract_audio_to_wav(input_path)
    try:
        analysis = analyze(wav)
    finally:
        cleanup(wav)

    mix = ss.decode_stereo(input_path)
    vocals = ss.separate(mix)["vocals"].mean(axis=0)
    vocals_path = os.path.join(tempfile.gettempdir(), f"wilsify-vocals-{uuid.uuid4().hex}.wav")
    try:
        sf.write(vocals_path, vocals, ss.SAMPLE_RATE, subtype="PCM_16")
        melody = transcribe_melody(vocals_path)
    finally:
        cleanup(vocals_path)
    if not melody:
        raise SheetError("No sung melody was found in this song. Sheet generation follows the vocals, so try a song with singing.")

    model = sheet_model(melody, analysis, title)
    return {
        "title": title,
        "model": model,
        "musicxml": render(model, left_hand),
        "bpm": model["bpm"],
        "key": model["key"],
        "timeSignature": f"{model['beatsPerBar']}/4",
        "noteCount": len(model["notes"]),
        "notice": "Draft made by AI from the vocals and the detected chords. Some notes may be wrong: use Edit to fix them.",
    }
