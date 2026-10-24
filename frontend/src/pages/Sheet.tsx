import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { AlphaTabApi, PlayerMode, synth } from "@coderline/alphatab";
import type { model as atModel } from "@coderline/alphatab";
import { API_URL } from "../lib/api";
import { encodeWav } from "../lib/wavEncode";
import {
  addNote,
  chordAt,
  deleteNote,
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

/**
 * AI sheet generation (MVP feature 10), first version.
 *
 * A song goes to /api/sheet/generate and comes back as a piano lead sheet in MusicXML (right hand =
 * sung melody, left hand = detected chords, chord names on top). A MusicXML file can also be opened
 * directly. alphaTab draws it, plays it with a highlighted cursor, transposes and exports it.
 * The notes are an AI draft: Edit mode lets you click a note and fix it. Edits change the sheet
 * model (see lib/sheetEdit) and /api/sheet/render redraws the MusicXML, so exports include them.
 */

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
  /** The editable sheet behind a generated song (a MusicXML file you open has none). */
  model?: SheetModel;
}
type LeftHand = (typeof LEFT_HAND)[number]["value"];

const card = "rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5";
const btn =
  "rounded-xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-purple-light)] disabled:cursor-not-allowed disabled:opacity-50";
const field =
  "rounded-xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-3 py-2 text-sm text-[var(--color-ns-text)]";
const btnPrimary =
  "rounded-xl bg-[var(--color-ns-purple)] px-5 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-primary)] hover:bg-[var(--color-ns-purple-light)] disabled:cursor-not-allowed disabled:opacity-50";

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function Sheet() {
  const [sheet, setSheet] = useState<SheetResult | null>(null);
  // What's on screen: the sheet's MusicXML after transposing (export uses this one).
  const [shown, setShown] = useState("");
  const [leftHand, setLeftHand] = useState<LeftHand>("block");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false); // busy because a picture of a sheet is being read, not a song
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [program, setProgram] = useState<number>(0);
  const [hasScore, setHasScore] = useState(false);
  const [model, setModel] = useState<SheetModel | null>(null);
  const [history, setHistory] = useState<SheetModel[]>([]);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<number | null>(null); // quarter notes from bar 1

  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);

  // One alphaTab instance for the page; it re-renders whatever sheet is loaded.
  useEffect(() => {
    if (!hostRef.current || !scrollRef.current) return;
    const api = new AlphaTabApi(hostRef.current, {
      // includeNoteBounds: clicks are matched to the exact note head (Edit mode needs the staff right).
      core: { fontDirectory: "/font/", includeNoteBounds: true },
      player: {
        playerMode: PlayerMode.EnabledSynthesizer,
        // FluidR3 Mono GM (MIT, ~14 MB, licence beside it): real-sounding guitar, violin, flute.
        // alphaTab's bundled Sonivox (~1 MB) made every instrument sound like a piano.
        soundFont: "/sounds/FluidR3Mono_GM.sf3",
        scrollElement: scrollRef.current,
        enableCursor: true,
        enableElementHighlighting: true,
      },
    });
    api.playerReady.on(() => setReady(true));
    api.scoreLoaded.on(() => setHasScore(true));
    api.playerStateChanged.on((e) => setPlaying(e.state === synth.PlayerState.Playing));
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  // Whatever is shown gets drawn by alphaTab, played with the chosen instrument.
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

  // Redraw the sheet. A generated sheet is drawn from its model (left hand style, transposition and
  // edits all applied on the server by music21: notes, chord names and key move, rhythm stays).
  // An opened MusicXML file has no model, so it can only be transposed as a whole.
  const transposeRef = useRef(0);
  const drawRef = useRef(0);
  const redraw = async (m: SheetModel | null, style: LeftHand, semitones: number, raw = "") => {
    setError("");
    const id = ++drawRef.current;
    try {
      let body: string;
      let url: string;
      if (m) {
        url = "/api/sheet/render";
        body = JSON.stringify({ model: m, left_hand: style, semitones });
      } else if (semitones === 0) {
        setShown(raw);
        return;
      } else {
        url = "/api/sheet/transpose";
        body = JSON.stringify({ musicxml: raw, semitones });
      }
      const res = await fetch(`${API_URL}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = (await res.json().catch(() => null)) as { musicxml?: string; detail?: string } | null;
      if (!res.ok || !data?.musicxml) throw new Error(data?.detail ?? `Server error (${res.status}).`);
      if (id === drawRef.current) setShown(data.musicxml); // a newer change already asked for a redraw
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
    transposeRef.current = 0;
    setShown(s.musicxml);
    if (s.model && leftHand !== "block") void redraw(s.model, leftHand, 0); // generate draws block chords
  };

  const applyTranspose = (delta: number) => {
    if (!sheet) return;
    const next = Math.max(-12, Math.min(12, transposeRef.current + delta));
    if (next === transposeRef.current) return;
    transposeRef.current = next;
    setTranspose(next);
    void redraw(model, leftHand, next, sheet.musicxml);
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
    void redraw(next, leftHand, transposeRef.current);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    setModel(prev);
    void redraw(prev, leftHand, transposeRef.current);
  };
  const selectedNote = model && selection !== null ? noteAt(model, selection) : -1;
  const editNote = (fn: (m: SheetModel, i: number) => SheetModel) => {
    if (model && selectedNote >= 0) commit(fn(model, selectedNote));
  };

  // Clicking the right-hand staff in Edit mode selects that beat. A note head click is exact; a
  // plain beat click (how rests get picked) only counts when alphaTab places it on the top staff.
  const select = (beat: atModel.Beat) => {
    if (!editing || !model || beat.voice.bar.staff.index !== 0) return;
    setSelection(positionOf(beat.voice.bar.index, beat.displayStart, model.beatsPerBar));
  };
  const onNoteClick = (n: atModel.Note) => select(n.beat);
  const onBeatClick = (beat: atModel.Beat) => {
    if (beat.isRest) select(beat);
  };

  // Keep the selected beat highlighted, also after every redraw.
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

  // Keyboard: arrows move the pitch (Shift = an octave), Delete removes, Ctrl+Z undoes.
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
  // Re-registered after every render (cheap), so the handlers always see the current sheet.
  useEffect(() => {
    const api = apiRef.current;
    api?.noteMouseDown.on(onNoteClick);
    api?.beatMouseDown.on(onBeatClick);
    window.addEventListener("keydown", onKey);
    return () => {
      api?.noteMouseDown.off(onNoteClick);
      api?.beatMouseDown.off(onBeatClick);
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

  /** Renders the sheet with the chosen instrument, speed-independent, and downloads it as a WAV file. */
  async function exportAudio() {
    const api = apiRef.current;
    if (!api?.score || exporting) return;
    setError("");
    setExporting(true);
    let exporter: Awaited<ReturnType<AlphaTabApi["exportAudio"]>> | null = null;
    try {
      const sampleRate = 44100;
      exporter = await api.exportAudio(Object.assign(new synth.AudioExportOptions(), { sampleRate, useSyncPoints: false }));
      const chunks: Float32Array[] = [];
      for (let chunk = await exporter.render(2000); chunk; chunk = await exporter.render(2000)) chunks.push(chunk.samples);
      if (!chunks.length) throw new Error("There's nothing to play in this sheet.");
      const title = sheet?.title ?? "sheet";
      const name = `${title}${transpose ? ` (${transpose > 0 ? "+" : ""}${transpose})` : ""}`;
      const wav = encodeWav(chunks, sampleRate);
      // WhatsApp and most phones refuse WAV ("file not supported"), so the server turns it into an MP3.
      try {
        const form = new FormData();
        form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "sheet.wav");
        const res = await fetch(`${API_URL}/api/sheet/audio`, { method: "POST", body: form });
        if (!res.ok) throw new Error(String(res.status));
        download(`${name}.mp3`, await res.blob(), "audio/mpeg");
      } catch {
        download(`${name}.wav`, wav as BlobPart, "audio/wav"); // server unreachable: still give them something
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
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/sheet/generate`, { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as (SheetResult & { detail?: string }) | null;
      if (!res.ok || !data?.musicxml) throw new Error(data?.detail ?? `Server error (${res.status}).`);
      openSheet(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make a sheet from that file.");
    } finally {
      setBusy(false);
    }
  }

  async function onSheetFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    const title = file.name.replace(/\.[^.]+$/, "");
    if (IMAGE_FILE.test(file.name) || file.type.startsWith("image/")) {
      // A photo or scan of printed music: the server reads the notes (optical music recognition).
      setBusy(true);
      setScanning(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API_URL}/api/sheet/scan`, { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as { title?: string; musicxml?: string; detail?: string } | null;
        if (!res.ok || !data?.musicxml) throw new Error(data?.detail ?? `Server error (${res.status}).`);
        openSheet({ title, musicxml: data.musicxml });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read that picture.");
      } finally {
        setBusy(false);
        setScanning(false);
      }
      return;
    }
    if (file.name.toLowerCase().endsWith(".mxl")) {
      // Compressed MusicXML: alphaTab reads the bytes itself; there's no text to re-export.
      apiRef.current?.load(new Uint8Array(await file.arrayBuffer()));
      setSheet(null);
      setShown("");
      return;
    }
    openSheet({ title, musicxml: await file.text() });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      <section className={card} aria-labelledby="sheet-source">
        <h2 id="sheet-source" className="font-heading text-base font-bold text-[var(--color-ns-text)]">
          Make a sheet
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ns-muted)]">
          Upload a song and the AI writes the sung melody for the right hand and the chords for the left hand. Or open a
          MusicXML file, or a photo or scan of printed sheet music (png, jpg, webp).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className={`${btnPrimary} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy && !scanning ? "Writing the sheet…" : "Upload a song"}
            <input type="file" accept={SONG_ACCEPT} className="sr-only" disabled={busy} onChange={onSong} />
          </label>
          <span className="text-sm text-[var(--color-ns-muted)]">or</span>
          <label className={`${btn} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {scanning ? "Reading the page…" : "Open MusicXML or a sheet photo"}
            <input type="file" accept={SHEET_ACCEPT} className="sr-only" disabled={busy} onChange={onSheetFile} />
          </label>
        </div>
        {busy && (
          <p role="status" className="mt-3 text-sm text-[var(--color-ns-muted)]">
            {scanning
              ? "Reading the notes from your picture. This can take a few minutes the first time."
              : "Separating the vocals and finding the notes. This takes about as long as the song."}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-ns-red)]">
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
                sheet.key && (transpose ? `${sheet.key}, transposed ${transpose > 0 ? "+" : ""}${transpose}` : sheet.key),
                sheet.timeSignature,
                sheet.bpm ? `${Math.round(sheet.bpm)} BPM` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {sheet.notice && <p className="mt-2 text-xs text-[var(--color-ns-amber)]">{sheet.notice}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div role="group" aria-label="Playback" className="flex flex-wrap items-center gap-2">
            <button type="button" className={`${btnPrimary} w-24`} disabled={!ready || !hasScore} onClick={() => apiRef.current?.playPause()}>
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" className={btn} disabled={!ready || !hasScore} onClick={() => apiRef.current?.stop()}>
              Stop
            </button>
            <select aria-label="Playback speed" value={speed} onChange={(e) => applySpeed(Number(e.target.value))} className={field}>
              {[0.5, 0.75, 1, 1.25].map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? "1× speed" : `${s}× speed`}
                </option>
              ))}
            </select>
            <select aria-label="Playback instrument" value={program} onChange={(e) => applyProgram(Number(e.target.value))} className={field}>
              {INSTRUMENTS.map((i) => (
                <option key={i.program} value={i.program}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>

          <div role="group" aria-label="Sheet" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--color-ns-muted)]">Key</span>
            <button type="button" className={btn} aria-label="Transpose down a semitone" disabled={!sheet} onClick={() => applyTranspose(-1)}>
              −
            </button>
            <span className="w-8 text-center text-sm tabular-nums text-[var(--color-ns-text)]" aria-live="polite">
              {transpose > 0 ? `+${transpose}` : transpose}
            </span>
            <button type="button" className={btn} aria-label="Transpose up a semitone" disabled={!sheet} onClick={() => applyTranspose(1)}>
              +
            </button>
            {model && (
              <select aria-label="Left hand" value={leftHand} onChange={(e) => changeLeftHand(e.target.value as LeftHand)} className={field}>
                {LEFT_HAND.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {model && (
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
            <button type="button" className={btn} disabled={!hasScore} onClick={() => apiRef.current?.downloadMidi()}>
              MIDI
            </button>
            <button type="button" className={btn} disabled={!hasScore || exporting} onClick={() => void exportAudio()}>
              {exporting ? "Making audio…" : "Audio (MP3)"}
            </button>
            <button
              type="button"
              className={btn}
              disabled={!sheet || !shown}
              onClick={() => sheet && download(`${sheet.title}${transpose ? ` (${transpose > 0 ? "+" : ""}${transpose})` : ""}.musicxml`, shown, "application/vnd.recordare.musicxml+xml")}
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

        <div ref={scrollRef} className="mt-4 max-h-[70vh] overflow-auto rounded-xl bg-white">
          <div ref={hostRef} />
        </div>
        {!hasScore && !busy && (
          <p className="mt-3 text-sm text-[var(--color-ns-muted)]">Your sheet will appear here.</p>
        )}
      </section>
    </div>
  );
}

const LENGTHS = [
  { quarters: 0.5, label: "♪", name: "Eighth note" },
  { quarters: 1, label: "♩", name: "Quarter note" },
  { quarters: 2, label: "𝅗𝅥", name: "Half note" },
  { quarters: 4, label: "𝅝", name: "Whole note" },
] as const;

/** The edit controls for the selected beat, plus tempo and time signature. */
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
    <div className="mt-4 rounded-xl border border-[var(--color-ns-purple)]/40 bg-[var(--color-ns-raised)] p-4" role="region" aria-label="Edit sheet">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-ns-text)]" aria-live="polite">
          {selection === null ? (
            "Click a note or rest in the top (melody) staff to edit it."
          ) : note ? (
            <>
              <b>{where}</b> · {noteName(note.midi + transpose, isFlatKey(model.key, transpose))}, {note.end - note.start} beat{note.end - note.start === 1 ? "" : "s"}
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
              <button type="button" className={btn} aria-label="Pitch up a semitone" title="↑" onClick={() => onEditNote((m, i) => shiftPitch(m, i, 1))}>
                ▲
              </button>
              <button type="button" className={btn} aria-label="Pitch down a semitone" title="↓" onClick={() => onEditNote((m, i) => shiftPitch(m, i, -1))}>
                ▼
              </button>
              <button type="button" className={btn} aria-label="Up an octave" title="Shift+↑" onClick={() => onEditNote((m, i) => shiftPitch(m, i, 12))}>
                Oct ▲
              </button>
              <button type="button" className={btn} aria-label="Down an octave" title="Shift+↓" onClick={() => onEditNote((m, i) => shiftPitch(m, i, -12))}>
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
            <button type="button" className={btn} onClick={() => onCommit(addNote(model, selection, pitchNear(model, selection)))}>
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
          {transpose !== 0 && <span className="text-xs text-[var(--color-ns-muted)]">Set Key back to 0 to edit chord names.</span>}
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
        <label className="ml-3 text-sm text-[var(--color-ns-muted)]" htmlFor="sheet-meter">
          Time signature
        </label>
        <select
          id="sheet-meter"
          value={model.beatsPerBar}
          onChange={(e) => onCommit({ ...model, beatsPerBar: Number(e.target.value) })}
          className={field}
        >
          {[2, 3, 4].map((b) => (
            <option key={b} value={b}>
              {b}/4
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-[var(--color-ns-muted)]">↑ ↓ pitch · Shift = octave · Delete · Ctrl+Z undo</span>
      </div>
    </div>
  );
}
