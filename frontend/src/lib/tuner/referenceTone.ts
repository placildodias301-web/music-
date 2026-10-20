/** Synthesised reference tone (Web Audio): one voice at a time, so taps never pile up. */

export interface ReferenceTone {
  /** Plays `frequency`; stops whatever was playing. Returns how long (ms) the microphone should ignore input. */
  play(frequency: number): number;
  stop(): void;
  /** Stop and release the AudioContext. */
  dispose(): void;
}

const DURATION_S = 2.2;

export function createReferenceTone(): ReferenceTone {
  let ctx: AudioContext | null = null;
  let stopCurrent: (() => void) | null = null;

  function context(): AudioContext | null {
    try {
      if (!ctx || ctx.state === "closed") {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctor();
      }
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function stop() {
    stopCurrent?.();
    stopCurrent = null;
  }

  return {
    play(frequency) {
      const c = context();
      if (!c) return 0;
      stop();
      const now = c.currentTime;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.28, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + DURATION_S);
      gain.connect(c.destination);
      // A soft triangle plus a quiet octave keeps low notes audible on phone speakers.
      const voices = [c.createOscillator(), c.createOscillator()];
      voices[0].type = "triangle";
      voices[1].type = "sine";
      voices[0].frequency.setValueAtTime(frequency, now);
      voices[1].frequency.setValueAtTime(frequency * 2, now);
      const octaveGain = c.createGain();
      octaveGain.gain.value = 0.25;
      voices[0].connect(gain);
      voices[1].connect(octaveGain).connect(gain);
      voices.forEach((o) => {
        o.start(now);
        o.stop(now + DURATION_S + 0.05);
      });
      stopCurrent = () => {
        try {
          gain.gain.cancelScheduledValues(c.currentTime);
          gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
          voices.forEach((o) => o.stop(c.currentTime + 0.06));
        } catch {
          // already stopped
        }
      };
      return DURATION_S * 1000 + 200;
    },
    stop() {
      stop();
    },
    dispose() {
      stop();
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
