/**
 * Central Wilsify Audio Engine
 * One unified interface for realistic physical instrument playback across the application.
 *
 * Every play call is: plan the voices (voicePlan.ts) → schedule one voice each (KarplusStrong.ts) → mix on the shared
 * bus (AudioContextManager.ts). The promise a play call returns says exactly which voices were scheduled.
 */

import {
  type NotePlayOptions,
  type ChordPlayOptions,
  type ArpeggioPlayOptions,
} from "./AudioTypes";
import { audioContextManager } from "./AudioContextManager";
import { playPhysicalStringNote } from "./KarplusStrong";
import { strumChord, type PlaybackResult } from "./StrumEngine";
import { playArpeggioSequence } from "./ArpeggioEngine";
import { planNoteVoices } from "./voicePlan";

export class WilsifyAudioEngine {
  private static instance: WilsifyAudioEngine | null = null;

  private constructor() {}

  public static getInstance(): WilsifyAudioEngine {
    if (!WilsifyAudioEngine.instance) {
      WilsifyAudioEngine.instance = new WilsifyAudioEngine();
    }
    return WilsifyAudioEngine.instance;
  }

  /**
   * Plays a single note. With `strands` (a mandolin pair, a 12-string octave pair) every strand sounds, each as its own voice.
   * A muted or invalid note makes no sound. Notes overlap freely — they never cut each other off.
   */
  public async playNote(options: NotePlayOptions): Promise<PlaybackResult> {
    const muted = options.isMuted || options.fret === null || (typeof options.fret === "number" && options.fret < 0);
    const voices = muted
      ? []
      : planNoteVoices({
          midi: options.midi,
          fret: options.fret,
          stringIndex: options.stringIndex,
          totalStrings: options.totalStrings,
          strands: options.strands,
          velocity: options.velocity,
        });
    if (!voices.length) return { voices, durationSeconds: 0 };
    const ctx = await audioContextManager.getContext();
    const startTime = options.startTime ?? ctx.currentTime + 0.01;
    for (const v of voices) {
      void playPhysicalStringNote({
        ...options,
        midi: v.midi,
        frequency: v.frequency,
        velocity: v.velocity,
        gain: v.gain,
        fret: v.fret,
        isOpen: v.isOpen,
        isMuted: false,
        startTime: startTime + v.startOffset,
        pan: options.pan ?? v.pan,
      });
    }
    return { voices, durationSeconds: 3 };
  }

  /**
   * Strums a full chord voicing: all sounding strings (and strands) overlap and ring together.
   */
  public async playChord(options: ChordPlayOptions): Promise<PlaybackResult> {
    return strumChord(options);
  }

  /**
   * Plays a chord arpeggio with humanized fingerstyle timing.
   */
  public async playArpeggio(options: ArpeggioPlayOptions): Promise<PlaybackResult> {
    return playArpeggioSequence(options);
  }

  /**
   * Fades out everything that is ringing or still scheduled.
   */
  public stop(): void {
    audioContextManager.stopAll();
  }

  public isSupported(): boolean {
    return audioContextManager.isSupported();
  }

  /**
   * Warms up AudioContext on user interaction if needed.
   */
  public async warmUp(): Promise<AudioContext> {
    return audioContextManager.getContext();
  }
}

export const audioEngine = WilsifyAudioEngine.getInstance();
