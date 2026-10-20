import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useBlocker } from "react-router-dom";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ChipGroup, ComingSoonBadge, SettingsSection } from "../../components/settings/SettingsRows";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { ConfirmDialog } from "../../components/settings/ConfirmDialog";
import { AvatarCropper } from "../../components/settings/AvatarCropper";
import { useSettings } from "../../lib/settings/settingsContext";
import { GENRE_CHIPS, INSTRUMENT_CHIPS, OPTIONS, type Profile } from "../../lib/settings/model";
import { BIO_MAX, DISPLAY_NAME_MAX, LINK_FIELDS, initialsOf, linkError, usernameError } from "../../lib/settings/profile";

const INPUT =
  "w-full rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3.5 py-2.5 text-[0.875rem] text-[var(--color-ns-text)] placeholder:text-[var(--color-ns-dim)] focus:border-[var(--color-ns-purple)] focus:outline-none aria-[invalid=true]:border-[var(--color-ns-red)]";

function Field({ label, error, hint, children, id }: { label: string; error?: string | null; hint?: ReactNode; children: ReactNode; id: string }) {
  return (
    <div className="px-4 py-3.5">
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-semibold text-[var(--color-ns-text)]">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="mt-1.5 text-[0.75rem] text-[var(--color-ns-red)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 text-[0.75rem] text-[var(--color-ns-dim)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function EditProfile() {
  const { settings, replace } = useSettings();
  const [draft, setDraft] = useState<Profile>(settings.profile);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), user: useId(), bio: useId(), loc: useId() };

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings.profile), [draft, settings.profile]);
  const errors = {
    name: !draft.displayName.trim() ? "Add a display name." : draft.displayName.length > DISPLAY_NAME_MAX ? `${DISPLAY_NAME_MAX} characters at most.` : null,
    username: usernameError(draft.username),
    bio: draft.bio.length > BIO_MAX ? `${BIO_MAX} characters at most.` : null,
    links: Object.fromEntries(LINK_FIELDS.map((f) => [f.key, linkError(draft.links[f.key], f.hosts)])) as Record<string, string | null>,
  };
  const hasErrors = Boolean(errors.name || errors.username || errors.bio || Object.values(errors.links).some(Boolean));

  // Warn before leaving with unsaved changes: in-app navigation…
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  // …and closing/reloading the tab.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSavedAt(null);
  }

  function save() {
    const cleaned: Profile = { ...draft, displayName: draft.displayName.trim(), location: draft.location.trim(), bio: draft.bio.trim() };
    const ok = replace({ ...settings, profile: cleaned });
    if (!ok) {
      setSaveError("Couldn't save — this browser's storage is full or blocked. Try a smaller photo.");
      return;
    }
    setDraft(cleaned);
    setSaveError(null);
    setSavedAt(Date.now());
  }

  return (
    <SettingsPage
      title="Edit profile"
      footer={
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[0.7812rem] text-[var(--color-ns-muted)]" role="status" aria-live="polite">
            {saveError ? <span className="text-[var(--color-ns-red)]">{saveError}</span> : dirty ? "Unsaved changes" : savedAt ? "Saved ✓" : "All changes saved"}
          </p>
          <button type="button" className="btn-primary" disabled={!dirty || hasErrors} onClick={save}>
            Save
          </button>
        </div>
      }
    >
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ns-raised)] font-heading text-2xl font-bold text-[var(--color-ns-text)] ring-2 ring-[var(--color-ns-purple)]/50">
          {draft.avatar ? <img src={draft.avatar} alt="Your profile photo" className="h-full w-full object-cover" /> : initialsOf(draft.displayName)}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !min-h-0 px-3.5 py-2 text-[0.8125rem]" onClick={() => fileRef.current?.click()}>
            {draft.avatar ? "Change photo" : "Upload photo"}
          </button>
          {draft.avatar && (
            <button type="button" className="btn-ghost !min-h-0 px-3.5 py-2 text-[0.8125rem] text-[var(--color-ns-red)]" onClick={() => set("avatar", null)}>
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCropFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <SettingsSection title="About you">
        <Field id={ids.name} label="Display name" error={errors.name}>
          <input id={ids.name} className={INPUT} value={draft.displayName} maxLength={DISPLAY_NAME_MAX + 10} onChange={(e) => set("displayName", e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={`${ids.name}-msg`} autoComplete="name" />
        </Field>
        <Field id={ids.user} label="Username" error={errors.username} hint="Letters, numbers, dots and underscores. Availability is checked once accounts launch.">
          <div className="flex items-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] focus-within:border-[var(--color-ns-purple)]">
            <span className="pl-3.5 text-[0.875rem] text-[var(--color-ns-dim)]">@</span>
            <input
              id={ids.user}
              className="w-full bg-transparent py-2.5 pl-1 pr-3.5 text-[0.875rem] text-[var(--color-ns-text)] focus:outline-none"
              value={draft.username}
              onChange={(e) => set("username", e.target.value.toLowerCase().replace(/\s/g, ""))}
              aria-invalid={Boolean(errors.username)}
              aria-describedby={`${ids.user}-msg`}
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
            />
          </div>
        </Field>
        <Field
          id={ids.bio}
          label="Bio"
          error={errors.bio}
          hint={
            <span className={draft.bio.length > BIO_MAX - 20 ? "text-[var(--color-ns-amber)]" : undefined}>
              {draft.bio.length}/{BIO_MAX}
            </span>
          }
        >
          <textarea id={ids.bio} rows={3} className={`${INPUT} resize-none`} value={draft.bio} onChange={(e) => set("bio", e.target.value.slice(0, BIO_MAX + 40))} aria-invalid={Boolean(errors.bio)} aria-describedby={`${ids.bio}-msg`} placeholder="Guitarist from Goa. Learning samba and bossa nova." />
        </Field>
        <Field id={ids.loc} label="Location">
          <input id={ids.loc} className={INPUT} value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="City" autoComplete="address-level2" />
        </Field>
      </SettingsSection>

      <SettingsSection title="Your music">
        <div className="px-4 py-3.5">
          <p className="mb-2 text-[0.8125rem] font-semibold text-[var(--color-ns-text)]">Instruments I play</p>
          <ChipGroup label="Instruments I play" options={INSTRUMENT_CHIPS} selected={draft.instruments} onChange={(v) => set("instruments", v)} />
        </div>
        <SettingsSelect label="Skill level" value={draft.skill} options={OPTIONS.skill} onChange={(v) => set("skill", v)} />
        <div className="px-4 py-3.5">
          <p className="mb-2 text-[0.8125rem] font-semibold text-[var(--color-ns-text)]">Favourite genres</p>
          <ChipGroup label="Favourite genres" options={GENRE_CHIPS} selected={draft.genres} onChange={(v) => set("genres", v)} />
        </div>
      </SettingsSection>

      <SettingsSection title="Links">
        {LINK_FIELDS.map((f) => (
          <Field key={f.key} id={`link-${f.key}`} label={f.label} error={errors.links[f.key]}>
            <input
              id={`link-${f.key}`}
              type="url"
              inputMode="url"
              className={INPUT}
              value={draft.links[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => set("links", { ...draft.links, [f.key]: e.target.value })}
              aria-invalid={Boolean(errors.links[f.key])}
              aria-describedby={`link-${f.key}-msg`}
              spellCheck={false}
            />
          </Field>
        ))}
      </SettingsSection>

      <SettingsSection title="Visibility" note="Profiles aren't visible to anyone else yet — there are no public profiles in the beta.">
        <SettingsSelect
          label="Profile visibility"
          value={draft.visibility}
          options={[
            { value: "public", label: "Public" },
            { value: "private", label: "Private" },
          ]}
          onChange={(v) => set("visibility", v)}
          disabled
          badge={<ComingSoonBadge />}
        />
      </SettingsSection>

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(url) => {
            set("avatar", url);
            setCropFile(null);
          }}
        />
      )}

      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Discard unsaved changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        <p>You've changed your profile but haven't saved it.</p>
      </ConfirmDialog>
    </SettingsPage>
  );
}
