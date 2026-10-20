import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fullName, type User } from "../../lib/auth";
import { useSettings } from "../../lib/settings/settingsContext";

/**
 * After sign-in / sign-up: show the account's name in the app, then go back
 * to the page that sent the user to /login (or Home).
 */
export function useFinishSignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { update } = useSettings();
  return (user: User) => {
    update("profile", { displayName: fullName(user) });
    // `?from=` comes back from Google sign-in; only follow in-app paths.
    const from = (location.state as { from?: string } | null)?.from ?? new URLSearchParams(location.search).get("from");
    const safe = from && from.startsWith("/") && !from.startsWith("//") && from !== "/login";
    navigate(safe ? from : "/studio", { replace: true });
  };
}

/**
 * Error display policy shared by the auth forms: a field shows its error
 * once it has been left (blurred) or the form was submitted — never while
 * the user is still typing their first attempt.
 */
export function useTouched<K extends string>() {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  return {
    submitted,
    show: (field: K, error: string | null) => (touched[field] || submitted ? error : null),
    touch: (field: K) => setTouched((t) => ({ ...t, [field]: true })),
    submit: () => setSubmitted(true),
  };
}

/** After a failed submit, move focus to the first field with an error. */
export function focusFirstInvalid() {
  window.setTimeout(() => document.querySelector<HTMLInputElement>('main [aria-invalid="true"]')?.focus(), 0);
}
