import { useState, useMemo } from "react";
import { CIRCLE_OF_FIFTHS_MAJOR, getKeyDefinition } from "../../../lib/theory/keys";
import { NOTE_NAMES } from "../../../lib/chordTheory";

export interface HarmonyBridgeProps {
  onNavigateToTab?: (tab: "library" | "family" | "explorer", chordOrKey?: string | number) => void;
}

export function HarmonyBridge({ onNavigateToTab }: HarmonyBridgeProps) {
  const [selectedKeyTonic, setSelectedKeyTonic] = useState<string>("C");
  const [selectedKeyMode, setSelectedKeyMode] = useState<"major" | "minor">("major");
  const [activeGuideTab, setActiveGuideTab] = useState<"circle" | "voice_leading" | "voicings">("circle");

  const keyDef = useMemo(() => {
    return getKeyDefinition(selectedKeyTonic, selectedKeyMode);
  }, [selectedKeyTonic, selectedKeyMode]);

  

  // Secondary dominants calculation
  const secondaryDominants = useMemo(() => {
    const rootIdx = NOTE_NAMES.indexOf(selectedKeyTonic.replace("b", "#") as any);
    const tonicPc = rootIdx >= 0 ? rootIdx : 0;

    // V7 of V (II7 -> V)
    const vOfV = `${NOTE_NAMES[(tonicPc + 2) % 12]}7`;
    // V7 of ii (VI7 -> ii)
    const vOfIi = `${NOTE_NAMES[(tonicPc + 9) % 12]}7`;
    // V7 of IV (I7 -> IV)
    const vOfIv = `${NOTE_NAMES[(tonicPc + 0) % 12]}7`;
    // V7 of vi (III7 -> vi)
    const vOfVi = `${NOTE_NAMES[(tonicPc + 4) % 12]}7`;

    return [
      { target: "V (Dominant)", chord: vOfV, roman: "V7/V", resolvesTo: keyDef?.diatonicTriads[4]?.chordSymbol ?? "V" },
      { target: "ii (Supertonic)", chord: vOfIi, roman: "V7/ii", resolvesTo: keyDef?.diatonicTriads[1]?.chordSymbol ?? "ii" },
      { target: "IV (Subdominant)", chord: vOfIv, roman: "V7/IV", resolvesTo: keyDef?.diatonicTriads[3]?.chordSymbol ?? "IV" },
      { target: "vi (Submediant)", chord: vOfVi, roman: "V7/vi", resolvesTo: keyDef?.diatonicTriads[5]?.chordSymbol ?? "vi" },
    ];
  }, [selectedKeyTonic, keyDef]);

  // Borrowed chords from parallel minor
  const borrowedChords = useMemo(() => {
    const rootIdx = NOTE_NAMES.indexOf(selectedKeyTonic.replace("b", "#") as any);
    const tonicPc = rootIdx >= 0 ? rootIdx : 0;

    return [
      { roman: "♭III", symbol: `${NOTE_NAMES[(tonicPc + 3) % 12]}`, source: "Parallel Aeolian", vibe: "Rock / Epic hero chord" },
      { roman: "iv", symbol: `${NOTE_NAMES[(tonicPc + 5) % 12]}m`, source: "Parallel Minor", vibe: "Beatles / Melancholic plagal cadence" },
      { roman: "♭VI", symbol: `${NOTE_NAMES[(tonicPc + 8) % 12]}`, source: "Parallel Aeolian", vibe: "Film score / Star Wars deceptive shift" },
      { roman: "♭VII", symbol: `${NOTE_NAMES[(tonicPc + 10) % 12]}`, source: "Parallel Mixolydian/Aeolian", vibe: "Classic Rock backdoor cadence" },
    ];
  }, [selectedKeyTonic]);

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-4">
        <div>
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
            Harmony, Voice Leading & Circle of Fifths Bridge
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            Explore tonal architecture, secondary dominants, modal interchange, and jump directly to All Chords, Chord Family, or Explorer.
          </p>
        </div>

        <div className="flex rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveGuideTab("circle")}
            className={`rounded-lg px-3 py-1 font-bold transition-all ${
              activeGuideTab === "circle"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Circle of Fifths & Keys
          </button>
          <button
            type="button"
            onClick={() => setActiveGuideTab("voice_leading")}
            className={`rounded-lg px-3 py-1 font-bold transition-all ${
              activeGuideTab === "voice_leading"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Voice Leading & Counterpoint
          </button>
          <button
            type="button"
            onClick={() => setActiveGuideTab("voicings")}
            className={`rounded-lg px-3 py-1 font-bold transition-all ${
              activeGuideTab === "voicings"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Drop-2 & Shell Mechanics
          </button>
        </div>
      </div>

      {/* ─── 1. CIRCLE OF FIFTHS & KEY BRIDGE ─── */}
      {activeGuideTab === "circle" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ns-border)] pb-4">
              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Key Tonic on Circle:
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CIRCLE_OF_FIFTHS_MAJOR.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedKeyTonic(k)}
                      className={`h-8 px-2.5 rounded-lg font-mono text-xs font-bold transition-all ${
                        selectedKeyTonic === k
                          ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-black shadow-sm"
                          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
                {(["major", "minor"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedKeyMode(m)}
                    className={`rounded-lg px-3 py-1 font-bold capitalize transition-all ${
                      selectedKeyMode === m
                        ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]"
                        : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Key Hero & Cross-Tab Navigation Bridge */}
            {keyDef && (
              <div className="mt-5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ns-border)] pb-4">
                  <div>
                    <h4 className="font-heading text-2xl font-black text-[var(--color-ns-amber)]">
                      {keyDef.name}
                    </h4>
                    <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
                      Key Signature: {keyDef.accidentals.count === 0 ? "Natural (No accidentals)" : `${keyDef.accidentals.count} ${keyDef.accidentals.type} (${keyDef.accidentals.type === "♯" ? "FCGDAEB".slice(0, keyDef.accidentals.count).split("").join("♯, ") + "♯" : "BEADGCF".slice(0, keyDef.accidentals.count).split("").join("♭, ") + "♭"})`}
                    </p>
                  </div>

                  {/* CROSS-TAB ACTION BUTTONS */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const rootIdx = NOTE_NAMES.indexOf(selectedKeyTonic.replace("b", "#") as any);
                        onNavigateToTab?.("library", rootIdx >= 0 ? rootIdx : 0);
                      }}
                      className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-1.5 text-xs font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)] hover:text-[var(--color-ns-amber)]"
                    >
                      📂 View in All Chords
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToTab?.("family", selectedKeyTonic)}
                      className="rounded-xl border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] px-3 py-1.5 text-xs font-bold text-[var(--color-ns-ink)] hover:brightness-110 shadow-sm"
                    >
                      🔗 Open in Chord Family
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToTab?.("explorer", selectedKeyTonic)}
                      className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-1.5 text-xs font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)]"
                    >
                      🔍 Inspect Tonic in Explorer
                    </button>
                  </div>
                </div>

                {/* Diatonic Triads */}
                <div className="mt-4">
                  <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                    Diatonic Triads & Roman Numerals:
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {keyDef.diatonicTriads.map((t) => (
                      <div
                        key={t.degree}
                        className="flex flex-col items-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-2.5 transition-transform hover:scale-105 cursor-pointer"
                        onClick={() => onNavigateToTab?.("explorer", t.chordSymbol)}
                      >
                        <span className="font-heading text-sm font-extrabold text-[var(--color-ns-amber)]">
                          {t.romanNumeral}
                        </span>
                        <span className="font-mono text-xs font-bold text-[var(--color-ns-text)]">
                          {t.chordSymbol}
                        </span>
                        <span className="mt-1 text-[0.625rem] text-[var(--color-ns-muted)]">
                          {t.notes.join(" · ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Secondary Dominants */}
                <div className="mt-5 border-t border-[var(--color-ns-border)]/60 pt-4">
                  <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                    Secondary Dominants (Tension Boosters):
                  </span>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {secondaryDominants.map((sd, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3 text-xs"
                      >
                        <div>
                          <span className="font-heading font-bold text-[var(--color-ns-amber)]">
                            {sd.roman} ({sd.chord})
                          </span>
                          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
                            Resolves to {sd.target}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigateToTab?.("explorer", sd.chord)}
                          className="rounded bg-[var(--color-ns-bg)] px-2 py-1 text-[0.625rem] font-bold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-amber)]"
                        >
                          Inspect →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Borrowed Chords (Modal Interchange) */}
                <div className="mt-5 border-t border-[var(--color-ns-border)]/60 pt-4">
                  <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                    Modal Interchange (Borrowed Chords):
                  </span>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {borrowedChords.map((bc, i) => (
                      <div
                        key={i}
                        className="flex flex-col justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-black text-sm text-[var(--color-ns-amber)]">
                            {bc.roman} ({bc.symbol})
                          </span>
                          <span className="text-[0.625rem] text-[var(--color-ns-dim)]">{bc.source}</span>
                        </div>
                        <p className="mt-1 text-[0.6875rem] text-[var(--color-ns-muted)]">{bc.vibe}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 2. VOICE LEADING & COUNTERPOINT GUIDE ─── */}
      {activeGuideTab === "voice_leading" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <h4 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
              Conservatory Voice Leading & Counterpoint Principles
            </h4>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Core laws governing how individual musical voices move smoothly between chords (Berklee & ABRSM).
            </p>

            <div className="mt-5 space-y-4 text-xs leading-relaxed">
              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading font-bold text-[var(--color-ns-amber)]">
                  1. The Law of the Shortest Path (Economy of Motion)
                </h5>
                <p className="mt-1 text-[var(--color-ns-muted)]">
                  Voices should move by the smallest possible melodic interval (steps or common tones). Never leap when a half-step or whole-step is available. If a note is common to both chords, keep it anchored in the same voice (pedal/common tone).
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading font-bold text-emerald-400">
                  2. Guide Tone Resolution (3rds and 7ths)
                </h5>
                <p className="mt-1 text-[var(--color-ns-muted)]">
                  In dominant-to-tonic progressions (V7 → I), the 3rd and 7th form the unstable tritone. In resolution:
                  the 7th always falls by half-step to the 3rd of the next chord, and the 3rd ascends by half-step to the root or stays as the 7th.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading font-bold text-rose-400">
                  3. Avoiding Parallel Fifths and Octaves
                </h5>
                <p className="mt-1 text-[var(--color-ns-muted)]">
                  In classical four-part chorale style, two voices must never move in parallel motion by perfect 5ths or perfect 8ves, as this destroys voice independence. Use contrary or oblique motion between bass and soprano.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading font-bold text-sky-400">
                  4. Functional Harmony Flowchart
                </h5>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3 font-mono font-bold text-sm">
                  <span className="rounded-lg bg-emerald-950/80 px-3 py-1.5 text-emerald-400 border border-emerald-500/30">
                    Tonic (I, vi, iii)
                  </span>
                  <span className="text-[var(--color-ns-muted)]">➔</span>
                  <span className="rounded-lg bg-sky-950/80 px-3 py-1.5 text-sky-400 border border-sky-500/30">
                    Predominant (IV, ii)
                  </span>
                  <span className="text-[var(--color-ns-muted)]">➔</span>
                  <span className="rounded-lg bg-amber-950/80 px-3 py-1.5 text-amber-400 border border-amber-500/30">
                    Dominant (V7, vii°)
                  </span>
                  <span className="text-[var(--color-ns-muted)]">➔</span>
                  <span className="rounded-lg bg-emerald-950/80 px-3 py-1.5 text-emerald-400 border border-emerald-500/30">
                    Tonic (Resolution)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 3. DROP-2 & SHELL MECHANICS ─── */}
      {activeGuideTab === "voicings" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <h4 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
              Drop-2, Drop-3 & Shell Voicing Mechanics
            </h4>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Essential modern jazz and guitar voicing techniques for clear, non-muddy polyphony.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs leading-relaxed">
              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading text-sm font-bold text-[var(--color-ns-amber)]">
                  Shell Voicings (Bud Powell & Freddie Green)
                </h5>
                <p className="mt-1.5 text-[var(--color-ns-muted)]">
                  Contains only the 3 essential notes: <strong>Root, 3rd, and 7th</strong>. Omitting the 5th frees up acoustic sonic space in band arrangements and prevents mud in the lower register.
                </p>
                <div className="mt-3 font-mono font-bold text-[var(--color-ns-amber)]">
                  Formula: Root (Bass) + Guide Tone 3rd + Guide Tone 7th
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading text-sm font-bold text-[var(--color-ns-amber)]">
                  Drop-2 Voicings
                </h5>
                <p className="mt-1.5 text-[var(--color-ns-muted)]">
                  Take a 4-note closed-position chord (1-3-5-7 or inversion) and drop the second note from the top down an octave. This opens the chord into an ergonomic 4-adjacent-string grip on guitar.
                </p>
                <div className="mt-3 font-mono font-bold text-[var(--color-ns-amber)]">
                  Close: [C4, E4, G4, B4] ➔ Drop-2: [G3, C4, E4, B4]
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading text-sm font-bold text-[var(--color-ns-amber)]">
                  Drop-3 Voicings
                </h5>
                <p className="mt-1.5 text-[var(--color-ns-muted)]">
                  Take the third note from the top in a closed chord and drop it an octave into the bass. Yields a wide, spacious skip between the bass note and upper triad.
                </p>
                <div className="mt-3 font-mono font-bold text-[var(--color-ns-amber)]">
                  Close: [C4, E4, G4, B4] ➔ Drop-3: [E3, C4, G4, B4]
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-4">
                <h5 className="font-heading text-sm font-bold text-[var(--color-ns-amber)]">
                  Quartal Harmony (McCoy Tyner / So What)
                </h5>
                <p className="mt-1.5 text-[var(--color-ns-muted)]">
                  Stacking fourths instead of classical thirds. Produces ambiguous, modern, suspended textures beloved in post-bop jazz, modern R&B, and impressionist film scores.
                </p>
                <div className="mt-3 font-mono font-bold text-[var(--color-ns-amber)]">
                  'So What' Chord: E - A - D - G - B (three 4ths + major 3rd)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
