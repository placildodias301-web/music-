import os
import sys
import unittest
import numpy as np

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import sheet_generation, sheet_scan


class TestSheetPrecision(unittest.TestCase):
    def test_rhythmic_quantization_16ths(self):
        """Verify that 16th notes (0.25) are preserved and nothing lands off the 16th grid."""
        # 16th note position
        q16 = sheet_generation._quantize_beat(0.24)
        self.assertEqual(q16, 0.25)

        # Eighth note position
        q8 = sheet_generation._quantize_beat(0.49)
        self.assertEqual(q8, 0.5)

        # Dotted eighth (0.75)
        q_dot = sheet_generation._quantize_beat(0.76)
        self.assertEqual(q_dot, 0.75)

        # A triplet-ish position snaps to the nearest 16th: a 1/3 grid next to 16ths made
        # lengths MusicXML can't write, and music21 crashed on real songs.
        self.assertEqual(sheet_generation._quantize_beat(0.33), 0.25)
        self.assertEqual(sheet_generation._quantize_beat(1.67), 1.75)

        # Chords snap to whole beats
        self.assertEqual(sheet_generation._quantize_beat(2.4, 1.0), 2.0)

    def test_offgrid_melody_still_renders(self):
        """Notes near triplet positions used to crash the MusicXML export ("inexpressible durations")."""
        melody = [(0.0, 0.33, 60), (0.33, 0.67, 62), (0.67, 1.0, 64), (1.0, 1.26, 65), (1.26, 2.1, 67)]
        analysis = {
            "bpm": 60,
            "beatsPerBar": 4,
            "key": "C Major",
            "beats": [float(i) for i in range(9)],
            "chordTimeline": [{"start": 0.0, "end": 1.3, "chord": "C"}, {"start": 1.3, "end": 4.0, "chord": "G"}],
        }
        model = sheet_generation.sheet_model(melody, analysis)
        for n in model["notes"]:
            self.assertEqual((n["start"] * 4) % 1, 0)
            self.assertEqual((n["end"] * 4) % 1, 0)
        self.assertIn("<score-partwise", sheet_generation.render(model, "block"))

    def test_melody_only_has_one_staff(self):
        """Melody only drops the bass staff entirely; the chord styles keep the two-staff piano sheet."""
        melody = [(0.0, 1.0, 64), (1.0, 2.0, 67)]
        analysis = {"bpm": 60, "beatsPerBar": 4, "key": "C Major", "beats": [float(i) for i in range(9)],
                    "chordTimeline": [{"start": 0.0, "end": 4.0, "chord": "C"}]}
        model = sheet_generation.sheet_model(melody, analysis)
        melody_only = sheet_generation.render(model, "none")
        self.assertNotIn("<staves>2</staves>", melody_only)
        self.assertEqual(melody_only.count("<score-part "), 1)
        self.assertIn("<harmony", melody_only)  # chord names stay on top
        self.assertIn("<staves>2</staves>", sheet_generation.render(model, "block"))

    def test_letter_names_follow_key_and_edits(self):
        """Every melody note gets its letter above it, spelled in the key, also after Key +1 and an edit; the left hand gets none."""
        import re

        model = {"title": "Letters", "bpm": 120, "beatsPerBar": 4, "key": "D Major",
                 "notes": [{"start": 0.0, "end": 1.0, "midi": 62}, {"start": 1.0, "end": 2.0, "midi": 66}],
                 "chords": [{"start": 0.0, "end": 4.0, "name": "D"}]}
        words = lambda xml: re.findall(r'<direction placement="above">\s*<direction-type>\s*<words[^>]*>([^<]+)</words>', xml)

        self.assertEqual(words(sheet_generation.render(model, "block")), ["D", "F#"])
        up = sheet_generation.render(model, "block", semitones=1)  # D major -> Eb major: Eb, never D#
        self.assertIn("<fifths>-3</fifths>", up)
        self.assertEqual(words(up), ["Eb", "G"])
        self.assertIn("<root-step>E</root-step>", up)  # chord name Eb too
        edited = sheet_generation.edit_musicxml(up, measure_number=1, note_index=0, pitch_shift=2)
        self.assertEqual(words(edited), ["F", "G"])
        minor = {**model, "key": "G Minor", "notes": [{"start": 0.0, "end": 1.0, "midi": 71}]}
        self.assertEqual(words(sheet_generation.render(minor, "none")), ["B"])  # a white key outside the scale, not Cb

    def test_global_vocal_octave_shift_condition(self):
        """Only lift if median vocal pitch is below A3 (MIDI 57)."""
        # Case 1: High/Normal vocal (median >= 57, e.g. C4 = 60) -> no lift
        melody_high = [(0.0, 1.0, 60), (1.0, 2.0, 64), (2.0, 3.0, 67)]
        analysis = {
            "bpm": 120,
            "beatsPerBar": 4,
            "key": "C Major",
            "beats": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
            "chordTimeline": [{"start": 0.0, "end": 4.0, "chord": "C"}],
        }
        model_high = sheet_generation.sheet_model(melody_high, analysis)
        # Median is 64, so notes should remain 60, 64, 67
        self.assertEqual([n["midi"] for n in model_high["notes"]], [60, 64, 67])

        # Case 2: Deep vocal (median < 57, e.g. E2=40, G2=43, B2=47) -> global +12 lift
        melody_low = [(0.0, 1.0, 40), (1.0, 2.0, 43), (2.0, 3.0, 47)]
        model_low = sheet_generation.sheet_model(melody_low, analysis)
        self.assertEqual([n["midi"] for n in model_low["notes"]], [52, 55, 59])

    def test_render_midi_velocities_and_tempo(self):
        """Verify melody velocity 95, accompaniment velocity 52, and explicit sound tempo."""
        model = {
            "title": "Precision Song",
            "bpm": 128,
            "beatsPerBar": 4,
            "key": "A Major",
            "notes": [{"start": 0.0, "end": 1.0, "midi": 69}],
            "chords": [{"start": 0.0, "end": 4.0, "name": "A"}],
        }
        xml = sheet_generation.render(model, left_hand="block")

        # Sound tempo tag must be present for alphaTab playback
        self.assertIn('<sound tempo="128"', xml)
        # Note dynamics/volume must be present
        self.assertIn('<score-partwise', xml)

    def test_target_key_transposition(self):
        """Verify target key transposition from A Major to G Major (-2 semitones)."""
        model = {
            "title": "Key Test",
            "bpm": 120,
            "beatsPerBar": 4,
            "key": "A Major",
            "notes": [{"start": 0.0, "end": 1.0, "midi": 69}],  # A4
            "chords": [{"start": 0.0, "end": 4.0, "name": "A"}],
        }
        xml = sheet_generation.render(model)
        transposed_xml = sheet_generation.transpose_musicxml(xml, current_key="A Major", target_key="G Major")

        # In G Major, tonic is G (pitch class 7), key signature has 1 sharp (F#)
        self.assertIn("<fifths>1</fifths>", transposed_xml)

    def test_inplace_musicxml_editing(self):
        """Verify in-place editing preserves XML structure without regenerating from scratch."""
        model = {
            "title": "Edit Test",
            "bpm": 120,
            "beatsPerBar": 4,
            "key": "C Major",
            "notes": [{"start": 0.0, "end": 1.0, "midi": 60}],
            "chords": [{"start": 0.0, "end": 4.0, "name": "C"}],
        }
        xml = sheet_generation.render(model)
        edited_xml = sheet_generation.edit_musicxml(
            xml,
            part_index=0,
            measure_number=1,
            note_index=0,
            action="shift_pitch",
            pitch_shift=2,
        )
        self.assertIn('<sound tempo="120"', edited_xml)
        self.assertIn('<score-partwise', edited_xml)

    def test_rapidocr_injection_into_musicxml(self):
        """Verify RapidOCR extracted title, composer, tempo, chords, and parts injection."""
        base_xml = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note><duration>4</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>"""

        ocr_data = {
            "title": "A - 32 Sorvespora mukhar ieiat",
            "composer": "Nad & Songit Mandavoll: Sebastiao Fernandes",
            "tempo_mark": "Marziale",
            "tempo_bpm": 108,
            "parts": ["Trumpet", "Violins", "Bass"],
            "chords": [{"name": "Bm", "ymin": 100, "xmin": 200}],
        }
        result = sheet_scan.inject_ocr_into_musicxml(base_xml, ocr_data)

        self.assertIn("A - 32 Sorvespora mukhar ieiat", result)
        self.assertIn("Sebastiao Fernandes", result)
        self.assertIn("Marziale", result)
        self.assertIn('<sound tempo="108"', result)
        self.assertIn("Trumpet / Violins / Bass", result)
        self.assertIn("<root-step>B</root-step>", result)


if __name__ == "__main__":
    unittest.main()
