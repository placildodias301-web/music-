import { useState } from "react";
import { ConfirmDialog } from "../components/ui";
import { initialsOf, loadPrefs, savePrefs, type AccountPrefs } from "../lib/account";
import { clearPracticeSessions } from "../lib/practiceLog";

type SettingsSection = "profile" | "appearance" | "audio" | "notifications" | "privacy" | "shortcuts";

const INSTRUMENT_OPTIONS = ["Guitar", "Piano", "Ukulele", "Bass", "Vocals"];
const LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Pro"];

const SHORTCUTS = [
  { key: "Space", action: "Play / Pause active track" },
  { key: "← / →", action: "Seek backwards / forwards 5s" },
  { key: "M", action: "Toggle beat metronome" },
  { key: "L", action: "Toggle section loop" },
  { key: "Ctrl + K", action: "Global search (songs, chords)" },
  { key: "Esc", action: "Close modals & popovers" },
];

export function Account() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [prefs, setPrefs] = useState<AccountPrefs>(loadPrefs);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Appearance state
  const [themeAccent, setThemeAccent] = useState("violet");
  const [glowEffects, setGlowEffects] = useState(true);

  // Notification states
  const [streakAlerts, setStreakAlerts] = useState(true);
  const [weeklyRecap, setWeeklyRecap] = useState(true);
  const [communityNotifs, setCommunityNotifs] = useState(false);

  function update<K extends keyof AccountPrefs>(key: K, value: AccountPrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    savePrefs(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 3500);
  }

  function handleClearCache() {
    setConfirmReset(false);
    clearPracticeSessions();
    window.location.reload();
  }

  const sections: { id: SettingsSection; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "appearance", label: "Appearance", icon: "🎨" },
    { id: "audio", label: "Audio & Tuner", icon: "🔊" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "privacy", label: "Privacy & Data", icon: "🔒" },
    { id: "shortcuts", label: "Keyboard Shortcuts", icon: "⌨️" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-6 border-b border-[var(--color-ns-border)] pb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            Studio Settings
          </span>
          <span className="inline-flex items-center rounded-md border border-ns-mint/30 bg-ns-mint/10 px-2.5 py-0.5 text-[11px] font-semibold text-ns-mint">
            Active Profile
          </span>
        </div>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-3xl">
          Account & Studio Settings
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[var(--color-ns-muted)]">
          Manage your musician profile, playback engine calibration, appearance tokens, and device preferences.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 flex overflow-x-auto gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 scrollbar-none">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
              activeSection === sec.id
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            <span>{sec.icon}</span>
            <span>{sec.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* SECTION 1: PROFILE */}
        {activeSection === "profile" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-sm">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/30 to-secondary/20 text-xl font-bold text-white shadow-md">
                    {initialsOf(prefs.name)}
                  </span>
                  <div>
                    <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">{prefs.name || "Musician"}</h2>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-ns-muted)]">
                      <span>{prefs.instruments}</span>
                      <span>•</span>
                      <span>{prefs.level} Level</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <span className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-3 py-1 text-xs font-semibold text-[var(--color-ns-muted)]">
                    Local MVP Plan
                  </span>
                  <span className="rounded-full border border-ns-mint/30 bg-ns-mint/10 px-2.5 py-1 text-xs font-medium text-ns-mint">
                    Full Studio Access
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 border-t border-[var(--color-ns-border)] pt-6 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-ns-muted)]">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={prefs.name}
                    onChange={(e) => update("name", e.target.value)}
                    aria-label="Your name"
                    placeholder="Enter your name"
                    className="input-base mt-2 w-full rounded-xl text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-ns-muted)]">
                    Primary Instrument
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {INSTRUMENT_OPTIONS.map((inst) => (
                      <button
                        key={inst}
                        type="button"
                        onClick={() => update("instruments", inst)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                          prefs.instruments.toLowerCase().includes(inst.toLowerCase())
                            ? "bg-primary text-white font-bold shadow-sm"
                            : "border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
                        }`}
                      >
                        {inst}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Experience Level
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LEVEL_OPTIONS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => update("level", lvl)}
                      className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                        prefs.level === lvl
                          ? "border border-secondary/50 bg-secondary/15 text-secondary font-bold shadow-sm"
                          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: APPEARANCE */}
        {activeSection === "appearance" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-sm">
              <h3 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Theme & Visual Styling</h3>
              <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
                Customize studio surface contrast, neon glow radiance, and waveform accents.
              </p>

              <div className="mt-6 space-y-5">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-ns-muted)] mb-2">
                    Primary Studio Palette
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setThemeAccent("violet")}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs font-semibold ${
                        themeAccent === "violet"
                          ? "border-primary bg-primary/10 text-white"
                          : "border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)]"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full bg-primary" />
                      Wilsify Violet (Default)
                    </button>

                    <button
                      type="button"
                      onClick={() => setThemeAccent("cyan")}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs font-semibold ${
                        themeAccent === "cyan"
                          ? "border-cyan bg-cyan/10 text-white"
                          : "border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)]"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full bg-cyan" />
                      Cyber Cyan
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-ns-border)] pt-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-ns-text)]">Glassmorphic Glow Radiance</p>
                    <p className="text-xs text-[var(--color-ns-muted)]">Enable subtle atmospheric background gradients</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={glowEffects}
                    onClick={() => setGlowEffects(!glowEffects)}
                    className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
                      glowEffects ? "bg-primary" : "bg-[var(--color-ns-border)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        glowEffects ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: AUDIO & TUNER */}
        {activeSection === "audio" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-sm">
              <h3 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Audio & Tuner Preferences</h3>
              <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
                Configure reference frequencies and playback defaults for practice sessions.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-ns-muted)]">
                    Concert Pitch (A4 Calibration)
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="number"
                      min="430"
                      max="450"
                      value={prefs.referencePitch}
                      onChange={(e) => update("referencePitch", Number(e.target.value))}
                      className="input-base w-28 font-mono text-sm rounded-xl"
                    />
                    <span className="text-xs text-[var(--color-ns-muted)]">Hz (Standard concert pitch is 440 Hz)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-ns-muted)]">
                    Metronome Audio Cue
                  </label>
                  <select
                    value={prefs.metronomeSound}
                    onChange={(e) => update("metronomeSound", e.target.value)}
                    className="input-base mt-2 w-full text-xs rounded-xl"
                  >
                    <option value="digital">Digital Synthetic Beep</option>
                    <option value="woodblock">Acoustic Woodblock Click</option>
                    <option value="rimshot">Drumstick Rimshot</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: NOTIFICATIONS */}
        {activeSection === "notifications" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-sm space-y-4">
              <h3 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Practice Alerts & Reminders</h3>
              <p className="text-xs text-[var(--color-ns-muted)]">Keep your daily practice streak consistent with gentle audio and browser cues.</p>

              <div className="divide-y divide-[var(--color-ns-border)] pt-2">
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-ns-text)]">Daily Streak Reminders</p>
                    <p className="text-xs text-[var(--color-ns-muted)]">Alert me if I haven't practiced by 8:00 PM</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={streakAlerts}
                    onClick={() => setStreakAlerts(!streakAlerts)}
                    className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
                      streakAlerts ? "bg-primary" : "bg-[var(--color-ns-border)]"
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      streakAlerts ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-ns-text)]">Weekly Practice Summary</p>
                    <p className="text-xs text-[var(--color-ns-muted)]">Review time spent, XP gained, and weak chord improvement</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={weeklyRecap}
                    onClick={() => setWeeklyRecap(!weeklyRecap)}
                    className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
                      weeklyRecap ? "bg-primary" : "bg-[var(--color-ns-border)]"
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      weeklyRecap ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-ns-text)]">Community Feedback & Likes</p>
                    <p className="text-xs text-[var(--color-ns-muted)]">Notifications when musicians like or comment on your logs</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={communityNotifs}
                    onClick={() => setCommunityNotifs(!communityNotifs)}
                    className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
                      communityNotifs ? "bg-primary" : "bg-[var(--color-ns-border)]"
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      communityNotifs ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: PRIVACY */}
        {activeSection === "privacy" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Privacy & Model Training</h3>
                  <p className="mt-1 text-xs text-[var(--color-ns-muted)] max-w-xl">
                    When enabled, anonymous audio metrics assist in calibrating chord detection. When disabled, analysis remains strictly local in your browser.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.improveAi}
                  onClick={() => update("improveAi", !prefs.improveAi)}
                  className={`relative h-7 w-12 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
                    prefs.improveAi ? "bg-primary" : "bg-[var(--color-ns-border)]"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                      prefs.improveAi ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Danger Zone: Reset history */}
            <div className="rounded-2xl border border-pink/30 bg-pink/5 p-6">
              <h3 className="font-heading text-base font-bold text-pink">Data Management & Reset</h3>
              <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
                Reset practice history, accuracy metrics, and streak count on this browser session.
              </p>
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="mt-4 rounded-xl border border-pink/40 bg-pink/15 px-4 py-2 text-xs font-semibold text-pink hover:bg-pink/25 transition-colors"
              >
                Reset Practice History
              </button>
            </div>
          </div>
        )}

        {/* SECTION 6: KEYBOARD SHORTCUTS */}
        {activeSection === "shortcuts" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 shadow-sm">
              <h3 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Studio Keyboard Shortcuts</h3>
              <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
                Master quick playback and studio navigation keys for distraction-free practice sessions.
              </p>

              <div className="mt-5 divide-y divide-[var(--color-ns-border)]">
                {SHORTCUTS.map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3 text-xs">
                    <span className="text-[var(--color-ns-text)] font-medium">{item.action}</span>
                    <kbd className="rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2.5 py-1 font-mono text-[11px] font-semibold text-primary shadow-sm">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Global Save Button */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary py-2.5 px-6 font-semibold shadow-[0_4px_20px_rgba(108,77,255,0.4)]">
              Save Preferences
            </button>
            {saved && (
              <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs font-semibold text-ns-mint animate-fadeIn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Preferences saved successfully!
              </span>
            )}
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmReset}
        title="Reset practice history?"
        body="This deletes every logged practice session on this device, so your streak, XP, and progress charts start from zero. Your saved library is not affected."
        confirmLabel="Reset history"
        destructive
        onConfirm={handleClearCache}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
