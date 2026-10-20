import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotation } from "../../lib/useNotation";
import { useSettings } from "../../lib/settings/settingsContext";
import { countIn } from "../../lib/metronome";
import type { AnalysisResult, ChordSegment } from "../../lib/api";
import {
  beatInBar,
  chordColors,
  findNextSegmentIndex,
  findHeldSegmentIndex,
  formatTime,
  isUncertain,
  DEFAULT_LOW_CONFIDENCE,
} from "../../lib/chordSync";
import { usePlaybackClock } from "../../lib/usePlaybackClock";
import { ChordTimeline } from "./ChordTimeline";

interface LiveChordSyncProps {
  analysis: AnalysisResult;
  audioUrl: string | null;
  selectedChord: string | null;
  /** Fires only when the sounding chord changes (null = no chord / not playing). */
  onActiveChordChange: (chord: string | null) => void;
  /** Without audio, picking a timeline chord just selects it. */
  onSelectChord: (chord: string) => void;
}

/**
 * The live part of the Analysis page: the audio player, the big "now
 * playing" chord, and the chord timeline — all driven by one playback clock
 * so they can't drift apart. Owning the clock here keeps the per-frame
 * re-renders inside this subtree instead of the whole page.
 */
export function LiveChordSync({ analysis, audioUrl, selectedChord, onActiveChordChange, onSelectChord }: LiveChordSyncProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const clock = usePlaybackClock(audioRef, audioUrl);
  const timeline = analysis.chordTimeline;
  const threshold = analysis.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
  const notation = useNotation(analysis.key);
  const displayChord = notation.chord;
  const { settings } = useSettings();
  const { playbackSpeed } = settings.display;
  const { countIn: countInBars, metronomeSound, metronomeVolume } = settings.audio;
  const [counting, setCounting] = useState(false);
  const countAbort = useRef<AbortController | null>(null);
  const duration = clock.duration || analysis.durationSeconds || 0;
  
  // Sign convention: syncOffsetMs > 0 means the audio decoder added silence at the start.
  // We subtract the offset from the audio's currentTime to find the true analysis time.
  // This offset is applied exactly once per frame update.
  const [syncOffsetMs, setSyncOffsetMs] = useState(0);

  // Update React state ONLY when the active chord index changes
  const initialTime = clock.getCurrentTime() - (syncOffsetMs / 1000);
  const [activeIndex, setActiveIndex] = useState(() => findHeldSegmentIndex(timeline, initialTime));

  const active = activeIndex >= 0 ? timeline[activeIndex] : null;
  const nextIndex = activeIndex >= 0 ? activeIndex + 1 : findNextSegmentIndex(timeline, initialTime);
  const next = timeline[nextIndex] ?? null;
  const prev = activeIndex > 0 ? timeline[activeIndex - 1] : activeIndex < 0 && nextIndex > 0 ? timeline[nextIndex - 1] : null;
  const beatsPerBar = analysis.beatsPerBar ?? 4;

  const activeChord = active?.chord ?? null;
  useEffect(() => {
    onActiveChordChange(audioUrl ? activeChord : null);
  }, [activeChord, audioUrl, onActiveChordChange]);

  // DOM Refs for smooth animation without React re-renders
  const timeTextRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const trackProgressRef = useRef<HTMLDivElement>(null);
  const chordProgressRef = useRef<HTMLDivElement>(null);
  const untilNextRef = useRef<HTMLSpanElement>(null);
  const beatContainerRef = useRef<HTMLDivElement>(null);
  
  const lastIndexRef = useRef(activeIndex);
  const lastBeatRef = useRef<number | null>(audioUrl ? beatInBar(analysis, initialTime) : null);
  const syncOffsetRef = useRef(syncOffsetMs);
  
  useEffect(() => {
    syncOffsetRef.current = syncOffsetMs;
  }, [syncOffsetMs]);

  useEffect(() => {
    if (!audioUrl) return;
    return clock.subscribe((audioT) => {
      // 1. Convert audio time to analysis time exactly once
      const analysisT = audioT - (syncOffsetRef.current / 1000);
      
      // 2. Update state ONLY if active index changes
      const idx = findHeldSegmentIndex(timeline, analysisT);
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        setActiveIndex(idx);
      }
      
      // 3. Update DOM for smooth UI
      if (timeTextRef.current) timeTextRef.current.textContent = formatTime(audioT);
      if (sliderRef.current && document.activeElement !== sliderRef.current) {
        sliderRef.current.value = String(Math.min(audioT, duration || 0));
      }
      if (trackProgressRef.current) {
        trackProgressRef.current.style.width = duration > 0 ? `${(audioT / duration) * 100}%` : "0%";
      }
      
      // Use active chord from the latest ref / state. We use the *current* state logic because 
      // the DOM updates fire immediately but state changes apply next tick.
      // For precision, we look at the timeline using `idx`.
      const currentActive = idx >= 0 ? timeline[idx] : null;
      if (chordProgressRef.current && currentActive) {
        const prog = Math.min(1, Math.max(0, (analysisT - currentActive.start) / (currentActive.end - currentActive.start)));
        chordProgressRef.current.style.width = `${prog * 100}%`;
      }
      
      const nxtIdx = idx >= 0 ? idx + 1 : findNextSegmentIndex(timeline, analysisT);
      const currentNext = timeline[nxtIdx] ?? null;
      if (untilNextRef.current && currentNext) {
        const u = currentNext.start - analysisT;
        untilNextRef.current.textContent = `Next${u !== null && u < 10 ? ` · ${u.toFixed(1)}s` : ""}`;
      }
      
      if (beatContainerRef.current) {
        const b = beatInBar(analysis, analysisT);
        if (b !== lastBeatRef.current) {
          lastBeatRef.current = b;
          const dots = beatContainerRef.current.children;
          for (let i = 0; i < dots.length; i++) {
            dots[i].className = `h-2.5 w-2.5 rounded-full transition-colors duration-75 ${
              i === b
                ? i === 0
                  ? "bg-[var(--color-ns-purple-light)] shadow-[0_0_8px_rgba(139,92,246,0.9)]"
                  : "bg-[var(--color-ns-text)]"
                : "bg-[var(--color-ns-border-strong)]"
            }`;
          }
        }
      }
    });
  }, [clock, audioUrl, timeline, duration, analysis]);

  const { playFrom, setLoop, loop } = clock;
  const handlePick = useCallback(
    (seg: ChordSegment) => {
      onSelectChord(seg.chord);
      if (!audioUrl) return;
      if (loop) setLoop({ start: seg.start, end: seg.end });
      // Apply offset inverse so seeking to analysis time 10s seeks audio to 10s + offset
      playFrom(seg.start + (syncOffsetMs / 1000));
    },
    [audioUrl, loop, onSelectChord, playFrom, setLoop, syncOffsetMs]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = playbackSpeed;
    audio.playbackRate = playbackSpeed;
    audio.preservesPitch = true;
  }, [playbackSpeed, audioUrl]);

  const togglePlay = useCallback(async () => {
    if (counting) {
      countAbort.current?.abort();
      return;
    }
    if (clock.isPlaying || countInBars === 0) {
      clock.toggle();
      return;
    }
    const controller = new AbortController();
    countAbort.current = controller;
    setCounting(true);
    try {
      await countIn({
        bars: countInBars,
        beatsPerBar: analysis.beatsPerBar ?? 4,
        bpm: analysis.bpm,
        sound: metronomeSound,
        volume: metronomeVolume,
        signal: controller.signal,
      });
      clock.play();
    } catch {
      // Cancelled
    } finally {
      setCounting(false);
    }
  }, [counting, clock, countInBars, analysis.beatsPerBar, analysis.bpm, metronomeSound, metronomeVolume]);

  const keys = useRef({ togglePlay, clock, toggleLoop: () => {} });
  useEffect(() => {
    if (!audioUrl) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === " " || e.code === "Space") {
        if (el && /^(BUTTON|A)$/.test(el.tagName)) return;
        e.preventDefault();
        void keys.current.togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        keys.current.clock.seek(keys.current.clock.getCurrentTime() - 5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        keys.current.clock.seek(keys.current.clock.getCurrentTime() + 5);
      } else if (e.key === "l" || e.key === "L") {
        keys.current.toggleLoop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [audioUrl]);
  
  useEffect(() => {
    keys.current = { togglePlay, clock, toggleLoop };
  });

  function toggleLoop() {
    if (clock.loop) clock.setLoop(null);
    else if (active) clock.setLoop({ start: active.start, end: active.end });
  }

  const miniMap = useMemo(
    () =>
      duration > 0
        ? timeline.map((seg, i) => (
            <span
              key={i}
              className="absolute top-0 h-full"
              style={{
                left: `${(seg.start / duration) * 100}%`,
                width: `${((seg.end - seg.start) / duration) * 100}%`,
                background: chordColors(seg.chord).border,
              }}
            />
          ))
        : null,
    [timeline, duration]
  );

  const uncertain = active && settings.practice.showUncertain ? isUncertain(active, threshold) : false;
  const activeColors = active ? chordColors(active.chord) : null;
  const initialAudioTime = clock.getCurrentTime();

  return (
    <>
      {audioUrl ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)]">
          <audio ref={audioRef} src={audioUrl} preload="auto" />

          {import.meta.env.DEV && (
            <div className="flex items-center gap-2 border-b border-[var(--color-ns-border)] bg-[var(--color-ns-raised)]/50 px-3 py-1 text-xs text-[var(--color-ns-muted)]">
              <span>DEV: Sync Offset (ms)</span>
              <input 
                type="number" 
                value={syncOffsetMs} 
                onChange={(e) => setSyncOffsetMs(Number(e.target.value))} 
                className="w-20 rounded bg-[var(--color-ns-bg)] px-1 py-0.5 text-[var(--color-ns-text)]" 
              />
              <span className="text-[10px]">(Positive = Audio decoder added silence)</span>
            </div>
          )}

          {/* Now playing */}
          <div className="relative px-5 pt-5 sm:px-7 sm:pt-6">
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{ background: "radial-gradient(60% 90% at 50% 0%, rgba(108,77,255,0.16), transparent 70%)" }}
            />
            <div className="relative flex items-center justify-between gap-2">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Now playing</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-ns-purple)]/30 bg-[var(--color-ns-purple)]/10 px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--color-ns-purple-light)]">
                <span className={`h-2 w-2 rounded-full bg-[var(--color-ns-purple-light)] ${clock.isPlaying ? "animate-pulse" : ""}`} />
                {clock.isPlaying ? "Synced to audio" : "Paused"}
              </span>
            </div>

            <div className="relative mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3 sm:gap-6">
              <div className="min-w-0 text-left">
                {prev && (
                  <button
                    type="button"
                    onClick={() => handlePick(prev)}
                    className="group max-w-full text-left"
                    aria-label={`Previous chord ${displayChord(prev.chord)}, play from ${formatTime(prev.start)}`}
                  >
                    <span className="block text-[0.625rem] font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">Previous</span>
                    <span className="block truncate font-heading text-2xl font-bold text-[var(--color-ns-muted)] transition-colors group-hover:text-[var(--color-ns-text)] sm:text-3xl">
                      {displayChord(prev.chord)}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex min-w-[7.5rem] flex-col items-center text-center sm:min-w-[11rem]" aria-live="polite">
                <span
                  className={`font-heading text-6xl font-extrabold leading-none tracking-tight sm:text-7xl ${uncertain ? "opacity-80" : ""}`}
                  style={{ color: activeColors ? activeColors.fg : "var(--color-ns-dim)" }}
                >
                  {active ? displayChord(active.chord) : "—"}
                </span>
                <span className="mt-2 h-5 text-[0.6875rem] font-medium text-[var(--color-ns-muted)]">
                  {active
                    ? uncertain
                      ? `Uncertain — could be ${displayChord(active.alternative ?? "")}`
                      : formatTime(active.start) + " – " + formatTime(active.end)
                    : "No chord here"}
                </span>
              </div>

              <div className="min-w-0 text-right">
                {next && (
                  <button
                    type="button"
                    onClick={() => handlePick(next)}
                    className="group ml-auto block max-w-full text-right"
                    aria-label={`Next chord ${displayChord(next.chord)}, play from ${formatTime(next.start)}`}
                  >
                    <span ref={untilNextRef} className="block text-[0.625rem] font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">
                      Next{next.start - initialTime < 10 ? ` · ${(next.start - initialTime).toFixed(1)}s` : ""}
                    </span>
                    <span className="block truncate font-heading text-2xl font-bold text-[var(--color-ns-text)] transition-colors group-hover:text-[var(--color-ns-purple-light)] sm:text-3xl">
                      {displayChord(next.chord)}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Beat-in-bar + time left on this chord */}
            <div className="relative mt-4 flex items-center gap-3">
              {audioUrl ? (
                <div ref={beatContainerRef} className="flex gap-1.5" aria-label="Beat">
                  {Array.from({ length: beatsPerBar }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full transition-colors duration-75 ${
                        i === lastBeatRef.current
                          ? i === 0
                            ? "bg-[var(--color-ns-purple-light)] shadow-[0_0_8px_rgba(139,92,246,0.9)]"
                            : "bg-[var(--color-ns-text)]"
                          : "bg-[var(--color-ns-border-strong)]"
                      }`}
                    />
                  ))}
                </div>
              ) : (
                <span className="text-[0.6562rem] text-[var(--color-ns-dim)]">
                  {analysis.timeSignatureStatus === "unavailable" ? "Bar position unavailable" : ""}
                </span>
              )}
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-ns-border)]">
                <div
                  ref={chordProgressRef}
                  className="h-full rounded-full bg-[var(--color-ns-purple-light)]"
                  style={{ width: active ? `${Math.min(1, Math.max(0, (initialTime - active.start) / (active.end - active.start))) * 100}%` : "0%" }}
                />
              </div>
            </div>
          </div>

          {/* Transport */}
          <div className="mt-5 border-t border-[var(--color-ns-border)] bg-[var(--color-ns-raised)]/60 px-5 py-4 sm:px-7">
            {clock.error && (
              <p role="alert" className="mb-3 rounded-lg border border-[var(--color-ns-red)]/30 bg-[var(--color-ns-red)]/10 px-3 py-2 text-xs text-[var(--color-ns-red)]">
                {clock.error}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => clock.seek(clock.getCurrentTime() - 5)}
                  aria-label="Back 5 seconds"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-ns-border)] text-[var(--color-ns-muted)] transition-colors hover:text-[var(--color-ns-text)]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  disabled={Boolean(clock.error)}
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-ns-coral)] text-[var(--color-ns-ink)] shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                  aria-label={counting ? "Cancel count-in" : clock.isPlaying ? "Pause track" : "Play track"}
                >
                  {counting ? (
                    <span className="text-[0.6875rem] font-bold">1·2·3</span>
                  ) : clock.isPlaying ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                      <polygon points="7 5 19 12 7 19 7 5" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => clock.seek(clock.getCurrentTime() + 5)}
                  aria-label="Forward 5 seconds"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-ns-border)] text-[var(--color-ns-muted)] transition-colors hover:text-[var(--color-ns-text)]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between font-mono text-xs text-[var(--color-ns-muted)]">
                  <span ref={timeTextRef} className="text-[var(--color-ns-text)]">{formatTime(initialAudioTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="relative h-5">
                  <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--color-ns-border)]">
                    {miniMap}
                    <div
                      ref={trackProgressRef}
                      className="absolute inset-y-0 left-0 bg-[var(--color-ns-purple)]/55"
                      style={{ width: duration > 0 ? `${(initialAudioTime / duration) * 100}%` : "0%" }}
                    />
                    {clock.loop && duration > 0 && (
                      <div
                        className="absolute inset-y-0 border-x-2 border-[var(--color-ns-cyan)] bg-[var(--color-ns-cyan)]/25"
                        style={{
                          left: `${(clock.loop.start / duration) * 100}%`,
                          width: `${((clock.loop.end - clock.loop.start) / duration) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                  <input
                    ref={sliderRef}
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.05}
                    defaultValue={Math.min(initialAudioTime, duration || 0)}
                    onChange={(e) => clock.seek(Number(e.target.value))}
                    aria-label="Seek track position"
                    className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--color-ns-purple)] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--color-ns-purple)] [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(108,77,255,0.8)]"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={toggleLoop}
                disabled={!clock.loop && !active}
                aria-pressed={Boolean(clock.loop)}
                className={`self-center rounded-lg border px-3 py-1.5 text-[0.6875rem] font-semibold transition-colors disabled:opacity-40 ${
                  clock.loop
                    ? "border-[var(--color-ns-cyan)]/50 bg-[var(--color-ns-cyan)]/15 text-[var(--color-ns-cyan)]"
                    : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                {clock.loop
                  ? `Looping ${formatTime(clock.loop.start)}–${formatTime(clock.loop.end)} · Stop`
                  : "Loop this chord"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 text-xs text-[var(--color-ns-muted)]">
          Reopened from your Library — the saved chords, key, tempo and difficulty are all real, but original audio is kept only in active
          sessions, so playback sync isn't available. Upload the song again to play along.
        </div>
      )}

      <div className="mt-6">
        <ChordTimeline
          analysis={analysis}
          clock={clock}
          syncOffsetMs={syncOffsetMs}
          activeIndex={activeIndex}
          selectedChord={selectedChord}
          isPlaying={clock.isPlaying}
          interactive={Boolean(audioUrl)}
          onPickSegment={handlePick}
        />
      </div>
    </>
  );
}
