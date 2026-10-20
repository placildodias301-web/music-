import { useState } from "react";
import licences from "virtual:licences";
import { Logo } from "../../components/Logo";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ComingSoonBadge, SettingsRow, SettingsSection } from "../../components/settings/SettingsRows";
import { APP_NAME, APP_VERSION, AUDIO_ENGINE } from "../../lib/appInfo";

const KIND_LABEL: Record<string, string> = { app: "App", server: "Audio server", build: "Build tools", font: "Fonts (PDF export)" };

export function About() {
  const [showLicences, setShowLicences] = useState(false);
  const groups = (["app", "server", "font", "build"] as const).map((kind) => ({ kind, items: licences.filter((l) => l.kind === kind) })).filter((g) => g.items.length);

  return (
    <SettingsPage title="About">
      <div className="flex flex-col items-center py-4 text-center">
        <Logo size={64} withText={false} />
        <h2 className="mt-4 font-heading text-2xl font-bold text-[var(--color-ns-text)]">{APP_NAME}</h2>
        <p className="mt-1 text-[0.875rem] text-[var(--color-ns-muted)]">AI that hears your stems.</p>
      </div>

      <SettingsSection>
        <SettingsRow label="Version" value={APP_VERSION} plain />
        <SettingsRow label="Audio engine" value={AUDIO_ENGINE} plain />
      </SettingsSection>

      <SettingsSection title="Legal">
        <SettingsRow label="Terms of use" disabled badge={<ComingSoonBadge />} />
        <SettingsRow label="Privacy policy" disabled badge={<ComingSoonBadge />} />
        <SettingsRow label="Open-source licences" value={`${licences.length} packages`} onClick={() => setShowLicences((v) => !v)} />
      </SettingsSection>

      {showLicences && (
        <div className="space-y-4" id="licences">
          {groups.map((g) => (
            <SettingsSection key={g.kind} title={KIND_LABEL[g.kind]}>
              {g.items.map((l) => (
                <div key={`${l.kind}-${l.name}`} className="flex items-center gap-3 px-4 py-2.5 text-[0.8125rem]">
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-ns-text)]">{l.name}</span>
                  {l.version && <span className="font-mono text-[0.75rem] text-[var(--color-ns-dim)]">{l.version}</span>}
                  <span className="w-28 truncate text-right text-[var(--color-ns-muted)]">{l.licence}</span>
                </div>
              ))}
            </SettingsSection>
          ))}
        </div>
      )}

      <p className="pt-4 text-center text-[0.7812rem] text-[var(--color-ns-dim)]">Made for musicians in Goa, India. © 2026 Wilsify AI</p>
    </SettingsPage>
  );
}
