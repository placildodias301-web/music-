import { useState } from "react";
import type { FormEvent } from "react";
import { AuthErrorNotice, AuthField, AuthInfoNotice, AuthLayout, FooterLink, GoogleButton, OrDivider, PasswordRulesList, PrimaryButton, StrengthMeter } from "../../components/auth/AuthKit";
import { emailError, emailSuggestion, nameError, newPasswordError } from "../../lib/authValidation";
import { focusFirstInvalid, useFinishSignIn, useTouched } from "./authForm";
import { useAuth } from "../../lib/auth";

type Field = "first" | "last" | "email" | "password";

export function Signup() {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const form = useTouched<Field>();
  const { signup, loginWithGoogle } = useAuth();
  const finish = useFinishSignIn();

  const errors: Record<Field, string | null> = {
    first: nameError(first, true, "First name"),
    last: nameError(last, false, "Last name"),
    email: emailError(email),
    password: newPasswordError(password, email),
  };
  const suggestion = emailSuggestion(email);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    form.submit();
    setError(null);
    setCheckEmail(false);
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalid();
      return;
    }
    setBusy(true);
    try {
      const user = await signup({ email, password, firstName: first.trim(), lastName: last.trim() });
      if (user) {
        finish(user);
        return;
      }
      setCheckEmail(true);
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthLayout title="Start for free" subtitle="No credit card needed · 50 AI credits/month included">
      <GoogleButton onClick={() => void onGoogle()} />
      <OrDivider />
      <form noValidate onSubmit={onSubmit} className="space-y-2">
        <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
          <AuthField
            label="First name"
            value={first}
            onChange={setFirst}
            onBlur={() => form.touch("first")}
            error={form.show("first", errors.first)}
            placeholder="Wilbur"
            autoComplete="given-name"
            autoFocus
          />
          <AuthField
            label="Last name"
            value={last}
            onChange={setLast}
            onBlur={() => form.touch("last")}
            error={form.show("last", errors.last)}
            placeholder="Fernandes"
            autoComplete="family-name"
          />
        </div>
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          onBlur={() => form.touch("email")}
          error={form.show("email", errors.email)}
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
        />
        <div>
          <AuthField
            label="Password"
            password
            value={password}
            onChange={setPassword}
            onBlur={() => form.touch("password")}
            error={form.show("password", errors.password)}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
          />
          <StrengthMeter password={password} />
          {password && (
            <div className="mt-3">
              <PasswordRulesList password={password} />
            </div>
          )}
        </div>
        <PrimaryButton busy={busy}>Create free account →</PrimaryButton>
        <p className="text-center text-[0.75rem] leading-relaxed text-[var(--color-ns-dim)]">By creating an account you agree to the Terms of use and Privacy policy.</p>
      </form>
      {error && <AuthErrorNotice>{error}</AuthErrorNotice>}
      {checkEmail && (
        <AuthInfoNotice title="Check your email">
          We sent a link to {email}. Tap it to confirm your account and you'll be signed in.
        </AuthInfoNotice>
      )}
      <FooterLink text="Already have an account?" to="/login" label="Sign in" />
    </AuthLayout>
  );
}
