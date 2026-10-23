import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotation } from "../../lib/useNotation";
import { useSettings } from "../../lib/settings/settingsContext";
import type { AnalysisResult, ChordSegment } from "../../lib/api";
import {
  chordColors,
  findMainLoop,
  formatTime,
  isUncertain,
  DEFAULT_LOW_CONFIDENCE,
} from "../../lib/chordSync";

const MIN_PPS = 8;
const MAX_PPS = 220;
const BLOCK_GAP = 3;
/** Fraction of the view width where the playhead sits while following. */
const PLAYHEAD_ANCHOR = 0.3;

/** Picks a starting zoom so a typical chord is ~76px wide. */
function defaultPixelsPerSecond(timeline: ChordSegment[]): number {
  if (!timeline.length) return 40;
  const durations = timeline.map((s) => s.end - s.start).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)] || 2;
  return Math.min(110, Math.max(24, 76 / median));
}

/** Ruler spacing that keeps labels at least ~64px apart. */
function rulerStep(pps: number): number {
  for (const step of [1, 2, 5, 10, 15, 30, 60, 120]) if (step * pps >= 64) return step;
  return 300;
}

interface BlockProps {
  seg: ChordSegment;
  index: number;
  pps: number;
  active: boolean;
  selected: boolean;
  threshold: number;
  interactive: boolean;
  onPick: (index: number) => void;
  /** Chord name formatter (notation settings). */
  label: (symbol: string) => string;
  /** "Show uncertain chords" setting. */
  showUncertain: boolean;
}

const ChordBlock = memo(function ChordBlock({ seg, index, pps, active, selected, threshold, interactive, onPick, label: formatLabel, showUncertain }: BlockProps) {
  const width = Math.max(4, (seg.end - seg.start) * pps - BLOCK_GAP);
  const colors = chordColors(seg.chord);
  const uncertain = showUncertain && isUncertain(seg, threshold);
  const label = formatLabel(seg.chord);
  const confidencePct = seg.confidence !== undefined ? Math.round(seg.confidence * 100) : null;
  const title =
    `${label} · ${formatTime(seg.start)}–${formatTime(seg.end)}` +
    (uncertain && seg.alternative ? ` · uncertain${confidencePct !== null ? ` (${confidencePct}%)` : ""}, could be ${formatLabel(seg.alternative)}` : "");

  return (
    <button
      type="button"
      onClick={() => onPick(index)}
      title={title}
      aria-label={`${title}${interactive ? ". Play from here" : ""}`}
      aria-current={active ? "true" : undefined}
      className={`absolute top-0 flex h-full flex-col justify-center overflow-hidden rounded-lg border px-1.5 text-left transition-[box-shadow,transform,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] ${
        active ? "z-10" : "hover:shadow-[0_0_14px_rgba(255,176,32,0.45)]"
      } ${uncertain ? "border-dashed" : ""}`}
      style={{
        left: seg.start * pps,
        width,
        color: colors.fg,
        background: active ? "rgba(108, 77, 255, 0.28)" : colors.bg,
        borderColor: active ? "#8b5cf6" : selected ? colors.fg : colors.border,
        boxShadow: active ? "0 0 0 1px #8b5cf6, 0 8px 22px -6px rgba(108, 77, 255, 0.7)" : undefined,
      }}
    >
      {width >= 22 && (
        <span className={`truncate font-heading font-bold leading-tight ${width >= 44 ? "text-base" : "text-xs"} ${active ? "text-[var(--color-ns-text)]" : ""}`}>
          {label}
          {uncertain && <sup className="ml-0.5 text-[0.5625rem] font-semibold opacity-80">?</sup>}
        </span>
      )}
      {width >= 52 && (
        <span className={`truncate font-mono text-[0.5938rem] ${active ? "text-[var(--color-ns-muted)]" : "text-[var(--color-ns-dim)]"}`}>
          {formatTime(seg.start)}
        </span>
      )}
    </button>
  );
});

import type { PlaybackClock } from "../../lib/usePlaybackClock";

interface ChordTimelineProps {
  analysis: AnalysisResult;
  /** Playback clock to sync to */
  clock: PlaybackClock;
  /** Sync offset in ms */
  syncOffsetMs: number;
  activeIndex: number;
  selectedChord: string | null;
  isPlaying: boolean;
  /** True when audio is available, so picking a chord seeks + plays. */
  interactive: boolean;
  onPickSegment: (seg: ChordSegment) => void;
}

/**
 * Wilsify's chord timeline: chords laid out to scale against song time, so
 * long chords look long and quick changes look quick. Beat and bar ticks
 * run underneath, the song's main repeating progression is bracketed, and a
 * purple playhead tracks the audio. Horizontally scrollable with zoom for
 * long songs; follows the playhead until the user scrolls it themselves.
 */
export function ChordTimeline({
  analysis,
  clock,
  syncOffsetMs,
  activeIndex,
  selectedChord,
  isPlaying,
  interactive,
  onPickSegment,
}: ChordTimelineProps) {
  const timeline = analysis.chordTimeline;
  const threshold = analysis.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
  const notation = useNotation(analysis.key);
  const { settings } = useSettings();
  const showUncertain = settings.practice.showUncertain;
  const duration = Math.max(analysis.durationSeconds || 0, timeline[timeline.length - 1]?.end ?? 0);
  const [pps, setPps] = useState(() => defaultPixelsPerSecond(timeline));
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  
  // Where the timeline last scrolled itself, to tell its own scrolling
  // apart from the user dragging/swiping it.
  const autoScrollLeft = useRef<number | null>(null);

  const totalWidth = Math.ceil(duration * pps) + 24;
  const showBeats = analysis.bpmStatus !== "low_confidence" && (analysis.beats?.length ?? 0) > 0;
  const loop = useMemo(() => findMainLoop(timeline), [timeline]);

  const onPick = useCallback(
    (index: number) => {
      setFollow(true);
      onPickSegment(timeline[index]);
    },
    [onPickSegment, timeline]
  );

  // Static layers are memoized as elements so per-frame renders only touch the playhead.
  const ruler = useMemo(() => {
    const step = rulerStep(pps);
    const ticks = [];
    for (let t = 0; t <= duration; t += step) {
      ticks.push(
        <div key={t} className="absolute top-0 h-full border-l border-[var(--color-ns-border)]" style={{ left: t * pps }}>
          <span className="ml-1 font-mono text-[0.5938rem] text-[var(--color-ns-dim)]">{formatTime(t)}</span>
        </div>
      );
    }
    return ticks;
  }, [pps, duration]);

  const beatTicks = useMemo(() => {
    if (!showBeats) return null;
    const downbeats = new Set((analysis.downbeats ?? []).map((t) => t.toFixed(3)));
    const dense = pps < 18; // when zoomed far out, draw bar lines only
    return (analysis.beats ?? []).map((t, i) => {
      const isDown = downbeats.has(t.toFixed(3));
      if (dense && !isDown) return null;
      return (
        <div
          key={i}
          className={`absolute bottom-0 w-px ${isDown ? "h-full bg-[var(--color-ns-purple-light)]/70" : "h-1/2 bg-[var(--color-ns-border-bright)]"}`}
          style={{ left: t * pps }}
        />
      );
    });
  }, [analysis.beats, analysis.downbeats, showBeats, pps]);

  const loopBrackets = useMemo(() => {
    if (!loop) return null;
    return loop.occurrences.map((startIdx, n) => {
      const first = timeline[startIdx];
      const last = timeline[startIdx + loop.chords.length - 1];
      return (
        <div
          key={startIdx}
          className="absolute top-0 h-full rounded-b-md border-x border-b border-[var(--color-ns-cyan)]/50"
          style={{ left: first.start * pps + 1, width: Math.max(6, (last.end - first.start) * pps - BLOCK_GAP - 2) }}
          title={`Main progression, pass ${n + 1}`}
        />
      );
    });
  }, [loop, timeline, pps]);

  const ppsRef = useRef(pps);
  const followRef = useRef(follow);
  const interactiveRef = useRef(interactive);
  const syncOffsetRef = useRef(syncOffsetMs);

  useEffect(() => {
    ppsRef.current = pps;
    followRef.current = follow;
    interactiveRef.current = interactive;
    syncOffsetRef.current = syncOffsetMs;
  }, [pps, follow, interactive, syncOffsetMs]);

  // Use the clock subscription to update playhead and scroll without re-rendering
  useEffect(() => {
    if (!interactive) return;
    
    // Initial sync
    const initialT = clock.getCurrentTime() - (syncOffsetMs / 1000);
    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${initialT * pps}px)`;
    }
    const el = scrollRef.current;
    if (el && follow) {
      el.scrollLeft = Math.max(0, initialT * pps - el.clientWidth * PLAYHEAD_ANCHOR);
      autoScrollLeft.current = el.scrollLeft;
    }

    return clock.subscribe((audioT) => {
      const t = audioT - (syncOffsetRef.current / 1000);
      const currentPps = ppsRef.current;
      
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${t * currentPps}px)`;
      }
      
      if (followRef.current && interactiveRef.current) {
        const scrollEl = scrollRef.current;
        if (scrollEl) {
          scrollEl.scrollLeft = Math.max(0, t * currentPps - scrollEl.clientWidth * PLAYHEAD_ANCHOR);
          autoScrollLeft.current = scrollEl.scrollLeft;
        }
      }
    });
  }, [clock, interactive, syncOffsetMs, pps, follow]);

  // Stop following only when the timeline really moves sideways under the
  // user's hand (scrollbar, swipe, trackpad) — not on a page scroll or a
  // click that merely passes over it.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !follow || !isPlaying) return;
    if (autoScrollLeft.current !== null && Math.abs(el.scrollLeft - autoScrollLeft.current) <= 2) return;
    setFollow(false);
  };

  function zoom(factor: number) {
    const el = scrollRef.current;
    const next = Math.min(MAX_PPS, Math.max(MIN_PPS, pps * factor));
    // Keep the playhead (or the current centre) anchored while zooming.
    if (el) {
      const anchorT = interactive ? (clock.getCurrentTime() - (syncOffsetMs / 1000)) : (el.scrollLeft + el.clientWidth / 2) / pps;
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, anchorT * next - el.clientWidth * PLAYHEAD_ANCHOR);
        autoScrollLeft.current = el.scrollLeft;
      });
    }
    setPps(next);
  }

  const uncertainCount = showUncertain ? timeline.filter((s) => isUncertain(s, threshold)).length : 0;

  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Chord Timeline</h2>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            {interactive
              ? "Drawn to scale against the song — tap any chord to play from there."
              : "Drawn to scale against the song. Re-upload the audio to play along."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {interactive && !follow && (
            <button
              type="button"
              onClick={() => setFollow(true)}
              className="rounded-lg border border-[var(--color-ns-purple)]/40 bg-[var(--color-ns-purple)]/15 px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--color-ns-purple-light)] transition-colors hover:bg-[var(--color-ns-purple)]/25"
            >
              Follow playback
            </button>
          )}
          <div className="flex items-center rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]">
            <button
              type="button"
              onClick={() => zoom(1 / 1.5)}
              disabled={pps <= MIN_PPS}
              aria-label="Zoom out timeline"
              className="px-2.5 py-1 text-sm font-bold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)] disabled:opacity-40"
            >
              −
            </button>
            <span className="h-4 w-px bg-[var(--color-ns-border)]" />
            <button
              type="button"
              onClick={() => zoom(1.5)}
              disabled={pps >= MAX_PPS}
              aria-label="Zoom in timeline"
              className="px-2.5 py-1 text-sm font-bold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)] disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.6875rem]">
        <span className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2.5 py-0.5 font-semibold text-[var(--color-ns-muted)]">
          {timeline.length} chord changes
        </span>
        {loop && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-cyan)]/35 bg-[var(--color-ns-cyan)]/10 px-2.5 py-0.5 font-semibold text-[var(--color-ns-cyan)]">
            <span className="text-[var(--color-ns-muted)]">Main progression</span>
            {loop.chords.map(notation.chord).join(" → ")}
            <span className="text-[var(--color-ns-muted)]">×{loop.occurrences.length}</span>
          </span>
        )}
        {uncertainCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-ns-amber)]/45 px-2.5 py-0.5 font-semibold text-[var(--color-ns-amber)]">
            {uncertainCount} uncertain <span className="font-normal text-[var(--color-ns-muted)]">(dashed, marked ?)</span>
          </span>
        )}
      </div>

      {timeline.length === 0 ? (
        <p className="mt-5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4 text-xs text-[var(--color-ns-muted)]">
          No chords could be recognized in this audio — it may be percussion-only, speech, or too noisy for chord detection.
        </p>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="mt-4 overflow-x-auto overscroll-x-contain pb-2"
        >
          <div className="relative" style={{ width: totalWidth }}>
            <div className="relative h-5">{ruler}</div>
            <div className="relative mt-1 h-16">
              {timeline.map((seg, i) => (
                <ChordBlock
                  key={`${seg.start}-${i}`}
                  seg={seg}
                  index={i}
                  pps={pps}
                  active={interactive && i === activeIndex}
                  selected={seg.chord === selectedChord}
                  threshold={threshold}
                  interactive={interactive}
                  onPick={onPick}
                  label={notation.chord}
                  showUncertain={showUncertain}
                />
              ))}
            </div>
            {showBeats && <div className="relative mt-1.5 h-3">{beatTicks}</div>}
            {loop && <div className="relative mt-1 h-2">{loopBrackets}</div>}

            {interactive && (
              <div
                ref={playheadRef}
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 rounded-full bg-[var(--color-ns-purple-light)] shadow-[0_0_10px_rgba(139,92,246,0.9)]"
                style={{ transform: `translateX(${(clock.getCurrentTime() - (syncOffsetMs / 1000)) * pps}px)` }}
              >
                <span className="absolute -top-1 -left-[3px] h-2 w-2 rounded-full bg-[var(--color-ns-purple-light)]" />
              </div>
            )}
          </div>
        </div>
      )}

      {notation.legend && <p className="mt-2 text-[0.6875rem] text-[var(--color-ns-muted)]">{notation.legend}</p>}

      {showBeats && timeline.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.6562rem] text-[var(--color-ns-dim)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-px bg-[var(--color-ns-purple-light)]" /> Bar start (estimated)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-px bg-[var(--color-ns-border-bright)]" /> Beat
          </span>
          {loop && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-b-sm border-x border-b border-[var(--color-ns-cyan)]/60" /> Main progression
            </span>
          )}
        </div>
      )}
    </div>
  );
}
