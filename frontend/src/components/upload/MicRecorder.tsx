import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 10 * 60;
const METER_BARS = 32;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return ".m4a";
  if (mime.includes("ogg")) return ".ogg";
  return ".webm";
}

interface MicRecorderProps {
  /** Called with the finished recording, or null when it is discarded. */
  onRecorded: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * Records live singing or playing from the microphone. Browser voice
 * processing (echo cancellation, noise suppression, auto gain) is switched
 * off because it mangles instruments and pitch — we want the raw sound.
 */
export function MicRecorder({ onRecorded, disabled = false }: MicRecorderProps) {
  const [status, setStatus] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(METER_BARS).fill(0));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  function releaseDevices() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      releaseDevices();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser. Try Chrome, Edge, Firefox or Safari.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setError(
        denied
          ? "Microphone access was blocked. Allow it from the address bar and try again."
          : "No microphone was found. Plug one in and try again."
      );
      return;
    }
    streamRef.current = stream;

    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      releaseDevices();
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) {
        setStatus("idle");
        setError("Nothing was recorded. Check your microphone and try again.");
        return;
      }
      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).replace(":", "-");
      const file = new File([blob], `Live recording ${stamp}${extensionFor(type)}`, { type });
      setPreviewUrl(URL.createObjectURL(blob));
      setStatus("recorded");
      onRecorded(file);
    };
    recorderRef.current = recorder;

    // Live input meter: a scrolling history of loudness readings.
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let lastPush = 0;
    const tick = (now: number) => {
      if (now - lastPush > 60) {
        lastPush = now;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        setLevels((prev) => [...prev.slice(1), level]);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const startedAt = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      const secs = (Date.now() - startedAt) / 1000;
      setElapsed(secs);
      if (secs >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
    }, 250);

    onRecorded(null);
    setPreviewUrl(null);
    recorder.start(1000);
    setStatus("recording");
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function discard() {
    setPreviewUrl(null);
    setStatus("idle");
    setElapsed(0);
    setLevels(Array(METER_BARS).fill(0));
    onRecorded(null);
  }

  const recording = status === "recording";

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-ns-border bg-white/[0.015] px-6 py-8 text-center">
      {/* Level meter */}
      <div className="flex h-16 w-full max-w-sm items-center justify-center gap-[3px]" aria-hidden="true">
        {levels.map((lvl, i) => (
          <span
            key={i}
            className="w-1.5 rounded-full transition-[height] duration-75"
            style={{
              height: `${Math.max(6, lvl * 100)}%`,
              background: recording
                ? "linear-gradient(to top, #6C4DFF, #22C7D9)"
                : "rgba(165, 177, 204, 0.25)",
            }}
          />
        ))}
      </div>

      <p className="font-mono text-2xl font-bold tabular-nums text-content">
        {formatClock(elapsed)}
        <span className="ml-2 text-xs font-medium text-content-dim">/ {formatClock(MAX_SECONDS)}</span>
      </p>

      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            aria-label={status === "recorded" ? "Record again" : "Start recording"}
            className="group flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6578] to-[#E0315A] text-white shadow-[0_6px_24px_rgba(255,101,120,0.45)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop recording"
            className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#FF6578] text-white shadow-[0_6px_24px_rgba(255,101,120,0.45)] transition-transform hover:scale-105 active:scale-95"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-[#FF6578]/40" />
            <span className="relative h-5 w-5 rounded-[4px] bg-white" />
          </button>
        )}
      </div>

      <p className="text-xs text-content-muted">
        {status === "idle" && "Tap to record yourself singing or playing. Hold your instrument close to the mic."}
        {recording && "Recording… tap stop when you're done."}
        {status === "recorded" && "Recording ready. Listen back, then hit Analyze — or tap the mic to record again."}
      </p>

      {status === "recorded" && previewUrl && (
        <div className="flex w-full max-w-sm items-center gap-2">
          <audio controls src={previewUrl} className="h-10 min-w-0 flex-1" />
          <button
            type="button"
            onClick={discard}
            disabled={disabled}
            className="rounded-lg border border-ns-border px-2.5 py-1.5 text-xs font-semibold text-content-muted hover:text-content disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-pink">
          {error}
        </p>
      )}
    </div>
  );
}
