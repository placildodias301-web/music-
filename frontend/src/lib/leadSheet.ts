/**
 * Builds the PDF lead sheet from exactly what the Analysis page shows:
 * the (transposed) chord timeline cut into real bars, the page's chord
 * colours and guitar voicings, the stat cards and the transpose/capo
 * state. The backend only draws this — every musical decision is made
 * here, with the same helpers the page uses, so the two can't disagree.
 */

import { findHeldSegmentIndex } from "./chordSync";
import type { AnalysisResult, ChordSegment } from "./api";
import {
  DEFAULT_DIFFICULTY_BADGE,
  DIFFICULTY_BADGES,
  describeKeyConfidence,
  tempoNote,
  timeSignatureNote,
  timeSignatureValue,
} from "./analysisDisplay";
import {
  chordColorsHex,
  displayChord,
  findMainLoop,
  isUncertain,
  isVoiceableChord,
  scaleName,
  DEFAULT_LOW_CONFIDENCE,
} from "./chordSync";
import { getGuitarVoicings, parseChordSymbol } from "./chordTheory";
import { shapeShift, soundingShift, transposeKey, type TransposeSettings } from "./transpose";
import { formatChord, formatKey, notationLegend, type NotationOptions } from "./notation";

export type LeadSheetTheme = "dark" | "light";

export interface LeadSheetChord {
  symbol: string;
  /** Display spelling, e.g. "G♯m" (the renderer falls back to "#" if it must). */
  label: string;
  fg: string;
  fgOnLight: string;
  fill: string;
  fillAlpha: number;
  border: string;
  borderAlpha: number;
  uncertain: boolean;
  /** Still ringing from the previous bar (drawn faded). */
  continuation: boolean;
  /** "No chord" placeholder for a bar with nothing playing. */
  noChord: boolean;
}

export interface LeadSheetBar {
  /** 1-based bar number; null for a pickup bar. */
  number: number | null;
  pickup: boolean;
  chords: LeadSheetChord[];
  /** Which pass of the main progression this bar belongs to (0-based), if any. */
  loopPass: number | null;
}

export interface LeadSheetDiagram {
  label: string;
  fg: string;
  fgOnLight: string;
  /** Voicing name as the page shows it, e.g. "Barre – E-shape (fret 4)". */
  name: string | null;
  /** Six strings low-E → high-E; null = muted, 0 = open. Null when no verified shape exists. */
  frets: (number | null)[] | null;
}

export interface LeadSheetStat {
  label: string;
  value: string;
  unit: string;
  note: string;
  color: string;
}

export interface LeadSheet {
  theme: LeadSheetTheme;
  title: string;
  badges: { label: string; color: string }[];
  stats: LeadSheetStat[];
  transpose: { hear: string; play: string };
  palette: Record<"bg" | "card" | "raised" | "border" | "borderStrong" | "purple" | "purpleLight" | "cyan" | "text" | "muted" | "dim", string>;
  beatsPerBar: number;
  bars: LeadSheetBar[];
  loop: { label: string; count: number } | null;
  diagrams: LeadSheetDiagram[];
  /** One-line notation legend (sargam), shown in the PDF legend. */
  notationLegend: string | null;
  generatedOn: string;
}

/** How the page currently displays chords (Music display settings). */
export interface LeadSheetDisplay {
  notation: Omit<NotationOptions, "key">;
  leftHanded: boolean;
  showUncertain: boolean;
}

const DEFAULT_DISPLAY: LeadSheetDisplay = { notation: { accidentals: "sharps", notation: "letters" }, leftHanded: false, showUncertain: true };

/** Reads a theme colour from the page's CSS variables so the PDF uses the exact same hex. */
function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Bar start times, from the most trustworthy source available: detected
 * downbeats, else every Nth tracked beat, else a fixed grid at the BPM
 * starting on the first chord. Extended to cover the whole song.
 */
function barStarts(analysis: AnalysisResult, firstChord: number, lastChordEnd: number): { starts: number[]; barLen: number; beatLen: number } {
  const perBar = analysis.beatsPerBar ?? 4;
  const beatLen = 60 / (analysis.bpm > 0 ? analysis.bpm : 120);
  let starts: number[] = [];
  if ((analysis.downbeats?.length ?? 0) >= 2) starts = [...analysis.downbeats!];
  else if ((analysis.beats?.length ?? 0) >= perBar * 2) starts = analysis.beats!.filter((_, i) => i % perBar === 0);

  const barLen = starts.length >= 2 ? median(starts.slice(1).map((t, i) => t - starts[i])) : beatLen * perBar;
  // Beats keep being tracked through a fade-out; bars after the last chord are just silence.
  starts = starts.filter((t) => t < lastChordEnd - 0.25 * beatLen);
  if (!starts.length) starts = [firstChord];

  // Bars before the first detected one: whole bars where they fit; whatever
  // is left before the first chord becomes the pickup (handled by the caller).
  while (starts[0] - barLen >= firstChord - 0.25 * beatLen) starts.unshift(starts[0] - barLen);
  while (starts[starts.length - 1] + barLen < lastChordEnd - 0.25 * beatLen) starts.push(starts[starts.length - 1] + barLen);
  return { starts, barLen, beatLen };
}

function chordEntry(seg: ChordSegment, threshold: number, continuation: boolean, label: (s: string) => string, showUncertain: boolean): LeadSheetChord {
  return {
    symbol: seg.chord,
    label: label(seg.chord),
    ...chordColorsHex(seg.chord),
    uncertain: showUncertain && isUncertain(seg, threshold),
    continuation,
    noChord: false,
  };
}

/** Cuts the timeline into bars; every chord lands in at least one bar, no bar is left empty. */
export function buildBars(
  analysis: AnalysisResult,
  _palette: LeadSheet["palette"],
  label: (s: string) => string = displayChord,
  showUncertain = true
): LeadSheetBar[] {
  const timeline = analysis.chordTimeline;
  if (!timeline.length) return [];
  const threshold = analysis.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
  const first = timeline[0].start;
  const lastEnd = timeline[timeline.length - 1].end;
  const { starts, barLen, beatLen } = barStarts(analysis, first, lastEnd);

  const spans: { start: number; end: number; pickup: boolean }[] = [];
  if (starts[0] - first > 0.25 * beatLen) spans.push({ start: first, end: starts[0], pickup: true });
  starts.forEach((s, i) => spans.push({ start: s, end: starts[i + 1] ?? Math.max(s + barLen, lastEnd), pickup: false }));

  // Which bars each segment shows up in: wherever it rings for a meaningful
  // stretch (≥0.2 s or half its length) — and at least in its main bar.
  const members: number[][] = spans.map(() => []);
  timeline.forEach((seg, si) => {
    let best = -1;
    let bestOverlap = 0;
    let placed = false;
    spans.forEach((bar, bi) => {
      const overlap = Math.min(bar.end, seg.end) - Math.max(bar.start, seg.start);
      if (overlap <= 0) return;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = bi;
      }
      if (overlap >= 0.2 || overlap >= 0.5 * (seg.end - seg.start)) {
        members[bi].push(si);
        placed = true;
      }
    });
    if (!placed && best >= 0) members[best].push(si);
  });

  const loop = findMainLoop(timeline);
  const passOf = new Map<number, number>();
  loop?.occurrences.forEach((start, pass) => {
    for (let k = 0; k < loop.chords.length; k++) passOf.set(start + k, pass);
  });

  let number = 0;
  let prevLastSeg = -1;
  return spans.map((bar, bi) => {
    const segIdx = members[bi].sort((a, b) => a - b);
    const chords: LeadSheetChord[] = [];
    segIdx.forEach((si, k) => {
      const seg = timeline[si];
      const previous = chords[chords.length - 1];
      if (previous && previous.symbol === seg.chord) {
        previous.uncertain ||= showUncertain && isUncertain(seg, threshold);
        return;
      }
      // The bar opens on the chord the previous bar ended with: it's held over.
      const heldOver = k === 0 && seg.start < bar.start - 0.05 && prevLastSeg >= 0 && timeline[prevLastSeg].chord === seg.chord;
      chords.push(chordEntry(seg, threshold, heldOver, label, showUncertain));
    });
    // A bar with no new chord keeps the one still ringing (never "N.C.").
    if (!chords.length) {
      const held = prevLastSeg >= 0 ? prevLastSeg : bi > 0 ? findHeldSegmentIndex(timeline, bar.start) : 0;
      chords.push(chordEntry(timeline[held], threshold, true, label, showUncertain));
    }
    if (segIdx.length) prevLastSeg = segIdx[segIdx.length - 1];
    else prevLastSeg = -1;

    const pass = segIdx.map((si) => passOf.get(si)).find((p) => p !== undefined);
    return {
      number: bar.pickup ? null : ++number,
      pickup: bar.pickup,
      chords,
      loopPass: pass ?? null,
    };
  });
}

interface BuildLeadSheetInput {
  /** The analysis as detected (stat cards show the detected key, like the page). */
  analysis: AnalysisResult;
  /** The analysis as displayed: chords re-spelled for the transpose/capo settings. */
  shown: AnalysisResult;
  transpose: TransposeSettings;
  title: string;
  theme: LeadSheetTheme;
  display?: LeadSheetDisplay;
}

export function buildLeadSheet({ analysis, shown, transpose, title, theme, display = DEFAULT_DISPLAY }: BuildLeadSheetInput): LeadSheet {
  const chordOpts: NotationOptions = { ...display.notation, key: shown.key };
  const chordLabel = (s: string) => formatChord(s, chordOpts);
  const keyLabel = (k: string) => formatKey(k, chordOpts);
  const palette: LeadSheet["palette"] = {
    bg: cssColor("--color-ns-bg", "#050a18"),
    card: cssColor("--color-ns-card", "#0d1630"),
    raised: cssColor("--color-ns-raised", "#101a34"),
    border: cssColor("--color-ns-border", "#202e50"),
    borderStrong: cssColor("--color-ns-border-strong", "#293961"),
    purple: cssColor("--color-ns-purple", "#6c4dff"),
    purpleLight: cssColor("--color-ns-purple-light", "#8b5cf6"),
    cyan: cssColor("--color-ns-cyan", "#22c7d9"),
    text: cssColor("--color-ns-text", "#f4f6ff"),
    muted: cssColor("--color-ns-muted", "#a5b1cc"),
    dim: cssColor("--color-ns-dim", "#687797"),
  };

  const badges = [{ label: "Audio Analysis", color: cssColor("--color-ns-blue", "#4da3ff") }];
  if (analysis.difficulty) {
    const badge = DIFFICULTY_BADGES[analysis.difficulty.difficultyLabel] ?? DEFAULT_DIFFICULTY_BADGE;
    badges.push({
      label: `${analysis.difficulty.difficultyLabel} · ${analysis.difficulty.difficultyScore}/100`,
      color: badge.text.startsWith("#") ? badge.text : cssColor("--color-ns-blue", "#4da3ff"),
    });
  }

  const keyConfidence = describeKeyConfidence(analysis);
  const uniqueChords = new Set(shown.chordProgression).size;
  const stats: LeadSheetStat[] = [
    {
      label: "Detected Key",
      value: keyLabel(analysis.key),
      unit: "",
      note: `${scaleName(analysis)}${keyConfidence ? ` · ${keyConfidence.label}` : ""}`,
      color: cssColor("--color-ns-coral", "#6c4dff"),
    },
    {
      label: "Tempo",
      value: `${Math.round(analysis.bpm)}`,
      unit: "BPM",
      note: tempoNote(analysis),
      color: cssColor("--color-ns-blue", "#4da3ff"),
    },
    {
      label: "Time Signature",
      value: timeSignatureValue(analysis),
      unit: "",
      note: timeSignatureNote(analysis),
      color: cssColor("--color-ns-amber", "#f5b84b"),
    },
    {
      label: "Duration",
      value: analysis.duration,
      unit: "",
      note: `${analysis.chordTimeline.length} chord changes · ${uniqueChords} unique`,
      color: cssColor("--color-ns-mint", "#55d69a"),
    },
  ];

  const unchanged = transpose.capo === 0 && transpose.chordsOnly === 0 && transpose.audio === 0;
  const hear = keyLabel(transposeKey(analysis.key, soundingShift(transpose)));
  const play = unchanged
    ? "No capo · original key"
    : `${keyLabel(transposeKey(analysis.key, shapeShift(transpose)))} shapes · ${transpose.capo ? `Capo ${transpose.capo}` : "No capo"}`;

  const loop = findMainLoop(shown.chordTimeline);
  const diagrams: LeadSheetDiagram[] = Array.from(new Set(shown.chordProgression))
    .filter(isVoiceableChord)
    .map((symbol) => {
      const voicing = getGuitarVoicings(parseChordSymbol(symbol))[0];
      const colors = chordColorsHex(symbol);
      return {
        label: chordLabel(symbol),
        fg: colors.fg,
        fgOnLight: colors.fgOnLight,
        name: voicing?.name ?? null,
        // Left-handed: mirror the strings, as the page's diagrams do.
        frets: voicing ? (display.leftHanded ? [...voicing.frets].reverse() : voicing.frets) : null,
      };
    });

  return {
    theme,
    title,
    badges,
    stats,
    transpose: { hear, play },
    palette,
    beatsPerBar: analysis.beatsPerBar ?? 4,
    bars: buildBars(shown, palette, chordLabel, display.showUncertain),
    loop: loop ? { label: loop.chords.map(chordLabel).join(" → "), count: loop.occurrences.length } : null,
    diagrams,
    notationLegend: notationLegend(chordOpts),
    generatedOn: new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
  };
}

/** "Ação: Live @ Rio!" → "acao-live-rio" (for the download filename). */
export function slugify(title: string): string {
  const slug = title
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "song";
}
