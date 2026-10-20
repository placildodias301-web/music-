import { useState } from "react";
import { Link } from "react-router-dom";

export interface ErrorBannerProps {
  title: string;
  message: string;
  severity?: "error" | "warning" | "info";
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  requestId?: string;
  technicalDetails?: string;
  role?: "alert" | "status";
  className?: string;
}

/**
 * Sanitizes technical error messages to prevent leaking stack traces, API keys,
 * tokens, or sensitive internal paths to users.
 */
export function sanitizeErrorMessage(raw: string): string {
  if (!raw) return "";
  let clean = raw;
  // Redact JWT tokens
  clean = clean.replace(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, "[token redacted]");
  // Redact Bearer tokens
  clean = clean.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redacted]");
  // Redact common API keys
  clean = clean.replace(/AIza[0-9A-Za-z-_]{35}/g, "[API key redacted]");
  clean = clean.replace(/sk-[A-Za-z0-9_-]{20,}/g, "[API key redacted]");
  clean = clean.replace(/sbp_[A-Za-z0-9_-]{20,}/g, "[API key redacted]");
  // Remove file system absolute paths from stack traces
  clean = clean.replace(/(?:[a-zA-Z]:|\/)[^\s:]+:\d+:\d+/g, "[internal path]");
  // Strip raw V8/Node stack lines
  clean = clean.replace(/^\s*at\s+.*$/gm, "").trim();
  return clean;
}

export function ErrorBanner({
  title,
  message,
  severity = "error",
  actionLabel,
  onAction,
  actionHref,
  secondaryActionLabel,
  onSecondaryAction,
  requestId,
  technicalDetails,
  role,
  className = "",
}: ErrorBannerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isWarning = severity === "warning";
  const defaultRole = isWarning ? "status" : "alert";
  const effectiveRole = role ?? defaultRole;

  const sanitizedDetails = technicalDetails ? sanitizeErrorMessage(technicalDetails) : null;

  return (
    <div
      role={effectiveRole}
      aria-live={effectiveRole === "status" ? "polite" : undefined}
      className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${
        isWarning
          ? "border-amber-500/35 bg-amber-500/10 text-[var(--color-ns-text)]"
          : "border-[var(--color-ns-coral)]/40 bg-[var(--color-ns-coral)]/10 text-[var(--color-ns-text)]"
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${
            isWarning
              ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
              : "border-[var(--color-ns-coral)]/40 bg-[var(--color-ns-coral)]/15 text-[var(--color-ns-coral)]"
          }`}
          aria-hidden="true"
        >
          {isWarning ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-sm font-bold sm:text-base">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-ns-muted)] sm:text-sm">
            {message}
          </p>

          {(actionLabel || secondaryActionLabel) && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              {actionLabel && (
                actionHref ? (
                  <Link
                    to={actionHref}
                    className="inline-flex items-center justify-center rounded-xl bg-[var(--color-ns-purple)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-ns-purple-light)]"
                  >
                    {actionLabel}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={onAction}
                    className="inline-flex items-center justify-center rounded-xl bg-[var(--color-ns-purple)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-ns-purple-light)]"
                  >
                    {actionLabel}
                  </button>
                )
              )}

              {secondaryActionLabel && (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-muted)] transition-all hover:text-[var(--color-ns-text)]"
                >
                  {secondaryActionLabel}
                </button>
              )}
            </div>
          )}

          {(requestId || sanitizedDetails) && (
            <div className="mt-3 pt-2">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                className="text-[0.6875rem] font-semibold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)] underline-offset-2 hover:underline focus:outline-none"
              >
                {detailsOpen ? "Hide technical details" : "Technical details"}
              </button>

              {detailsOpen && (
                <div className="mt-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-3 font-mono text-[0.6875rem] text-[var(--color-ns-muted)]">
                  {requestId && (
                    <p className="font-semibold text-[var(--color-ns-text)]">
                      Request ID: <span className="text-[var(--color-ns-purple-light)]">{requestId}</span>
                    </p>
                  )}
                  {sanitizedDetails && (
                    <p className="mt-1 whitespace-pre-wrap break-all leading-normal">
                      {sanitizedDetails}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
