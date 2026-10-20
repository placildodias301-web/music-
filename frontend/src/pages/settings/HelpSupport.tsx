import { useMemo, useState } from "react";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ComingSoonBadge, SettingsRow, SettingsSection } from "../../components/settings/SettingsRows";
import { SUPPORT_EMAIL, bugReportMailto, supportMailto } from "../../lib/appInfo";

/** Answers describe what the app actually does today. Keep them in sync with the product. */
const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I pay credits for each analysis?",
    a: "Not during the beta. The Plans page shows what each feature will cost in credits, but credits aren't charged yet and every feature works on the Free plan.",
  },
  {
    q: "How accurate are the chords?",
    a: "Wilsify reads major, minor, 7th and minor-7th chords from the audio with signal processing (librosa), not a trained AI model. Clean recordings — a guitar or piano with voice — come out best. Dense mixes, heavy reverb, distortion and live crowd noise make chords harder to read; anything the analysis wasn't sure about is marked with a dashed outline and a ?, along with what it might be instead.",
  },
  {
    q: "Why does the tempo say “Estimated”?",
    a: "Some songs have no steady drum pulse — samba, bossa nova, acoustic songs without drums. Wilsify then works the tempo out from the rhythm and from how often the chord pattern repeats, and labels it Estimated. If a tempo ever feels off, it is usually double or half the speed you feel. The time signature is always an estimate from where the beats are accented.",
  },
  {
    q: "A chord is wrong — how do I correct it?",
    a: "You can't edit chords in the app yet. Uncertain chords show their most likely alternative, so check those first. You can transpose or apply a capo from Transpose & Capo on the analysis page, and the timeline, voicings and exports all follow it. Please report clear mistakes with “Report a bug” so we can improve the analyser.",
  },
  {
    q: "What can I export?",
    a: "From an analysis: a chord-chart PDF (lead sheet) in a dark or print-friendly light style, and a MIDI file of the progression. Both follow your transpose and capo settings. Settings → Account → Export my data downloads everything Wilsify stores about you as a ZIP.",
  },
  {
    q: "Does Wilsify work offline?",
    a: "No. Analysis runs on the Wilsify server, so you need a connection to analyse a song. Saved analyses still open once they've loaded — but without audio, because uploaded songs aren't stored.",
  },
  {
    q: "What happens to the songs I upload?",
    a: "They're analysed on the server and deleted straight away. They aren't kept, shared or used to train anything. If you save a song to your Library, only its analysis results (chords, key, tempo) are kept in your account.",
  },
  {
    q: "Which files can I upload?",
    a: "Audio or video up to 100 MB: MP3, WAV, M4A, FLAC, MP4, MOV and WEBM. You can also paste a link to a YouTube video, Instagram Reel or similar, and Wilsify fetches the audio for you.",
  },
  {
    q: "Where is my data stored? Can I use it on another device?",
    a: "Your Library, practice history and AI chats are saved to your Wilsify account, so signing in on another device brings them with you. Profile and app settings stay in the browser you set them in. Use Export my data to keep a copy.",
  },
];

export function HelpSupport() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ.map((item, i) => ({ ...item, i })).filter((item) => !q || `${item.q} ${item.a}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <SettingsPage title="Help & support">
      <div className="relative">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ns-dim)]" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help"
          aria-label="Search help articles"
          className="w-full rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] py-3 pl-10 pr-4 text-[0.875rem] text-[var(--color-ns-text)] placeholder:text-[var(--color-ns-dim)] focus:border-[var(--color-ns-purple)] focus:outline-none"
        />
      </div>

      <SettingsSection title="Frequently asked">
        {results.length === 0 && <p className="px-4 py-4 text-[0.8438rem] text-[var(--color-ns-muted)]">No answers match “{query}”. Try another word, or email us below.</p>}
        {results.map((item) => {
          const expanded = open === item.i || (query.trim() !== "" && results.length <= 2);
          return (
            <div key={item.i}>
              <h3>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`faq-${item.i}`}
                  onClick={() => setOpen(open === item.i ? null : item.i)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[0.875rem] font-semibold text-[var(--color-ns-text)] transition-colors hover:bg-[var(--color-ns-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ns-purple-light)]"
                >
                  <span className="flex-1">{item.q}</span>
                  <span aria-hidden="true" className="w-4 text-center font-mono text-lg leading-none text-[var(--color-ns-purple-light)]">
                    {expanded ? "−" : "+"}
                  </span>
                </button>
              </h3>
              {expanded && (
                <p id={`faq-${item.i}`} className="px-4 pb-4 text-[0.8438rem] leading-relaxed text-[var(--color-ns-muted)]">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </SettingsSection>

      <SettingsSection title="Talk to us">
        <SettingsRow label="Email support" description={SUPPORT_EMAIL} href={supportMailto()} />
        <SettingsRow label="Community" description="Ask other players" disabled badge={<ComingSoonBadge />} />
        <SettingsRow label="Report a bug" description="Opens an email with your app version and browser details filled in" href={bugReportMailto()} />
      </SettingsSection>
    </SettingsPage>
  );
}
