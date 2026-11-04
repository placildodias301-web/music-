"""
MusicXML writer shared by every transcription engine: one or more parts, each
with one or more staves (a grand staff is one part with two), any number of
voices per staff, TAB tuning, chord symbols, dynamics / pedal directions, and
per-note fingering, plucking, bowing, slurs, staccato, hammer-ons, pull-offs
and slides. Written by hand rather than through music21 so the <technical>
tags, voices and staff details come out exactly as alphaTab reads them.

Input times are quarter notes from the start of bar 1 on a 16th-note grid.

score = {
  "title", "bpm", "beatsPerBar", "key", "chords": [{"start", "end", "name"}],
  "parts": [{
      "name", "program" (General MIDI, 1-based), "clefs": [(sign, line, octave change), ...] (one per staff),
      "tab": {"tuning": {string: midi}, "spelling": {string: (step, octave)}} or None,
      "showChords": bool,
      "notes": [{"start", "end", "midi", "staff", "voice", and optional "string", "fret", "fingering",
                 "pluck", "bow" ("up"/"down"), "staccato", "slur" ("start"/"stop"/"both"),
                 "technique"/"techniqueStart" ("hammer-on"/"pull-off"/"slide")}],
      "directions": [{"start", "staff", "dynamic": "mf"} or {"start", "staff", "pedal": "start"/"stop"}],
  }],
}
"""

import math
import re
from typing import Optional
from xml.sax.saxutils import escape

DIVISIONS = 4  # per quarter note: the 16th-note grid
_NOTE_VALUES = [(16, "whole", 0), (12, "half", 1), (8, "half", 0), (6, "quarter", 1),
                (4, "quarter", 0), (3, "eighth", 1), (2, "eighth", 0), (1, "16th", 0)]
_KIND = {
    "": "major", "m": "minor", "7": "dominant", "maj7": "major-seventh", "m7": "minor-seventh",
    "dim": "diminished", "dim7": "diminished-seventh", "aug": "augmented", "+": "augmented",
    "sus2": "suspended-second", "sus4": "suspended-fourth", "m7b5": "half-diminished",
    "6": "major-sixth", "m6": "minor-sixth", "9": "dominant-ninth",
}
DYNAMICS = ("pp", "p", "mp", "mf", "f", "ff")
SLUR_NUMBER = 7  # phrase slurs; 1-6 are the per-string hammer-on / pull-off slurs


def split_value(divs: int) -> list[tuple[int, str, int]]:
    parts = []
    while divs > 0:
        for d, name, dots in _NOTE_VALUES:
            if d <= divs:
                parts.append((d, name, dots))
                divs -= d
                break
    return parts


def harmony_xml(name: str) -> str:
    m = re.match(r"^([A-G])([#b]?)(.*)$", name.rstrip("?"))
    if not m:
        return ""
    step, acc, rest = m.groups()
    suffix, _, bass = rest.partition("/")
    alter = {"#": "1", "b": "-1"}.get(acc)
    kind = _KIND.get(suffix, "major")
    # alphaTab shows the kind's text verbatim and ignores <bass>, so the slash rides in the text.
    text = suffix + (f"/{bass}" if bass else "")
    root = f"<root-step>{step}</root-step>" + (f"<root-alter>{alter}</root-alter>" if alter else "")
    return f'<harmony><root>{root}</root><kind text="{escape(text, {chr(34): "&quot;"})}">{kind}</kind></harmony>'


def pitch_xml(midi: int, key) -> str:
    from services.sheet_generation import _spell

    p = _spell(midi, key, lambda pitch: pitch)
    alter = int(p.accidental.alter) if p.accidental is not None else 0
    return (f"<pitch><step>{p.step}</step>" + (f"<alter>{alter}</alter>" if alter else "")
            + f"<octave>{p.octave}</octave></pitch>")


def voice_events(notes: list[dict], cuts: list[int], total: int) -> list[tuple[int, int, list[dict]]]:
    """One voice's (start, length, notes) in divisions, rests as empty lists, cut at bar lines and markers."""
    by_start: dict[int, list[dict]] = {}
    for n in notes:
        by_start.setdefault(n["_s"], []).append(n)
    starts = sorted(by_start)
    events, t = [], 0
    for i, s in enumerate(starts):
        nxt = starts[i + 1] if i + 1 < len(starts) else total
        end = min(max(n["_e"] for n in by_start[s]), nxt)
        if s > t:
            events.append((t, s - t, []))
        if end > s:
            group = sorted(by_start[s], key=lambda n: (-n.get("string", 0), n["midi"]))
            events.append((s, end - s, group))
            t = end
        else:
            t = max(t, s)
    if t < total:
        events.append((t, total - t, []))
    out = []
    for s, length, group in events:
        bounds = [s] + [c for c in cuts if s < c < s + length] + [s + length]
        pieces = list(zip(bounds, bounds[1:]))
        for k, (a, b) in enumerate(pieces):
            # _cont: continues a tie from the previous piece; _more: ties into the next one.
            marked = [{**n, "_cont": k > 0, "_more": k < len(pieces) - 1} for n in group]
            out.append((a, b - a, marked))
    return out


def _note_xml(n: Optional[dict], length: int, voice: int, staff: Optional[int], stem: Optional[str],
              chord_member: bool, tie_start: bool, tie_stop: bool, key, tab: bool) -> str:
    out = []
    values = split_value(length)
    for k, (d, name, dots) in enumerate(values):
        first, last = k == 0, k == len(values) - 1
        x = ["<note>"]
        if chord_member:
            x.append("<chord/>")
        x.append("<rest/>" if n is None else pitch_xml(int(n["midi"]), key))
        x.append(f"<duration>{d}</duration>")
        ties = []
        if n is not None:
            if tie_stop or not first:
                ties.append("stop")
            if tie_start or not last:
                ties.append("start")
            x.extend(f'<tie type="{t}"/>' for t in ties)
        x.append(f"<voice>{voice}</voice><type>{name}</type>" + "<dot/>" * dots)
        if n is not None and stem:
            x.append(f"<stem>{stem}</stem>")
        if staff is not None:
            x.append(f"<staff>{staff}</staff>")
        if n is not None:
            notations = [f'<tied type="{t}"/>' for t in ties]
            tech: list[str] = []
            if tab and n.get("string") is not None and n.get("fret") is not None:
                tech += [f"<string>{n['string']}</string>", f"<fret>{n['fret']}</fret>"]
            head = first and not tie_stop
            if head:
                if n.get("fingering") is not None:
                    tech.append(f"<fingering>{n['fingering']}</fingering>")
                if n.get("pluck"):
                    tech.append(f"<pluck>{n['pluck']}</pluck>")
                if n.get("bow") == "down":
                    tech.append("<down-bow/>")
                elif n.get("bow") == "up":
                    tech.append("<up-bow/>")
                # Hammer-ons / pull-offs are slurred in notation; the slur (numbered by
                # string) also carries the pair through alphaTab, whose importer drops
                # <hammer-on> because it indexes notes by string before reading <string>.
                technique, start_tech = n.get("technique"), n.get("techniqueStart")
                string_no = n.get("string") or 1
                if technique in ("hammer-on", "pull-off"):
                    notations.append(f'<slur type="stop" number="{string_no}"/>')
                if start_tech in ("hammer-on", "pull-off"):
                    notations.append(f'<slur type="start" number="{string_no}"/>')
                if start_tech == "hammer-on":
                    tech.append('<hammer-on type="start">H</hammer-on>')
                elif start_tech == "pull-off":
                    tech.append('<pull-off type="start">P</pull-off>')
                if start_tech == "slide":
                    notations.append('<slide type="start" line-type="solid"/>')
                if technique == "slide":
                    notations.append('<slide type="stop"/>')
                slur = n.get("slur")
                if slur in ("stop", "both"):
                    notations.append(f'<slur type="stop" number="{SLUR_NUMBER}"/>')
                if slur in ("start", "both"):
                    notations.append(f'<slur type="start" number="{SLUR_NUMBER}"/>')
                if n.get("staccato"):
                    notations.append("<articulations><staccato/></articulations>")
            if tech:
                notations.append("<technical>" + "".join(tech) + "</technical>")
            if notations:
                x.append("<notations>" + "".join(notations) + "</notations>")
        x.append("</note>")
        out.append("".join(x))
    return "".join(out)


def _direction_xml(d: dict, staff: Optional[int]) -> str:
    staff_tag = f"<staff>{staff}</staff>" if staff is not None else ""
    if d.get("dynamic") in DYNAMICS:
        return (f'<direction placement="below"><direction-type><dynamics><{d["dynamic"]}/></dynamics>'
                f"</direction-type>{staff_tag}</direction>")
    if d.get("pedal") in ("start", "stop"):
        return (f'<direction placement="below"><direction-type><pedal type="{d["pedal"]}" line="yes"/>'
                f"</direction-type>{staff_tag}</direction>")
    return ""


def _to_divs(q: float) -> int:
    return int(round(float(q) * DIVISIONS))


def build_score_xml(score: dict) -> str:
    from services.sheet_generation import _key_signature

    beats_per_bar = int(score.get("beatsPerBar") or 4)
    bar = beats_per_bar * DIVISIONS
    bpm = round(float(score.get("bpm") or 120))
    key = _key_signature(score.get("key", ""))
    fifths = key.sharps if key is not None else 0
    mode = key.mode if key is not None else "major"
    chords = sorted((_to_divs(c["start"]), c["name"]) for c in score.get("chords", []) if c.get("name"))
    parts = [p for p in score.get("parts", []) if p.get("notes")] or score.get("parts", [])[:1]

    prepared = []
    end_of_music = bar
    for part in parts:
        notes = []
        for n in part.get("notes", []):
            s, e = _to_divs(n["start"]), _to_divs(n["end"])
            notes.append({**n, "_s": s, "_e": max(e, s + 1)})
        end_of_music = max([end_of_music] + [n["_e"] for n in notes])
        prepared.append((part, notes))
    end_of_music = max([end_of_music] + [c[0] + 1 for c in chords])
    total = math.ceil(end_of_music / bar) * bar
    bar_cuts = list(range(bar, total, bar))
    chord_map = dict(chords)

    part_list, part_bodies = [], []
    channel = 0
    for idx, (part, notes) in enumerate(prepared):
        pid = f"P{idx + 1}"
        channel = channel + 1 if channel + 1 != 10 else 11  # channel 10 is percussion
        n_staves = max(1, len(part.get("clefs") or [None]))
        tab = part.get("tab")
        name = escape(str(part.get("name") or "Part"))
        part_list.append(
            f'<score-part id="{pid}"><part-name>{name}</part-name>'
            f'<score-instrument id="{pid}-I1"><instrument-name>{name}</instrument-name></score-instrument>'
            f'<midi-instrument id="{pid}-I1"><midi-channel>{min(channel, 16)}</midi-channel>'
            f'<midi-program>{int(part.get("program") or 1)}</midi-program></midi-instrument></score-part>'
        )

        # Voices per staff; each staff keeps its first voice even when empty, to hold rests and markings.
        voices: dict[int, list[int]] = {}
        for n in notes:
            n["staff"] = int(n.get("staff") or 1)
            n["voice"] = int(n.get("voice") or (1 if n["staff"] == 1 else 5))
            voices.setdefault(n["staff"], [])
            if n["voice"] not in voices[n["staff"]]:
                voices[n["staff"]].append(n["voice"])
        for st in range(1, n_staves + 1):
            vs = sorted(voices.get(st, []))
            voices[st] = vs or [1 if st == 1 else 4 * (st - 1) + 1]
        directions_by_staff: dict[int, dict[int, list[dict]]] = {}
        for d in part.get("directions", []):
            st = int(d.get("staff") or 1)
            directions_by_staff.setdefault(st, {}).setdefault(_to_divs(d["start"]), []).append(d)

        streams = []  # (staff, voice, events, primary)
        for st in range(1, n_staves + 1):
            for vi, v in enumerate(voices[st]):
                primary = vi == 0
                cuts = set(bar_cuts)
                if primary:
                    cuts |= set(directions_by_staff.get(st, {}))
                    if st == 1 and part.get("showChords"):
                        cuts |= set(chord_map)
                v_notes = [n for n in notes if n["staff"] == st and n["voice"] == v]
                stem = None if len(voices[st]) == 1 else ("up" if primary else "down")
                streams.append((st, v, voice_events(v_notes, sorted(cuts), total), primary, stem))

        measures = []
        for m in range(total // bar):
            lo, hi = m * bar, (m + 1) * bar
            x = [f'<measure number="{m + 1}">']
            if m == 0:
                attrs = [f"<divisions>{DIVISIONS}</divisions>",
                         f"<key><fifths>{fifths}</fifths><mode>{mode}</mode></key>",
                         f"<time><beats>{beats_per_bar}</beats><beat-type>4</beat-type></time>"]
                if n_staves > 1:
                    attrs.append(f"<staves>{n_staves}</staves>")
                for st, clef in enumerate(part.get("clefs") or [("G", 2, 0)], start=1):
                    sign, line, octave = clef
                    number = f' number="{st}"' if n_staves > 1 else ""
                    octave_tag = f"<clef-octave-change>{octave}</clef-octave-change>" if octave else ""
                    attrs.append(f"<clef{number}><sign>{sign}</sign><line>{line}</line>{octave_tag}</clef>")
                if tab:
                    order = sorted(tab["tuning"], reverse=True)  # line 1 = the bottom TAB line (highest string number)
                    tuning = "".join(
                        f'<staff-tuning line="{line}"><tuning-step>{tab["spelling"][s][0]}</tuning-step>'
                        f'<tuning-octave>{tab["spelling"][s][1]}</tuning-octave></staff-tuning>'
                        for line, s in enumerate(order, start=1)
                    )
                    number = ' number="1"' if n_staves > 1 else ""
                    attrs.append(f"<staff-details{number}><staff-lines>{len(tab['tuning'])}</staff-lines>{tuning}</staff-details>")
                x.append("<attributes>" + "".join(attrs) + "</attributes>")
                if idx == 0:
                    x.append(
                        '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
                        f'<per-minute>{bpm}</per-minute></metronome></direction-type><sound tempo="{bpm}"/></direction>'
                    )
            for si, (st, v, events, primary, stem) in enumerate(streams):
                if si > 0:
                    x.append(f"<backup><duration>{bar}</duration></backup>")
                staff_tag = st if n_staves > 1 else None
                for s, length, group in events:
                    if not (lo <= s < hi):
                        continue
                    if primary:
                        for d in directions_by_staff.get(st, {}).get(s, []):
                            x.append(_direction_xml(d, staff_tag))
                        if st == 1 and part.get("showChords") and s in chord_map:
                            x.append(harmony_xml(chord_map[s]))
                    if not group:
                        x.append(_note_xml(None, length, v, staff_tag, None, False, False, False, key, bool(tab)))
                    for gi, n in enumerate(group):
                        x.append(_note_xml(n, length, v, staff_tag, stem, gi > 0, bool(n.get("_more")),
                                           bool(n.get("_cont")), key, bool(tab)))
            x.append("</measure>")
            measures.append("".join(x))
        part_bodies.append(f'<part id="{pid}">' + "".join(measures) + "</part>")

    title = escape(str(score.get("title") or ""))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
        '"http://www.musicxml.org/dtds/partwise.dtd">\n'
        '<score-partwise version="4.0">'
        f"<work><work-title>{title}</work-title></work>"
        "<part-list>" + "".join(part_list) + "</part-list>"
        + "".join(part_bodies) + "</score-partwise>\n"
    )
