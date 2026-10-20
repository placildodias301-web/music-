/**
 * Every user setting, its default and its allowed values. One profile per
 * browser for now (there are no accounts yet); settingsService.ts decides
 * where it's stored, so this shape can later come from an API unchanged.
 */

export type AnalysisQuality = "fast" | "balanced" | "high";
export type TuningId = "standard" | "drop-d" | "half-step-down" | "dadgad" | "open-g" | "custom";
export type MetronomeSound = "woodblock" | "beep" | "clave" | "hihat";
export type Accidentals = "auto" | "sharps" | "flats";
export type NotationSystem = "letters" | "solfege" | "sargam";
export type Instrument = "guitar" | "ukulele" | "piano" | "bass" | "vocals";
export type CapoDefault = "easiest" | "none";
export type Appearance = "dark" | "light" | "system";
export type Accent = "violet" | "blue" | "cyan" | "mint" | "amber" | "coral";
export type TextSize = "small" | "default" | "large" | "larger";
export type HistoryRetention = "30" | "90" | "forever";
export type SkillLevel = "Beginner" | "Intermediate" | "Advanced" | "Pro";
export type PlanId = "free" | "pro" | "studio";

export interface ProfileLinks {
  instagram: string;
  youtube: string;
  spotify: string;
  soundcloud: string;
  website: string;
}

export interface Profile {
  displayName: string;
  username: string;
  bio: string;
  /** Square JPEG data URL produced by the cropper, or null. */
  avatar: string | null;
  instruments: string[];
  skill: SkillLevel;
  genres: string[];
  location: string;
  links: ProfileLinks;
  visibility: "public" | "private";
}

export interface Settings {
  version: 1;
  profile: Profile;
  plan: PlanId;
  audio: {
    analysisQuality: AnalysisQuality;
    tuning: TuningId;
    /** Six notes low → high, e.g. "D2 A2 D3 G3 B3 E4" (used when tuning is "custom"). */
    customTuning: string;
    /** Tuning reference for A4, 415–466 Hz. */
    a4: number;
    metronomeSound: MetronomeSound;
    /** 0–100 */
    metronomeVolume: number;
    /** Bars of count-in before playback starts. */
    countIn: 0 | 1 | 2;
  };
  display: {
    accidentals: Accidentals;
    notation: NotationSystem;
    instrument: Instrument;
    leftHanded: boolean;
    capo: CapoDefault;
    playbackSpeed: number;
  };
  practice: {
    dailyGoalMinutes: number;
    autoLoop: boolean;
    showUncertain: boolean;
  };
  app: {
    appearance: Appearance;
    accent: Accent;
    textSize: TextSize;
    reduceMotion: boolean;
    language: "en-IN";
    wifiOnly: boolean;
  };
  storage: {
    historyRetention: HistoryRetention;
  };
  privacy: {
    improveAi: boolean;
    publicProfile: boolean;
    analytics: boolean;
    recommendations: boolean;
    shareActivity: boolean;
  };
  notifications: {
    analysisFinished: boolean;
    exportReady: boolean;
    practiceReminders: boolean;
    practiceTime: string;
    streak: boolean;
    features: boolean;
    offers: boolean;
    quietHours: { enabled: boolean; start: string; end: string; days: number[] };
  };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  profile: {
    displayName: "Musician",
    username: "",
    bio: "",
    avatar: null,
    instruments: ["Guitar"],
    skill: "Intermediate",
    genres: [],
    location: "",
    links: { instagram: "", youtube: "", spotify: "", soundcloud: "", website: "" },
    visibility: "private",
  },
  plan: "free",
  audio: {
    analysisQuality: "balanced",
    tuning: "standard",
    customTuning: "E2 A2 D3 G3 B3 E4",
    a4: 440,
    metronomeSound: "woodblock",
    metronomeVolume: 70,
    countIn: 0,
  },
  display: {
    accidentals: "auto",
    notation: "letters",
    instrument: "guitar",
    leftHanded: false,
    capo: "none",
    playbackSpeed: 1,
  },
  practice: { dailyGoalMinutes: 20, autoLoop: false, showUncertain: true },
  app: { appearance: "dark", accent: "violet", textSize: "default", reduceMotion: false, language: "en-IN", wifiOnly: false },
  storage: { historyRetention: "forever" },
  privacy: { improveAi: false, publicProfile: false, analytics: false, recommendations: false, shareActivity: false },
  notifications: {
    analysisFinished: true,
    exportReady: true,
    practiceReminders: false,
    practiceTime: "19:00",
    streak: true,
    features: true,
    offers: false,
    quietHours: { enabled: false, start: "22:00", end: "07:00", days: [0, 1, 2, 3, 4, 5, 6] },
  },
};

export interface Option<T extends string | number> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Shown as a small badge next to a disabled option. */
  badge?: string;
}

export const TUNINGS: Record<TuningId, { label: string; notes: string }> = {
  standard: { label: "Standard E", notes: "E2 A2 D3 G3 B3 E4" },
  "drop-d": { label: "Drop D", notes: "D2 A2 D3 G3 B3 E4" },
  "half-step-down": { label: "Half-step down", notes: "D#2 G#2 C#3 F#3 A#3 D#4" },
  dadgad: { label: "DADGAD", notes: "D2 A2 D3 G3 A3 D4" },
  "open-g": { label: "Open G", notes: "D2 G2 D3 G3 B3 D4" },
  custom: { label: "Custom", notes: "" },
};

export const OPTIONS = {
  analysisQuality: [
    { value: "fast", label: "Fast" },
    { value: "balanced", label: "Balanced" },
    { value: "high", label: "High (slower)" },
  ] as Option<AnalysisQuality>[],
  tuning: (Object.keys(TUNINGS) as TuningId[]).map((id) => ({
    value: id,
    label: TUNINGS[id].label,
    description: id === "custom" ? "Enter your own six notes" : TUNINGS[id].notes,
  })) as Option<TuningId>[],
  metronomeSound: [
    { value: "woodblock", label: "Woodblock" },
    { value: "beep", label: "Beep" },
    { value: "clave", label: "Clave" },
    { value: "hihat", label: "Hi-hat" },
  ] as Option<MetronomeSound>[],
  countIn: [
    { value: "0", label: "Off" },
    { value: "1", label: "1 bar" },
    { value: "2", label: "2 bars" },
  ] as Option<"0" | "1" | "2">[],
  accidentals: [
    { value: "auto", label: "Auto by key", description: "Flats in flat keys (F, B♭, E♭…), sharps otherwise" },
    { value: "sharps", label: "Sharps (C♯)" },
    { value: "flats", label: "Flats (D♭)" },
  ] as Option<Accidentals>[],
  notation: [
    { value: "letters", label: "Letters", description: "C D E F G A B" },
    { value: "solfege", label: "Solfège", description: "Do Re Mi — fixed Do (Do = C)" },
    { value: "sargam", label: "Indian sargam", description: "Sa Re Ga — relative to the song's key (Sa = tonic)" },
  ] as Option<NotationSystem>[],
  instrument: [
    { value: "guitar", label: "Guitar" },
    { value: "ukulele", label: "Ukulele" },
    { value: "piano", label: "Piano" },
    { value: "bass", label: "Bass", description: "Shows guitar shapes until bass diagrams arrive" },
    { value: "vocals", label: "Vocals", description: "Shows the piano view (the notes to sing)" },
  ] as Option<Instrument>[],
  capo: [
    { value: "easiest", label: "Easiest", description: "Apply the capo with the most open chords" },
    { value: "none", label: "None" },
  ] as Option<CapoDefault>[],
  playbackSpeed: [
    { value: "0.5", label: "0.5×" },
    { value: "0.75", label: "0.75×" },
    { value: "0.9", label: "0.9×" },
    { value: "1", label: "1× (normal)" },
    { value: "1.25", label: "1.25×" },
  ] as Option<string>[],
  dailyGoal: [5, 10, 15, 20, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` })) as Option<string>[],
  appearance: [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "system", label: "System", description: "Follow your device setting" },
  ] as Option<Appearance>[],
  accent: [
    { value: "violet", label: "Violet" },
    { value: "blue", label: "Blue" },
    { value: "cyan", label: "Cyan" },
    { value: "mint", label: "Mint" },
    { value: "amber", label: "Amber" },
    { value: "coral", label: "Coral" },
  ] as Option<Accent>[],
  textSize: [
    { value: "small", label: "Small" },
    { value: "default", label: "Default" },
    { value: "large", label: "Large" },
    { value: "larger", label: "Larger" },
  ] as Option<TextSize>[],
  language: [
    { value: "en-IN", label: "English (India)" },
    { value: "hi-IN", label: "हिन्दी (Hindi)", disabled: true, badge: "Coming soon" },
    { value: "kok-IN", label: "कोंकणी (Konkani)", disabled: true, badge: "Coming soon" },
    { value: "pt-PT", label: "Português", disabled: true, badge: "Coming soon" },
  ] as Option<string>[],
  historyRetention: [
    { value: "30", label: "Keep 30 days" },
    { value: "90", label: "Keep 90 days" },
    { value: "forever", label: "Keep forever" },
  ] as Option<HistoryRetention>[],
  skill: ["Beginner", "Intermediate", "Advanced", "Pro"].map((s) => ({ value: s, label: s })) as Option<SkillLevel>[],
};

export const INSTRUMENT_CHIPS = ["Guitar", "Acoustic guitar", "Electric guitar", "Bass", "Ukulele", "Piano", "Keyboard", "Vocals", "Drums", "Violin", "Tabla", "Harmonium", "Cavaquinho"];
export const GENRE_CHIPS = ["Pop", "Rock", "Indie", "Bollywood", "Konkani", "Jazz", "Blues", "Samba", "Bossa nova", "Folk", "Classical", "Hip-hop", "R&B", "Metal", "EDM", "Devotional"];

export function optionLabel<T extends string | number>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? String(value);
}
