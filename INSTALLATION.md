# Wilsify AI — MVP: Installation, Configuration & Run Guide

This is the only setup, run, migration and deployment guide. Project overview: [`README.md`](./README.md) · scope and status: [`MVP_PLAN.md`](./MVP_PLAN.md) · all docs: [`docs/README.md`](./docs/README.md).

Wilsify AI is two programs plus a hosted Supabase project:

```
wilsify-ai/
├── backend/     Python + FastAPI — real audio analysis (ffmpeg + librosa), YouTube fetch, AI tutor
├── frontend/    Vite + React + TypeScript + Tailwind — the UI
└── supabase/    SQL migrations (run once in your Supabase project)
```

**The MVP loop:** sign up / log in → upload audio or pick a YouTube video → analysis with live progress → synced chord & lyric sheet → practice. Songs, lyrics, transpose, capo and simplify are saved to the browser and (when signed in) to your Supabase account.

Commands are given for **Windows PowerShell** and **macOS / Linux (bash/zsh)**. Run them from the repository root unless a step says otherwise.

---

## 1. Prerequisites

| Requirement | Version | Check with |
|---|---|---|
| Python | 3.10 or newer | `python --version` (Windows) · `python3 --version` (macOS/Linux) |
| Node.js + npm | Node 18 or newer | `node --version` · `npm --version` |
| ffmpeg | any recent version | `ffmpeg -version` |
| A Supabase project | free tier is enough | https://supabase.com/dashboard |

**Install ffmpeg** (the backend needs it to decode every audio/video file):

```powershell
# Windows PowerShell
winget install Gyan.FFmpeg
# then CLOSE and REOPEN PowerShell so PATH updates, and check:
ffmpeg -version
```
```bash
# macOS
brew install ffmpeg
# Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg
```
If ffmpeg is installed but not on PATH, set `FFMPEG_PATH` in `backend/.env` to the full path of the executable.

---

## 2. Supabase setup (once)

1. Create a project at https://supabase.com/dashboard.
2. **Get the keys** — Project Settings → **API Keys** (and **Data API** for the URL):
   - **Project URL** → `https://<project-ref>.supabase.co`
   - **Publishable key** (`sb_publishable_…`, a.k.a. anon key) → safe for the browser.
   - **Never** put the `secret` / `service_role` key in the frontend, in `.env.example`, or in Git. This app does not need it.
3. **Authentication → Providers**: enable **Email**. (Optional: **Google**, which also needs a Google OAuth client.)
4. **Authentication → URL Configuration**: set **Site URL** to your frontend URL (`http://localhost:5173` for local work) and add the same URL (plus your production URL later) to **Redirect URLs**. Password-reset and Google sign-in return to these.
5. Optional: paste `supabase/templates/confirm_signup.html` and `reset_password.html` into Authentication → Email Templates.

### 2.1 Run the database migration

The MVP needs **one** migration: `supabase/migrations/0001_user_data.sql`. It creates `public.user_data` (library, AI chats and practice log per user) with row-level security so a user can only read and write their own rows.

**Option A — SQL Editor (no tools needed):**
1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the full contents of `supabase/migrations/0001_user_data.sql` and click **Run**. It is safe to run twice (`create table if not exists`, `drop policy if exists`).

**Option B — Supabase CLI:**
```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```
> `db push` applies **every** file in `supabase/migrations/`, including `0002_song_sheet.sql`. The MVP does not read those tables (see "Known limitations"). They are harmless, but if you only want the MVP schema, use Option A.

**Verify** (SQL Editor):
```sql
select count(*) from public.user_data;                       -- 0, no error
select policyname from pg_policies where tablename = 'user_data';  -- "own rows"
```
If the table is missing, the app still works from the browser's storage and shows a non-blocking "Cloud Sync Unavailable" notice.

---

## 3. Configure environment variables

Copy the examples, then edit the copies. **Do not commit `.env` files.**

```powershell
# Windows PowerShell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```
```bash
# macOS / Linux
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 3.1 `frontend/.env`

| Variable | Required | Example | Where to get it |
|---|---|---|---|
| `VITE_API_URL` | Yes | `http://localhost:8000` | Where your backend runs (the production backend URL when deployed). |
| `VITE_SUPABASE_URL` | Yes | `https://abcd1234.supabase.co` | Supabase → Project Settings → API (Project URL). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | `sb_publishable_…` | Supabase → Project Settings → API Keys → **Publishable key**. |

Vite reads these **at build/start time**: restart `npm run dev` after editing, and set them *before* `npm run build` for production. If a value is missing or still a placeholder, the app shows a "Supabase Setup Required" screen instead of crashing.

### 3.2 `backend/.env`

| Variable | Required | Default | Where to get it / purpose |
|---|---|---|---|
| `SUPABASE_URL` | Yes (for the AI tutor) | – | Same Project URL as above. The backend downloads Supabase's *public* signing keys from it to check sign-in tokens for `/api/assistant`. No secret key is needed. |
| `FRONTEND_ORIGIN` | No | `http://localhost:5173,…:5174,…:4173` (+ `127.0.0.1`) | Comma-separated list of browser origins allowed by CORS. **Set to your deployed frontend URL in production.** |
| `ANALYZE_RATE_LIMIT_PER_MINUTE` | No | `60` | Per-IP limit for analyze / fetch-media / YouTube search. `0` disables it. |
| `GEMINI_API_KEY` | No | unset | https://aistudio.google.com/apikey. Without it the AI tutor uses a built-in song-grounded fallback. |
| `GEMINI_MODEL`, `GEMINI_BACKUP_MODEL` | No | `gemini-flash-latest`, `gemini-flash-lite-latest` | Override the Gemini models. |
| `FFMPEG_PATH` | No | auto-detect on PATH | Full path to ffmpeg if it is not on PATH. |

---

## 4. Install & run the backend (Terminal 1)

```powershell
# Windows PowerShell
cd backend
python -m venv venv
# If activation is blocked: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
```bash
# macOS / Linux
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Wait for `Application startup complete.` (the first start runs a short warm-up analysis; allow 10+ seconds).

**Health check** (another terminal):
```powershell
Invoke-RestMethod http://localhost:8000/api/health     # Windows
```
```bash
curl http://localhost:8000/api/health                  # macOS / Linux
# {"status":"ok","service":"wilsify-mvp-backend","mode":"real-analysis"}
```
Every response carries an `X-Request-ID` header; quote it when reporting a problem and search the backend log for it.

---

## 5. Install & run the frontend (Terminal 2)

```powershell
# Windows PowerShell
cd frontend
npm install
npm run dev
```
```bash
# macOS / Linux
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**, create an account (or log in), and you are in.

---

## 6. Try the whole loop

1. **Sign up / log in.** (Email confirmation applies if your Supabase project requires it.)
2. **Upload** a real audio/video file (≤ 100 MB), search YouTube, or choose **Sample Track**. Tick the rights confirmation.
3. **Analyze Song** — a progress screen shows upload and server stages. **Cancel** stops it; nothing is saved.
4. The song is **auto-saved to Library**. Open **Chord Sheet** to see synced chords; add lyrics; try transpose, capo and simplify.
5. **Refresh the page (F5)** — the song, lyrics and settings are still there.
6. Open **Practice**: with the audio file re-attached you get *Mode A: Full Audio Practice*; without it *Mode B: Chord Practice* (metronome, chords, mic tracking) with a **Re-attach audio file** button.
7. Stop the backend and press Analyze: you get a clear "Can't reach the Wilsify server" message with **Retry**.

---

## 7. Run all tests

```powershell
# Windows PowerShell — from the repository root
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
cd ..\frontend
npm install
npm test
npm run typecheck
npm run lint
npm run build
```
```bash
# macOS / Linux — from the repository root
cd backend
source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
cd ../frontend
npm install
npm test
npm run typecheck
npm run lint
npm run build
```
Without activating the venv on Windows: `.\backend\venv\Scripts\python.exe -m pytest -q`.

| Suite | What it covers |
|---|---|
| Backend `pytest` (146 tests) | Health, request IDs, structured errors, upload and YouTube validation, SSRF/timeouts, analysis stream success / failure / cancel, rate limiting, exports. Fully offline — no YouTube, DNS or Supabase. |
| Frontend `npm test` (415 tests, Vitest + jsdom + Testing Library) | Route guard, upload → analysis → Library, refresh persistence, lyrics/transpose/capo/simplify, Practice modes and cleanup, error and "Coming soon" screens. Supabase, the backend and audio hardware are faked. |

See [`docs/verification/TEST_COVERAGE.md`](./docs/verification/TEST_COVERAGE.md) for the per-flow list and [`docs/verification/FINAL_VERIFICATION_REPORT.md`](./docs/verification/FINAL_VERIFICATION_REPORT.md) for the last verification run (current status: **NOT READY** until the Windows browser loop and Windows command verification are complete).

Tests never need your `.env` values and never touch your Supabase project.

---

## 8. Production build & deployment checklist

```powershell
cd frontend; npm run build      # Windows (use ; or run on two lines)
```
```bash
cd frontend && npm run build    # macOS / Linux  → static files in frontend/dist/
```

**Checklist**
- [ ] Supabase: `0001_user_data.sql` applied; `select count(*) from public.user_data;` works.
- [ ] Supabase Auth: Email provider on; **Site URL** and **Redirect URLs** set to the production frontend URL; (optional) Google provider configured.
- [ ] No `service_role`/secret key in any frontend file, `.env.example`, or Git history.
- [ ] Backend host: Linux with Python 3.10+ and system **ffmpeg**; `pip install -r requirements.txt`.
- [ ] Backend env: `SUPABASE_URL`, `FRONTEND_ORIGIN=https://<your-frontend>` (exact origin, no trailing slash), `ANALYZE_RATE_LIMIT_PER_MINUTE`, optional `GEMINI_API_KEY`.
- [ ] Backend runs without reload: `uvicorn main:app --host 0.0.0.0 --port 8000` behind HTTPS (reverse proxy / platform TLS). Allow request bodies of at least 100 MB and read timeouts of at least 3 minutes (analysis streams).
- [ ] `GET https://<backend>/api/health` returns `status: ok`.
- [ ] Frontend env set **before** build: `VITE_API_URL=https://<backend>`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Serve `frontend/dist/` as a single-page app with a fallback to `index.html` (so `/library`, `/song/…` work on refresh).
- [ ] Browser check on the live URL: sign up → upload → analyze → Library → refresh → practice; DevTools shows no CORS errors.
- [ ] Tests green (section 7) on the commit being deployed.
- [ ] Backend log retention enabled (request IDs, analysis status, failure reasons are logged).
- [ ] Note: the rate limiter and rights-attestation log are per-process; run one backend instance, or move them to shared storage first.


### 8.1 Smoke test on the deployed environment
- [ ] Frontend loads without console errors.
- [ ] Upload a standard MP3 → analysis completes; key, BPM and chords are shown.
- [ ] YouTube URL import completes (if you expose it; it depends on YouTube availability).
- [ ] Concurrent analyses behave acceptably under a simulated load test (not yet performed — see the verification report).

### 8.2 Rollback
| Component | Rollback |
|---|---|
| Backend | Revert the commit and redeploy on the host. |
| Frontend | Redeploy the previous successful build from the hosting dashboard. |
| Database | `0001_user_data.sql` is idempotent and additive; no down-migration is provided. Export `public.user_data` before changing it. |

### 8.3 Security & operations notes
Carried over from the archived legacy security guide, limited to items that apply to this stack:
- Serve everything over HTTPS; never commit `.env` files or any `service_role`/secret key.
- Set `FRONTEND_ORIGIN` to the exact production origin(s) only (CORS allow-list). The per-IP rate limit is `ANALYZE_RATE_LIMIT_PER_MINUTE`.
- Uploads are limited to 100 MB; YouTube imports to 20 minutes / 100 MB. Error responses return structured `{"detail": …}` bodies without internals (covered by `backend/tests/test_api.py`); stack traces stay in server logs.
- Keep dependencies current: run `npm audit` (in `frontend/`) and `pip-audit` (backend) regularly.
- Never log tokens or passwords when adding log statements.
- Watch for unexpected 5xx spikes in the backend log; every response carries an `X-Request-ID` that is also in the structured log.

### 8.4 Backups (recommendation — not implemented or verified by this repo)
The only server-side data is `public.user_data` in Supabase (raw audio is never stored). Before applying or changing a migration, and before launch, export that table (Supabase dashboard or `pg_dump`) and test restoring it into a scratch project. Check which automated backups your Supabase plan includes; the repo does not configure any. Restore into a new database, never over live data.

### 8.5 Monitoring (recommendation — nothing is configured by this repo)
- Point an uptime monitor at `GET /api/health` (expects `status: ok`); alert after repeated failures.
- Alert on a rising 5xx rate and on analyses taking unusually long (the stream sends a heartbeat every 10 s).
- No error-tracking service (e.g. Sentry) is wired into the MVP; add one deliberately if you need it.

### 8.6 Release sign-off
Engineering sign-off: ☐ ______ Date: ______ — valid only when every checklist item above is ticked and the verification report is no longer **NOT READY**.

---
---

## 9. Known limitations & postponed features

**By design**
- Raw audio is never stored. After a refresh or on another device the chords, lyrics, key/BPM and settings remain; playback needs the file re-attached (one click in Practice or Song).
- Chord vocabulary is major, minor, dominant 7th, minor 7th and no-chord.
- YouTube import depends on YouTube's availability (max 20 minutes / 100 MB). Local upload always works.

**Postponed (not in the MVP)**
- **Paid plans / billing** — `/settings/plans` shows "Coming soon"; no payment code exists.
- **Community feed & leaderboard** — `/community` shows "Coming soon".
- **Server-side stem separation** — the Stem Splitter UI has no real backend (`/api/stems/*` is not implemented); treat it as a preview.
- **Relational song-sheet tables** (`0002_song_sheet.sql`) — not used by the app; songs sync as JSON in `public.user_data`.
- Native mobile app, offline audio caching, team/shared libraries.

**Technical**
- In-memory rate limit and attestation log (single backend instance).
- Production JS bundle is ~1.1 MB (320 KB gzip); code-splitting is a later optimisation.
- `npm audit` reports 1 high-severity issue in a **dev-only** transitive package (`source-map-js`); production dependencies report 0.
- Automated tests do not use a real browser, real Supabase, or real audio output; do the manual check in section 6 before a release.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| "Supabase Setup Required" screen | `frontend/.env` is missing/placeholder. Fill the three `VITE_*` values and restart `npm run dev`. |
| `ffmpeg` not found / "Could not extract audio" | Install ffmpeg, reopen the terminal, or set `FFMPEG_PATH`. Restart the backend. |
| Browser console shows a CORS error | Add the exact frontend origin to `FRONTEND_ORIGIN` in `backend/.env`; restart the backend. |
| "Can't reach the Wilsify server" | Backend not running, or `VITE_API_URL` wrong (rebuild after changing it). |
| AI tutor says to sign in / returns 401 | Backend `SUPABASE_URL` is missing or differs from the frontend's project. |
| "Cloud Sync Unavailable" banner | Migration 0001 not applied, or Supabase unreachable. Data is still saved in the browser; the banner is dismissible. |
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again. |
| Port 8000 / 5173 busy | Stop the other process or use `--port 8001` and update `VITE_API_URL`. |
| First backend start is slow | Normal — one-time warm-up. |
