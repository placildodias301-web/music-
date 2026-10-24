import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createReferenceTone, type ReferenceTone } from "./referenceTone";
import type { ReferenceToneKind } from "./instrumentProfile";
import { TunerEngine, type EngineConfig, type TunerMode, type TunerSnapshot } from "./engine";
import { TUNER_CONFIG } from "./config";
import { MicController } from "./microphone";
import type { TargetString } from "./tunings";

/** The DSP runs every ~33 ms outside React; React is told about it at most this often (see config.ts). */
const ANALYSIS_INTERVAL_MS = TUNER_CONFIG.analysisIntervalMs;
const RENDER_INTERVAL_MS = TUNER_CONFIG.renderIntervalMs;

export interface UseTunerInput {
  mode: TunerMode;
  targets: TargetString[];
  selectedIndex: number;
  a4: number;
  fmin: number;
  fmax: number;
  /** Use ♭ names for detected notes. */
  flats?: boolean;
  /** Detector profile for the instrument (mallet, reed, harp…). */
  profile?: EngineConfig["profile"];
}

export interface UseTuner {
  snapshot: TunerSnapshot;
  listening: boolean;
  error: string | null;
  /** Developer info: what the browser really applied to the microphone track. */
  micInfo: string | null;
  start(): Promise<void>;
  stop(): void;
  resetTuned(): void;
  /** Play a reference tone (and ignore the mic while it sounds). `kind` colours it like the instrument being tuned. */
  playTone(frequency: number, kind?: ReferenceToneKind): void;
  /** Stop a reference tone that is still sounding. */
  stopTone(): void;
}

const IDLE: TunerSnapshot = {
  listening: false, frequency: null, held: false, rms: 0, noiseFloor: 0, confidence: 0, stableFrames: 0, rawFrequency: null,
  detectedNote: null, detectedMidi: null, chromaticCents: null, pitchReliable: false, targetIndex: null, targetNote: null, targetFrequency: null, targetMidi: null, cents: null, needleCents: 0,
  state: null, outOfRange: false, locked: false, tunedIndexes: [], tooQuiet: false, message: null,
};

export function useTuner(input: UseTunerInput): UseTuner {
  const config = useMemo<EngineConfig>(
    () => ({ mode: input.mode, targets: input.targets, selectedIndex: input.selectedIndex, a4: input.a4, fmin: input.fmin, fmax: input.fmax, profile: input.profile }),
    [input.mode, input.targets, input.selectedIndex, input.a4, input.fmin, input.fmax, input.profile],
  );
  const [engine] = useState(() => new TunerEngine(config, { flats: input.flats }));

  useEffect(() => {
    engine.configure(config);
  }, [engine, config]);

  const [snapshot, setSnapshot] = useState<TunerSnapshot>(IDLE);
  const [error, setError] = useState<string | null>(null);
  const [micInfo, setMicInfo] = useState<string | null>(null);
  const [mics] = useState(() => new MicController());
  const timerRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const lastRenderRef = useRef(0);
  const toneRef = useRef<ReferenceTone | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    mics.close(); // also cancels a Start that is still waiting for the permission prompt
    bufferRef.current = null;
    engine.resetSignal();
    setSnapshot((s) => ({ ...IDLE, tunedIndexes: s.tunedIndexes }));
  }, [engine, mics]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const mic = await mics.open(() => {
        stop();
        setError("The microphone stopped (it was unplugged or its permission was withdrawn). Press Start to listen again.");
      });
      if (!mic) return; // already running, or Stop was pressed while the permission prompt was open
      bufferRef.current = new Float32Array(mic.fftSize);
      engine.resetSignal();
      const s = mic.settings;
      setMicInfo(`${Math.round(mic.sampleRate)} Hz · echo ${s.echoCancellation ?? "?"} · noise ${s.noiseSuppression ?? "?"} · gain ${s.autoGainControl ?? "?"}${mic.processed ? " (browser processing on)" : ""}`);
      timerRef.current = window.setInterval(() => {
        const m = mics.mic;
        const buf = bufferRef.current;
        if (!m || !buf) return;
        m.read(buf);
        const now = performance.now();
        const snap = engine.processFrame(buf, m.sampleRate, now);
        if (now - lastRenderRef.current >= RENDER_INTERVAL_MS) {
          lastRenderRef.current = now;
          setSnapshot(snap);
        }
      }, ANALYSIS_INTERVAL_MS);
      setSnapshot({ ...IDLE, listening: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the microphone.");
    }
  }, [engine, mics, stop]);

  // Never leave the microphone (or a tone) running after leaving the page.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      mics.close();
      toneRef.current?.dispose();
      toneRef.current = null;
    },
    [mics],
  );

  const playTone = useCallback(
    (frequency: number, kind?: ReferenceToneKind) => {
      if (!toneRef.current) toneRef.current = createReferenceTone();
      const ms = toneRef.current.play(frequency, kind);
      engine.mute(ms, performance.now());
    },
    [engine],
  );

  const stopTone = useCallback(() => {
    toneRef.current?.stop();
  }, []);

  const resetTuned = useCallback(() => {
    engine.resetTuned();
    setSnapshot((s) => ({ ...s, tunedIndexes: [] }));
  }, [engine]);

  return { snapshot, listening: snapshot.listening, error, micInfo, start, stop, resetTuned, playTone, stopTone };
}
