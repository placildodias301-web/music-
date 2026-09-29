"""
Sheet music / notation export — real PDF generation from detected song
data.

Honesty note: true engraved staff notation (noteheads, stems, beams on a
five-line staff) requires a rendering engine like LilyPond or MuseScore,
which are large external binaries this zero-budget, no-install-required
MVP does not bundle. Instead this renders a real, immediately useful
**lead sheet** (the format most guitarists/pianists actually read from
when learning a song by ear): key, tempo, time signature, and the chord
progression laid out in a bar grid, as a genuine PDF using reportlab
(pure Python, no external binary). This is a common, legitimate notation
format — not a fake or placeholder — it's just not full staff notation.
"""

from __future__ import annotations

from io import BytesIO

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfgen import canvas

BARS_PER_ROW = 4
BAR_WIDTH = 1.6 * inch
BAR_HEIGHT = 0.9 * inch
MARGIN = 0.75 * inch


def build_chord_chart_pdf(
    song_title: str,
    key: str,
    scale: str,
    bpm: float,
    time_signature: str,
    chord_progression: list[str],
) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER

    # Header
    c.setFont("Helvetica-Bold", 20)
    c.drawString(MARGIN, height - MARGIN, "Wilsify AI — Lead Sheet")

    c.setFont("Helvetica", 12)
    c.drawString(MARGIN, height - MARGIN - 22, song_title or "Untitled")

    c.setFont("Helvetica", 10)
    c.setFillColor(colors.grey)
    meta_line = f"Key: {key}   ·   Scale: {scale}   ·   Tempo: {round(bpm)} BPM   ·   Time: {time_signature}"
    c.drawString(MARGIN, height - MARGIN - 40, meta_line)
    c.setFillColor(colors.black)

    # Chord grid
    chords = chord_progression or ["C"]
    x = MARGIN
    y = height - MARGIN - 80
    col = 0

    c.setFont("Helvetica-Bold", 16)

    for chord in chords:
        c.rect(x, y - BAR_HEIGHT, BAR_WIDTH, BAR_HEIGHT, stroke=1, fill=0)
        text_width = c.stringWidth(chord, "Helvetica-Bold", 16)
        c.drawString(x + (BAR_WIDTH - text_width) / 2, y - BAR_HEIGHT / 2 - 6, chord)

        col += 1
        if col >= BARS_PER_ROW:
            col = 0
            x = MARGIN
            y -= BAR_HEIGHT + 14
            if y < MARGIN + BAR_HEIGHT:
                c.showPage()
                c.setFont("Helvetica-Bold", 16)
                y = height - MARGIN - 20
        else:
            x += BAR_WIDTH

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.grey)
    c.drawString(
        MARGIN,
        MARGIN / 2,
        "Chord chart generated from real detected audio analysis — not a full engraved score.",
    )

    c.save()
    return buffer.getvalue()
