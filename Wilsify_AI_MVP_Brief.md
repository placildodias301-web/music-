# Wilsify AI — MVP Brief for Developer

**Prepared by Wilbur Nathan Fernandes · Updated October 2026**  
**Repository Source:** `wilsify-ai` / `Wilsify-AI`

---

## 1. What it is

**Wilsify AI** is an AI-assisted music learning and analysis platform for musicians, producers, students, and educators. 

A user uploads an audio or video song file, pastes a YouTube link, records live from their microphone, or picks a built-in demo track. Within seconds, Wilsify AI analyses the audio and provides:
- **Timestamped Chord Progression:** Synchronized chords with confidence ratings and runner-up alternatives.
- **Musical Key & Scale:** Detected key (e.g., A minor, G major) and Camelot key notation.
- **Tempo (BPM) & Meter:** Precise beats per minute and time signature (4/4 or 3/4).
- **Difficulty Rating:** Intelligent 0–100 playability rating categorized from Beginner to Expert.
- **Interactive Practice Studio:** Dynamic playback speed, section looping, lookahead metronome, and real-time microphone pitch accuracy tracking.
- **AI Music Tutor:** An embedded musical tutor that already understands the analysed song's key, tempo, and chord progression.

---

## 2. Why Wilsify AI: One App Instead of Five

Musicians routinely jump across 5 to 6 disconnected applications to practice or learn a single piece of music:

| App | What musicians use it for | What Wilsify AI replaces it with |
|---|---|---|
| **Chordify** | Shows chords from YouTube or an upload | Fast, streaming chord detection with synchronized timestamps and chord simplification |
| **Moises** | Audio separation into stems, tempo/pitch shifting | Integrated practice studio with tempo control, pitch shifting, and stem mixer preview |
| **GuitarTuna** | Chromatic tuner using mobile/laptop microphone | Built-in in-browser Web Audio chromatic tuner (no install or server required) |
| **Ultimate Guitar / Songsterr** | Chords and tablature, mostly user-submitted | Auto-generated chord sheet with transpose (-12 to +12) and capo (0 to 7) controls |
| **MuseScore** | Sheet music transcription and export | Auto-generated sheet-music PDF and MIDI file export |
| **Tunebat** | Key and BPM finder | Automatic Key, scale, BPM, and Camelot wheel analysis |
| **ChatGPT / Generic LLMs** | Explains music theory without knowing the song | Context-aware AI Music Tutor that receives song key, tempo, and chords in its system prompt |

### Why Combining Them Matters

1. **Saves Time:** One single upload or YouTube link produces chords, key, BPM, difficulty, MIDI, and sheet music. No re-uploading the same file across four websites.
2. **Eliminates Context Switching:** Musicians can practice, loop challenging sections, transpose keys, adjust capos, and ask music theory questions in one focused environment.
3. **Reduces Cost:** A musician paying for Chordify Premium (~$8/month), Moises Pro (~$9.99/month), and GuitarTuna Tools (~$6.49/month) spends ~$24/month before paying for sheet music or tabs. Wilsify AI consolidates these into a single unified platform.
4. **Smarter Together:** Because the underlying MIR (Music Information Retrieval) engine feeds the entire system, the AI tutor knows the chord changes, the practice studio locks to detected beat intervals, and the tuner shares the same pitch engine.

---

## 3. Goal of the MVP

Deliver a production-ready, code-verified web platform that can be showcased to sponsors, academic evaluators, and early musicians. It must unequivocally prove one core value proposition:

> **“Upload or stream any song → understand, play, and practice it in under a minute.”**

---

## 4. MVP Features (Implemented & Working)

1. **Supabase Authentication & Security:**
   - Email and password sign-up, login, verification, and Google OAuth.
   - Backend cryptographic JWT validation (ES256/RS256) via JWKS.
   - Mandatory rights and copyright attestation on all uploads.
2. **Flexible Media Ingestion:**
   - Local audio/video file drag-and-drop supporting 14 extensions (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.wma`, `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`) up to 100 MB.
   - YouTube search and direct media fetching powered by `yt-dlp` with DNS-level SSRF protection.
   - Built-in browser-synthesized sample track for immediate zero-upload testing.
   - Live microphone capture directly in the browser.
3. **Real-time Streaming MIR Audio Analysis:**
   - Real-time NDJSON progress streaming across explicit stages: `uploaded` $\rightarrow$ `decoding` $\rightarrow$ `separating` $\rightarrow$ `beats` $\rightarrow$ `chroma` $\rightarrow$ `chords` $\rightarrow$ `key` $\rightarrow$ `meter` $\rightarrow$ `result`.
   - Feature extraction via `librosa`: 12-bin harmonic chromagram, dynamic beat tracking, HMM/Viterbi path chord smoothing, Temperley key profiling, and 0–100 playability difficulty scoring.
4. **Synchronized Chord & Lyric Sheet:**
   - Visual chord timeline synchronized to audio playback.
   - Dynamic transpose (`-12` to `+12` semitones) and Capo selector (`0` to `7`).
   - One-click chord simplification for beginners.
   - Dual lyric mode: `.lrc` timestamped lyrics and interactive Tap-Sync (`Enter` key) for plain lyrics.
5. **Interactive Practice Studio:**
   - Playback speed adjustment (`0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`).
   - Section looping for focused practice on difficult transitions.
   - Drift-free Web Audio lookahead metronome with tap tempo.
   - Real-time microphone YIN pitch accuracy tracking with auto-tempo ramp-up.
6. **Persistent User Library:**
   - Automatic caching in `localStorage` ensuring analyses survive page refreshes.
   - Cloud synchronization with Supabase `public.user_data`.
7. **Integrated Supporting Utilities:**
   - Chromatic Tuner: Real-time browser microphone pitch detection.
   - Interactive Chord Library: Chord diagrams with fingering variations.
   - AI Music Tutor: Embedded music theory assistant aware of current song analysis.
   - Export Engine: Instant download of MIDI files and printable sheet-music PDFs.

---

## 5. Architectural Implementation Status

The project was consolidated from an unverified, fragmented multi-service experiment into a robust, high-performance architecture:

| Component | Modern Working MVP Architecture | Previous Monorepo Concept |
|---|---|---|
| **Frontend** | Vite + React 18 + TypeScript + Tailwind CSS (Single Page App) | Next.js 14 App Router |
| **Backend** | Python 3.11/3.12 FastAPI microservice with streaming NDJSON | Fastify 5 (Node.js) + BullMQ + Redis + separate Python service |
| **Database & Auth** | Supabase Auth (ES256/RS256 JWT) + PostgreSQL | Prisma ORM + local PostgreSQL + custom JWT |
| **Audio Analysis** | In-process streaming pipeline (`librosa`, `scipy`, `ffmpeg`, `yt-dlp`, `music21`, `reportlab`) | Redis job queue with Celery workers |
| **State & Storage** | Zustand + LocalStorage offline-first fallback + Supabase cloud sync | Redis + Cloudflare R2 |
| **Testing** | 561 automated tests (146 backend pytest + 415 frontend vitest) | Incomplete / unverified test suites |

---

## 6. Later Phases & Roadmap (Post-MVP)

- **Stem Separation Service:** Full 4-stem Demucs backend separation (currently UI preview in frontend).
- **Mobile Application:** Dedicated Android and iOS clients built on React Native.
- **Guitar Tablature & MusicXML:** Automated tablature generation and MusicXML interchange.
- **Community & Social:** Public song sharing, community feed, and user profiles.
- **Monetization & Billing:** Stripe / Razorpay subscription tiers (Pro tier planned at ~$12/month).

---

## 7. Success Criteria & Verification

- **Speed:** A standard 3 to 4-minute audio track completes MIR analysis in under 30 to 60 seconds.
- **Accuracy:** Key, tempo, and primary triad chords (major, minor, 7, m7) reliably match reference ground-truth audio.
- **Resilience:** Song analyses auto-save; page refreshes preserve state without data loss.
- **Verification Evidence:** Comprehensive test coverage and execution logs documented in `docs/verification/FINAL_VERIFICATION_REPORT.md` and `docs/verification/TEST_COVERAGE.md`.
