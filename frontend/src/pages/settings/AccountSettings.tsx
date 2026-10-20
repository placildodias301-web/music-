import { useState } from "react";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ComingSoonBadge, SettingsRow, SettingsSection } from "../../components/settings/SettingsRows";
import { useSettings } from "../../lib/settings/settingsContext";
import { PLANS } from "../../lib/plans";
import { exportMyData } from "../../lib/localData";
import { APP_VERSION } from "../../lib/appInfo";
import { useAuth } from "../../lib/auth";

/**
 * Account: email + password sign-in is live; changing email/password,
 * Google, connected apps, sessions and 2FA are listed but disabled with
 * "Coming soon". Plan and data export work today.
 */
export function AccountSettings() {
  const { settings } = useSettings();
  const plan = PLANS.find((p) => p.id === settings.plan) ?? PLANS[0];
  const [exported, setExported] = useState(false);
  const soon = <ComingSoonBadge />;
  const { user } = useAuth();

  return (
    <SettingsPage title="Account">
      <div className="rounded-2xl border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/[0.07] p-4 text-[0.8125rem] leading-relaxed text-[var(--color-ns-muted)]">
        <p className="font-semibold text-[var(--color-ns-text)]">Signed in{user ? ` as ${user.email}` : ""}</p>
        <p className="mt-1">
          Your Library, practice history and AI chats are saved to this account and sync across your devices. Profile and app settings stay in this browser for now.
        </p>
      </div>

      <SettingsSection title="Sign-in">
        <SettingsRow label="Email" value={user?.email ?? "Not set"} plain />
        <SettingsRow label="Password" description="Change your password" disabled badge={soon} />
        <SettingsRow label="Google" description="Sign in with your Google account" disabled badge={soon} />
      </SettingsSection>

      <SettingsSection title="Connected apps">
        <SettingsRow label="Google Drive" description="Save exports straight to Drive" disabled badge={soon} />
        <SettingsRow label="Ableton Live" description="Send chords and MIDI to your project" disabled badge={soon} />
      </SettingsSection>

      <SettingsSection title="Devices">
        <SettingsRow label="Active sessions" description="See where you're signed in" disabled badge={soon} />
        <SettingsRow label="Sign out of all devices" disabled badge={soon} />
      </SettingsSection>

      <SettingsSection title="Plan & credits" note="Credits aren't charged during the beta.">
        <SettingsRow label="Current plan" value={plan.name} to="/settings/plans" />
        <SettingsRow label="Monthly credits" value={plan.creditsPerMonth.toLocaleString("en-IN")} plain />
      </SettingsSection>

      <SettingsSection title="Your data" note={exported ? "Export downloaded ✓ — a ZIP of everything Wilsify stores in this browser." : "A ZIP with your profile, settings, Library, practice history and chats, as JSON."}>
        <SettingsRow
          label="Export my data (ZIP)"
          onClick={() => {
            exportMyData(APP_VERSION);
            setExported(true);
          }}
        />
      </SettingsSection>

      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4">
        <div className="flex items-center gap-2">
          <p className="font-heading text-[0.9375rem] font-bold text-[var(--color-ns-text)]">Two-factor authentication</p>
          {soon}
        </div>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--color-ns-muted)]">
          Once accounts launch, you'll be able to protect sign-in with an authenticator app, so a stolen password alone can't open your account.
        </p>
      </div>
    </SettingsPage>
  );
}
