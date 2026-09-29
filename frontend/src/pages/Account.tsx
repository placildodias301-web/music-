import { useState } from "react";
import { ConfirmDialog } from "../components/ui";
import { initialsOf, loadPrefs, savePrefs, type AccountPrefs } from "../lib/account";
import { clearPracticeSessions } from "../lib/practiceLog";

const INSTRUMENT_OPTIONS = ["Guitar", "Piano", "Ukulele", "Bass", "Vocals"];
const LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Pro"];

export function Account() {
  const [prefs, setPrefs] = useState<AccountPrefs>(loadPrefs);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-6 border-b border-glass pb-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary-light">
            Settings & Preferences
          </span>
          <span className="rounded-full border border-green/30 bg-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-green">
            Active Profile
          </span>
        </div>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-content sm:text-3xl">
          Account & Studio Settings
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Manage your musician profile, playback preferences, and audio analysis privacy.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Card */}
        <div className="glass-card p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-xl font-bold text-white shadow-lg shadow-primary/20">
{initialsOf(prefs.name)}
              </span>
              <div>
                <h2 className="font-heading text-lg font-bold text-content">{prefs.name || "Musician"}</h2>
                <div className="mt-1 flex items-center gap-2 text-xs text-content-dim">
                  <span>{prefs.instruments}</span>
                  <span>•</span>
                  <span>{prefs.level} Level</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-light">
                MVP Prototype Plan
              </span>
              <span className="rounded-full border border-green/30 bg-green/10 px-2.5 py-1 text-xs font-medium text-green">
                Full Access
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 border-t border-glass pt-6 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-content-dim">
                Display Name
              </label>
              <input
                type="text"
                value={prefs.name}
                onChange={(e) => update("name", e.target.value)}
                aria-label="Your name"
                placeholder="Enter your name"
                className="input-base mt-2 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-content-dim">
                Primary Instrument
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {INSTRUMENT_OPTIONS.map((inst) => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => update("instruments", inst)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      prefs.instruments.toLowerCase().includes(inst.toLowerCase())
                        ? "bg-primary text-white shadow-sm"
                        : "border border-glass bg-white/[0.03] text-content-muted hover:border-glass-strong hover:text-content"
                    }`}
                  >
                    {inst}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-medium uppercase tracking-wider text-content-dim">
              Experience Level
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {LEVEL_OPTIONS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => update("level", lvl)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    prefs.level === lvl
                      ? "border border-cyan/40 bg-cyan/15 text-cyan"
                      : "border border-glass bg-white/[0.03] text-content-muted hover:text-content"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Audio & Tuner Settings */}
        <div className="glass-card p-6">
          <h3 className="font-heading text-base font-bold text-content">Audio & Tuner Preferences</h3>
          <p className="mt-1 text-xs text-content-dim">
            Configure reference frequencies and playback defaults for practice sessions.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-content-dim">
                Concert Pitch (A4 Calibration)
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min="430"
                  max="450"
                  value={prefs.referencePitch}
                  onChange={(e) => update("referencePitch", Number(e.target.value))}
                  className="input-base w-28 font-mono text-sm"
                />
                <span className="text-xs text-content-muted">Hz (Standard concert pitch is 440 Hz)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-content-dim">
                Metronome Audio Cue
              </label>
              <select
                value={prefs.metronomeSound}
                onChange={(e) => update("metronomeSound", e.target.value)}
                className="input-base mt-2 w-full text-xs"
              >
                <option value="digital">Digital Synthetic Beep</option>
                <option value="woodblock">Acoustic Woodblock Click</option>
                <option value="rimshot">Drumstick Rimshot</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI & Privacy Toggle */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-heading text-base font-bold text-content">Privacy & AI Model Improvement</h3>
              <p className="mt-1 text-xs text-content-dim">
                When enabled, anonymous audio stems help train the open-source chord recognition models.
                When disabled, uploads remain strictly local and private.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={prefs.improveAi}
              onClick={() => update("improveAi", !prefs.improveAi)}
              className={`relative h-7 w-12 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
                prefs.improveAi ? "bg-primary" : "bg-white/15"
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

        {/* Save Bar & Danger Zone */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary">
              Save Preferences
            </button>
            {saved && (
              <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs font-semibold text-green animate-fadeIn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Preferences saved successfully!
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="text-xs text-content-dim hover:text-pink transition-colors underline"
          >
            Reset practice history
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmReset}
        title="Reset practice history?"
        body="This deletes every logged practice session on this device, so your streak, XP and progress charts start from zero. Your saved library is not affected."
        confirmLabel="Reset history"
        destructive
        onConfirm={handleClearCache}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
