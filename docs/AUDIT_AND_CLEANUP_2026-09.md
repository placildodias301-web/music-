# Wilsify AI MVP — Audit, Test & Cleanup Report

Date: 14 September 2026

## Scope

The delivered archive contained the full Wilsify monorepo, not the standalone
MVP described in `README.md`. This pass reduced it to the MVP the docs
actually describe, audited and fixed that MVP, and verified it end to end.

Result: **1.3 GB / ~48,000 files → 1.4 MB / 126 files.**

## Verified

| Check | Result |
|---|---|
| `tsc -b` (frontend) | PASS — 0 errors |
| `vite build` | PASS — 312 kB JS / 94 kB gzip |
| `oxlint` | PASS — 0 errors, 10 warnings (was 11) |
| `pytest` (backend) | PASS — 13/13 |
| Live endpoint smoke test | PASS — all 6 endpoints |
| Analysis accuracy spot-check | C-major tone → `C Major`; G-major tone → `G Major`; `.mp4` video → audio track analysed |
| CORS preflight from `:5173` | PASS |

Not tested in this environment: real browser rendering, microphone-dependent
Practice Mode accuracy tracking, Web Audio stem separation, and responsive
layout at real breakpoints. These need a browser.

## Fixes applied

### Security
- `/api/analyze` no longer returns raw ffmpeg stderr to the client (it was
  leaking build flags and filesystem paths). Logged server-side instead.
- Generic 500 handler no longer interpolates the exception into the response.
- Added per-IP rate limiting on `/api/analyze` (60/min, `ANALYZE_RATE_LIMIT_PER_MINUTE=0` disables).
- Added length/range caps to the MIDI, PDF, assistant and attestation payloads.

### Correctness / portability
- `TMP_DIR` now uses `tempfile.gettempdir()` instead of a hardcoded `/tmp`,
  so the backend behaves correctly on Windows.
- `@app.on_event("startup")` → `lifespan` (deprecated in FastAPI 0.141).
- Sidebar Library badge now updates (was read impurely during render and went stale).

### Accessibility
- Added a global `:focus-visible` ring — previously nothing in the app showed
  keyboard focus, and three inputs actively removed it.
- Added accessible names to 6 previously placeholder-only or unnamed inputs,
  including the Practice Mode seek slider.
- Account page "Improve AI with my audio" row: a `<label>` wrapping a
  `<button role="switch">` did nothing on click; the row is now the switch.
- Added `prefers-reduced-motion` support.
- Save confirmation is now an `aria-live` region.

### UX
- Library "Remove" now confirms before deleting (destructive, no undo).

### Design
- Palette and typography aligned to the Figma import board: Plus Jakarta Sans
  + JetBrains Mono, `#111729` cards, `#1F2740` borders, `#F2F4FB` / `#C3C9DC` /
  `#98A0BA` text scale, `#BFACFF` accent, 18px card radius.
- **Deliberate deviation:** the board's `#6E7591` dim text only reaches 3.9:1
  on the card background (WCAG AA needs 4.5:1) and is used at 11–12px. Raised
  to `#8B93AD` (5.8:1), same hue family.

### Code quality
- Removed dead `detect_chords()` (`analysis_engine.py`).
- Removed unused `is_minor_or_seventh` (`difficulty.py`).
- Removed unused `email` field from `AccountPrefs`.
- Removed render-phase mutation in `PianoRoll`.
- Added `backend/tests/` (13 tests) — the MVP previously had none.

## Removed, and why

| Removed | Reason |
|---|---|
| `web-app/` (582 MB) | Legacy Next.js app; not referenced by the MVP |
| `backend/venv/` (443 MB) | Committed Windows virtualenv — a build artifact |
| `web-app/node_modules`, `frontend/node_modules`, `mvp-server/node_modules` | Installable from lockfiles |
| `web-app/.next/`, `frontend/dist/` | Build output |
| `**/__pycache__`, `*.pyc` | Bytecode cache |
| `ai-service/`, `mobile_app/`, `mvp-server/`, `packages/`, `web/` | Legacy monorepo services |
| `backend/src/`, `backend/prisma/`, `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/eslint.config.js`, `backend/scripts/`, `backend/railway.json` | Legacy Fastify/Prisma backend sharing the MVP's folder |
| root `package.json`, `package-lock.json`, `setup.sh` | npm workspace config for removed folders; `setup.sh` installed `web-app`/`mobile_app` |
| `mvp-server/src/{routes,services,data}/` | Literal directory created by an unexpanded shell brace |
| `.claude/` | Empty |

Kept deliberately: all of `docs/` (including `VIVA_PREPARATION.md` and
`COLLEGE_SUBMISSION_PACKAGE.md`), both lockfiles in use, `.gitignore`,
`.env.example` templates, and `.env` files (they contain no secrets — only
`FRONTEND_ORIGIN` and `VITE_API_URL`). `MVP_DEMO_README.md` was relocated to
`docs/legacy/` rather than deleted: it describes the older in-`web-app` demo.

## Remaining issues

### Must fix (outside this repo)
- `ai-service/.env` in the original archive contains live-looking credentials
  (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `AI_SERVICE_SECRET`, Celery
  broker URL). Rotate them and confirm the file was never committed.

### Should fix
- `docs/` still largely describes the legacy monorepo (Prisma schema, Redis,
  BullMQ, Expo, sprint reports). Stale relative to this MVP.
- Time-signature detection is unreliable on sustained tones — a 6-second
  steady C-major chord reports 3/4. Documented as a heuristic, but worth a caveat in the UI.
- 3 of the 6 Tools cards ("Guitar Tabs & Sheet", "MIDI & Stem Export",
  "AI Chord Detection") all navigate to `/upload`; the Tools nav badge is hardcoded to `6`.
- No frontend tests at all.

### Nice to have
- 10 remaining oxlint warnings are the `localStorage`-read-on-mount pattern
  (legitimate for client-only storage) plus one fast-refresh warning in `MvpContext`.
- Chat message IDs use `Date.now()` and could collide on rapid sends.
- Analysis page renders every unique chord diagram eagerly; fine at current
  sizes, worth virtualising if progressions grow.
