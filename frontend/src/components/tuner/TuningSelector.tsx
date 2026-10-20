import { SettingsSelect } from "../settings/SettingsSelect";
import type { Option } from "../../lib/settings/model";
import type { TunerVariant, TuningPreset } from "../../lib/tuner/types";

export const NEW_CUSTOM = "__new-custom__";
const FIELD_LABEL = "mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]";

const CATEGORY_LABEL: Record<string, string> = {
  standard: "Standard",
  drop: "Drop",
  open: "Open",
  down: "Tuned down",
  up: "Tuned up",
  alternate: "Alternate",
  custom: "Your tunings",
};

/** Second and third levels: string count / variant, then the tuning. Compact field-style pickers. */
export function TuningSelector({
  variants,
  variantId,
  onVariant,
  tunings,
  tuningId,
  onTuning,
  onNewCustom,
  noteLabel,
  variantLabel = "Strings",
  describe,
  allowCustom = true,
  customLabel = "Custom tuning…",
  customDescription = "Set your own notes and save them",
}: {
  variants: TunerVariant[];
  variantId: string;
  onVariant: (id: string) => void;
  tunings: TuningPreset[];
  tuningId: string;
  onTuning: (id: string) => void;
  onNewCustom: () => void;
  noteLabel: (note: string) => string;
  /** What the first selector is called ("Strings", "Size", "Harp type"). */
  variantLabel?: string;
  /** Replaces the "Standard · E A D…" line under each tuning (harps have too many strings to list). */
  describe?: (t: TuningPreset) => string;
  /** Harps set lever/pedal positions instead of typing notes, so they have no "Custom tuning…" entry. */
  allowCustom?: boolean;
  customLabel?: string;
  customDescription?: string;
}) {
  const variantOptions: Option<string>[] = variants.map((v) => ({ value: v.id, label: v.name }));
  const tuningOptions: Option<string>[] = [
    ...tunings.map((t) => ({ value: t.id, label: t.name, description: describe ? describe(t) : `${CATEGORY_LABEL[t.category]} · ${t.strings.map((s) => noteLabel(s.note)).join(" ")}` })),
    ...(allowCustom ? [{ value: NEW_CUSTOM, label: customLabel, description: customDescription }] : []),
  ];
  return (
    <div className="relative mb-4 grid gap-2 sm:grid-cols-2">
      {variants.length > 1 && (
        <div>
          <span className={FIELD_LABEL}>{variantLabel}</span>
          <SettingsSelect variant="field" label={variantLabel} value={variantId} options={variantOptions} onChange={onVariant} />
        </div>
      )}
      <div className={variants.length > 1 ? "" : "sm:col-span-2"}>
        <span className={FIELD_LABEL}>Tuning</span>
        <SettingsSelect
          variant="field"
          label="Tuning"
          value={tuningId}
          options={tuningOptions}
          onChange={(v) => (v === NEW_CUSTOM ? onNewCustom() : onTuning(v))}
        />
      </div>
    </div>
  );
}
