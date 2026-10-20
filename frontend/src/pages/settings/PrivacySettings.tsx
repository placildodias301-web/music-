import { useState } from "react";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ComingSoonBadge, SettingsRow, SettingsSection, SettingsToggle } from "../../components/settings/SettingsRows";
import { ConfirmDialog } from "../../components/settings/ConfirmDialog";
import { useSettings } from "../../lib/settings/settingsContext";
import { clearLibrary, getLibrary } from "../../lib/library";

export function PrivacySettings() {
  const { settings, update } = useSettings();
  const p = settings.privacy;
  const [confirm, setConfirm] = useState(false);
  const [libraryCount, setLibraryCount] = useState(() => getLibrary().length);

  return (
    <SettingsPage title="Privacy">
      <div className="rounded-2xl border border-[var(--color-ns-mint)]/30 bg-[var(--color-ns-mint)]/[0.07] p-4 text-[0.8125rem] leading-relaxed text-[var(--color-ns-muted)]">
        <p className="font-semibold text-[var(--color-ns-text)]">What happens to your audio today</p>
        <p className="mt-1">
          Songs you upload are analysed on the server and deleted straight after. Nothing is used to train models, and Wilsify collects no analytics during the beta.
        </p>
      </div>

      <SettingsSection title="AI & data">
        <SettingsToggle
          label="Improve AI with my audio"
          description="Off means your uploads are never used for model training. Wilsify doesn't train on uploads during the beta either way; this records your choice for later."
          checked={p.improveAi}
          onChange={(v) => update("privacy", { improveAi: v })}
        />
        <SettingsToggle
          label="Share usage analytics"
          description="Crash and performance data, never audio content."
          checked={p.analytics}
          onChange={(v) => update("privacy", { analytics: v })}
          disabled
          badge={<ComingSoonBadge />}
        />
        <SettingsToggle
          label="Personalised recommendations"
          description="Off means the library feed is chronological."
          checked={p.recommendations}
          onChange={(v) => update("privacy", { recommendations: v })}
          disabled
          badge={<ComingSoonBadge />}
        />
      </SettingsSection>

      <SettingsSection title="Profile & activity" note="These need public profiles, which arrive with accounts.">
        <SettingsToggle
          label="Show my profile publicly"
          checked={p.publicProfile}
          onChange={(v) => update("privacy", { publicProfile: v })}
          disabled
          badge={<ComingSoonBadge />}
        />
        <SettingsToggle
          label="Show my practice activity to followers"
          checked={p.shareActivity}
          onChange={(v) => update("privacy", { shareActivity: v })}
          disabled
          badge={<ComingSoonBadge />}
        />
      </SettingsSection>

      <SettingsSection title="Your data">
        <SettingsRow label="Download my data" description="A ZIP of everything stored in this browser" to="/settings/account" />
        <SettingsRow
          label="Delete analysis history"
          value={`${libraryCount} saved`}
          onClick={() => setConfirm(true)}
          disabled={libraryCount === 0}
        />
      </SettingsSection>

      <ConfirmDialog
        open={confirm}
        title="Delete analysis history?"
        confirmLabel="Delete history"
        destructive
        onConfirm={() => {
          clearLibrary();
          setLibraryCount(0);
          setConfirm(false);
        }}
        onCancel={() => setConfirm(false)}
      >
        <p>
          This removes all {libraryCount} saved analyses from your Library, including favourites. Practice history and settings stay. This can't be undone.
        </p>
      </ConfirmDialog>
    </SettingsPage>
  );
}
