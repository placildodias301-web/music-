import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { AlphaTabApi, PlayerMode, synth } from "@coderline/alphatab";
import type { model as atModel } from "@coderline/alphatab";
import { API_URL } from "../lib/api";
import { encodeWav } from "../lib/wavEncode";
import { AiTutorDrawer } from "../components/AiTutorDrawer";
import { CustomSelect } from "../components/CustomSelect";
import { AnalysisNavSwitcher } from "../components/analysis/AnalysisNavSwitcher";
import {
  addNote,
  ALL_TARGET_KEYS,
  chordAt,
  deleteNote,
  editMusicXmlInPlace,
  isChordName,
  isFlatKey,
  noteAt,
  noteName,
  pitchNear,
  positionOf,
  setChord,
  setLength,
  shiftPitch,
  TICKS_PER_QUARTER,
} from "../lib/sheetEdit";
import type { SheetModel } from "../lib/sheetEdit";

const INSTRUMENTS = [
  { label: "Piano", program: 0 },
  { label: "Acoustic guitar", program: 24 },
  { label: "Violin", program: 40 },
  { label: "Flute", program: 73 },
  { label: "Synth", program: 80 },
] as const;
const LEFT_HAND = [
  { value: "block", label: "Chords in the left hand" },
  { value: "bass", label: "Bass notes only" },
  { value: "none", label: "Melody only" },
] as const;
const SONG_ACCEPT = ".mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.mov,.webm,.mkv,audio/*,video/*";
const SHEET_ACCEPT = ".musicxml,.xml,.mxl,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,image/*";
const IMAGE_FILE = /\.(png|jpe?g|webp|bmp|tiff?)$/i;

interface SheetResult {
  title: string;
  musicxml: string;
  bpm?: number;
  key?: string;
  timeSignature?: string;
  noteCount?: number;
  notice?: string;
  model?: SheetModel;
}
type LeftHand = (typeof LEFT_HAND)[number]["value"];

interface ProgressInfo {
  stage: string;
  percent: number;
  elapsed: number;
  eta: number;
}

const card = "rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-5";
const btn =
  "inline-flex h-9 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3 text-xs font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:cursor-not-allowed disabled:opacity-40";
const field =
  "h-9 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] px-3 text-xs text-[var(--color-ns-text)] focus:border-[var(--color-ns-amber)]/60 focus:outline-none";
const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl bg-[var(--color-ns-purple)] px-4 text-xs font-bold text-white shadow-[var(--shadow-primary)] hover:bg-[var(--color-ns-purple-light)] transition-all disabled:cursor-not-allowed disabled:opacity-40";

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function formatTime(ms: number): string {
  if (!ms || isNaN(ms)) return "00:00";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min < 10 ? "0" : ""}${min}:${sec < 10 ? "0" : ""}${sec}`;
}

export function Sheet() {
  const [sheet, setSheet] = useState<SheetResult | null>(null);
  const [shown, setShown] = useState("");
  const [leftHand, setLeftHand] = useState<LeftHand>("block");
  const [isProcessing, setIsProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [changingKey, setChangingKey] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [program, setProgram] = useState<number>(0);
  const [hasScore, setHasScore] = useState(false);
  const [model, setModel] = useState<SheetModel | null>(null);
  const [history, setHistory] = useState<SheetModel[]>([]);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<number | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);

  // Playhead scrubber & time state
  const [currentTime, setCurrentTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTick, setCurrentTick] = useState(0);
  const [endTick, setEndTick] = useState(0);

  // Real-time progress bar state & polling control
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const cancelProcessing = () => {
    stopPolling();
    setIsProcessing(false);
    setScanning(false);
    setProgress(null);
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);

  useEffect(() => {
    if (!hostRef.current || !scrollRef.current) return;
    const api = new AlphaTabApi(hostRef.current, {
      core: { fontDirectory: "/font/", includeNoteBounds: true },
      player: {
        playerMode: PlayerMode.EnabledSynthesizer,
        soundFont: "/sounds/FluidR3Mono_GM.sf3",
        scrollElement: scrollRef.current,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableElementHighlighting: true,
        scrollMode: 1, // Continuous scrolling
      },
    });

    api.playerReady.on(() => setReady(true));
    api.scoreLoaded.on(() => setHasScore(true));
    api.playerStateChanged.on((e) => setPlaying(e.state === synth.PlayerState.Playing));

    api.playerPositionChanged.on((e) => {
      setCurrentTime(e.currentTime);
      setEndTime(e.endTime);
      setCurrentTick(e.currentTick);
      setEndTick(e.endTick);
    });

    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  const programRef = useRef(program);
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !shown) return;
    const onLoaded = (score: { tracks: { playbackInfo: { program: number } }[] }) =>
      score.tracks.forEach((t) => (t.playbackInfo.program = programRef.current));
    api.scoreLoaded.on(onLoaded);
    api.load(new TextEncoder().encode(shown));
    return () => api.scoreLoaded.off(onLoaded);
  }, [shown]);

  const transposeRef = useRef(0);
  const drawRef = useRef(0);
  const cacheRef = useRef(new Map<string, Promise<string>>());

  const fetchSheet = (m: SheetModel | null, style: LeftHand, semitones: number, raw: string): Promise<string> => {
    if (!m && semitones === 0) return Promise.resolve(raw);
    const url = m ? "/api/sheet/render" : "/api/sheet/transpose";
    const body = JSON.stringify(m ? { model: m, left_hand: style, semitones } : { musicxml: raw, semitones });
    const key = url + body;
    const cache = cacheRef.current;
    let sheetXml = cache.get(key);
    if (!sheetXml) {
      if (cache.size >= 40) cache.clear();
      sheetXml = fetch(`${API_URL}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then(async (res) => {
        const data = (await res.json().catch(() => null)) as { musicxml?: string; detail?: string } | null;
        if (!res.ok || !data?.musicxml) throw new Error(data?.detail ?? `Server error (${res.status}).`);
        return data.musicxml;
      });
      sheetXml.catch(() => cache.delete(key));
      cache.set(key, sheetXml);
    }
    return sheetXml;
  };

  const prefetchKeys = (m: SheetModel | null, style: LeftHand, semitones: number, raw: string) => {
    for (const s of [semitones + 1, semitones - 1]) {
      if (Math.abs(s) <= 12) fetchSheet(m, style, s, raw).catch(() => {});
    }
  };

  const redraw = async (m: SheetModel | null, style: LeftHand, semitones: number, raw = "", prefetch = true) => {
    setError("");
    const id = ++drawRef.current;
    try {
      const xml = await fetchSheet(m, style, semitones, raw);
      if (id !== drawRef.current) return;
      setShown(xml);
      if (prefetch) prefetchKeys(m, style, semitones, raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draw the sheet.");
    }
  };

  const openSheet = (s: SheetResult) => {
    setSheet(s);
    setModel(s.model ?? null);
    setHistory([]);
    setSelection(null);
    setEditing(false);
    setTranspose(0);
    setSelectedKey(s.key || "C Major");
    setChangingKey(false);
    transposeRef.current = 0;
    setShown(s.musicxml);
    if (s.model && leftHand !== "block") void redraw(s.model, leftHand, 0);
    else prefetchKeys(s.model ?? null, leftHand, 0, s.musicxml);
  };

  const applyTranspose = (delta: number) => {
    if (!sheet) return;
    const next = Math.max(-12, Math.min(12, transposeRef.current + delta));
    if (next === transposeRef.current) return;
    transposeRef.current = next;
    setTranspose(next);
    setChangingKey(true);
    void redraw(model, leftHand, next, sheet.musicxml).finally(() => {
      if (transposeRef.current === next) setChangingKey(false);
    });
  };

  const applyTargetKey = async (targetKey: string) => {
    if (!sheet || !shown) return;
    setChangingKey(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/sheet/transpose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          musicxml: sheet.musicxml,
          current_key: sheet.key || "C Major",
          target_key: targetKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.musicxml) throw new Error(data?.detail || "Transpose failed");
      setShown(data.musicxml);
      setSelectedKey(targetKey);
      setSheet({ ...sheet, key: targetKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't transpose to target key.");
    } finally {
      setChangingKey(false);
    }
  };

  const changeLeftHand = (style: LeftHand) => {
    setLeftHand(style);
    if (sheet) void redraw(model, style, transposeRef.current, sheet.musicxml);
  };

  // ── editing ──
  const commit = (next: SheetModel) => {
    if (!model) return;
    setHistory((h) => [...h.slice(-49), model]);
    setModel(next);
    void redraw(next, leftHand, transposeRef.current, "", false);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    setModel(prev);
    void redraw(prev, leftHand, transposeRef.current, "", false);
  };

  const selectedNote = model && selection !== null ? noteAt(model, selection) : -1;
  const editNote = (fn: (m: SheetModel, i: number) => SheetModel) => {
    if (model && selectedNote >= 0) commit(fn(model, selectedNote));
  };

  const beatAt = (e: ReactPointerEvent): atModel.Beat | null => {
    const api = apiRef.current;
    const surface = hostRef.current?.querySelector(".at-surface") ?? hostRef.current;
    if (!api || !surface) return null;
    const rect = surface.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pad = e.pointerType === "touch" ? 8 : 3;
    const inside = (b: { x: number; y: number; w: number; h: number }) =>
      x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
    for (const system of api.renderer.boundsLookup?.staffSystems ?? [])
      for (const master of system.bars)
        for (const bar of master.bars) {
          for (const b of bar.beats) {
            if (b.beat.voice.bar.staff.index !== 0) break;
            if (b.notes?.some((n) => inside(n.noteHeadBounds))) return b.beat;
            if (b.beat.isRest && inside(b.visualBounds)) return b.beat;
          }
        }
    return null;
  };

  const onSheetPointerDown = (e: ReactPointerEvent) => {
    if (!editing) return;
    const beat = beatAt(e);
    if (beat && model) {
      setSelection(positionOf(beat.voice.bar.index, beat.displayStart, model.beatsPerBar));
    }
  };

  const onSheetPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.cursor = editing && beatAt(e) ? "pointer" : "";
  };

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !model) return;
    const highlight = () => {
      const staff = api.score?.tracks[0]?.staves[0];
      if (!staff || selection === null || !editing) return;
      for (const bar of staff.bars) {
        for (const beat of bar.voices[0]?.beats ?? []) {
          const start = positionOf(bar.index, beat.displayStart, model.beatsPerBar);
          if (start <= selection && selection < start + beat.playbackDuration / TICKS_PER_QUARTER) {
            api.highlightPlaybackRange(beat, beat);
            return;
          }
        }
      }
    };
    highlight();
    api.renderFinished.on(highlight);
    return () => api.renderFinished.off(highlight);
  }, [selection, editing, model, shown]);

  const onKey = (e: KeyboardEvent) => {
    if (!editing || (e.target instanceof Element && e.target.closest("input, select, textarea"))) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      editNote((m, i) => shiftPitch(m, i, (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 12 : 1)));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      editNote(deleteNote);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  const applyProgram = (p: number) => {
    const api = apiRef.current;
    setProgram(p);
    programRef.current = p;
    if (!api?.score) return;
    api.score.tracks.forEach((t) => (t.playbackInfo.program = p));
    api.loadMidiForScore();
  };

  const applySpeed = (s: number) => {
    setSpeed(s);
    if (apiRef.current) apiRef.current.playbackSpeed = s;
  };

  /** Renders the melody with the chosen instrument, speed-independent, and downloads it as an MP3. */
  async function exportAudio() {
    const api = apiRef.current;
    if (!api?.score || exporting) return;
    setError("");
    setExporting(true);
    let exporter: Awaited<ReturnType<AlphaTabApi["exportAudio"]>> | null = null;
    try {
      const sampleRate = 44100;
      // Melody only: the top staff of the first part (the right hand). alphaTab can only mute whole
      // tracks and both hands are one piano track, so every other staff's notes are taken out while
      // exportAudio builds its MIDI (synchronously, before its first await), then put straight back.
      const muted: [atModel.Beat, atModel.Note[]][] = [];
      let pending: ReturnType<AlphaTabApi["exportAudio"]>;
      try {
        api.score.tracks.forEach((track, t) =>
          track.staves.forEach((staff, s) => {
            if (t === 0 && s === 0) return;
            for (const bar of staff.bars)
              for (const voice of bar.voices)
                for (const beat of voice.beats) {
                  muted.push([beat, beat.notes]);
                  beat.notes = [];
                }
          }),
        );
        pending = api.exportAudio(Object.assign(new synth.AudioExportOptions(), { sampleRate, useSyncPoints: false }));
      } finally {
        for (const [beat, notes] of muted) beat.notes = notes;
      }
      exporter = await pending;
      const chunks: Float32Array[] = [];
      for (let chunk = await exporter.render(2000); chunk; chunk = await exporter.render(2000)) chunks.push(chunk.samples);
      if (!chunks.length) throw new Error("There's nothing to play in this sheet.");
      const title = sheet?.title ?? "sheet";
      const name = `${title}${transpose ? ` (${transpose > 0 ? "+" : ""}${transpose})` : ""}`;
      const wav = encodeWav(chunks, sampleRate);
      try {
        const form = new FormData();
        form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "sheet.wav");
        const res = await fetch(`${API_URL}/api/sheet/audio`, { method: "POST", body: form });
        if (!res.ok) throw new Error(String(res.status));
        download(`${name}.mp3`, await res.blob(), "audio/mpeg");
      } catch {
        download(`${name}.wav`, wav as BlobPart, "audio/wav");
        setError("Couldn't make an MP3 (the server is needed), so this is a WAV file. Many apps, like WhatsApp, won't accept WAV.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the audio file.");
    } finally {
      exporter?.destroy();
      setExporting(false);
    }
  }

  async function onSong(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isProcessing) return;
    setError("");
    stopPolling();
    setIsProcessing(true);
    setScanning(false);
    setProgress({ stage: "Initializing audio upload & decoding...", percent: 2, elapsed: 0, eta: 25 });

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/sheet/generate`, { method: "POST", body: form });
      const initData = (await res.json().catch(() => null)) as { job_id?: string; detail?: string } | null;
      if (!res.ok || !initData?.job_id) {
        throw new Error(initData?.detail ?? `Server error (${res.status}).`);
      }
      const jobId = initData.job_id;

      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`${API_URL}/api/sheet/progress/${jobId}`);
          if (!r.ok) return;
          const d = await r.json();
          if (d.status === "completed" && d.result?.musicxml) {
            stopPolling();
            setIsProcessing(false);
            setProgress(null);
            openSheet(d.result);
            return;
          }
          if (d.status === "failed") {
            stopPolling();
            setIsProcessing(false);
            setProgress(null);
            setError(d.error || "Sheet generation failed.");
            return;
          }
          if (d.stage) {
            let stageName = d.stage;
            if (stageName === "audio") stageName = "Extracting & decoding audio";
            else if (stageName === "analysis") stageName = "Analyzing beats, chords & key";
            else if (stageName === "vocals") stageName = "Separating vocal stem with Demucs";
            else if (stageName === "melody") stageName = "High-precision melody transcription";
            else if (stageName === "score") stageName = "Aligning rhythm to 16th/triplet grid";
            else if (stageName === "render") stageName = "Generating MusicXML & MIDI velocities";
            setProgress({
              stage: stageName,
              percent: d.percent,
              elapsed: d.elapsed || 0,
              eta: d.eta_seconds ?? d.eta ?? 0,
            });
          }
        } catch {
          // quiet poll
        }
      }, 600);
    } catch (err) {
      stopPolling();
      setIsProcessing(false);
      setProgress(null);
      setError(err instanceof Error ? err.message : "Couldn't make a sheet from that file.");
    }
  }

  async function onSheetFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isProcessing) return;
    setError("");
    stopPolling();
    const title = file.name.replace(/\.[^.]+$/, "");

    if (IMAGE_FILE.test(file.name) || file.type.startsWith("image/")) {
      setIsProcessing(true);
      setScanning(true);
      setProgress({ stage: "Initializing RapidOCR & OMR scan...", percent: 2, elapsed: 0, eta: 20 });

      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API_URL}/api/sheet/scan`, { method: "POST", body: form });
        const initData = (await res.json().catch(() => null)) as { job_id?: string; detail?: string } | null;
        if (!res.ok || !initData?.job_id) {
          throw new Error(initData?.detail ?? `Server error (${res.status}).`);
        }
        const jobId = initData.job_id;

        pollIntervalRef.current = window.setInterval(async () => {
          try {
            const r = await fetch(`${API_URL}/api/sheet/progress/${jobId}`);
            if (!r.ok) return;
            const d = await r.json();
            if (d.status === "completed" && d.result?.musicxml) {
              stopPolling();
              setIsProcessing(false);
              setScanning(false);
              setProgress(null);
              openSheet({ title: d.result.title || title, musicxml: d.result.musicxml });
              return;
            }
            if (d.status === "failed") {
              stopPolling();
              setIsProcessing(false);
              setScanning(false);
              setProgress(null);
              setError(d.error || "Sheet scan failed.");
              return;
            }
            if (d.stage) {
              let stageName = d.stage;
              if (stageName === "ocr") stageName = "Extracting title, composer, chords & tempo";
              else if (stageName === "omr") stageName = "Recognizing staves, notes & clefs";
              else if (stageName === "enrich") stageName = "Injecting chords & instrument labels";
              setProgress({
                stage: stageName,
                percent: d.percent,
                elapsed: d.elapsed || 0,
                eta: d.eta_seconds ?? d.eta ?? 0,
              });
            }
          } catch {
            // quiet poll
          }
        }, 600);
      } catch (err) {
        stopPolling();
        setIsProcessing(false);
        setScanning(false);
        setProgress(null);
        setError(err instanceof Error ? err.message : "Couldn't read that picture.");
      }
      return;
    }

    // Direct MXL / XML files: completely bypass backend job polling
    stopPolling();
    setIsProcessing(false);
    setScanning(false);
    setProgress(null);

    if (file.name.toLowerCase().endsWith(".mxl")) {
      const buf = await file.arrayBuffer();
      apiRef.current?.load(new Uint8Array(buf));
      setSheet({ title, musicxml: "" });
      setShown("");
      return;
    }

    // Lossless MusicXML upload: pass raw XML string directly into alphaTab
    const xml = await file.text();
    openSheet({ title, musicxml: xml });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 md:px-8">
      <AnalysisNavSwitcher />
      {/* Workspace Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--color-ns-border)] pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-semibold tracking-tight text-[var(--color-ns-text)]">
            Sheet Music & OMR Studio
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-[var(--color-ns-muted)]">
            High-precision vocal melody transcription, standard notation, chord accompaniment & MusicXML editor.
          </p>
        </div>
      </div>
      {/* Dynamic styles for moving playhead bar & active note highlighting */}
      <style>{`
        .at-cursor-bar {
          background: rgba(139, 92, 246, 0.12) !important;
          border-left: 2px solid #8b5cf6 !important;
          transition: transform 0.06s linear !important;
        }
        .at-cursor-beat {
          background: rgba(168, 85, 247, 0.28) !important;
          border-radius: 4px;
        }
        .at-highlight * {
          fill: #7c3aed !important;
          stroke: #7c3aed !important;
          transition: fill 0.08s ease, stroke 0.08s ease;
        }
      `}</style>

      <section className={card} aria-labelledby="sheet-source">
        <h2 id="sheet-source" className="font-heading text-base font-bold text-[var(--color-ns-text)]">
          Make a sheet
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ns-muted)]">
          Upload a song and the AI transcribes high-precision vocal melodies and chord accompaniments. Or open an existing
          MusicXML file, or a photo/scan of printed sheet music (png, jpg, webp).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className={`${btnPrimary} cursor-pointer ${isProcessing ? "pointer-events-none opacity-50 cursor-not-allowed" : ""}`}>
            {isProcessing && !scanning ? "Processing current file…" : "Upload a song"}
            <input type="file" accept={SONG_ACCEPT} className="sr-only" disabled={isProcessing} onChange={onSong} />
          </label>
          <span className="text-sm text-[var(--color-ns-muted)]">or</span>
          <label className={`${btn} cursor-pointer ${isProcessing ? "pointer-events-none opacity-50 cursor-not-allowed" : ""}`}>
            {isProcessing && scanning ? "Processing current file…" : "Open MusicXML or a sheet photo"}
            <input type="file" accept={SHEET_ACCEPT} className="sr-only" disabled={isProcessing} onChange={onSheetFile} />
          </label>
        </div>

        {/* Real-time processing progress bar & ETA */}
        {isProcessing && progress && (
          <div className="mt-5 rounded-xl border border-[var(--color-ns-purple)]/30 bg-[var(--color-ns-raised)] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-[var(--color-ns-text)] flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-ns-purple)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-ns-purple)]"></span>
                </span>
                {progress.stage}
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-[var(--color-ns-purple)]">{progress.percent}%</span>
                <button
                  type="button"
                  onClick={cancelProcessing}
                  className="rounded-md border border-[var(--color-ns-border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-ns-muted)] hover:bg-[var(--color-ns-border)] hover:text-[var(--color-ns-text)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-ns-border)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--color-ns-purple)] to-[var(--color-ns-purple-light)] transition-all duration-300 ease-out"
                style={{ width: `${Math.max(5, progress.percent)}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-ns-muted)]">
              <span>Elapsed: {formatTime(progress.elapsed * 1000)}</span>
              <span>{progress.eta > 0 ? `Estimated: ~${Math.round(progress.eta)}s remaining` : "Finishing touches…"}</span>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-ns-red)] font-medium">
            {error}
          </p>
        )}
      </section>

      <section className={card} aria-label="Sheet music">
        {sheet && (
          <div className="mb-3">
            <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">{sheet.title}</h2>
            <p className="text-sm text-[var(--color-ns-muted)]">
              {[
                sheet.key || selectedKey,
                sheet.timeSignature,
                sheet.bpm ? `${Math.round(sheet.bpm)} BPM` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {sheet.notice && <p className="mt-2 text-xs text-[var(--color-ns-amber)]">{sheet.notice}</p>}
          </div>
        )}

        {/* Interactive Playback Scrubber & Timeline */}
        {hasScore && (
          <div className="mb-4 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)]/70 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="w-12 text-left font-mono text-xs text-[var(--color-ns-muted)]">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                aria-label="Playback scrubber"
                min={0}
                max={endTick || 1000}
                value={currentTick}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCurrentTick(val);
                  if (apiRef.current) apiRef.current.tickPosition = val;
                }}
                className="flex-1 accent-[var(--color-ns-purple)] cursor-pointer h-1.5 rounded-lg bg-[var(--color-ns-border-strong)]"
              />
              <span className="w-12 text-right font-mono text-xs text-[var(--color-ns-muted)]">
                {formatTime(endTime)}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div role="group" aria-label="Playback" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${btnPrimary} w-24`}
              disabled={!ready || !hasScore}
              onClick={() => apiRef.current?.playPause()}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className={btn}
              disabled={!ready || !hasScore}
              onClick={() => apiRef.current?.stop()}
            >
              Stop
            </button>
            <CustomSelect
              aria-label="Playback speed"
              value={speed}
              onChange={(v) => applySpeed(Number(v))}
              width="110px"
              options={[
                { value: 0.5, label: "0.5× speed" },
                { value: 0.75, label: "0.75× speed" },
                { value: 1, label: "1× speed" },
                { value: 1.25, label: "1.25× speed" },
              ]}
            />
            <CustomSelect
              aria-label="Playback instrument"
              value={program}
              onChange={(v) => applyProgram(Number(v))}
              width="145px"
              options={INSTRUMENTS.map((i) => ({ value: i.program, label: i.label }))}
            />
          </div>

          <div role="group" aria-label="Sheet" className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-ns-muted)]">Key</span>
            <button
              type="button"
              className={btn}
              aria-label="Transpose down a semitone"
              disabled={!sheet}
              onClick={() => applyTranspose(-1)}
            >
              −
            </button>
            <span className="w-8 text-center text-xs font-mono font-bold tabular-nums text-[var(--color-ns-text)]" aria-live="polite">
              {transpose > 0 ? `+${transpose}` : transpose}
            </span>
            <button
              type="button"
              className={btn}
              aria-label="Transpose up a semitone"
              disabled={!sheet}
              onClick={() => applyTranspose(1)}
            >
              +
            </button>

            {/* Target Key Transpose selector */}
            <CustomSelect
              aria-label="Target key transposition"
              value={selectedKey}
              onChange={(v) => applyTargetKey(String(v))}
              disabled={!sheet || changingKey}
              placeholder="Target Key"
              width="135px"
              options={[
                ...ALL_TARGET_KEYS.slice(0, 12).map((k) => ({ value: k, label: k, group: "Major Keys" })),
                ...ALL_TARGET_KEYS.slice(12).map((k) => ({ value: k, label: k, group: "Minor Keys" })),
              ]}
            />

            {changingKey && <span className="text-xs text-[var(--color-ns-muted)] animate-pulse">Transposing…</span>}

            {model && (
              <CustomSelect
                aria-label="Left hand"
                value={leftHand}
                onChange={(v) => changeLeftHand(v as LeftHand)}
                width="170px"
                options={LEFT_HAND.map((o) => ({ value: o.value, label: o.label }))}
              />
            )}
          </div>

          {sheet && (
            <button
              type="button"
              aria-pressed={editing}
              className={editing ? btnPrimary : btn}
              onClick={() => {
                setEditing(!editing);
                setSelection(null);
              }}
            >
              {editing ? "Done editing" : "Edit"}
            </button>
          )}

          <div role="group" aria-label="Export" className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTutorOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-purple)]/50 bg-[var(--color-ns-purple)]/15 px-3 py-1.5 text-xs font-bold text-[var(--color-ns-purple-light)] hover:bg-[var(--color-ns-purple)]/25 transition-all shadow-xs"
            >
              <span>✨</span>
              <span>AI Music Tutor</span>
            </button>
            <button type="button" className={btn} disabled={!hasScore} onClick={() => apiRef.current?.downloadMidi()}>
              MIDI
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasScore || exporting}
              onClick={() => void exportAudio()}
            >
              {exporting ? "Making audio…" : "Melody (MP3)"}
            </button>
            <button
              type="button"
              className={btn}
              disabled={!sheet || !shown}
              onClick={() =>
                sheet &&
                download(
                  `${sheet.title}${transpose ? ` (${transpose > 0 ? "+" : ""}${transpose})` : ""}.musicxml`,
                  shown,
                  "application/vnd.recordare.musicxml+xml",
                )
              }
            >
              MusicXML
            </button>
            <button type="button" className={btn} disabled={!hasScore} onClick={() => apiRef.current?.print()}>
              PDF
            </button>
          </div>
        </div>

        {editing && model && (
          <EditPanel
            model={model}
            selection={selection}
            noteIndex={selectedNote}
            transpose={transpose}
            canUndo={history.length > 0}
            onUndo={undo}
            onCommit={commit}
            onEditNote={editNote}
          />
        )}

        {editing && !model && shown && (
          <InPlaceEditPanel
            musicxml={shown}
            onUpdateXml={(newXml) => setShown(newXml)}
            onError={(msg) => setError(msg)}
          />
        )}

        <div ref={scrollRef} className="mt-4 max-h-[70vh] overflow-auto rounded-xl bg-white shadow-inner">
          <div ref={hostRef} onPointerDown={onSheetPointerDown} onPointerMove={onSheetPointerMove} />
        </div>
        {!hasScore && !isProcessing && (
          <p className="mt-3 text-sm text-[var(--color-ns-muted)]">Your sheet will appear here.</p>
        )}
      </section>

      {/* Wilsify AI Master Music Tutor Drawer */}
      <AiTutorDrawer
        isOpen={tutorOpen}
        onClose={() => setTutorOpen(false)}
        songContext={{
          title: sheet?.title,
          key: sheet?.key || selectedKey,
          bpm: sheet?.bpm ? Math.round(sheet.bpm) : undefined,
          chords: model?.chords ? Array.from(new Set(model.chords.map((c) => c.name))) : undefined,
        }}
      />
    </div>
  );
}

const LENGTHS = [
  { quarters: 0.25, label: "𝅘𝅥𝅯", name: "16th note" },
  { quarters: 0.5, label: "♪", name: "Eighth note" },
  { quarters: 1, label: "♩", name: "Quarter note" },
  { quarters: 2, label: "𝅗𝅥", name: "Half note" },
  { quarters: 4, label: "𝅝", name: "Whole note" },
] as const;

function EditPanel({
  model,
  selection,
  noteIndex,
  transpose,
  canUndo,
  onUndo,
  onCommit,
  onEditNote,
}: {
  model: SheetModel;
  selection: number | null;
  noteIndex: number;
  transpose: number;
  canUndo: boolean;
  onUndo: () => void;
  onCommit: (m: SheetModel) => void;
  onEditNote: (fn: (m: SheetModel, i: number) => SheetModel) => void;
}) {
  const chordInput = useRef<HTMLInputElement>(null);
  const [chordError, setChordError] = useState("");
  const note = noteIndex >= 0 ? model.notes[noteIndex] : null;
  const chord = selection !== null ? chordAt(model, selection) : undefined;
  const where =
    selection === null
      ? ""
      : `Bar ${Math.floor(selection / model.beatsPerBar) + 1}, beat ${+((selection % model.beatsPerBar) + 1).toFixed(2)}`;

  const applyChord = () => {
    if (selection === null) return;
    const name = chordInput.current?.value.trim() ?? "";
    if (name && !isChordName(name)) {
      setChordError("Use a chord like C, F#m, Bb7, Ebmaj7 or Gsus4.");
      return;
    }
    setChordError("");
    onCommit(setChord(model, selection, name));
  };

  return (
    <div
      className="mt-4 rounded-xl border border-[var(--color-ns-purple)]/40 bg-[var(--color-ns-raised)] p-4"
      role="region"
      aria-label="Edit sheet"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-ns-text)]" aria-live="polite">
          {selection === null ? (
            "Click a note or rest in the top staff to edit it."
          ) : note ? (
            <>
              <b>{where}</b> · {noteName(note.midi + transpose, isFlatKey(model.key, transpose))},{" "}
              {note.end - note.start} beat{note.end - note.start === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <b>{where}</b> · rest
            </>
          )}
        </p>
        <button type="button" className={btn} disabled={!canUndo} onClick={onUndo} title="Ctrl+Z">
          Undo
        </button>
      </div>

      {selection !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {note ? (
            <>
              <button
                type="button"
                className={btn}
                aria-label="Pitch up a semitone"
                title="↑"
                onClick={() => onEditNote((m, i) => shiftPitch(m, i, 1))}
              >
                ▲
              </button>
              <button
                type="button"
                className={btn}
                aria-label="Pitch down a semitone"
                title="↓"
                onClick={() => onEditNote((m, i) => shiftPitch(m, i, -1))}
              >
                ▼
              </button>
              <button
                type="button"
                className={btn}
                aria-label="Up an octave"
                title="Shift+↑"
                onClick={() => onEditNote((m, i) => shiftPitch(m, i, 12))}
              >
                Oct ▲
              </button>
              <button
                type="button"
                className={btn}
                aria-label="Down an octave"
                title="Shift+↓"
                onClick={() => onEditNote((m, i) => shiftPitch(m, i, -12))}
              >
                Oct ▼
              </button>
              <span className="mx-1 h-6 w-px bg-[var(--color-ns-border-strong)]" aria-hidden="true" />
              {LENGTHS.map((l) => (
                <button
                  key={l.quarters}
                  type="button"
                  className={`${btn} min-w-10 text-base`}
                  aria-label={l.name}
                  aria-pressed={note.end - note.start === l.quarters}
                  title={l.name}
                  onClick={() => onEditNote((m, i) => setLength(m, i, l.quarters))}
                >
                  {l.label}
                </button>
              ))}
              <span className="mx-1 h-6 w-px bg-[var(--color-ns-border-strong)]" aria-hidden="true" />
              <button type="button" className={btn} title="Delete" onClick={() => onEditNote((m, i) => deleteNote(m, i))}>
                Delete note
              </button>
            </>
          ) : (
            <button
              type="button"
              className={btn}
              onClick={() => onCommit(addNote(model, selection, pitchNear(model, selection)))}
            >
              Add a note here
            </button>
          )}

          <span className="mx-1 h-6 w-px bg-[var(--color-ns-border-strong)]" aria-hidden="true" />
          <label className="text-sm text-[var(--color-ns-muted)]" htmlFor="chord-name">
            Chord
          </label>
          <input
            id="chord-name"
            ref={chordInput}
            key={`${selection}-${chord?.name ?? ""}`}
            defaultValue={chord?.name ?? ""}
            disabled={transpose !== 0}
            placeholder="none"
            maxLength={8}
            onKeyDown={(e) => e.key === "Enter" && applyChord()}
            className={`${field} w-24`}
          />
          <button type="button" className={btn} disabled={transpose !== 0} onClick={applyChord}>
            Set chord
          </button>
          {transpose !== 0 && (
            <span className="text-xs text-[var(--color-ns-muted)]">Set Key back to 0 to edit chord names.</span>
          )}
        </div>
      )}
      {chordError && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-ns-red)]">
          {chordError}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-ns-border)] pt-3">
        <label className="text-sm text-[var(--color-ns-muted)]" htmlFor="sheet-tempo">
          Tempo
        </label>
        <input
          id="sheet-tempo"
          type="number"
          min={20}
          max={320}
          key={model.bpm}
          defaultValue={Math.round(model.bpm)}
          onBlur={(e) => {
            const bpm = Number(e.target.value);
            if (bpm >= 20 && bpm <= 320 && bpm !== Math.round(model.bpm)) onCommit({ ...model, bpm });
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={`${field} w-20`}
        />
        <span className="text-sm text-[var(--color-ns-muted)]">BPM</span>
        <label className="ml-3 text-xs font-semibold text-[var(--color-ns-muted)]" htmlFor="sheet-meter">
          Time signature
        </label>
        <CustomSelect
          value={model.beatsPerBar}
          onChange={(v) => onCommit({ ...model, beatsPerBar: Number(v) })}
          width="80px"
          options={[
            { value: 2, label: "2/4" },
            { value: 3, label: "3/4" },
            { value: 4, label: "4/4" },
          ]}
        />
        <span className="ml-auto text-xs text-[var(--color-ns-muted)]">
          ↑ ↓ pitch · Shift = octave · Delete · Ctrl+Z undo
        </span>
      </div>
    </div>
  );
}

function InPlaceEditPanel({
  musicxml,
  onUpdateXml,
  onError,
}: {
  musicxml: string;
  onUpdateXml: (xml: string) => void;
  onError: (msg: string) => void;
}) {
  const [measureNum, setMeasureNum] = useState(1);
  const [noteIdx, setNoteIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const performEdit = async (action: "shift_pitch" | "delete_note", shift = 0) => {
    setSaving(true);
    onError("");
    try {
      const xml = await editMusicXmlInPlace(API_URL, {
        musicxml,
        measure_number: measureNum,
        note_index: noteIdx,
        action,
        pitch_shift: shift,
      });
      onUpdateXml(xml);
    } catch (e) {
      onError(e instanceof Error ? e.message : "In-place edit failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-[var(--color-ns-purple)]/40 bg-[var(--color-ns-raised)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[var(--color-ns-text)]">In-place MusicXML Edit:</span>
        <label className="text-xs text-[var(--color-ns-muted)]">Bar:</label>
        <input
          type="number"
          min={1}
          value={measureNum}
          onChange={(e) => setMeasureNum(Math.max(1, Number(e.target.value)))}
          className={`${field} w-16`}
        />
        <label className="text-xs text-[var(--color-ns-muted)]">Note #:</label>
        <input
          type="number"
          min={0}
          value={noteIdx}
          onChange={(e) => setNoteIdx(Math.max(0, Number(e.target.value)))}
          className={`${field} w-16`}
        />
        <button type="button" className={btn} disabled={saving} onClick={() => performEdit("shift_pitch", 1)}>
          ▲ Pitch
        </button>
        <button type="button" className={btn} disabled={saving} onClick={() => performEdit("shift_pitch", -1)}>
          ▼ Pitch
        </button>
        <button type="button" className={btn} disabled={saving} onClick={() => performEdit("shift_pitch", 12)}>
          Oct ▲
        </button>
        <button type="button" className={btn} disabled={saving} onClick={() => performEdit("shift_pitch", -12)}>
          Oct ▼
        </button>
        <button type="button" className={btn} disabled={saving} onClick={() => performEdit("delete_note")}>
          Rest (Delete)
        </button>
      </div>
    </div>
  );
}
