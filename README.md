# Wilsify AI

> **Intelligent Music Learning and Creation Platform**  
> An AI-powered music learning companion that performs genuine audio signal processing on any uploaded song or video. In under a second, it detects the real key, BPM, and chord progression, maps them directly to guitar, ukulele, and piano visualizers, lets you practice at variable speeds with a synchronized metronome, generates multi-instrument sheet music, provides word-synced multilingual lyrics with Google Translate-style chord-locked translation, and answers music theory questions with an AI Tutor.

---

## Architecture Overview

```
wilsify-ai/
├── frontend/    # Vite + React 19 + TypeScript + Tailwind CSS — Web application
├── backend/     # Python 3.12 + FastAPI + librosa + Demucs + Whisper — DSP & AI services
└── supabase/    # PostgreSQL schema & Row-Level Security (RLS) migrations
```

- **Frontend (`frontend/`)**: Modern reactive SPA with interactive fretboard, piano roll, audio scrubber, karaoke lyrics, and real-time audio playback clock. See [`frontend/README.md`](./frontend/README.md).
- **Backend (`backend/`)**: High-performance FastAPI server providing CQT chromagram harmonic analysis, Demucs neural stem separation, Whisper ASR lyrics transcription, Gemini 2.5 Flash lyrics verification & translation, and MIDI/PDF export. See [`backend/README.md`](./backend/README.md).
- **Database & Auth (`supabase/`)**: Hosted Supabase PostgreSQL database storing user song libraries, practice history, and tutor conversations under strict Row-Level Security (`public.user_data`). See [`supabase/README.md`](./supabase/README.md).
- **Production & Cost Estimation**: Complete hosting specs, GPU scaling, API options, and monthly cost breakdown across launch, growth, and scale stages. See [PRODUCTION_GUIDE.md](./PRODUCTION_GUIDE.md).

---

## Core Platform Capabilities

### 1. Universal Audio Analysis Pipeline
- **Real Signal Processing**: Full Constant-Q Transform (CQT) chromagram analysis, spectral flux onset detection, and Krumhansl-Kessler tonal centroid key correlation (no mock or canned data).
- **Sub-Beat Chord Timeline**: Distinguishes `main`, `passing`, and `filler` chords with sub-second accuracy across major, minor, 7th, m7th, diminished, and slash chords.
- **Stem Separation**: Deep neural audio source separation via Demucs (`htdemucs`) isolating vocals, drums, bass, and accompaniment.
- **Fingerstyle Intro & Hand Guide**: Provides left-hand and right-hand fingerings (`1-2-3-4` / `p-i-m-a`), fret positions, and string assignments.
- **Self-Learning Offline Distillation**: Caches learned chord transition likelihoods and corrections into `learned_harmony_rules.json`.

### 2. AI Sheet Generation & OMR Scanning
- **Multi-Instrument Transcription**: Generates lead sheets, tablature (`ScoreTab`), and 5-staff piano grand staff engravings.
- **Unified Key Transpose**: Instant transposition (`Key: [ A ] [-] 0 [+]`) with automatic capo recommendations.
- **Vector PDF & MIDI Export**: Direct downloadable printable sheet music (ReportLab vector PDF) and standard Type-0 MIDI (`.mid`) files.

### 3. Multilingual Lyrics Transcription & Translation
- **Consonant-Preserving Vocal Blend**: Blends 88% isolated vocal stem with 12% high-passed original mix to preserve consonant transients (`s, t, k, p`).
- **Quiet Syllable Retention**: `-46.0 dB` gate with 150ms collar padding and silence hallucination filtering.
- **Multilingual Whisper + Wilsify AI**: Word-level acoustic timing across English, Konkani (Romi & Devanagari), Hindi, Marathi, Tamil, Spanish, French, Portuguese, German, Korean, Japanese, and Arabic.
- **Google Translate-Style Chord Sheet Translator**:
  - Auto-detects source language (`auto`).
  - Rhythmically translates lyrics into 11+ languages while **keeping every chord badge locked to the exact translated word position**.
  - Provides phonetic Romanized sing-along lines (`Aa Romanized`) for non-Latin scripts (Devanagari, Hangul, Kana).
  - 1-click swap (`⇄`) and instant restore (`↺ Original`).

### 4. AI Music Tutor
- **Music-Grounded Assistant**: Scoped strictly to the active song's chord progression, key, and tempo (not generic chat).
- **Visualizers & Synthesizer**: Interactive SVG Guitar Fretboard (CAGED barre & open shapes), Ukulele, and Piano roll with Web Audio API sound synthesis.
- **Offline Fallback Bank**: 25-topic rule-based knowledge engine when offline or without Gemini API quota.

---

## Quick Start & Installation

### Prerequisites
| Requirement | Version | Verification Command |
|---|---|---|
| **Python** | 3.10+ (3.12 recommended) | `python --version` |
| **Node.js** | 18+ (Node 20+ recommended) | `node --version` |
| **npm** | 9+ | `npm --version` |
| **FFmpeg** | Recent build | `ffmpeg -version` |
| **Supabase** | Free tier project | https://supabase.com/dashboard |

> **Install FFmpeg (Required for audio decoding):**
> - **Windows (PowerShell):** `winget install Gyan.FFmpeg` (restart terminal after install)
> - **macOS:** `brew install ffmpeg`
> - **Ubuntu/Debian:** `sudo apt update && sudo apt install -y ffmpeg`

---

### Step 1: Clone & Configure Environment

```bash
git clone https://github.com/reyhanamando35/wilsify-ai.git
cd wilsify-ai
```

Create `.env` files from templates:

```bash
# Backend configuration
cp backend/.env.example backend/.env

# Frontend configuration
cp frontend/.env.example frontend/.env
```

- In `frontend/.env`, set your Supabase project credentials:
  ```ini
  VITE_API_URL=http://localhost:8000
  VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
  ```
- In `backend/.env`, set optional keys (Gemini API for enhanced lyrics verification and tutor):
  ```ini
  GEMINI_API_KEY=your_gemini_api_key_here
  FRONTEND_ORIGIN=http://localhost:5173
  ```

---

### Step 2: Run Database Migration
Follow the quick guide in [`supabase/README.md`](./supabase/README.md) to run `0001_user_data.sql` in your Supabase SQL Editor.

---

### Step 3: Start Backend Services

```bash
cd backend
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
*Backend API will run at `http://localhost:8000` with Swagger docs at `http://localhost:8000/docs`.*

---

### Step 4: Start Frontend Application

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```
*Open `http://localhost:5173` in your browser.*

---

## Viva & Demo Presentation Guide

### 30-Second Elevator Pitch
*"Wilsify AI is an intelligent music learning and creation platform that performs real audio signal processing on any uploaded audio or video track. In under a second, it detects the real key, BPM, and sub-beat chord progression, maps them directly to interactive guitar, ukulele, and piano visualizers, lets you practice at variable speeds with a synchronized metronome, provides word-synced multilingual lyrics with Google Translate-style chord-locked translation, and exports printable lead sheets and MIDI files."*

### 5-Minute Live Demo Script
1. **Home Studio (`/studio`)**: Walk through the user dashboard and instrument practice tools.
2. **Upload (`/upload`)**: Upload any audio/video file, YouTube link, or click **"Use Sample Track"** for an immediate in-browser synthesized track.
3. **Analysis (`/analysis`)**: Show real DSP results: Key, BPM, meter, difficulty, and the interactive Chord Timeline.
4. **Voicing Visualizers**: Click any chord in the timeline to preview its fingering on Guitar (CAGED open/barre), Ukulele, and Piano.
5. **Chord & Lyric Sheet**:
   - Demonstrate real-time karaoke word tracking.
   - Use the **Google Translate-Style Language Bar**: pick Hindi, Spanish, or Konkani and show how chords remain strictly locked to the corresponding translated words.
   - Toggle **`Aa Romanized`** to display phonetic sing-along text for non-Latin scripts.
6. **Practice Mode (`/practice`)**: Show tempo scaling (0.75x, 0.5x), looping, and microphone pitch tracking.
7. **AI Tutor (`/assistant`)**: Ask questions about the current song's chord progression and demonstrate song-grounded music theory tutoring.
8. **Export**: Download standard Type-0 MIDI (`.mid`) and printable PDF lead sheet (`.pdf`).

---

## Testing & Quality Assurance

- **Backend Pytest Suite:**
  ```bash
  cd backend
  pytest backend/tests/ -v
  ```
- **Frontend Typecheck & Build:**
  ```bash
  cd frontend
  npm run build    # tsc -b && vite build
  ```\n