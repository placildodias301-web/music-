# Wilsify AI — MVP: Installation & Setup Guide

This is the complete, standalone MVP: one Python/FastAPI backend that does
**real audio analysis** (not mock data) and one Vite/React frontend. No
database, no Docker, no external API keys, no account/login.

Two pieces, two terminals:

```
wilsify-ai-mvp/
├── backend/     Python + FastAPI — real analysis engine (ffmpeg + librosa)
└── frontend/    Vite + React + TypeScript + Tailwind — the UI
```

---

## 1. Prerequisites

Install these once, before anything else:

| Requirement | Version | Check with |
|---|---|---|
| Python | 3.10 or newer | `python3 --version` |
| Node.js | 18 or newer | `node --version` |
| npm | comes with Node | `npm --version` |
| ffmpeg | any recent version | `ffmpeg -version` |

**Installing ffmpeg** (required — the backend uses it to decode any audio/video file):
- **macOS:** `brew install ffmpeg`
- **Ubuntu/Debian:** `sudo apt update && sudo apt install ffmpeg`
- **Windows:** download from [ffmpeg.org/download](https://ffmpeg.org/download.html) and add the `bin` folder to your PATH

If `ffmpeg -version` doesn't print a version, fix that before continuing — the analyze endpoint will fail without it.

---

## 2. Backend setup (Terminal 1)

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows (PowerShell): venv\Scripts\Activate.ps1
                                 # Windows (cmd.exe):     venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env             # Windows: copy .env.example .env

# Run the server
uvicorn main:app --reload --port 8000
```

Wait for this line before moving on:
```
[startup] Analysis engine warmed up.
INFO:     Application startup complete.
```
(First boot runs a short warm-up analysis — a few seconds — so the very first real upload isn't slowed down by one-time JIT compilation.)

**Verify it's alive** (new terminal, or after the server is running):
```bash
curl http://localhost:8000/api/health
# {"status":"ok","service":"wilsify-mvp-backend","mode":"real-analysis"}
```

Backend dependencies installed by `pip install -r requirements.txt`:
`fastapi`, `uvicorn[standard]`, `python-multipart`, `librosa`, `numpy`, `soundfile`, `scipy`.

---

## 3. Frontend setup (Terminal 2, keep the backend running)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in a browser. The `.env` file already points
the frontend at `http://localhost:8000` (the backend); change `VITE_API_URL`
in `frontend/.env` if you run the backend elsewhere.

---

## 4. Try it end-to-end

1. Go to `http://localhost:5173/`, click **Upload Song**.
2. Either pick a real audio/video file from your device, or click **Use
   Sample Track** — this generates a short original clip right in the
   browser, so the demo always works even with no files on hand.
3. Click **Analyze Song**. This uploads the file to the backend, which
   genuinely decodes it (ffmpeg) and analyzes it (librosa) — usually well
   under a second after warm-up.
4. The **Analysis Results** page shows the real detected key, BPM, time
   signature, duration, and chord progression, with a green banner
   confirming it's real (not demo) analysis.
5. Open **Practice Mode** — play/pause, seek, change speed
   (0.5x / 0.75x / 1x), loop, and use the built-in metronome (driven by the
   detected BPM).
6. Open **AI Assistant** and ask a music-theory question (e.g. "what is
   BPM?", "explain the C-G-Am-F progression").

---

## 5. All commands, at a glance

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev          # dev server on http://localhost:5173
npm run build        # production build → frontend/dist/
npm run preview      # preview the production build locally
npm run lint         # lint the frontend source
```

**Health checks:**
```bash
curl http://localhost:8000/api/health
```

---

## 6. Production build (frontend)

```bash
cd frontend
npm run build
```

This runs a TypeScript type-check (`tsc -b`) followed by a Vite production
build, and outputs static files to `frontend/dist/`. This has been verified
to complete with zero errors. Serve `dist/` from any static host (see
deployment notes in the root `README.md`), pointing `VITE_API_URL` (set
*before* building) at your deployed backend.

There is no separate backend "build" step — `uvicorn main:app` (with
`--reload` dropped and `--host 0.0.0.0` added) is how you run it in
production too; see `README.md` for deployment notes.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `ffmpeg: command not found` / analyze fails with "Could not extract audio" | Install ffmpeg (step 1) and make sure it's on your PATH, then restart the backend. |
| Backend takes 10+ seconds to start | Normal — that's the one-time warm-up (numba JIT compiling librosa's beat tracker). Only happens once per process start. |
| Frontend shows a network/fetch error when analyzing | Confirm the backend is running on port 8000 and `frontend/.env`'s `VITE_API_URL` matches. Also confirm the backend's `FRONTEND_ORIGIN` (in `backend/.env`) includes `http://localhost:5173`. |
| `npm install` fails on an old Node version | Upgrade to Node 18+. |
| Port 8000 or 5173 already in use | Stop whatever is using it, or run the backend on a different port (`--port 8001`) and update `VITE_API_URL` to match. |

---

## 8. What was verified before delivery

- `pip install -r backend/requirements.txt` — installs cleanly from a fresh virtual environment.
- `npm install` in `frontend/` — installs cleanly from a fresh state (0 vulnerabilities).
- `npm run build` — TypeScript compiles with zero errors; Vite production build succeeds.
- Backend started end-to-end (`uvicorn main:app`); `/api/health` responds correctly.
- `/api/analyze` tested with a synthesized audio file (a C-E-G / C Major chord tone) — correctly returned `key: "C Major"`.
- `/api/analyze` tested with a synthesized G-B-D / G Major chord tone — correctly returned `key: "G Major"`.
- `/api/analyze` tested with an actual **video** file (ffmpeg-generated `.mp4` with an audio track) — audio extraction and analysis both succeeded, confirming "upload a video" works, not just audio files.
- `/api/analyze` tested with invalid input (a `.txt` file, and a `.mp3`-named file containing garbage bytes) — both correctly rejected with a clear, non-crashing error message instead of a server error.
- `/api/assistant` tested with a real question and an empty question — both handled correctly (a rule match and a 400 validation error, respectively).
- CORS preflight tested from `http://localhost:5173` — correctly allowed.

No known blocking issues remain.
