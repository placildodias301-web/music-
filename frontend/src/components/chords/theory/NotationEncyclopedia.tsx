import { useState } from "react";
import { playSinglePitch, stopAllAudio } from "../../../lib/chords/play";

type NotationCategory = "durations" | "time_signatures" | "dynamics_articulations" | "roadmaps";

export interface NotationSymbolItem {
  id: string;
  name: string;
  symbol: string;
  beats?: string;
  category: NotationCategory;
  description: string;
  italianBritishName?: string;
  exampleUsage: string;
  rhythmSequence?: number[]; // durations in seconds or beat counts for audio demo
}

const NOTATION_SYMBOLS: NotationSymbolItem[] = [
  // ── 1. Note & Rest Durations ──
  {
    id: "breve",
    name: "Double Whole Note",
    symbol: "𝅜 / 𝄫",
    beats: "8 Beats (in 4/4)",
    category: "durations",
    description: "Lasts twice as long as a whole note. Commonly found in choral music, renaissance polyphony, and 4/2 or 8/4 time.",
    italianBritishName: "Breve (UK)",
    exampleUsage: "Fills two complete measures of standard 4/4 meter.",
    rhythmSequence: [2.0],
  },
  {
    id: "whole",
    name: "Whole Note / Rest",
    symbol: "𝅝",
    beats: "4 Beats (in 4/4)",
    category: "durations",
    description: "A hollow oval notehead without a stem. Fills an entire measure of common time (4/4).",
    italianBritishName: "Semibreve (UK)",
    exampleUsage: "Holding a chord for a full 4-beat bar.",
    rhythmSequence: [1.6],
  },
  {
    id: "half",
    name: "Half Note / Rest",
    symbol: "𝅗𝅥",
    beats: "2 Beats",
    category: "durations",
    description: "Hollow oval notehead with a vertical stem. Exactly half the duration of a whole note.",
    italianBritishName: "Minim (UK)",
    exampleUsage: "Two half notes equal one 4/4 bar.",
    rhythmSequence: [0.8, 0.8],
  },
  {
    id: "quarter",
    name: "Quarter Note / Rest",
    symbol: "♩ / 𝄽",
    beats: "1 Beat",
    category: "durations",
    description: "Filled solid black notehead with a stem. The standard heartbeat pulse of modern music.",
    italianBritishName: "Crotchet (UK)",
    exampleUsage: "One beat per metronome click in 4/4.",
    rhythmSequence: [0.4, 0.4, 0.4, 0.4],
  },
  {
    id: "eighth",
    name: "Eighth Note / Rest",
    symbol: "♪ / 𝄾",
    beats: "0.5 Beat (1/2)",
    category: "durations",
    description: "Solid notehead with a single flag (or beamed in groups). Two eighth notes equal one quarter note.",
    italianBritishName: "Quaver (UK)",
    exampleUsage: "Straight rock strumming, counting: 1 - and - 2 - and - 3 - and - 4 - and.",
    rhythmSequence: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
  },
  {
    id: "sixteenth",
    name: "Sixteenth Note / Rest",
    symbol: "𝅘𝅥𝅯 / 𝄿",
    beats: "0.25 Beat (1/4)",
    category: "durations",
    description: "Solid notehead with two flags or double beams. Four sixteenth notes per quarter note beat.",
    italianBritishName: "Semiquaver (UK)",
    exampleUsage: "Funk grooves, counting: 1 - e - and - a - 2 - e - and - a.",
    rhythmSequence: Array(16).fill(0.1),
  },
  {
    id: "dotted",
    name: "Dotted Note",
    symbol: "♩.",
    beats: "1.5× Value",
    category: "durations",
    description: "A dot placed immediately to the right of a notehead increases its duration by exactly 50%. A dotted quarter = 1.5 beats (3 eighth notes).",
    italianBritishName: "Punto di valore",
    exampleUsage: "Essential in swing, pop syncopation, and compound 6/8 meter.",
    rhythmSequence: [0.6, 0.2, 0.6, 0.2],
  },
  {
    id: "triplet",
    name: "Triplet (Tuplet)",
    symbol: "3┌───┐",
    beats: "3 notes in 2 beats",
    category: "durations",
    description: "Fits three equal notes into the space of two notes of the same value. The foundation of blues shuffle and swing feel.",
    italianBritishName: "Terzina",
    exampleUsage: "Blues shuffle, jazz swing, and slow waltz polyrhythms.",
    rhythmSequence: [0.26, 0.26, 0.26, 0.26, 0.26, 0.26],
  },
  {
    id: "tie",
    name: "Tie",
    symbol: "⌒",
    beats: "Sustained Sum",
    category: "durations",
    description: "A curved line connecting two noteheads of the SAME pitch. The second note is not re-articulated; the durations are added together.",
    italianBritishName: "Legatura di valore",
    exampleUsage: "Sustaining a note across bar lines.",
    rhythmSequence: [1.2],
  },

  // ── 2. Time Signatures & Meter ──
  {
    id: "ts-44",
    name: "4/4 (Common Time)",
    symbol: "𝄴 / 4/4",
    category: "time_signatures",
    description: "Four quarter-note beats per measure. Accent hierarchy: Beat 1 (Strongest), Beat 3 (Medium), Beats 2 & 4 (Weak).",
    exampleUsage: "Over 90% of pop, rock, electronic, and modern songwriting.",
    rhythmSequence: [0.4, 0.4, 0.4, 0.4],
  },
  {
    id: "ts-34",
    name: "3/4 (Waltz Meter)",
    symbol: "3/4",
    category: "time_signatures",
    description: "Three quarter-note beats per measure. Accent on Beat 1 (ONE-two-three, ONE-two-three).",
    exampleUsage: "Classical waltzes, folk ballads, country ballads (e.g. Tennessee Waltz).",
    rhythmSequence: [0.4, 0.4, 0.4],
  },
  {
    id: "ts-22",
    name: "2/2 (Cut Time / Alla Breve)",
    symbol: "𝄵 / 2/2",
    category: "time_signatures",
    description: "Two half-note beats per measure. Gives fast tempos a brisk, march-like two-step feel without cluttered notation.",
    exampleUsage: "Bossa nova, samba, Sousa marches, and fast jazz bebop standards.",
    rhythmSequence: [0.6, 0.6],
  },
  {
    id: "ts-68",
    name: "6/8 (Compound Duple)",
    symbol: "6/8",
    category: "time_signatures",
    description: "Six eighth notes grouped into TWO main beats of three eighths each (Dotted-Quarter pulse: ONE-two-three, FOUR-five-six).",
    exampleUsage: "Irish jigs, rock ballads ('Hallelujah', 'House of the Rising Sun').",
    rhythmSequence: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
  },
  {
    id: "ts-54",
    name: "5/4 (Odd / Asymmetric Meter)",
    symbol: "5/4",
    category: "time_signatures",
    description: "Five beats per measure, almost always subdivided as 3+2 or 2+3.",
    exampleUsage: "Dave Brubeck's 'Take Five' (3+2), Radiohead's 'Morning Bell'.",
    rhythmSequence: [0.35, 0.35, 0.35, 0.35, 0.35],
  },
  {
    id: "ts-78",
    name: "7/8 (Odd Balkan Meter)",
    symbol: "7/8",
    category: "time_signatures",
    description: "Seven eighth-notes grouped into asymmetric pulses, most commonly 2+2+3 or 3+2+2.",
    exampleUsage: "Pink Floyd's 'Money', Rush's 'Subdivisions', Balkan folk dances.",
    rhythmSequence: [0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.27],
  },

  // ── 3. Dynamics, Articulations & Ornaments ──
  {
    id: "dyn-p-f",
    name: "Dynamics Hierarchy (ppp to fff)",
    symbol: "ppp ⋯ fff",
    category: "dynamics_articulations",
    description: "Pianissimo (very quiet), Piano (quiet), Mezzo-piano, Mezzo-forte, Forte (loud), Fortissimo (very loud).",
    italianBritishName: "Dinamica musicale",
    exampleUsage: "Controlling emotional intensity across sections from verse to chorus.",
  },
  {
    id: "crescendo",
    name: "Crescendo & Diminuendo",
    symbol: "𝄰  /  𝄱",
    category: "dynamics_articulations",
    description: "Hairpin symbols indicating a gradual increase (< crescendo) or decrease (> diminuendo/decrescendo) in volume.",
    italianBritishName: "Crescendo / Decrescendo",
    exampleUsage: "Building tension into a climactic chorus drop.",
  },
  {
    id: "staccato",
    name: "Staccato",
    symbol: "• (dot above/below)",
    category: "dynamics_articulations",
    description: "A small dot placed directly above or below a notehead. The note is played crisp, separated, and held for approximately half its written duration.",
    italianBritishName: "Staccato (detached)",
    exampleUsage: "Funky rhythm guitar chops, pizzicato strings, upbeat horn stabs.",
    rhythmSequence: [0.15, 0.15, 0.15, 0.15],
  },
  {
    id: "tenuto",
    name: "Tenuto",
    symbol: "— (horizontal line)",
    category: "dynamics_articulations",
    description: "A horizontal bar over a notehead. Hold the note for its full length with a slight expressive emphasis.",
    italianBritishName: "Tenuto (held)",
    exampleUsage: "Expressive lyrical melodies in classical and ballad playing.",
    rhythmSequence: [0.45, 0.45],
  },
  {
    id: "accent",
    name: "Accent & Marcato",
    symbol: ">  /  ^",
    category: "dynamics_articulations",
    description: "> (Accent): Play with sudden force. ^ (Marcato): Play louder, shorter, and with sharp vertical emphasis.",
    italianBritishName: "Accento / Marcato",
    exampleUsage: "Driving downbeats in rock and big-band punch chords.",
  },
  {
    id: "fermata",
    name: "Fermata (Bird's Eye)",
    symbol: "𝄐",
    category: "dynamics_articulations",
    description: "A semicircle with a central dot. Pause and hold the note indefinitely beyond its written value, guided by conductor or feel.",
    italianBritishName: "Corona / Fermata",
    exampleUsage: "Final chord of a song ring-out, or dramatic mid-song breath.",
    rhythmSequence: [2.5],
  },
  {
    id: "trill",
    name: "Trill & Mordent",
    symbol: "tr~~  /  𝄽",
    category: "dynamics_articulations",
    description: "Rapid rapid alternation between the written note and the note a half or whole step above.",
    italianBritishName: "Trillo / Mordente",
    exampleUsage: "Baroque harpsichord embellishments, virtuosic flute passages.",
  },
  {
    id: "grace",
    name: "Grace Note (Acciaccatura)",
    symbol: "𝆕 (slashed small note)",
    category: "dynamics_articulations",
    description: "A miniature note with an oblique slash across its stem. Played as quickly as possible right before or on the beat (crushed note).",
    italianBritishName: "Acciaccatura",
    exampleUsage: "Blues piano slides, Celtic tin whistle cuts, acoustic guitar hammer-ons.",
  },
  {
    id: "palm-mute",
    name: "Palm Mute (P.M. ──|)",
    symbol: "P.M. ───|",
    category: "dynamics_articulations",
    description: "Resting the flesh of the picking hand lightly across the strings near the bridge, producing a muffled, percussive chug.",
    exampleUsage: "Heavy metal rhythm guitar chugging, punk driving verses.",
  },

  // ── 4. Roadmaps & Repeats ──
  {
    id: "repeat-bars",
    name: "Repeat Sign & Endings",
    symbol: "𝄆 ⋯ 𝄇  [1.  /  [2.",
    category: "roadmaps",
    description: "A double bar line with two dots directs the musician to repeat the enclosed section. 1st and 2nd ending brackets (Voltas) indicate different conclusions on the second pass.",
    italianBritishName: "Ritornello",
    exampleUsage: "AABA song forms, fiddle tune A and B sections.",
  },
  {
    id: "dc-fine",
    name: "D.C. al Fine (Da Capo)",
    symbol: "D.C. al Fine",
    category: "roadmaps",
    description: "'From the head to the end.' Go back to the very beginning of the piece and play until reaching the word 'Fine'.",
    italianBritishName: "Da Capo al Fine",
    exampleUsage: "Standard classical minuets and ternary (ABA) forms.",
  },
  {
    id: "ds-coda",
    name: "D.S. al Coda (Dal Segno)",
    symbol: "𝄋 ⋯ ⊕",
    category: "roadmaps",
    description: "Go back to the Segno sign (𝄋), play until 'To Coda', then jump directly to the separate Coda (⊕) tail section.",
    italianBritishName: "Dal Segno al Coda",
    exampleUsage: "Broadcasting arrangements, musical theater, and jazz lead sheets.",
  },
  {
    id: "simile",
    name: "Simile & Measure Repeat",
    symbol: "𝄍  /  sim.",
    category: "roadmaps",
    description: "Indicates that the pattern, articulation, or accompaniment style established in previous bars should continue identically.",
    italianBritishName: "Simile",
    exampleUsage: "Walking bass lines, comping rhythms.",
  },
];

export function NotationEncyclopedia() {
  const [activeTab, setActiveTab] = useState<NotationCategory>("durations");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filteredItems = NOTATION_SYMBOLS.filter((s) => s.category === activeTab);

  const handlePlayRhythm = async (item: NotationSymbolItem) => {
    if (!item.rhythmSequence || item.rhythmSequence.length === 0) return;
    stopAllAudio();
    setPlayingId(item.id);

    try {
      for (const dur of item.rhythmSequence) {
        void playSinglePitch(69, "guitar"); // A4 pitch click
        await new Promise((r) => setTimeout(r, dur * 1000));
      }
    } catch {
      // Audio fallback
    } finally {
      setPlayingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-4">
        <div>
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
            Notation, Rhythm & Sheet Music Encyclopedia
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            A comprehensive conservatory guide to every symbol, duration, meter, articulation, and roadmap marking.
          </p>
        </div>

        <div className="flex flex-wrap rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
          {(
            [
              ["durations", "Note & Rest Durations"],
              ["time_signatures", "Time Signatures & Meter"],
              ["dynamics_articulations", "Dynamics & Articulations"],
              ["roadmaps", "Roadmaps & Repeats"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`rounded-lg px-3 py-1 font-bold transition-all ${
                activeTab === t
                  ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                  : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Symbol Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredItems.map((item) => {
          const isPlaying = playingId === item.id;
          return (
            <div
              key={item.id}
              className="group relative flex flex-col justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm transition-all hover:border-[var(--color-ns-amber)]/40 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-heading text-base font-bold text-[var(--color-ns-text)]">
                      {item.name}
                    </h4>
                    {item.italianBritishName && (
                      <span className="text-[0.6875rem] font-semibold text-[var(--color-ns-dim)]">
                        {item.italianBritishName}
                      </span>
                    )}
                  </div>
                  <span className="font-serif text-3xl font-extrabold text-[var(--color-ns-amber)]">
                    {item.symbol}
                  </span>
                </div>

                {item.beats && (
                  <div className="mt-2 inline-block rounded-md bg-[var(--color-ns-amber)]/10 px-2 py-0.5 font-mono text-[0.6875rem] font-bold text-[var(--color-ns-amber)]">
                    {item.beats}
                  </div>
                )}

                <p className="mt-3 text-xs leading-relaxed text-[var(--color-ns-muted)]">
                  {item.description}
                </p>

                <div className="mt-3 rounded-lg border border-[var(--color-ns-border)]/60 bg-[var(--color-ns-bg)]/70 p-2.5 text-[0.6875rem]">
                  <strong className="text-[var(--color-ns-text)]">Usage: </strong>
                  <span className="text-[var(--color-ns-muted)]">{item.exampleUsage}</span>
                </div>
              </div>

              {item.rhythmSequence && (
                <div className="mt-4 border-t border-[var(--color-ns-border)]/60 pt-3">
                  <button
                    type="button"
                    onClick={() => handlePlayRhythm(item)}
                    disabled={isPlaying}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-1.5 text-xs font-bold transition-all ${
                      isPlaying
                        ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]"
                        : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)] hover:text-[var(--color-ns-amber)]"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    {isPlaying ? "Playing Rhythm..." : "Listen Beat Pattern"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
