/** Remembers the instrument / strings / tuning the player picked. */

import { CHROMATIC_ID, DEFAULT_SELECTION, findInstrument, findVariant, type TunerSelection } from "./tunings";

const KEY = "wilsify:tuner-selection";
const LEGACY_KEY = "wilsify:tuner-instrument";

/** Old single-dropdown ids → the new hierarchy. */
const LEGACY: Record<string, TunerSelection> = {
  guitar: { instrumentId: "guitar", variantId: "acoustic-6", tuningId: "standard" },
  "electric-guitar": { instrumentId: "guitar", variantId: "electric-6", tuningId: "standard" },
  bass: { instrumentId: "bass", variantId: "bass-4", tuningId: "standard" },
  violin: { instrumentId: "violin", variantId: "violin-4", tuningId: "standard" },
  mandolin: { instrumentId: "mandolin", variantId: "mandolin-8", tuningId: "standard" },
  chromatic: { instrumentId: CHROMATIC_ID, variantId: "", tuningId: "" },
};

function valid(sel: TunerSelection): boolean {
  if (sel.instrumentId === CHROMATIC_ID) return true;
  return !!findInstrument(sel.instrumentId) && findVariant(sel.instrumentId, sel.variantId)?.id === sel.variantId;
}

/** `firstVisitGuitarTuning`: the guitar tuning chosen in Settings, used until the player picks something here. */
export function loadSelection(firstVisitGuitarTuning?: string): TunerSelection {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const sel = JSON.parse(raw) as TunerSelection;
      if (sel && typeof sel.instrumentId === "string" && typeof sel.variantId === "string" && typeof sel.tuningId === "string" && valid(sel)) {
        return typeof sel.definitionId === "string" ? sel : { instrumentId: sel.instrumentId, variantId: sel.variantId, tuningId: sel.tuningId };
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && LEGACY[legacy]) return LEGACY[legacy];
  } catch {
    // storage unavailable — default
  }
  return firstVisitGuitarTuning ? { ...DEFAULT_SELECTION, tuningId: firstVisitGuitarTuning } : DEFAULT_SELECTION;
}

export function saveSelection(sel: TunerSelection) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sel));
  } catch {
    // not remembered — fine
  }
}
