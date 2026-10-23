/**
 * Systematic audit of the Chords page: every string, every combination of strings, paired courses, mute handling,
 * "what is drawn is what is heard", chord data on every root, and the theory text.
 *
 * Audio is tested at the level that can be tested without a speaker: the exact voices the engine schedules
 * (note, frequency, timing, gain) and, with a fake AudioContext, how many sources are really started.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ALL_CHORD_SYMBOLS, CHORD_QUALITIES, NOTE_NAMES, chordIntervals, parseChordSymbol, spellChord, type ParsedChord } from "../chordTheory";
import { buildChordModel, bassOptions, chordTunings, modelMidi, tuningNoteNames, type ChordModel } from "./model";
import { analyzeChord, analyzePlayedStrings } from "./analysis";
import { assignFingers } from "./fingering";
import { chordFormula } from "./theory";
import { chordFeatures, describeChord, describeVoicing } from "./describe";
import { chordInstruments, findDefinition } from "../instruments/definitions";
import { midiToFreq } from "../audio/pitch";
import {
  OCTAVE_STRAND_GAIN,
  UNISON_DETUNE_CENTS,
  planArpeggioVoices,
  planNoteVoices,
  planStrumVoices,
  soundedMidi,
  soundingStrings,
  voiceGainFor,
} from "../audio/voicePlan";

const GUITAR = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4, string index 0 = the lowest string
const def = (id: string) => findDefinition(id)!;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

/** Pitch class of a spelled note name such as "C", "E♭", "F♯", "B𝄫". */
function pcOf(name: string): number {
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[name[0]];
  for (const ch of name.slice(1)) pc += ch === "♯" || ch === "#" ? 1 : ch === "♭" || ch === "b" ? -1 : ch === "𝄪" ? 2 : ch === "𝄫" ? -2 : 0;
  return ((pc % 12) + 12) % 12;
}

/* ───────────────────────── 1. Every string, every fret ───────────────────────── */

describe("each string, each fret → one voice with the right note and frequency", () => {
  it("plays exactly the note tuning + fret gives, on every string of a guitar, for frets 0-24", () => {
    for (let s = 0; s < GUITAR.length; s++) {
      for (let fret = 0; fret <= 24; fret++) {
        const frets = GUITAR.map((_, i) => (i === s ? fret : null));
        const voices = planStrumVoices({ frets, tuningMidi: GUITAR });
        expect(voices, `string ${s} fret ${fret}`).toHaveLength(1);
        const v = voices[0];
        expect(v.stringIndex).toBe(s);
        expect(v.midi).toBe(GUITAR[s] + fret);
        expect(v.frequency).toBeCloseTo(440 * Math.pow(2, (GUITAR[s] + fret - 69) / 12), 6);
        expect(v.isOpen).toBe(fret === 0);
        expect(v.startOffset).toBe(0);
        expect(v.gain).toBeGreaterThan(0.3);
      }
    }
  });

  it("does not depend on a particular string index: the same shape on a different tuning order gives the same notes", () => {
    const reversed = [...GUITAR].reverse();
    const a = soundedMidi([null, 3, 2, 0, 1, 0], GUITAR).sort((x, y) => x - y);
    const b = soundedMidi([0, 1, 0, 2, 3, null], reversed).sort((x, y) => x - y);
    expect(a).toEqual(b);
  });

  it("open strings of every instrument and tuning match the labels drawn under the diagram", () => {
    const flat = (n: string) => n.replace("♭", "b");
    for (const d of chordInstruments()) {
      for (const t of chordTunings(d)) {
        const labels = tuningNoteNames(d, t);
        expect(labels.length, `${d.id} ${t.name}`).toBe(t.midi.length);
        labels.forEach((label, i) => expect(pcOf(flat(label)), `${d.id} ${t.name} string ${i + 1}`).toBe(t.midi[i] % 12));
      }
    }
  });

  it("string numbers run from the highest-numbered lowest string, matching the diagram", () => {
    const played = analyzePlayedStrings([null, 3, 2, 0, 1, 0], GUITAR, 0);
    expect(played.map((p) => p.stringNumber)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(played.map((p) => p.noteName)).toEqual([null, "C", "E", "G", "C", "E"]);
    expect(played.map((p) => p.action)).toEqual(["muted", "fretted", "fretted", "open", "fretted", "open"]);
  });
});

/* ───────────────────────── 2. Combinations of strings ───────────────────────── */

describe("any combination of strings sounds together", () => {
  it("every one of the 63 non-empty subsets of six strings gives one voice per string, all overlapping", () => {
    for (let mask = 1; mask < 64; mask++) {
      const frets = GUITAR.map((_, i) => (mask & (1 << i) ? (i % 3) : null));
      const voices = planStrumVoices({ frets, tuningMidi: GUITAR, strumSeconds: 0.2 });
      const strings = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
      expect(voices.map((v) => v.stringIndex).sort(), `mask ${mask}`).toEqual(strings.sort());
      // simultaneous: every voice starts inside the strum window, long before any note has decayed
      for (const v of voices) {
        expect(v.startOffset).toBeGreaterThanOrEqual(0);
        expect(v.startOffset).toBeLessThanOrEqual(0.2 + 1e-9);
      }
      // balanced: the combined level does not grow with the number of strings
      const power = voices.reduce((p, v) => p + v.gain * v.gain, 0);
      expect(power, `mask ${mask}`).toBeLessThan(0.9);
      expect(Math.max(...voices.map((v) => v.gain))).toBeLessThanOrEqual(0.75);
    }
  });

  it("one, two, three, four, five and six strings each give that many voices", () => {
    for (let n = 1; n <= 6; n++) {
      const frets = GUITAR.map((_, i) => (i < n ? 0 : null));
      expect(planStrumVoices({ frets, tuningMidi: GUITAR })).toHaveLength(n);
    }
  });

  it("two strings sounding together are two independent voices with their own notes, in strum order", () => {
    const voices = planStrumVoices({ frets: [null, null, 2, 2, null, null], tuningMidi: GUITAR, strumSeconds: 0.12 });
    expect(voices).toHaveLength(2);
    expect(voices.map((v) => v.midi)).toEqual([52, 57]); // D3+2 = E3, G3+2 = A3
    expect(voices[0]).not.toBe(voices[1]);
    expect(voices[1].startOffset - voices[0].startOffset).toBeCloseTo(0.12, 6);
    // an upstroke reverses the order but keeps every note
    const up = planStrumVoices({ frets: [null, null, 2, 2, null, null], tuningMidi: GUITAR, strumSeconds: 0.12, direction: "up" });
    expect(up.map((v) => v.midi)).toEqual([57, 52]);
  });

  it("two strings tuned to the same note (a unison) are still two voices, not collapsed to one", () => {
    const voices = planStrumVoices({ frets: [0, 5], tuningMidi: [50, 45] }); // D open and A string fret 5 = D
    expect(voices).toHaveLength(2);
    expect(voices[0].midi).toBe(voices[1].midi);
  });

  it("a strum starts at the first string, an arpeggio spaces strings by the gap, up-down revisits the middle strings", () => {
    const frets = [0, 2, 2, 1, 0, 0];
    const arp = planArpeggioVoices({ frets, tuningMidi: GUITAR, gapSeconds: 0.2 });
    expect(arp.map((v) => v.startOffset)).toEqual([0, 0.2, 0.4, 0.6000000000000001, 0.8, 1].map((x) => expect.closeTo(x, 6)));
    const updown = planArpeggioVoices({ frets, tuningMidi: GUITAR, direction: "up-down" });
    expect(updown).toHaveLength(6 + 4);
    const down = planArpeggioVoices({ frets, tuningMidi: GUITAR, direction: "down" });
    expect(down[0].stringIndex).toBe(5);
  });
});

/* ───────────────────────── 3. Doubled strings (courses) ───────────────────────── */

describe("doubled strings really sound double", () => {
  const MANDOLIN = [55, 62, 69, 76];
  const MANDOLIN_COURSES = [[0, 0], [0, 0], [0, 0], [0, 0]];
  const TWELVE = [40, 45, 50, 55, 59, 64];
  const TWELVE_COURSES = [[0, 12], [0, 12], [0, 12], [0, 12], [0, 0], [0, 0]];

  it("a mandolin chord is 8 voices: both strings of every course", () => {
    const voices = planStrumVoices({ frets: [0, 2, 2, 0], tuningMidi: MANDOLIN, courses: MANDOLIN_COURSES });
    expect(voices).toHaveLength(8);
    for (const course of [0, 1, 2, 3]) expect(voices.filter((v) => v.stringIndex === course)).toHaveLength(2);
  });

  it("a 12-string chord is 12 voices with the octave strings an octave up and quieter", () => {
    const voices = planStrumVoices({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: TWELVE, courses: TWELVE_COURSES });
    expect(voices).toHaveLength(12);
    const low = voices.filter((v) => v.stringIndex === 1);
    expect(low.map((v) => v.midi)).toEqual([47, 59]);
    expect(low[1].gain).toBeLessThan(low[0].gain);
    expect(low[1].gain / low[0].gain).toBeCloseTo(OCTAVE_STRAND_GAIN, 2);
  });

  it("unison strands are detuned a few cents apart and struck a few milliseconds apart; they are separate voices", () => {
    const [a, b] = planStrumVoices({ frets: [null, 2, null, null], tuningMidi: MANDOLIN, courses: MANDOLIN_COURSES });
    expect(a).not.toBe(b);
    expect(a.midi).toBe(b.midi);
    expect(Math.abs(cents(a.frequency, b.frequency))).toBeCloseTo(UNISON_DETUNE_CENTS, 1);
    expect(Math.abs(cents(a.frequency, midiToFreq(a.midi)))).toBeLessThan(UNISON_DETUNE_CENTS);
    expect(b.startOffset - a.startOffset).toBeGreaterThan(0);
    expect(b.startOffset - a.startOffset).toBeLessThan(0.01);
  });

  it("many voices stay balanced: 12 strands are not louder than 6 strings", () => {
    const six = planStrumVoices({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: TWELVE });
    const twelve = planStrumVoices({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: TWELVE, courses: TWELVE_COURSES });
    const power = (vs: typeof six) => vs.reduce((p, v) => p + v.gain * v.gain, 0);
    expect(power(twelve)).toBeLessThan(power(six) * 1.5);
    expect(power(twelve)).toBeLessThan(0.9);
    expect(voiceGainFor(1)).toBe(0.75);
    expect(voiceGainFor(12)).toBeLessThan(voiceGainFor(2));
  });

  it("a single played note on a course sounds every strand", () => {
    expect(planNoteVoices({ midi: 62, fret: 0, strands: [0, 0] })).toHaveLength(2);
    expect(planNoteVoices({ midi: 50, fret: 0, strands: [0, 12] }).map((v) => v.midi)).toEqual([50, 62]);
    expect(planNoteVoices({ midi: 62, fret: 0 })).toHaveLength(1);
  });
});

/* ───────────────────────── 4. Mute / invalid / missing ───────────────────────── */

describe("muted, missing and invalid strings are silent and never crash", () => {
  it("muted strings make no voice", () => {
    expect(planStrumVoices({ frets: [null, null, null, null, null, null], tuningMidi: GUITAR })).toEqual([]);
    expect(planStrumVoices({ frets: [null, 3, null, null, null, null], tuningMidi: GUITAR })).toHaveLength(1);
    expect(planNoteVoices({ midi: 40, fret: null })).toEqual([]);
    expect(planNoteVoices({ midi: 40, fret: -1 })).toEqual([]);
  });

  it("invalid frets (negative, fractional, NaN, absurdly high) and strings without tuning are skipped", () => {
    expect(soundingStrings([-1, 1.5, Number.NaN, 99, 2], [40, 45, 50, 55, 59])).toEqual([{ stringIndex: 4, fret: 2, openMidi: 59 }]);
    expect(soundingStrings([0, 0, 0], [40, 45])).toHaveLength(2); // the third string has no tuning data → not guessed
    expect(soundingStrings([], GUITAR)).toEqual([]);
    expect(planStrumVoices({ frets: [], tuningMidi: [] })).toEqual([]);
    expect(planNoteVoices({ midi: Number.NaN, fret: 0 })).toEqual([]);
  });

  it("the analysis shows a string with no tuning data as muted instead of inventing a note", () => {
    const played = analyzePlayedStrings([0, 2], [40], 0);
    expect(played[1].action).toBe("muted");
    expect(played[1].midi).toBeNull();
  });

  it("very high and lowest frets are the right notes", () => {
    expect(soundedMidi([24, null, null, null, null, 0], GUITAR)).toEqual([64, 64]);
    expect(planNoteVoices({ midi: 40 + 24, fret: 24 })[0].frequency).toBeCloseTo(midiToFreq(64), 6);
  });

  it("a capo raises every sounding string and the open strings stop being open", () => {
    const v = planStrumVoices({ frets: [0, 2, null, null, null, null], tuningMidi: GUITAR, capo: 2 });
    expect(v.map((x) => x.midi)).toEqual([42, 49]);
    expect(v.every((x) => !x.isOpen)).toBe(true);
  });
});

/* ───────────────────────── 5. What is drawn is what is heard ───────────────────────── */

describe("the diagram, the string table and the audio always agree", () => {
  const CHORDS = ["C", "Am", "G7", "Dm7", "F", "Bm", "E7", "Cmaj7", "A7", "Gm", "D", "E", "Fmaj7", "Bdim", "Csus4", "C/E", "G/B", "Am/G"];

  function shapesOf(m: ChordModel): (number | null)[][] {
    return m.kind === "fretted" ? m.shapes.map((s) => s.frets) : m.kind === "bass" ? bassOptions(m).map((o) => o.frets) : [];
  }

  it("for every shape on every string instrument and tuning: each sounding string's audio note is the note the table shows, muted strings are silent", () => {
    for (const d of chordInstruments()) {
      for (const tuning of chordTunings(d)) {
        for (const symbol of CHORDS) {
          const chord = parseChordSymbol(symbol);
          const m = buildChordModel(chord, d, { tuningId: tuning.id, inversion: 0 });
          if (!m || (m.kind !== "fretted" && m.kind !== "bass")) continue;
          for (const frets of shapesOf(m)) {
            const played = analyzePlayedStrings(frets, m.tuning.midi, chord.root, undefined, chord);
            const voices = planStrumVoices({ frets, tuningMidi: m.tuning.midi, courses: m.tuning.offsets });
            const label = `${d.id} ${tuning.name} ${symbol} [${frets}]`;
            played.forEach((p, i) => {
              const strandVoices = voices.filter((v) => v.stringIndex === i);
              if (p.action === "muted") expect(strandVoices, `${label} string ${i}`).toHaveLength(0);
              else {
                expect(strandVoices.length, `${label} string ${i}`).toBe(m.tuning.offsets[i].length);
                expect(strandVoices[0].midi, label).toBe(p.midi);
                expect(pcOf(p.noteName!.replace("#", "♯")), label).toBe(p.pitchClass);
              }
            });
            // ...and modelMidi (what the diagram's notes are built from) is exactly the audio's pitches
            expect(voices.map((v) => v.midi).sort((a, b) => a - b), label).toEqual(soundedMidi(frets, m.tuning.midi, m.tuning.offsets).sort((a, b) => a - b));
          }
        }
      }
    }
  });

  it("playModel hands the engine exactly the shape on screen, with every strand", async () => {
    const { audioEngine } = await import("../audio");
    const { playModel } = await import("./play");
    const spy = vi.spyOn(audioEngine, "playChord").mockResolvedValue({ voices: [], durationSeconds: 0 });
    try {
      for (const id of ["guitar", "mandolin", "guitar-12", "ukulele", "banjo"]) {
        const m = buildChordModel(parseChordSymbol("C"), def(id), { inversion: 0 })!;
        if (m.kind !== "fretted") throw new Error("expected fretted");
        m.shapes.forEach((shape, i) => {
          spy.mockClear();
          playModel(m, i);
          expect(spy).toHaveBeenCalledTimes(1);
          const call = spy.mock.calls[0][0];
          expect(call.frets, `${id} shape ${i}`).toEqual(shape.frets);
          expect(call.tuningMidi).toEqual(m.tuning.midi);
          expect(call.courses).toEqual(m.tuning.offsets);
        });
      }
      // bass: the shape played is the option the diagram steps through (dyads first), not a different list
      const bass = buildChordModel(parseChordSymbol("C"), def("bass"), { inversion: 0 })!;
      if (bass.kind !== "bass") throw new Error("expected bass");
      bassOptions(bass).forEach((o, i) => {
        spy.mockClear();
        playModel(bass, i);
        expect(spy.mock.calls[0][0].frets).toEqual(o.frets);
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("modelMidi for a string instrument equals the audio plan (pairs included)", () => {
    for (const id of ["guitar", "mandolin", "guitar-12"]) {
      const m = buildChordModel(parseChordSymbol("Am"), def(id), { inversion: 0 })!;
      if (m.kind !== "fretted") continue;
      const frets = m.shapes[0].frets;
      expect(modelMidi(m, 0).sort((a, b) => a - b)).toEqual(soundedMidi(frets, m.tuning.midi, m.tuning.offsets).sort((a, b) => a - b));
    }
  });

  it("the note names in the table are spelled like the chord (E♭ in Cm, not D♯)", () => {
    const chord = parseChordSymbol("Cm");
    const m = buildChordModel(chord, def("guitar"), { inversion: 0 })!;
    if (m.kind !== "fretted") throw new Error();
    const names = analyzePlayedStrings(m.shapes[0].frets, m.tuning.midi, chord.root, undefined, chord).map((p) => p.noteName).filter(Boolean);
    expect(names.every((n) => spellChord(chord).includes(n!))).toBe(true);
    expect(names).toContain("E♭");
  });
});

/* ───────────────────────── 6. Chord data on every root ───────────────────────── */

describe("every chord shape is a real, playable version of its chord", () => {
  function required(c: ParsedChord) {
    const all = new Set(chordIntervals(c).map((o) => (c.root + o) % 12));
    if (c.slashBass !== undefined) all.add(c.slashBass);
    const optional = new Set(c.quality.optional.map((o) => (c.root + o) % 12));
    return { all, required: [...all].filter((p) => !optional.has(p) || p === c.slashBass) };
  }

  function checkFingers(label: string, frets: (number | null)[]) {
    const f = assignFingers(frets);
    const byFinger = new Map<number, Set<number>>();
    frets.forEach((fr, i) => {
      if (fr === null || fr <= 0) return;
      const fi = f.fingers[i];
      expect(fi, `${label}: string ${i} needs a finger`).toBeTruthy();
      const set = byFinger.get(fi!) ?? new Set<number>();
      set.add(fr);
      byFinger.set(fi!, set);
    });
    for (const [fi, set] of byFinger) expect(set.size, `${label}: finger ${fi} on two frets`).toBe(1);
    expect(byFinger.size, `${label}: more than four fingers`).toBeLessThanOrEqual(4);
    for (const b of f.barres) {
      for (let i = b.fromString; i <= b.toString; i++) {
        const fr = frets[i];
        if (fr === null) continue; // a muted string under a flat finger is silenced
        expect(fr !== 0 && fr >= b.fret, `${label}: barre over an open or lower string ${i}`).toBe(true);
      }
    }
  }

  it("guitar: all 53 chord types on all 12 roots (636 chords) use only chord notes, include every required note, and are fingerable", () => {
    for (const symbol of ALL_CHORD_SYMBOLS) {
      const chord = parseChordSymbol(symbol);
      const m = buildChordModel(chord, def("guitar"), { inversion: 0 })!;
      if (m.kind !== "fretted") throw new Error("guitar must be fretted");
      expect(m.shapes.length, `${symbol} has no guitar shape`).toBeGreaterThan(0);
      const { all, required: req } = required(chord);
      const seen = new Set<string>();
      for (const s of m.shapes) {
        const label = `guitar ${symbol} [${s.frets}]`;
        expect(s.frets, label).toHaveLength(6);
        expect(seen.has(s.frets.join(",")), `${label} duplicated`).toBe(false);
        seen.add(s.frets.join(","));
        const pcs = new Set(soundedMidi(s.frets, m.tuning.midi).map((x) => x % 12));
        for (const pc of pcs) expect(all.has(pc), `${label}: ${NOTE_NAMES[pc]} is not in the chord`).toBe(true);
        for (const pc of req) expect(pcs.has(pc), `${label}: missing ${NOTE_NAMES[pc]}`).toBe(true);
        checkFingers(label, s.frets);
      }
    }
  });

  it("ukulele, mandolin, banjo, cavaquinho, bass and violin: only chord notes, a note for every string that rings, fingerable", () => {
    for (const id of ["ukulele", "mandolin", "banjo", "cavaquinho", "bass", "violin"]) {
      for (const symbol of ALL_CHORD_SYMBOLS.filter((_, i) => i % 3 === 0)) {
        const chord = parseChordSymbol(symbol);
        const m = buildChordModel(chord, def(id), { inversion: 0 });
        if (!m || (m.kind !== "fretted" && m.kind !== "bass")) throw new Error(`${id} must be a string model`);
        const shapes = m.kind === "fretted" ? m.shapes.map((s) => s.frets) : bassOptions(m).map((o) => o.frets);
        const { all } = required(chord);
        for (const frets of shapes) {
          const label = `${id} ${symbol} [${frets}]`;
          expect(frets, label).toHaveLength(m.tuning.midi.length);
          for (const pc of new Set(soundedMidi(frets, m.tuning.midi).map((x) => x % 12))) expect(all.has(pc), `${label}: ${NOTE_NAMES[pc]} is not in the chord`).toBe(true);
          checkFingers(label, frets);
        }
      }
    }
  });

  it("the banjo's drone string only rings when its note belongs to the chord", () => {
    for (const symbol of ["C", "D", "E", "G", "Am", "F#m", "B7"]) {
      const chord = parseChordSymbol(symbol);
      const m = buildChordModel(chord, def("banjo"), { tuningId: undefined, inversion: 0 })!;
      if (m.kind !== "fretted") throw new Error();
      const dronePc = m.tuning.midi[0] % 12;
      const inChord = new Set(chordIntervals(chord).map((o) => (chord.root + o) % 12)).has(dronePc);
      for (const s of m.shapes) expect(s.frets[0] === 0, `${symbol} ${s.frets}`).toBe(inChord);
    }
  });

  it("slash chords keep the written bass note as the lowest sounding string", () => {
    for (const symbol of ["C/E", "C/G", "G/B", "D/F#", "Am/G", "Am/C", "Cmaj7/B", "C7/B♭".replace("♭", "b"), "Dm7/C"]) {
      const chord = parseChordSymbol(symbol);
      const m = buildChordModel(chord, def("guitar"), { inversion: 0 })!;
      if (m.kind !== "fretted") throw new Error();
      expect(m.shapes.length, symbol).toBeGreaterThan(0);
      for (const s of m.shapes) {
        const lowest = Math.min(...soundedMidi(s.frets, m.tuning.midi));
        expect(lowest % 12, `${symbol} [${s.frets}]`).toBe(chord.slashBass);
      }
    }
  });

  it("every note name in a chord is the right pitch for its formula (spelling matches the semitones)", () => {
    for (const symbol of ALL_CHORD_SYMBOLS) {
      const chord = parseChordSymbol(symbol);
      const spelled = spellChord(chord);
      expect(spelled, symbol).toHaveLength(chord.quality.tones.length);
      spelled.forEach((n, i) => expect(pcOf(n), `${symbol} note ${i}`).toBe((chord.root + chord.quality.tones[i][0]) % 12));
      expect(chordFormula(chord)).toHaveLength(chord.quality.tones.length);
    }
  });
});

/* ───────────────────────── 7. Theory ───────────────────────── */

describe("theory is derived from the chord, never contradicts it, and is detailed", () => {
  const f = (suffix: string) => chordFeatures(CHORD_QUALITIES.find((q) => q.suffix === suffix)!);

  it("classifies chord kinds from the intervals", () => {
    expect(f("").kind).toBe("major");
    expect(f("m").kind).toBe("minor");
    expect(f("7").kind).toBe("dominant");
    expect(f("9").kind).toBe("dominant");
    expect(f("13").kind).toBe("dominant");
    expect(f("maj7").kind).toBe("major");
    expect(f("m7").kind).toBe("minor");
    expect(f("mMaj7").kind).toBe("minor-major");
    expect(f("dim").kind).toBe("diminished");
    expect(f("dim7").kind).toBe("diminished");
    expect(f("m7b5").kind).toBe("half-diminished");
    expect(f("aug").kind).toBe("augmented");
    expect(f("sus2").kind).toBe("suspended");
    expect(f("sus4").kind).toBe("suspended");
    expect(f("5").kind).toBe("power");
    expect(f("7b9").extensions).toEqual([{ degree: 9, alteration: "flat" }]);
    expect(f("13").extensions.map((e) => e.degree)).toEqual([9, 13]);
    expect(f("7").tritone).toBe(true);
    expect(f("maj7").tritone).toBe(false);
  });

  it("gives the formula, notes, intervals and construction for chords across the whole library", () => {
    for (const symbol of ["C", "Cm", "C7", "Cmaj7", "Cm7b5", "Cdim7", "Caug", "Csus4", "C5", "C6", "C9", "C13", "C7#9", "C7b5b9", "F#m7", "B♭maj9".replace("♭", "b"), "C/E"]) {
      const chord = parseChordSymbol(symbol);
      const a = analyzeChord(chord);
      const d = a.description;
      expect(d.intervals.map((r) => r.note), symbol).toEqual(spellChord(chord));
      expect(a.formula.length, symbol).toBeGreaterThan(0);
      expect(d.construction, symbol).toContain(spellChord(chord)[0]);
      for (const n of spellChord(chord).slice(1)) expect(d.construction, `${symbol} mentions ${n}`).toContain(n);
      expect(d.sound.length, symbol).toBeGreaterThanOrEqual(1);
      expect(d.role.length, symbol).toBeGreaterThan(40);
      expect(d.uses.length, symbol).toBeGreaterThanOrEqual(2);
      expect(d.related.length, symbol).toBeGreaterThanOrEqual(1);
    }
  });

  it("every one of the 636 chords produces a full, non-empty, consistent description", () => {
    for (const symbol of ALL_CHORD_SYMBOLS) {
      const chord = parseChordSymbol(symbol);
      const d = describeChord(chord);
      expect(d.intervals, symbol).toHaveLength(chord.quality.tones.length);
      expect(d.construction.length, symbol).toBeGreaterThan(20);
      expect(d.sound.length, symbol).toBeGreaterThan(0);
      expect(d.role.length, symbol).toBeGreaterThan(20);
      expect(d.uses.length, symbol).toBeGreaterThan(0);
      expect(JSON.stringify(d), symbol).not.toMatch(/undefined|NaN|\[object/);
      // a related chord is never the chord itself
      for (const r of d.related) expect(r.symbol, symbol).not.toBe(symbol);
    }
  });

  it("explains the dominant 7th as a tritone resolving down a fifth, with progressions worked out for the root", () => {
    const d = describeChord(parseChordSymbol("G7"));
    expect(d.kind).toBe("dominant");
    expect(d.sound.join(" ")).toMatch(/tritone/);
    expect(d.role).toContain("C");
    expect(d.uses.join(" ")).toContain("Dm7 – G7 – Cmaj7");
    expect(d.related.map((r) => r.symbol)).toEqual(expect.arrayContaining(["Gmaj7", "C", "C#7"]));
  });

  it("related chords are real chord qualities found by editing the formula (parallel minor of C is Cm)", () => {
    const rel = describeChord(parseChordSymbol("C")).related;
    expect(rel.find((r) => r.relation === "Parallel minor")?.symbol).toBe("Cm");
    expect(rel.find((r) => r.relation === "Relative minor")?.symbol).toBe("Am");
    expect(rel.find((r) => r.relation === "Suspended 4th")?.symbol).toBe("Csus4");
    expect(describeChord(parseChordSymbol("Am")).related.find((r) => r.relation === "Relative major")?.symbol).toBe("C");
  });

  it("describes how a shape makes the chord and never contradicts the shape", () => {
    const chord = parseChordSymbol("C");
    const frets = [null, 3, 2, 0, 1, 0];
    const played = analyzePlayedStrings(frets, GUITAR, chord.root, undefined, chord);
    const v = describeVoicing(played, chord, ["E", "A", "D", "G", "B", "E"]);
    expect(v.lines).toHaveLength(5);
    expect(v.lines[0].text).toContain("String 5 (A), fret 3 → C: the root");
    expect(v.summary.join(" ")).toMatch(/5 of 6 strings sound; string 6 is muted/);
    expect(v.summary.join(" ")).toMatch(/lowest note is C/);
    expect(v.summary.join(" ")).toMatch(/Doubled notes: .*C \(×2\).*E \(×2\)/);
    expect(v.summary.join(" ")).toMatch(/Every note of the chord is present/);
    // a shape without the fifth says so
    const noFifth = analyzePlayedStrings([null, 3, 2, null, 1, null], GUITAR, chord.root, undefined, chord);
    expect(describeVoicing(noFifth, chord, []).summary.join(" ")).toMatch(/Left out: G/);
  });
});

/* ───────────────────────── 8. The engine with a fake AudioContext ───────────────────────── */

describe("the audio engine starts one source per voice (fake AudioContext)", () => {
  type FakeNode = Record<string, unknown>;
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; buffer: unknown; startAt?: number }[] = [];
  let contexts = 0;

  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueCurveAtTime: vi.fn() });
  const node = (extra: FakeNode = {}): FakeNode => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), ...extra });

  class FakeContext {
    state = "running";
    currentTime = 1;
    sampleRate = 22050;
    destination = node();
    constructor() {
      contexts++;
    }
    createBuffer(_c: number, length: number) {
      const data = new Float32Array(length);
      return { length, sampleRate: 22050, getChannelData: () => data };
    }
    createBufferSource() {
      const src = { ...node(), start: vi.fn(), stop: vi.fn(), buffer: null as unknown, onended: null as null | (() => void) };
      src.start.mockImplementation((t?: number) => {
        (src as unknown as { startAt?: number }).startAt = t;
      });
      sources.push(src as never);
      return src;
    }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node({ type: "", frequency: param(), Q: param(), gain: param() }); }
    createDelay() { return node({ delayTime: param() }); }
    createStereoPanner() { return node({ pan: param() }); }
    resume = vi.fn().mockResolvedValue(undefined);
  }

  beforeAll(() => {
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  });
  afterEach(async () => {
    const { audioEngine } = await import("../audio");
    audioEngine.stop();
    sources.length = 0;
  });

  it("a mandolin chord starts 8 sources, a 12-string chord 12, a guitar C chord exactly its 5 sounding strings", async () => {
    const { audioEngine } = await import("../audio");
    const mandolin = buildChordModel(parseChordSymbol("G"), def("mandolin"), { inversion: 0 })!;
    const twelve = buildChordModel(parseChordSymbol("C"), def("guitar-12"), { inversion: 0 })!;
    if (mandolin.kind !== "fretted" || twelve.kind !== "fretted") throw new Error();

    const r1 = await audioEngine.playChord({ frets: mandolin.shapes[0].frets, tuningMidi: mandolin.tuning.midi, courses: mandolin.tuning.offsets, instrument: "guitar", humanize: false });
    expect(r1.voices).toHaveLength(8);
    expect(sources.filter((s) => s.start.mock.calls.length === 1)).toHaveLength(8);

    sources.length = 0;
    const r2 = await audioEngine.playChord({ frets: twelve.shapes[0].frets, tuningMidi: twelve.tuning.midi, courses: twelve.tuning.offsets, instrument: "guitar", humanize: false });
    const ringing = twelve.shapes[0].frets.filter((f) => f !== null).length;
    expect(r2.voices).toHaveLength(ringing * 2); // every sounding course sounds both of its strings
    expect(sources).toHaveLength(ringing * 2);
    const full = await audioEngine.playChord({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: twelve.tuning.midi, courses: twelve.tuning.offsets, instrument: "guitar" });
    expect(full.voices).toHaveLength(12); // all six courses ring: 12 strings

    sources.length = 0;
    const r3 = await audioEngine.playChord({ frets: [null, 3, 2, 0, 1, 0], tuningMidi: GUITAR, instrument: "guitar" });
    expect(r3.voices).toHaveLength(5);
    expect(sources).toHaveLength(5);
  });

  it("voices start at distinct, increasing times inside the strum and never overwrite one another", async () => {
    const { audioEngine } = await import("../audio");
    await audioEngine.playChord({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: GUITAR, instrument: "guitar", humanize: false, speed: 0.1 });
    const times = sources.map((s) => s.startAt!);
    expect(times).toHaveLength(6);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(times).size).toBe(6);
    expect(times[5] - times[0]).toBeCloseTo(0.1, 2);
    expect(new Set(sources).size).toBe(6); // six different source nodes, none shared
  });

  it("muted strings start nothing, a single muted note makes no sound, and an all-muted shape is silent", async () => {
    const { audioEngine } = await import("../audio");
    expect((await audioEngine.playChord({ frets: [null, null, null, null, null, null], tuningMidi: GUITAR })).voices).toHaveLength(0);
    expect((await audioEngine.playNote({ midi: 40, fret: null, isMuted: true })).voices).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it("a played mandolin string sounds both strands; a one-string note is one source", async () => {
    const { audioEngine } = await import("../audio");
    await audioEngine.playNote({ midi: 62, fret: 0, strands: [0, 0], instrument: "guitar" });
    expect(sources).toHaveLength(2);
    sources.length = 0;
    await audioEngine.playNote({ midi: 62, fret: 0, instrument: "guitar" });
    expect(sources).toHaveLength(1);
  });

  it("uses one AudioContext no matter how many times it plays, and a new chord fades out the previous one", async () => {
    const { audioEngine, audioContextManager } = await import("../audio");
    const before = contexts;
    for (let i = 0; i < 12; i++) await audioEngine.playChord({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: GUITAR, instrument: "guitar" });
    expect(contexts - before).toBeLessThanOrEqual(1);
    // earlier chords were stopped (with a fade) when the next one started: only the last chord's voices are still tracked
    expect(audioContextManager.activeVoiceCount()).toBeLessThanOrEqual(6);
    expect(sources.slice(0, 66).every((s) => s.stop.mock.calls.length >= 1)).toBe(true);
  });

  it("stop() fades and stops every voice, including ones still scheduled", async () => {
    const { audioEngine, audioContextManager } = await import("../audio");
    await audioEngine.playChord({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: GUITAR, instrument: "guitar", speed: 0.36 });
    expect(audioContextManager.activeVoiceCount()).toBe(6);
    audioEngine.stop();
    expect(audioContextManager.activeVoiceCount()).toBe(0);
    expect(sources.every((s) => s.stop.mock.calls.length >= 1)).toBe(true);
  });

  it("an arpeggio on a mandolin plays each course as a pair, one course after another", async () => {
    const { audioEngine } = await import("../audio");
    const r = await audioEngine.playArpeggio({ frets: [0, 2, 2, 0], tuningMidi: [55, 62, 69, 76], courses: [[0, 0], [0, 0], [0, 0], [0, 0]], instrument: "guitar", humanize: false });
    expect(r.voices).toHaveLength(8);
    const starts = [...new Set(r.voices.map((v) => Math.round(v.startOffset * 100) / 100))];
    expect(starts).toHaveLength(4);
  });
});

describe("instrument coverage", () => {
  it("every chord instrument builds a model for every chord type without throwing", () => {
    for (const d of chordInstruments()) {
      for (const q of CHORD_QUALITIES) {
        const chord = parseChordSymbol(`C${q.suffix}`);
        expect(() => buildChordModel(chord, d, { inversion: 0 }), `${d.id} C${q.suffix}`).not.toThrow();
      }
    }
  });
});
