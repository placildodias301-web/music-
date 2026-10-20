import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AuthErrorNotice, AuthField, AuthLayout, PasswordRulesList, PrimaryButton, StrengthMeter } from "../../components/auth/AuthKit";
import { authMessage } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { newPasswordError } from "../../lib/authValidation";
import { focusFirstInvalid, useTouched } from "./authForm";

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const form = useTouched<"password" | "confirm">();

  const errors = {
    password: newPasswordError(password),
    confirm: !confirm ? "Repeat your new password." : confirm !== password ? "Passwords don't match." : null,
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    form.submit();
    setFailure(null);
    if (errors.password || errors.confirm) {
      focusFirstInvalid();
      return;
    }
    setBusy(true);
    // The emailed link signed this tab in for recovery; without it there's no session to update.
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setBusy(false);
      setFailure("This reset link has expired or was already used. Ask for a new one from \"Forgot password?\".");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setFailure(authMessage(error));
    else navigate("/studio", { replace: true });
  }

  return (
    <AuthLayout title="Set a new password" subtitle="You'll be signed in on this device only." showLogo={false}>
      <form noValidate onSubmit={onSubmit} className="space-y-2">
        <div>
          <AuthField
            label="New password"
            password
            value={password}
            onChange={setPassword}
            onBlur={() => form.touch("password")}
            error={form.show("password", errors.password)}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            autoFocus
          />
          <StrengthMeter password={password} />
        </div>
        <AuthField
          label="Confirm password"
          password
          value={confirm}
          onChange={setConfirm}
          onBlur={() => form.touch("confirm")}
          error={form.show("confirm", errors.confirm)}
          placeholder="Repeat it"
          autoComplete="new-password"
        />
        <PasswordRulesList password={password} />
        <PrimaryButton busy={busy}>Save &amp; sign in →</PrimaryButton>
      </form>
      {failure && <AuthErrorNotice>{failure}</AuthErrorNotice>}
    </AuthLayout>
  );
}
