# Wilsify AI — Development Guide & Architecture Rules

Wilsify AI is an AI-assisted music learning and creation platform. It analyzes uploaded audio/video files, YouTube URLs, or microphone recordings with genuine DSP (ffmpeg + librosa + HMM/Viterbi chord smoothing) and neural models (Demucs stem separation, Whisper multilingual ASR, Gemini 2.5 Flash lyrics & theory verification).

---

## Core Repository Guardrails
1. **Surgical Precision**: Only modify files directly relevant to the user request.
2. **Teammate Code Protection**: DO NOT touch, refactor, or delete `sheet_scan.py`, `Sheet.tsx`, `Chords.tsx`, `AiTutorDrawer.tsx`, or unrelated team code without explicit instruction.
3. **No Unsanctioned Deletions**: Preserve all existing non-documentation code and tests.
4. **Offline Resilience**: Every network/API call (Gemini, Supabase, YouTube) must feature a 100% dependable local/offline fallback.

---

## Technology Stack
- **Backend**: Python 3.12, FastAPI, Uvicorn, Librosa, NumPy, SciPy, Demucs (`htdemucs`), HuggingFace Transformers (Whisper ASR), Google GenAI SDK (`gemini-2.5-flash`), yt-dlp, Mido, ReportLab.
- **Frontend**: Vite 8, React 19, TypeScript, Tailwind CSS v4, React Router v7, Web Audio API, AlphaTab.
- **Database & Auth**: Supabase (PostgreSQL, Row-Level Security on `public.user_data`, JWT authentication).
- **System Tooling**: FFmpeg on system PATH.

---

## Key Development Commands

### Backend (`cd backend`)
- **Activate Virtualenv (PowerShell):** `.\venv\Scripts\Activate.ps1`
- **Activate Virtualenv (Bash):** `source venv/bin/activate`
- **Run Server:** `uvicorn main:app --reload --port 8000`
- **Run Tests:** `pytest tests/ -v`

### Frontend (`cd frontend`)
- **Start Dev Server:** `npm run dev` (runs on `http://localhost:5173`, proxies `/api` to `127.0.0.1:8000`)
- **Production Build:** `npm run build` (`tsc -b && vite build`)
- **Unit Tests:** `npm test`

---

## Service Architecture

### 1. Backend (`backend/`)
- `main.py`: Main FastAPI entrypoint with rate-limiting, CORS, telemetry, and upload handling.
- `services/analysis_engine.py`: Harmonic chromagram extraction (CQT), beat tracking, and key/chord detection.
- `services/stem_separation.py`: Demucs neural 2-stem and 4-stem separation jobs.
- `services/lyrics_transcribe.py`: Consonant-preserving vocal blend, Whisper multilingual word-timed ASR, and Gemini verification.
- `services/lyrics_translator.py`: Google Translate-style Chord Sheet translator with chord-locking, phonetic Romanization, and disk caching.
- `services/assistant_engine.py`: Music theory AI tutor grounded in song analysis data with 25-topic offline fallback.
- `services/media_fetch.py`: yt-dlp audio downloader with multi-client fallbacks and SSRF protection.
- `services/midi_export.py` & `pdf_export.py`: Type-0 MIDI and printable vector PDF engraving.

### 2. Frontend (`frontend/src/`)
- `pages/Analysis.tsx`: Central analysis hub featuring waveform player, chord timeline, fingerstyle guide, and inline Chord & Lyric Sheet.
- `components/analysis/ChordSheetPreview.tsx`: Studio-grade chord-lyric sheet with Google Translate-style language bar, `A- / A+` font scaling, and karaoke audio sync.
- `components/analysis/LiveChordSync.tsx`: Synchronized playback clock controlling audio and timeline animations.
- `components/song/ChordLyricLine.tsx`: Multilingual typography (`Plus Jakarta Sans`, `Noto Sans Devanagari`) and monospace chord badges.
- `pages/Practice.tsx`: Interactive practice studio with speed controls, looping, and microphone pitch tracking.
- `pages/Stems.tsx`: Dedicated Stem Splitter interface.
- `lib/api.ts`: Typed backend client communicating with `/api/*` endpoints.

### 3. Database (`supabase/`)
- `migrations/0001_user_data.sql`: Core schema for `public.user_data` storing song library, practice logs, and tutor chat sessions under strict user RLS.

---

## Documentation Cleanliness Rule
- Maintain only `README.md` and `CLAUDE.md` in the repository root.
- Dedicated service guides live strictly in `frontend/README.md`, `backend/README.md`, and `supabase/README.md`.
- No redundant audit, plan, or cheatsheet markdown files in the repository.\n