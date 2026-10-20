/** Microphone lifecycle: permission → AudioContext → analyser. `stop()` releases every resource. */

export class MicrophoneError extends Error {
  readonly kind: "unsupported" | "insecure" | "denied" | "no-device" | "busy" | "audio-context" | "unknown";
  constructor(kind: "unsupported" | "insecure" | "denied" | "no-device" | "busy" | "audio-context" | "unknown", message: string) {
    super(message);
    this.kind = kind;
  }
}

export function microphoneErrorFrom(err: unknown): MicrophoneError {
  if (err instanceof MicrophoneError) return err;
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return new MicrophoneError("denied", "Microphone access is blocked. Allow it from the icon in your browser's address bar, then press Start again.");
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError")
    return new MicrophoneError("no-device", "No microphone was found. Plug in a headset or USB mic, or open Wilsify on your phone.");
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError")
    return new MicrophoneError("busy", "Your microphone is busy in another app (a call or recorder). Close it and press Start again.");
  return new MicrophoneError("unknown", "Couldn't start the microphone. Check your input device in your system sound settings and try again.");
}

export interface MicrophoneSession {
  readonly sampleRate: number;
  readonly fftSize: number;
  /** What the browser actually applied to the track (it may ignore the raw-audio request). */
  readonly settings: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean };
  /** True when echo cancellation, noise suppression or auto gain is on anyway — pitch is still usable, level readings are not exact. */
  readonly processed: boolean;
  /** Fills `target` with the latest time-domain samples. */
  read(target: Float32Array<ArrayBuffer>): void;
  stop(): void;
}

export interface StartOptions {
  /** Checked after every await: true → Stop was pressed (or the page was left) while we were waiting. */
  aborted?: () => boolean;
  /** The input died on its own (device unplugged, permission revoked, audio engine closed). */
  onEnded?: (reason: "track-ended" | "audio-closed") => void;
}

export const ANALYSER_SIZE = 4096;

/**
 * Requests the microphone, resumes the audio context and opens an analyser. Audio is analysed locally and is never
 * connected to a destination (no speaker feedback) or sent anywhere. Returns null if `aborted()` turned true while
 * waiting: the tracks it obtained are released immediately.
 */
export async function startMicrophone(opts: StartOptions = {}): Promise<MicrophoneSession | null> {
  if (typeof window !== "undefined" && window.isSecureContext === false)
    throw new MicrophoneError("insecure", "The microphone only works on a secure page. Open Wilsify over https (or localhost) and press Start again.");
  if (!navigator.mediaDevices?.getUserMedia)
    throw new MicrophoneError("unsupported", "This browser can't use the microphone here. Open Wilsify over https (or localhost) in Chrome, Edge, Safari or Firefox.");

  let stream: MediaStream;
  try {
    // Raw signal wanted: echo cancellation / noise suppression / auto gain would distort pitch and level.
    // These are preferences, not demands — a browser that cannot honour them still gives us the microphone.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name !== "OverconstrainedError" || opts.aborted?.()) throw microphoneErrorFrom(err);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err2) {
      throw microphoneErrorFrom(err2);
    }
  }
  const release = () => stream.getTracks().forEach((t) => t.stop());
  if (opts.aborted?.()) {
    release(); // permission answered after Stop: give the microphone straight back
    return null;
  }

  let ctx: AudioContext;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    release();
    throw new MicrophoneError("audio-context", "The browser couldn't start its audio engine. Reload the page and try again.");
  }
  if (opts.aborted?.()) {
    release();
    void ctx.close().catch(() => {});
    return null;
  }

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = ANALYSER_SIZE;
  analyser.smoothingTimeConstant = 0; // raw time-domain data; smoothing only matters for the spectrum
  source.connect(analyser);

  const track = stream.getAudioTracks()[0];
  const settings = (track?.getSettings?.() ?? {}) as MicrophoneSession["settings"];

  let stopped = false;
  const notify = (reason: "track-ended" | "audio-closed") => {
    if (!stopped) opts.onEnded?.(reason);
  };
  const onTrackEnded = () => notify("track-ended");
  track?.addEventListener("ended", onTrackEnded);
  const onState = () => {
    if (stopped) return;
    if (ctx.state === "closed") notify("audio-closed");
    // iOS "interrupted" (a call, Siri) and autoplay "suspended": try to carry on.
    else if (ctx.state !== "running") void ctx.resume().catch(() => {});
  };
  ctx.addEventListener("statechange", onState);

  return {
    sampleRate: ctx.sampleRate,
    fftSize: analyser.fftSize,
    settings,
    processed: settings.echoCancellation === true || settings.noiseSuppression === true || settings.autoGainControl === true,
    read(target) {
      analyser.getFloatTimeDomainData(target);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      track?.removeEventListener("ended", onTrackEnded);
      ctx.removeEventListener("statechange", onState);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // already disconnected
      }
      release();
      void ctx.close().catch(() => {});
    },
  };
}

/**
 * Owns at most one microphone session. Start/Stop can be pressed in any order and as fast as you like:
 * a Start that is still waiting for the permission prompt when `close()` runs is cancelled, and the tracks it
 * receives afterwards are released immediately. Kept free of React so the sequencing is testable.
 */
export class MicController {
  mic: MicrophoneSession | null = null;
  private run = 0;
  private starting = false;
  private readonly opener: typeof startMicrophone;

  constructor(opener: typeof startMicrophone = startMicrophone) {
    this.opener = opener;
  }

  /** Resolves to the session, or null when a session is already open/opening or this Start was cancelled. Rejects with a MicrophoneError. */
  async open(onEnded: (reason: "track-ended" | "audio-closed") => void): Promise<MicrophoneSession | null> {
    if (this.mic || this.starting) return null; // one stream, one loop
    this.starting = true;
    const run = ++this.run;
    const aborted = () => this.run !== run;
    try {
      const mic = await this.opener({
        aborted,
        onEnded: (reason) => {
          if (!aborted()) onEnded(reason);
        },
      });
      if (!mic) return null;
      if (aborted()) {
        mic.stop();
        return null;
      }
      this.mic = mic;
      return mic;
    } catch (err) {
      if (aborted()) return null;
      throw microphoneErrorFrom(err);
    } finally {
      if (!aborted()) this.starting = false; // an aborted run was already reset by close(); a newer Start may own the flag
    }
  }

  /** Stop listening and release every track, node and context this controller owns. Safe to call at any time, repeatedly. */
  close() {
    this.run++;
    this.starting = false;
    this.mic?.stop();
    this.mic = null;
  }
}
