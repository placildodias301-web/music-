/** Connects the shared instrument list to the tuner's tuning data and selection. */

import { CHROMATIC_ID, defaultTuningId, findInstrument, type TunerSelection } from "../tuner/tunings";
import { INSTRUMENTS_DEFINITIONS, findDefinition, tunerInstruments, type InstrumentDefinition } from "./definitions";

/** The list entry a saved selection stands for (e.g. "Acoustic Guitar" vs "Guitar", "Organ" vs "Piano"). */
export function resolveDefinition(sel: TunerSelection): InstrumentDefinition {
  const picked = findDefinition(sel.definitionId);
  if (sel.instrumentId === CHROMATIC_ID) {
    // A saved Piano or Marimba (no longer in the Tuner's list) opens as Chromatic.
    return picked && !picked.tuner && tunerInstruments().includes(picked) ? picked : findDefinition("chromatic")!;
  }
  const fits = (d: InstrumentDefinition) => d.tuner?.instrumentId === sel.instrumentId && (!d.tuner.variantId || d.tuner.variantId === sel.variantId);
  if (picked && fits(picked)) return picked;
  return (
    INSTRUMENTS_DEFINITIONS.find(fits) ??
    INSTRUMENTS_DEFINITIONS.find((d) => d.tuner?.instrumentId === sel.instrumentId) ??
    findDefinition("chromatic")!
  );
}

/** The selection for choosing `def` in the instrument picker. */
export function selectionForDefinition(def: InstrumentDefinition): TunerSelection {
  if (!def.tuner) return { instrumentId: CHROMATIC_ID, variantId: "", tuningId: "", definitionId: def.id };
  const inst = findInstrument(def.tuner.instrumentId);
  if (!inst) return { instrumentId: CHROMATIC_ID, variantId: "", tuningId: "", definitionId: "chromatic" };
  const variant = inst.variants.find((v) => v.id === def.tuner!.variantId) ?? inst.variants[0];
  return { instrumentId: inst.id, variantId: variant.id, tuningId: defaultTuningId(variant), definitionId: def.id };
}
