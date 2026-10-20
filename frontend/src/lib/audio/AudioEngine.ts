/**
 * Central Wilsify Audio Engine
 * One unified interface for realistic physical instrument playback across the application.
 */

import {
  type NotePlayOptions,
  type ChordPlayOptions,
  type ArpeggioPlayOptions,
} from "./AudioTypes";
import { audioContextManager } from "./AudioContextManager";
import { playPhysicalStringNote } from "./KarplusStrong";
import { strumChord } from "./StrumEngine";
import { playArpeggioSequence } from "./ArpeggioEngine";

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
   * Plays a single physical instrument note.
   */
  public async playNote(options: NotePlayOptions): Promise<void> {
    return playPhysicalStringNote(options);
  }

  /**
   * Strums a full chord voicing with realistic physical string timing.
   */
  public async playChord(options: ChordPlayOptions): Promise<void> {
    return strumChord(options);
  }

  /**
   * Plays a chord arpeggio with humanized fingerstyle timing.
   */
  public async playArpeggio(options: ArpeggioPlayOptions): Promise<void> {
    return playArpeggioSequence(options);
  }

  /**
   * Stops all currently ringing audio voices.
   */
  public stop(): void {
    audioContextManager.stopAll();
  }

  /**
   * Warms up AudioContext on user interaction if needed.
   */
  public async warmUp(): Promise<AudioContext> {
    return audioContextManager.getContext();
  }
}

export const audioEngine = WilsifyAudioEngine.getInstance();
