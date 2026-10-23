import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "../../lib/audio";

export type PlaybackStatus = "idle" | "playing" | "error";

interface Playable {
  durationSeconds: number;
}

/**
 * Playback state for one audio button: idle → playing → idle, or error when the browser can't start audio.
 * - Clicking again while playing simply restarts it (the engine fades the old sound out first), so rapid clicks never stack.
 * - The state is never left "playing" after the sound is gone, and leaving the page stops the sound this component started.
 */
export function usePlayback() {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const started = useRef(false);
  const token = useRef(0);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const run = useCallback((play: () => Promise<Playable | void> | void) => {
    if (!audioEngine.isSupported()) {
      setStatus("error");
      setError("Audio isn't supported in this browser, so the chord can't be played.");
      return;
    }
    const mine = ++token.current;
    clearTimer();
    setError(null);
    setStatus("playing");
    started.current = true;
    Promise.resolve()
      .then(play)
      .then((result) => {
        if (mine !== token.current) return;
        const seconds = Math.min(result?.durationSeconds ?? 2, 4);
        timer.current = window.setTimeout(() => setStatus("idle"), seconds * 1000);
      })
      .catch((err: unknown) => {
        if (mine !== token.current) return;
        setStatus("error");
        setError(err instanceof Error && err.message ? err.message : "The audio couldn't start. Click again, or check that your browser isn't blocking sound.");
      });
  }, []);

  const stop = useCallback(() => {
    token.current++;
    clearTimer();
    audioEngine.stop();
    setStatus("idle");
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (started.current) audioEngine.stop();
    },
    [],
  );

  return { status, playing: status === "playing", error, run, stop };
}
