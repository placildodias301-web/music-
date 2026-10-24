# Wilsify AI — Project Understanding

> **What this is:** A code-verified architectural and technical description of the **Wilsify AI** repository as it exists in **October 2026** (Working MVP). Everything below is verified against the actual source files in the project.
>
> **What this is not:** An unverified wish list. Features that are fully wired end-to-end are tagged **IMPLEMENTED**. Features present in UI but without backend endpoints are tagged **PREVIEW ONLY**. Features designed for upcoming sprints are tagged **PLANNED / ROADMAP**.
>
> **Relationship to previous versions:** The repository originally started as an unverified monorepo with multiple incomplete backends and mismatched database migrations. It has been successfully refactored and consolidated into a clean, modern, code-verified architecture: a high-performance **Vite + React 18 frontend** backed by a **FastAPI (Python 3.11/3.12) audio-analysis microservice** and **Supabase Auth / PostgreSQL**.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Complete Project Structure](#3-complete-project-structure)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database & Authentication Architecture](#6-database--authentication-architecture)
7. [API Endpoints Reference](#7-api-endpoints-reference)
8. [Audio Signal Processing & MIR Pipeline](#8-audio-signal-processing--mir-pipeline)
9. [User Flows & Data Flow](#9-user-flows--data-flow)
10. [Practice Studio & Supporting Tools](#10-practice-studio--supporting-tools)
11. [Configuration & Environment Variables](#11-configuration--environment-variables)
12. [Verification, Testing & Test Coverage](#12-verification-testing--test-coverage)
13. [Implementation Status Matrix](#13-implementation-status-matrix)
14. [Current Known Limitations & Roadmap](#14-current-known-limitations--roadmap)
15. [How to Run the Project](#15-how-to-run-the-project)

---

## 1. Project Overview

**Wilsify AI** is a music information retrieval and practice workstation that extracts structured musical data from any audio/video input:

- **Key & Scale:** Detected key, mode (major/minor), and Camelot key notation.
- **Tempo & Meter:** BPM (beats per minute), beat/downbeat timestamps, and 3/4 vs 4/4 meter estimation.
- **Chord Progression:** Segmented, timestamped chords with confidence ratings and runner-up alternatives.
- **Difficulty Rating:** Comprehensive 0–100 playability rating categorized from Beginner to Expert.
- **Exports:** Automatic generation of MIDI files and printable sheet-music PDFs.
- **Practice Ecosystem:** Synced playback chord sheet, dynamic transposition (-12..+12), capo calculation, section looping, lookahead metronome, and pitch-tracking accuracy.

---

## 2. Technology Stack

| Layer | Technology | Details / Versions |
|---|---|---|
| **Web Frontend** | Vite + React 18 | `react` 18.3.1, `vite` 5.x, TypeScript 5.x |
| **Web Styling** | Tailwind CSS | Modern utility classes, dark theme optimized |
| **Icons & UI** | Lucide React | `lucide-react` icons throughout the interface |
| **Client State** | Zustand + LocalStorage | Offline-first persistence, reactive song rehydration |
| **Audio Processing (Web)** | Web Audio API | Custom audio nodes, Canvas waveform/chord timeline, YIN pitch detection |
| **Backend Framework** | FastAPI | Python 3.11/3.12, Uvicorn, Async streaming |
| **Audio / MIR Engine** | Librosa & SciPy | `librosa` 0.10.x, `scipy`, `soundfile`, `numpy` |
| **Media Extraction** | yt-dlp & FFmpeg | Audio extraction from YouTube with DNS-level SSRF protection |
| **Music Representation** | music21 & ReportLab | MIDI generation and LilyPond/ReportLab sheet-music PDF generation |
| **Auth & Security** | Supabase Auth | Cryptographic JWT verification (`ES256` / `RS256`) via Supabase JWKS |
| **Database** | PostgreSQL (Supabase) | `public.user_data`, `public.rights_attestations` |
| **Test Suites** | Pytest & Vitest | 146 backend tests (`pytest`) + 415 frontend tests (`vitest`) = 561 tests total |

---

## 3. Complete Project Structure

```
wilsify-ai/
├── backend/                         # FastAPI Python microservice
│   ├── main.py                      # FastAPI app entry point, route definitions, CORS, rate limits
│   ├── requirements.txt             # Python dependencies (fastapi, uvicorn, librosa, yt-dlp, etc.)
│   ├── services/
│   │   ├── analysis_engine.py       # Core MIR audio analysis (chroma, HMM/Viterbi, key, BPM, meter)
│   │   ├── difficulty.py            # 0-100 playability difficulty scoring formula
│   │   ├── media_fetch.py           # yt-dlp YouTube extraction with DNS SSRF shield
│   │   ├── midi_export.py           # MIDI file builder from chord events
│   │   └── pdf_export.py            # Sheet-music PDF export generator
│   └── tests/                       # Backend test suite (146 pytest tests)
├── frontend/                        # Vite + React 18 TypeScript application
│   ├── package.json                 # Frontend dependencies and npm scripts
│   ├── vite.config.ts               # Vite configuration (port 5173, proxy, vitest setup)
│   ├── src/
│   │   ├── App.tsx                  # Main router and layout shell
│   │   ├── pages/
│   │   │   ├── Upload.tsx           # Audio/video upload, YouTube search, mic recording, sample track
│   │   │   ├── Song.tsx             # Synced chord timeline, lyric sync, transpose, capo, playback
│   │   │   ├── Practice.tsx         # Practice studio, metronome, looping, mic pitch accuracy
│   │   │   ├── Tuner.tsx            # Web Audio chromatic guitar/instrument tuner
│   │   │   ├── ChordLibrary.tsx     # Interactive chord fingering library
│   │   │   ├── StemMixer.tsx        # 4-track stem mixer (Preview UI)
│   │   │   ├── Assistant.tsx        # Context-aware AI Music Tutor chat
│   │   │   ├── Library.tsx          # Saved analyses history
│   │   │   └── auth/                # Login, Signup, Reset Password, Verify Email
│   │   ├── lib/
│   │   │   ├── auth.tsx             # Supabase Auth client & session management
│   │   │   ├── song/                # Chord simplification, transpose, and audio utilities
│   │   │   └── generateSampleTrack.ts # Browser audio synthesizer for instant testing
│   │   └── components/              # Shared UI components, alerts, modals, navigation
├── docs/                            # Comprehensive engineering and domain documentation
│   ├── architecture/                # System architecture, API documentation
│   ├── deployment/                  # Deployment guidelines, environment variables
│   ├── verification/                # Verification reports and test coverage matrices
│   └── analysis/                    # MIR benchmarks and comparative analysis
├── supabase/                        # Database migrations and schema definitions
│   └── migrations/                  # 0001_initial_schema.sql
├── CLAUDE.md                        # Architecture cheat sheet and development commands
├── INSTALLATION.md                  # Comprehensive setup, run, test, and deployment manual
├── MVP_PLAN.md                      # Verified MVP task completion log and roadmap
├── SPONSOR_DEMO.md                  # End-to-end live demonstration script
├── SPONSOR_CHEATSHEET.md            # Quick-reference pitch cheat sheet
├── Wilsify_AI_MVP_Brief.md          # Product brief and value proposition
├── Wilsify_AI_Project_Brief.md      # Detailed project requirements and scope of work
├── PROJECT_UNDERSTANDING.md         # This architecture reference document
└── WILSIFY_AI_COMPLETE_TECHNICAL_EXPLANATION.md # Comprehensive technical & viva defense guide
```

---

## 4. Frontend Architecture

### Routing & Views (`frontend/src/App.tsx`)
The frontend is a single-page application utilizing React Router 6:
- `/` or `/upload`: Audio/video ingestion, sample track generation, and YouTube fetch.
- `/song/:id`: Synced playback chord sheet with lyric synchronization, transposition, and capo.
- `/practice/:id`: Dedicated practice studio with tempo control, loop regions, and pitch tracking.
- `/tuner`: Web Audio chromatic tuner powered by client-side microphone pitch estimation.
- `/chords`: Interactive chord visualizer with guitar fingering diagrams.
- `/stems/:id`: Stem isolation preview mixer.
- `/assistant`: Context-aware AI Music Tutor.
- `/library`: Saved song history and user catalogue.
- `/auth/*`: Login, sign-up, password reset, and confirmation.

### Synced Audio-Chord Visualization
The chord sheet dynamically highlights chords based on the current playback timestamp. Chords are rendered with high-precision time tracking, supporting:
- **Instant Transposition:** Harmonic pitch shift (`-12` to `+12` semitones) calculated in memory.
- **Capo Adaptation:** Computes equivalent open chord shapes when a capo is applied (`0` to `7`).
- **Chord Simplification:** Replaces complex extensions (e.g., `Cmaj7`, `Gsus4`) with fundamental triads (`C`, `G`) for novice players.

---

## 5. Backend Architecture

### FastAPI Audio Microservice (`backend/main.py`)
The backend provides high-performance, asynchronous endpoints built on FastAPI:
- **Streaming NDJSON (`/api/analyze/stream`):** Rather than blocking or using polling workers, the backend streams newline-delimited JSON events directly over an HTTP response. The client receives immediate progress updates across each analysis stage (`uploaded` $\rightarrow$ `decoding` $\rightarrow$ `separating` $\rightarrow$ `beats` $\rightarrow$ `chroma` $\rightarrow$ `chords` $\rightarrow$ `key` $\rightarrow$ `meter` $\rightarrow$ `result`).
- **Media Fetching (`/api/fetch-media`):** Integrates `yt-dlp` to extract high-quality audio from YouTube URLs. Includes custom DNS-level validation (`_assert_public_host`) to prevent Server-Side Request Forgery (SSRF) against internal networks.
- **Audio Exports (`/api/export/midi`, `/api/export/pdf`):** Generates standard MIDI Type 0/1 files and sheet-music PDFs.

---

## 6. Database & Authentication Architecture

### Authentication
- Uses **Supabase Auth** supporting email/password registration, email confirmation, and Google OAuth.
- The FastAPI backend validates bearer JWT tokens (`require_user`) cryptographically using the project's public JSON Web Key Set (`.well-known/jwks.json`), supporting both `ES256` and `RS256` signatures.

### Database Schema (`supabase/migrations/`)
- `public.user_data`: Stores user song metadata, saved chord sheets, transposed states, and practice notes.
- `public.rights_attestations`: Immutable audit log recording user copyright attestations prior to audio ingestion.

---

## 7. API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analyze/stream` | Multi-part audio upload with real-time NDJSON streaming progress and MIR results |
| `POST` | `/api/fetch-media` | Fetches audio from YouTube URL with SSRF protection and duration enforcement |
| `GET` | `/api/youtube/search` | Search YouTube for titles and metadata without downloading media |
| `POST` | `/api/rights-attestation`| Records user copyright confirmation for uploaded audio |
| `POST` | `/api/export/midi` | Generates downloadable MIDI file from detected chord sequence |
| `POST` | `/api/export/pdf` | Generates downloadable sheet-music PDF |
| `POST` | `/api/tutor/chat` | AI Music Tutor endpoint injecting song key, BPM, and chords into LLM prompt |
| `GET` | `/health` | Service health check returning uptime and dependency status |

---

## 8. Audio Signal Processing & MIR Pipeline

1. **Audio Normalization:** Input audio is decoded and converted to mono at a standardized 22,050 Hz sampling rate via FFmpeg and `soundfile`.
2. **Harmonic Chromagram Extraction:** Computes a 12-bin pitch class profile (Chroma) isolating tonal energy while suppressing percussive noise.
3. **Chord Sequence Decoding (HMM / Viterbi):** Applies a Hidden Markov Model with Viterbi path decoding across triad templates (major, minor, 7, m7, and no-chord). This prevents rapid, unnatural chord flickering and models realistic musical transitions.
4. **Key & Scale Estimation:** Correlates the global chroma vector against Temperley and Krumhansl-Schmuckler cognitive key profiles across all 24 major and minor keys.
5. **Beat & Meter Tracking:** Uses onset strength envelopes and dynamic programming to determine BPM, downbeats, and 3/4 vs 4/4 meter.
6. **Difficulty Scoring:** Computes a deterministic 0–100 score based on chord transition frequency, unique chord count, tempo speed, and syncopation.

---

## 9. Verification & Test Coverage

The repository maintains an automated test suite comprising **561 total tests**:
- **Backend Tests (146 tests via `pytest`):** Testing route validation, streaming NDJSON output, SSRF shields, MIR calculations, difficulty ratings, and export formats.
- **Frontend Tests (415 tests via `vitest`):** Testing audio context playback, lyric synchronizer, practice studio, tuner, chord visualizer, and local storage auto-save rehydration.
- Full verification logs and test matrices are recorded in [`docs/verification/FINAL_VERIFICATION_REPORT.md`](./docs/verification/FINAL_VERIFICATION_REPORT.md) and [`docs/verification/TEST_COVERAGE.md`](./docs/verification/TEST_COVERAGE.md).

---

## 10. How to Run the Project

Refer to [`INSTALLATION.md`](./INSTALLATION.md) for complete instructions. Quick execution:

```bash
# 1. Start Backend (Python)
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. Start Frontend (React)
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.
