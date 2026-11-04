import { useState, useEffect, useRef } from "react";

export interface ChordVoicing {
  name: string;
  frets: number[]; // 6 strings: [E2, A2, D3, G3, B3, E4], -1 muted, 0 open
  fingers: string[];
  midi_notes: number[];
  role: string;
}

export interface ProgressionOption {
  id: string;
  label: string;
  vibe: string;
  theory_why: string;
  bass_movement: string;
  chords: ChordVoicing[];
}

export interface TutorChordWidgetProps {
  options: ProgressionOption[];
  widgetTitle?: string;
  defaultBpm?: number;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNoteName(midi: number): string {
  return NOTE_NAMES[midi % 12];
}

// ── Web Audio Synthesizer (Acoustic Pluck / Piano Tone) ───────────────────────

class SoundEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playMidiNote(midi: number, startTime: number, duration = 1.4, volume = 0.28) {
    const ctx = this.getContext();
    const freq = 440 * Math.pow(2, (midi - 69) / 12);

    const osc = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Warm pluck: fundamental triangle + gentle harmonic sawtooth
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startTime);

    oscHarmonic.type = "sawtooth";
    oscHarmonic.frequency.setValueAtTime(freq * 2, startTime);

    // Dynamic low-pass filter decay for authentic acoustic string pluck
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(freq * 4, 3800), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.8, 200), startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.006); // rapid attack
    gain.gain.exponentialRampToValueAtTime(volume * 0.45, startTime + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    oscHarmonic.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    oscHarmonic.start(startTime);
    osc.stop(startTime + duration);
    oscHarmonic.stop(startTime + duration);
  }

  strumChord(midiNotes: number[], strumSpeedMs = 24) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    // Sort from lowest bass pitch to highest treble note
    const sorted = [...midiNotes].sort((a, b) => a - b);
    sorted.forEach((midi, idx) => {
      this.playMidiNote(midi, now + (idx * strumSpeedMs) / 1000);
    });
  }
}

const synth = new SoundEngine();

// ── 6-String Guitar Fretboard Diagram Component ─────────────────────────────

function GuitarDiagram({ voicing, isPlaying }: { voicing: ChordVoicing; isPlaying?: boolean }) {
  const frets = voicing.frets;
  const fretted = frets.filter((f) => f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : 0;
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  const FRET_SPAN = 4;
  const startFret = maxFret > FRET_SPAN ? Math.max(1, minFret) : 0;

  const width = 160;
  const height = 185;
  const padLeft = 24;
  const padTop = 32;
  const stringSpacing = 22;
  const fretSpacing = 28;

  return (
    <div className={`relative flex flex-col items-center rounded-xl p-2 transition-all ${
      isPlaying ? "bg-[var(--color-ns-purple)]/15 ring-2 ring-[var(--color-ns-purple)] shadow-md" : "bg-[var(--color-ns-raised)]/60"
    }`}>
      <div className="mb-1 text-center">
        <span className="font-heading text-sm font-bold text-[var(--color-ns-text)]">{voicing.name}</span>
        {voicing.role && <p className="text-[10px] text-[var(--color-ns-muted)]">{voicing.role}</p>}
      </div>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="select-none overflow-visible">
        {/* Nut offset label if playing higher up the neck */}
        {startFret > 0 && (
          <text x={padLeft - 18} y={padTop + fretSpacing * 0.7} fontSize="11" fontWeight="bold" fill="#8b5cf6">
            {startFret}fr
          </text>
        )}

        {/* Nut (or double-bar fret wire) */}
        <line
          x1={padLeft}
          y1={padTop}
          x2={padLeft + stringSpacing * 5}
          y2={padTop}
          stroke={startFret === 0 ? "var(--color-ns-text)" : "var(--color-ns-border)"}
          strokeWidth={startFret === 0 ? 4 : 1.5}
        />

        {/* Fret horizontal lines */}
        {Array.from({ length: FRET_SPAN + 1 }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={padLeft}
            y1={padTop + i * fretSpacing}
            x2={padLeft + stringSpacing * 5}
            y2={padTop + i * fretSpacing}
            stroke="var(--color-ns-border)"
            strokeWidth={1}
          />
        ))}

        {/* String vertical lines (6 strings: Low E on left -> High e on right) */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={`str-${i}`}
            x1={padLeft + i * stringSpacing}
            y1={padTop}
            x2={padLeft + i * stringSpacing}
            y2={padTop + FRET_SPAN * fretSpacing}
            stroke="var(--color-ns-muted)"
            strokeWidth={1 + (5 - i) * 0.25} // Low E is slightly thicker
          />
        ))}

        {/* Fretted Dots and Muted/Open markers */}
        {frets.map((fret, stringIdx) => {
          const x = padLeft + stringIdx * stringSpacing;
          const finger = voicing.fingers[stringIdx] || "";

          if (fret === -1) {
            return (
              <text key={`mute-${stringIdx}`} x={x} y={padTop - 10} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#ef4444">
                ✕
              </text>
            );
          }
          if (fret === 0) {
            return (
              <circle
                key={`open-${stringIdx}`}
                cx={x}
                cy={padTop - 12}
                r={4}
                fill="none"
                stroke="#10b981"
                strokeWidth={1.5}
              />
            );
          }

          // Fretted note dot
          const displayFret = startFret > 0 ? fret - startFret + 1 : fret;
          const y = padTop + displayFret * fretSpacing - fretSpacing / 2;
          const isBassString = stringIdx === frets.findIndex((f) => f >= 0);

          return (
            <g key={`dot-${stringIdx}`}>
              <circle
                cx={x}
                cy={y}
                r={7.5}
                fill={isBassString ? "#6366f1" : "#8b5cf6"}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              {finger && finger !== "x" && finger !== "o" && (
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#ffffff">
                  {finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 2.5-Octave Piano Keyboard Diagram ─────────────────────────────────────────

function PianoDiagram({ voicing }: { voicing: ChordVoicing }) {
  // Range from C3 (MIDI 48) to C5 (MIDI 72)
  const startMidi = 48; // C3
  const endMidi = 72;   // C5
  const activeMidiSet = new Set(voicing.midi_notes);

  const whiteKeyWidth = 20;
  const whiteKeyHeight = 90;
  const blackKeyWidth = 12;
  const blackKeyHeight = 55;

  const whiteKeys: { midi: number; note: string; x: number }[] = [];
  const blackKeys: { midi: number; note: string; x: number }[] = [];

  let curX = 0;
  for (let m = startMidi; m <= endMidi; m++) {
    const isBlack = [1, 3, 6, 8, 10].includes(m % 12);
    const note = midiToNoteName(m);
    if (!isBlack) {
      whiteKeys.push({ midi: m, note, x: curX });
      curX += whiteKeyWidth;
    }
  }

  // Position black keys relative to white keys
  for (let m = startMidi; m < endMidi; m++) {
    const isBlack = [1, 3, 6, 8, 10].includes(m % 12);
    if (isBlack) {
      const whiteBefore = whiteKeys.filter((w) => w.midi < m).pop();
      if (whiteBefore) {
        blackKeys.push({
          midi: m,
          note: midiToNoteName(m),
          x: whiteBefore.x + whiteKeyWidth - blackKeyWidth / 2,
        });
      }
    }
  }

  const totalWidth = curX;

  return (
    <div className="flex flex-col items-center rounded-xl bg-[var(--color-ns-raised)]/60 p-3">
      <div className="mb-2 text-center">
        <span className="font-heading text-sm font-bold text-[var(--color-ns-text)]">{voicing.name} (Piano Voicing)</span>
        <div className="flex items-center justify-center gap-1.5 mt-0.5">
          {voicing.midi_notes.map((m) => (
            <span key={m} className="rounded-md bg-[var(--color-ns-purple)]/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--color-ns-purple-light)]">
              {midiToNoteName(m)}{Math.floor(m / 12) - 1}
            </span>
          ))}
        </div>
      </div>

      <svg width={totalWidth} height={whiteKeyHeight} viewBox={`0 0 ${totalWidth} ${whiteKeyHeight}`} className="overflow-visible select-none">
        {/* White Keys */}
        {whiteKeys.map((k) => {
          const isActive = activeMidiSet.has(k.midi);
          return (
            <g key={`white-${k.midi}`}>
              <rect
                x={k.x}
                y={0}
                width={whiteKeyWidth - 1}
                height={whiteKeyHeight}
                rx={2}
                fill={isActive ? "#8b5cf6" : "#ffffff"}
                stroke="#cbd5e1"
                strokeWidth={1}
                className="transition-colors duration-150"
              />
              {isActive && (
                <text x={k.x + (whiteKeyWidth - 1) / 2} y={whiteKeyHeight - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#ffffff">
                  {k.note}
                </text>
              )}
            </g>
          );
        })}

        {/* Black Keys */}
        {blackKeys.map((k) => {
          const isActive = activeMidiSet.has(k.midi);
          return (
            <g key={`black-${k.midi}`}>
              <rect
                x={k.x}
                y={0}
                width={blackKeyWidth}
                height={blackKeyHeight}
                rx={2}
                fill={isActive ? "#6366f1" : "#1e293b"}
                stroke="#0f172a"
                strokeWidth={1}
                className="transition-colors duration-150"
              />
              {isActive && (
                <circle cx={k.x + blackKeyWidth / 2} cy={blackKeyHeight - 8} r={3} fill="#ffffff" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main Tutor Chord Progression & Voicing Widget ───────────────────────────

export function TutorChordWidget({ options, widgetTitle, defaultBpm = 80 }: TutorChordWidgetProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string>(options[0]?.id || "");
  const [viewMode, setViewMode] = useState<"guitar" | "piano">("guitar");
  const [bpm, setBpm] = useState<number>(defaultBpm);
  const [isPlayingSeq, setIsPlayingSeq] = useState(false);
  const [activeChordIdx, setActiveChordIdx] = useState<number | null>(null);

  const seqTimerRef = useRef<number | null>(null);

  const activeOption = options.find((o) => o.id === selectedOptionId) || options[0];

  const stopSequence = () => {
    if (seqTimerRef.current !== null) {
      window.clearInterval(seqTimerRef.current);
      seqTimerRef.current = null;
    }
    setIsPlayingSeq(false);
    setActiveChordIdx(null);
  };

  useEffect(() => {
    return () => stopSequence();
  }, []);

  const playSequence = () => {
    if (!activeOption || !activeOption.chords.length) return;
    if (isPlayingSeq) {
      stopSequence();
      return;
    }

    setIsPlayingSeq(true);
    let step = 0;
    const chords = activeOption.chords;
    const intervalMs = Math.round((60 / bpm) * 1000);

    // Play first chord immediately
    setActiveChordIdx(0);
    synth.strumChord(chords[0].midi_notes);

    seqTimerRef.current = window.setInterval(() => {
      step++;
      if (step >= chords.length) {
        stopSequence();
        return;
      }
      setActiveChordIdx(step);
      synth.strumChord(chords[step].midi_notes);
    }, intervalMs);
  };

  const handleChordClick = (c: ChordVoicing, idx: number) => {
    stopSequence();
    setActiveChordIdx(idx);
    synth.strumChord(c.midi_notes);
    window.setTimeout(() => setActiveChordIdx(null), 1200);
  };

  if (!options || options.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-ns-purple)]/30 bg-gradient-to-b from-[var(--color-ns-card)] to-[var(--color-ns-raised)] p-4 shadow-sm">
      {/* Widget Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-ns-purple)]">
            Interactive Chord & Voice-Leading Module
          </span>
          <h4 className="font-heading text-base font-bold text-[var(--color-ns-text)]">
            {widgetTitle || activeOption?.label || "Harmonic Progressions"}
          </h4>
        </div>

        {/* View Mode Toggle */}
        <div className="inline-flex rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("guitar")}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              viewMode === "guitar"
                ? "bg-[var(--color-ns-purple)] text-white shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            🎸 Guitar Fretboard
          </button>
          <button
            type="button"
            onClick={() => setViewMode("piano")}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              viewMode === "piano"
                ? "bg-[var(--color-ns-purple)] text-white shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            🎹 Piano Keys
          </button>
        </div>
      </div>

      {/* Option Selector Tabs */}
      {options.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                stopSequence();
                setSelectedOptionId(opt.id);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                opt.id === activeOption.id
                  ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-purple)]/15 text-[var(--color-ns-purple-light)] shadow-sm"
                  : "border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-purple)]/40 hover:text-[var(--color-ns-text)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Voice-Leading & Harmonic Theory Banner */}
      {activeOption && (
        <div className="mt-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)]/80 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-1 text-[var(--color-ns-muted)]">
            <span>
              <strong>Vibe:</strong> {activeOption.vibe}
            </span>
            <span className="font-mono font-medium text-[var(--color-ns-purple-light)]">
              <strong>Bass Movement:</strong> {activeOption.bass_movement}
            </span>
          </div>
          <p className="mt-1.5 text-[var(--color-ns-text)] leading-relaxed">
            {activeOption.theory_why}
          </p>
        </div>
      )}

      {/* Visualizer Display (Guitar or Piano) */}
      {activeOption && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {activeOption.chords.map((chord, idx) => (
            <button
              key={`${chord.name}-${idx}`}
              type="button"
              onClick={() => handleChordClick(chord, idx)}
              title="Click to audition chord"
              className="group cursor-pointer rounded-xl border border-transparent p-0.5 text-left transition-all hover:border-[var(--color-ns-purple)]/50 focus:outline-none"
            >
              {viewMode === "guitar" ? (
                <GuitarDiagram voicing={chord} isPlaying={activeChordIdx === idx} />
              ) : (
                <PianoDiagram voicing={chord} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Interactive Sequencer & Playback Controls */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={playSequence}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-ns-purple)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:brightness-110 active:scale-95 transition-all"
          >
            {isPlayingSeq ? "⏸ Pause Progression" : "▶ Play Sequence"}
          </button>
          <span className="text-[11px] text-[var(--color-ns-muted)]">
            Click any chord card to audition individually
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--color-ns-muted)]">
          <span>Tempo:</span>
          <input
            type="range"
            min={60}
            max={140}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="h-1.5 w-24 accent-[var(--color-ns-purple)]"
          />
          <span className="w-12 font-mono font-bold text-[var(--color-ns-text)]">{bpm} BPM</span>
        </div>
      </div>
    </div>
  );
}
