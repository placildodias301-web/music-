"""
Chord-chart PDF ("lead sheet") renderer.

The frontend builds the lead sheet from exactly what the Analysis page
shows — bars cut from the detected beats, the page's chord colours and
guitar voicings, the transpose/capo state — and this module only draws
it, with reportlab (pure Python, all vector). It's a lead sheet, the
format most players read from when learning by ear; it is not engraved
staff notation, which would need LilyPond/MuseScore.

Design follows the Analysis page: dark navy page, lighter cards with thin
borders, purple accents, the app's fonts (Plus Jakarta Sans + Space
Grotesk, bundled under the OFL in assets/fonts). A light, print-friendly
theme keeps the layout and chord colours on white. If the font files are
missing, it falls back to Helvetica (and "#" for "♯") instead of failing.
"""

from __future__ import annotations

import math
import os
from io import BytesIO
from typing import Any, Optional

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")

PAGE_W, PAGE_H = A4
MARGIN = 36
CONTENT_W = PAGE_W - 2 * MARGIN
HEADER_H = 40  # logo row + accent line
FOOTER_Y = 24
BOTTOM = 50  # content never goes below this
BARS_PER_ROW = 4
DIAGRAMS_PER_ROW = 6

LIGHT = {
    "bg": "#ffffff",
    "card": "#f6f7fb",
    "raised": "#eef1f8",
    "border": "#dde3ef",
    "borderStrong": "#c6cfe1",
    "text": "#0d1630",
    "muted": "#4a5878",
    "dim": "#7a87a3",
}


# ─── Fonts ──────────────────────────────────────────────────────────────


class _Type:
    """Registers the app fonts once; falls back to Helvetica when they're missing."""

    def __init__(self) -> None:
        files = {
            "WS-Body": "PlusJakartaSans-Regular.ttf",
            "WS-Semi": "PlusJakartaSans-SemiBold.ttf",
            "WS-Bold": "PlusJakartaSans-Bold.ttf",
            "WS-Head": "SpaceGrotesk-Bold.ttf",
        }
        self.cmaps: dict[str, set[int]] = {}
        try:
            if not all(os.path.isfile(os.path.join(FONT_DIR, f)) for f in files.values()):
                raise FileNotFoundError("bundled fonts missing")
            for name, file in files.items():
                if name not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, file)))
                self.cmaps[name] = set(pdfmetrics.getFont(name).face.charToGlyph)
            self.body, self.semi, self.bold, self.head = "WS-Body", "WS-Semi", "WS-Bold", "WS-Head"
        except Exception:
            self.cmaps = {}
            self.body, self.semi, self.bold, self.head = "Helvetica", "Helvetica-Bold", "Helvetica-Bold", "Helvetica-Bold"
        # The text fonts have no music signs; ♯/♭ come from Noto Music.
        self.music: Optional[str] = None
        if self.cmaps and os.path.isfile(os.path.join(FONT_DIR, "NotoMusic-Regular.ttf")):
            try:
                if "WS-Music" not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(TTFont("WS-Music", os.path.join(FONT_DIR, "NotoMusic-Regular.ttf")))
                self.music = "WS-Music"
            except Exception:
                self.music = None

    def clean(self, text: str, font: str) -> str:
        """Drops/replaces characters the font can't draw, so nothing renders as a box."""
        if not self.cmaps:
            text = text.replace("♯", "#").replace("♭", "b").replace("→", "->")
            return text.encode("cp1252", "ignore").decode("cp1252")
        if not self.music:
            text = text.replace("♯", "#").replace("♭", "b")
        cmap = self.cmaps.get(font, set())
        return "".join(ch for ch in text if ch in "♯♭" or ord(ch) in cmap or ch == " ")

    def runs(self, text: str, font: str) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        for ch in self.clean(text, font):
            f = self.music if ch in "♯♭" and self.music else font
            if out and out[-1][1] == f:
                out[-1] = (out[-1][0] + ch, f)
            else:
                out.append((ch, f))
        return out

    def width(self, text: str, font: str, size: float) -> float:
        return sum(pdfmetrics.stringWidth(seg, f, size * (MUSIC_SCALE if f == self.music else 1)) for seg, f in self.runs(text, font))

    def draw(self, c: canvas.Canvas, x: float, y: float, text: str, font: str, size: float, anchor: str = "left") -> float:
        w = self.width(text, font, size)
        if anchor == "center":
            x -= w / 2
        elif anchor == "right":
            x -= w
        for seg, f in self.runs(text, font):
            if f == self.music:
                s = size * MUSIC_SCALE
                c.saveState()
                if font in BOLD_FONTS:
                    # Fill + stroke in the text colour = a slightly heavier glyph.
                    c.setStrokeColor(c._fillColorObj)
                    c.setLineWidth(size * 0.035)
                    t = c.beginText(x, y + size * MUSIC_RAISE)
                    t.setTextRenderMode(2)
                else:
                    t = c.beginText(x, y + size * MUSIC_RAISE)
                t.setFont(f, s)
                t.textOut(seg)
                c.drawText(t)
                c.restoreState()
            else:
                s = size
                c.setFont(f, s)
                c.drawString(x, y, seg)
            x += pdfmetrics.stringWidth(seg, f, s)
        return w


# Noto Music's sharp is drawn small, thin and low next to Latin text:
# scale it to cap height, lift it, and thicken it beside bold type.
MUSIC_SCALE = 1.25
MUSIC_RAISE = 0.1
BOLD_FONTS = {"WS-Bold", "WS-Head"}

_TYPE: Optional[_Type] = None


def _type() -> _Type:
    global _TYPE
    if _TYPE is None:
        _TYPE = _Type()
    return _TYPE


# ─── Colour helpers ─────────────────────────────────────────────────────


def _hex(value: str) -> Color:
    return HexColor(value)


def _mix(a: str, b: str, t: float) -> str:
    ca, cb = HexColor(a), HexColor(b)
    r, g, bl = (ca.red * (1 - t) + cb.red * t, ca.green * (1 - t) + cb.green * t, ca.blue * (1 - t) + cb.blue * t)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(bl * 255))


class _Theme:
    def __init__(self, sheet: dict) -> None:
        p = sheet["palette"]
        self.light = sheet.get("theme") == "light"
        base = {**p, **LIGHT} if self.light else p
        self.bg, self.card, self.raised = base["bg"], base["card"], base["raised"]
        self.border, self.border_strong = base["border"], base["borderStrong"]
        self.text, self.muted, self.dim = base["text"], base["muted"], base["dim"]
        self.purple = p["purple"]
        self.purple_light = p["purple"] if self.light else p["purpleLight"]
        self.cyan = _mix(p["cyan"], "#000000", 0.25) if self.light else p["cyan"]

    def accent(self, color: str) -> str:
        """Stat values / badges: the page's colour, deepened on white for contrast."""
        return _mix(color, "#000000", 0.28) if self.light else color

    def chord_fg(self, chord: dict) -> str:
        return chord["fgOnLight"] if self.light else chord["fg"]


# ─── Drawing primitives ─────────────────────────────────────────────────


def _rrect(c, x, y, w, h, r, fill=None, stroke=None, fill_alpha=1.0, stroke_alpha=1.0, width=0.75, dash=None):
    c.saveState()
    if fill:
        c.setFillColor(_hex(fill))
        c.setFillAlpha(fill_alpha)
    if stroke:
        c.setStrokeColor(_hex(stroke))
        c.setStrokeAlpha(stroke_alpha)
        c.setLineWidth(width)
        if dash:
            c.setDash(*dash)
    c.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1 if fill else 0)
    c.restoreState()


def _fit(t: _Type, text: str, font: str, size: float, max_w: float, min_size: float) -> float:
    while size > min_size and t.width(text, font, size) > max_w:
        size -= 0.5
    return size


def _ellipsize(t: _Type, text: str, font: str, size: float, max_w: float) -> str:
    if t.width(text, font, size) <= max_w:
        return text
    while text and t.width(text + "…", font, size) > max_w:
        text = text[:-1]
    return text.rstrip() + "…"


def _wrap(t: _Type, text: str, font: str, size: float, max_w: float, max_lines: int) -> list[str]:
    """Word wrap; the last allowed line ends in "…" at a word boundary if text remains."""
    words = text.split()
    lines: list[str] = []
    i = 0
    while i < len(words) and len(lines) < max_lines:
        line = words[i]
        i += 1
        while i < len(words) and t.width(line + " " + words[i], font, size) <= max_w:
            line += " " + words[i]
            i += 1
        lines.append(line)
    if i < len(words) or (lines and t.width(lines[-1], font, size) > max_w):
        last = lines[-1]
        # Drop whole words until the ellipsis fits; a single over-long word is shortened instead.
        while " " in last and t.width(last + " …", font, size) > max_w:
            last = last.rsplit(" ", 1)[0]
        lines[-1] = _ellipsize(t, last, font, size, max_w) if t.width(last + "…", font, size) > max_w else last + "…"
    return [_ellipsize(t, ln, font, size, max_w) for ln in lines]


# ─── Page frame ─────────────────────────────────────────────────────────


class _Doc:
    """Layout cursor over a canvas: paints each page's background and header, breaks pages."""

    def __init__(self, sheet: dict, c: canvas.Canvas, t: _Type, th: _Theme) -> None:
        self.sheet, self.c, self.t, self.th = sheet, c, t, th
        self.y = 0.0
        self._new_page(first=True)

    def _new_page(self, first: bool = False) -> None:
        if not first:
            self.c.showPage()
        c, th = self.c, self.th
        c.setFillColor(_hex(th.bg))
        c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        self._header()
        self.y = PAGE_H - MARGIN - HEADER_H - 14

    def ensure(self, h: float) -> None:
        if self.y - h < BOTTOM:
            self._new_page()

    def _header(self) -> None:
        c, t, th = self.c, self.t, self.th
        top = PAGE_H - MARGIN
        s = 22
        x, y = MARGIN, top - s
        # Logo mark: the app's purple tile with five waveform bars.
        c.saveState()
        p = c.beginPath()
        p.roundRect(x, y, s, s, 6)
        c.clipPath(p, stroke=0, fill=0)
        c.linearGradient(x, y + s, x + s, y, (_hex(th.purple), _hex("#8b5cf6")), extend=False)
        c.restoreState()
        c.saveState()
        c.setStrokeColor(_hex("#ffffff"))
        c.setLineWidth(1.5)
        c.setLineCap(1)
        unit = s * 0.58 / 24
        ox, oy = x + s * 0.21, y + s * 0.21
        for bx, y0, y1 in ((4, 10, 14), (8, 6, 18), (12, 3, 21), (16, 7, 17), (20, 11, 13)):
            c.line(ox + bx * unit, oy + (24 - y0) * unit, ox + bx * unit, oy + (24 - y1) * unit)
        c.restoreState()
        # Wordmark
        c.setFillColor(_hex(th.text))
        wx = x + s + 8
        w = t.draw(c, wx, y + 6, "Wilsify", t.head, 15)
        ai_x = wx + w + 5
        _rrect(c, ai_x, y + 5, 17, 11, 3, fill=th.purple)
        c.setFillColor(_hex("#ffffff"))
        t.draw(c, ai_x + 8.5, y + 7.6, "AI", t.bold, 7, anchor="center")
        # Right side
        c.setFillColor(_hex(th.muted))
        t.draw(c, PAGE_W - MARGIN, y + 6.5, "Lead Sheet", t.semi, 10, anchor="right")
        # Accent line
        c.saveState()
        c.setStrokeColor(_hex(th.purple))
        c.setLineWidth(2)
        c.line(MARGIN, top - HEADER_H + 6, PAGE_W - MARGIN, top - HEADER_H + 6)
        c.restoreState()


# ─── Sections ───────────────────────────────────────────────────────────


def _title_block(d: _Doc) -> None:
    c, t, th, sheet = d.c, d.t, d.th, d.sheet
    size = 21
    lines = _wrap(t, sheet.get("title") or "Untitled", t.head, size, CONTENT_W, 2)
    c.setFillColor(_hex(th.text))
    for line in lines:
        d.y -= size
        t.draw(c, MARGIN, d.y, line, t.head, size)
        d.y -= 4
    d.y -= 8
    x = MARGIN
    for badge in sheet.get("badges", []):
        color = th.accent(badge["color"])
        w = t.width(badge["label"], t.semi, 8) + 14
        _rrect(c, x, d.y - 14, w, 15, 4, fill=badge["color"], fill_alpha=0.12, stroke=badge["color"], stroke_alpha=0.35)
        c.setFillColor(_hex(color))
        t.draw(c, x + 7, d.y - 9.5, badge["label"], t.semi, 8)
        x += w + 6
    d.y -= 14 + 16


def _stats(d: _Doc) -> None:
    c, t, th = d.c, d.t, d.th
    gap, h = 8, 66
    w = (CONTENT_W - 3 * gap) / 4
    d.ensure(h)
    top = d.y
    for i, stat in enumerate(d.sheet.get("stats", [])[:4]):
        x = MARGIN + i * (w + gap)
        _rrect(c, x, top - h, w, h, 8, fill=th.card, stroke=th.border)
        c.setFillColor(_hex(th.muted))
        t.draw(c, x + 10, top - 16, stat["label"].upper(), t.semi, 6.8)
        value_size = _fit(t, stat["value"], t.head, 19, w - 20 - (t.width(stat["unit"], t.semi, 8) + 4 if stat["unit"] else 0), 11)
        c.setFillColor(_hex(th.accent(stat["color"])))
        vw = t.draw(c, x + 10, top - 38, stat["value"], t.head, value_size)
        if stat["unit"]:
            c.setFillColor(_hex(th.muted))
            t.draw(c, x + 10 + vw + 3, top - 38, stat["unit"], t.semi, 8)
        c.setFillColor(_hex(th.muted))
        for k, line in enumerate(_wrap(t, stat["note"], t.body, 6.8, w - 20, 2)):
            t.draw(c, x + 10, top - 50 - k * 8.5, line, t.body, 6.8)
    d.y = top - h - 10


def _transpose(d: _Doc) -> None:
    c, t, th = d.c, d.t, d.th
    h = 30
    d.ensure(h)
    top = d.y
    _rrect(c, MARGIN, top - h, CONTENT_W, h, 8, fill=th.card, stroke=th.border)
    mid = top - h / 2 - 3
    c.setFillColor(_hex(th.muted))
    x = MARGIN + 12
    x += t.draw(c, x, mid, "TRANSPOSE & CAPO", t.semi, 6.8) + 16
    info = d.sheet.get("transpose", {})
    for label, value, color in (("You hear", info.get("hear", ""), th.cyan), ("You play", info.get("play", ""), th.purple_light)):
        c.setFillColor(_hex(color))
        x += t.draw(c, x, mid, label.upper(), t.semi, 6.8) + 6
        c.setFillColor(_hex(th.text))
        x += t.draw(c, x, mid - 0.5, value, t.bold, 9.5) + 18
    d.y = top - h - 16


def _section_title(d: _Doc, title: str, subtitle: str, keep_with: float) -> None:
    d.ensure(26 + keep_with)
    c, t, th = d.c, d.t, d.th
    c.setFillColor(_hex(th.text))
    d.y -= 13
    w = t.draw(c, MARGIN, d.y, title, t.head, 13)
    if subtitle:
        c.setFillColor(_hex(th.dim))
        t.draw(c, MARGIN + w + 8, d.y + 0.5, subtitle, t.body, 7.5)
    d.y -= 11


# ─── Chord chart ────────────────────────────────────────────────────────

CELL_PAD = 6
NUMBER_STRIP = 11
LINE_GAP = 4


def _pill_layout(n: int) -> tuple[int, float, float]:
    """(columns, pill height, base font size) for a bar holding n chords."""
    if n == 1:
        return 1, 24, 13
    if n <= 4:
        return 2, 20 if n == 2 else 17, 11 if n == 2 else 9.5
    return 3, 15, 8


def _cell_height(n: int) -> float:
    cols, ph, _ = _pill_layout(n)
    lines = math.ceil(n / cols)
    return NUMBER_STRIP + lines * ph + (lines - 1) * LINE_GAP + CELL_PAD


def _draw_pill(d: _Doc, chord: dict, x: float, y: float, w: float, h: float, size: float) -> None:
    c, t, th = d.c, d.t, d.th
    faded = chord.get("continuation")
    alpha = 0.42 if faded else 1.0
    if chord.get("noChord"):
        _rrect(c, x, y, w, h, 5, fill=th.dim, fill_alpha=0.06, stroke=th.dim, stroke_alpha=0.35, dash=(2, 2))
        c.setFillColor(_hex(th.dim))
        t.draw(c, x + w / 2, y + h / 2 - size * 0.33, "N.C.", t.semi, size * 0.8, anchor="center")
        return
    fill_alpha = chord["fillAlpha"] * (1.35 if th.light else 1)
    border_alpha = min(1.0, chord["borderAlpha"] * (1.6 if th.light else 1))
    _rrect(
        c, x, y, w, h, 5,
        fill=chord["fill"], fill_alpha=fill_alpha * alpha,
        stroke=chord["border"], stroke_alpha=border_alpha * alpha,
        width=0.9, dash=(2.2, 1.6) if chord.get("uncertain") else None,
    )
    label = chord["label"]
    q = "?" if chord.get("uncertain") else ""
    qsize = size * 0.6
    size = _fit(t, label, t.head, size, w - 8 - (t.width(q, t.bold, qsize) if q else 0), 6)
    total = t.width(label, t.head, size) + (t.width(q, t.bold, qsize) + 1 if q else 0)
    tx = x + (w - total) / 2
    ty = y + h / 2 - size * 0.34
    c.saveState()
    c.setFillColor(_hex(th.chord_fg(chord)))
    c.setFillAlpha(alpha)
    lw = t.draw(c, tx, ty, label, t.head, size)
    if q:
        t.draw(c, tx + lw + 1, ty + size * 0.45, q, t.bold, qsize)
    c.restoreState()


def _bar_cell(d: _Doc, bar: dict, x: float, top: float, w: float, h: float) -> None:
    c, t, th = d.c, d.t, d.th
    c.setFillColor(_hex(th.dim))
    label = "Pickup" if bar.get("pickup") else str(bar.get("number") or "")
    t.draw(c, x + 5, top - 8.5, label, t.semi, 6.3)
    chords = bar.get("chords") or []
    n = max(1, len(chords))
    cols, ph, size = _pill_layout(n)
    cols = min(cols, n)
    inner_w = w - 2 * CELL_PAD
    pw = (inner_w - (cols - 1) * LINE_GAP) / cols
    lines = math.ceil(n / cols)
    block_h = lines * ph + (lines - 1) * LINE_GAP
    area_top = top - NUMBER_STRIP
    area_h = h - NUMBER_STRIP - CELL_PAD / 2
    y0 = area_top - (area_h - block_h) / 2  # centre the pills vertically in the cell
    for i, chord in enumerate(chords):
        row, col = divmod(i, cols)
        in_row = min(cols, n - row * cols)
        offset = (inner_w - (in_row * pw + (in_row - 1) * LINE_GAP)) / 2
        px = x + CELL_PAD + offset + col * (pw + LINE_GAP)
        py = y0 - (row + 1) * ph - row * LINE_GAP
        _draw_pill(d, chord, px, py, pw, ph, size)


def _loop_bracket(d: _Doc, row: list[dict], top_y: float, cell_w: float, x0: float) -> None:
    c, th = d.c, d.th
    y = top_y - 4
    c.saveState()
    c.setStrokeColor(_hex(th.purple_light))
    c.setLineWidth(1.4)
    c.setLineCap(1)
    for i, bar in enumerate(row):
        pass_ = bar.get("loopPass")
        if pass_ is None:
            continue
        x1, x2 = x0 + i * cell_w + 3, x0 + (i + 1) * cell_w - 3
        prev_same = i > 0 and row[i - 1].get("loopPass") == pass_
        next_same = i < len(row) - 1 and row[i + 1].get("loopPass") == pass_
        if prev_same:
            x1 -= 3
        if next_same:
            x2 += 3
        c.line(x1, y, x2, y)
        if not prev_same:
            c.line(x1, y, x1, y + 4)
        if not next_same:
            c.line(x2, y, x2, y + 4)
    c.restoreState()


def _chart(d: _Doc) -> None:
    sheet = d.sheet
    bars = sheet.get("bars") or []
    pickups = [b for b in bars if b.get("pickup")]
    full = [b for b in bars if not b.get("pickup")]
    rows = [full[i:i + BARS_PER_ROW] for i in range(0, len(full), BARS_PER_ROW)]
    cell_w = CONTENT_W / BARS_PER_ROW
    has_loop = any(b.get("loopPass") is not None for b in bars)
    bracket_h = 9 if has_loop else 0

    def row_h(row: list[dict]) -> float:
        return max(_cell_height(max(1, len(b.get("chords") or []))) for b in row)

    first_h = row_h(rows[0]) if rows else 30
    subtitle = f"{len(full)} bars · {sheet.get('beatsPerBar', 4)} beats per bar · one cell per bar"
    _section_title(d, "Chord Chart", subtitle, first_h + bracket_h + (row_h(pickups) + 6 if pickups else 0))

    c, th = d.c, d.th
    if pickups:
        h = row_h(pickups)
        d.ensure(h + 6)
        w = cell_w * 0.62
        _rrect(c, MARGIN, d.y - h, w, h, 7, fill=th.card, stroke=th.border, dash=(3, 2))
        _bar_cell(d, pickups[0], MARGIN, d.y, w, h)
        d.y -= h + 6

    for row in rows:
        h = row_h(row)
        d.ensure(h + bracket_h + 6)
        top = d.y
        _rrect(c, MARGIN, top - h, cell_w * len(row), h, 7, fill=th.card, stroke=th.border)
        c.saveState()
        c.setStrokeColor(_hex(th.border))
        c.setLineWidth(0.75)
        for i in range(1, len(row)):
            x = MARGIN + i * cell_w
            c.line(x, top - h + 4, x, top - 4)
        c.restoreState()
        for i, bar in enumerate(row):
            _bar_cell(d, bar, MARGIN + i * cell_w, top, cell_w, h)
        if has_loop:
            _loop_bracket(d, row, top - h, cell_w, MARGIN)
        d.y = top - h - bracket_h - 6
    d.y -= 8


# ─── Chord diagrams ─────────────────────────────────────────────────────

DIAGRAM_CARD_H = 118
STRING_GAP = 10
FRET_GAP = 12
FRETS_SHOWN = 4


def _diagram(d: _Doc, diag: dict, x: float, top: float, w: float) -> None:
    c, t, th = d.c, d.t, d.th
    _rrect(c, x, top - DIAGRAM_CARD_H, w, DIAGRAM_CARD_H, 7, fill=th.card, stroke=th.border)
    c.setFillColor(_hex(th.light and diag["fgOnLight"] or diag["fg"]))
    size = _fit(t, diag["label"], t.head, 12, w - 12, 7)
    t.draw(c, x + w / 2, top - 17, diag["label"], t.head, size, anchor="center")

    frets = diag.get("frets")
    if not frets:
        c.setFillColor(_hex(th.dim))
        for k, line in enumerate(_wrap(t, "No verified guitar shape", t.body, 7, w - 14, 2)):
            t.draw(c, x + w / 2, top - 60 - k * 9, line, t.body, 7, anchor="center")
        return

    fretted = [f for f in frets if f is not None and f > 0]
    min_f, max_f = (min(fretted), max(fretted)) if fretted else (0, 0)
    start = min_f - 1 if max_f > FRETS_SHOWN else 0  # same rule as the page's diagram
    grid_w = STRING_GAP * 5
    gx = x + (w - grid_w) / 2 + 3
    gy_top = top - 38
    # Nut / top line, frets, strings
    c.saveState()
    c.setStrokeColor(_hex(th.muted if not th.light else th.dim))
    c.setLineWidth(0.6)
    for i in range(FRETS_SHOWN + 1):
        c.line(gx, gy_top - i * FRET_GAP, gx + grid_w, gy_top - i * FRET_GAP)
    for s in range(6):
        c.line(gx + s * STRING_GAP, gy_top, gx + s * STRING_GAP, gy_top - FRETS_SHOWN * FRET_GAP)
    if start == 0:
        c.setLineWidth(2.4)
        c.line(gx - 0.6, gy_top + 1, gx + grid_w + 0.6, gy_top + 1)
    c.restoreState()
    if start > 0:
        c.setFillColor(_hex(th.dim))
        t.draw(c, gx - 5, gy_top - FRET_GAP / 2 - 2.5, f"{start + 1}fr", t.semi, 6.5, anchor="right")
    # Markers: x = muted, o = open, dot = fretted
    for s, f in enumerate(frets):
        sx = gx + s * STRING_GAP
        if f is None:
            c.saveState()
            c.setStrokeColor(_hex("#ff6578"))
            c.setLineWidth(0.9)
            c.line(sx - 2.2, gy_top + 4, sx + 2.2, gy_top + 8.4)
            c.line(sx - 2.2, gy_top + 8.4, sx + 2.2, gy_top + 4)
            c.restoreState()
        elif f == 0:
            c.saveState()
            c.setStrokeColor(_hex("#55d69a" if not th.light else "#1f9e63"))
            c.setLineWidth(0.9)
            c.circle(sx, gy_top + 6.2, 2.3, stroke=1, fill=0)
            c.restoreState()
        else:
            rel = f - start
            if 1 <= rel <= FRETS_SHOWN:
                c.setFillColor(_hex(th.purple_light))
                c.circle(sx, gy_top - (rel - 0.5) * FRET_GAP, 3.6, stroke=0, fill=1)
    if diag.get("name"):
        c.setFillColor(_hex(th.muted))
        for k, line in enumerate(_wrap(t, diag["name"], t.body, 6.3, w - 10, 2)):
            t.draw(c, x + w / 2, top - DIAGRAM_CARD_H + 16 - k * 7.6, line, t.body, 6.3, anchor="center")


def _diagrams(d: _Doc) -> None:
    diags = d.sheet.get("diagrams") or []
    if not diags:
        return
    gap = 7
    w = (CONTENT_W - (DIAGRAMS_PER_ROW - 1) * gap) / DIAGRAMS_PER_ROW
    _section_title(d, "Guitar Chord Shapes", "the voicings shown on the analysis page", DIAGRAM_CARD_H)
    for i in range(0, len(diags), DIAGRAMS_PER_ROW):
        d.ensure(DIAGRAM_CARD_H + 8)
        top = d.y
        for k, diag in enumerate(diags[i:i + DIAGRAMS_PER_ROW]):
            _diagram(d, diag, MARGIN + k * (w + gap), top, w)
        d.y = top - DIAGRAM_CARD_H - 8
    d.y -= 6


# ─── Legend ─────────────────────────────────────────────────────────────


def _legend(d: _Doc) -> None:
    c, t, th, sheet = d.c, d.t, d.th, d.sheet
    bars = sheet.get("bars") or []
    real = [ch for b in bars for ch in b.get("chords", []) if not ch.get("noChord")]
    sample = real[0] if real else None
    swatches: list[dict] = []
    for ch in real:
        if ch["symbol"] not in {s["symbol"] for s in swatches}:
            swatches.append(ch)
    items: list[tuple[str, str]] = [("colour", "Same colour = same chord, everywhere in the song")]
    items.append(("uncertain", "Dashed + ? = the analysis wasn't sure"))
    items.append(("held", "Faded = chord held over from the previous bar"))
    if any(ch.get("noChord") for b in bars for ch in b.get("chords", [])):
        items.append(("nc", "N.C. = no chord"))
    loop = sheet.get("loop")
    if loop:
        items.append(("loop", f"Main progression: {loop['label']} ×{loop['count']}"))
    if sheet.get("notationLegend"):
        items.append(("notation", sheet["notationLegend"]))

    col_w = CONTENT_W / 2
    if items[-1][0] == "notation" and len(items) % 2 == 0:
        items.insert(len(items) - 1, ("blank", ""))
    rows = math.ceil(len(items) / 2)
    h = 22 + rows * 17 + 6
    d.ensure(h)
    top = d.y
    _rrect(c, MARGIN, top - h, CONTENT_W, h, 8, fill=th.card, stroke=th.border)
    c.setFillColor(_hex(th.muted))
    t.draw(c, MARGIN + 12, top - 14, "LEGEND", t.semi, 6.8)
    for i, (kind, text) in enumerate(items):
        if kind == "blank":
            continue
        col, row = i % 2, i // 2
        x = MARGIN + 12 + col * col_w
        y = top - 32 - row * 17
        sw, sh = 26, 12
        if kind == "loop":
            c.saveState()
            c.setStrokeColor(_hex(th.purple_light))
            c.setLineWidth(1.4)
            c.line(x, y + 2, x + sw, y + 2)
            c.line(x, y + 2, x, y + 6)
            c.line(x + sw, y + 2, x + sw, y + 6)
            c.restoreState()
        elif kind == "nc":
            _draw_pill(d, {"noChord": True}, x, y - 1, sw, sh, 8)
        elif kind == "notation":
            c.setFillColor(_hex(th.purple_light))
            t.draw(c, x + sw / 2, y + 1.5, "Sa", t.head, 9, anchor="center")
        elif kind == "colour":
            for k, ch in enumerate(swatches[:3]):
                _rrect(c, x + k * 9.5, y - 1, 7.5, sh, 2.5, fill=ch["fill"], fill_alpha=0.55, stroke=ch["border"], stroke_alpha=0.9)
        elif sample:
            chord = dict(sample)
            chord["uncertain"] = kind == "uncertain"
            chord["continuation"] = kind == "held"
            _draw_pill(d, chord, x, y - 1, sw, sh, 7)
        c.setFillColor(_hex(th.muted))
        width = CONTENT_W - sw - 36 if kind == "notation" else col_w - sw - 24
        t.draw(c, x + sw + 7, y + 2, _ellipsize(t, text, t.body, 7.3, width), t.body, 7.3)
    d.y = top - h - 8


# ─── Entry points ───────────────────────────────────────────────────────


def _footer(c: canvas.Canvas, t: _Type, th: _Theme, date: str, page: int, total: int) -> None:
    c.saveState()
    c.setStrokeColor(_hex(th.border))
    c.setLineWidth(0.6)
    c.line(MARGIN, FOOTER_Y + 11, PAGE_W - MARGIN, FOOTER_Y + 11)
    c.setFillColor(_hex(th.dim))
    t.draw(c, MARGIN, FOOTER_Y, f"Generated by Wilsify AI from real audio analysis · {date}", t.body, 7)
    t.draw(c, PAGE_W - MARGIN, FOOTER_Y, f"Page {page} of {total}", t.semi, 7, anchor="right")
    c.restoreState()


class _FooterCanvas(canvas.Canvas):
    """Holds each page until the end so footers can say "Page X of Y"."""

    footer_args: tuple = ()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages: list[dict] = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for i, state in enumerate(self._pages, start=1):
            self.__dict__.update(state)
            _footer(self, *self.footer_args, page=i, total=total)
            super().showPage()
        super().save()


def build_lead_sheet_pdf(sheet: dict[str, Any]) -> bytes:
    """Renders a lead sheet built by the frontend (see frontend/src/lib/leadSheet.ts)."""
    buffer = BytesIO()
    t = _type()
    th = _Theme(sheet)

    class _Canvas(_FooterCanvas):
        footer_args = (t, th, sheet.get("generatedOn") or "")

    c = _Canvas(buffer, pagesize=A4)
    c.setTitle(t.clean(sheet.get("title") or "Lead sheet", t.body))
    c.setAuthor("Wilsify AI")
    doc = _Doc(sheet, c, t, th)

    _title_block(doc)
    _stats(doc)
    _transpose(doc)
    if sheet.get("bars"):
        _chart(doc)
    _diagrams(doc)
    _legend(doc)

    doc.c.showPage()
    doc.c.save()
    return buffer.getvalue()


# Legacy request (a flat chord list, no timing): one bar per chord in the
# brand colour, so old clients still get a working, on-brand lead sheet.
_BRAND = {
    "bg": "#050a18", "card": "#0d1630", "raised": "#101a34", "border": "#202e50", "borderStrong": "#293961",
    "purple": "#6c4dff", "purpleLight": "#8b5cf6", "cyan": "#22c7d9", "text": "#f4f6ff", "muted": "#a5b1cc", "dim": "#687797",
}


def build_chord_chart_pdf(
    song_title: str,
    key: str,
    scale: str,
    bpm: float,
    time_signature: str,
    chord_progression: list[str],
    generated_on: str = "",
) -> bytes:
    def display(symbol: str) -> str:
        return symbol[:1] + symbol[1:2].replace("#", "♯").replace("b", "♭") + symbol[2:] if len(symbol) > 1 else symbol

    chord = {"fg": "#8b5cf6", "fgOnLight": "#4b2fd1", "fill": "#6c4dff", "fillAlpha": 0.13, "border": "#8b5cf6", "borderAlpha": 0.35,
             "uncertain": False, "continuation": False, "noChord": False}
    bars = [
        {"number": i + 1, "pickup": False, "loopPass": None, "chords": [{**chord, "symbol": s, "label": display(s)}]}
        for i, s in enumerate(chord_progression or ["C"])
    ]
    key_root, _, key_mode = key.partition(" ")
    sheet = {
        "theme": "dark",
        "title": song_title or "Untitled",
        "badges": [{"label": "Audio Analysis", "color": "#4da3ff"}],
        "stats": [
            {"label": "Detected Key", "value": f"{display(key_root)} {key_mode.lower()}".strip(), "unit": "", "note": scale, "color": "#6c4dff"},
            {"label": "Tempo", "value": str(round(bpm)), "unit": "BPM", "note": "Detected tempo", "color": "#4da3ff"},
            {"label": "Time Signature", "value": time_signature, "unit": "", "note": "Meter", "color": "#f5b84b"},
            {"label": "Duration", "value": f"{len(chord_progression)}", "unit": "chords", "note": "Chord changes", "color": "#55d69a"},
        ],
        "transpose": {"hear": f"{display(key_root)} {key_mode.lower()}".strip(), "play": "No capo · original key"},
        "palette": _BRAND,
        "beatsPerBar": 4,
        "bars": bars,
        "loop": None,
        "diagrams": [],
        "generatedOn": generated_on,
    }
    return build_lead_sheet_pdf(sheet)
