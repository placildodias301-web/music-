/**
 * Mock stem backend so the Stems page works before the Python API exists.
 * It returns the TEST_011 stem list, simulates an ~8 s job, and produces short
 * sine-tone WAVs so the players, downloads, A/B and ZIP are all real.
 */
import type { SeparateRequest, StemAnalysis } from "./stemJob";
import { decodeFile, renderPreviewStem } from "./stemPreview";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ANALYSIS: StemAnalysis = {
  upload_id: "mock-upload-1",
  track: "TEST_011",
  duration_seconds: 97,
  estimated_seconds: 240,
  detected_stems: [
    { id: "lead_vocal", label: "Lead vocal", confidence: "high", available: true },
    { id: "backing_vocals", label: "Backing vocals", confidence: "medium", available: true },
    { id: "drums", label: "Drums", confidence: "high", available: true },
    { id: "bass", label: "Bass", confidence: "high", available: true },
    { id: "guitar", label: "Guitar (electric + acoustic)", confidence: "medium", available: true },
    { id: "piano_keys", label: "Piano / keys", confidence: "not detected", available: false },
    { id: "residual_other", label: "Residual other / synth / pads / FX", confidence: "mixed", available: true },
  ],
};

let mockFile: File | null = null;

export async function mockAnalyse(file: File, onProgress: (pct: number) => void): Promise<StemAnalysis> {
  mockFile = file;
  for (let p = 0; p <= 100; p += 25) {
    onProgress(p);
    await sleep(100);
  }
  await sleep(400);
  return { ...ANALYSIS, track: file.name.replace(/\.[^.]+$/, "") };
}

export function toneWav(freq: number, seconds = 3, rate = 22050): Blob {
  const n = rate * seconds;
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  w(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.sin((2 * Math.PI * freq * i) / rate) * 9000, true);
  return new Blob([view.buffer], { type: "audio/wav" });
}

const jobs = new Map<string, { t0: number; body: SeparateRequest }>();
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function mockApi(path: string, init?: RequestInit): Promise<unknown> {
  await sleep(120);
  if (path === "/api/stems/separate") {
    const id = `job_${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(id, { t0: Date.now(), body: JSON.parse(String(init?.body)) as SeparateRequest });
    return { job_id: id, estimated_seconds: 8 };
  }
  const m = path.match(/^\/api\/stems\/job\/([^/]+)(\/stems)?$/);
  const job = m ? jobs.get(decodeURIComponent(m[1])) : undefined;
  if (!m || !job) throw new Error("Mock: unknown job.");
  if (!m[2]) {
    const pct = Math.min(100, (Date.now() - job.t0) / 80);
    const status = pct >= 100 ? "complete" : pct > 80 ? "exporting" : pct > 10 ? "separating" : "analyzing";
    return { status, progress: pct, message: status === "complete" ? "Done" : `${status}…` };
  }
  const conf = new Map(ANALYSIS.detected_stems.map((s) => [s.id, s]));
  const wanted = [
    ...job.body.stems.map((id) => ({ id, label: conf.get(id)?.label ?? id, confidence: conf.get(id)?.confidence ?? "low" })),
    ...job.body.custom_stems.map((l) => ({ id: `custom_${slug(l)}`, label: l, confidence: "low" })),
  ];
  // Use the REAL uploaded song when it can be decoded; otherwise fall back to short tones.
  let song: AudioBuffer | null = null;
  let decodeError = "";
  if (mockFile) {
    try {
      song = await decodeFile(mockFile);
    } catch (e) {
      song = null;
      decodeError = e instanceof Error ? e.message : String(e);
      console.warn("[stems] could not decode the uploaded file in the browser:", e);
    }
  }
  const stems = [];
  for (const [i, w] of wanted.entries()) {
    const blob = song ? await renderPreviewStem(song, w.id) : toneWav(180 + i * 90);
    stems.push({
      id: w.id, label: w.label, confidence: w.confidence, size_bytes: blob.size,
      url: URL.createObjectURL(blob), filename: `${String(i + 1).padStart(2, "0")}_${w.id}.wav`,
    });
  }
  return {
    stems,
    notice: song
      ? "Preview mode: these stems are your song filtered by frequency range, not AI separation, so layers will bleed into each other. Connect the Python backend for real stems."
      : `Preview mode: this browser could not decode the file${decodeError ? ` (${decodeError})` : ""}, so these are short test tones, not your song. Try an MP3 or WAV, or connect the Python backend.`,
  };
}
