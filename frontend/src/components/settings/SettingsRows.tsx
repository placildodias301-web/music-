import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const ROW_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ns-purple-light)]";

export function ComingSoonBadge({ label = "Coming soon" }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 px-2 py-0.5 text-[0.6562rem] font-semibold text-[var(--color-ns-amber)]">
      {label}
    </span>
  );
}

/** Small grey label above a card of rows. */
export function SettingsSection({ title, children, note }: { title?: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section>
      {title && <h2 className="mb-2 px-1 text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">{title}</h2>}
      <div className="divide-y divide-[var(--color-ns-border)] overflow-hidden rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)]">
        {children}
      </div>
      {note && <p className="mt-2 px-1 text-[0.75rem] leading-relaxed text-[var(--color-ns-dim)]">{note}</p>}
    </section>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-ns-dim)]">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

interface RowProps {
  label: ReactNode;
  value?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Navigate to a route. */
  to?: string;
  /** Or run an action (opens a picker, dialog…). */
  onClick?: () => void;
  /** External link (mailto:, https:). */
  href?: string;
  disabled?: boolean;
  /** Shown instead of the chevron, e.g. "Coming soon". */
  badge?: ReactNode;
  /** Hide the chevron (pure value rows). */
  plain?: boolean;
  ariaLabel?: string;
}

/** Bold label on the left, grey value + chevron on the right. */
export function SettingsRow({ label, value, description, icon, to, onClick, href, disabled, badge, plain, ariaLabel }: RowProps) {
  const inner = (
    <>
      {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.875rem] font-semibold text-[var(--color-ns-text)]">{label}</span>
        {description && <span className="mt-0.5 block text-[0.7812rem] leading-snug text-[var(--color-ns-muted)]">{description}</span>}
      </span>
      {value !== undefined && value !== null && (
        <span className="max-w-[45%] truncate text-right text-[0.8438rem] text-[var(--color-ns-muted)]">{value}</span>
      )}
      {badge ?? (!plain && !disabled && (to || onClick || href) ? <Chevron /> : null)}
    </>
  );
  const base = `flex w-full items-center gap-3 px-4 py-3.5 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
  const interactive = `${base} transition-colors hover:bg-[var(--color-ns-raised)] ${ROW_FOCUS}`;

  if (disabled || (!to && !onClick && !href)) {
    return (
      <div className={base} aria-disabled={disabled || undefined}>
        {inner}
      </div>
    );
  }
  if (to) {
    return (
      <Link to={to} className={interactive} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={interactive} aria-label={ariaLabel} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={interactive} aria-label={ariaLabel}>
      {inner}
    </button>
  );
}

/** Title + grey description, purple pill switch on the right. */
export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  badge,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${ROW_FOCUS} ${
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-[var(--color-ns-raised)]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--color-ns-text)]">
          {label}
          {badge}
        </span>
        {description && <span className="mt-0.5 block text-[0.7812rem] leading-snug text-[var(--color-ns-muted)]">{description}</span>}
      </span>
      <SwitchTrack checked={checked} />
    </button>
  );
}

/** The pill switch itself (decorative — the parent button carries role="switch"). */
export function SwitchTrack({ checked, tone = "accent" }: { checked: boolean; tone?: "accent" | "mint" }) {
  const on = tone === "mint" ? "bg-[var(--color-ns-mint)]" : "bg-[var(--color-ns-purple)]";
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked ? `border-transparent ${on}` : "border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)]"
      }`}
    >
      <span
        className={`absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-150 ${checked ? "left-[22px]" : "left-[2px]"}`}
      />
    </span>
  );
}

/** A labelled range slider row (A4 reference, volume). */
export function SettingsSlider({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  trailing,
}: {
  label: string;
  description?: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-semibold text-[var(--color-ns-text)]">{label}</span>
          {description && <span className="mt-0.5 block text-[0.7812rem] leading-snug text-[var(--color-ns-muted)]">{description}</span>}
        </span>
        <span className="font-mono text-[0.8125rem] tabular-nums text-[var(--color-ns-muted)]">{format(value)}</span>
        {trailing}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ns-range mt-3 w-full"
        style={{ "--pct": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

/** Red-outlined destructive action. */
export function DangerButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl border border-[var(--color-ns-red)]/60 px-4 py-3.5 text-[0.875rem] font-semibold text-[var(--color-ns-red)] transition-colors hover:bg-[var(--color-ns-red)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-red)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Multi-select chips (instruments, genres). */
export function ChipGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])}
            className={`rounded-full border px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] ${
              on
                ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-text)]"
                : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            {on && <span aria-hidden="true">✓ </span>}
            {opt}
          </button>
        );
      })}
    </div>
  );
}
