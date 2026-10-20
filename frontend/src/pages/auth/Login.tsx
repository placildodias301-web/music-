import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthErrorNotice, AuthField, AuthInfoNotice, AuthLayout, FooterLink, GoogleButton, OrDivider, PrimaryButton } from "../../components/auth/AuthKit";
import { useAuth } from "../../lib/auth";
import { emailError, emailSuggestion } from "../../lib/authValidation";
import { focusFirstInvalid, useFinishSignIn, useTouched } from "./authForm";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useTouched<"email" | "password">();
  const { user, configError, login, loginWithGoogle } = useAuth();
  const location = useLocation();
  const redirectMessage = (location.state as { message?: string } | null)?.message ?? null;
  const finish = useFinishSignIn();

  // Back from Google (or already signed in): finish signing in once the account has loaded.
  useEffect(() => {
    if (user) finish(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `finish` is rebuilt every render
  }, [user]);

  const errors = { email: emailError(email), password: password ? null : "Enter your password." };
  const suggestion = emailSuggestion(email);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    form.submit();
    setError(null);
    if (errors.email || errors.password) {
      focusFirstInvalid();
      return;
    }
    setBusy(true);
    try {
      finish(await login(email, password));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    try {
      await loginWithGoogle(new URLSearchParams(window.location.search).get("from") ?? undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your account to continue">
      {configError && <AuthErrorNotice>{configError}</AuthErrorNotice>}
      {!configError && redirectMessage && !error && (
        <AuthInfoNotice title="Sign in required">{redirectMessage}</AuthInfoNotice>
      )}
      <GoogleButton onClick={() => void onGoogle()} />
      <OrDivider />
      <form noValidate onSubmit={onSubmit} className="space-y-2">
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
          autoFocus
        />
        <div>
          <AuthField
            label="Password"
            password
            value={password}
            onChange={setPassword}
            onBlur={() => form.touch("password")}
            error={form.show("password", errors.password)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <div className="mt-2 text-right">
            <Link
              to="/forgot-password"
              state={{ email }}
              className="text-[0.8125rem] font-semibold text-[var(--color-ns-purple-light)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        <PrimaryButton busy={busy}>Sign in →</PrimaryButton>
      </form>
      {error && <AuthErrorNotice>{error}</AuthErrorNotice>}
      <FooterLink text="Don't have an account?" to="/signup" label="Sign up free" />
    </AuthLayout>
  );
}
