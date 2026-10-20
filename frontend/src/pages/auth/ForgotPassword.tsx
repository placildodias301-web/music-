import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { AuthErrorNotice, AuthField, AuthInfoNotice, AuthLayout, FooterLink, PrimaryButton } from "../../components/auth/AuthKit";
import { authMessage } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { emailError, emailSuggestion } from "../../lib/authValidation";
import { focusFirstInvalid, useTouched } from "./authForm";

export function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(() => (location.state as { email?: string } | null)?.email ?? "");
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useTouched<"email">();
  const error = emailError(email);
  const suggestion = emailSuggestion(email);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    form.submit();
    setSent(false);
    setFailure(null);
    if (error) {
      focusFirstInvalid();
      return;
    }
    setBusy(true);
    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      const code = sendError && "code" in sendError ? String((sendError as { code?: unknown }).code) : "";
      if (sendError && code !== "user_not_found" && code !== "email_not_confirmed") {
        setFailure(authMessage(sendError, "reset"));
      } else {
        setSent(true);
      }
    } catch (err) {
      setBusy(false);
      setFailure(authMessage(err, "reset"));
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="We'll email a reset link to the address on your account." showLogo={false}>
      <form noValidate onSubmit={onSubmit} className="space-y-2">
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          onBlur={() => form.touch("email")}
          error={form.show("email", error)}
          hint={
            suggestion && (
              <span>
                Did you mean{" "}
                <button type="button" className="font-semibold text-[var(--color-ns-purple-light)] hover:underline" onClick={() => setEmail(suggestion)}>
                  {suggestion}
                </button>
                ?
              </span>
            )
          }
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
        <PrimaryButton busy={busy}>Send link →</PrimaryButton>
      </form>
      {failure && <AuthErrorNotice>{failure}</AuthErrorNotice>}
      {sent && <AuthInfoNotice title="Check your email">If an account uses {email}, a link to set a new password is on its way.</AuthInfoNotice>}
      <FooterLink text="Remembered it?" to="/login" label="Sign in" />
    </AuthLayout>
  );
}
