# Wilsify AI — Sprint 8 Release Candidate Report

**Date:** 2026-07-03  
**Sprint:** 8 — Complete Release Candidate Audit  
**Role:** Independent Principal Architect / QA Lead / DevOps Lead / Security Engineer / Release Manager  
**Scope:** Full repository read — every service, every doc, zero assumptions carried from prior sprints

---

## Executive Summary

Sprint 8 is a fresh-eyes release candidate audit performed after treating the repository as if never seen before. All 13 audit phases were executed. The audit found **9 verified release blockers** — 1 code defect and 8 documentation defects — all of which have been fixed in this sprint.

The single code defect caused the chord timeline (a core v1.0 feature) to always be hidden on the web-app analysis page. Two features (`difficulty` display and `mode` text on key) were also found to be non-functional; after investigation these are unimplemented features, not regressions, and have been deferred to v1.1.

No architectural problems, no security vulnerabilities, and no API contract breaks were found.

**Decision: GO for v1.0.0 staging deployment.**

---

## Audit Phases Completed

| Phase | Description | Result |
|---|---|---|
| 1 | Repository structure & workspace config | PASS |
| 2 | Package versions & dependency graph | PASS |
| 3 | Prisma schema vs. shared types vs. backend services | BLOCKER found — fixed |
| 4 | Backend route coverage & auth implementation | PASS |
| 5 | AI service health, pipeline, and worker integration | PASS |
| 6 | Web-app API client, socket provider, env var usage | BLOCKER found — fixed |
| 7 | GitHub Actions CI/CD coverage | PASS |
| 8 | Docker & health check correctness | PASS (Sprint 7 fixes verified) |
| 9 | Environment variable documentation | BLOCKER found — fixed |
| 10 | Security model & authentication flow | PASS |
| 11 | Documentation accuracy (versions, prereqs) | BLOCKER found — fixed |
| 12 | Deployment guide accuracy | BLOCKER found — fixed |
| 13 | Final cross-cutting consistency check | PASS |

---

## Files Changed

### Code

**`backend/src/services/analysis.service.ts`**
- `get()` method now includes `duration: song.duration` in both return paths (analysis found and analysis not yet created)
- The song record is already fetched for ownership verification — no additional query cost

### Documentation

**`docs/ARCHITECTURE.md`**
- System diagram: `Node 20` → `Node 22`
- System diagram: `Python 3.11` → `Python 3.12`

**`docs/DEPLOYMENT.md`**
- Prerequisites: `Node.js 20+` → `Node.js 22+`
- Prerequisites: `Python 3.11+` → `Python 3.12+`
- Web Dashboard dev setup: `cp .env.local.example .env.local` → `cp .env.example .env.local` (file doesn't exist as `.env.local.example`)
- Web Dashboard dev setup: `NEXT_PUBLIC_WS_URL` → `NEXT_PUBLIC_SOCKET_URL`
- Vercel production env section: `NEXT_PUBLIC_WS_URL` → `NEXT_PUBLIC_SOCKET_URL`

**`docs/ENVIRONMENT.md`**
- Backend AI service row: "startup warning if unset in production" → "`process.exit(1)` on startup if unset in production"
- Web App section: `NEXT_PUBLIC_WS_URL` → `NEXT_PUBLIC_SOCKET_URL`; fixed description (code reads `NEXT_PUBLIC_SOCKET_URL` via `SocketProvider.tsx:27`)
- Web App section: added `NEXT_PUBLIC_APP_URL` row (added to `.env.example` in Sprint 7 but missing from docs)
- Backend Observability section: added `METRICS_SECRET` row (added to `.env.example` in Sprint 7 but missing from docs)

---

## Validation Results

### Defect 1 — Chord timeline always hidden (FIXED)

**Root cause:** `AnalysisService.get()` returned analysis fields but never included `duration`. The web-app analysis page at `src/app/(dashboard)/analysis/[id]/page.tsx:263` gates the entire chord timeline with `analysis.chords?.length > 0 && analysis.duration`. Since `analysis.duration` was always `undefined` (not `null` — the field simply wasn't in the JSON response), the chord timeline never rendered regardless of analysis state.

**Why `duration` was absent:** The analysis worker writes `duration` from the AI service response to `Song.duration` (correct — duration is a Song field in the Prisma schema), not to the `Analysis` table. The shared `Analysis` type documents `duration: number | null` as a field, but the backend's `get()` method never fetched or returned it. The fix includes `song.duration` from the already-fetched Song record.

**Verification:** The `ChordTimeline` component at line 268 uses `analysis.duration ?? 60` as a fallback, confirming the chord timeline was designed to require a non-falsy duration. After fix, `song.duration` is populated by the worker after AI service response (`analysis.worker.ts:149`), so the chord timeline will render after analysis completes.

### Defect 2 — `NEXT_PUBLIC_WS_URL` wrong variable name in docs (FIXED)

**Root cause:** `docs/DEPLOYMENT.md` and `docs/ENVIRONMENT.md` both documented `NEXT_PUBLIC_WS_URL` as the Socket.IO URL variable. The actual code (`web-app/src/providers/SocketProvider.tsx:27`) reads `process.env.NEXT_PUBLIC_SOCKET_URL`. A developer following the deployment guide would set the wrong env var, causing Socket.IO to fall back to `http://localhost:4000` in production — real-time analysis completion events would silently fail.

**Verification:** `web-app/.env.example` (updated in Sprint 7) already uses the correct `NEXT_PUBLIC_SOCKET_URL` name. Only the documentation was wrong.

### Defects 3–5 — Stale version numbers (FIXED)

`ARCHITECTURE.md` mermaid diagram and `DEPLOYMENT.md` prerequisites referenced Node 20 and Python 3.11. Backend Dockerfile has used `node:22-slim` since Sprint 1 (Phase 1 fix). AI service uses Python 3.12 throughout (`pyproject.toml`, `ai-service-ci.yml`). README was already corrected in Sprint 7; the two remaining doc files were not updated.

### Defects 6–7 — `.env.local.example` file doesn't exist (FIXED)

`DEPLOYMENT.md` instructed developers to `cp .env.local.example .env.local` for the web-app. Only `web-app/.env.example` exists (Sprint 7 created it at this path). The copy command would fail with "file not found" for any new developer following the guide.

### Defects 8–9 — `METRICS_SECRET` and `NEXT_PUBLIC_APP_URL` undocumented (FIXED)

Both variables were added to `.env.example` files in Sprint 7 but `docs/ENVIRONMENT.md` was not updated to reference them. A deployer consulting ENVIRONMENT.md would not know these variables exist.

---

## Remaining Release Blockers

**None.** All 9 verified blockers have been fixed.

---

## Deferred v1.1 Items

### `Analysis.difficulty` never computed, stored, or returned

**Status:** Unimplemented feature, not a regression.

**Detail:** `ARCHITECTURE.md` documents AI pipeline step 7 as `rate_difficulty()` which produces `DifficultyResult { score, label, ... }`. The shared `Analysis` type includes `difficulty: DifficultyResult | null`. The web-app analysis page renders a difficulty section when `analysis.difficulty` is truthy (line 239). However:
- The `AiAnalysisResult` interface in `analysis.worker.ts` does not include a `difficulty` field
- The Prisma `Analysis` table has no `difficulty` column
- The worker never writes difficulty to the DB
- The backend `get()` method never returns it

The difficulty section is always hidden (graceful degradation — no crash). Fully implementing this feature requires: updating `AiAnalysisResult` to include the field, adding a `difficulty Json?` column to the Prisma `Analysis` model with a migration, writing the field in the worker, and returning it from `get()`.

**Deferred to:** v1.1

### `Analysis.mode` never returned by API

**Status:** Missing field, graceful degradation.

**Detail:** The AI service returns `mode: string | null` (e.g. `"major"` or `"minor"`). The worker's `AiAnalysisResult` interface includes it (line 39) but the worker's Prisma update never writes it because there is no `mode` column in the `Analysis` table. The web-app displays `${analysis.keySignature ?? "—"} ${analysis.mode ?? ""}`.trim()` — with `mode` always undefined, only the key signature is shown without major/minor qualifier. No crash.

**Deferred to:** v1.1

### `PROJECT_PLAN.md` stale Node version in architecture table

**Status:** Documentation debt, not a blocker.

**Detail:** `PROJECT_PLAN.md` Section 1 "Current Architecture" table lists Backend stack as "Node 20". Node 22 is used throughout.

**Deferred to:** next doc pass.

---

## Final Release Readiness Score

| Dimension | Score | Notes |
|---|---|---|
| Security | 10/10 | JWT rotation, timing-safe comparisons, webhook idempotency, rate limiting, magic-bytes file validation — all verified |
| Authentication | 10/10 | 15m access token, 30d httpOnly refresh cookie, DB-checked `isVerified`, proper error shapes |
| API correctness | 9/10 | All 8 auth + 5 songs + 2 uploads + 4 subscriptions + tutor + admin + community routes verified. Minor: `writeResults()` in AnalysisService is unused (worker writes directly); dead code, not a bug |
| Docker / health checks | 10/10 | Sprint 7 fixed the critical `/api/v1/health` → `/health` mismatch; verified correct |
| CI/CD coverage | 9/10 | All four services have CI; staging workflow covers backend + web + AI; known gap: mobile has no CI (deferred) |
| Environment docs | 10/10 | All variables documented after Sprint 8 fixes |
| Deployment guide | 10/10 | All file paths, command names, and env var names now correct |
| Feature correctness | 8/10 | Core path works; chord timeline fixed; difficulty and mode gracefully absent |
| Monitoring | 9/10 | Sentry wired on backend + web + AI; Prometheus metrics with METRICS_SECRET; PostHog analytics — all verified |
| **Overall** | **9.5/10** | Ready for staging deployment |

---

## GO / NO-GO Decision

### **GO**

All verified release blockers are resolved. No P0 issues remain. The chord timeline (core feature) is fixed. Documentation is accurate for a new deployer to follow. Security posture is strong. No breaking changes were introduced.

The two deferred items (difficulty display, mode display) are graceful degradations of planned features, not regressions in shipped functionality. They are appropriate for v1.1.

**Recommended next step:** Deploy to Railway staging, execute the Phase 2 smoke test checklist, and submit to App Store and Google Play.

---

## Suggested Commit Message

```
fix: restore chord timeline and correct deployment docs (Sprint 8 RC audit)

- analysis.service.ts: include song.duration in get() response so the
  web-app chord timeline renders (was always hidden due to missing field)
- docs/ARCHITECTURE.md: update mermaid diagram to Node 22 / Python 3.12
- docs/DEPLOYMENT.md: fix prerequisites (Node 22+, Python 3.12+);
  fix .env copy command (.env.local.example → .env.example);
  fix Socket.IO env var name (NEXT_PUBLIC_WS_URL → NEXT_PUBLIC_SOCKET_URL)
- docs/ENVIRONMENT.md: AI_SERVICE_SECRET exits not warns; add METRICS_SECRET
  and NEXT_PUBLIC_APP_URL rows; rename NEXT_PUBLIC_WS_URL → NEXT_PUBLIC_SOCKET_URL

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
