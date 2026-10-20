import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Option } from "../../lib/settings/model";
import { ComingSoonBadge } from "./SettingsRows";
import { useFollowAnchor } from "../../lib/useFollowAnchor";

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

/**
 * A settings row that opens a single-choice picker: a bottom sheet on
 * phones, a dropdown anchored to the row on larger screens. Arrow keys move,
 * Enter/Space picks, Escape closes and returns focus to the row.
 */
export function SettingsSelect<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
  badge,
  extra,
  variant = "row",
  id,
}: {
  label: string;
  description?: ReactNode;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  badge?: ReactNode;
  /** Extra content under the options (e.g. a custom-value input). */
  extra?: ReactNode;
  /**
   * "row" = settings list row; "field" = form control that looks like an input;
   * "title" = a heading you can tap ("Acoustic Guitar ▾") with `description` under it.
   */
  variant?: "row" | "field" | "title";
  /** id for the trigger, so an external <label htmlFor> can name it. */
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const rowRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  function openPicker() {
    setRect(rowRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) rowRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    // Focus the selected option when the picker opens.
    const selected = listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? listRef.current?.querySelector<HTMLButtonElement>('[role="radio"]:not([disabled])');
    selected?.focus();
    // The dropdown is positioned from the row's rect; close it if the layout changes.
    const onResize = () => !mobile && setOpen(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, mobile]);

  // Stay attached to the row while the page scrolls (close if the row leaves the screen).
  useFollowAnchor(open && !mobile, rowRef, setRect, () => setOpen(false));

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab" && mobile) {
      e.preventDefault(); // keep focus inside the sheet
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  const list = (
    <div ref={listRef} id={listId} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="py-1.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => {
              onChange(o.value);
              close();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-ns-raised)] focus-visible:bg-[var(--color-ns-raised)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="min-w-0 flex-1">
              <span className={`block text-[0.875rem] ${selected ? "font-bold text-[var(--color-ns-text)]" : "font-medium text-[var(--color-ns-text)]"}`}>{o.label}</span>
              {o.description && <span className="block text-[0.75rem] text-[var(--color-ns-muted)]">{o.description}</span>}
            </span>
            {o.badge && <ComingSoonBadge label={o.badge} />}
            {selected && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-ns-purple-light)]">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        );
      })}
      {extra && <div className="border-t border-[var(--color-ns-border)] px-4 pb-2 pt-3">{extra}</div>}
    </div>
  );

  // Sit right under the row (so it stays attached while scrolling); flip above it when there is no room below.
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 14 : 0;
  const spaceAbove = rect ? rect.top - 14 : 0;
  const openUp = !!rect && spaceBelow < 260 && spaceAbove > spaceBelow;
  const vertical = rect
    ? openUp
      ? { bottom: window.innerHeight - rect.top + 6, maxHeight: Math.min(370, spaceAbove) }
      : { top: rect.bottom + 6, maxHeight: Math.min(370, Math.max(160, spaceBelow)) }
    : {};

  const trigger =
    variant === "field" ? (
      <button
        ref={rowRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
        className="flex w-full items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3.5 py-2.5 text-left text-[0.8125rem] text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] focus-visible:border-[var(--color-ns-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple)]/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? value}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-[var(--color-ns-muted)] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    ) : variant === "title" ? (
      <button
        ref={rowRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? value}`}
        onClick={openPicker}
        className="group -mx-2 -my-1 flex min-w-0 flex-col items-start rounded-xl px-2 py-1 text-left transition-colors hover:bg-[var(--color-ns-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex max-w-full items-center gap-1.5 font-heading text-sm font-bold text-[var(--color-ns-text)]">
          <span className="truncate">{current?.label ?? value}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-[var(--color-ns-purple-light)] transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
        {description && <span className="block max-w-full truncate text-xs text-[var(--color-ns-muted)]">{description}</span>}
      </button>
    ) : null;

  return (
    <>
      {trigger ?? <button
        ref={rowRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ns-purple-light)] ${
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
        <span className="max-w-[45%] truncate text-right text-[0.8438rem] text-[var(--color-ns-muted)]">{current?.label ?? value}</span>
        {!disabled && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-ns-dim)]">
            <path d="m9 6 6 6-6 6" />
          </svg>
        )}
      </button>}

      {open &&
        createPortal(
          mobile ? (
            <div className="fixed inset-0 z-[100] flex items-end" role="dialog" aria-modal="true" aria-label={label}>
              <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={() => close()} />
              <div className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-3xl border-t border-[var(--color-ns-border)] bg-[var(--color-ns-card)] pb-[max(env(safe-area-inset-bottom),12px)] shadow-2xl">
                <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--color-ns-border-strong)]" aria-hidden="true" />
                <p className="px-4 pb-1 pt-3 font-heading text-base font-bold text-[var(--color-ns-text)]">{label}</p>
                {list}
              </div>
            </div>
          ) : (
            <div className="fixed inset-0 z-[100]" role="dialog" aria-label={label}>
              <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default" onClick={() => close()} />
              <div
                className="absolute max-h-[min(370px,calc(100vh-16px))] overflow-y-auto rounded-2xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-card)] shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
                style={
                  rect
                    ? variant === "field"
                      ? { ...vertical, left: rect.left, width: rect.width }
                      : variant === "title"
                      ? { ...vertical, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - 308)), width: 300 }
                      : { ...vertical, left: Math.max(8, rect.right - 300), width: 300 }
                    : undefined
                }
              >
                {list}
              </div>
            </div>
          ),
          document.body
        )}
    </>
  );
}
