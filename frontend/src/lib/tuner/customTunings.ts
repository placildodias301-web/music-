/**
 * Saved custom tunings. Persistence sits behind `CustomTuningStore` so the localStorage version
 * can be swapped for an API-backed one when accounts are ready.
 */

import { noteToMidi } from "./notes";
import { findVariant } from "./tunings";
import type { CustomTuning } from "./types";

export interface CustomTuningStore {
  load(): CustomTuning[];
  save(all: CustomTuning[]): void;
}

const KEY = "wilsify:tuner-custom-tunings";
const MAX_SAVED = 50;

export const localStorageStore: CustomTuningStore = {
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      return Array.isArray(raw) ? raw.filter(isCustomTuning) : [];
    } catch {
      return [];
    }
  },
  save(all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_SAVED)));
    } catch {
      // storage full / blocked: the tuning still works this session
    }
  },
};

function isCustomTuning(v: unknown): v is CustomTuning {
  const c = v as CustomTuning;
  return !!c && typeof c.id === "string" && typeof c.name === "string" && typeof c.instrumentId === "string" && typeof c.variantId === "string" && Array.isArray(c.notes) && c.notes.every((n) => typeof n === "string");
}

export const MAX_NAME_LENGTH = 30;
/** MIDI 12 (C0) … 96 (C7): wider than any tuner instrument, narrower than nonsense. */
const MIDI_MIN = 12;
const MIDI_MAX = 96;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Normalised notes ("d#2" → "D#2") when ok. */
  notes: string[];
}

export function validateCustomTuning(
  input: { name: string; instrumentId: string; variantId: string; notes: string[] },
  existing: CustomTuning[] = [],
  editingId?: string,
): ValidationResult {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push("Give the tuning a name.");
  else if (name.length > MAX_NAME_LENGTH) errors.push(`Keep the name to ${MAX_NAME_LENGTH} characters.`);
  else if (existing.some((c) => c.id !== editingId && c.variantId === input.variantId && c.name.toLowerCase() === name.toLowerCase())) errors.push("You already saved a tuning with that name.");

  const variant = findVariant(input.instrumentId, input.variantId);
  if (!variant) errors.push("Pick an instrument first.");
  else if (input.notes.length !== variant.stringCount) errors.push(`${variant.name} needs ${variant.stringCount} notes.`);

  const notes: string[] = [];
  input.notes.forEach((raw, i) => {
    const midi = noteToMidi(raw);
    if (midi === null) errors.push(`String ${i + 1}: "${raw.trim()}" is not a note (use e.g. C#2, Eb3).`);
    else if (midi < MIDI_MIN || midi > MIDI_MAX) errors.push(`String ${i + 1}: ${raw.trim()} is outside the usable range.`);
    else notes.push(raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1));
  });
  return { ok: errors.length === 0, errors, notes: errors.length ? [] : notes };
}

export function newCustomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
