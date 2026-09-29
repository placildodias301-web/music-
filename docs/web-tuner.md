# Web Tuner

The web dashboard's instrument tuner — the counterpart to the mobile app's tuner (`mobile_app/app/tuner/`), sharing the same note-naming math, pitch-detection algorithm, and tuning-preset data via `packages/shared/src/tuner/`.

## Architecture

```
packages/shared/src/tuner/          ← platform-agnostic, pure functions/data
├── types.ts            NoteInfo, TuningPreset
├── noteUtils.ts         frequencyToNote(), isInTune(), getTargetFrequency()
├── pitchDetection.ts    detectPitchAutocorrelation() — the actual DSP algorithm
├── tunings.ts            TUNING_PRESETS (9 presets), PREMIUM_TUNING_IDS
└── index.ts              barrel export

web-app/src/hooks/useWebTuner.ts     ← Web Audio I/O, imports the above
web-app/src/components/tuner/        ← TunerNeedle, TunerDisplay, TunerWaveform, TuningSelector
web-app/src/app/(dashboard)/tuner/page.tsx

mobile_app/src/tuner/useTunerEngine.ts   ← Expo Audio I/O, imports the same shared module
mobile_app/app/tuner/index.tsx            ← derives its TUNINGS map from the same shared presets
```

**What's actually shared vs. platform-specific:** every pure computation — turning a frequency into a note name and cents deviation, deciding "in tune," running the autocorrelation pitch-detection algorithm on a buffer of samples, and the tuning preset data itself (string names, target frequencies, which tunings are premium) — lives once in `packages/shared/src/tuner/` and is imported by both platforms. Everything platform-specific — how audio actually gets captured (`getUserMedia`/`AnalyserNode` on web vs. `expo-av` recording + WAV parsing on mobile), and how the UI renders — stays in each platform's own code, because those genuinely can't be shared (there's no Web Audio API on a phone, and no `expo-av` in a browser).

### Pitch detection

Both platforms run the same normalized-autocorrelation (NSDF/McLeod-style) algorithm, `detectPitchAutocorrelation()`. The only difference is where the sample buffer comes from:

- **Web**: a continuous `AnalyserNode` buffer (8192 samples via `getFloatTimeDomainData`), read once per `requestAnimationFrame` tick.
- **Mobile**: 90ms recorded WAV chunks (Expo doesn't expose a live PCM stream the way Web Audio does), decoded from base64 and parsed into PCM samples per chunk.

Because the algorithm itself — and its thresholds (0.008 RMS silence gate, 0.72 minimum correlation, 20–2000Hz search range) — is identical code in both places, a string that reads "in tune" on web reads "in tune" on mobile for the same physical input.

### Module resolution

`@wilsify/shared/tuner` is wired as an additional path alias alongside the existing `@wilsify/shared` entry, in both:
- `web-app/tsconfig.json` (`paths`) — Next.js resolves tsconfig paths natively.
- `mobile_app/babel.config.js` (`babel-plugin-module-resolver`) + `mobile_app/tsconfig.json` (`paths`, for type-checking) — Metro doesn't read tsconfig paths, hence the babel alias.

## Browser support

Requires the Web Audio API (`AudioContext`, `AnalyserNode`) and `navigator.mediaDevices.getUserMedia`:

| Browser | Support |
|---|---|
| Chrome / Edge (recent) | ✅ Full support |
| Firefox (recent) | ✅ Full support |
| Safari 14.1+ | ✅ Full support (Safari's `AudioContext` requires a user gesture to start, which the Start button naturally provides) |
| Any browser over plain HTTP (not `localhost`) | ❌ `getUserMedia` requires a secure context (HTTPS or `localhost`) — this is a browser security requirement, not something the app can work around |
| iOS Safari in an in-app WebView (some apps) | ⚠️ Some third-party WebViews restrict microphone access regardless of page code |

## Permissions

The tuner requests microphone access only when the user presses Start (`useWebTuner().start()`) — never on page load. Three outcomes:

1. **Granted** — the analyser starts immediately.
2. **Denied** (`NotAllowedError`/`PermissionDeniedError`) — `error` is set to a message telling the user to allow microphone access in browser settings; the page shows this via `role="alert"`.
3. **No microphone found** (`NotFoundError`) — a distinct message is shown rather than a generic failure.

There's no persistent permission-state tracking beyond what the browser itself remembers — if a user denies once, the browser (not this app) decides whether to re-prompt on the next Start click or require a manual settings change, which is standard `getUserMedia` behavior.

## Performance

- The `AudioContext` is **suspended** (not closed) on Stop, so a subsequent Start is fast — recreating a context on every start/stop would be wasteful.
- The animation-frame loop is cancelled on Stop and on component unmount; the `MediaStream`'s tracks are stopped so the browser's microphone-in-use indicator turns off.
- React state updates happen once per animation frame (tied to display refresh rate, typically 60fps) rather than on every audio callback, keeping re-renders bounded.

## Troubleshooting

**"Microphone access was denied" but the user didn't see a browser prompt.** The browser remembers a prior denial for the site's origin. The user needs to reset the permission from the browser's site settings (usually via the padlock/info icon in the address bar), not from inside the app.

**Tuner shows no pitch even though the mic is active.** Check the input level — the RMS silence gate (0.008) means very quiet input (or a muted/near-silent input device) is intentionally ignored rather than reported as a wrong note. Also check the browser tab isn't muted at the OS/browser-tab level, which silences the input differently than a permission denial.

**Low notes (bass, low guitar E) read as an octave off or don't register.** The autocorrelation window (8192 samples) needs roughly one full period of the lowest frequency to detect it reliably; extremely low or very quiet bass input can still be borderline. If this becomes a real issue in practice, increasing `FFT_SIZE` in `useWebTuner.ts` trades a little more latency for lower-frequency accuracy.

**Works on mobile but a specific tuning is missing/locked on web (or vice versa).** Both platforms read from the same `TUNING_PRESETS` list, so this shouldn't happen — if it does, check `PREMIUM_TUNING_IDS` in `packages/shared/src/tuner/tunings.ts` and the `plan` check in `web-app/src/app/(dashboard)/tuner/page.tsx` / `mobile_app/src/store/planStore.ts` for a mismatch, since gating logic is duplicated (not shared) between the two apps' plan stores.

## Known differences from mobile

- **Picker UI**: mobile's `TuningSelector` is a full-screen bottom sheet (the right pattern for a phone); web uses a dropdown panel anchored to a trigger pill, matching how pickers work elsewhere in the web dashboard. Content and premium-gating logic are the same, just not the container.
- **Haptics**: mobile gives haptic feedback on tuning-lock/selection events (`expo-haptics`); there's no web equivalent, so web relies on the toast notification and visual state instead.
- **Default string selection**: mobile's tuner defaults to string index 4 on first load; web defaults to index 0 (both reset to index 0 on tuning change). This is a minor, intentional simplification, not a bug.

Both platforms now expose the same 9 named tunings plus Chromatic mode — Bass Standard and Chromatic were mobile-side gaps as of the initial shared-package migration, closed in a follow-up pass (mobile's `TUNINGS` map, `StringSelector` visibility, and target-frequency display were updated to handle Chromatic's empty-strings case the same way the web `TunerDisplay` already did).

## Remaining optional improvements

- **AudioWorklet-based detection** — the current implementation runs autocorrelation on the main thread inside a `requestAnimationFrame` callback. An `AudioWorkletProcessor` would move that work to the audio rendering thread, reducing the chance of dropped frames if the main thread is busy (e.g. a heavy re-render elsewhere in the dashboard). Not implemented here since `AnalyserNode` + `rAF` is simpler, has no additional browser-compatibility surface, and the current CPU cost (one autocorrelation pass per animation frame) is small enough not to need it yet.
- **Server-side/CREPE-backed mode** — the AI service already has pitch-detection infrastructure (`ai-service/services/pitch.py`, pYIN-based). A "high-accuracy mode" that streams audio to the backend for CREPE-quality detection instead of client-side autocorrelation is possible but adds network latency that's generally worse for a *real-time* tuner than a client-side algorithm — better suited to the AI service's existing offline/batch analysis use cases than to this interactive tool.
- **Pitch confidence indicator** — surfacing the autocorrelation's confidence score (currently only used internally to decide "no pitch detected") in the UI, so users can tell "quiet/unclear signal" apart from "genuinely no signal," similar to how some professional tuner apps show a confidence meter.
