export interface PracticePreferences {
  speed: number;
  loop: boolean;
  autoTempoEnabled: boolean;
  metronomeRunning?: boolean;
  preferredMode?: "full_audio" | "chord_practice";
}

export const ALLOWED_PRACTICE_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
export type PracticeSpeed = (typeof ALLOWED_PRACTICE_SPEEDS)[number];

const PREFS_PREFIX = "wilsify.practice.prefs.";

export function getPracticePreferencesKey(songIdentifier: string): string {
  const stripped = songIdentifier.startsWith("file:") ? songIdentifier.slice(5) : songIdentifier;
  return `${PREFS_PREFIX}${stripped}`;
}

export function normalizePracticeSpeed(raw: unknown): PracticeSpeed {
  if (typeof raw === "number" && (ALLOWED_PRACTICE_SPEEDS as readonly number[]).includes(raw)) {
    return raw as PracticeSpeed;
  }
  return 1;
}

export function loadPracticePreferences(songIdentifier: string | null | undefined): PracticePreferences | null {
  if (!songIdentifier || typeof songIdentifier !== "string") return null;
  const key = getPracticePreferencesKey(songIdentifier);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PracticePreferences>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const speed = normalizePracticeSpeed(parsed.speed);
    const loop = typeof parsed.loop === "boolean" ? parsed.loop : false;
    const autoTempoEnabled = typeof parsed.autoTempoEnabled === "boolean" ? parsed.autoTempoEnabled : false;
    const metronomeRunning = typeof parsed.metronomeRunning === "boolean" ? parsed.metronomeRunning : false;
    const preferredMode =
      parsed.preferredMode === "chord_practice" || parsed.preferredMode === "full_audio"
        ? parsed.preferredMode
        : undefined;

    return { speed, loop, autoTempoEnabled, metronomeRunning, preferredMode };
  } catch {
    return null;
  }
}

export function savePracticePreferences(
  songIdentifier: string | null | undefined,
  prefs: PracticePreferences
): void {
  if (!songIdentifier || typeof songIdentifier !== "string") return;
  const key = getPracticePreferencesKey(songIdentifier);
  try {
    const clean: PracticePreferences = {
      speed: normalizePracticeSpeed(prefs.speed),
      loop: Boolean(prefs.loop),
      autoTempoEnabled: Boolean(prefs.autoTempoEnabled),
      metronomeRunning: Boolean(prefs.metronomeRunning),
      ...(prefs.preferredMode ? { preferredMode: prefs.preferredMode } : {}),
    };
    localStorage.setItem(key, JSON.stringify(clean));
  } catch {
    // Non-fatal if localStorage is restricted
  }
}

export function getMicrophoneErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name?: unknown }).name);
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Microphone permission was denied. Enable it in your browser settings to use pitch tracking.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone was found.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Your microphone is being used by another app.";
    }
    if (name === "SecurityError") {
      return "Microphone access requires HTTPS or localhost.";
    }
  }
  return "Couldn't access the microphone — accuracy tracking needs mic access.";
}
