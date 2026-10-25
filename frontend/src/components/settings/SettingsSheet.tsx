import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useSettings } from "../../lib/settings/settingsContext";
import { initialsOf, profileSubtitle } from "../../lib/settings/profile";
import { getAudioEngineMode, setAudioEngineMode, type AudioEngineMode } from "../../lib/chords/play";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { settings, update } = useSettings();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { profile, audio } = settings;
  const subtitle = profileSubtitle(profile);

  const [audioMode, setAudioMode] = useState<AudioEngineMode>(() => {
    try {
      return getAudioEngineMode();
    } catch {
      return "samples";
    }
  });

  if (!open) return null;

  function toggleAudioMode() {
    const next = audioMode === "samples" ? "physical" : "samples";
    try {
      setAudioEngineMode(next);
      setAudioMode(next);
    } catch {
      setAudioMode(next);
    }
  }

  function handleRefPitchChange(delta: number) {
    const nextPitch = Math.max(415, Math.min(466, (audio.a4 || 440) + delta));
    update("audio", { a4: nextPitch });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden" role="dialog" aria-modal="true" aria-label="Settings and Profile">
      {/* Backdrop */}
      <div className="animate-fadeIn absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-up sheet */}
      <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] p-4 pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl">
        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-white/20" />

        {/* Header */}
        <div className="mb-4 flex items-center justify-between border-b border-[var(--color-ns-border)]/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-purple-light)]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </span>
            <h2 className="font-heading text-sm font-bold text-[var(--color-ns-text)]">Settings & Profile</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              onClick={onClose}
              className="text-xs font-semibold text-[var(--color-ns-purple-light)] hover:text-[var(--color-violet-soft)]"
            >
              Full Settings →
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-ns-muted)] hover:bg-white/[0.06] hover:text-[var(--color-ns-text)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Profile Card */}
        <Link
          to="/settings/profile"
          onClick={onClose}
          className="mb-3.5 flex items-center gap-3 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-3 transition-colors hover:border-[var(--color-ns-border-strong)]"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ns-raised)] font-heading text-sm font-bold text-[var(--color-ns-text)] ring-2 ring-[var(--color-ns-purple)]/40">
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{initialsOf(profile.displayName || "Wilbur")}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-heading text-sm font-bold text-[var(--color-ns-text)]">
                {profile.displayName || "Wilbur"}
              </h3>
              <span className="rounded-md border border-[var(--color-ns-mint)]/40 bg-[var(--color-ns-mint)]/10 px-1.5 py-0.5 text-[0.625rem] font-bold text-[var(--color-ns-mint)]">
                Active Pro
              </span>
            </div>
            <p className="truncate text-xs text-[var(--color-ns-muted)]">
              {user?.email ?? subtitle}
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-ns-muted)]">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>

        {/* Audio & Playback Preferences */}
        <div className="mb-3.5 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-3.5">
          <p className="mb-2.5 text-[0.6562rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ns-dim)]">
            Audio & Playback Preferences
          </p>

          <div className="space-y-3">
            {/* Reference Pitch */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--color-ns-text)]">Reference Pitch (A4)</p>
                <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">Standard concert pitch reference</p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
                <button
                  type="button"
                  onClick={() => handleRefPitchChange(-1)}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-[var(--color-ns-muted)] hover:bg-white/[0.08] hover:text-[var(--color-ns-text)]"
                >
                  -
                </button>
                <span className="w-12 text-center font-mono text-xs font-bold text-[var(--color-ns-amber)]">
                  {audio.a4 || 440} Hz
                </span>
                <button
                  type="button"
                  onClick={() => handleRefPitchChange(1)}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-[var(--color-ns-muted)] hover:bg-white/[0.08] hover:text-[var(--color-ns-text)]"
                >
                  +
                </button>
              </div>
            </div>

            {/* Studio Sampled Audio Toggle */}
            <div className="flex items-center justify-between border-t border-[var(--color-ns-border)]/60 pt-2.5">
              <div>
                <p className="text-xs font-semibold text-[var(--color-ns-text)]">Studio Sampled Audio</p>
                <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
                  {audioMode === "samples" ? "FluidR3_GM multi-sampled sound" : "Physical model synthesis"}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAudioMode}
                className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all ${
                  audioMode === "samples"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                    : "border-sky-500/40 bg-sky-500/15 text-sky-400"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>{audioMode === "samples" ? "Samples On" : "Physical"}</span>
              </button>
            </div>

            {/* Default Tuning */}
            <div className="flex items-center justify-between border-t border-[var(--color-ns-border)]/60 pt-2.5">
              <div>
                <p className="text-xs font-semibold text-[var(--color-ns-text)]">Default Guitar Tuning</p>
                <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">Standard EADGBE</p>
              </div>
              <span className="rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2 py-1 font-mono text-xs text-[var(--color-ns-text)]">
                {audio.tuning === "standard" ? "Standard E" : audio.tuning}
              </span>
            </div>
          </div>
        </div>

        {/* Cloud Sync & Storage Status */}
        <div className="mb-3.5 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-3.5">
          <p className="mb-2 text-[0.6562rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ns-dim)]">
            Cloud Sync & Storage
          </p>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[var(--color-ns-text)] font-medium">Offline-First Engine</span>
            </div>
            <span className="text-[0.6875rem] text-[var(--color-ns-muted)]">Saved locally</span>
          </div>
          <p className="mt-1 text-[0.6875rem] text-[var(--color-ns-muted)]">
            All songs, custom tunings, and practice logs are safely persisted on this device.
          </p>
        </div>

        {/* Fast Navigation Links */}
        <div className="grid grid-cols-2 gap-2 text-xs font-medium">
          <Link
            to="/tuner"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-2.5 text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7v5l3 3" />
            </svg>
            <span>Tuner</span>
          </Link>
          <Link
            to="/chords"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-2.5 text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="7" height="7" rx="1.5" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <rect x="4" y="13" width="7" height="7" rx="1.5" />
              <rect x="13" y="13" width="7" height="7" rx="1.5" />
            </svg>
            <span>Chords</span>
          </Link>
          <Link
            to="/library"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-2.5 text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 4h12v16l-6-3.5L6 20V4Z" />
            </svg>
            <span>Library</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              onClose();
              await logout();
              navigate("/login", { replace: true });
            }}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-2.5 text-[var(--color-ns-coral)] hover:bg-[var(--color-ns-coral)]/10"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
