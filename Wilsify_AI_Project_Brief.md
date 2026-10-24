# Wilsify AI — Project Details, Requirements & Scope of Work

**Prepared by Wilbur Nathan Fernandes · Updated October 2026**  
**Repository Source:** `wilsify-ai` / `Wilsify-AI`

---

## 1. Project Details & Vision

### What it is
**Wilsify AI** is an intelligent, integrated music companion platform designed to help musicians understand, play, and master songs faster. By leveraging state-of-the-art Music Information Retrieval (MIR) and AI, Wilsify AI bridges the gap between raw audio and practical musical execution.

Instead of requiring musicians to toggle between fragmented single-purpose tools (chord finders, metronomes, tuners, key finders, sheet music readers, and generic AI chat tools), Wilsify AI unifies the entire workflow into a cohesive, browser-based workstation.

### Current Status (October 2026)
The core MVP product loop has been fully built, refactored, and code-verified:
- The streaming audio analysis engine, synced chord/lyric viewer, interactive practice studio, tuner, chord library, AI tutor, and export engine are fully operational.
- Automated testing comprises **561 passing tests** (146 backend unit/integration tests with `pytest` and 415 frontend component/system tests with `vitest`).
- Verified with real reference audio benchmarks (`TEST_007`, `TEST_003`) demonstrating sub-60-second analysis and automatic library caching.

---

## 2. Requirements & Feature Matrix

The table below delineates the full 17-feature product specification and its current implementation status:

| # | Feature | Target Scope | Current Status in Working MVP |
|---|---|---|---|
| 1 | **User Accounts & Auth** | Email/password sign-up, email verification, Google OAuth | **Implemented** (Supabase Auth, JWT verification via JWKS) |
| 2 | **Audio/Video Upload** | Drag-and-drop local audio/video up to 100 MB | **Implemented** (14 file extensions, format validation) |
| 3 | **YouTube Media Fetch** | Ingest YouTube video links and search audio | **Implemented** (`yt-dlp` backend, SSRF protection, 20m/100MB limit) |
| 4 | **Sample Track & Mic** | Built-in test audio and direct microphone recording | **Implemented** (Zero-upload sample generator + browser mic recorder) |
| 5 | **Streaming Analysis** | Live stage-by-stage progress feedback | **Implemented** (Real-time NDJSON stream over HTTP) |
| 6 | **Key & BPM Detection** | Key, mode (major/minor), scale, Camelot, BPM | **Implemented** (Librosa chromagram + Temperley profiles) |
| 7 | **Chord Timeline & Grid** | Timestamped chord progression with confidence | **Implemented** (HMM/Viterbi chord recognition + dynamic chord chart) |
| 8 | **Meter & Difficulty** | Time signature (3/4 vs 4/4) and 0–100 difficulty rating | **Implemented** (Bar beat energy estimation + difficulty formula) |
| 9 | **Synced Song Player** | Synchronized audio playback with active chord highlighting | **Implemented** (Interactive synced canvas + audio player) |
| 10 | **Transposition & Capo** | Change pitch (-12..+12) and calculate capo fret (0..7) | **Implemented** (Instant client-side harmonic transposition) |
| 11 | **Lyric Synchronization** | Synchronized lyrics with chord alignment | **Implemented** (`.lrc` parsing + interactive Tap-Sync with `Enter`) |
| 12 | **Practice Studio** | Playback speed, looping, metronome, pitch feedback | **Implemented** (0.5x–1.5x speed, Web Audio lookahead metronome, mic accuracy) |
| 13 | **AI Music Tutor** | Context-aware chat explaining theory and structure | **Implemented** (Song context injected: chords, key, tempo) |
| 14 | **MIDI & PDF Export** | Downloadable MIDI file and sheet-music PDF | **Implemented** (`music21` + `reportlab` export endpoints) |
| 15 | **Chromatic Tuner** | In-browser instrument tuner via microphone | **Implemented** (Web Audio YIN pitch detection, zero server dependency) |
| 16 | **Persistent Library** | Save analyses across refreshes and sessions | **Implemented** (LocalStorage cache + Supabase cloud sync) |
| 17 | **Stem Separation** | 4-stem audio splitting (vocals, drums, bass, other) | **Preview Only** (UI mixer built; backend Demucs endpoints in Roadmap) |

---

## 3. Scope of Work

### Phase 1: MVP Core Engineering (Completed)
- Direct streaming architecture: eliminated complex multi-tier queue dependencies (Redis/BullMQ) in favor of high-throughput async FastAPI streaming NDJSON.
- Robust MIR pipeline: standardizing audio decoding to 22.05 kHz mono, computing 12-bin harmonic chromagrams, applying Viterbi path decoding for chord transitions, and scoring difficulty.
- Unified single-page web app: responsive Vite + React 18 interface with dark mode aesthetic, Web Audio API practice tools, and zero data loss on refresh.
- Automated testing: end-to-end integration tests covering ingestion, rights attestation, streaming analysis, playback rehydration, and practice studio loops.

### Phase 2: Post-MVP & Commercialization (Roadmap)
- **Stem Isolation Worker:** Demucs v4 deep learning separation container.
- **Guitar Tablature & Interactive Sheet Music:** Automated tab extraction and interactive MusicXML rendering.
- **Community Platform:** Public song analysis sharing, likes, and comment threads.
- **Billing Infrastructure:** Stripe and Razorpay subscription webhooks for Pro memberships ($12/month target).
- **Native Mobile Clients:** iOS and Android applications utilizing React Native.

---

## 4. Technical Architecture Overview

```
                      +---------------------------------------+
                      |       Client Browser (Vite / React)   |
                      |  - Synchronized Audio / Chord Sheet   |
                      |  - Practice Studio & Lookahead Metronome|
                      |  - Web Audio Chromatic Tuner          |
                      |  - LocalStorage Offline Cache         |
                      +-------------------+-------------------+
                                          |
                        HTTP / NDJSON     |  Auth (JWT)
                                          v
                      +---------------------------------------+
                      |       FastAPI Backend Microservice    |
                      |  - Media Fetch (yt-dlp + SSRF Shield) |
                      |  - MIR Streaming Analysis Engine      |
                      |  - Difficulty Scoring & Meter Est.    |
                      |  - MIDI & PDF Sheet Music Exporters   |
                      +-------------------+-------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       |
                      v                                       v
         +--------------------------+           +--------------------------+
         |    Signal Processing     |           |     Supabase Backend     |
         |  - ffmpeg audio decoding |           |  - PostgreSQL Database   |
         |  - librosa MIR analysis  |           |  - JWT Authentication    |
         |  - HMM / Viterbi chord   |           |  - User Data Sync        |
         +--------------------------+           +--------------------------+
```

---

## 5. Acceptance Criteria & Quality Standards

1. **Performance:** A standard 3 to 4-minute audio track must complete end-to-end analysis in under 60 seconds on commodity CPU instances.
2. **Analysis Quality:**
   - Accurate key identification on standard major and minor Western repertoire.
   - Robust tempo tracking within $\pm 2$ BPM.
   - Clean chord segmentation avoiding rapid, erratic fluttering via Viterbi smoothing.
3. **Resilience & Security:**
   - SSRF protection rejecting private IP addresses, loopback addresses, and unauthorized schemes.
   - Safe payload limits: 100 MB max file size, 20-minute maximum YouTube duration.
   - Automatic cleanup of all temporary decoding artifacts immediately after streaming completion.
4. **Developer Handoff:**
   - Full setup instructions detailed in [`INSTALLATION.md`](./INSTALLATION.md).
   - Milestone tracking and task completion logged in [`MVP_PLAN.md`](./MVP_PLAN.md).
   - Live presentation walkthrough documented in [`SPONSOR_DEMO.md`](./SPONSOR_DEMO.md).
