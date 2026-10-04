ont# Wilsify AI — MVP

An AI-powered music learning companion. Upload a song **or a video with
music in it**, and Wilsify AI performs **real audio analysis** — genuine
signal processing (not mock/lookup data) — to detect its key, tempo (BPM),
time signature, and chord progression. Then practice along with adjustable
playback speed, looping, and a metronome, or ask the built-in music-theory
assistant a question.

This is a standalone, self-contained MVP — just this `backend/` and
`frontend/`, no larger project to install.

> **Setup instructions:** see [`INSTALLATION.md`](./INSTALLATION.md) for a
> complete, step-by-step guide (prerequisites, every command, troubleshooting,
> and what was tested before delivery). The quick version is below.

## How the analysis works (real, not mock)

| What | How |
|---|---|
| Any audio or video file | `ffmpeg` extracts/decodes the audio track |
| Key | Chroma vector correlated against Krumhansl-Kessler major/minor key profiles |
| Tempo (BPM) | `librosa` onset-strength beat tracking |
| Chord progression | Per-beat chroma matched against major/minor triad templates, collapsed into a progression |
| Time signature | Lightweight periodicity heuristic (defaults to 4/4, the common case, unless there's a clearly stronger 3-beat signal) |
| Duration | Directly from the decoded audio |

This is genuine music-information-retrieval (MIR) signal processing — the
same family of technique real tools use — so **results are estimates**,
same as any such algorithm: a clean solo instrument recording analyzes more
reliably than a dense, noisy mix. It is not a neural network and does not
pretend to be one; it's classical DSP, and it's real.

The AI Assistant is a separate, honestly-labeled **rule-based** Q&A engine
(pattern matching over a fixed set of music-theory topics) — not an LLM.

## Project structure

```
wilsify-mvp/
├── backend/     Python + FastAPI — real analysis engine (ffmpeg + librosa)
└── frontend/    Vite + React + TypeScript + Tailwind — the UI
```

## Run locally

You need two terminals. No database, no Docker, no API keys.

**Requirements:** Python 3.10+, Node.js 18+, `ffmpeg` on your PATH.
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: [ffmpeg.org/download](https://ffmpeg.org/download.html) (add to PATH)

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

Runs on **http://localhost:8000**. Verify:

```bash
curl http://localhost:8000/api/health
```

> First startup runs a short warmup analysis (a few seconds) so the numba
> JIT compilation cost is paid once at boot, not on your first real upload.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on **http://localhost:5173**. Open it in a browser.

## Try it

1. Go to `http://localhost:5173/`, click **Upload Song**.
2. Either select a real audio/video file from your device, or click **Use
   Sample Track** (generates a short original clip in-browser — always
   works, no file needed).
3. Click **Analyze Song** — this sends the file to the backend, which
   really decodes and analyzes it (usually under a second after warmup).
4. See the real key / BPM / time signature / chord progression on the
   **Analysis Results** page (a green banner confirms it's real, not demo,
   analysis).
5. Open **Practice Mode** — play/pause, seek, change speed (0.5x/0.75x/1x),
   loop, and use the metronome (driven by the detected BPM).
6. Open **AI Assistant** and ask a music-theory question.

## Notes on accuracy

- Works best on relatively clean recordings (solo instrument, vocals +
  simple accompaniment, or a clear mix). Very dense/loud mixes, heavy
  distortion, or spoken-word audio will analyze less reliably — this is a
  property of the underlying signal-processing techniques, not a bug.
- Time signature detection defaults to 4/4 (correct for the large majority
  of popular music) and only overrides to 3/4 with a clearly strong signal.
  True downbeat/meter detection is a much harder MIR problem; this is a
  deliberately simple, honest heuristic.
- Max upload size: 100MB.

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest                # 13 tests covering analysis, validation, exports, difficulty
```

```bash
cd frontend
npm run lint          # oxlint
npm run build         # tsc -b + vite build
```

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `FRONTEND_ORIGIN` | `backend/.env` | local dev + preview ports | Comma-separated CORS allow-list |
| `ANALYZE_RATE_LIMIT_PER_MINUTE` | backend env | `60` | Per-IP cap on `/api/analyze`. Set `0` to disable. |
| `VITE_API_URL` | `frontend/.env` | `http://localhost:8000` | Backend URL, read at build time |

## Deployment

**Frontend** → any static host (Vercel, Netlify, Cloudflare Pages). Build
with `npm run build` (outputs to `frontend/dist/`), set the environment
variable `VITE_API_URL` to your deployed backend's URL before building.

**Backend** → any host that can run a long-lived Python process with
`ffmpeg` available (Railway, Render, Fly.io, a small VM). Most of these
platforms let you add `ffmpeg` via a build script or already include it in
their Python buildpacks — check your platform's docs. Set `FRONTEND_ORIGIN`
to your deployed frontend's URL (for CORS). Start command:
`uvicorn main:app --host 0.0.0.0 --port $PORT`.

No database or queue service is required for either side.
