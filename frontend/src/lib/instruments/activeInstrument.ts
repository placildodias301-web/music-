/**
 * The Tuner and the Chords page describe the same thing — an instrument and the tuning it is in — in two storage formats.
 * These helpers translate between them, so choosing "Guitar · Drop D" on one page selects it on the other, and the chord
 * engine builds shapes from the tuning that was chosen (not just a drawing of it).
 *
 *   Tuner:  { instrumentId, variantId, tuningId, definitionId }
 *   Chords: { definitionId, tuningId: "variantId:presetId", inversion }
 */

import { findInstrument, defaultTuningId, type TunerSelection } from "../tuner/tunings";
import { saveSelection } from "../tuner/selection";
import { loadChordSettings, saveChordSettings, type ChordSettings } from "../chords/model";
import { findDefinition, type InstrumentDefinition } from "./definitions";
import { resolveDefinition } from "./tunerLink";

/** The chord settings that match a Tuner selection, or null when the instrument has no chord view (tabla, timpani, tanpura…). */
export function chordSettingsFromTuner(sel: TunerSelection, current?: ChordSettings): ChordSettings | null {
  const def: InstrumentDefinition = resolveDefinition(sel);
  if (!def.chordSupported || !def.tuner) return null;
  // The harp's chord setting is its type (lever / pedal), which is the tuner's variant.
  const tuningId = def.id === "harp" ? (sel.variantId === "pedal-47" ? "pedal" : "lever") : `${sel.variantId}:${sel.tuningId}`;
  return { definitionId: def.id, tuningId, inversion: current?.definitionId === def.id ? current.inversion : 0 };
}

/** The Tuner selection that matches the chord settings, or null for instruments the Tuner doesn't tune. */
export function tunerSelectionFromChords(settings: ChordSettings): TunerSelection | null {
  const def = findDefinition(settings.definitionId);
  if (!def?.tuner || !def.tunerSupported) return null;
  const inst = findInstrument(def.tuner.instrumentId);
  if (!inst) return null;
  if (def.id === "harp") {
    const variant = inst.variants.find((v) => v.id === (settings.tuningId === "pedal" ? "pedal-47" : "lever-34")) ?? inst.variants[0];
    return { instrumentId: inst.id, variantId: variant.id, tuningId: defaultTuningId(variant), definitionId: def.id };
  }
  const [variantId, presetId] = (settings.tuningId ?? "").split(":");
  const variant = inst.variants.find((v) => v.id === variantId) ?? inst.variants.find((v) => v.id === def.tuner!.variantId) ?? inst.variants[0];
  return { instrumentId: inst.id, variantId: variant.id, tuningId: variant.id === variantId && presetId ? presetId : defaultTuningId(variant), definitionId: def.id };
}

/** Call when the Tuner selection changes: the Chords page opens on the same instrument and tuning. */
export function syncTunerToChords(sel: TunerSelection): void {
  const next = chordSettingsFromTuner(sel, loadChordSettings());
  if (next) saveChordSettings(next);
}

/** Call when the chord settings change: the Tuner opens on the same instrument and tuning. */
export function syncChordsToTuner(settings: ChordSettings): void {
  const next = tunerSelectionFromChords(settings);
  if (next) saveSelection(next);
}
