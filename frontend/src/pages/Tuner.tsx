import { useEffect, useRef, useState } from "react";
import { INSTRUMENT_RANGES, detectPitch, type PitchResult } from "../lib/pitchDetect";

export function Tuner() {
  const [instrumentId, setInstrumentId] = useState(INSTRUMENT_RANGES[0].id);
  const [isListening, setIsListening] = useState(false);
  const [pitch, setPitch] = useState<PitchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const instrument = INSTRUMENT_RANGES.find((r) => r.id === instrumentId) ?? INSTRUMENT_RANGES[0];

  async function start() {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);

      setIsListening(true);
      loop();
    } catch {
      setErrorMessage("Couldn't access the microphone. Please allow mic access and try again.");
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    setIsListening(false);
    setPitch(null);
  }

  function loop() {
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    const ctx = audioCtxRef.current;
    if (!analyser || !buffer || !ctx) return;

    analyser.getFloatTimeDomainData(buffer);
    const result = detectPitch(buffer, ctx.sampleRate, instrument);
    setPitch(result);

    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cents = pitch?.cents ?? 0;
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const needleRotation = clampedCents * 0.9; // degrees, +-45deg swing

  const inTune = pitch !== null && Math.abs(cents) <= 5;

  // Reference tone playback for tuning by ear
  function playReferenceTone(freq: number) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
      setTimeout(() => ctx.close().catch(() => {}), 1300);
    } catch {
      // AudioContext unavailable
    }
  }

  const STANDARD_GUITAR_STRINGS = [
    { note: "E2", freq: 82.41, label: "6th String" },
    { note: "A2", freq: 110.00, label: "5th String" },
    { note: "D3", freq: 146.83, label: "4th String" },
    { note: "G3", freq: 196.00, label: "3rd String" },
    { note: "B3", freq: 246.94, label: "2nd String" },
    { note: "E4", freq: 329.63, label: "1st String" },
  ];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <div className="mb-6 text-center sm:mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-blue)]">
          Real-time DSP Autocorrelation
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-4xl">
          Chromatic Tuner
        </h1>
        <p className="mx-auto mt-2 max-w-md text-xs sm:text-sm text-[var(--color-ns-muted)]">
          Real-time microphone pitch detector tuned specifically to your instrument's acoustic frequency register to reject background noise.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-8 shadow-xl">
        {/* Ambient glow behind note */}
        <div
          className={`pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-56 w-56 rounded-full blur-3xl transition-opacity duration-300 ${
            inTune
              ? "bg-[var(--color-ns-mint)]/20 opacity-100"
              : pitch
              ? "bg-[var(--color-ns-blue)]/15 opacity-100"
              : "opacity-0"
          }`}
        />

        {/* Instrument selector pills */}
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {INSTRUMENT_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setInstrumentId(r.id)}
              className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
                instrumentId === r.id
                  ? "bg-[var(--color-ns-blue)] text-[var(--color-ns-ink)] font-bold shadow-md shadow-[var(--color-ns-blue)]/20"
                  : "border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Needle Gauge Display */}
        <div className="relative mx-auto mb-4 h-40 w-64 sm:h-44 sm:w-72">
          <svg viewBox="0 0 200 110" className="h-full w-full drop-shadow">
            {/* Arc Track */}
            <path
              d="M15 100 A85 85 0 0 1 185 100"
              fill="none"
              stroke="var(--color-ns-border)"
              strokeWidth={8}
              strokeLinecap="round"
            />
            {/* In-Tune Sweetspot Band */}
            <path
              d="M93 15 A85 85 0 0 1 107 15"
              fill="none"
              stroke="var(--color-ns-mint)"
              strokeWidth={8}
              strokeLinecap="round"
            />
            {/* Tick Marks */}
            {[-50, -25, 0, 25, 50].map((mark) => {
              const angle = ((mark * 0.9 - 90) * Math.PI) / 180;
              const x1 = 100 + 75 * Math.cos(angle);
              const y1 = 100 + 75 * Math.sin(angle);
              const x2 = 100 + 85 * Math.cos(angle);
              const y2 = 100 + 85 * Math.sin(angle);
              return (
                <line
                  key={mark}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={mark === 0 ? "var(--color-ns-mint)" : "var(--color-ns-border-strong)"}
                  strokeWidth={mark === 0 ? 3 : 1.5}
                />
              );
            })}
            {/* Needle */}
            <line
              x1={100}
              y1={100}
              x2={100 + 75 * Math.cos(((needleRotation - 90) * Math.PI) / 180)}
              y2={100 + 75 * Math.sin(((needleRotation - 90) * Math.PI) / 180)}
              stroke={inTune ? "var(--color-ns-mint)" : "var(--color-ns-blue)"}
              strokeWidth={3}
              strokeLinecap="round"
              style={{ transition: "all 60ms linear" }}
            />
            <circle
              cx={100}
              cy={100}
              r={5}
              fill={inTune ? "var(--color-ns-mint)" : "var(--color-ns-blue)"}
            />
          </svg>
        </div>

        {/* Central Note Readout */}
        <div className="text-center">
          <div className="inline-flex flex-col items-center">
            <p
              className="font-heading text-6xl font-black tracking-tight transition-colors duration-200"
              style={{
                color: inTune
                  ? "var(--color-ns-mint)"
                  : pitch
                  ? "var(--color-ns-text)"
                  : "var(--color-ns-muted)",
              }}
            >
              {pitch ? `${pitch.note}${pitch.octave}` : "—"}
            </p>

            {inTune && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-mint)]/40 bg-[var(--color-ns-mint)]/15 px-3 py-0.5 text-xs font-bold text-[var(--color-ns-mint)] animate-pulse">
                ✓ IN TUNE
              </span>
            )}
          </div>

          <p className="mt-2 font-mono text-xs text-[var(--color-ns-muted)]">
            {pitch
              ? `${pitch.frequency.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${cents} cents`
              : isListening
              ? "Listening to audio input…"
              : "Microphone paused"}
          </p>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-[var(--color-ns-coral)]/30 bg-[var(--color-ns-coral)]/10 p-3.5 text-center text-xs text-[var(--color-ns-coral)]">
            {errorMessage}
          </div>
        )}

        {/* Start / Stop Toggle Button */}
        <button
          type="button"
          onClick={isListening ? stop : start}
          className={`mt-6 w-full py-3 text-sm font-bold shadow-lg transition-all ${
            isListening
              ? "rounded-xl border border-[var(--color-ns-coral)]/40 bg-[var(--color-ns-coral)]/10 text-[var(--color-ns-coral)] hover:bg-[var(--color-ns-coral)]/20"
              : "btn-primary"
          }`}
        >
          {isListening ? "Stop Microphone" : "Start Microphone Tuner"}
        </button>

        {/* Reference Pitch String Buttons */}
        {instrumentId === "guitar" && (
          <div className="mt-6 border-t border-[var(--color-ns-border)] pt-5">
            <p className="mb-2.5 text-center text-xs font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Reference String Tones (Tune by Ear)
            </p>
            <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
              {STANDARD_GUITAR_STRINGS.map((str) => (
                <button
                  key={str.note}
                  type="button"
                  onClick={() => playReferenceTone(str.freq)}
                  title={`Play ${str.note} (${str.freq} Hz)`}
                  className="flex flex-col items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] py-2 transition-all hover:border-[var(--color-ns-coral)]/50 hover:bg-[var(--color-ns-card)] active:scale-95"
                >
                  <span className="font-heading text-xs font-bold text-[var(--color-ns-text)]">{str.note}</span>
                  <span className="text-[10px] text-[var(--color-ns-muted)] font-mono">{Math.round(str.freq)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-5 text-center text-[11px] text-[var(--color-ns-muted)]">
          Frequency window: {instrument.fmin}–{instrument.fmax} Hz · Standard pitch reference A4 = 440 Hz
        </p>
      </div>
    </div>
  );
}

