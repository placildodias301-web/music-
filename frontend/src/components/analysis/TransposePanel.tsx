import type { ReactNode } from "react";
import { useNotation } from "../../lib/useNotation";
import type { CapoEstimate } from "../../lib/api";
import { shapeShift, soundingShift, transposeKey, NO_TRANSPOSE, type CapoSuggestion, type TransposeSettings } from "../../lib/transpose";

export const CAPO_MAX = 11;
export const CHORDS_ONLY_MAX = 11;
/** Past ±6 semitones pitch-shifted audio starts to sound unnatural. */
export const AUDIO_MAX = 6;

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

interface StepperProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  disabled?: boolean;
  busy?: boolean;
  onChange: (value: number) => void;
}

function Stepper({ label, value, display, min, max, disabled, busy, onChange }: StepperProps) {
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] transition-colors hover:border-[var(--color-ns-purple)]/50 hover:text-[var(--color-ns-text)] disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className={btn} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Lower ${label}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <span
        className={`flex min-w-[3.5rem] items-center justify-center gap-1.5 font-heading text-2xl font-extrabold tabular-nums ${
          value === 0 ? "text-[var(--color-ns-muted)]" : "text-[var(--color-ns-text)]"
        }`}
        aria-live="polite"
        aria-label={`${label}: ${display}`}
      >
        {busy && <span className="spinner" />}
        {display}
      </span>
      <button type="button" className={btn} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`Raise ${label}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 15 12 9 18 15" />
        </svg>
      </button>
    </div>
  );
}

function Control({ title, hint, accent, children, footer }: { title: string; hint: string; accent: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        <span className="text-sm font-bold text-[var(--color-ns-text)]">{title}</span>
      </div>
      <p className="mt-1 min-h-[2rem] text-[0.6875rem] leading-snug text-[var(--color-ns-muted)]">{hint}</p>
      <div className="mt-3">{children}</div>
      {footer && <div className="mt-2 text-center text-[0.6562rem] text-[var(--color-ns-dim)]">{footer}</div>}
    </div>
  );
}

interface TransposePanelProps {
  settings: TransposeSettings;
  onChange: (next: TransposeSettings) => void;
  /** Detected key of the original recording, e.g. "G# Minor". */
  originalKey: string;
  audioAvailable: boolean;
  /** Audio shift being prepared on the server (null when idle). */
  audioPending: number | null;
  audioError: string | null;
  suggestions: CapoSuggestion[];
  /** What the analysis heard about a capo (advice, not certainty). */
  detectedCapo?: CapoEstimate;
}

/**
 * Transpose & capo controls. Unlike a single "transpose" number, the three
 * controls stay separate so it's always clear what you'll hear (sounding
 * key) and what you'll play (chord shapes + capo fret).
 */
export function TransposePanel({ settings, onChange, originalKey, audioAvailable, audioPending, audioError, suggestions, detectedCapo }: TransposePanelProps) {
  const displayKey = useNotation(originalKey).key;
  const sounding = soundingShift(settings);
  const shapes = shapeShift(settings);
  const changed = settings.capo !== 0 || settings.chordsOnly !== 0 || settings.audio !== 0;
  const best = suggestions[0];
  const current = suggestions.find((s) => s.capo === settings.capo);

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Transpose & Capo</h2>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">Every chord on this page — timeline, voicings and exports — follows these settings.</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(NO_TRANSPOSE)}
          disabled={!changed}
          className="rounded-lg border border-[var(--color-ns-border)] px-3 py-1.5 text-[0.6875rem] font-semibold text-[var(--color-ns-muted)] transition-colors hover:text-[var(--color-ns-text)] disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      {/* What you hear vs what you play */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-ns-cyan)]/30 bg-[var(--color-ns-cyan)]/[0.07] px-4 py-3">
          <p className="text-[0.6562rem] font-semibold uppercase tracking-wider text-[var(--color-ns-cyan)]">You hear</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-[var(--color-ns-text)]">{displayKey(transposeKey(originalKey, sounding))}</p>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            {sounding === 0 ? "Original key" : `${signed(sounding)} semitone${Math.abs(sounding) === 1 ? "" : "s"} from ${displayKey(originalKey)}`}
            {settings.chordsOnly !== 0 && settings.audio === 0 ? " · recording still in the original key" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-ns-purple)]/35 bg-[var(--color-ns-purple)]/[0.08] px-4 py-3">
          <p className="text-[0.6562rem] font-semibold uppercase tracking-wider text-[var(--color-ns-purple-light)]">You play</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-[var(--color-ns-text)]">
            {displayKey(transposeKey(originalKey, shapes))} shapes
          </p>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            {settings.capo === 0 ? "No capo" : `Capo on fret ${settings.capo}`}
            {current ? ` · ${Math.round(current.openShare * 100)}% open chords` : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Control title="Capo" hint="Same sound, easier shapes — chords are shown as you'd fret them." accent="var(--color-ns-purple-light)">
          <Stepper
            label="capo"
            value={settings.capo}
            display={settings.capo === 0 ? "Off" : String(settings.capo)}
            min={0}
            max={CAPO_MAX}
            onChange={(capo) => onChange({ ...settings, capo })}
          />
        </Control>

        <Control title="Chords only" hint="Renames the chords into a new key. The recording plays unchanged." accent="var(--color-ns-amber)">
          <Stepper
            label="chords-only transpose"
            value={settings.chordsOnly}
            display={signed(settings.chordsOnly)}
            min={-CHORDS_ONLY_MAX}
            max={CHORDS_ONLY_MAX}
            onChange={(chordsOnly) => onChange({ ...settings, chordsOnly })}
          />
        </Control>

        <Control
          title="Audio and chords"
          hint="Re-pitches the recording too, at the same tempo, so it stays in sync."
          accent="var(--color-ns-cyan)"
          footer={
            !audioAvailable ? (
              "Needs the song's audio from this session"
            ) : audioError ? (
              <span className="text-[var(--color-ns-coral)]">{audioError}</span>
            ) : audioPending !== null ? (
              `Re-pitching audio to ${signed(audioPending)}…`
            ) : null
          }
        >
          <Stepper
            label="audio and chords transpose"
            value={audioPending ?? settings.audio}
            display={signed(audioPending ?? settings.audio)}
            min={-AUDIO_MAX}
            max={AUDIO_MAX}
            disabled={!audioAvailable}
            busy={audioPending !== null}
            onChange={(audio) => onChange({ ...settings, audio })}
          />
        </Control>
      </div>

      {detectedCapo?.detected && detectedCapo.fret > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-ns-purple)]/40 bg-[var(--color-ns-purple)]/10 p-3 text-xs text-[var(--color-ns-muted)]" role="status">
          <p className="font-semibold text-[var(--color-ns-text)]">
            Likely capo {detectedCapo.fret}
            <span className="ml-2 font-normal text-[var(--color-ns-muted)]">{Math.round(detectedCapo.confidence * 100)}% sure</span>
          </p>
          <p className="mt-1">
            {detectedCapo.shapeKey && detectedCapo.soundingKey
              ? `Play the shapes in ${detectedCapo.shapeKey} with the capo on fret ${detectedCapo.fret}; it sounds in ${detectedCapo.soundingKey}.`
              : `Chords are shown as the shapes to play with the capo on fret ${detectedCapo.fret}.`}{" "}
            {detectedCapo.evidence?.length ? `(${detectedCapo.evidence.join("; ")}.)` : null}
          </p>
          <p className="mt-1 text-[var(--color-ns-dim)]">A capo can't be heard directly — if this is wrong, pick another below or press Reset.</p>
        </div>
      )}

      {best && best.openShare > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[0.6875rem] font-semibold text-[var(--color-ns-muted)]">Easiest capo:</span>
          {suggestions.map((s) => {
            const active = s.capo === settings.capo;
            return (
              <button
                key={s.capo}
                type="button"
                onClick={() => onChange({ ...settings, capo: s.capo })}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-[0.6875rem] font-semibold transition-colors ${
                  active
                    ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-text)]"
                    : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-purple)]/50 hover:text-[var(--color-ns-text)]"
                }`}
              >
                {s.capo === 0 ? "No capo" : `Capo ${s.capo}`}
                <span className="ml-1.5 font-normal opacity-75">{Math.round(s.openShare * 100)}% open</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
