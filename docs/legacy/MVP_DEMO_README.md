# Wilsify AI — MVP Demo Build

> This document covers the **lightweight MVP demo** added on top of the main
> Wilsify AI project — the public, no-login flow: Home → Upload → Analyze →
> Results → Practice → AI Assistant. For the full production system (auth,
> billing, real ML analysis pipeline, mobile app, etc.), see the main
> [README.md](./README.md).

## What this is

A self-contained demo build suitable for a live walkthrough (e.g. a college
project demonstration) that requires **no database, no Redis, and no external
API keys**. It reuses the real Wilsify AI web frontend (`web-app/`, Next.js
14) and its existing design system, backed by a new minimal Express server
(`mvp-server/`) that has no dependency on the full production backend.

## Features

| Feature | Status |
|---|---|
| Landing page (logo, tagline, feature cards, nav) | ✅ Fully working |
| Upload song (file picker, name/size display, validation) | ✅ Fully working |
| "Use Sample Track" (no file needed — generates a short original audio clip in-browser) | ✅ Fully working |
| Music analysis dashboard (key, tempo, time signature, duration, chords) | ⚠️ **Demo data** — see note below |
| Practice Mode (play/pause, seek, 0.5x/0.75x/1x speed, loop, metronome) | ✅ Fully working (real audio playback + real Web Audio metronome) |
| Wilsify AI Assistant (chat UI, answers music-theory questions) | ⚠️ **Rule-based demo**, not a real AI model — see note below |

### On the "demo" labels

- **Analysis results are sample data**, not real chord/key/BPM detection.
  Wilsify AI's real analysis pipeline (librosa, basic-pitch, Demucs) lives in
  `ai-service/` and requires a Postgres + Redis + Python ML stack that this
  MVP intentionally does not run. The analysis dashboard clearly displays a
  "This is a demo analysis using sample data" notice.
- **The AI Assistant is a genuine rule-based engine**, not a large language
  model — it pattern-matches a fixed set of music-theory questions (chords,
  scales, BPM, time signatures, the C-G-Am-F progression). It's a real,
  working piece of software; it's just not an LLM.
- Both are structured so a real backend (the existing `ai-service/`, or any
  LLM API) can be substituted later without changing the frontend contract —
  see the comments at the top of `mvp-server/src/services/analysisService.js`
  and `mvp-server/src/services/assistantService.js`.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (existing `web-app/`), React 18, Tailwind CSS — new routes added under a public `(mvp)` route group |
| Demo backend | Node.js + Express (new `mvp-server/`) — in-memory only, no database |
| File upload | Multer (memory storage — files are never written to disk) |
| Audio in Practice Mode | Native HTML5 `<audio>` + Web Audio API (metronome, sample track synthesis) |

Nothing in `backend/`, `ai-service/`, `mobile_app/`, or the auth-gated
`(dashboard)` routes was modified for this MVP, other than one small,
pre-existing bug fix (see "Bug fix" below).

## Local installation & running

You need two terminals (frontend + demo backend). No Postgres, no Redis, no
Docker.

### 1. Demo backend (`mvp-server`)

```bash
cd mvp-server
npm install
cp .env.example .env
npm run dev
```

Runs on **http://localhost:4001**. Check it's alive:

```bash
curl http://localhost:4001/api/mvp/health
```

### 2. Frontend (`web-app`)

```bash
cd web-app
npm install
# .env.local already includes NEXT_PUBLIC_MVP_API_URL=http://localhost:4001
npm run dev
```

Runs on **http://localhost:3000**. Open it in a browser — the MVP flow
starts at the root URL (`/`).

> Note: `web-app`'s production build (`npm run build`) fetches Space Grotesk
> and Inter from Google Fonts at build time. This requires normal internet
> access; it will work on your machine and on Vercel, but will fail in
> network-restricted sandboxes.

## Demo mode — what to click through

1. Open `http://localhost:3000/` — the landing page.
2. Click **Upload Song**.
3. Either select a real audio file, or click **Use Sample Track** (generates
   a short original demo clip in-browser — no file needed, always works).
4. Click **Analyze Song** — watch the uploading/analyzing progress state.
5. Land on the **Analysis Results** page — key, tempo, time signature,
   duration, and chord progression, with the demo-data notice visible.
6. Click **Open Practice Mode** — play/pause, seek, change speed (0.5x /
   0.75x / 1x), toggle loop, start the metronome.
7. Click **AI Assistant** in the nav — ask one of the suggested questions or
   type your own (try "What is a C Major chord?" or "What is BPM?").

## Bug fix made along the way

While verifying `web-app` still produces a full production build, I found a
**pre-existing issue in the original project** (unrelated to this MVP): the
auth-gated `/tuner` page and `useWebTuner.ts` import `@wilsify/shared/tuner`,
but `web-app/package.json` never declared `@wilsify/shared` as a dependency,
and `packages/shared/package.json` had no `exports` map for the `/tuner`
subpath — so `npm run build` failed even before any of my changes. Confirmed
by building an untouched copy of the original code first.

Fixed by:
- Adding an `exports` map to `packages/shared/package.json` for `.` and
  `./tuner`.
- Adding `"@wilsify/shared": "file:../packages/shared"` to
  `web-app/package.json`.

This is additive and low-risk — it only fixes module resolution, no logic
changed — and it now lets `web-app` produce a clean, complete production
build (verified: all 19 routes compile, including every existing dashboard
page).

## Deployment

This MVP has two independently deployable pieces:

### Frontend (`web-app`) → Vercel
1. Push this repo to GitHub.
2. Import the repo in Vercel, set the **root directory** to `web-app`.
3. Set the environment variable `NEXT_PUBLIC_MVP_API_URL` to your deployed
   `mvp-server` URL (see below).
4. Deploy — Vercel runs `npm run build` automatically and has normal
   internet access, so the Google Fonts fetch will succeed.
5. Leave the existing `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL`
   variables as-is (or blank) — they're only used by the auth-gated
   dashboard routes, which this MVP doesn't touch.

### Demo backend (`mvp-server`) → Railway, Render, or Fly.io (any free Node host)
1. Push this repo to GitHub (or deploy `mvp-server/` as its own repo).
2. Create a new Node.js web service, root directory `mvp-server`.
3. Build command: `npm install`. Start command: `npm start`.
4. Set environment variables from `mvp-server/.env.example`:
   - `PORT` (most platforms set this automatically — leave unset if so)
   - `WEB_APP_ORIGIN` — set to your deployed Vercel URL, so CORS allows it
5. Deploy, then copy the resulting URL into the frontend's
   `NEXT_PUBLIC_MVP_API_URL`.

No database, queue, or storage service is required for either deployment.
