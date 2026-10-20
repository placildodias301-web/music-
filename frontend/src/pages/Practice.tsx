import { useEffect, useRef, useState } from "react";
import { audioContext, playClick } from "../lib/metronome";
import { useSettings } from "../lib/settings/settingsContext";
import type { MetronomeSound } from "../lib/settings/model";
import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { detectPitch, INSTRUMENT_RANGES } from "../lib/pitchDetect";
import { parseChordSymbol, chordNoteNames } from "../lib/chordTheory";
import { logPracticeSession } from "../lib/practiceLog";
import { isSaved, resolveLibrarySong, saveToLibrary, updateLibrarySongState } from "../lib/library";
import { resetRhythm, withTempo } from "../lib/rhythm";
import { tempoNote } from "../lib/analysisDisplay";
import { validateUploadFile, type AnalysisResult } from "../lib/api";
import { CHIP, HalfDoubleButtons, TapPad } from "../components/TapTempo";
import {
  ALLOWED_PRACTICE_SPEEDS,
  getMicrophoneErrorMessage,
  loadPracticePreferences,
  savePracticePreferences,
} from "../lib/practicePreferences";

const SPEEDS = ALLOWED_PRACTICE_SPEEDS;
const ACCURACY_WINDOW_MS = 4000;
const RAMP_CHECK_INTERVAL_MS = 4000;
const RAMP_ACCURACY_THRESHOLD = 0.7;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Beat metronome using the click sound and volume from Settings (beat 1 of
 * each bar accented). Clicks are scheduled on the audio clock ahead
 * of time to prevent drift with the UI thread.
 */
function useMetronome(bpm: number, sound: MetronomeSound, volume: number, beatsPerBar = 4) {
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<number | null>(null);
  const settingsRef = useRef({ sound, volume, beatsPerBar });
  settingsRef.current = { sound, volume, beatsPerBar };

  function start() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const ctx = audioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const safeBpm = Math.max(30, Math.min(300, bpm || 120));
    const interval = 60 / safeBpm;
    let next = ctx.currentTime + 0.05;
    let beat = 0;
    const schedule = () => {
      // Keep ~150 ms of clicks queued ahead of the audio clock.
      while (next < ctx.currentTime + 0.15) {
        const { sound: s, volume: v, beatsPerBar: n } = settingsRef.current;
        playClick(ctx, next, s, v, beat % n === 0);
        next += interval;
        beat += 1;
      }
    };
    schedule();
    timerRef.current = window.setInterval(schedule, 25);
    setIsRunning(true);
  }

  function stop() {
    if (timerRef.current !== null) {
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
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { isRunning, start, stop, toggle: () => (isRunning ? stop() : start()) };
}

export function Practice() {
  const { libraryId, audioUrl, fileName, analysis, isSampleAudio, setAnalysis, attachAudioFile } = useMvp();
  const [tapping, setTapping] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const reattachInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState<number>(2); // index of 1x in SPEEDS
  const [loop, setLoop] = useState(false);
  const [autoTempoEnabled, setAutoTempoEnabled] = useState(false);
  const speed = SPEEDS[speedIndex];

  const resolvedSavedSong = resolveLibrarySong(libraryId || fileName || analysis?.fileName || "");
  const effectiveAnalysis = analysis ?? resolvedSavedSong?.analysis ?? null;
  const effectiveFileName = fileName ?? resolvedSavedSong?.fileName ?? effectiveAnalysis?.fileName ?? null;
  const targetSongRef = resolvedSavedSong?.id ?? libraryId ?? effectiveFileName;
  const bpm = effectiveAnalysis?.bpm ?? 120;

  // Re-attach state & modal
  const [reattachError, setReattachError] = useState<string | null>(null);
  const [pendingReattachFile, setPendingReattachFile] = useState<File | null>(null);

  // Selected chord for Chord Practice mode (Mode B)
  const [selectedChordIndex, setSelectedChordIndex] = useState<number>(0);

  // Practice preferences persistence
  const prefsLoadedRef = useRef(false);

  useEffect(() => {
    if (!targetSongRef) return;
    const loaded = loadPracticePreferences(targetSongRef) ?? resolvedSavedSong?.practicePreferences;
    if (loaded) {
      const idx = SPEEDS.indexOf(loaded.speed as (typeof SPEEDS)[number]);
      if (idx !== -1) setSpeedIndex(idx);
      setLoop(loaded.loop);
      setAutoTempoEnabled(loaded.autoTempoEnabled);
    }
    prefsLoadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per song; the saved-prefs object is rebuilt on every render
  }, [targetSongRef]);

  useEffect(() => {
    if (!targetSongRef || !prefsLoadedRef.current) return;
    const currentSpeed = SPEEDS[speedIndex];
    const prefs = {
      speed: currentSpeed,
      loop,
      autoTempoEnabled,
      preferredMode: audioUrl ? ("full_audio" as const) : ("chord_practice" as const),
    };
    savePracticePreferences(targetSongRef, prefs);
    if (resolvedSavedSong?.id) {
      updateLibrarySongState(resolvedSavedSong.id, { practicePreferences: prefs });
    }
  }, [targetSongRef, speedIndex, loop, autoTempoEnabled, audioUrl, resolvedSavedSong?.id]);

  /** A tempo correction updates the song everywhere (Analysis, timeline, PDF) and its Library copy. */
  function applyTempo(next: AnalysisResult) {
    setAnalysis(next);
    const ref = resolvedSavedSong?.id ?? libraryId ?? effectiveFileName ?? next.fileName;
    if (ref && isSaved(ref)) saveToLibrary(ref, next);
  }
  const { settings } = useSettings();
  const metronome = useMetronome(
    bpm,
    settings.audio.metronomeSound,
    settings.audio.metronomeVolume,
    effectiveAnalysis?.beatsPerBar ?? 4
  );

  // "M" starts/stops the metronome (not while typing).
  const metronomeRef = useRef(metronome);
  useEffect(() => {
    metronomeRef.current = metronome;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== "m" && e.key !== "M")) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      metronomeRef.current.toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Real-time accuracy tracking ----
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [liveAccuracy, setLiveAccuracy] = useState<number | null>(null);
  const [currentChordLabel, setCurrentChordLabel] = useState<string | null>(null);

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
    if (!effectiveAnalysis?.chordProgression?.length) return null;
    if (audioUrl && audioRef.current && effectiveAnalysis.chordTimeline?.length) {
      const t = audioRef.current.currentTime;
      const seg = effectiveAnalysis.chordTimeline.find((s) => t >= s.start && t < s.end);
      return seg?.chord ?? effectiveAnalysis.chordTimeline[effectiveAnalysis.chordTimeline.length - 1]?.chord ?? null;
    }
    // Chord Practice Mode or static selection:
    return effectiveAnalysis.chordProgression[selectedChordIndex] ?? effectiveAnalysis.chordProgression[0] ?? null;
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
    } catch (err: unknown) {
      setMicError(getMicrophoneErrorMessage(err));
    }
  }

  function stopMic() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    bufferRef.current = null;
    setMicActive(false);
    setLiveAccuracy(null);

    if (practiceStartRef.current && effectiveAnalysis) {
      const durationSeconds = (Date.now() - practiceStartRef.current) / 1000;
      logPracticeSession({
        songName: effectiveFileName ?? "Untitled",
        durationSeconds,
        tempoUsed: speed,
        chordsPracticed: Array.from(new Set(effectiveAnalysis.chordProgression)),
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
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  // Pause the player when the song changes or the page closes. The element is read when the effect
  // runs because React clears audioRef before cleanups on unmount.
  useEffect(() => {
    const audioEl = audioRef.current;
    return () => {
      audioEl?.pause();
    };
  }, [audioUrl]);

  const [audioLoading, setAudioLoading] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioUrl) setAudioLoading(true);

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setAudioLoading(false);
    };
    const onCanPlay = () => setAudioLoading(false);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("canplay", onCanPlay);
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

  function handleReattachChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setReattachError(null);

    const valError = validateUploadFile(f);
    if (valError) {
      setReattachError(valError);
      return;
    }

    const expectedName = effectiveFileName ?? analysis?.fileName ?? resolvedSavedSong?.fileName ?? "";
    const cleanExpected = expectedName.startsWith("file:") ? expectedName.slice(5) : expectedName;
    if (cleanExpected && f.name.toLowerCase() !== cleanExpected.toLowerCase()) {
      setPendingReattachFile(f);
      return;
    }

    attachAudioFile(f);
  }

  function confirmPendingReattach() {
    if (pendingReattachFile) {
      attachAudioFile(pendingReattachFile);
      setPendingReattachFile(null);
    }
  }

  function cancelPendingReattach() {
    setPendingReattachFile(null);
  }

  function handleChordCardClick(index: number) {
    setSelectedChordIndex(index);
    if (audioUrl && audioRef.current && effectiveAnalysis?.chordTimeline?.[index]) {
      const targetTime = effectiveAnalysis.chordTimeline[index].start;
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  }

  const activeChordIndex = (() => {
    if (!effectiveAnalysis?.chordProgression?.length) return -1;
    if (audioUrl && effectiveAnalysis.chordTimeline?.length) {
      const idx = effectiveAnalysis.chordTimeline.findIndex(
        (seg) => currentTime >= seg.start && currentTime < seg.end
      );
      if (idx !== -1) return idx;
      if (currentTime >= (effectiveAnalysis.chordTimeline[effectiveAnalysis.chordTimeline.length - 1]?.end ?? 0)) {
        return Math.min(effectiveAnalysis.chordProgression.length - 1, effectiveAnalysis.chordTimeline.length - 1);
      }
      return 0;
    }
    if (audioUrl && duration > 0) {
      return Math.min(
        effectiveAnalysis.chordProgression.length - 1,
        Math.floor((currentTime / duration) * effectiveAnalysis.chordProgression.length)
      );
    }
    return Math.min(selectedChordIndex, effectiveAnalysis.chordProgression.length - 1);
  })();

  const currentDisplayChord =
    (activeChordIndex >= 0 && effectiveAnalysis?.chordProgression ? effectiveAnalysis.chordProgression[activeChordIndex] : null) ??
    currentChordLabel;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-4xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Confirmation Modal for differing audio filename */}
      {pendingReattachFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-2xl">
            <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
              Different File Name
            </h3>
            <p className="mt-2 text-sm text-[var(--color-ns-muted)]">
              The selected file <span className="font-semibold text-[var(--color-ns-text)]">"{pendingReattachFile.name}"</span> differs from the active song name <span className="font-semibold text-[var(--color-ns-text)]">"{effectiveFileName}"</span>.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ns-muted)]">
              Are you sure you want to attach it to this practice session? Your saved chords, lyrics, and practice settings will be preserved.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelPendingReattach}
                className="btn-secondary text-xs sm:text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPendingReattach}
                className="btn-primary text-xs sm:text-sm"
              >
                Attach File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:mb-8 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--color-ns-amber)]">
              Practice Studio
            </span>
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[0.6875rem] font-semibold ${
                audioUrl
                  ? "border-[var(--color-ns-mint)]/40 bg-[var(--color-ns-mint)]/10 text-[var(--color-ns-mint)]"
                  : "border-[var(--color-ns-blue)]/40 bg-[var(--color-ns-blue)]/10 text-[var(--color-ns-blue)]"
              }`}
            >
              {audioUrl ? "Mode A: Full Audio Practice" : "Mode B: Chord Practice"}
            </span>
            {bpm > 0 && (
              <span className="inline-flex items-center rounded-md border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2.5 py-0.5 font-mono text-[0.6875rem] font-semibold text-[var(--color-ns-blue)]">
                {Math.round(bpm)} BPM
              </span>
            )}
            {speed !== 1 && (
              <span className="inline-flex items-center rounded-md border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2 py-0.5 font-mono text-[0.6875rem] font-semibold text-[var(--color-ns-amber)]">
                {speed}x Playback
              </span>
            )}
          </div>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-3xl">
            Interactive Practice Studio
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ns-muted)]">
            {effectiveFileName ? `Track: ${effectiveFileName}` : "No song loaded yet"}
            {isSampleAudio && " (sample audio)"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {effectiveAnalysis ? (
            <Link to="/song/current" className="btn-primary text-xs sm:text-sm">
              Open Chord & Lyric Sheet
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title="Analyze or select a song first to open its Chord & Lyric Sheet"
              className="btn-secondary text-xs sm:text-sm"
            >
              Open Chord & Lyric Sheet
            </button>
          )}
        </div>
      </div>

      {/* Mode B Card / Audio Absent State with Re-attach Button */}
      {!audioUrl && (
        <div className="mb-6 flex flex-col items-center gap-4 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-8 text-center sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-blue)] shadow-lg">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div className="max-w-md">
            <div className="mb-2">
              <span className="inline-flex items-center rounded-md border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-ns-blue)]">
                Mode B: Chord Practice Active
              </span>
            </div>
            <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
              {effectiveAnalysis ? "Practice Without Audio Playback" : "No Active Song Loaded"}
            </h3>
            <p className="mt-1.5 text-sm text-[var(--color-ns-muted)]">
              {effectiveAnalysis
                ? "Re-attach your local audio file to practice with playback."
                : "Choose a song from your Library or upload a new one."}
            </p>
            {reattachError && (
              <p className="mt-3 rounded-lg border border-[var(--color-ns-coral)]/30 bg-[var(--color-ns-coral)]/10 p-2 text-xs font-semibold text-[var(--color-ns-coral)]">
                {reattachError}
              </p>
            )}
          </div>
          <input
            ref={reattachInputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={handleReattachChange}
          />
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {effectiveAnalysis && (
              <button
                type="button"
                onClick={() => {
                  setReattachError(null);
                  reattachInputRef.current?.click();
                }}
                className="btn-primary text-xs sm:text-sm"
              >
                Re-attach audio file
              </button>
            )}
            <Link to="/upload" className={effectiveAnalysis ? "btn-secondary text-xs sm:text-sm" : "btn-primary text-xs sm:text-sm"}>
              {effectiveAnalysis ? "Upload Another Track" : "Upload Track"}
            </Link>
            <Link to="/studio" className="btn-secondary text-xs sm:text-sm">
              Return to Studio
            </Link>
          </div>
        </div>
      )}

      {/* Mode A Player: Available when audioUrl is present */}
      {audioUrl && (
        <div className="mb-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 shadow-lg">
          <audio ref={audioRef} src={audioUrl} preload="metadata" />

          {/* Primary Scrubber & Play Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--color-ns-coral)] text-[var(--color-ns-ink)] shadow-[0_4px_20px_rgba(108,77,255,0.45)] transition-all hover:scale-105 active:scale-95 self-center sm:self-auto"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1.5" />
                  <rect x="14" y="5" width="4" height="14" rx="1.5" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="ml-1">
                  <polygon points="7 5 19 12 7 19 7 5" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              {audioLoading && (
                <div role="status" aria-live="polite" className="mb-1 text-xs text-[var(--color-ns-blue)] animate-pulse">
                  Loading audio...
                </div>
              )}
              <div className="flex justify-between font-mono text-xs text-[var(--color-ns-muted)] mb-1.5">
                <span className="font-semibold text-[var(--color-ns-text)]">{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek position in track"
                className="ns-range w-full"
                style={{ "--pct": `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Controls toolbar */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-ns-border)] pt-5">
            <div>
              <span className="mb-2 block text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">
                Playback Speed
              </span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {SPEEDS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeedIndex(i)}
                    className={`rounded-xl px-3 py-1.5 font-mono text-xs font-semibold transition-all ${
                      speedIndex === i
                        ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                        : "border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
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
                    ? "border-[var(--color-ns-blue)]/50 bg-[var(--color-ns-blue)]/15 text-[var(--color-ns-blue)] shadow-sm"
                    : "border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {loop ? "Looping Active" : "Loop Off"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metronome Console */}
      <div className="mb-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-xl font-mono text-base font-bold transition-all ${
                metronome.isRunning
                  ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-[0_0_16px_rgba(244,184,74,0.5)] animate-pulse"
                  : "bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)] border border-[var(--color-ns-border)]"
              }`}
            >
              ♩
            </span>
            <div>
              <h2 className="font-heading text-sm font-bold text-[var(--color-ns-text)] sm:text-base">Beat Metronome</h2>
              <p className="font-mono text-xs text-[var(--color-ns-muted)]">{Math.round(bpm)} BPM · Synchronized click</p>
            </div>
          </div>
          <button
            type="button"
            onClick={metronome.toggle}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
              metronome.isRunning
                ? "border border-[var(--color-ns-coral)]/40 bg-[var(--color-ns-coral)]/10 text-[var(--color-ns-coral)] hover:bg-[var(--color-ns-coral)]/20"
                : "btn-primary"
            }`}
          >
            {metronome.isRunning ? "Stop Metronome" : "Start Metronome"}
          </button>
        </div>

        {/* Tempo correction: tap along while the song plays, then check it against the click. */}
        {effectiveAnalysis && (
          <div className="mt-4 border-t border-[var(--color-ns-border)] pt-4">
            {tapping ? (
              <div className="max-w-sm">
                <TapPad
                  onUse={(tapped) => {
                    // Taps follow the playback speed; store the song's real tempo.
                    applyTempo(withTempo(effectiveAnalysis, tapped / speed));
                    setTapping(false);
                  }}
                  onCancel={() => setTapping(false)}
                />
                {speed !== 1 && (
                  <p className="mt-2 text-xs text-[var(--color-ns-amber)]">
                    Playing at {speed}× — your taps are converted to the song's real tempo.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-xs text-[var(--color-ns-muted)]">
                  Wrong tempo? {tempoNote(effectiveAnalysis)}
                  {effectiveAnalysis.bpmStatus === "confirmed" && effectiveAnalysis.detectedRhythm && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => applyTempo(resetRhythm(effectiveAnalysis))}
                        className="font-semibold text-[var(--color-ns-purple-light)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
                      >
                        Reset to detected
                      </button>
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <HalfDoubleButtons bpm={effectiveAnalysis.bpm} onSet={(next) => applyTempo(withTempo(effectiveAnalysis, next))} />
                  <button
                    type="button"
                    className={CHIP}
                    onClick={() => {
                      setTapping(true);
                      if (!isPlaying && audioUrl) togglePlay(); // tap along to the song if audio is loaded
                    }}
                  >
                    Tap tempo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Accuracy Tracking */}
      {effectiveAnalysis && (
        <div className="mb-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--color-ns-amber)]">
                  Mic Feedback
                </span>
                <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Live Accuracy Tracking</h2>
              </div>
              <p className="mt-1 text-xs text-[var(--color-ns-muted)] max-w-xl">
                Uses microphone pitch detection to compare your playing against the expected chord at this exact moment, automatically ramping tempo as your accuracy sustains.
              </p>
            </div>
            <button
              type="button"
              onClick={micActive ? stopMic : startMic}
              className={micActive ? "btn-secondary" : "btn-primary"}
            >
              {micActive ? "Stop Tracking" : "Start Accuracy Tracking"}
            </button>
          </div>

          {micError && <p className="mt-3 text-xs text-[var(--color-ns-coral)]">{micError}</p>}

          {micActive && (
            <div className="mt-5 space-y-4 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4">
              <label className="flex items-center gap-2.5 text-xs sm:text-sm text-[var(--color-ns-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTempoEnabled}
                  onChange={(e) => setAutoTempoEnabled(e.target.checked)}
                  className="ns-check"
                />
                Auto-increase tempo when accuracy sustains above 70%
              </label>

              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[var(--color-ns-muted)]">
                  Target chord right now:{" "}
                  <span className="font-heading text-base font-bold text-[var(--color-ns-amber)]">
                    {currentDisplayChord ?? "—"}
                  </span>
                </span>
                <span className="text-[var(--color-ns-muted)]">
                  Accuracy:{" "}
                  <span className="font-mono font-bold text-[var(--color-ns-mint)]">
                    {liveAccuracy !== null ? `${Math.round(liveAccuracy * 100)}%` : "Listening…"}
                  </span>
                </span>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-ns-bg)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-ns-coral)] via-[var(--color-ns-amber)] to-[var(--color-ns-mint)] transition-all duration-200"
                  style={{ width: `${liveAccuracy !== null ? Math.round(liveAccuracy * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chord Progression Display - Center Stage */}
      {effectiveAnalysis && (
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base sm:text-lg font-bold text-[var(--color-ns-text)]">Chord Progression</h2>
              <p className="text-xs text-[var(--color-ns-muted)]">
                {audioUrl
                  ? "Follow along in real-time as the audio plays"
                  : "Click any chord to set your target for practice and pitch feedback"}
              </p>
            </div>
            {activeChordIndex >= 0 && (
              <span className="rounded-full border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/15 px-3 py-1 font-heading text-xs font-bold text-[var(--color-ns-amber)] animate-pulse">
                Current: {effectiveAnalysis.chordProgression[activeChordIndex]}
              </span>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2.5 sm:gap-3">
            {effectiveAnalysis.chordProgression.map((chord, i) => {
              const isCurrent = i === activeChordIndex;
              return (
                <button
                  type="button"
                  key={`${chord}-${i}`}
                  onClick={() => handleChordCardClick(i)}
                  className={`flex h-14 min-w-14 items-center justify-center rounded-xl font-heading text-sm sm:text-base font-bold transition-all duration-150 px-4 cursor-pointer ${
                    isCurrent
                      ? "scale-110 border-2 border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-[0_0_24px_rgba(244,184,74,0.6)] z-10 font-extrabold"
                      : "border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)]"
                  }`}
                  aria-label={`Chord ${chord} at position ${i + 1}${isCurrent ? " (active)" : ""}`}
                >
                  {chord}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
