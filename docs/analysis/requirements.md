# Wilsify AI — Requirement Analysis (Section 5)

> **Point-in-time analysis.** Written before the 2026-10 documentation cleanup; it describes the project as analysed at that time and is not the source of current status. Current scope/status: [`MVP_PLAN.md`](../../MVP_PLAN.md); verification: [`../verification/FINAL_VERIFICATION_REPORT.md`](../verification/FINAL_VERIFICATION_REPORT.md).

**Project Title:** Wilsify AI — AI-Powered Music Learning, Audio Analysis, and Interactive Practice Platform  
**Companion Report:** [`docs/analysis/project_analysis.md`](./project_analysis.md)  
**Fact Classification Tags:** `[VERIFIED FROM MY CODE]`, `[VERIFIED FROM WEB SOURCE]`, `[ASSUMPTION/RECOMMENDATION]`

---

## 1. Functional Requirements (`VERIFIED FROM MY CODE`)

The functional requirements define the concrete behaviors, inputs, processing rules, and outputs implemented across the Wilsify AI frontend (`frontend/src/`) and backend (`backend/`).

| Req. ID | Module | Functional Requirement Description | Verification Source & Implementation Status |
| :--- | :--- | :--- | :--- |
| **FR-01** | **Authentication & Account Management** | The system shall allow users to sign up, log in, reset passwords, verify emails, and authenticate via Email/Password, Google OAuth, or GitHub OAuth, protecting application routes behind a session guard. | **`[VERIFIED FROM MY CODE]`** Implemented in `frontend/src/lib/authContext.tsx`, `frontend/src/App.tsx`, and `frontend/src/pages/Login.tsx`, `Signup.tsx`, `ForgotPassword.tsx`, `VerifyEmail.tsx`, `ResetPassword.tsx`. |
| **FR-02** | **Multi-Source Media Ingestion** | The system shall accept media up to 100 MB from four sources: (a) local audio/video files across 14 extensions (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.wma`, `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`), (b) direct public media URLs, (c) social/video platform URLs (YouTube, Instagram, TikTok, SoundCloud, Vimeo, etc.), and (d) live browser microphone recording. | **`[VERIFIED FROM MY CODE]`** Implemented in `backend/main.py` (`MAX_UPLOAD_BYTES`, `SUPPORTED_AUDIO_EXTS`, `SUPPORTED_VIDEO_EXTS`), `backend/services/media_fetch.py`, and `frontend/src/pages/Upload.tsx` / `Studio.tsx`. |
| **FR-03** | **In-App YouTube Search** | The system shall allow users to search YouTube directly by song title or artist without leaving the app and load a selected video ($\le 20\text{ minutes}$, non-live) into the analysis pipeline. | **`[VERIFIED FROM MY CODE]`** Implemented via `GET /api/youtube/search` (`backend/services/media_fetch.py`, up to 24 results using `yt-dlp` flat extraction) and consumed in `Upload.tsx` and `Studio.tsx`. |
| **FR-04** | **Copyright Rights Attestation** | The system shall require the user to confirm ownership or permission before analyzing uploaded media and shall record a timestamped attestation entry on the backend. | **`[VERIFIED FROM MY CODE]`** Enforced by checkbox state in `Upload.tsx` / `Studio.tsx` and logged via `POST /api/rights-attestation` in `backend/main.py`. |
| **FR-05** | **Streaming MIR Audio Analysis** | The system shall extract musical key (`tonic`, `scale`, `keyConfidence`), tempo (`bpm`, `bpmConfidence`, `bpmStatus`), meter (`timeSignature`, `4/4` or `3/4`), beat/downbeat timestamps, and a time-stamped chord timeline (`start`, `end`, `chord`, `confidence`, `uncertain`, `alternative`) while streaming real-time progress stages (`uploaded`, `decoding`, `separating`, `beats`, `chroma`, `chords`, `key`, `meter`, `result`) to the client. | **`[VERIFIED FROM MY CODE]`** Implemented in `POST /api/analyze/stream` (`backend/main.py`) and `backend/services/analysis_engine.py` (`analysisVersion: 2`). |
| **FR-06** | **Automated Song Difficulty Rating** | The system shall compute an objective `0–100` difficulty score and classify each analyzed song as `Beginner` ($<35$), `Intermediate` ($35–64$), or `Advanced` ($\ge 65$) with human-readable rationale bullets based on chord complexity (`40%`), chord-change rate (`30%`), tempo (`20%`), and root variety (`10%`). | **`[VERIFIED FROM MY CODE]`** Implemented in `backend/services/difficulty.py` (`rate_difficulty`) and rendered on `Analysis.tsx` and `Song.tsx`. |
| **FR-07** | **Harmonic Transposition, Capo Suggestions & Audio Pitch Shifting** | The system shall allow users to transpose chord symbols across `-12` to `+12` semitones, view ranked capo fret suggestions (`0–7` frets scored by open-chord duration share), and pitch-shift the actual audio stream (`-12` to `+12` semitones) while preserving tempo and vocal formants. | **`[VERIFIED FROM MY CODE]`** Implemented in `frontend/src/lib/transpose.ts` (`transposeChord`, `capoSuggestions`), `Analysis.tsx`, and `POST /api/pitch-shift` (`backend/services/pitch_shift.py`). |
| **FR-08** | **Browser-Side Stem Separation & Mixing** | The system shall isolate vocal/center and instrumental stereo channels directly in the browser using Web Audio DSP without re-uploading audio to the server. | **`[VERIFIED FROM MY CODE]`** `Analysis.tsx` actively mounts the 2-stem phase-cancellation separator (`frontend/src/lib/stemSeparation.ts`). Additionally, a 4-lane cascaded BiquadFilter stem mixer (`Vocals & centre`, `Bass range`, `Highs`, `Sides`) with Mute, Solo, and Volume faders is implemented and unit-tested in `frontend/src/lib/stemMixer.ts` and `frontend/src/components/analysis/StemMixer.tsx` (prepared for mounting). |
| **FR-09** | **Synchronized Lyric-Chord Song Sheet & Chord Simplification** | The system shall display chords positioned above corresponding lyric words synchronized to audio playback, supporting LRC imports, plain-text lyrics with interactive Tap-Sync line timing, AI-generated original lyrics, section looping, and a one-click "Simplify" mode that reduces complex seventh/extended chords to basic triads. | **`[VERIFIED FROM MY CODE]`** Implemented in `frontend/src/pages/Song.tsx`, `frontend/src/lib/song/alignment.ts`, `lrc.ts`, `simplify.ts`, `aiLyrics.ts`, and `useSongCursor.ts`. |
| **FR-10** | **Interactive Practice Studio with Mic Verification & Auto-Tempo** | The system shall provide variable playback speeds (`0.5x`, `0.75x`, `1x`, `1.25x`, `1.5x`) with pitch preservation, section looping, a drift-free Web Audio lookahead metronome, a Tap Tempo utility, live microphone YIN pitch verification against the active chord's root note, and automatic tempo ramp-up when rolling 4-second accuracy reaches $\ge 70\%$. | **`[VERIFIED FROM MY CODE]`** Implemented in `frontend/src/pages/Practice.tsx`, `frontend/src/hooks/useMetronome.ts`, `frontend/src/components/TapTempo.tsx`, and `frontend/src/lib/tuner/pitch.ts`. |
| **FR-11** | **Multi-Instrument Chromatic Tuner** | The system shall provide a real-time microphone tuner (`30–2100 Hz`) with cents deviation meter (`±50 cents`), `A4` pitch calibration, reference tone synthesis, and presets for Guitar (Acoustic/Electric), Bass, Ukulele, Violin, Mandolin, Piano, Harp (with 7-pedal lever selector), and Chromatic mode. | **`[VERIFIED FROM MY CODE]`** Implemented in `frontend/src/pages/Tuner.tsx` and `frontend/src/lib/tuner/` (`pitch.ts`, `instruments.ts`, `harp.ts`, `tone.ts`). |
| **FR-12** | **396-Chord Multi-Instrument Reference Library** | The system shall provide an interactive dictionary of `396` chords (`12` pitch roots $\times$ `33` qualities across Triads, Sixths/Adds, Sevenths, Extended, and Altered chords) with diagrams and synthesized Web Audio playback for Guitar (CAGED/open shapes + algorithmic solver), Ukulele, Keyboard/Piano, Mallet, Accordion, and Harp. | **`[VERIFIED FROM MY CODE]`** Implemented in `frontend/src/pages/ChordLibrary.tsx` and `frontend/src/lib/chordTheory.ts` (`ALL_CHORD_SYMBOLS`, `findGuitarVoicings`, `playChordVoicing`). |
| **FR-13** | **Song-Grounded Hybrid AI Music Tutor ("Ask Wilsify AI")** | The system shall provide a conversational AI assistant accessible both as a dedicated multi-thread workspace (`/assistant`) and as a contextual slide-over drawer (`/song/:songId`), injecting the active song's key, BPM, chords, difficulty, and weak chords into Google Gemini (`gemini-flash-latest` / `gemini-flash-lite-latest`) with automatic fallback to a deterministic song-grounded engine and 12 music-theory rules. | **`[VERIFIED FROM MY CODE]`** Implemented in `POST /api/assistant` (`backend/services/assistant_engine.py`), `frontend/src/pages/Assistant.tsx`, and `frontend/src/components/song/AskWilsify.tsx`. |
| **FR-14** | **Vector PDF Lead Sheet & Standard MIDI Export** | The system shall export (a) a customizable A4 vector PDF lead sheet (supporting dark/light themes, bar grids, section headers, repeat brackets, and 6-per-row guitar chord diagrams) and (b) a Standard MIDI file (`480` ticks/beat) containing the detected chord progression at the song's BPM. | **`[VERIFIED FROM MY CODE]`** Implemented in `POST /api/export/pdf` (`backend/services/pdf_export.py`), `POST /api/export/midi` (`backend/services/midi_export.py`), and `frontend/src/components/LeadSheetModal.tsx`. |
| **FR-15** | **Personal Library, Practice Analytics & Cloud Sync** | The system shall persist analyzed song metadata, practice session metrics (accuracy, duration, weak chords), and AI chat history in `localStorage` and synchronize them across devices via Supabase PostgreSQL (`public.user_data`) with Row-Level Security. | **`[VERIFIED FROM MY CODE]`** Implemented in `frontend/src/lib/library.ts`, `practiceSession.ts`, `cloudSync.ts`, `Dashboard.tsx`, `Library.tsx`, and `supabase/migrations/0001_user_data.sql`. |

---

## 2. Non-Functional Requirements

### 2.1 Performance Requirements
1. **Cold-Start JIT Elimination:** The backend shall pre-compile `librosa` and `numba` JIT kernels during FastAPI startup (`lifespan` hook running a 2-second synthetic buffer analysis) so that the first user upload does not suffer a 5–10 second compilation stall `[VERIFIED FROM MY CODE: backend/main.py]`.
2. **Downsampled MIR Signal Pipeline:** To keep CPU memory and execution time low on standard multi-core processors, the analysis engine shall downsample decoded audio to `11,025 Hz` (`ANALYSIS_SR = 11025`, `HOP = 256` samples $\approx 23.2\text{ ms}$) `[VERIFIED FROM MY CODE: backend/services/analysis_engine.py]`.
3. **Streaming Heartbeat & Cooperative Cancellation:** During long analyses (`/api/analyze/stream`), the server shall emit NDJSON progress updates after each DSP stage and send a `heartbeat` event every `10.0` seconds if a stage is still computing. If the client disconnects, a `threading.Event` (`cancel_event`) shall abort the analysis worker before starting the next stage `[VERIFIED FROM MY CODE: backend/main.py]`.
4. **Drift-Free Real-Time Audio Scheduling:** The browser metronome shall schedule oscillator clicks using the Web Audio API hardware clock (`AudioContext.currentTime`) with a `25 ms` timer interval and `100 ms` lookahead window to prevent JavaScript main-thread UI jitter `[VERIFIED FROM MY CODE: frontend/src/hooks/useMetronome.ts]`.

### 2.2 Security Requirements
1. **Cryptographic JWT Verification:** The `POST /api/assistant` endpoint shall require a valid Bearer JWT signed by the project's Supabase Auth instance (`ES256` or `RS256`, audience `"authenticated"`), verified against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` via `jwt.PyJWKClient` `[VERIFIED FROM MY CODE: backend/main.py]`.
2. **Database Row-Level Security (RLS):** Every table in Supabase (`public.user_data` in `0001_user_data.sql` and all 7 tables in `0002_song_sheet.sql`) shall enforce PostgreSQL Row-Level Security policies restricting `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations strictly to rows where `auth.uid() = user_id` `[VERIFIED FROM MY CODE: supabase/migrations/0001_user_data.sql, 0002_song_sheet.sql]`.
3. **Server-Side Request Forgery (SSRF) Protection:** Before fetching any user-supplied URL in `/api/fetch-media`, `_assert_public_host()` shall resolve all DNS records via `socket.getaddrinfo()` and reject any IPv4/IPv6 address that is loopback (`127.0.0.0/8`, `::1`), private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), multicast, or otherwise non-global (`not ip.is_global`) `[VERIFIED FROM MY CODE: backend/services/media_fetch.py]`.
4. **Rate Limiting & Payload Caps:** All expensive endpoints (`/api/analyze`, `/api/analyze/stream`, `/api/fetch-media`, `/api/youtube/search`) shall enforce a sliding-window rate limit of `60` requests per minute per client IP (`ANALYZE_RATE_LIMIT_PER_MINUTE = 60`), and file uploads/downloads shall be capped at `100 MB` (`MAX_UPLOAD_BYTES = 100 * 1024 * 1024`) `[VERIFIED FROM MY CODE: backend/main.py, backend/services/media_fetch.py]`.

### 2.3 Usability Requirements
1. **Responsive Dark/Light Theme & Keyboard Shortcuts:** The UI shall support responsive desktop and mobile navigation (`AppShell.tsx`), customizable dark/light themes, and dedicated keyboard shortcuts (`/settings/shortcuts`, spacebar play/pause, `Enter` lyric tap-sync) `[VERIFIED FROM MY CODE: frontend/src/components/AppShell.tsx, frontend/src/pages/Song.tsx]`.
2. **Progressive Disclosure of Complexity:** Beginner users shall be able to simplify complex chords into basic 3-note triads with one click (`simplify.ts`) and view clear `Beginner / Intermediate / Advanced` badges, while advanced players can inspect per-chord confidence percentages, runner-up `alternative` chords, and CAGED barre voicings `[VERIFIED FROM MY CODE: frontend/src/pages/Song.tsx, frontend/src/pages/ChordLibrary.tsx]`.

### 2.4 Reliability & Availability Requirements
1. **Graceful Multi-Tier AI Fallback:** The AI Assistant shall never fail with an unhandled error if `GEMINI_API_KEY` is missing, rate-limited (`HTTP 429`), or temporarily unavailable (`HTTP 500/503`). It shall automatically retry with `gemini-flash-lite-latest`, then fall back to the deterministic song-grounded engine (`_grounded_answer`), and finally to the 12-rule regex knowledge base (`RULES`) `[VERIFIED FROM MY CODE: backend/services/assistant_engine.py]`.
2. **Offline-First Local Persistence:** All library entries, practice sessions, and chat threads shall be written immediately to `localStorage` so the application remains usable even if Supabase cloud synchronization (`cloudSync.ts`) is offline or unconfigured `[VERIFIED FROM MY CODE: frontend/src/lib/cloudSync.ts]`.
3. **Guaranteed Ephemeral File Cleanup:** Every temporary uploaded, extracted, or pitch-shifted media file on the backend shall be removed inside `try ... finally: cleanup(...)` blocks or FastAPI `BackgroundTask(cleanup, path)` hooks to prevent disk exhaustion `[VERIFIED FROM MY CODE: backend/main.py]`.

### 2.5 Scalability Requirements
1. **Client-Offloaded Real-Time DSP:** High-frequency real-time audio operations—including stem separation (`OfflineAudioContext`), variable-speed time stretching (`HTMLAudioElement.playbackRate`), metronome synthesis, chord voicing playback, and microphone YIN pitch detection—shall execute entirely on the client browser's CPU/audio thread, reducing server compute load to zero during active practice sessions `[VERIFIED FROM MY CODE: frontend/src/pages/Practice.tsx, frontend/src/lib/stemSeparation.ts]`.
2. **Stateless Horizontal Backend Scaling:** Because the FastAPI backend stores no permanent session files on local disk and validates JWTs statelessly via cached JWKS keys, multiple backend container replicas can be scaled horizontally behind a load balancer `[ASSUMPTION/RECOMMENDATION]`.

### 2.6 Maintainability Requirements
1. **Strict Type Safety & Linting:** The frontend codebase shall enforce TypeScript (`~6.0.2`) compilation and fast static analysis via `oxlint` (`^1.75.0`), while the backend uses Pydantic v2 request/response models (`backend/models/schemas.py`) `[VERIFIED FROM MY CODE: frontend/package.json, backend/models/schemas.py]`.
2. **Automated Unit Test & Benchmark Suites:** Core DSP, music theory, and API behaviors shall be verifiable via `pytest` on the backend (`backend/tests/test_api.py`, `test_analysis.py`, `test_difficulty.py`, `test_assistant.py`) and `vitest` on the frontend (`frontend/src/lib/*.test.ts`, `frontend/src/lib/song/__tests__/*`, `frontend/src/lib/tuner/__tests__/*`), alongside the reproducible accuracy benchmark suite in `docs/benchmark/` `[VERIFIED FROM MY CODE]`.

---

## 3. Hardware Requirements (`ASSUMPTION/RECOMMENDATION` & `VERIFIED FROM MY CODE`)

Because Wilsify AI is a web application with a Python DSP backend, hardware requirements are divided into **Client Device Requirements** (for end users and students) and **Server / Development Host Requirements** (for running the FastAPI + Librosa backend).

| Environment | Component | Minimum Specification `[ASSUMPTION/RECOMMENDATION]` | Recommended Specification `[ASSUMPTION/RECOMMENDATION]` | Codebase Justification `[VERIFIED FROM MY CODE]` |
| :--- | :--- | :--- | :--- | :--- |
| **Client Device (End User)** | **Processor (CPU)** | Dual-core 1.8 GHz CPU (x86_64 or ARM / Apple Silicon / Mobile SoC) | Quad-core 2.4+ GHz CPU | Runs browser `AudioContext`, YIN autocorrelation (`pitch.ts`), and `OfflineAudioContext` stem rendering (`stemSeparation.ts`, `stemMixer.ts`). |
| **Client Device (End User)** | **Memory (RAM)** | 4 GB RAM | 8 GB+ RAM | Decoding a 5-minute stereo audio buffer in browser memory requires $\approx 100–200\text{ MB}$ of Float32 PCM heap space. |
| **Client Device (End User)** | **Audio I/O** | Speakers/Headphones + built-in Microphone | Audio Interface or USB Condenser Mic + Headphones | Microphone input (`navigator.mediaDevices.getUserMedia`) is required for the Chromatic Tuner (`Tuner.tsx`), Live Recording (`Upload.tsx`), and Practice Pitch Verification (`Practice.tsx`). |
| **Server / Dev Host (Backend)** | **Processor (CPU)** | 2 vCPU cores (x86_64 or ARM64) | 4+ vCPU cores | Executes `ffmpeg` decoding, `librosa` HPSS (`n_fft=1024`), 36-bin/octave CQT chroma, and HMM Viterbi decoding (`analysis_engine.py`). No dedicated GPU is required. |
| **Server / Dev Host (Backend)** | **Memory (RAM)** | 2 GB RAM | 4 GB+ RAM | Holds `librosa` / `scipy` / `numba` JIT caches and concurrent in-memory NumPy audio arrays for active `/api/analyze` requests. |
| **Server / Dev Host (Backend)** | **Disk Storage** | 2 GB free SSD space | 10 GB+ SSD space | Temporary scratch space (`TMP_DIR`) for 100 MB media uploads and `22,050 Hz` WAV intermediates prior to immediate `cleanup()` deletion. |

---

## 4. Software Requirements (`VERIFIED FROM MY CODE`)

### 4.1 Frontend Software Stack (`frontend/package.json`)
- **Runtime & Package Manager:** Node.js 20+ and `npm` (`INSTALLATION.md`) `[VERIFIED FROM MY CODE]`.
- **UI Framework:** `react` (`^19.2.8`) and `react-dom` (`^19.2.8`) `[VERIFIED FROM MY CODE]`.
- **Routing:** `react-router-dom` (`^7.18.2`) `[VERIFIED FROM MY CODE]`.
- **Language & Build Tooling:** `typescript` (`~6.0.2`), `vite` (`^8.2.0`), `@vitejs/plugin-react` (`^6.0.1`) `[VERIFIED FROM MY CODE]`.
- **Styling:** `tailwindcss` (`^4.3.3`) and `@tailwindcss/vite` (`^4.3.3`) `[VERIFIED FROM MY CODE]`.
- **Cloud Client SDK:** `@supabase/supabase-js` (`^2.117.3`) `[VERIFIED FROM MY CODE]`.
- **Testing & Linting:** `vitest` (`^5.0.3`), `oxlint` (`^1.75.0`) `[VERIFIED FROM MY CODE]`.
- **Browser APIs Used:** Web Audio API (`AudioContext`, `OfflineAudioContext`, `AnalyserNode`, `BiquadFilterNode`, `OscillatorNode`, `GainNode`), MediaStream Recording API (`MediaRecorder`, `getUserMedia`), Fetch/Streams API (`ReadableStreamDefaultReader` for NDJSON), Web Storage API (`localStorage`), and Canvas 2D API `[VERIFIED FROM MY CODE]`.

### 4.2 Backend Software Stack (`backend/requirements.txt`)
- **Language Runtime:** Python `3.10+` (3.11+ recommended per `INSTALLATION.md`) `[VERIFIED FROM MY CODE]`.
- **Web Framework & ASGI Server:** `fastapi` (`>=0.110,<1.0`), `uvicorn[standard]` (`>=0.29,<1.0`), `python-multipart` (`>=0.0.9`) `[VERIFIED FROM MY CODE]`.
- **DSP & Scientific Computing:** `librosa` (`>=0.10,<2.0`), `numpy` (`>=0.24` / `>=1.24`), `scipy` (`>=1.11`), `soundfile` (`>=0.12`) `[VERIFIED FROM MY CODE]`.
- **Export & Engraving Libraries:** `reportlab` (`>=4.0,<6.0`) for vector PDF generation; `mido` (`>=1.3,<2.0`) for Standard MIDI generation `[VERIFIED FROM MY CODE]`.
- **Networking & Media Extraction:** `httpx` (`>=0.27,<1.0`), `yt-dlp` (`>=2025.1.1`) `[VERIFIED FROM MY CODE]`.
- **Security & Configuration:** `PyJWT[crypto]` (`>=2.8,<3`), `python-dotenv` (`>=1.0`) `[VERIFIED FROM MY CODE]`.
- **Testing Framework:** `pytest` (`>=8.0,<10.0` in `backend/requirements-dev.txt`) `[VERIFIED FROM MY CODE]`.
- **Required External System Binary:** `ffmpeg` (installed on system `PATH` for decoding compressed audio/video formats such as `.mp3`, `.m4a`, `.aac`, `.mp4`, `.mov`, `.webm` and executing `/api/pitch-shift`) `[VERIFIED FROM MY CODE: backend/services/audio_extract.py, backend/services/pitch_shift.py]`.

---

## 5. API and Database Requirements (`VERIFIED FROM MY CODE`)

### 5.1 Internal Backend REST & Streaming API (`backend/main.py`)

| HTTP Method & Path | Auth Required | Rate Limit | Request Payload | Response Format |
| :--- | :---: | :---: | :--- | :--- |
| `GET /api/health` | Public | None | None | JSON `{"status": "ok", "service": "wilsify-mvp-backend", "mode": "real-analysis"}` |
| `POST /api/analyze` | Public | 60 req/min/IP | `multipart/form-data` (`file` $\le 100\text{ MB}$) | JSON `AnalysisResult` (`models/schemas.py`) |
| `POST /api/analyze/stream` | Public | 60 req/min/IP | `multipart/form-data` (`file` $\le 100\text{ MB}$) | `application/x-ndjson` stream (`stage`, `heartbeat`, `result`, `error` events) |
| `POST /api/fetch-media` | Public | 60 req/min/IP | JSON `{"url": "https://..."}` | Binary `FileResponse` + `X-Media-Filename`, `X-Media-Title` headers |
| `GET /api/youtube/search` | Public | 60 req/min/IP | Query params `q` (`min_length=2`), `limit` (`1..24`) | JSON `{"results": [YouTubeSearchItem, ...]}` |
| `POST /api/assistant` | **Bearer JWT** (`require_user`) | None | JSON `AssistantRequest` (`question`, `context`, `history`) | JSON `AssistantResponse` (`question`, `answer`, `matchedTopic`, `isDemo`) |
| `POST /api/export/midi` | Public | None | JSON `MidiExportRequest` (`title`, `bpm`, `chords`) | `audio/midi` binary stream (`*.mid`) |
| `POST /api/export/pdf` | Public | None | JSON `LeadSheetRequest` (or legacy `PdfExportRequest`) | `application/pdf` binary stream (`*-lead-sheet.pdf`) |
| `POST /api/pitch-shift` | Public | None | `multipart/form-data` (`file`, `semitones` `-12..+12`) | `audio/mp4` binary stream (`*-shifted.m4a`) |
| `POST /api/rights-attestation` | Public | None | JSON `{"fileName": "...", "attestedAt": 1700000000}` | JSON `{"ok": true}` (appends to `wilsify-rights-attestations.jsonl`) |

### 5.2 External Third-Party APIs
1. **Google Gemini Generative Language REST API (`backend/services/assistant_engine.py`):**
   - **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}` `[VERIFIED FROM MY CODE]`.
   - **Models Used:** Primary `gemini-flash-latest`, automatic fallback `gemini-flash-lite-latest` on HTTP `429`, `500`, or `503` (`timeout = 20.0s`, `temperature = 0.6`, `maxOutputTokens = 600`) `[VERIFIED FROM MY CODE]`.
2. **Supabase Auth & JWKS Verification API (`backend/main.py`, `frontend/src/lib/supabase.ts`):**
   - **JWKS Endpoint:** `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` used by `jwt.PyJWKClient` to verify `ES256` and `RS256` tokens `[VERIFIED FROM MY CODE]`.

### 5.3 Database & LocalStorage Schema Requirements (`supabase/migrations/`)

#### A. Active Cloud Sync Table (`supabase/migrations/0001_user_data.sql`) `[VERIFIED FROM MY CODE]`
Used actively by `frontend/src/lib/cloudSync.ts` to persist user state across devices:
- **Table:** `public.user_data`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `kind text not null check (kind in ('library', 'chat', 'practice'))`
  - `id text not null`
  - `data jsonb not null`
  - `updated_at timestamptz not null default now()`
  - **Primary Key:** `(user_id, kind, id)`
  - **Index:** `user_data_user_kind_updated_idx` on `(user_id, kind, updated_at desc)`
  - **RLS Policies:** `user_data_select_own`, `user_data_insert_own`, `user_data_update_own`, `user_data_delete_own` enforcing `auth.uid() = user_id`.

#### B. Prepared Relational Song-Sheet Schema (`supabase/migrations/0002_song_sheet.sql`) `[VERIFIED FROM MY CODE]`
Defined in the repository to support normalized relational storage of song sheets (currently, song lyrics and display preferences are persisted client-side via `frontend/src/lib/song/songStore.ts` in `localStorage` keys `wilsify.song.lyrics.<songId>` and `wilsify.song.display`):
1. `public.songs` (`id`, `user_id`, `title`, `artist`, `duration_sec`, `audio_url`, `source_filename`, `created_at`, `updated_at`)
2. `public.song_analysis` (`song_id`, `key`, `tonic`, `scale`, `bpm`, `time_signature`, `capo`, `difficulty_label`, `difficulty_score`, `raw_json`, `updated_at`)
3. `public.song_sections` (`id`, `song_id`, `kind` in `['intro','verse','pre-chorus','chorus','bridge','solo','outro','interlude']`, `label`, `order_index`, `start_sec`, `end_sec`)
4. `public.lyric_lines` (`id`, `song_id`, `section_id`, `line_index`, `text`, `start_sec`, `end_sec`)
5. `public.lyric_words` (`id`, `line_id`, `word_index`, `text`, `start_sec`, `end_sec`)
6. `public.chord_events` (`id`, `song_id`, `chord`, `start_sec`, `end_sec`, `confidence`, `uncertain`, `alternative`, `line_id`, `word_index`)
7. `public.practice_sessions` (`id`, `user_id`, `song_id`, `started_at`, `duration_sec`, `speed_ratio`, `transpose`, `capo`, `simplified`, `loop_section_id`)
- All 7 tables enforce PostgreSQL Row-Level Security (`auth.uid() = user_id` or ownership via `public.songs`).

#### C. Browser `localStorage` Keys (`frontend/src/lib/`) `[VERIFIED FROM MY CODE]`
- `wilsify_library_v1`: Up to 25 recent `LibraryEntry` objects (`library.ts`).
- `wilsify_practice_sessions_v1`: Up to 100 `PracticeSession` records (`practiceSession.ts`).
- `wilsify:assistant-chats`: Up to 30 AI chat threads (`Assistant.tsx`).
- `wilsify.song.lyrics.<songId>` and `wilsify.song.display`: Per-song lyric documents and Song Sheet display settings (`songStore.ts`).
- `wilsify_community_v1` and `wilsify_community_Flagged_v1`: Local community feed posts and moderation flags (`community.ts`).
