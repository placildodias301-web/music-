/**
 * Small shared UI primitives. Styling lives in index.css (tokens + classes);
 * these only standardise structure and accessibility.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Section title row with an optional right-aligned action ("See all"). */
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-base font-bold text-content">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-content-dim">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

/** Centred empty state: icon, headline, one line of help, optional actions. */
export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-glass-strong bg-white/[0.015] px-6 py-8 text-center">
      {icon && <span className="icon-tile tint-violet mb-3 h-11 w-11">{icon}</span>}
      <p className="font-heading text-sm font-bold text-content">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-content-muted">{body}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Accessible confirmation dialog built on the native <dialog> element, so
 * focus trapping, Escape-to-close and the backdrop come from the browser.
 * Replaces window.confirm(), which can't be styled.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        // Escape key: let React state drive closing.
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, not its content).
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="p-6">
        <h2 id="confirm-dialog-title" className="font-heading text-lg font-bold text-content">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-content-muted">{body}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className={destructive ? "btn-danger" : "btn-primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
