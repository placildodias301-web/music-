import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFollowAnchor } from "../lib/useFollowAnchor";

export interface CustomSelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  group?: string;
}

export interface CustomSelectProps<T extends string | number> {
  value: T;
  options: CustomSelectOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * "field" = compact standard toolbar selector (h-9, 36px, rounded-xl);
   * "row" = settings-style row picker;
   * "title" = larger heading trigger.
   */
  variant?: "field" | "row" | "title";
  /** Optional custom trigger render function */
  renderTrigger?: (current: CustomSelectOption<T> | undefined, open: boolean) => ReactNode;
  width?: string;
}

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  placeholder = "Select...",
  disabled = false,
  className = "",
  variant = "field",
  renderTrigger,
  width,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value);

  function openPicker() {
    if (disabled) return;
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const selected =
      listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
      listRef.current?.querySelector<HTMLButtonElement>('[role="option"]:not([disabled])');
    selected?.focus();

    const onResize = () => setOpen(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Stay attached to trigger while scrolling
  useFollowAnchor(open, triggerRef, setRect, () => setOpen(false));

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not([disabled])') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  // Calculate popover positioning
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 12 : 0;
  const spaceAbove = rect ? rect.top - 12 : 0;
  const openUp = !!rect && spaceBelow < 220 && spaceAbove > spaceBelow;
  const vertical = rect
    ? openUp
      ? { bottom: window.innerHeight - rect.top + 6, maxHeight: Math.min(320, spaceAbove) }
      : { top: rect.bottom + 6, maxHeight: Math.min(320, Math.max(160, spaceBelow)) }
    : {};

  // Group options if any option specifies group
  const hasGroups = options.some((o) => o.group);
  const groups: { name: string; items: CustomSelectOption<T>[] }[] = [];
  if (hasGroups) {
    const map = new Map<string, CustomSelectOption<T>[]>();
    for (const opt of options) {
      const g = opt.group ?? "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(opt);
    }
    for (const [name, items] of map.entries()) {
      groups.push({ name, items });
    }
  }

  function renderOptionButton(o: CustomSelectOption<T>) {
    const selected = o.value === value;
    return (
      <button
        key={String(o.value)}
        type="button"
        role="option"
        aria-selected={selected}
        aria-checked={selected}
        disabled={o.disabled}
        onClick={() => {
          onChange(o.value);
          close();
        }}
        className={`flex w-full items-center justify-between gap-2.5 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          selected
            ? "bg-purple-600/20 font-semibold text-purple-300"
            : "text-slate-100 hover:bg-white/10 focus-visible:bg-white/10"
        } focus-visible:outline-none`}
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="block truncate">{o.label}</span>
          {o.description && (
            <span className="block truncate text-[0.6875rem] text-slate-400">{o.description}</span>
          )}
        </span>
        {o.badge}
        {selected && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-purple-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
    );
  }

  const dropdownMenu = (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={label ?? placeholder}
      onKeyDown={onKeyDown}
      className="py-1.5 focus:outline-none"
    >
      {hasGroups
        ? groups.map((g) => (
            <div key={g.name} className="py-1">
              <div className="px-3 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">
                {g.name}
              </div>
              {g.items.map((o) => renderOptionButton(o))}
            </div>
          ))
        : options.map((o) => renderOptionButton(o))}
    </div>
  );

  return (
    <>
      {renderTrigger ? (
        <div onClick={openPicker}>{renderTrigger(current, open)}</div>
      ) : variant === "title" ? (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={openPicker}
          className={`group -mx-2 -my-1 flex min-w-0 flex-col items-start rounded-xl px-2 py-1 text-left transition-colors hover:bg-[var(--color-ns-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-amber)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
          <span className="flex max-w-full items-center gap-1.5 font-heading text-sm font-bold text-[var(--color-ns-text)]">
            <span className="truncate">{current?.label ?? placeholder}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 text-[var(--color-ns-muted)] transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label ?? current?.label ?? placeholder}
          onClick={openPicker}
          className={`flex h-9 items-center justify-between gap-2 rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3 text-left text-xs font-medium text-[var(--color-ns-text)] transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] focus-visible:border-[var(--color-ns-amber)]/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ns-amber)]/40 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
          style={{ width: width ?? undefined }}
        >
          <span className="min-w-0 flex-1 truncate">{current?.label ?? placeholder}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-[var(--color-ns-muted)] transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[120]" role="dialog" aria-label={label ?? "Select option"}>
            <button
              type="button"
              aria-label="Close"
              tabIndex={-1}
              className="absolute inset-0 cursor-default bg-transparent"
              onClick={() => close()}
            />
            <div
              className="absolute overflow-y-auto rounded-xl border border-white/15 bg-[#0E121E] bg-opacity-100 shadow-[0_16px_40px_rgba(0,0,0,0.85)] z-50 focus:outline-none"
              style={
                rect
                  ? {
                      ...vertical,
                      left: Math.max(8, Math.min(rect.left, window.innerWidth - (width ? parseInt(width) || 240 : Math.max(rect.width, 180)) - 12)),
                      width: Math.max(rect.width, width ? parseInt(width) || 180 : 180),
                      minWidth: "160px",
                    }
                  : undefined
              }
            >
              {dropdownMenu}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
