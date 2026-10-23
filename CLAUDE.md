# Wilsify AI (MVP) — project map

AI music-learning companion. User signs in, uploads audio/video (or picks a YouTube video / mic / sample track);
the backend analyses it (ffmpeg + librosa, HMM/Viterbi chord smoothing) for key, BPM, 3/4-vs-4/4 meter, timed chords
and difficulty. User then reads a synced chord+lyric sheet and practises. Status: MVP, NOT production-ready
(see docs/verification/FINAL_VERIFICATION_REPORT.md).

## Stack
- Backend: Python 3.10+ (venv is 3.12), FastAPI + uvicorn, librosa/numpy/scipy, yt-dlp, reportlab, mido, demucs (stems), PyJWT.
- Frontend: Vite + React 19 + TypeScript + Tailwind v4 + react-router v7 (data router), Vitest + jsdom, oxlint.
- Auth/data: Supabase (email/password, optional Google). Table `public.user_data` with RLS. No service-role key is used.
- Optional AI tutor: Gemini (`GEMINI_API_KEY`); without it a built-in song-grounded fallback answers.
- System dependency: ffmpeg on PATH (or `FFMPEG_PATH`).

## Commands (run from repo root; Windows paths shown in docs use PowerShell)
- Backend dev: `cd backend; .\venv\Scripts\Activate.ps1; uvicorn main:app --reload --port 8000`
- Backend install: `pip install -r requirements.txt` (dev/test extras: `requirements-dev.txt`)
- Backend tests: `cd backend; python -m pytest -q` (offline; no YouTube/DNS/Supabase needed)
- Frontend dev: `cd frontend; npm run dev` (port 5173; proxies `/api` to 127.0.0.1:8000)
- Frontend checks: `npm run typecheck` · `npm run lint` · `npm test` (vitest run) · `npm run build` (tsc -b && vite build -> dist/)
- Full setup/migration/deploy guide: INSTALLATION.md (the single source of truth for setup).

## Env vars (names only; never commit .env)
- frontend/.env: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (read at start/build; restart dev after edits).
- backend/.env: `SUPABASE_URL`, `FRONTEND_ORIGIN` (CORS, comma list), `ANALYZE_RATE_LIMIT_PER_MINUTE`, `GEMINI_API_KEY`,
  `GEMINI_MODEL`, `GEMINI_BACKUP_MODEL`, `FFMPEG_PATH`. Templates: `.env.example` in each folder.

## Layout
- backend/main.py — single FastAPI app (~980 lines): routes, CORS, rate-limit + telemetry middleware, upload validation.
- backend/services/ — analysis_engine (key/BPM/chords), assistant_engine (tutor), audio_extract, difficulty, media_fetch (yt-dlp, SSRF guards),
  midi_export, pdf_export, pitch_shift, stem_separation (demucs jobs).
- backend/tests/ — test_api.py, test_analysis_engine.py (+ fixtures/*.npz). backend/assets/fonts — fonts for PDF export.
- frontend/src/App.tsx — router + providers; routes: /studio (home), /upload, /analysis, /practice, /assistant, /tuner, /chords,
  /library, /song/:songId, /stems, /dashboard, /community, /tools, /settings/*, auth pages (/login, /signup, ...).
- frontend/src/pages/ — page-level screens. frontend/src/components/ — UI grouped by feature (song, analysis, chords, tuner, stems, upload, settings, home, auth).
- frontend/src/lib/ — logic: api.ts (backend client + response types), auth.tsx, supabase.ts, cloudSync.ts + library.ts + localData.ts (persistence),
  chords/ + theory/ + transpose.ts (music theory), audio/ (Web Audio engines), pitchDetect.ts, metronome.ts, MvpContext.tsx.
- frontend/src/test/ — shared test helpers (fakeSupabase, fakeNetwork, fakeAudio, renderApp). Tests sit beside code as *.test.ts(x).
- supabase/migrations/ — 0001_user_data.sql (required), 0002_song_sheet.sql (unused by MVP). supabase/templates/ — email HTML.
- docs/ — verification reports, analysis, benchmark scripts, STYLE_GUIDE.md; docs/archive/ is legacy (describes other architectures; ignore).
- Root docs: README.md, INSTALLATION.md, MVP_PLAN.md (scope, limitations, backlog), SPONSOR_*.md, DOCUMENTATION_AUDIT.md.

## Conventions
- API: all backend routes under `/api/*` (health, analyze, analyze/stream, fetch-media, youtube/search, assistant, export/midi|pdf, pitch-shift, stems/*,
  rights-attestation). `/api/assistant` needs a Supabase JWT (verified against the project's public keys). Types for responses live in frontend/src/lib/api.ts.
- State: React context + hooks, no Redux. Library is saved to localStorage and synced to Supabase `user_data`; raw audio is never stored.
- Styling: Tailwind v4 utilities + src/index.css; follow docs/STYLE_GUIDE.md. Components PascalCase.tsx, lib modules camelCase.ts.
- Tests: Supabase, backend and audio hardware are faked in frontend tests; keep new tests offline.
- Chord vocabulary is deliberately limited: major, minor, 7, m7, no-chord. Meter: 4/4 or 3/4 only.

## Gotchas / unfinished
- Docs claim `/api/stems/*` is "not implemented" and Stem Splitter UI is a mock, but backend/main.py does define stems endpoints
  (analyze/separate/job/file) using demucs — verify before trusting either.
- Rate limiter and attestation log are in-process: run ONE backend instance. Upload cap 100 MB; YouTube 20 min / 100 MB.
- Community feed and paid plans are "Coming soon" placeholders. Real Windows browser run + live Supabase migration were still unverified per README.
- Known open item: tempo/meter for TEST_003 unconfirmed. Lint: 0 errors, ~30 warnings. Bundle ~1.1 MB (chunk warning).
- Repo root has leftover Android/Gradle files (build.gradle.kts, settings.gradle.kts, gradlew) referencing a nonexistent `:app` module — unused.
- Local-only/ignored: backend/venv, backend/.env, frontend/.env, .pytest_cache, frontend/dist. backend/wilsify.sqlite3 exists but no code reference found. `Wilsify AI.html` (600 KB static page) sits at repo root.
- .claude/launch.json hardcodes `C:\kodingan\wilsify-ai-mvp\...` paths (another machine) — update before using.
- Git: branch `main`, remote reyhanamando35/wilsify-ai (PR-merge workflow from a `wilbur` branch).
