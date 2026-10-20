import { useEffect, useId, useRef, useState } from "react";
import type { ClipboardEvent, InputHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../Logo";
import { OTP_LENGTH, passwordRules, passwordStrength } from "../../lib/authValidation";

/* ─── Page shell ─────────────────────────────────────────────────────── */

/**
 * Full-screen auth page: dimmed brand backdrop, one centred card with the
 * logo, a close button (Escape works too), title and subtitle.
 */
export function AuthLayout({ title, subtitle, children, showLogo = true }: { title: string; subtitle?: ReactNode; children: ReactNode; showLogo?: boolean }) {
  const navigate = useNavigate();
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate("/studio"));

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-clip bg-[var(--color-ns-bg)] px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[var(--color-ns-purple)]/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[var(--color-ns-cyan)]/10 blur-3xl" />
      <main className="relative w-full max-w-[420px] rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] sm:p-8">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)] transition-colors hover:text-[var(--color-ns-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        {showLogo && (
          <Link to="/studio" className="mb-5 inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]" aria-label="Wilsify AI home">
            <Logo size={34} withText />
          </Link>
        )}
        <h1 className="pr-10 font-heading text-[1.875rem] font-bold leading-tight tracking-tight text-[var(--color-ns-text)]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--color-ns-muted)]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

/* ─── Fields ─────────────────────────────────────────────────────────── */

const INPUT =
  "h-12 w-full rounded-xl border bg-[var(--color-ns-raised)] px-4 text-[0.9375rem] text-[var(--color-ns-text)] placeholder:text-[var(--color-ns-dim)] transition-colors focus:outline-none focus:ring-2";

function ErrorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" className="mt-px shrink-0">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M12 7v6M12 16.5v.01" stroke="var(--color-ns-card)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown in red under the field (only pass it once the field has been touched or submitted). */
  error?: string | null;
  hint?: ReactNode;
  /** Password field: adds show/hide and a Caps Lock warning. */
  password?: boolean;
}

export function AuthField({ label, value, onChange, error, hint, password, type, ...rest }: FieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const msgId = `${id}-msg`;
  const describedBy = error || hint || caps ? msgId : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-semibold text-[var(--color-ns-muted)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={password ? (show ? "text" : "password") : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => password && setCaps(e.getModifierState("CapsLock"))}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${INPUT} ${password ? "pr-12" : ""} ${
            error
              ? "border-[var(--color-ns-red)] focus:ring-[var(--color-ns-red)]/30"
              : "border-[var(--color-ns-border)] focus:border-[var(--color-ns-purple)] focus:ring-[var(--color-ns-purple)]/25"
          }`}
          {...rest}
          onBlur={(e) => {
            setCaps(false);
            rest.onBlur?.(e);
          }}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--color-ns-dim)] hover:text-[var(--color-ns-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {show ? (
                <>
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
                </>
              ) : (
                <>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
      {/* One line is always reserved for the message, so an error appearing on
          blur never shifts the submit button out from under a click. */}
      <div id={msgId} aria-live="polite" className="min-h-[1.625rem] pt-1.5">
        {error ? (
          <p className="flex items-start gap-1.5 text-[0.8125rem] text-[var(--color-ns-red)]">
            <ErrorIcon />
            {error}
          </p>
        ) : caps ? (
          <p className="text-[0.8125rem] text-[var(--color-ns-amber)]">Caps Lock is on.</p>
        ) : hint ? (
          <div className="text-[0.8125rem] text-[var(--color-ns-dim)]">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Bits ───────────────────────────────────────────────────────────── */

export function PrimaryButton({ children, disabled, busy }: { children: ReactNode; disabled?: boolean; busy?: boolean }) {
  return (
    <button type="submit" disabled={disabled || busy} className="btn-primary h-12 w-full text-[0.9375rem]">
      {busy ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[0.9375rem] font-semibold text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
      </svg>
      Continue with Google
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[0.75rem] text-[var(--color-ns-dim)]" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-[var(--color-ns-border)]" />
      or
      <span className="h-px flex-1 bg-[var(--color-ns-border)]" />
    </div>
  );
}

/** Three-segment strength meter with a label. */
export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  // Never rate a password above "Weak" while it still misses a required rule.
  const raw = passwordStrength(password);
  const meetsRules = passwordRules(password).every((r) => r.ok);
  const { score, label } = meetsRules || raw.score === 0 ? raw : { score: 1 as const, label: "Weak" as const };
  const color = score >= 3 ? "bg-[var(--color-ns-mint)]" : score === 2 ? "bg-[var(--color-ns-mint)]" : score === 1 ? "bg-[var(--color-ns-amber)]" : "bg-[var(--color-ns-red)]";
  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= Math.max(score, password ? 1 : 0) ? color : "bg-[var(--color-ns-border)]"}`} />
        ))}
      </div>
      <span className="w-16 text-right text-[0.75rem] font-semibold text-[var(--color-ns-muted)]">
        <span className="sr-only">Password strength: </span>
        {label}
      </span>
    </div>
  );
}

/** Live checklist of the password rules. */
export function PasswordRulesList({ password }: { password: string }) {
  return (
    <ul className="space-y-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4" aria-label="Password requirements">
      {passwordRules(password).map((r) => (
        <li key={r.id} className="flex items-center gap-2.5 text-[0.875rem] text-[var(--color-ns-muted)]">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${r.ok ? "bg-[var(--color-ns-mint)] text-[var(--color-ns-bg)]" : "bg-[var(--color-ns-border-strong)]"}`}
            aria-hidden="true"
          >
            {r.ok && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
          {r.label}
          <span className="sr-only">{r.ok ? "— done" : "— not yet"}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Six one-character boxes: typing moves forward, Backspace moves back,
 * arrow keys move, and pasting a whole code fills every box.
 */
export function OtpInput({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setAt(i: number, d: string) {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, OTP_LENGTH));
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, "");
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const code = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!code) return;
    e.preventDefault();
    onChange(code);
    refs.current[Math.min(code.length, OTP_LENGTH - 1)]?.focus();
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Six-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, "").slice(-1);
            setAt(i, ch);
            if (ch && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          className={`h-14 w-full min-w-0 rounded-xl border bg-[var(--color-ns-raised)] text-center font-heading text-[1.375rem] font-bold text-[var(--color-ns-text)] transition-colors focus:outline-none focus:ring-2 ${
            invalid ? "border-[var(--color-ns-red)] focus:ring-[var(--color-ns-red)]/30" : "border-[var(--color-ns-border)] focus:border-[var(--color-ns-purple)] focus:ring-[var(--color-ns-purple)]/25"
          }`}
        />
      ))}
    </div>
  );
}

/** Server-side failure on submit (wrong password, email taken, offline...). */
export function AuthErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-[var(--color-ns-coral)]/40 bg-[var(--color-ns-coral)]/10 p-3.5 text-[0.8125rem] leading-relaxed text-[var(--color-ns-text)]">
      {children}
    </div>
  );
}

/** Shown for options that aren't live yet (Google sign-in, password reset). */
export function ComingSoonNotice({ children }: { children: ReactNode }) {
  return <AuthInfoNotice title="Coming soon">{children}</AuthInfoNotice>;
}

/** Neutral status after a submit ("check your email"), with a way back to sign in. */
export function AuthInfoNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="mt-4 rounded-xl border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 p-3.5 text-[0.8125rem] leading-relaxed text-[var(--color-ns-text)]">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-[var(--color-ns-muted)]">{children}</p>
      <Link to="/login" className="mt-2 inline-block font-semibold text-[var(--color-ns-purple-light)] hover:underline">
        Back to sign in →
      </Link>
    </div>
  );
}

export function FooterLink({ text, to, label }: { text: string; to: string; label: string }) {
  return (
    <p className="mt-5 text-center text-[0.875rem] text-[var(--color-ns-muted)]">
      {text}{" "}
      <Link to={to} className="font-semibold text-[var(--color-ns-purple-light)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]">
        {label}
      </Link>
    </p>
  );
}
