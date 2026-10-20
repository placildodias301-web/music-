import type { ReactNode } from "react";

const stroke = { stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ICON_PATHS = {
  upload: <path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" {...stroke} />,
  play: <path d="M8 5.5v13a.6.6 0 0 0 .9.5l10.2-6.5a.6.6 0 0 0 0-1L8.9 5a.6.6 0 0 0-.9.5Z" fill="currentColor" />,
  pause: (
    <>
      <rect x="7" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" />
      <rect x="13.8" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" />
    </>
  ),
  arrowRight: <path d="M5 12h14m-5-5 5 5-5 5" {...stroke} />,
  sparkle: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.5-5.7 1.6L12 17.5l-1.8-5.4-5.7-1.6L10.2 9 12 3.5Z" {...stroke} />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" fill="currentColor" />
    </>
  ),
  tuner: (
    <>
      <path d="M4.5 16a8 8 0 1 1 15 0" {...stroke} />
      <path d="m12 16 3.5-5.5" {...stroke} />
      <circle cx="12" cy="16" r="1.4" fill="currentColor" />
    </>
  ),
  chords: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" {...stroke} />
      <path d="M5 8.5h14M9.7 3.5v17M14.3 3.5v17" {...stroke} />
      <circle cx="9.7" cy="12" r="1.3" fill="currentColor" />
      <circle cx="14.3" cy="15.5" r="1.3" fill="currentColor" />
    </>
  ),
  studio: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" {...stroke} />
      <circle cx="8" cy="7" r="1.8" fill="currentColor" />
      <circle cx="15" cy="12" r="1.8" fill="currentColor" />
      <circle cx="10" cy="17" r="1.8" fill="currentColor" />
    </>
  ),
  metronome: (
    <>
      <path d="M9.5 3.5h5l4 17h-13l4-17Z" {...stroke} />
      <path d="m12 15 5-8" {...stroke} />
    </>
  ),
  flame: (
    <path
      d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.7 1.2 2.7 2 3-.5-3 .3-6 1-8.5Z"
      fill="currentColor"
    />
  ),
  star: <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4Z" {...stroke} />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" {...stroke} />
      <path d="M12 7.5V12l3 2" {...stroke} />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l11-2v13" {...stroke} />
      <circle cx="6.5" cy="18" r="2.5" {...stroke} />
      <circle cx="17.5" cy="16" r="2.5" {...stroke} />
    </>
  ),
  key: (
    <>
      <path d="M12 3v12.5" {...stroke} />
      <path d="M12 3c2.5 1 4 2.6 4 5" {...stroke} />
      <circle cx="9.5" cy="16.5" r="2.8" {...stroke} />
    </>
  ),
  scale: <path d="M4 18h3v-3h3v-3h3V9h3V6h4" {...stroke} />,
  check: <path d="M20 6 9 17l-5-5" {...stroke} strokeWidth={2.2} />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.9" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </>
  ),
} satisfies Record<string, ReactNode>;
