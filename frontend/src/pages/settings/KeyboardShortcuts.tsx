import { SettingsPage } from "../../components/settings/SettingsPage";
import { SettingsSection } from "../../components/settings/SettingsRows";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

/** Only shortcuts that are actually wired up in the app. */
const GROUPS: { title: string; items: { keys: string[]; action: string }[] }[] = [
  {
    title: "Anywhere",
    items: [
      { keys: [MOD, "K"], action: "Search songs and chords" },
      { keys: ["Esc"], action: "Close menus and dialogs" },
    ],
  },
  {
    title: "Analysis page (with audio)",
    items: [
      { keys: ["Space"], action: "Play / pause" },
      { keys: ["←"], action: "Back 5 seconds" },
      { keys: ["→"], action: "Forward 5 seconds" },
      { keys: ["L"], action: "Loop the current chord / stop looping" },
    ],
  },
  {
    title: "Practice",
    items: [{ keys: ["M"], action: "Start / stop the metronome" }],
  },
  {
    title: "AI Assistant",
    items: [{ keys: [MOD, "U"], action: "Upload a song" }],
  },
];

export function KeyboardShortcuts() {
  return (
    <SettingsPage title="Keyboard shortcuts">
      {GROUPS.map((g) => (
        <SettingsSection key={g.title} title={g.title}>
          {g.items.map((item) => (
            <div key={item.action} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 text-[0.875rem] text-[var(--color-ns-text)]">{item.action}</span>
              <span className="flex gap-1">
                {item.keys.map((k) => (
                  <kbd key={k} className="min-w-[28px] rounded-lg border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-2 py-1 text-center font-mono text-[0.75rem] font-semibold text-[var(--color-ns-text)] shadow-[0_2px_0_var(--color-ns-border)]">
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </SettingsSection>
      ))}
      <p className="px-1 text-[0.7812rem] text-[var(--color-ns-dim)]">Shortcuts don't fire while you're typing in a text box.</p>
    </SettingsPage>
  );
}
