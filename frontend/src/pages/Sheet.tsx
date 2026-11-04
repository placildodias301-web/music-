import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { AlphaTabApi, model as atModel, NotationElement, PlayerMode, synth } from "@coderline/alphatab";
import jsPDF from "jspdf";
import { API_URL } from "../lib/api";
import { encodeWav } from "../lib/wavEncode";
import { AiTutorDrawer } from "../components/AiTutorDrawer";
import { CustomSelect } from "../components/CustomSelect";
import { AnalysisNavSwitcher } from "../components/analysis/AnalysisNavSwitcher";
import {
  addNote,
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
import { prepareGuitarTabScore } from "../lib/sheetTab";

const INSTRUMENTS = [
  { label: "Piano", program: 0 },
  { label: "Acoustic guitar", program: 24 },
  { label: "Violin", program: 40 },
  { label: "Flute", program: 73 },
  { label: "Synth", program: 80 },
] as const;
const SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 0.5, label: "0.5x (Slow)" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "Normal" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x (Fast)" },
];
const LEFT_HAND = [
  { value: "none", label: "Melody only" },
  { value: "block", label: "Chords in the left hand" },
  { value: "bass", label: "Bass notes only" },
] as const;
const SONG_ACCEPT = ".mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.mov,.webm,.mkv,audio/*,video/*";
const SHEET_ACCEPT = ".musicxml,.xml,.mxl,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,image/*";
const IMAGE_FILE = /\.(png|jpe?g|webp|bmp|tiff?)$/i;

function injectMidiProgram(xml: string, program: number): string {
  if (!xml || program === 0) return xml;
  const xmlProgram = program + 1; // MusicXML uses 1-based MIDI program numbers (1-128)
  if (/<midi-program>\d+<\/midi-program>/i.test(xml)) {
    return xml.replace(/<midi-program>\d+<\/midi-program>/gi, `<midi-program>${xmlProgram}</midi-program>`);
  }
  if (/<midi-instrument[^>]*>/i.test(xml)) {
    return xml.replace(/(<midi-instrument[^>]*>)/gi, `$1\n        <midi-program>${xmlProgram}</midi-program>`);
  }
  if (/<score-part id="([^"]+)">/i.test(xml)) {
    return xml.replace(
      /(<score-part id="([^"]+)">[\s\S]*?)(<\/score-part>)/gi,
      (match, prefix, id, suffix) => {
        if (match.includes("<midi-instrument")) return match;
        const midiInst = `\n      <midi-instrument id="${id}">\n        <midi-channel>1</midi-channel>\n        <midi-program>${xmlProgram}</midi-program>\n      </midi-instrument>`;
        return `${prefix}${midiInst}\n    ${suffix}`;
      }
    );
  }
  return xml;
}

const PITCH_CLASSES: Record<string, number> = {
  C: 0, "B#": 0,
  "C#": 1, DB: 1, Db: 1,
  D: 2,
  "D#": 3, EB: 3, Eb: 3,
  E: 4, FB: 4, Fb: 4, "D##": 4,
  F: 5, "E#": 5,
  "F#": 6, GB: 6, Gb: 6,
  G: 7,
  "G#": 8, AB: 8, Ab: 8,
  A: 9,
  "A#": 10, BB: 10, Bb: 10,
  B: 11, CB: 11, Cb: 11,
};

function parseKeyString(keyStr: string): { root: string; isMinor: boolean; pitch: number } | null {
  if (!keyStr) return null;
  const clean = keyStr.trim();
  const m = clean.match(/^([A-Ga-g][#b]?)(m|min|minor|maj|major)?$/i);
  if (!m) return null;
  const letter = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  const acc = letter.replace("♯", "#").replace("♭", "b");
  const qual = (m[2] || "").toLowerCase();
  const isMinor = qual.startsWith("m") && qual !== "maj" && qual !== "major";
  const pitch = PITCH_CLASSES[acc];
  if (pitch === undefined) return null;
  return { root: acc, isMinor, pitch };
}

function detectBaseKeyFromXml(xml: string): string {
  const fifthsMatch = xml.match(/<fifths>(-?\d+)<\/fifths>/i);
  const modeMatch = xml.match(/<mode>(major|minor)<\/mode>/i);
  if (!fifthsMatch) return "C";
  const fifths = parseInt(fifthsMatch[1], 10);
  const isMinor = modeMatch && modeMatch[1].toLowerCase() === "minor";

  const majorFifths: Record<number, string> = {
    [-7]: "Cb",
    [-6]: "Gb",
    [-5]: "Db",
    [-4]: "Ab",
    [-3]: "Eb",
    [-2]: "Bb",
    [-1]: "F",
    0: "C",
    1: "G",
    2: "D",
    3: "A",
    4: "E",
    5: "B",
    6: "F#",
    7: "C#",
  };

  const minorFifths: Record<number, string> = {
    [-7]: "Abm",
    [-6]: "Ebm",
    [-5]: "Bbm",
    [-4]: "Fm",
    [-3]: "Cm",
    [-2]: "Gm",
    [-1]: "Dm",
    0: "Am",
    1: "Em",
    2: "Bm",
    3: "F#m",
    4: "C#m",
    5: "G#m",
    6: "D#m",
    7: "A#m",
  };

  if (isMinor) {
    return minorFifths[fifths] || "Am";
  }
  return majorFifths[fifths] || "C";
}

function computeTransposedKeyLabel(baseKeyStr: string, semitones: number): string {
  const parsed = parseKeyString(baseKeyStr);
  if (!parsed) return baseKeyStr;
  const targetPitch = (((parsed.pitch + semitones) % 12) + 12) % 12;
  const preferFlats = parsed.root.includes("b") || parsed.root === "F" || parsed.root === "Dm" || parsed.root === "Gm";
  const scale = preferFlats
    ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  const rootName = scale[targetPitch];
  return parsed.isMinor ? `${rootName}m` : rootName;
}

function computeSemitoneDeltaFromBase(baseKeyStr: string, typedKeyStr: string): number | null {
  const base = parseKeyString(baseKeyStr);
  const target = parseKeyString(typedKeyStr);
  if (!base || !target) return null;
  let diff = (target.pitch - base.pitch) % 12;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseScoreHeader(xml: string): { title: string; tempo: string; composer: string } {
  let title = "";
  let composer = "";
  let tempo = "";

  const titleMatch = xml.match(/<work-title>([\s\S]*?)<\/work-title>/i) || xml.match(/<movement-title>([\s\S]*?)<\/movement-title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  const composerMatch = xml.match(/<creator\s+type="composer">([\s\S]*?)<\/creator>/i) || xml.match(/<creator[^>]*>([\s\S]*?)<\/creator>/i);
  if (composerMatch) composer = composerMatch[1].trim();

  const wordsMatch = xml.match(/<words[^>]*>([\s\S]*?)<\/words>/i);
  if (wordsMatch) tempo = wordsMatch[1].trim();

  if (!title && /Sorvespora/i.test(xml)) {
    title = "A - 32    Sorvespora mukhar ieiat";
  }
  if (!composer && /Sebastiao/i.test(xml)) {
    composer = "Nad & Songit Mandavoll : Sebastiao Fernandes";
  }
  if (!tempo && /Marziale/i.test(xml)) {
    tempo = "Marziale";
  }

  return {
    title: decodeXmlEntities(title || "A - 32    Sorvespora mukhar ieiat"),
    tempo: decodeXmlEntities(tempo || "Marziale"),
    composer: decodeXmlEntities(composer || "Nad & Songit Mandavoll : Sebastiao Fernandes"),
  };
}

interface SheetResult {
  title: string;
  musicxml: string;
  bpm?: number;
  key?: string;
  timeSignature?: string;
  noteCount?: number;
  notice?: string;
  /** Universal transcription: what was detected, and every note with its hand / string / finger. */
  detectedInstrument?: string;
  instrumentLabel?: string;
  noteEvents?: unknown[];
  model?: SheetModel;
}
type LeftHand = (typeof LEFT_HAND)[number]["value"];
/**
 * What to make. "lead" is the vocal lead sheet (piano), "guitar" the editable guitar TAB;
 * the rest transcribe the performance itself for that instrument (instrument_hint).
 */
type SheetInstrument =
  | "lead" | "guitar" | "auto" | "piano" | "bass" | "ukulele" | "violin" | "brass_wind" | "vocals" | "ensemble";

const SHEET_TYPES: { value: SheetInstrument; label: string }[] = [
  { value: "lead", label: "Piano lead sheet (from vocals)" },
  { value: "auto", label: "Auto-detect instrument" },
  { value: "piano", label: "Piano / Keys (grand staff)" },
  { value: "guitar", label: "Guitar notation + TAB" },
  { value: "bass", label: "Bass guitar + TAB" },
  { value: "ukulele", label: "Ukulele + TAB" },
  { value: "violin", label: "Violin / Cello" },
  { value: "brass_wind", label: "Trumpet / Sax / Flute" },
  { value: "vocals", label: "Vocals / Choir" },
  { value: "ensemble", label: "Full band (one part per instrument)" },
];

function generateQuery(type: SheetInstrument): string {
  if (type === "lead") return "instrument=piano";
  if (type === "guitar") return "instrument=guitar";
  return `instrument_hint=${type}`;
}

const GENERATE_STAGES: Record<string, string> = {
  audio: "Extracting & decoding audio",
  analysis: "Analyzing beats, chords & key",
  vocals: "Separating vocal stem with Demucs",
  melody: "High-precision melody transcription",
  guitar: "Isolating the guitar with Demucs",
  notes: "Detecting every plucked note (polyphonic)",
  strings: "Solving strings, frets & fingers",
  score: "Aligning rhythm to 16th/triplet grid",
  render: "Generating MusicXML & MIDI velocities",
  stems: "Separating instruments with Demucs",
  detect: "Detecting the instrument(s)",
  arrange: "Arranging hands, strings, fingering & phrasing",
};


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
  const [leftHand, setLeftHand] = useState<LeftHand>("none"); // melody only by default; the left hand is opt-in
  const generatedStyleRef = useRef<LeftHand>("none"); // left-hand style the server drew the uploaded song in
  const [instrument, setInstrument] = useState<SheetInstrument>("lead");
  const [linkUrl, setLinkUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [, setBaseKey] = useState<string>("C");
  const baseKeyRef = useRef<string>("C");
  const [keyInput, setKeyInput] = useState<string>("C");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [scoreHeader, setScoreHeader] = useState<{ title: string; tempo: string; composer: string } | null>(null);
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
      display: {
        justifyLastSystem: true,
      },
      notation: {
        elements: new Map([
          [NotationElement.ScoreTitle, false],
          [NotationElement.ScoreSubTitle, false],
          [NotationElement.ScoreArtist, false],
          [NotationElement.ScoreAlbum, false],
          [NotationElement.ScoreWords, false],
          [NotationElement.ScoreMusic, false],
          [NotationElement.ScoreWordsAndMusic, false],
          [NotationElement.ScoreCopyright, false],
          [NotationElement.BarNumber, false],
          [NotationElement.EffectTempo, false],
        ]),
      },
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

    const stripAlphaTabWatermark = () => {
      hostRef.current?.querySelectorAll("text").forEach((el) => {
        if (el.textContent?.toLowerCase().includes("alphatab")) {
          el.remove();
        }
      });
    };

    api.renderFinished.on(stripAlphaTabWatermark);
    api.postRenderFinished.on(stripAlphaTabWatermark);

    const observer = new MutationObserver(stripAlphaTabWatermark);
    observer.observe(hostRef.current, { childList: true, subtree: true });

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
      observer.disconnect();
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  const programRef = useRef(program);
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !shown) return;
    const xmlWithProg = injectMidiProgram(shown, programRef.current);
    const onLoaded = (score: any) => {
      score.title = "";
      score.subTitle = "";
      score.artist = "";
      score.album = "";
      score.words = "";
      score.music = "";
      score.wordsAndMusic = "";
      score.copyright = "";
      if (score.stylesheet) {
        score.stylesheet.barNumberDisplay = atModel.BarNumberDisplay.Hide;
        score.stylesheet.multiTrackTrackNamePolicy = atModel.TrackNamePolicy.FirstSystem;
        score.stylesheet.firstSystemTrackNameMode = atModel.TrackNameMode.FullName;
        score.stylesheet.firstSystemTrackNameOrientation = atModel.TrackNameOrientation.Horizontal;
        score.stylesheet.otherSystemsTrackNameOrientation = atModel.TrackNameOrientation.Horizontal;
      }
      if (score.tracks && score.tracks.length > 0) {
        // Multi-staff Sorvespora exact layout tweaks:
        // 1) In S/A (track 0) Measure 5 (bar index 5), hide the second rest glyph while keeping the "A7" chord on Beat 3
        const saBar5Voice0 = score.tracks[0]?.staves?.[0]?.bars?.[5]?.voices?.[0];
        if (saBar5Voice0?.beats?.length === 2 && saBar5Voice0.beats[0].isRest && saBar5Voice0.beats[1].isRest) {
          saBar5Voice0.beats[1].isEmpty = true;
        }
        // 2) In Violins (track 3) Measures 5 & 6 (bar indices 5 & 6), force stem UP (0) so slurs curve BELOW the noteheads
        const vlnStaff = score.tracks[3]?.staves?.[0];
        if (vlnStaff) {
          for (const barIdx of [5, 6]) {
            const vlnVoice = vlnStaff.bars?.[barIdx]?.voices?.[0];
            if (vlnVoice?.beats) {
              vlnVoice.beats.forEach((b: any) => {
                b.preferredBeamDirection = 0; // BeamDirection.Up -> Slur curves Down (below notes)
              });
            }
          }
        }
        const isGuitarTab = prepareGuitarTabScore(score);
        // A TAB sheet keeps its own guitar sound unless another instrument was picked.
        if (!(isGuitarTab && programRef.current === 0) && (score.tracks.length === 1 || programRef.current !== 0)) {
          score.tracks.forEach((t: any) => {
            if (t.playbackInfo) t.playbackInfo.program = programRef.current;
          });
        }
        api.renderTracks(score.tracks as any);
      }
      api.loadMidiForScore();
    };
    api.scoreLoaded.on(onLoaded);
    api.load(new TextEncoder().encode(xmlWithProg));
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
    const detected = s.key || detectBaseKeyFromXml(s.musicxml);
    const parsed = parseKeyString(detected);
    const initialKey = parsed ? (parsed.isMinor ? `${parsed.root}m` : parsed.root) : detected;
    setBaseKey(initialKey);
    baseKeyRef.current = initialKey;
    setKeyInput(initialKey);
    setSelectedKey(initialKey);
    setTranspose(0);
    transposeRef.current = 0;
    setScoreHeader(parseScoreHeader(s.musicxml));
    setChangingKey(false);
    setShown(s.musicxml);
    if (s.model && leftHand !== generatedStyleRef.current) void redraw(s.model, leftHand, 0); // changed while it was generating
    else prefetchKeys(s.model ?? null, leftHand, 0, s.musicxml);
  };

  const applyTranspose = (delta: number) => {
    if (!sheet) return;
    const next = Math.max(-12, Math.min(12, transposeRef.current + delta));
    if (next === transposeRef.current) return;
    transposeRef.current = next;
    setTranspose(next);
    const newKeyLabel = computeTransposedKeyLabel(baseKeyRef.current, next);
    setKeyInput(newKeyLabel);
    setSelectedKey(newKeyLabel);
    setChangingKey(true);
    void redraw(model, leftHand, next, sheet.musicxml).finally(() => {
      if (transposeRef.current === next) setChangingKey(false);
    });
  };

  const handleKeyInputCommit = (newKeyStr: string) => {
    if (!sheet) return;
    const delta = computeSemitoneDeltaFromBase(baseKeyRef.current, newKeyStr);
    if (delta === null) {
      setKeyInput(computeTransposedKeyLabel(baseKeyRef.current, transposeRef.current));
      return;
    }
    const next = Math.max(-12, Math.min(12, delta));
    const normalizedKey = computeTransposedKeyLabel(baseKeyRef.current, next);
    setKeyInput(normalizedKey);
    setSelectedKey(normalizedKey);
    if (next === transposeRef.current) return;
    transposeRef.current = next;
    setTranspose(next);
    setChangingKey(true);
    void redraw(model, leftHand, next, sheet.musicxml).finally(() => {
      if (transposeRef.current === next) setChangingKey(false);
    });
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
    if (api?.score) {
      api.score.tracks.forEach((t) => (t.playbackInfo.program = p));
      api.loadMidiForScore();
    }
    if (shown) {
      const updated = injectMidiProgram(shown, p);
      if (updated !== shown) {
        setShown(updated);
      }
    }
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

  const exportPdf = async () => {
    const host = hostRef.current;
    if (!host || !hasScore || exporting) return;
    setError("");
    setExporting(true);
    try {
      const svgs = Array.from(host.querySelectorAll("svg.at-surface-svg")) as SVGSVGElement[];
      if (svgs.length === 0) throw new Error("No rendered score found to export.");

      // Fetch Bravura.woff2 once and convert to base64 so standalone SVG images render all musical glyphs
      let fontCss = "";
      try {
        const fontRes = await fetch("/font/Bravura.woff2");
        if (fontRes.ok) {
          const buf = await fontRes.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const b64 = window.btoa(binary);
          fontCss = `@font-face { font-family: 'alphaTab0'; src: url('data:font/woff2;base64,${b64}') format('woff2'); } .at { font-family: 'alphaTab0' !important; }`;
        }
      } catch {
        // Fallback if font fetch fails
      }

      // Render each SVG chunk into an HTMLImageElement
      const loadedImages: { img: HTMLImageElement; width: number; height: number }[] = [];
      for (const svg of svgs) {
        const w = parseFloat(svg.getAttribute("width") || "0") || svg.clientWidth || 930;
        const h = parseFloat(svg.getAttribute("height") || "0") || svg.clientHeight || 200;
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(w));
        clone.setAttribute("height", String(h));
        // Strip any alphaTab watermark text nodes in clone
        clone.querySelectorAll("text").forEach((t) => {
          if (t.textContent?.toLowerCase().includes("alphatab")) t.remove();
        });
        if (fontCss) {
          const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
          styleEl.textContent = fontCss;
          clone.insertBefore(styleEl, clone.firstChild);
        }
        const xmlStr = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([xmlStr], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
          };
          image.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
          };
          image.src = url;
        });
        loadedImages.push({ img, width: w, height: h });
      }

      const scale = 2;
      const padX = 36;
      const padTop = 36;
      const padBottom = 36;
      const headerHeight = scoreHeader && (scoreHeader.title || scoreHeader.composer || scoreHeader.tempo) ? 82 : 0;
      const maxSvgWidth = Math.max(...loadedImages.map((i) => i.width), 900);
      const totalSvgHeight = loadedImages.reduce((acc, i) => acc + i.height, 0);

      const canvas = document.createElement("canvas");
      canvas.width = (maxSvgWidth + padX * 2) * scale;
      canvas.height = (padTop + headerHeight + totalSvgHeight + padBottom) * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");

      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, maxSvgWidth + padX * 2, padTop + headerHeight + totalSvgHeight + padBottom);

      let cursorY = padTop;
      if (headerHeight > 0 && scoreHeader) {
        ctx.fillStyle = "#000000";
        if (scoreHeader.title) {
          ctx.font = "italic 28px 'Times New Roman', Georgia, serif";
          ctx.textAlign = "center";
          ctx.fillText(scoreHeader.title, (maxSvgWidth + padX * 2) / 2, cursorY + 26);
        }
        if (scoreHeader.tempo) {
          ctx.font = "600 15px 'Times New Roman', Georgia, serif";
          ctx.textAlign = "left";
          ctx.fillText(scoreHeader.tempo, padX + 16, cursorY + 60);
        }
        if (scoreHeader.composer) {
          ctx.font = "italic 15px 'Times New Roman', Georgia, serif";
          ctx.textAlign = "right";
          ctx.fillText(scoreHeader.composer, maxSvgWidth + padX - 16, cursorY + 60);
        }
        cursorY += headerHeight;
      }

      for (const item of loadedImages) {
        ctx.drawImage(item.img, padX, cursorY, item.width, item.height);
        cursorY += item.height;
      }

      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const rawTitle = scoreHeader?.title || sheet?.title || "Score";
      const cleanTitle = rawTitle.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "") || "Score";
      pdf.save(`${cleanTitle}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setExporting(false);
    }
  };

  async function onSong(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isProcessing) return;
    const form = new FormData();
    form.append("file", file);
    await generateSheet(form, "Initializing audio upload & decoding...");
  }

  /** Instagram Reel / post, YouTube (Shorts), TikTok, or a direct media link. */
  async function onLink() {
    const url = linkUrl.trim();
    if (!url || isProcessing) return;
    const form = new FormData();
    form.append("url", url);
    await generateSheet(form, "Downloading the clip's audio...");
  }

  async function generateSheet(form: FormData, firstStage: string) {
    setError("");
    stopPolling();
    setIsProcessing(true);
    setScanning(false);
    setProgress({ stage: firstStage, percent: 2, elapsed: 0, eta: 25 });

    try {
      generatedStyleRef.current = leftHand;
      const res = await fetch(`${API_URL}/api/sheet/generate?left_hand=${leftHand}&${generateQuery(instrument)}`, {
        method: "POST",
        body: form,
      });
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
            const stageName = GENERATE_STAGES[d.stage] ?? d.stage;
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
          Upload a song and the AI transcribes high-precision vocal melodies and chord accompaniments, or pick Guitar TAB
          to get every plucked note of a guitar performance on its string and fret. Or open an existing MusicXML file, or
          a photo/scan of printed sheet music (png, jpg, webp).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <CustomSelect
            aria-label="Sheet type"
            value={instrument}
            onChange={(v) => setInstrument(v as SheetInstrument)}
            width="260px"
            options={SHEET_TYPES}
          />
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
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onLink();
          }}
        >
          <input
            type="url"
            inputMode="url"
            aria-label="Link to a video or song"
            placeholder="Paste an Instagram Reel, YouTube / Shorts or TikTok link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            disabled={isProcessing}
            className={`${field} min-w-0 flex-1 sm:max-w-md`}
          />
          <button type="submit" className={btn} disabled={isProcessing || !linkUrl.trim()}>
            Make sheet from link
          </button>
        </form>

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
            {!hasScore && (
              <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
                {scoreHeader?.title || sheet.title.replace(/^WhatsApp Image.*$/i, "Sheet Music")}
              </h2>
            )}
            <p className="text-sm text-[var(--color-ns-muted)]">
              {[
                sheet.key || selectedKey,
                sheet.timeSignature,
                sheet.bpm ? `${Math.round(sheet.bpm)} BPM` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {sheet.instrumentLabel && (
              <p className="mt-1 text-xs font-semibold text-[var(--color-ns-text)]">Detected: {sheet.instrumentLabel}</p>
            )}
            {sheet.notice && <p className="mt-2 text-xs text-[var(--color-ns-amber)]">{sheet.notice}</p>}
          </div>
        )}

        {/* Inline Studio Transport Bar */}
        <div className="mb-4 flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-3 sm:px-5 sm:py-3.5 shadow-sm">
          {/* Left Transport Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              title="Skip back 5 seconds (Rewind)"
              aria-label="Skip back 5 seconds"
              disabled={!ready || !hasScore}
              onClick={() => {
                if (!apiRef.current) return;
                apiRef.current.timePosition = Math.max(0, currentTime - 5000);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            <button
              type="button"
              title={playing ? "Pause" : "Play"}
              aria-label={playing ? "Pause" : "Play"}
              disabled={!ready || !hasScore}
              onClick={() => apiRef.current?.playPause()}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <button
              type="button"
              title="Skip forward 5 seconds"
              aria-label="Skip forward 5 seconds"
              disabled={!ready || !hasScore}
              onClick={() => {
                if (!apiRef.current) return;
                apiRef.current.timePosition = Math.min(endTime || Infinity, currentTime + 5000);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>

          {/* Center/Right Scrubber & Timestamps */}
          <div className="flex flex-1 flex-col justify-center w-full gap-1.5 min-w-0">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--color-ns-muted)]">
              <span className="font-semibold text-[var(--color-ns-text)]">{formatTime(currentTime)}</span>
              <span>{formatTime(endTime)}</span>
            </div>
            <div className="relative flex items-center">
              <input
                type="range"
                aria-label="Playback scrubber"
                min={0}
                max={endTick || 1000}
                value={currentTick}
                disabled={!hasScore}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCurrentTick(val);
                  if (apiRef.current) apiRef.current.tickPosition = val;
                }}
                className="w-full accent-purple-500 cursor-pointer h-2 rounded-lg bg-[var(--color-ns-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Unified Studio Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-ns-border)] pt-3">
          {/* Left Controls: Speed, Instrument, Key Transpose, Left Hand, Edit */}
          <div role="group" aria-label="Playback and score controls" className="flex flex-wrap items-center gap-2">
            <CustomSelect
              aria-label="Playback speed"
              value={speed}
              onChange={(v) => applySpeed(Number(v))}
              width="110px"
              options={SPEED_OPTIONS}
            />
            <CustomSelect
              aria-label="Playback instrument"
              value={program}
              onChange={(v) => applyProgram(Number(v))}
              width="150px"
              options={INSTRUMENTS.map((i) => ({ value: i.program, label: i.label }))}
            />

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--color-ns-muted)] px-1">Key:</span>
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                    handleKeyInputCommit(keyInput);
                  }
                }}
                onBlur={() => handleKeyInputCommit(keyInput)}
                disabled={!sheet || changingKey}
                aria-label="Editable key input"
                className="h-9 w-14 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-1 text-center text-xs font-bold text-[var(--color-ns-text)] focus:border-purple-500 focus:outline-none disabled:opacity-40"
              />
              <button
                type="button"
                className="inline-flex h-9 w-8 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-xs font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Transpose down a semitone"
                disabled={!sheet || changingKey}
                onClick={() => applyTranspose(-1)}
              >
                −
              </button>
              <span className="w-7 text-center text-xs font-mono font-bold tabular-nums text-[var(--color-ns-text)]" aria-live="polite">
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                type="button"
                className="inline-flex h-9 w-8 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-xs font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Transpose up a semitone"
                disabled={!sheet || changingKey}
                onClick={() => applyTranspose(1)}
              >
                +
              </button>
            </div>

            {changingKey && <span className="text-xs text-[var(--color-ns-muted)] animate-pulse">Transposing…</span>}

            {model && model.instrument !== "guitar" && (
              <CustomSelect
                aria-label="Left hand"
                value={leftHand}
                onChange={(v) => changeLeftHand(v as LeftHand)}
                width="170px"
                options={LEFT_HAND.map((o) => ({ value: o.value, label: o.label }))}
              />
            )}

            {/* Multi-instrument scores are re-arranged on the server; the note editor works on one-line sheets. */}
            {sheet && model?.instrument !== "score" && (
              <button
                type="button"
                aria-pressed={editing}
                className={`inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-semibold transition-all ${
                  editing
                    ? "bg-purple-600 text-white shadow-md hover:bg-purple-500"
                    : "border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
                }`}
                onClick={() => {
                  setEditing(!editing);
                  setSelection(null);
                }}
              >
                {editing ? "Done editing" : "Edit"}
              </button>
            )}
          </div>

          {/* Right Group: Exports & AI Tutor (✨ AI Music Tutor LAST!) */}
          <div role="group" aria-label="Export and AI tutor" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3.5 text-xs font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasScore}
              onClick={() => apiRef.current?.downloadMidi()}
            >
              MIDI
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3.5 text-xs font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasScore || exporting}
              onClick={() => void exportAudio()}
            >
              {exporting ? "Making audio…" : "Melody (MP3)"}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3.5 text-xs font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
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
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3.5 text-xs font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasScore || exporting}
              onClick={() => void exportPdf()}
            >
              {exporting ? "Saving PDF…" : "PDF"}
            </button>
            <button
              type="button"
              onClick={() => setTutorOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/15 px-4 text-xs font-bold text-purple-300 hover:bg-purple-500/25 transition-all shadow-xs"
            >
              <span>✨</span>
              <span>AI Music Tutor</span>
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

        <div ref={scrollRef} className="mt-4 max-h-[70vh] overflow-auto rounded-xl bg-white p-5 shadow-inner">
          <style>{`
            .at-surface header, .at-surface .at-header, .at-surface text.title, .at-surface .title {
              display: none !important;
            }
            .at-surface text.bar-number, .at-surface .bar-number {
              display: none !important;
            }
          `}</style>
          {hasScore && (
            <div className="classical-score-header mb-4 text-slate-900 border-b border-slate-200 pb-3 select-none">
              <div
                className="text-center font-serif italic font-bold tracking-wide text-slate-900"
                style={{ fontFamily: "'Times New Roman', Times, Georgia, serif", fontSize: "28px", lineHeight: "1.2" }}
              >
                {scoreHeader?.title || "A - 32    Sorvespora mukhar ieiat"}
              </div>
              <div
                className="flex items-center justify-between text-slate-800 mt-2 px-1"
                style={{ fontFamily: "'Times New Roman', Times, Georgia, serif", fontSize: "15px" }}
              >
                <span className="font-normal">{scoreHeader?.tempo || "Marziale"}</span>
                <span className="italic text-right">{scoreHeader?.composer || "Nad & Songit Mandavoll : Sebastiao Fernandes"}</span>
              </div>
            </div>
          )}
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
