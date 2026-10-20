import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AuthLayout, ComingSoonNotice, OtpInput, PrimaryButton } from "../../components/auth/AuthKit";
import { OTP_LENGTH } from "../../lib/authValidation";

const RESEND_SECONDS = 30;

export function VerifyEmail() {
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const complete = code.length === OTP_LENGTH;
  const error = submitted && !complete ? `Enter all ${OTP_LENGTH} digits of the code.` : null;

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setNotice(complete);
  }

  return (
    <AuthLayout title="Verify your email" subtitle="Enter the six-digit code from your email." showLogo={false}>
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} />
        {error && (
          <p role="alert" className="text-[0.8125rem] text-[var(--color-ns-red)]">
            {error}
          </p>
        )}
        <p className="text-[0.875rem] text-[var(--color-ns-muted)]" aria-live="polite">
          Didn't get it?{" "}
          {wait > 0 ? (
            <span className="font-semibold text-[var(--color-ns-text)]">Resend in 0:{String(wait).padStart(2, "0")}</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setWait(RESEND_SECONDS);
                setNotice(true);
              }}
              className="font-semibold text-[var(--color-ns-purple-light)] hover:underline"
            >
              Resend code
            </button>
          )}
        </p>
        <PrimaryButton>Verify &amp; continue →</PrimaryButton>
      </form>
      {notice && <ComingSoonNotice>Email verification isn't available yet, so no code was sent or checked.</ComingSoonNotice>}
    </AuthLayout>
  );
}
