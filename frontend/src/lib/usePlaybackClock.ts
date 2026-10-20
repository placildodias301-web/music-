import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface LoopRange {
  start: number;
  end: number;
}

export interface PlaybackClock {
  getCurrentTime: () => number;
  duration: number;
  isPlaying: boolean;
  /** Set when the browser can't decode/play the file. */
  error: string | null;
  loop: LoopRange | null;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  /** Seeks to `time` and starts playing (used by "click a chord"). */
  playFrom: (time: number) => void;
  setLoop: (loop: LoopRange | null) => void;
  subscribe: (cb: (t: number) => void) => () => void;
}

export function usePlaybackClock(audioRef: RefObject<HTMLAudioElement | null>, src: string | null): PlaybackClock {
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loop, setLoopState] = useState<LoopRange | null>(null);
  const loopRef = useRef<LoopRange | null>(null);
  const playingRef = useRef(false);
  const prevSrc = useRef<string | null>(null);
  const listeners = useRef<Set<(t: number) => void>>(new Set());

  // Track the resume position directly
  const resumeAtRef = useRef(0);

  const getCurrentTime = useCallback(() => {
    if (audioRef.current) return audioRef.current.currentTime;
    return resumeAtRef.current;
  }, [audioRef]);

  const subscribe = useCallback((cb: (t: number) => void) => {
    listeners.current.add(cb);
    return () => {
      listeners.current.delete(cb);
    };
  }, []);

  const publish = useCallback(() => {
    const t = getCurrentTime();
    resumeAtRef.current = t; // keep it updated for swap
    listeners.current.forEach((cb) => cb(t));
  }, [getCurrentTime]);

  useLayoutEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const swapped = prevSrc.current !== null && src !== null && prevSrc.current !== src;
    prevSrc.current = src;
    const resumeAt = swapped ? resumeAtRef.current : 0;
    const resumePlaying = swapped && playingRef.current;

    setError(null);
    setIsPlaying(false);
    playingRef.current = false;
    if (!swapped) {
      loopRef.current = null;
      setLoopState(null);
      resumeAtRef.current = 0;
    }
    publish();

    let frame = 0;
    const tick = () => {
      const range = loopRef.current;
      if (range && audio.currentTime >= range.end) {
        audio.currentTime = range.start;
      }
      publish();
      frame = requestAnimationFrame(tick);
    };

    const onPlay = () => {
      playingRef.current = true;
      setIsPlaying(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onPause = () => {
      playingRef.current = false;
      setIsPlaying(false);
      cancelAnimationFrame(frame);
      publish();
    };
    const onSeeked = () => publish();
    const onTimeUpdate = () => {
      if (audio.paused) publish();
    };
    let pendingResume = swapped;
    const onMeta = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (!pendingResume) return;
      pendingResume = false;
      audio.currentTime = resumeAt;
      if (resumePlaying) audio.play().catch(() => setIsPlaying(false));
    };
    const onError = () => {
      setIsPlaying(false);
      setError("Your browser can't play this file's audio. The analysis below is still valid.");
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("error", onError);
    if (audio.readyState >= 1) onMeta();

    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("error", onError);
    };
  }, [audioRef, src, publish]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch(() => {
      setIsPlaying(false);
    });
  }, [audioRef]);

  const pause = useCallback(() => audioRef.current?.pause(), [audioRef]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play();
    else audio.pause();
  }, [audioRef, play]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const max = Number.isFinite(audio.duration) ? audio.duration : time;
      const t = Math.min(Math.max(0, time), max);
      audio.currentTime = t;
      publish();
    },
    [audioRef, publish]
  );

  const playFrom = useCallback(
    (time: number) => {
      seek(time);
      play();
    },
    [seek, play]
  );

  const setLoop = useCallback((range: LoopRange | null) => {
    loopRef.current = range;
    setLoopState(range);
  }, []);

  return { getCurrentTime, duration, isPlaying, error, loop, toggle, play, pause, seek, playFrom, setLoop, subscribe };
}
