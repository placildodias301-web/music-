# Wilsify AI — Working MVP Engineering Plan (`MVP_PLAN.md`)

**Goal:** Build and verify the smallest complete, production-quality product loop:  
`User signs up / logs in → uploads audio or searches YouTube → system analyzes the song with real-time progress → user views a synced chord/lyric sheet → user practices using the result (and retains saved song/analysis/lyrics/transpose/capo state across page refreshes).`

---

> **Status (2026-10-18):** TASK-01 → TASK-12 are complete in code; final status is **NOT READY**. Real demo files TEST_007 and TEST_003 analyse and auto-save. Still outstanding: migration 0001 on the live project, the real Windows browser loop, and the Windows test runs (see `docs/verification/FINAL_VERIFICATION_REPORT.md` §2A and §8). Run/migrate/test instructions: [`INSTALLATION.md`](./INSTALLATION.md). Evidence for every acceptance test: [`docs/verification/FINAL_VERIFICATION_REPORT.md`](./docs/verification/FINAL_VERIFICATION_REPORT.md). Per-flow test list: [`docs/verification/TEST_COVERAGE.md`](./docs/verification/TEST_COVERAGE.md).

---

## 1. Current Working Features

1. **Supabase Authentication (`frontend/src/lib/auth.tsx`, `frontend/src/pages/auth/*`):**
   - Email/password sign-up, sign-in, password reset, email verification, Google OAuth, and protected route guarding in `<Layout />` (`frontend/src/App.tsx`).
   - Backend JWT verification (`ES256`/`RS256`) against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` in `backend/main.py` (`require_user`).
2. **Audio/Video Ingestion & Sample Track Generator (`frontend/src/pages/Upload.tsx`, `backend/main.py`):**
   - Local file picker and drag-and-drop for 14 audio/video extensions (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.wma`, `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`) up to `100 MB`.
   - Browser-synthesized sample track (`generateSampleTrack.ts`), live microphone recording (`MicRecorder.tsx`), and mandatory copyright attestation (`POST /api/rights-attestation`).
3. **YouTube Search & Link Media Fetching (`backend/services/media_fetch.py`, `YouTubeBrowser.tsx`):**
   - Metadata search via `GET /api/youtube/search` (`yt-dlp` flat search) and audio extraction via `POST /api/fetch-media` with DNS SSRF protection (`_assert_public_host`), 20-minute duration cap, 100 MB limit, and automatic temporary file cleanup.
4. **Streaming MIR Audio Analysis (`backend/services/analysis_engine.py`, `backend/services/difficulty.py`):**
   - `POST /api/analyze/stream` emits real-time NDJSON progress events (`uploaded` $\rightarrow$ `decoding` $\rightarrow$ `separating` $\rightarrow$ `beats` $\rightarrow$ `chroma` $\rightarrow$ `chords` $\rightarrow$ `key` $\rightarrow$ `meter` $\rightarrow$ `result`) with 10-second heartbeats and cooperative cancellation.
   - Extracts Key, scale, confidence, BPM, meter (`4/4` or `3/4`), beat/downbeat timestamps, timed chord segments with confidence and runner-up alternatives, and `0–100` difficulty rating.
5. **Synced Chord & Lyric Sheet (`frontend/src/pages/Song.tsx`, `frontend/src/lib/song/*`):**
   - Displays chords synchronized to audio playback, supports `.lrc` timed lyrics, plain-text lyrics with interactive Tap-Sync (`Enter` key), transpose (`-12..+12`), capo (`0–7`), chord simplification (`simplify.ts`), and section looping.
6. **Interactive Practice Studio (`frontend/src/pages/Practice.tsx`):**
   - Playback speed control (`0.5x`, `0.75x`, `1x`, `1.25x`, `1.5x`), looping, drift-free Web Audio lookahead metronome, tap tempo, and microphone YIN pitch accuracy tracking with auto-tempo ramp-up.
7. **Existing Supporting Tools (Tuner, Chord Library, AI Tutor, Export: implemented; Stem Splitter: preview only):**
   - Chromatic Tuner (`Tuner.tsx`), Chord Library (`ChordLibrary.tsx`), Stem Splitter UI (`StemMixer.tsx`, **preview only** — no backend stem endpoints), AI Tutor (`Assistant.tsx`, `AskWilsify.tsx`), and MIDI/PDF Export (`midi_export.py`, `pdf_export.py`).

---

## 2. Previously Broken Features — Status After Repair

All items below were repaired during TASK-01 → TASK-09 and are covered by automated tests (see `docs/verification/TEST_COVERAGE.md`).

| # | Original problem | Status | Where it is verified |
| :-: | :--- | :---: | :--- |
| 1 | Active song lost on refresh (`MvpContext` memory only; no auto-save) | **Fixed** — completed analysis auto-saves to Library; context rehydrates from the saved song | `uploadAnalysisFlow.test.tsx`, `mvpCoreLoop.test.ts` |
| 2 | Lyrics/transpose/capo keyed differently for `/song/current` vs `/song/:songId` | **Fixed** — one persistence path; optional `lyrics`/`transpose`/`capo`/`simplify` fields on `SavedAnalysis` | `mvpCoreLoop.test.ts`, `coreLoopScreens.test.tsx` |
| 3 | Practice blocked without live audio after refresh | **Fixed** — Mode B (Chord Practice) without audio; **Re-attach audio file** switches to Mode A | `practiceStudio.test.tsx` |
| 4 | Mock Community/Plans without "Coming soon" | **Fixed** — both show "Coming soon"; no fake leaderboard, no checkout buttons | `coreLoopScreens.test.tsx` |
| 5 | No `X-Request-ID` / structured telemetry | **Fixed** — header on every response; structured log per request/analysis | `backend/tests/test_api.py` |
| 6 | No `test`/`typecheck` scripts | **Fixed** (TASK-01) | `npm test`, `npm run typecheck` |
| 7 | Endless save/reload loop when changing Practice speed (found in TASK-10) | **Fixed** — approved one-line dependency fix in `Practice.tsx` | `practiceStudio.test.tsx` |
| 8 | Practice audio not paused on unmount (found in TASK-10) | **Fixed** — approved cleanup change in `Practice.tsx` | `practiceStudio.test.tsx` |

---

## 3. Exact MVP Scope vs. Intentionally Postponed Features

### 3.1 Exact MVP Scope (Core Loop)
1. **Account Creation & Login:** Sign up / Sign in via Supabase Auth with clear validation, loading, and network-error feedback.
2. **Media Input:** Upload a local audio/video file (with client + server validation) or select a YouTube video via in-app search / URL fetch.
3. **Real-Time MIR Analysis:** Stream stage-by-stage progress (`uploaded` through `meter`), log telemetry (`request_id`, `status`, `processingSeconds`, `failure_reason`), and auto-save the completed analysis to Library (`localStorage` + Supabase `public.user_data`).
4. **Synced Chord & Lyric Sheet (`/song/:songId` & `/song/current`):** View synchronized chords and lyrics, edit/paste/tap-sync lyrics, adjust transpose/capo/simplify settings, and persist those settings offline in `localStorage` and backward-compatibly inside `SavedAnalysis` (`public.user_data`).
5. **Practice Studio (`/practice`):** Practice with speed scaling, looping, metronome, tap tempo, and mic accuracy tracking, with seamless support after page refresh or Library reopen.

### 3.2 Features Intentionally Postponed (Non-Goals)
- **Paid Subscriptions & Billing (`/settings/plans`):** Marked as **Coming soon**; no payment gateway or credit deduction will be built.
- **Multi-User Cloud Community Feed & Leaderboard (`/community`):** Marked as **Coming soon** in navigation and page header.
- **Relational Song-Sheet Table Migration (`0002_song_sheet.sql`):** Postponed in favor of backward-compatible `public.user_data` JSONB persistence (`0001_user_data.sql`) + offline `localStorage` fallback so no extra database migration is required for the core loop.

---

## 4. Environment Variables and Secrets

The complete variable tables (frontend `VITE_*`, backend `SUPABASE_URL`, `FRONTEND_ORIGIN`, `ANALYZE_RATE_LIMIT_PER_MINUTE`, `GEMINI_*`, `FFMPEG_PATH`), where to get each value, and secret-handling rules live in [`INSTALLATION.md`](./INSTALLATION.md) §3. They are not repeated here.

---

## 5. Database Migrations

- **Required:** [`supabase/migrations/0001_user_data.sql`](./supabase/migrations/0001_user_data.sql) — creates `public.user_data (user_id, kind, id, data jsonb, updated_at)`, primary key `(user_id, kind, id)`, RLS policy "own rows" (`auth.uid() = user_id`). Idempotent; run once in Supabase → SQL Editor (or `npx supabase db push`). Steps and verification queries: `INSTALLATION.md` §2.1.
- **Not used by the MVP:** `supabase/migrations/0002_song_sheet.sql` (relational song tables). The frontend never reads or writes them; songs sync as JSON in `public.user_data`. Note `supabase db push` applies every file, so use the SQL Editor if you want only the MVP schema.
- **Offline/back-compat:** `SavedAnalysis` records live in `localStorage` (`wilsify_library_v1`) and sync to `public.user_data` (`kind='library'`). The optional fields (`lyrics`, `transpose`, `capo`, `simplify`) keep old rows valid, and everything keeps working from `localStorage` if Supabase is unreachable (a dismissible "Cloud Sync Unavailable" notice is shown).

---

## 6. API Endpoints Required for the Core Loop

| Endpoint | Method | Purpose in Core Loop | Validation, Timeout & Error Handling |
| :--- | :---: | :--- | :--- |
| `/api/health` | `GET` | Backend liveness check & startup verification | Returns `{"status": "ok", "service": "wilsify-mvp-backend", "mode": "real-analysis"}` + `X-Request-ID`. |
| `/api/analyze/stream` | `POST` | Primary streaming MIR audio analysis | Validates extension/MIME, non-empty file, $\le 100\text{ MB}$ size, 60 req/min rate limit, 120s `ffmpeg` decode timeout, 10s NDJSON heartbeat, cooperative disconnect cancellation, and guaranteed temp file cleanup. |
| `/api/analyze` | `POST` | Synchronous MIR audio analysis fallback | Same validation, timeouts, and cleanup as `/api/analyze/stream`. |
| `/api/youtube/search` | `GET` | In-app YouTube song search | Validates query length ($\ge 2$ chars), `limit` ($1..24$), 60 req/min rate limit, `yt-dlp` socket timeout, and returns clear HTTP 400/503 error details. |
| `/api/fetch-media` | `POST` | Downloads audio from selected YouTube/media URL | Enforces DNS SSRF check (`_assert_public_host`), $\le 20\text{ min}$ duration, $\le 100\text{ MB}$ size, non-live check, and deletes temp file via `BackgroundTask`. |
| `/api/rights-attestation` | `POST` | Logs mandatory copyright confirmation | Validates `fileName` ($\le 400$ chars) and appends timestamped JSONL audit entry. |
| `/api/assistant` | `POST` | AI tutor (not part of the core loop) | Only endpoint requiring a Supabase JWT (`require_user`); uses Gemini if `GEMINI_API_KEY` is set, otherwise a deterministic fallback. |
| `/api/export/midi`, `/api/export/pdf`, `/api/pitch-shift` | `POST` | Exports / pitch shift | Validated payloads; not part of the core loop. |

---

## 7. Frontend Pages & Components Required

1. **Auth Pages (`frontend/src/pages/auth/Login.tsx`, `Signup.tsx`):** Account creation, sign-in, and session hydration into `<Layout />`.
2. **Studio / Home (`frontend/src/pages/Studio.tsx`):** Quick upload dropzone, sample track trigger, and recent library list.
3. **Upload & YouTube Browser (`frontend/src/pages/Upload.tsx`, `YouTubeBrowser.tsx`, `AnalysisProgressScreen.tsx`):** File validation, YouTube search/selection, rights attestation, real-time stage progress bar, and error recovery UI.
4. **Analysis Overview (`frontend/src/pages/Analysis.tsx`):** Displays detected Key, BPM, Meter, Difficulty, interactive chord timeline, transpose/capo controls, and 1-click buttons to **Open Chord Sheet** (`/song/current`) and **Practice Track** (`/practice`).
5. **Synced Chord & Lyric Sheet (`frontend/src/pages/Song.tsx`, `ChordSheet.tsx`, `LyricsEditor.tsx`):** Displays chords above lyrics synced to playback clock, interactive Tap-Sync, transpose/capo/simplify toggles, and inline section loop controls.
6. **Practice Studio (`frontend/src/pages/Practice.tsx`):** Playback speed controller, loop toggle, lookahead Beat Metronome, Tap Tempo, Live Mic Accuracy Tracker, and re-attach audio support after refresh.
7. **Personal Library (`frontend/src/pages/Library.tsx`):** Lists all analyzed songs persisted in `localStorage` and Supabase `public.user_data`, with 1-click actions to reopen **Analysis**, **Chord Sheet**, or **Practice Studio**.

---

## 8. Task List (`TASK-01` to `TASK-12`) — all complete

| Task | Scope | Status |
| :--- | :--- | :---: |
| TASK-01 | Environment and dependency audit | Done |
| TASK-02 | Database schema and migrations (`public.user_data`, backward-compatible `cloudSync.ts`/`library.ts`) | Done in code — **migration not yet applied to the live Supabase project** |
| TASK-03 | Authentication flow (config guard, hydration resilience) | Done |
| TASK-04 | Audio upload and validation (client + backend) | Done |
| TASK-05 | YouTube search/input flow | Done |
| TASK-06 | MIR pipeline telemetry (`X-Request-ID`, structured logs), auto-save, refresh persistence | Done |
| TASK-07 | Unified lyric/transpose/capo persistence across `/song/current` and `/song/:songId` | Done |
| TASK-08 | Practice studio (Mode A/B, audio re-attach) | Done |
| TASK-09 | Error/empty/loading states, "Coming soon" badges | Done |
| TASK-10 | End-to-end & integration tests (backend 146 tests; frontend 415 tests in 24 files) | Done — `docs/verification/TEST_COVERAGE.md` |
| TASK-11 | Run/install/migrate/test instructions | Done — `INSTALLATION.md`, this file |
| TASK-12 | Deployment checklist & final verification report | Done — `docs/verification/FINAL_VERIFICATION_REPORT.md` |

---

## 9. Run, Migrate & Test Commands

All commands (Windows PowerShell and macOS/Linux) are in [`INSTALLATION.md`](./INSTALLATION.md): migration §2.1, backend §4, frontend §5, tests §7.

### 10-Step End-to-End Acceptance Verification
1. Start backend and frontend using documented commands.
2. Sign up or log in.
3. Upload a real audio file (or select a YouTube song).
4. Complete analysis with real-time progress feedback.
5. Confirm the song automatically appears in Library.
6. Refresh the browser page (`F5`).
7. Reopen the song from Library (and verify `/analysis`, `/song/:id`, `/practice` directly on refresh).
8. Confirm chords, lyrics, transpose/capo state, and practice mode remain available.
9. Disconnect internet or stop backend, then confirm the app shows a clear user-facing error instead of silently failing.
10. Run backend and frontend test suites; all must pass with zero errors.

Results per step (command, expected, actual, pass/fail, evidence): [`docs/verification/FINAL_VERIFICATION_REPORT.md`](./docs/verification/FINAL_VERIFICATION_REPORT.md).

---

## 10. Deployment Plan, Checklist & Known Limitations

### Deployment Plan
1. **Database (Supabase):** apply `0001_user_data.sql`; enable Email (and optional Google) providers; set Site URL + Redirect URLs.
2. **Backend (FastAPI + ffmpeg):** Linux container/VM, Python 3.10+, system `ffmpeg`. Set `SUPABASE_URL`, `FRONTEND_ORIGIN`, `ANALYZE_RATE_LIMIT_PER_MINUTE`, optional `GEMINI_API_KEY`. Run `uvicorn main:app --host 0.0.0.0 --port 8000` behind HTTPS.
3. **Frontend (Vite SPA):** set the three `VITE_*` variables **before** `npm run build`; serve `dist/` with SPA fallback to `index.html`.

### Deployment Checklist
- [ ] `0001_user_data.sql` applied; `select count(*) from public.user_data;` succeeds
- [ ] Auth providers + Site URL/Redirect URLs configured for the production URL
- [ ] No secret/service-role key in frontend files, `.env.example` or Git
- [ ] Backend env set; `FRONTEND_ORIGIN` is the exact production origin
- [ ] `GET /api/health` returns `status: ok` over HTTPS
- [ ] Frontend built with production `VITE_*` values; SPA fallback configured
- [ ] Request body limit ≥ 100 MB and read timeout ≥ 3 min on the proxy
- [ ] Single backend instance (rate limiter and attestation log are in-process)
- [ ] All test suites pass on the deployed commit (`docs/verification/FINAL_VERIFICATION_REPORT.md`)
- [ ] Manual smoke test on the live URL: sign up → upload → analyze → Library → refresh → practice → stop backend (clear error)

### Known Limitations
1. **Ephemeral raw audio by design:** audio is never stored. After refresh or on another device, chords, lyrics, key/BPM and settings remain; re-attach the file for full playback.
2. **Four-quality chord vocabulary:** major, minor, `7`, `m7`, plus no-chord.
3. **YouTube upstream throttling:** `yt-dlp` depends on YouTube availability; capped at 20 min / 100 MB. Local upload always works.
4. **Stem Splitter is a preview:** the UI uses a mock; `/api/stems/*` is not implemented.
5. **In-process rate limiter and attestation log:** per backend process.
6. **Bundle size:** ~1.1 MB JS (≈320 KB gzip); build prints a chunk-size warning.
7. **Dev-only advisory:** `npm audit` reports 1 high issue in `source-map-js` (transitive, dev); 0 production vulnerabilities.
8. **Lint:** 30 `oxlint` warnings, 0 errors (see `docs/verification/FINAL_VERIFICATION_REPORT.md` §1).
9. **Upload "backend offline" message** uses the analysis screen's alert rather than the shared `ErrorBanner` component (message and Retry still work).
10. **Automated tests are not a real browser:** real Supabase, real audio output/microphone and real YouTube are verified manually.
11. **TEST_003 tempo/meter unconfirmed:** 84 BPM `estimated`, 3/4, versus the unverified reference of 155.4 BPM, 4/4; needs human ground truth.

### Postponed Features (Non-Goals)
- Paid subscriptions & billing (`/settings/plans` — "Coming soon")
- Community feed & leaderboard (`/community` — "Coming soon")
- Server-side stem separation
- Relational song-sheet tables (`0002_song_sheet.sql`)
- Native mobile app, offline audio caching, shared/team libraries

---

## 11. Backlog (carried over from the archived `PROJECT_PLAN.md` and `TODO.md`)

Open items only; nothing here is scheduled.

**Backend**
- More regression tests for pitch-shifted and noisy inputs.
- Cache results for repeated analysis of the same audio.
- Evaluate a second, independent key-estimation method.
- Evaluate alternative pitch-detection libraries.

**Frontend**
- Clearer UI for the detected sounding key vs. guitar chord shapes with capo applied.
- Reduce bundle size and initial load time (see Known Limitations).
- Capture current production screenshots for documentation.

**Recorded as done in those files:** key detection fixed across multiple Instagram Reels (enharmonic spelling, tuning-aware chroma, major/minor profiles); capo-to-shape separation; chord display synced to the new key estimates.

**Dropped as no longer true:** "need automated frontend tests" (415 exist); "add transpose functionality" (transpose `-12..+12` and capo `0–7` exist); "Python 3.12" and "basic-pitch" (the app requires Python 3.10+ and uses its own librosa/HMM chord pipeline).

---

## 12. Documentation map

See [`docs/README.md`](./docs/README.md). Only this file defines current scope, roadmap and status; [`docs/verification/FINAL_VERIFICATION_REPORT.md`](./docs/verification/FINAL_VERIFICATION_REPORT.md) is the only verification status.
