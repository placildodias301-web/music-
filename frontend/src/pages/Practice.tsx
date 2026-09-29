import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { detectPitch, INSTRUMENT_RANGES } from "../lib/pitchDetect";
import { parseChordSymbol, chordNoteNames } from "../lib/chordTheory";
import { logPracticeSession } from "../lib/practiceLog";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const ACCURACY_WINDOW_MS = 4000;
const RAMP_CHECK_INTERVAL_MS = 4000;
const RAMP_ACCURACY_THRESHOLD = 0.7;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useMetronome(bpm: number) {
  const [isRunning, setIsRunning] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  function tick() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  function start() {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    const intervalMs = 60000 / bpm;
    tick();
    timerRef.current = window.setInterval(tick, intervalMs);
    setIsRunning(true);
  }

  function stop() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
  }

  useEffect(() => {
    if (isRunning) {
      stop();
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return { isRunning, toggle: () => (isRunning ? stop() : start()) };
}

export function Practice() {
  const { audioUrl, fileName, analysis, isSampleAudio } = useMvp();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState<number>(2); // index of 1x in SPEEDS
  const [loop, setLoop] = useState(false);
  const speed = SPEEDS[speedIndex];

  const bpm = analysis?.bpm ?? 120;
  const metronome = useMetronome(bpm);

  // ---- Real-time accuracy tracking (Section 4.3: tempo ramp-up driven by real accuracy) ----
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [liveAccuracy, setLiveAccuracy] = useState<number | null>(null);
  const [currentChordLabel, setCurrentChordLabel] = useState<string | null>(null);
  const [autoTempoEnabled, setAutoTempoEnabled] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const accuracySamplesRef = useRef<{ t: number; correct: boolean }[]>([]);
  const lastRampCheckRef = useRef<number>(0);
  const weakChordCountsRef = useRef<Record<string, number>>({});
  const practiceStartRef = useRef<number | null>(null);

  const guitarRange = INSTRUMENT_RANGES.find((r) => r.id === "guitar")!;

  function currentExpectedChord(): string | null {
    if (!analysis?.chordTimeline?.length) return null;
    const t = audioRef.current?.currentTime ?? 0;
    const seg = analysis.chordTimeline.find((s) => t >= s.start && t < s.end);
    return seg?.chord ?? analysis.chordTimeline[analysis.chordTimeline.length - 1]?.chord ?? null;
  }

  async function startMic() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);
      setMicActive(true);
      practiceStartRef.current = Date.now();
      accuracyLoop();
    } catch {
      setMicError("Couldn't access the microphone — accuracy tracking needs mic access.");
    }
  }

  function stopMic() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    setMicActive(false);
    setLiveAccuracy(null);

    if (practiceStartRef.current && analysis) {
      const durationSeconds = (Date.now() - practiceStartRef.current) / 1000;
      logPracticeSession({
        songName: fileName ?? "Untitled",
        durationSeconds,
        tempoUsed: speed,
        chordsPracticed: Array.from(new Set(analysis.chordProgression)),
        weakChordCounts: { ...weakChordCountsRef.current },
      });
    }
    practiceStartRef.current = null;
    weakChordCountsRef.current = {};
  }

  function accuracyLoop() {
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    const ctx = audioCtxRef.current;
    if (!analyser || !buffer || !ctx) return;

    analyser.getFloatTimeDomainData(buffer);
    const result = detectPitch(buffer, ctx.sampleRate, guitarRange);

    const expectedChord = currentExpectedChord();
    setCurrentChordLabel(expectedChord);

    if (expectedChord) {
      const expectedNotes = chordNoteNames(parseChordSymbol(expectedChord));
      const now = Date.now();

      if (result) {
        const isCorrect = expectedNotes.includes(result.note);
        accuracySamplesRef.current.push({ t: now, correct: isCorrect });
        if (!isCorrect) {
          weakChordCountsRef.current[expectedChord] = (weakChordCountsRef.current[expectedChord] ?? 0) + 1;
        }
      }

      accuracySamplesRef.current = accuracySamplesRef.current.filter((s) => now - s.t < ACCURACY_WINDOW_MS);
      if (accuracySamplesRef.current.length > 0) {
        const correctCount = accuracySamplesRef.current.filter((s) => s.correct).length;
        const accuracy = correctCount / accuracySamplesRef.current.length;
        setLiveAccuracy(accuracy);

        if (autoTempoEnabled && now - lastRampCheckRef.current > RAMP_CHECK_INTERVAL_MS) {
          lastRampCheckRef.current = now;
          if (accuracy >= RAMP_ACCURACY_THRESHOLD) {
            setSpeedIndex((i) => Math.min(SPEEDS.length - 1, i + 1));
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(accuracyLoop);
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loop;
  }, [loop]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }

  const activeChordIndex =
    duration > 0 && analysis?.chordProgression?.length
      ? Math.min(
          analysis.chordProgression.length - 1,
          Math.floor((currentTime / duration) * analysis.chordProgression.length)
        )
      : -1;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-4xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-orange/15 px-2.5 py-0.5 text-[11px] font-semibold text-orange">
            Interactive Practice Suite
          </span>
          {bpm > 0 && (
            <span className="rounded-full border border-glass bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-cyan">
              {bpm} BPM
            </span>
          )}
        </div>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-content sm:text-3xl">
          Practice Mode
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          {fileName ? `Loaded: ${fileName}` : "No song loaded yet"}
          {isSampleAudio && " (built-in sample clip)"}
        </p>
      </div>

      {!audioUrl && (
        <div className="glass-card mb-6 flex flex-col items-center gap-3 p-8 text-center sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary-light">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 4 19 12 6 20 6 4" />
            </svg>
          </div>
          <p className="max-w-md text-sm text-content-muted">
            Upload an audio or video file, or run the instant sample track from Studio to practice along with chords and speed controls.
          </p>
          <div className="mt-2 flex gap-3">
            <Link to="/upload" className="btn-primary text-xs sm:text-sm">
              Upload a Song
            </Link>
            <Link to="/studio" className="btn-secondary text-xs sm:text-sm">
              Return to Studio
            </Link>
          </div>
        </div>
      )}

      {audioUrl && (
        <div className="glass-card mb-6 p-6 sm:p-7">
          <audio ref={audioRef} src={audioUrl} preload="metadata" />

          {/* Primary Scrubber & Play Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-[0_4px_24px_rgba(124,92,255,0.45)] transition-transform hover:scale-105 active:scale-95 self-center sm:self-auto"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1.5" />
                  <rect x="14" y="5" width="4" height="14" rx="1.5" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="ml-1">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek position in track"
                className="w-full h-2 cursor-pointer rounded-lg bg-white/10 accent-[#7C5CFF]"
              />
              <div className="mt-2 flex justify-between font-mono text-xs text-content-dim">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          {/* Controls toolbar */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-glass/80 pt-5">
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-content-dim">
                Tempo Rate
              </span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {SPEEDS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeedIndex(i)}
                    className={`rounded-xl px-3 py-1.5 font-mono text-xs font-semibold transition-all ${
                      speedIndex === i
                        ? "bg-primary text-white shadow-[0_2px_12px_rgba(124,92,255,0.35)]"
                        : "border border-glass bg-white/[0.02] text-content-muted hover:border-glass-strong hover:text-content"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLoop((l) => !l)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                  loop
                    ? "border-cyan/50 bg-cyan/15 text-cyan shadow-sm"
                    : "border-glass bg-white/[0.02] text-content-muted hover:border-glass-strong hover:text-content"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {loop ? "Looping On" : "Loop Off"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metronome Console */}
      <div className="glass-card mb-6 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl font-mono text-sm font-bold transition-all ${
                metronome.isRunning
                  ? "bg-primary text-white shadow-[0_0_16px_rgba(124,92,255,0.6)] animate-pulse"
                  : "bg-white/[0.04] text-content-dim border border-glass"
              }`}
            >
              ♩
            </span>
            <div>
              <h2 className="font-heading text-sm font-bold text-content sm:text-base">Beat Metronome</h2>
              <p className="font-mono text-xs text-content-dim">{bpm} BPM · Syncs with track tempo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={metronome.toggle}
            className={`px-4 py-2 text-xs font-semibold ${metronome.isRunning ? "btn-secondary text-pink border-pink/30" : "btn-primary"}`}
          >
            {metronome.isRunning ? "Stop Metronome" : "Start Metronome"}
          </button>
        </div>
      </div>

      {analysis && (
        <div className="glass-card mb-8 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-content">Live Accuracy Tracking</h2>
              <p className="mt-1 text-xs text-content-dim">
                Uses your mic to check the note you're playing against the expected chord at this
                point in the song, then automatically ramps up playback speed as your accuracy
                improves — real accuracy tracking, not a timer.
              </p>
            </div>
            <button type="button" onClick={micActive ? stopMic : startMic} className={micActive ? "btn-ghost" : "btn-primary"}>
              {micActive ? "Stop Tracking" : "Start Accuracy Tracking"}
            </button>
          </div>

          {micError && <p className="mt-3 text-sm text-pink">{micError}</p>}

          {micActive && (
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-content-muted">
                <input
                  type="checkbox"
                  checked={autoTempoEnabled}
                  onChange={(e) => setAutoTempoEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#7C5CFF]"
                />
                Auto-increase tempo when accuracy stays above 70%
              </label>

              <div className="flex items-center justify-between text-sm">
                <span className="text-content-muted">
                  Expected chord right now: <span className="font-semibold text-content">{currentChordLabel ?? "—"}</span>
                </span>
                <span className="text-content-muted">
                  Accuracy: <span className="font-semibold text-content">{liveAccuracy !== null ? `${Math.round(liveAccuracy * 100)}%` : "—"}</span>
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pink via-orange to-green transition-all"
                  style={{ width: `${liveAccuracy !== null ? Math.round(liveAccuracy * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {analysis && (
        <div className="glass-card p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-bold text-content">Chord Progression</h2>
              <p className="text-xs text-content-dim">Follow along as the track plays</p>
            </div>
            {activeChordIndex >= 0 && (
              <span className="rounded-full bg-primary/20 px-3 py-1 font-mono text-xs font-bold text-primary-light animate-pulse">
                Current: {analysis.chordProgression[activeChordIndex]}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5 sm:gap-3">
            {analysis.chordProgression.map((chord, i) => {
              const isCurrent = i === activeChordIndex;
              return (
                <div
                  key={`${chord}-${i}`}
                  className={`flex h-12 min-w-12 items-center justify-center rounded-xl font-heading text-sm sm:text-base font-bold transition-all duration-150 ${
                    isCurrent
                      ? "scale-110 border-2 border-primary-light bg-primary text-white shadow-[0_0_20px_rgba(124,92,255,0.75)] z-10"
                      : "border border-primary/25 bg-primary/10 text-primary-light hover:border-primary/50"
                  } px-3.5`}
                >
                  {chord}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
