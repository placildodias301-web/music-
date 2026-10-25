import { useState, useMemo } from "react";
import {
  NOTE_NAMES,
  parseChordSymbol,
  type ParsedChord,
} from "../../lib/chordTheory";
import { buildChordModel, type ChordSettings } from "../../lib/chords/model";
import { type InstrumentDefinition } from "../../lib/instruments/definitions";
import { playModel, stopAllAudio } from "../../lib/chords/play";

export interface VoiceLeadingTarget {
  id: string;
  name: string;
  targetSymbol: string;
  relationship: string;
  category: "Dominant" | "Predominant" | "Tritone Sub" | "Leading Tone" | "Resolution" | "Deceptive" | "Relative";
  explanation: string;
  voiceLeadingSteps: string[];
}

export function VoiceLeadingCard({
  chord,
  instrumentDefinition,
  settings,
  onSelectChord,
}: {
  chord: ParsedChord;
  instrumentDefinition: InstrumentDefinition;
  settings: ChordSettings;
  onSelectChord?: (chordSymbol: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"predecessors" | "resolutions">("resolutions");
  const [playingTransitionId, setPlayingTransitionId] = useState<string | null>(null);

  const rootPc = chord.root;
  const isMinor = chord.quality.suffix.includes("m") && !chord.quality.suffix.includes("maj");
  const isDominant = chord.quality.suffix === "7" || chord.quality.suffix === "9" || chord.quality.suffix === "13";

  // Predecessors: Chords that lead into this chord
  const predecessors = useMemo<VoiceLeadingTarget[]>(() => {
    // 1. Secondary Dominant (V7 of this chord) -> 7 semitones up / 5 down
    const secDomRoot = (rootPc + 7) % 12;
    const secDomSymbol = `${NOTE_NAMES[secDomRoot]}7`;

    // 2. ii7 chord leading into this chord -> 2 semitones up
    const iiRoot = (rootPc + 2) % 12;
    const iiSymbol = isMinor ? `${NOTE_NAMES[iiRoot]}m7b5` : `${NOTE_NAMES[iiRoot]}m7`;

    // 3. Tritone substitution (subV7) -> 1 semitone above this chord
    const tritoneRoot = (rootPc + 1) % 12;
    const tritoneSymbol = `${NOTE_NAMES[tritoneRoot]}7`;

    // 4. Leading tone diminished (vii°7) -> 1 semitone below this chord
    const leadingRoot = (rootPc + 11) % 12;
    const leadingSymbol = `${NOTE_NAMES[leadingRoot]}dim7`;

    // 5. Backdoor dominant (bVII7) -> 2 semitones below this chord
    const backdoorRoot = (rootPc + 10) % 12;
    const backdoorSymbol = `${NOTE_NAMES[backdoorRoot]}7`;

    // 6. Subdominant IV -> 5 semitones up
    const subdomRoot = (rootPc + 5) % 12;
    const subdomSymbol = isMinor ? `${NOTE_NAMES[subdomRoot]}m` : NOTE_NAMES[subdomRoot];

    return [
      {
        id: "v7-in",
        name: `Secondary Dominant (V7 → ${chord.label})`,
        targetSymbol: secDomSymbol,
        relationship: `V7 → I`,
        category: "Dominant",
        explanation: `Strongest authentic cadence into ${chord.label}. The leading tone resolves up by half step, and the 7th resolves down.`,
        voiceLeadingSteps: [
          `Leading tone (${NOTE_NAMES[(secDomRoot + 4) % 12]}) ascends a semitone to tonic (${NOTE_NAMES[rootPc]})`,
          `7th (${NOTE_NAMES[(secDomRoot + 10) % 12]}) resolves downward by step`,
          `Bass roots leap by a 4th up or 5th down`,
        ],
      },
      {
        id: "tritone-in",
        name: `Tritone Substitution (subV7 → ${chord.label})`,
        targetSymbol: tritoneSymbol,
        relationship: `♭II7 → I`,
        category: "Tritone Sub",
        explanation: `Shares the exact same guide tone tritone as ${secDomSymbol}, but the bass resolves downward by a smooth chromatic half step.`,
        voiceLeadingSteps: [
          `Chromatic bass descent: ${NOTE_NAMES[tritoneRoot]} → ${NOTE_NAMES[rootPc]}`,
          `3rd and 7th exchange harmonic roles smoothly`,
          `Essential sound in modern jazz and neo-soul voice leading`,
        ],
      },
      {
        id: "ii-in",
        name: `Predominant Preparation (${iiSymbol} → ${chord.label})`,
        targetSymbol: iiSymbol,
        relationship: `ii → I / ii → V`,
        category: "Predominant",
        explanation: `Standard jazz/classical preparation that sets up smooth scalar counterpoint into ${chord.label}.`,
        voiceLeadingSteps: [
          `Common tones held in inner voices`,
          `Smooth stepwise motion in upper melodic lines`,
        ],
      },
      {
        id: "leading-in",
        name: `Leading-Tone Diminished (vii°7 → ${chord.label})`,
        targetSymbol: leadingSymbol,
        relationship: `vii°7 → I`,
        category: "Leading Tone",
        explanation: `Symmetrical tension chord where every voice resolves inward or outward by half-step into the notes of ${chord.label}.`,
        voiceLeadingSteps: [
          `Bass resolves up a half step (${NOTE_NAMES[leadingRoot]} → ${NOTE_NAMES[rootPc]})`,
          `Diminished 5th and diminished 7th contract inwards`,
        ],
      },
      {
        id: "backdoor-in",
        name: `Backdoor Dominant (♭VII7 → ${chord.label})`,
        targetSymbol: backdoorSymbol,
        relationship: `♭VII7 → I`,
        category: "Dominant",
        explanation: `Borrowed dominant from the parallel Aeolian/Dorian mode, resolving up a whole step into ${chord.label}.`,
        voiceLeadingSteps: [
          `Upper voices descend smoothly by half step`,
          `Alternative to classical V7 with a dreamy, modern feel`,
        ],
      },
      {
        id: "iv-in",
        name: `Plagal Motion (IV → ${chord.label})`,
        targetSymbol: subdomSymbol,
        relationship: `IV → I (Amen Cadence)`,
        category: "Predominant",
        explanation: `The 'Amen' resolution. Gentle harmonic arrival without the aggressive leading-tone tension of a dominant chord.`,
        voiceLeadingSteps: [
          `Tonic note ${NOTE_NAMES[rootPc]} is held as a common tone`,
          `4th descends by step to the 3rd`,
        ],
      },
    ];
  }, [rootPc, chord.label, isMinor]);

  // Resolutions: Chords that this chord naturally resolves to
  const resolutions = useMemo<VoiceLeadingTarget[]>(() => {
    // 1. Circle of 5ths / Dominant resolution: 5 semitones up (4th up / 5th down)
    const fifthDownRoot = (rootPc + 5) % 12;
    const fifthDownSymbol = isDominant ? NOTE_NAMES[fifthDownRoot] : `${NOTE_NAMES[fifthDownRoot]}`;

    // 2. Relative Major / Minor:
    const relRoot = isMinor ? (rootPc + 3) % 12 : (rootPc + 9) % 12;
    const relSymbol = isMinor ? NOTE_NAMES[relRoot] : `${NOTE_NAMES[relRoot]}m`;

    // 3. Deceptive Resolution (V -> vi or X -> bVI)
    const deceptiveRoot = (rootPc + 2) % 12;
    const deceptiveSymbol = `${NOTE_NAMES[deceptiveRoot]}m`;

    // 4. Tritone Resolution (half step down)
    const halfDownRoot = (rootPc + 11) % 12;
    const halfDownSymbol = NOTE_NAMES[halfDownRoot];

    // 5. Chromatic mediant (major 3rd down or up)
    const chromMedRoot = (rootPc + 8) % 12;
    const chromMedSymbol = NOTE_NAMES[chromMedRoot];

    // 6. Subdominant motion (IV of this chord)
    const ivRoot = (rootPc + 5) % 12;
    const ivSymbol = `${NOTE_NAMES[ivRoot]}maj7`;

    return [
      {
        id: "authentic-out",
        name: isDominant
          ? `Authentic Dominant Resolution (${chord.label} → ${fifthDownSymbol})`
          : `Circle-of-Fifths Motion (${chord.label} → ${fifthDownSymbol})`,
        targetSymbol: fifthDownSymbol,
        relationship: isDominant ? `V7 → I` : `I → IV`,
        category: "Resolution",
        explanation: isDominant
          ? `Tritone tension in ${chord.label} collapses inward, delivering total harmonic rest and tonal resolution.`
          : `Classic forward harmonic motion descending by a perfect 5th (ascending 4th).`,
        voiceLeadingSteps: [
          `Guide tone 3rd resolves up a semitone`,
          `Guide tone 7th resolves down a semitone`,
          `Root moves by a 4th up to establish new tonal center`,
        ],
      },
      {
        id: "relative-out",
        name: `Relative Shift (${chord.label} → ${relSymbol})`,
        targetSymbol: relSymbol,
        relationship: isMinor ? `vi → I (Relative Major)` : `I → vi (Relative Minor)`,
        category: "Relative",
        explanation: `Shares 2 out of 3 chord tones, making this the smoothest transition in Western music theory.`,
        voiceLeadingSteps: [
          `Two chord tones stay completely stationary`,
          `Only one voice moves by a whole step`,
          `Maintains tonal equilibrium while changing emotional color`,
        ],
      },
      {
        id: "deceptive-out",
        name: `Deceptive Cadence (${chord.label} → ${deceptiveSymbol})`,
        targetSymbol: deceptiveSymbol,
        relationship: `V → vi (Interrupted Cadence)`,
        category: "Deceptive",
        explanation: `Evades the expected tonic resolution by stepping up to the submediant minor chord, creating surprise and narrative continuation.`,
        voiceLeadingSteps: [
          `Leading tone ascends to tonic note as expected`,
          `Bass steps up a whole tone instead of falling a 5th`,
          `Delays harmonic finality and extends phrase length`,
        ],
      },
      {
        id: "tritone-out",
        name: `Chromatic Half-Step Drop (${chord.label} → ${halfDownSymbol})`,
        targetSymbol: halfDownSymbol,
        relationship: `Tritone Half-Step Drop`,
        category: "Tritone Sub",
        explanation: `Every voice glides downward by parallel or contrary half step, ubiquitous in jazz, bossa nova, and film scoring.`,
        voiceLeadingSteps: [
          `Root descends chromatically: ${NOTE_NAMES[rootPc]} → ${NOTE_NAMES[halfDownRoot]}`,
          `Silky chromatic voice leading with minimum physical finger movement`,
        ],
      },
      {
        id: "chromatic-mediant-out",
        name: `Chromatic Mediant (${chord.label} → ${chromMedSymbol})`,
        targetSymbol: chromMedSymbol,
        relationship: `I → ♭VI (Epic Film Transition)`,
        category: "Resolution",
        explanation: `Non-diatonic root movement by a third with one common tone. Highly cinematic and emotionally evocative (used in Star Wars and Lord of the Rings).`,
        voiceLeadingSteps: [
          `One voice remains anchored as a pedal tone`,
          `Other voices expand or contract by semitones`,
        ],
      },
      {
        id: "subdominant-out",
        name: `Subdominant Departure (${chord.label} → ${ivSymbol})`,
        targetSymbol: ivSymbol,
        relationship: `I → IVmaj7`,
        category: "Resolution",
        explanation: `Moves energy away from the home stability toward open expansiveness without introducing jarring dissonance.`,
        voiceLeadingSteps: [
          `Tonic note ${NOTE_NAMES[rootPc]} becomes the 5th of ${ivSymbol}`,
          `Natural starting point for standard pop and blues verses`,
        ],
      },
    ];
  }, [rootPc, chord.label, isMinor, isDominant]);

  const activeList = activeTab === "resolutions" ? resolutions : predecessors;

  // Handle playing 2-chord transition
  const handlePlayTransition = async (target: VoiceLeadingTarget) => {
    stopAllAudio();
    setPlayingTransitionId(target.id);

    try {
      const parsedTarget = parseChordSymbol(target.targetSymbol);
      const isPredecessor = activeTab === "predecessors";
      const chordA = isPredecessor ? parsedTarget : chord;
      const chordB = isPredecessor ? chord : parsedTarget;

      const modelA = buildChordModel(chordA, instrumentDefinition, settings);
      const modelB = buildChordModel(chordB, instrumentDefinition, settings);

      if (modelA) {
        await playModel(modelA, 0);
      }

      // Wait 750ms between chords
      await new Promise((res) => setTimeout(res, 750));

      if (modelB) {
        await playModel(modelB, 0);
      }
    } catch {
      // Audio fallback handled gracefully
    } finally {
      setPlayingTransitionId(null);
    }
  };

  const getCategoryColor = (cat: VoiceLeadingTarget["category"]) => {
    switch (cat) {
      case "Dominant":
        return "border-amber-500/30 bg-amber-500/10 text-amber-500";
      case "Resolution":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
      case "Tritone Sub":
        return "border-purple-500/30 bg-purple-500/10 text-purple-400";
      case "Predominant":
        return "border-sky-500/30 bg-sky-500/10 text-sky-400";
      case "Leading Tone":
        return "border-rose-500/30 bg-rose-500/10 text-rose-400";
      case "Deceptive":
        return "border-indigo-500/30 bg-indigo-500/10 text-indigo-400";
      case "Relative":
        return "border-teal-500/30 bg-teal-500/10 text-teal-400";
      default:
        return "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)]";
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-4">
        <div>
          <h4 className="font-heading text-sm font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            Chord Resolutions & Voice Leading
          </h4>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            Explore authentic transitions, secondary dominants, and voice movements for{" "}
            <span className="font-bold text-[var(--color-ns-amber)]">{chord.label}</span>.
          </p>
        </div>

        {/* Tab switch: Resolutions vs Predecessors */}
        <div className="flex rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("resolutions")}
            className={`rounded-lg px-3 py-1 font-bold transition-all ${
              activeTab === "resolutions"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Where it Resolves ({chord.label} → ...)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("predecessors")}
            className={`rounded-lg px-3 py-1 font-bold transition-all ${
              activeTab === "predecessors"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Leading Into It (... → {chord.label})
          </button>
        </div>
      </div>

      {/* Cards list */}
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {activeList.map((target) => {
          const isPlaying = playingTransitionId === target.id;
          const labelA = activeTab === "predecessors" ? target.targetSymbol : chord.label;
          const labelB = activeTab === "predecessors" ? chord.label : target.targetSymbol;

          return (
            <div
              key={target.id}
              className="group relative flex flex-col justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/60 p-4 transition-all hover:border-[var(--color-ns-amber)]/40 hover:bg-[var(--color-ns-bg)] hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider ${getCategoryColor(
                        target.category
                      )}`}
                    >
                      {target.category}
                    </span>
                    <h5 className="mt-1.5 font-heading text-base font-bold text-[var(--color-ns-text)]">
                      {target.name}
                    </h5>
                    <div className="font-mono text-xs font-semibold text-[var(--color-ns-amber)]">
                      {labelA} → {labelB}{" "}
                      <span className="font-sans text-[0.6875rem] text-[var(--color-ns-dim)]">
                        ({target.relationship})
                      </span>
                    </div>
                  </div>

                  <span className="font-heading text-2xl font-black text-[var(--color-ns-amber)]">
                    {target.targetSymbol.replace(/#/g, "♯")}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-[var(--color-ns-muted)]">
                  {target.explanation}
                </p>

                {/* Voice leading step pills */}
                <div className="mt-2.5 space-y-1">
                  {target.voiceLeadingSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--color-ns-dim)]"
                    >
                      <span className="text-[var(--color-ns-amber)]">›</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--color-ns-border)]/60 pt-3">
                <button
                  type="button"
                  onClick={() => handlePlayTransition(target)}
                  disabled={isPlaying}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                    isPlaying
                      ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)]"
                      : "border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-card)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)] hover:bg-[var(--color-ns-amber)]/10"
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <span className="h-2 w-2 animate-ping rounded-full bg-[var(--color-ns-amber)]" />
                      Playing...
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Play Transition
                    </>
                  )}
                </button>

                {onSelectChord && (
                  <button
                    type="button"
                    onClick={() => onSelectChord(target.targetSymbol)}
                    className="flex items-center gap-1 text-xs font-semibold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-amber)]"
                  >
                    Inspect {target.targetSymbol}
                    <span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
