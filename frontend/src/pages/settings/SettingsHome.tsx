import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { deleteAccountData } from "../../lib/cloudSync";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ComingSoonBadge, DangerButton, SettingsRow, SettingsSection, SettingsSlider, SettingsToggle } from "../../components/settings/SettingsRows";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { ConfirmDialog } from "../../components/settings/ConfirmDialog";
import { useSettings } from "../../lib/settings/settingsContext";
import { OPTIONS, TUNINGS, type HistoryRetention, type TuningId } from "../../lib/settings/model";
import { initialsOf } from "../../lib/settings/profile";
import { settingsService } from "../../lib/settings/settingsService";
import { clearCache, formatBytes, getStorageUsage, type StorageUsage } from "../../lib/localData";
import { pruneLibrary } from "../../lib/library";
import { previewClicks } from "../../lib/metronome";
import { PLANS } from "../../lib/plans";
import { parseTuning } from "../../lib/tuning";

const icon = (d: string) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

function CustomTuningInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const error = parseTuning(draft) ? null : "Enter six notes low → high, e.g. D2 A2 D3 G3 B3 E4";
  return (
    <div>
      <label htmlFor="custom-tuning" className="text-[0.7812rem] font-semibold text-[var(--color-ns-text)]">
        Custom tuning
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="custom-tuning"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2 font-mono text-[0.8125rem] text-[var(--color-ns-text)] focus:border-[var(--color-ns-purple)] focus:outline-none"
          aria-invalid={Boolean(error)}
          aria-describedby="custom-tuning-help"
        />
        <button type="button" className="btn-primary !min-h-0 px-3 py-2 text-[0.8125rem]" disabled={Boolean(error)} onClick={() => onSave(draft.trim().replace(/\s+/g, " "))}>
          Use
        </button>
      </div>
      <p id="custom-tuning-help" className={`mt-1 text-[0.7188rem] ${error ? "text-[var(--color-ns-amber)]" : "text-[var(--color-ns-dim)]"}`}>
        {error ?? "Lowest string first."}
      </p>
    </div>
  );
}

export function SettingsHome() {
  const { settings, update } = useSettings();
  const { profile, audio, display, practice, app, storage } = settings;
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [dialog, setDialog] = useState<null | "storage" | "cache" | "delete" | "cacheDone">(null);
  const [cacheMessage, setCacheMessage] = useState("");
  const plan = PLANS.find((p) => p.id === settings.plan) ?? PLANS[0];

  useEffect(() => {
    let alive = true;
    getStorageUsage().then((u) => alive && setUsage(u));
    return () => {
      alive = false;
    };
  }, [dialog]);

  function setRetention(value: HistoryRetention) {
    update("storage", { historyRetention: value });
    if (value !== "forever") pruneLibrary(Number(value));
  }

  async function handleClearCache() {
    const removed = await clearCache();
    setCacheMessage(removed ? `Cleared ${removed} cache store${removed === 1 ? "" : "s"}.` : "There was nothing cached to clear.");
    setDialog("cacheDone");
  }

  async function handleDelete() {
    try {
      await deleteAccountData();
    } catch (e) {
      window.alert((e as Error).message);
      return;
    }
    settingsService.deleteAllLocalData();
    window.location.assign("/studio");
  }

  const tuningLabel = audio.tuning === "custom" ? `Custom (${audio.customTuning})` : TUNINGS[audio.tuning].label;

  return (
    <SettingsPage title="Settings" back={null}>
      {/* Profile card */}
      <Link
        to="/settings/profile"
        className="flex items-center gap-4 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 transition-colors hover:border-[var(--color-ns-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ns-raised)] font-heading text-lg font-bold text-[var(--color-ns-text)] ring-2 ring-[var(--color-ns-purple)]/50">
          {profile.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(profile.displayName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-heading text-base font-bold text-[var(--color-ns-text)]">{profile.displayName || "Musician"}</span>
            <span className="shrink-0 rounded-full bg-[var(--color-ns-purple)]/20 px-2 py-0.5 text-[0.6562rem] font-bold uppercase tracking-wide text-[var(--color-ns-purple-light)]">
              {plan.name}
            </span>
          </span>
          <span className="block truncate text-[0.8125rem] text-[var(--color-ns-muted)]">{profile.username ? `@${profile.username}` : "Add a username"}</span>
        </span>
        <span className="text-[0.8125rem] font-semibold text-[var(--color-ns-purple-light)]">Edit</span>
      </Link>

      <SettingsSection title="Audio">
        <SettingsSelect
          label="Analysis quality"
          description="The analyser runs one quality level today."
          value={audio.analysisQuality}
          options={OPTIONS.analysisQuality}
          onChange={(v) => update("audio", { analysisQuality: v })}
          disabled
          badge={<ComingSoonBadge />}
        />
        <SettingsSelect
          label="Default tuning"
          description="Used by the tuner's guitar presets."
          value={audio.tuning}
          options={OPTIONS.tuning}
          onChange={(v: TuningId) => update("audio", { tuning: v })}
          extra={audio.tuning === "custom" ? <CustomTuningInput value={audio.customTuning} onSave={(v) => update("audio", { customTuning: v })} /> : undefined}
        />
        {audio.tuning === "custom" && <SettingsRow label="Custom notes" value={tuningLabel} plain />}
        <SettingsSlider
          label="Tuning reference"
          description="Pitch of A4 for the tuner and reference tones."
          value={audio.a4}
          min={415}
          max={466}
          format={(v) => `A4 = ${v} Hz`}
          onChange={(v) => update("audio", { a4: v })}
        />
        <SettingsSelect
          label="Metronome click"
          value={audio.metronomeSound}
          options={OPTIONS.metronomeSound}
          onChange={(v) => update("audio", { metronomeSound: v })}
        />
        <SettingsSlider
          label="Metronome volume"
          value={audio.metronomeVolume}
          min={0}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          onChange={(v) => update("audio", { metronomeVolume: v })}
          trailing={
            <button
              type="button"
              onClick={() => previewClicks(audio.metronomeSound, audio.metronomeVolume)}
              className="rounded-lg border border-[var(--color-ns-border)] px-2.5 py-1 text-[0.75rem] font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
              aria-label={`Preview the ${audio.metronomeSound} click`}
            >
              ▶ Preview
            </button>
          }
        />
        <SettingsSelect
          label="Count-in"
          description="Clicks before the song starts when you press play."
          value={String(audio.countIn) as "0" | "1" | "2"}
          options={OPTIONS.countIn}
          onChange={(v) => update("audio", { countIn: Number(v) as 0 | 1 | 2 })}
        />
      </SettingsSection>

      <SettingsSection title="Music display">
        <SettingsSelect label="Chord notation" value={display.accidentals} options={OPTIONS.accidentals} onChange={(v) => update("display", { accidentals: v })} />
        <SettingsSelect label="Notation system" value={display.notation} options={OPTIONS.notation} onChange={(v) => update("display", { notation: v })} />
        <SettingsSelect label="Primary instrument" description="Which chord view opens first." value={display.instrument} options={OPTIONS.instrument} onChange={(v) => update("display", { instrument: v })} />
        <SettingsToggle
          label="Left-handed chord diagrams"
          description="Mirror guitar and ukulele diagrams (high string on the left)."
          checked={display.leftHanded}
          onChange={(v) => update("display", { leftHanded: v })}
        />
        <SettingsSelect label="Default capo suggestion" value={display.capo} options={OPTIONS.capo} onChange={(v) => update("display", { capo: v })} />
        <SettingsSelect
          label="Default playback speed"
          description="Pitch stays the same at every speed."
          value={String(display.playbackSpeed)}
          options={OPTIONS.playbackSpeed}
          onChange={(v) => update("display", { playbackSpeed: Number(v) })}
        />
      </SettingsSection>

      <SettingsSection title="Practice">
        <SettingsSelect
          label="Daily practice goal"
          value={String(practice.dailyGoalMinutes)}
          options={OPTIONS.dailyGoal}
          onChange={(v) => update("practice", { dailyGoalMinutes: Number(v) })}
        />
        <SettingsToggle
          label="Auto-loop difficult sections"
          description="Loop the parts you miss most while you practise."
          checked={practice.autoLoop}
          onChange={(v) => update("practice", { autoLoop: v })}
          disabled
          badge={<ComingSoonBadge />}
        />
        <SettingsToggle
          label="Show uncertain chords"
          description="Mark chords the analysis wasn't sure about with a dashed outline and ?."
          checked={practice.showUncertain}
          onChange={(v) => update("practice", { showUncertain: v })}
        />
      </SettingsSection>

      <SettingsSection title="App">
        <SettingsSelect label="Appearance" value={app.appearance} options={OPTIONS.appearance} onChange={(v) => update("app", { appearance: v })} />
        <SettingsSelect label="Accent colour" value={app.accent} options={OPTIONS.accent} onChange={(v) => update("app", { accent: v })} />
        <SettingsSelect label="Text size" value={app.textSize} options={OPTIONS.textSize} onChange={(v) => update("app", { textSize: v })} />
        <SettingsToggle
          label="Reduce motion"
          description="Turn off animations, including the equaliser and waveforms."
          checked={app.reduceMotion}
          onChange={(v) => update("app", { reduceMotion: v })}
        />
        <SettingsSelect label="Language" value={app.language} options={OPTIONS.language} onChange={() => undefined} />
        <SettingsToggle
          label="Downloads over Wi-Fi only"
          description="Don't fetch songs from links on mobile data (on devices whose browser reports the connection type)."
          checked={app.wifiOnly}
          onChange={(v) => update("app", { wifiOnly: v })}
        />
      </SettingsSection>

      <SettingsSection title="Storage" note="Your Library, practice history and chats are saved to your account; settings stay in this browser. Uploaded audio is never stored.">
        <SettingsRow label="Storage used" value={usage ? formatBytes(usage.appBytes) : "…"} onClick={() => setDialog("storage")} />
        <SettingsRow label="Clear cache" description="Browser caches and per-tab data. Your Library and settings stay." onClick={() => setDialog("cache")} />
        <SettingsSelect
          label="Analysis history"
          description="Older saved analyses are removed automatically. Favourites are always kept."
          value={storage.historyRetention}
          options={OPTIONS.historyRetention}
          onChange={setRetention}
        />
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow label="Account settings" to="/settings/account" icon={icon("M20 21a8 8 0 1 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z")} />
        <SettingsRow label="Privacy" to="/settings/privacy" icon={icon("M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z")} />
        <SettingsRow label="Notifications" to="/settings/notifications" icon={icon("M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4")} />
        <SettingsRow
          label="Plans"
          value={plan.name}
          to="/settings/plans"
          badge={<ComingSoonBadge />}
          icon={icon("M12 2 15 8l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z")}
        />
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsRow label="Help & support" to="/settings/help" icon={icon("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01")} />
        <SettingsRow label="Keyboard shortcuts" to="/settings/shortcuts" icon={icon("M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10")} />
        <SettingsRow label="About" to="/settings/about" icon={icon("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01")} />
      </SettingsSection>

      <div className="space-y-3">
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-4 py-3.5 text-left transition-colors hover:border-[var(--color-ns-border-strong)]"
        >
          <span>
            <span className="block text-[0.875rem] font-semibold text-[var(--color-ns-text)]">Sign out</span>
            {user && <span className="block text-[0.7812rem] text-[var(--color-ns-muted)]">{user.email}</span>}
          </span>
        </button>
        <DangerButton onClick={() => setDialog("delete")}>Delete my data</DangerButton>
      </div>

      <ConfirmDialog open={dialog === "storage"} title="Storage used" confirmLabel="" cancelLabel="Close" hideConfirm onConfirm={() => undefined} onCancel={() => setDialog(null)}>
        {usage && (
          <>
            <ul className="divide-y divide-[var(--color-ns-border)]">
              {usage.items.map((item) => (
                <li key={item.key} className="flex justify-between gap-4 py-2">
                  <span>{item.label}</span>
                  <span className="font-mono text-[var(--color-ns-text)]">{formatBytes(item.bytes)}</span>
                </li>
              ))}
              {!usage.items.length && <li className="py-2">Nothing stored yet.</li>}
            </ul>
            {usage.estimate && (
              <p className="text-[0.7812rem]">
                Your browser reports {formatBytes(usage.estimate.usage)} used by this site, of {formatBytes(usage.estimate.quota)} available.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={dialog === "cache"} title="Clear cache?" confirmLabel="Clear cache" onConfirm={handleClearCache} onCancel={() => setDialog(null)}>
        <p>This clears browser caches and per-tab data that Wilsify can rebuild. Your Library, practice history, AI chats and settings are kept.</p>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === "cacheDone"} title="Cache cleared" confirmLabel="" cancelLabel="Done" hideConfirm onConfirm={() => undefined} onCancel={() => setDialog(null)}>
        <p>{cacheMessage}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete all your data?"
        confirmLabel="Delete everything"
        destructive
        requireText="DELETE"
        onConfirm={handleDelete}
        onCancel={() => setDialog(null)}
      >
        <p>This permanently removes, from your account and this browser:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>Your profile and every setting</li>
          <li>Your Library of saved analyses</li>
          <li>Practice history, streaks and XP</li>
          <li>AI Assistant chats and community posts</li>
        </ul>
        <p>You stay signed in and the app starts fresh. This can't be undone.</p>
      </ConfirmDialog>
    </SettingsPage>
  );
}
