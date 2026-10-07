import { useEffect, useRef, useState, useCallback } from "react";
import { waveHeights } from "./home/homeUtils";

export interface AudioReactiveWaveformProps {
  /** The HTMLAudioElement to connect and analyze in real time. */
  audioElement?: HTMLAudioElement | null;
  /** RefObject to an HTMLAudioElement. */
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  /** Whether the audio is currently playing. */
  isPlaying?: boolean;
  /** Current playback time in seconds. */
  currentTime?: number;
  /** Total audio duration in seconds. */
  duration?: number;
  /** Callback fired when user clicks the waveform to seek to a time in seconds. */
  onSeek?: (timeSeconds: number) => void;
  /** Number of vertical waveform bars (default 36). */
  barCount?: number;
  /** Track BPM from analysis (default 120) to synchronize idle breathing pulses. */
  bpm?: number;
  /** Seed string (e.g. track title) for deterministic base waveform fingerprint. */
  seed?: string | null;
  /** Custom wrapper styling. */
  className?: string;
  /** Height of the waveform container (e.g. 112px). */
  height?: number;
}

// Global WeakMap so that an HTMLMediaElement is never connected via createMediaElementSource more than once
const mediaElementSourceMap = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export function AudioReactiveWaveform({
  audioElement,
  audioRef,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  onSeek,
  barCount = 36,
  bpm = 120,
  seed = "wilsify-hero",
  className = "",
  height = 112,
}: AudioReactiveWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Audio Context & Analyser refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const isWebAudioConnectedRef = useRef(false);

  // State refs for animation loop (avoiding React re-renders on requestAnimationFrame)
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const bpmRef = useRef(bpm);
  const hasAudioLoaded = Boolean(audioElement || (duration > 0));
  const hasAudioLoadedRef = useRef(hasAudioLoaded);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const hoverPercentRef = useRef<number | null>(null);

  // Sync props to refs inside effect to avoid updating refs during render
  useEffect(() => {
    const el = audioRef?.current ?? audioElement;
    isPlayingRef.current = isPlaying;
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
    bpmRef.current = bpm;
    hasAudioLoadedRef.current = Boolean(el || duration > 0);
    hoverPercentRef.current = hoverPercent;
  }, [isPlaying, currentTime, duration, bpm, audioElement, audioRef, hoverPercent]);

  // Smoothing bar heights state maintained across animation frames
  const currentHeightsRef = useRef<number[]>([]);
  const baseHeightsRef = useRef<number[]>([]);

  // Compute base deterministic heights whenever seed or barCount changes
  useEffect(() => {
    const raw = waveHeights(seed ?? "wilsify-hero", barCount);
    baseHeightsRef.current = raw;
    if (currentHeightsRef.current.length !== barCount) {
      currentHeightsRef.current = [...raw];
    }
  }, [seed, barCount]);

  // Connect Web Audio API to audioElement or audioRef
  useEffect(() => {
    const el = audioRef?.current ?? audioElement;
    if (!el) {
      isWebAudioConnectedRef.current = false;
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) {
        console.warn("Web Audio API not supported in this browser; using smooth simulation fallback.");
        return;
      }

      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioCtx();
        audioCtxRef.current = ctx;
      }

      let analyser = analyserRef.current;
      if (!analyser) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 128; // 64 frequency bins
        analyser.smoothingTimeConstant = 0.82; // Liquid smooth decay
        analyser.minDecibels = -85;
        analyser.maxDecibels = -15;
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      }

      // Reconnect or reuse media element source node
      let source = mediaElementSourceMap.get(el);
      if (!source) {
        source = ctx.createMediaElementSource(el);
        mediaElementSourceMap.set(el, source);
      }

      // Connect source -> analyser -> destination
      source.disconnect();
      source.connect(analyser);
      analyser.disconnect();
      analyser.connect(ctx.destination);

      isWebAudioConnectedRef.current = true;
    } catch (err) {
      console.warn("Could not attach Web Audio AnalyserNode to audio element:", err);
      isWebAudioConnectedRef.current = false;
    }

    return () => {
      // Disconnect analyser on cleanup (we don't close the shared ctx prematurely to prevent issues)
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          // ignore
        }
      }
    };
  }, [audioElement, audioRef]);

  // Ensure AudioContext resumes if suspended on playback
  useEffect(() => {
    if (isPlaying && audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, [isPlaying]);

  // High-performance canvas drawing loop with requestAnimationFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let lastTimestamp = performance.now();

    const render = (now: number) => {
      const delta = Math.min((now - lastTimestamp) / 1000, 0.1);
      lastTimestamp = now;

      const width = canvas.width;
      const h = canvas.height;
      if (width === 0 || h === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, h);

      const count = barCount;
      const base = baseHeightsRef.current;
      const heights = currentHeightsRef.current;
      while (heights.length < count) heights.push(30);

      const activePlaying = isPlayingRef.current;
      const loaded = hasAudioLoadedRef.current;
      const curTime = currentTimeRef.current;
      const totalDur = durationRef.current;
      const currentBpm = bpmRef.current || 120;

      // Extract real audio frequency data if playing & connected
      const analyser = analyserRef.current;
      const freqBuffer = freqDataRef.current;
      const hasRealAudio =
        activePlaying &&
        isWebAudioConnectedRef.current &&
        analyser &&
        freqBuffer;

      if (hasRealAudio) {
        try {
          analyser.getByteFrequencyData(freqBuffer);
        } catch {
          // fallback
        }
      }

      // Compute progress (0..1)
      const progress = totalDur > 0 ? Math.min(1, Math.max(0, curTime / totalDur)) : 0;

      // RENDER STATE LOGIC
      // 1. NO AUDIO: gentle, ambient traveling wave ripple
      // 2. AUDIO LOADED BUT NOT PLAYING: stable base silhouette with gentle BPM breathing
      // 3. AUDIO PLAYING: real-time frequency reactivity or tempo-synced dynamic response
      // 4. AUDIO PAUSED: gentle decay settling back to base heights

      const bps = currentBpm / 60;
      const idleWaveTime = now * 0.0018;
      const bpmBreath = 0.9 + 0.1 * Math.sin(now * 0.001 * bps * Math.PI * 2);

      for (let i = 0; i < count; i++) {
        const baseH = base[i] ?? 35;
        // Natural center-weighted acoustic envelope: center is tallest, edges taper gracefully
        const envelope = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / count);

        let targetPercent = baseH;

        if (!loaded) {
          // State 1: NO AUDIO - Ambient idle pulse
          const wavePhase = idleWaveTime + (i / count) * Math.PI * 2.5;
          const wave = 0.55 + 0.45 * Math.sin(wavePhase);
          targetPercent = Math.max(14, baseH * 0.4 * wave * envelope);
        } else if (!activePlaying) {
          // State 2 / 4: LOADED BUT NOT PLAYING / PAUSED
          // Stable waveform with subtle musical breath
          targetPercent = Math.max(16, baseH * bpmBreath * envelope);
        } else {
          // State 3: AUDIO PLAYING
          if (hasRealAudio && freqBuffer) {
            // Map 64 frequency bins across the bars
            // Center bars respond to low & punchy mid frequencies (kick, bass, vocal core)
            // Outer bars respond to rhythmic mids and airy highs
            const binCount = freqBuffer.length;
            const distFromCenter = Math.abs(i - count / 2) / (count / 2); // 0 at center, 1 at edges
            
            // Map center to lower-mid frequencies (bins 2-18), edges to upper-mids/highs (bins 10-45)
            const binIndex = Math.min(
              binCount - 1,
              Math.floor(2 + (1 - distFromCenter) * 16 + distFromCenter * 28)
            );

            const rawVal = freqBuffer[binIndex] ?? 0;
            const energy = rawVal / 255; // 0..1

            // Dynamic boost for musical dynamics
            const boostedEnergy = Math.pow(energy, 1.25);
            targetPercent = Math.max(
              16,
              (baseH * 0.25 + boostedEnergy * 92) * envelope
            );
          } else {
            // Simulated audio-reactive fallback (synced with curTime and BPM)
            const beatPhase = (curTime * bps * Math.PI * 2) + (i * 0.28);
            const dynamicWave = 0.6 + 0.4 * Math.sin(beatPhase);
            targetPercent = Math.max(18, baseH * dynamicWave * envelope);
          }
        }

        // Smooth interpolation: snappy attack for beats, smooth release
        const currentH = heights[i] ?? baseH;
        const speed = targetPercent > currentH ? 24 : 10; // attack vs decay factor
        heights[i] = currentH + (targetPercent - currentH) * Math.min(1, delta * speed);
      }

      // Draw bars onto the canvas
      // Total available width & bar layout calculation
      const gap = Math.max(2, Math.min(5, width / (count * 3)));
      const totalGaps = (count - 1) * gap;
      const barWidth = Math.max(2, Math.min(6, (width - totalGaps) / count));
      const totalWaveWidth = count * barWidth + totalGaps;
      const startX = (width - totalWaveWidth) / 2;
      const centerY = h / 2;

      for (let i = 0; i < count; i++) {
        const barHeight = Math.max(6, (heights[i] / 100) * (h * 0.88));
        const x = startX + i * (barWidth + gap);
        const y = centerY - barHeight / 2;

        const barProgress = i / (count - 1);
        const isPlayed = loaded && barProgress <= progress;
        const isHovered = hoverPercentRef.current !== null && barProgress <= hoverPercentRef.current;
        const isCenter = Math.abs(i - count / 2) < 6;

        ctx.save();

        // Create sleek vertical gradient matching Wilsify Night Studio design
        const gradient = ctx.createLinearGradient(x, y + barHeight, x, y);

        if (isPlayed) {
          // Played portion: Vibrant Cyan to Electric Purple with soft neon glow
          gradient.addColorStop(0, "#6C4DFF"); // Deep Violet
          gradient.addColorStop(0.5, "#8B5CF6"); // Electric Purple
          gradient.addColorStop(1, isCenter ? "#22C7D9" : "#38BDF8"); // Vibrant Cyan

          ctx.shadowColor = "rgba(34, 199, 217, 0.55)";
          ctx.shadowBlur = 10;
        } else if (isHovered) {
          // Hover preview scrub portion
          gradient.addColorStop(0, "rgba(108, 77, 255, 0.7)");
          gradient.addColorStop(1, "rgba(34, 199, 217, 0.85)");
          ctx.shadowColor = "rgba(34, 199, 217, 0.4)";
          ctx.shadowBlur = 6;
        } else if (loaded) {
          // Loaded unplayed portion: Sleek Night Studio violet/blue with subtle depth
          gradient.addColorStop(0, "rgba(108, 77, 255, 0.4)");
          gradient.addColorStop(1, "rgba(77, 163, 255, 0.65)");
          ctx.shadowColor = "rgba(108, 77, 255, 0.25)";
          ctx.shadowBlur = 4;
        } else {
          // Idle state (no audio loaded): Ambient violet-cyan shimmer
          gradient.addColorStop(0, "rgba(108, 77, 255, 0.35)");
          gradient.addColorStop(1, "rgba(34, 199, 217, 0.6)");
          ctx.shadowColor = "rgba(108, 77, 255, 0.2)";
          ctx.shadowBlur = 4;
        }

        ctx.fillStyle = gradient;

        // Draw rounded bar
        const radius = barWidth / 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, barWidth, barHeight, radius);
        } else {
          // Fallback rounded rectangle
          ctx.moveTo(x + radius, y);
          ctx.lineTo(x + barWidth - radius, y);
          ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
          ctx.lineTo(x + barWidth, y + barHeight - radius);
          ctx.quadraticCurveTo(x + barWidth, y + barHeight, x + barWidth - radius, y + barHeight);
          ctx.lineTo(x + radius, y + barHeight);
          ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - radius);
          ctx.lineTo(x, y + radius);
          ctx.quadraticCurveTo(x, y, x + radius, y);
        }
        ctx.fill();

        // Extra luminous cap for center bars when playing
        if (isPlayed && isCenter && activePlaying) {
          ctx.fillStyle = "#A5F3FC";
          ctx.shadowColor = "#22C7D9";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, y + radius, radius * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [barCount]);

  // Responsive sizing via ResizeObserver & devicePixelRatio
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const cssWidth = Math.max(100, Math.floor(rect.width));
      const cssHeight = Math.max(50, Math.floor(rect.height || height));

      if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.resetTransform?.();
          ctx.scale(dpr, dpr);
        }
      }
    };

    updateSize();

    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  }, [height]);

  // User interactive scrubbing / seeking
  const handlePointerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek || duration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, clickX / rect.width));
      onSeek(percent * duration);
    },
    [onSeek, duration]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, clickX / rect.width));
      setHoverPercent(percent);
    },
    [duration]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverPercent(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full flex items-center justify-center select-none ${
        onSeek && duration > 0 ? "cursor-pointer" : "cursor-default"
      } ${className}`}
      style={{ height }}
      onClick={handlePointerClick}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      role={onSeek && duration > 0 ? "slider" : undefined}
      aria-label="Audio Waveform"
      aria-valuenow={currentTime}
      aria-valuemin={0}
      aria-valuemax={duration || 100}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
