import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Modal confirmation (native <dialog>, so focus is trapped and Escape
 * works). With `requireText`, the confirm button stays disabled until the
 * user types that word — used for deleting the account.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  requireText,
  hideConfirm = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireText?: string;
  /** Information-only dialog: just the cancel/close button. */
  hideConfirm?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTyped("");
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const canConfirm = !requireText || typed.trim() === requireText;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="p-6">
        <h2 id={titleId} className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
          {title}
        </h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--color-ns-muted)]">{children}</div>
        {requireText && (
          <div className="mt-4">
            <label htmlFor={inputId} className="text-[0.7812rem] font-semibold text-[var(--color-ns-text)]">
              Type <span className="font-mono text-[var(--color-ns-red)]">{requireText}</span> to confirm
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="mt-1.5 w-full rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2.5 font-mono text-sm text-[var(--color-ns-text)] focus:border-[var(--color-ns-red)] focus:outline-none"
            />
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel} autoFocus={!requireText}>
            {cancelLabel}
          </button>
          {!hideConfirm && (
            <button type="button" className={destructive ? "btn-danger" : "btn-primary"} disabled={!canConfirm} onClick={onConfirm}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
