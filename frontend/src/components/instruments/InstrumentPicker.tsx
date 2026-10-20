import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useFollowAnchor } from "../../lib/useFollowAnchor";
import { createPortal } from "react-dom";
import { groupByCategory, matchesInstrument, type InstrumentDefinition } from "../../lib/instruments/definitions";

function useIsMobile(): boolean {
  const query = "(max-width: 639px)";
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

const CHEVRON = (open: boolean, cls: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${cls}`}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * Instrument picker for the larger instrument library: grouped by category, searchable, a bottom sheet on phones and
 * a dropdown on larger screens. Same look as the Settings pickers.
 */
export function InstrumentPicker({
  label,
  value,
  definitions,
  onChange,
  variant = "title",
  description,
}: {
  label: string;
  value: string;
  definitions: InstrumentDefinition[];
  onChange: (id: string) => void;
  /** "title" = heading you can tap (Tuner), "field" = compact input-like button (Chords toolbar). */
  variant?: "title" | "field";
  description?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const mobile = useIsMobile();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const listId = useId();
  const current = definitions.find((d) => d.id === value);

  const groups = useMemo(() => groupByCategory(definitions.filter((d) => matchesInstrument(d, query))), [definitions, query]);

  function openPicker() {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setQuery("");
    setOpen(true);
  }
  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onResize = () => !mobile && setOpen(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, mobile]);

  // Stay attached to the trigger while the page scrolls (close if it leaves the screen).
  useFollowAnchor(open && !mobile, triggerRef, setRect, () => setOpen(false));

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = i === -1 ? (e.key === "ArrowDown" ? 0 : items.length - 1) : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  const panel = (
    <div onKeyDown={onKeyDown}>
      <div className="sticky top-0 z-10 border-b border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search instruments"
          aria-label="Search instruments"
          autoFocus={!mobile}
          className="w-full rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2 text-[0.8125rem] text-[var(--color-ns-text)] placeholder:text-[var(--color-ns-dim)] focus-visible:border-[var(--color-ns-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple)]/40"
        />
      </div>
      <div ref={listRef} id={listId} role="radiogroup" aria-label={label} className="py-1">
        {groups.length === 0 && <p className="px-4 py-6 text-center text-xs text-[var(--color-ns-muted)]">No instrument matches “{query}”.</p>}
        {groups.map((g) => (
          <div key={g.category} role="group" aria-label={g.label}>
            <p className="px-4 pb-1 pt-2.5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ns-dim)]">{g.label}</p>
            {g.items.map((d) => {
              const selected = d.id === value;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onChange(d.id);
                    close();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--color-ns-raised)] focus-visible:bg-[var(--color-ns-raised)] focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[0.875rem] ${selected ? "font-bold" : "font-medium"} text-[var(--color-ns-text)]`}>{d.name}</span>
                    <span className="block truncate text-[0.75rem] text-[var(--color-ns-muted)]">{d.blurb}</span>
                  </span>
                  {selected && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-ns-purple-light)]">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const trigger =
    variant === "title" ? (
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${current?.name ?? value}`}
        onClick={openPicker}
        className="group -mx-2 -my-1 flex min-w-0 flex-col items-start rounded-xl px-2 py-1 text-left transition-colors hover:bg-[var(--color-ns-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
      >
        <span className="flex max-w-full items-center gap-1.5 font-heading text-sm font-bold text-[var(--color-ns-text)]">
          <span className="truncate">{current?.name ?? value}</span>
          {CHEVRON(open, "text-[var(--color-ns-purple-light)]")}
        </span>
        {description && <span className="block max-w-full truncate text-xs text-[var(--color-ns-muted)]">{description}</span>}
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${current?.name ?? value}`}
        onClick={openPicker}
        className="flex w-full items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3.5 py-2 text-left text-[0.8125rem] font-semibold text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] focus-visible:border-[var(--color-ns-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple)]/40"
      >
        <span className="min-w-0 flex-1 truncate">{current?.name ?? value}</span>
        {CHEVRON(open, "text-[var(--color-ns-muted)]")}
      </button>
    );

  // Sit right under the trigger (so it stays attached while scrolling); flip above it when there is no room below.
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 14 : 0;
  const spaceAbove = rect ? rect.top - 14 : 0;
  const openUp = !!rect && spaceBelow < 300 && spaceAbove > spaceBelow;
  const vertical = rect
    ? openUp
      ? { bottom: window.innerHeight - rect.top + 6, maxHeight: Math.min(430, spaceAbove) }
      : { top: rect.bottom + 6, maxHeight: Math.min(430, Math.max(160, spaceBelow)) }
    : {};

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          mobile ? (
            <div className="fixed inset-0 z-[100] flex items-end" role="dialog" aria-modal="true" aria-label={label}>
              <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={() => close()} />
              <div className="relative max-h-[82vh] w-full overflow-y-auto rounded-t-3xl border-t border-[var(--color-ns-border)] bg-[var(--color-ns-card)] pb-[max(env(safe-area-inset-bottom),12px)] shadow-2xl">
                <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--color-ns-border-strong)]" aria-hidden="true" />
                <p className="px-4 pb-1 pt-3 font-heading text-base font-bold text-[var(--color-ns-text)]">{label}</p>
                {panel}
              </div>
            </div>
          ) : (
            <div className="fixed inset-0 z-[100]" role="dialog" aria-label={label}>
              <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default" onClick={() => close()} />
              <div
                className="absolute max-h-[min(430px,calc(100vh-16px))] overflow-y-auto rounded-2xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-card)] shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
                style={rect ? { ...vertical, left: Math.max(8, Math.min(rect.left - (variant === "title" ? 8 : 0), window.innerWidth - 328)), width: variant === "field" ? Math.max(rect.width, 280) : 320 } : undefined}
              >
                {panel}
              </div>
            </div>
          ),
          document.body,
        )}
    </>
  );
}
