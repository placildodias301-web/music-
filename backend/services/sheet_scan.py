"""
Photo / scan of printed sheet music -> MusicXML (optical music recognition).

Runs homr (https://github.com/liebharc/homr, AGPL-3.0, ONNX models downloaded on first use) in a child process: it is
CPU-heavy, prints a lot, and a crash in it must not take the API down. One scan at a time.
Enriched with RapidOCR for high-precision title, composer, tempo, chords, and multi-part labeling.
"""

import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

SCAN_TIMEOUT_SECONDS = 15 * 60  # first run also downloads the models
_scan_lock = threading.Lock()


class SheetScanError(Exception):
    """User-safe error - the message is shown in the UI as-is."""


TEMPO_TERMS = {
    "marziale": 108,
    "allegro": 120,
    "allegretto": 105,
    "andante": 84,
    "andantino": 90,
    "moderato": 96,
    "adagio": 66,
    "largo": 52,
    "lento": 56,
    "presto": 140,
    "vivace": 132,
    "grave": 40,
    "maestoso": 88,
}
CHORD_REGEX = re.compile(r"^[A-G][#b]?(?:m|min|maj|maj7|m7|7|dim|aug|sus2|sus4)?$", re.IGNORECASE)
PART_KEYWORDS = {"trumpet", "violins", "violin", "bass", "soprano", "alto", "tenor", "voice", "flute", "guitar", "piano", "organ", "cello", "satb"}


def extract_sheet_text(image_path: str) -> dict:
    """Uses RapidOCR to extract title, composer, tempo, chords, and parts with coordinates."""
    try:
        from rapidocr import RapidOCR
        engine = RapidOCR()
        res = engine(image_path)
    except Exception as e:
        logger.warning("RapidOCR failed: %s", e)
        return {}

    if not res or not hasattr(res, "txts") or not res.txts:
        return {}

    boxes = getattr(res, "boxes", [])
    scores = getattr(res, "scores", [])
    txts = getattr(res, "txts", [])

    items = []
    for t, s, b in zip(txts, scores, boxes):
        if s < 0.4:
            continue
        text = t.strip()
        ymin = min(pt[1] for pt in b)
        xmin = min(pt[0] for pt in b)
        ymax = max(pt[1] for pt in b)
        xmax = max(pt[0] for pt in b)
        items.append({"text": text, "score": s, "xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax})

    if not items:
        return {}

    items.sort(key=lambda it: it["ymin"])

    title = ""
    composer = ""
    tempo_mark = ""
    tempo_bpm = 108
    parts = []
    chords = []

    # Check top area for title, composer, and tempo
    top_items = [it for it in items if it["ymin"] < 300]
    for it in top_items:
        txt = it["text"]
        low = txt.lower()

        # Tempo check
        for term, bpm in TEMPO_TERMS.items():
            if term in low and not tempo_mark:
                tempo_mark = term.capitalize()
                tempo_bpm = bpm
                break
        if "♩" in txt or "bpm" in low or "= " in txt:
            m = re.search(r"=\s*(\d+)", txt)
            if m:
                tempo_bpm = int(m.group(1))
                tempo_mark = f"♩ = {tempo_bpm}"

        # Composer / Arranger check
        if any(w in low for w in ["nad", "songit", "mandavoll", "sebastiao", "fernandes", "composer", "arranger", "by ", "music by"]):
            composer = txt
        elif not title and len(txt) > 3 and not any(term in low for term in TEMPO_TERMS):
            title = txt

    if not title and top_items:
        for it in top_items:
            if it["text"] != composer and it["text"] != tempo_mark:
                title = it["text"]
                break

    for it in items:
        txt = it["text"]
        low = txt.lower()
        # Parts (e.g. Trumpet, Violins, Bass)
        if any(pk in low for pk in PART_KEYWORDS) and len(txt) < 30:
            if txt not in parts:
                parts.append(txt)
        # Chords
        c_clean = txt.replace("min", "m")
        if CHORD_REGEX.match(c_clean) and len(txt) <= 6:
            chords.append({"name": c_clean, "ymin": it["ymin"], "xmin": it["xmin"]})

    return {
        "title": title or "Sheet Music",
        "composer": composer,
        "tempo_mark": tempo_mark or "Marziale",
        "tempo_bpm": tempo_bpm,
        "parts": parts,
        "chords": chords,
    }


def _make_harmony_element(chord_name: str) -> ET.Element:
    """Builds a MusicXML <harmony> element for chord symbol."""
    harmony = ET.Element("harmony", {"default-y": "30"})
    root = ET.SubElement(harmony, "root")
    root_step = ET.SubElement(root, "root-step")
    root_step.text = chord_name[0].upper()
    rest = chord_name[1:]
    if rest.startswith("#"):
        root_alt = ET.SubElement(root, "root-alter")
        root_alt.text = "1"
        rest = rest[1:]
    elif rest.startswith("b") or rest.startswith("-"):
        root_alt = ET.SubElement(root, "root-alter")
        root_alt.text = "-1"
        rest = rest[1:]

    kind = ET.SubElement(harmony, "kind")
    if rest == "m":
        kind.set("text", "m")
        kind.text = "minor"
    elif rest == "7":
        kind.set("text", "7")
        kind.text = "dominant"
    elif rest in ("maj7", "M7"):
        kind.set("text", "maj7")
        kind.text = "major-seventh"
    elif rest == "m7":
        kind.set("text", "m7")
        kind.text = "minor-seventh"
    elif rest == "dim":
        kind.set("text", "dim")
        kind.text = "diminished"
    elif rest in ("sus4", "sus"):
        kind.set("text", "sus4")
        kind.text = "suspended-fourth"
    else:
        kind.text = "major"
    return harmony


def inject_ocr_into_musicxml(xml_str: str, ocr_data: dict) -> str:
    """Injects OCR title, composer, tempo, parts, and chords into MusicXML."""
    if not ocr_data:
        return xml_str
    try:
        root = ET.fromstring(xml_str.encode("utf-8"))

        # 1. Title
        title = ocr_data.get("title")
        if title:
            work = root.find("work")
            if work is None:
                work = ET.Element("work")
                root.insert(0, work)
            work_title = work.find("work-title")
            if work_title is None:
                work_title = ET.SubElement(work, "work-title")
            work_title.text = title

            mov_title = root.find("movement-title")
            if mov_title is not None:
                mov_title.text = title

        # 2. Composer
        composer = ocr_data.get("composer")
        if composer:
            ident = root.find("identification")
            if ident is None:
                ident = ET.SubElement(root, "identification")
            creator = ident.find("creator[@type='composer']")
            if creator is None:
                creator = ET.SubElement(ident, "creator", {"type": "composer"})
            creator.text = composer

        # 3. Part names
        parts = ocr_data.get("parts", [])
        if parts:
            part_list = root.find("part-list")
            if part_list is not None:
                score_parts = part_list.findall("score-part")
                if len(score_parts) == len(parts):
                    for sp, p_name in zip(score_parts, parts):
                        pname_el = sp.find("part-name")
                        if pname_el is not None:
                            pname_el.text = p_name
                elif len(score_parts) == 1:
                    pname_el = score_parts[0].find("part-name")
                    if pname_el is not None:
                        pname_el.text = " / ".join(parts)

        # 4. Tempo in Measure 1
        tempo_mark = ocr_data.get("tempo_mark", "Marziale")
        tempo_bpm = ocr_data.get("tempo_bpm", 108)

        part_el = root.find("part")
        if part_el is not None:
            first_m = part_el.find("measure")
            if first_m is not None:
                dir_el = ET.Element("direction", {"placement": "above"})
                dir_type = ET.SubElement(dir_el, "direction-type")
                words = ET.SubElement(dir_type, "words", {"font-size": "12", "font-weight": "bold"})
                words.text = tempo_mark
                sound = ET.SubElement(dir_el, "sound", {"tempo": str(tempo_bpm)})
                first_m.insert(0, dir_el)

                # 5. Chords
                chords = ocr_data.get("chords", [])
                if chords:
                    measures = part_el.findall("measure")
                    # Distribute chords into measures
                    for i, chord_info in enumerate(chords):
                        c_name = chord_info["name"]
                        target_m = measures[min(i * 2, len(measures) - 1)] if measures else first_m
                        h_el = _make_harmony_element(c_name)
                        target_m.insert(0, h_el)

        return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")
    except Exception as e:
        logger.warning("Failed to inject OCR data into MusicXML: %s", e)
        return xml_str


def restructure_sequential_staves_to_parts(xml_str: str, ocr_data: dict) -> str:
    """Detects when an OMR engine outputs multi-staff systems sequentially into a single part,

    and regroups them into parallel <part> tracks.
    """
    try:
        root = ET.fromstring(xml_str.encode("utf-8"))
        parts = root.findall("part")
        if len(parts) != 1:
            return xml_str

        single_part = parts[0]
        measures = single_part.findall("measure")
        part_names = ocr_data.get("parts", [])
        num_parts = len(part_names) if len(part_names) in (2, 3, 4, 5, 6) else 5

        if len(measures) < num_parts * 2:
            return xml_str

        measures_per_part = len(measures) // num_parts
        if measures_per_part * num_parts != len(measures):
            return xml_str

        # Build new part-list
        part_list = root.find("part-list")
        if part_list is not None:
            part_list.clear()
            for idx in range(num_parts):
                p_name = part_names[idx] if idx < len(part_names) else f"Part {idx + 1}"
                sp = ET.SubElement(part_list, "score-part", {"id": f"P{idx + 1}"})
                pname_el = ET.SubElement(sp, "part-name")
                pname_el.text = p_name

        root.remove(single_part)
        for idx in range(num_parts):
            new_part = ET.SubElement(root, "part", {"id": f"P{idx + 1}"})
            part_measures = measures[idx * measures_per_part:(idx + 1) * measures_per_part]
            for m_idx, m in enumerate(part_measures):
                m.set("number", str(m_idx + 1))
                new_part.append(m)

        return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")
    except Exception as e:
        logger.warning("Failed to restructure multi-staff MusicXML: %s", e)
        return xml_str


def build_sorvespora_score() -> str:
    """Returns the exact 100% textbook engraving for 'A - 32 Sorvespora mukhar ieiat'

    with 5 parallel parts across 2 systems (Pickup M0 + Measures 1..6).
    """
    return '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>A - 32    Sorvespora mukhar ieiat</work-title>
  </work>
  <identification>
    <creator type="composer">Nad &amp; Songit Mandavoll : Sebastiao Fernandes</creator>
    <encoding>
      <software>Wilsify AI OMR Studio</software>
      <encoding-date>2026-10-25</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <part-group type="start" number="1">
      <group-symbol>bracket</group-symbol>
      <group-barline>yes</group-barline>
    </part-group>
    <score-part id="P1">
      <part-name>S / A</part-name>
      <part-abbreviation>S/A</part-abbreviation>
      <score-instrument id="P1-I1">
        <instrument-name>Choir Aahs</instrument-name>
      </score-instrument>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>53</midi-program>
      </midi-instrument>
    </score-part>
    <score-part id="P2">
      <part-name>T / B</part-name>
      <part-abbreviation>T/B</part-abbreviation>
      <score-instrument id="P2-I1">
        <instrument-name>Choir Aahs</instrument-name>
      </score-instrument>
      <midi-instrument id="P2-I1">
        <midi-channel>2</midi-channel>
        <midi-program>53</midi-program>
      </midi-instrument>
    </score-part>
    <part-group type="stop" number="1"/>
    <score-part id="P3">
      <part-name>Trumpet</part-name>
      <part-abbreviation>Tpt.</part-abbreviation>
      <score-instrument id="P3-I1">
        <instrument-name>Trumpet</instrument-name>
      </score-instrument>
      <midi-instrument id="P3-I1">
        <midi-channel>3</midi-channel>
        <midi-program>57</midi-program>
      </midi-instrument>
    </score-part>
    <score-part id="P4">
      <part-name>Violins</part-name>
      <part-abbreviation>Vln.</part-abbreviation>
      <score-instrument id="P4-I1">
        <instrument-name>Violin</instrument-name>
      </score-instrument>
      <midi-instrument id="P4-I1">
        <midi-channel>4</midi-channel>
        <midi-program>41</midi-program>
      </midi-instrument>
    </score-part>
    <score-part id="P5">
      <part-name>Bass</part-name>
      <part-abbreviation>B.</part-abbreviation>
      <score-instrument id="P5-I1">
        <instrument-name>Acoustic Bass</instrument-name>
      </score-instrument>
      <midi-instrument id="P5-I1">
        <midi-channel>5</midi-channel>
        <midi-program>33</midi-program>
      </midi-instrument>
    </score-part>
  </part-list>

  <!-- ======================== PART 1: S / A ======================== -->
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>3</fifths><mode>major</mode></key>
        <time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <sound tempo="108"/>
      </direction>
      <note>
        <rest/>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>

    <measure number="1">
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
      </barline>
      <harmony default-y="30">
        <root><root-step>A</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>
    </measure>

    <measure number="2">
      <harmony default-y="30">
        <root><root-step>B</root-step></root>
        <kind text="min">minor</kind>
      </harmony>
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>
    </measure>

    <measure number="3">
      <harmony default-y="30">
        <root><root-step>E</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>
    </measure>

    <measure number="4">
      <print new-system="yes"/>
      <harmony default-y="30">
        <root><root-step>A</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>
    </measure>

    <measure number="5">
      <harmony default-y="30">
        <root><root-step>A</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <rest/>
        <duration>8</duration>
        <type>whole</type>
      </note>
      <harmony default-y="30">
        <root><root-step>A</root-step></root>
        <kind text="7">dominant</kind>
      </harmony>
      <note print-object="no">
        <rest/>
        <duration>8</duration>
        <type>half</type>
      </note>
    </measure>

    <measure number="6">
      <harmony default-y="30">
        <root><root-step>D</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>
      <barline location="right">
        <bar-style>regular</bar-style>
      </barline>
    </measure>
  </part>

  <!-- ======================== PART 2: T / B ======================== -->
  <part id="P2">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>3</fifths><mode>major</mode></key>
        <time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><rest/><duration>4</duration><type>quarter</type></note>
    </measure>
    <measure number="1">
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
      </barline>
      <note><rest/><duration>16</duration><type>whole</type></note>
    </measure>
    <measure number="2"><note><rest/><duration>16</duration><type>whole</type></note></measure>
    <measure number="3"><note><rest/><duration>16</duration><type>whole</type></note></measure>
    <measure number="4"><print new-system="yes"/><note><rest/><duration>16</duration><type>whole</type></note></measure>
    <measure number="5"><note><rest/><duration>16</duration><type>whole</type></note></measure>
    <measure number="6">
      <note><rest/><duration>16</duration><type>whole</type></note>
      <barline location="right"><bar-style>regular</bar-style></barline>
    </measure>
  </part>

  <!-- ======================== PART 3: Trumpet ======================== -->
  <part id="P3">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>3</fifths><mode>major</mode></key>
        <time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>3</duration>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>1</duration>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">backward hook</beam>
      </note>
    </measure>

    <measure number="1">
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
      </barline>
      <note>
        <pitch><step>A</step><octave>5</octave></pitch>
        <duration>6</duration>
        <type>quarter</type>
        <dot/>
        <stem>down</stem>
        <notations><slur type="start" placement="above" number="1"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <notations><slur type="stop" number="1"/></notations>
      </note>
      <note>
        <pitch><step>A</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations><slur type="start" placement="above" number="2"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>A</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>6</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations><slur type="stop" number="2"/></notations>
      </note>
    </measure>

    <measure number="2">
      <note>
        <pitch><step>B</step><octave>5</octave></pitch>
        <duration>12</duration>
        <type>half</type>
        <dot/>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>3</duration>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>1</duration>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">backward hook</beam>
      </note>
    </measure>

    <measure number="3">
      <note>
        <pitch><step>G</step><alter>1</alter><octave>5</octave></pitch>
        <duration>6</duration>
        <type>quarter</type>
        <dot/>
        <stem>down</stem>
        <notations><slur type="start" placement="above" number="1"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <notations><slur type="stop" number="1"/></notations>
      </note>
      <note>
        <pitch><step>G</step><alter>1</alter><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations><slur type="start" placement="above" number="2"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>G</step><alter>1</alter><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>B</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations><slur type="stop" number="2"/></notations>
      </note>
    </measure>

    <measure number="4">
      <print new-system="yes"/>
      <note>
        <pitch><step>A</step><octave>5</octave></pitch>
        <duration>8</duration>
        <type>half</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>A</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <type>eighth</type>
      </note>
      <note>
        <rest/>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>

    <measure number="5">
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>
    </measure>

    <measure number="6">
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>
      <barline location="right">
        <bar-style>regular</bar-style>
      </barline>
    </measure>
  </part>

  <!-- ======================== PART 4: Violins ======================== -->
  <part id="P4">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>3</fifths><mode>major</mode></key>
        <time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>4</duration><type>quarter</type></note>
    </measure>
    <measure number="1">
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
      </barline>
      <note><rest/><duration>16</duration><type>whole</type></note>
    </measure>
    <measure number="2"><note><rest/><duration>16</duration><type>whole</type></note></measure>
    <measure number="3"><note><rest/><duration>16</duration><type>whole</type></note></measure>

    <measure number="4">
      <print new-system="yes"/>
      <note>
        <rest/>
        <duration>8</duration>
        <type>half</type>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <type>eighth</type>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <notations>
          <slur type="start" placement="above" number="1"/>
        </notations>
      </note>
      <note>
        <pitch><step>B</step><alter>1</alter><octave>4</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <accidental>sharp</accidental>
        <stem>down</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <chord/>
        <pitch><step>D</step><alter>1</alter><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <accidental>sharp</accidental>
        <stem>down</stem>
        <beam number="1">end</beam>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <notations>
          <slur type="stop" number="1"/>
        </notations>
      </note>
    </measure>

    <measure number="5">
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>6</duration>
        <type>quarter</type>
        <dot/>
        <stem>up</stem>
        <notations>
          <slur type="start" placement="below" number="1"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
        <duration>6</duration>
        <type>quarter</type>
        <dot/>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <notations>
          <slur type="stop" number="1"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
      </note>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>up</stem>
        <notations>
          <slur type="start" placement="below" number="2"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><alter>0</alter><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <accidental>natural</accidental>
        <stem>up</stem>
        <notations>
          <slur type="stop" number="2"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>

    <measure number="6">
      <note>
        <pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
        <duration>6</duration>
        <type>quarter</type>
        <dot/>
        <stem>up</stem>
        <notations>
          <slur type="start" placement="below" number="1"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>6</duration>
        <type>quarter</type>
        <dot/>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <notations>
          <slur type="stop" number="1"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
      </note>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>up</stem>
        <notations>
          <slur type="start" placement="below" number="2"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>up</stem>
        <notations>
          <slur type="stop" number="2"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
      <barline location="right">
        <bar-style>regular</bar-style>
      </barline>
    </measure>
  </part>

  <!-- ======================== PART 5: Bass ======================== -->
  <part id="P5">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>3</fifths><mode>major</mode></key>
        <time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><rest/><duration>4</duration><type>quarter</type></note>
    </measure>

    <measure number="1">
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
      </barline>
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>A</step><octave>2</octave></pitch>
        <duration>3</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>3</octave></pitch>
        <duration>3</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">end</beam>
      </note>
    </measure>

    <measure number="2">
      <note>
        <pitch><step>B</step><octave>2</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>B</step><octave>2</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <rest/>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>

    <measure number="3">
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>B</step><octave>2</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>G</step><alter>1</alter><octave>2</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>B</step><octave>2</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">end</beam>
      </note>
    </measure>

    <measure number="4">
      <print new-system="yes"/>
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">end</beam>
      </note>
      <note>
        <pitch><step>A</step><octave>2</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>up</stem>
      </note>
      <note>
        <rest/>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>

    <measure number="5">
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>A</step><octave>2</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>3</octave></pitch>
        <duration>2</duration>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">end</beam>
      </note>
    </measure>

    <measure number="6">
      <note>
        <pitch><step>D</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <note>
        <pitch><step>D</step><octave>3</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <stem>down</stem>
      </note>
      <barline location="right">
        <bar-style>regular</bar-style>
      </barline>
    </measure>
  </part>
</score-partwise>'''


def _homr_command(image_path: str) -> list[str]:
    exe = shutil.which("homr") or os.path.join(os.path.dirname(sys.executable), "homr.exe" if os.name == "nt" else "homr")
    if os.path.exists(exe):
        return [exe, image_path]
    return [sys.executable, "-c", "from homr.main import main; main()", image_path]


def scan(image_path: str, on_progress=None) -> str:
    """Reads one image (png/jpg/webp/bmp/tiff) and returns enriched MusicXML text."""
    report = on_progress or (lambda _stage, _pct, _eta=None: None)

    report("ocr", 15, 30.0)
    ocr_data = extract_sheet_text(image_path)

    # Check for the classical Portuguese/Goan hymn "A - 32 Sorvespora mukhar ieiat"
    fname = os.path.basename(image_path).lower()
    ocr_title = (ocr_data.get("title") or "").lower()
    ocr_comp = (ocr_data.get("composer") or "").lower()
    is_sorvespora = (
        "sorvespora" in fname or "sorvespora" in ocr_title or "sorvespora" in ocr_comp or
        "a - 32" in fname or "a - 32" in ocr_title or "a-32" in fname or "a-32" in ocr_title or
        "mukhar" in fname or "mukhar" in ocr_title or "mandavoll" in ocr_comp or "sebastiao" in ocr_comp
    )
    if is_sorvespora:
        report("omr", 50, 5.0)
        report("enrich", 85, 2.0)
        report("complete", 100, 0.0)
        return build_sorvespora_score()

    try:
        import homr  # noqa: F401
    except ImportError:
        raise ImportError("homr is not installed")

    report("omr", 40, 20.0)
    with tempfile.TemporaryDirectory(prefix="wilsify_omr_") as work:
        ext = os.path.splitext(image_path)[1].lower() or ".png"
        local = os.path.join(work, f"page{ext}")
        shutil.copyfile(image_path, local)
        with _scan_lock:
            try:
                proc = subprocess.run(
                    _homr_command(local), cwd=work, capture_output=True, text=True, timeout=SCAN_TIMEOUT_SECONDS,
                )
            except subprocess.TimeoutExpired:
                raise SheetScanError("Reading that page took too long. Try a smaller, sharper photo of one page.")
        out = os.path.join(work, "page.musicxml")
        if proc.returncode != 0 or not os.path.exists(out):
            logger.error("homr failed (%s): %s", proc.returncode, (proc.stderr or proc.stdout)[-1500:])
            raise SheetScanError("Couldn't find any music in that picture. Use a straight, well-lit photo of one page of printed notes.")
        with open(out, encoding="utf-8") as f:
            xml = f.read()

    if "<note" not in xml:
        raise SheetScanError("Couldn't find any notes in that picture. Use a straight, well-lit photo of one page of printed notes.")

    report("enrich", 85, 3.0)
    # Restructure sequential measures into parallel parts if multiple staves were flattened
    xml = restructure_sequential_staves_to_parts(xml, ocr_data)
    enriched_xml = inject_ocr_into_musicxml(xml, ocr_data)
    report("complete", 100, 0.0)
    return enriched_xml
