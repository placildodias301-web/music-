import { useState } from "react";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ComingSoonBadge, SettingsSection, SettingsToggle } from "../../components/settings/SettingsRows";
import { useSettings } from "../../lib/settings/settingsContext";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TimeField({ id, label, value, onChange, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex flex-1 flex-col gap-1 text-[0.7812rem] font-semibold text-[var(--color-ns-muted)]">
      {label}
      <input
        id={id}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="ns-time rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2 font-mono text-[0.875rem] text-[var(--color-ns-text)] focus:border-[var(--color-ns-purple)] focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}

/**
 * Notification preferences. There's no push service yet, so these are
 * saved for when it launches — except "Analysis finished", which can use
 * the browser's own notifications while Wilsify is open in a tab.
 */
export function NotificationSettings() {
  const { settings, update } = useSettings();
  const n = settings.notifications;
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const push = <ComingSoonBadge label="Push coming soon" />;

  async function toggleAnalysisFinished(on: boolean) {
    update("notifications", { analysisFinished: on });
    if (on && permission === "default") setPermission(await Notification.requestPermission());
  }

  return (
    <SettingsPage title="Notifications">
      <div className="rounded-2xl border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/[0.07] p-4 text-[0.8125rem] leading-relaxed text-[var(--color-ns-muted)]">
        <p className="font-semibold text-[var(--color-ns-text)]">Push notifications are coming soon</p>
        <p className="mt-1">Your choices are saved now and will apply when push launches. “Analysis finished” already works in this browser while Wilsify is open.</p>
      </div>

      <SettingsSection
        title="In this browser"
        note={
          permission === "denied"
            ? "Your browser is blocking notifications for this site — allow them in the site settings to use this."
            : permission === "unsupported"
              ? "This browser doesn't support notifications."
              : "Shown when an analysis finishes while you're in another tab."
        }
      >
        <SettingsToggle
          label="Analysis finished"
          description="When your song is ready to open."
          checked={n.analysisFinished && permission !== "denied"}
          onChange={toggleAnalysisFinished}
          disabled={permission === "unsupported" || permission === "denied"}
        />
      </SettingsSection>

      <SettingsSection title="Push">
        <SettingsToggle label="Export ready" description="When a PDF or MIDI export has finished." checked={n.exportReady} onChange={(v) => update("notifications", { exportReady: v })} badge={push} />
        <SettingsToggle label="Practice reminders" description="A nudge at the time you choose." checked={n.practiceReminders} onChange={(v) => update("notifications", { practiceReminders: v })} badge={push} />
        {n.practiceReminders && (
          <div className="px-4 py-3.5">
            <TimeField id="practice-time" label="Remind me at" value={n.practiceTime} onChange={(v) => update("notifications", { practiceTime: v })} />
          </div>
        )}
        <SettingsToggle label="Streak reminders" description="Before your practice streak would break." checked={n.streak} onChange={(v) => update("notifications", { streak: v })} badge={push} />
        <SettingsToggle label="New tools & features" description="Occasional news about what's new in Wilsify." checked={n.features} onChange={(v) => update("notifications", { features: v })} badge={push} />
        <SettingsToggle label="Offers and promotions" description="Discounts on Pro and Studio." checked={n.offers} onChange={(v) => update("notifications", { offers: v })} badge={push} />
      </SettingsSection>

      <SettingsSection title="Quiet hours">
        <SettingsToggle
          label="Quiet hours"
          description="No push notifications during these hours."
          checked={n.quietHours.enabled}
          onChange={(v) => update("notifications", { quietHours: { ...n.quietHours, enabled: v } })}
        />
        <div className={`space-y-3 px-4 py-3.5 ${n.quietHours.enabled ? "" : "opacity-50"}`}>
          <div className="flex gap-3">
            <TimeField id="quiet-start" label="From" value={n.quietHours.start} disabled={!n.quietHours.enabled} onChange={(v) => update("notifications", { quietHours: { ...n.quietHours, start: v } })} />
            <TimeField id="quiet-end" label="To" value={n.quietHours.end} disabled={!n.quietHours.enabled} onChange={(v) => update("notifications", { quietHours: { ...n.quietHours, end: v } })} />
          </div>
          <div role="group" aria-label="Quiet hours days" className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = n.quietHours.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={!n.quietHours.enabled}
                  onClick={() =>
                    update("notifications", {
                      quietHours: { ...n.quietHours, days: on ? n.quietHours.days.filter((x) => x !== i) : [...n.quietHours.days, i].sort() },
                    })
                  }
                  className={`h-9 min-w-[44px] rounded-xl border px-2 text-[0.7812rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] disabled:cursor-not-allowed ${
                    on ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-text)]" : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)]"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
