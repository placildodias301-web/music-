# Wilsify AI — Project Plan

**Document type:** Master Execution Guide  
**Version:** 1.0 — June 2026  
**Status:** Active  
**Audience:** Solo developer today; expandable to a team without restructuring

> This document is the single source of execution truth. It governs what gets built, in what order, and how to know when it is done. `PRODUCT.md` answers *what* to build. `ARCHITECTURE.md` answers *how* it is built. This document answers *when*, *in what sequence*, and *under what rules*.

---

## 1. Project Status

### Current Architecture

Four independently deployable services, all production-ready:

| Service | Stack | Status |
|---|---|---|
| Backend API | Fastify 5, Node 22, TypeScript, Prisma + PostgreSQL | Complete — v1.0.0 |
| AI Service | FastAPI, Python 3.12, Celery, librosa, Demucs, basic-pitch | Complete — v1.0.0 |
| Web Dashboard | Next.js 14, App Router, Tailwind, React Query, Zustand | Complete — v1.0.0 |
| Mobile App | Expo SDK 54, React Native, expo-router | Complete — v1.0.0 |

Infrastructure: Cloudflare R2 (storage), Redis 7 (queue + counters), PostgreSQL 16, Resend (email), Railway (hosting), GitHub Pages (landing).

### Current Documentation

| Document | Status |
|---|---|
| PRODUCT.md | Complete |
| ARCHITECTURE.md | Complete |
| DATABASE.md | Complete |
| SECURITY.md | Complete |
| ENVIRONMENT.md | Complete |
| DEPLOYMENT.md | Complete |
| TESTING.md | Complete |
| VERSIONS.md §0 (Phase History) | Current through v1.0.0 — supersedes the former standalone ROADMAP.md |
| CHANGELOG.md | Current through v1.0.0 |
| PROJECT_PLAN.md | This document |

### Current Repository State

The repository completed a full standardization audit in June 2026. Key findings:

- **Broken workspace reference:** Root `package.json` declares `mobile-rn` but the folder is `mobile_app/`. All mobile workspace scripts silently fail.
- **Missing code quality tooling:** No ESLint in backend or mobile. No Prettier or EditorConfig anywhere in the repository.
- **Node version inconsistency:** Backend Dockerfile uses Node 20; web-app Dockerfile uses Node 22.
- **Committed generated artifacts:** `backend/coverage/` and `web-app/tsconfig.tsbuildinfo` are tracked in git.
- **Empty placeholder folder:** `mobile-flutter/` at root is completely empty.
- **Mobile structural fragmentation:** 20+ empty placeholder directories across `mobile_app/components/` and `mobile_app/src/`.
- **Type duplication:** Web-app defines its own `User`, `Plan`, `Analysis` types locally instead of importing from `@wilsify/shared`.
- **Infrastructure client misplacement:** `backend/src/services/redis.ts` and `ai-service/services/r2.py` are infrastructure clients placed in the business-logic `services/` folder.

Full findings: `docs/audits/REPO_AUDIT_2026_06.md`.

### Current Health

| Dimension | Score |
|---|---|
| Architecture | Strong — clean service boundaries, well-structured internals |
| Security | Strong — 15 critical issues resolved in Phase 6.1 + v0.8.0 hardening |
| Test coverage | Moderate — backend has 56 tests; web-app and mobile have none |
| Repository consistency | Weak — workspace broken, no formatter, naming inconsistencies |
| Production readiness | High — Dockerfiles production-grade, health checks, non-root users |
| Documentation | Strong — comprehensive and current |

### Current Risks

- No staging environment: every merge to `main` goes directly to production.
- No E2E test suite: a broken user flow may only be caught manually.
- Mobile workspace disconnected: `mobile_app` is not a proper npm workspace member; `@wilsify/shared` types are not used.
- No formatting enforcer: code style will diverge as development continues.

### Current Strengths

- All core product features are implemented and production-ready.
- Authentication, billing (4 providers), analysis pipeline, AI Tutor, community, admin, and notifications all work end-to-end.
- Security posture is solid: timing-safe comparisons, webhook idempotency, JWT rotation, email verification, rate limiting.
- AI pipeline is comprehensive: BPM, key, scale, chords, MIDI, sheet music, stems, real-time detection.
- Documentation is thorough and current.

### Current Technical Debt

See Section 8 for the full register.

---

## 2. Guiding Principles

These principles override personal preference and convenience. When in doubt, return to this list.

1. **Never rewrite when an incremental improvement works.** The codebase is functional. Small, targeted improvements over large rewrites.
2. **One completed phase is better than five incomplete ones.** Finish before starting.
3. **Maintain backwards compatibility.** Mobile app users cannot be force-updated. API clients depend on stable contracts. No breaking changes without a deprecation window.
4. **Every change must be testable.** If a change cannot be verified by a test or a clear manual procedure, the change is not complete.
5. **Every architectural decision must have a documented reason.** No unexplained structural choices. If the reason is not obvious from the code, it belongs in `ARCHITECTURE.md` or `docs/decisions/`.
6. **Keep modules independent.** Business logic in one service must not directly call business logic in another. Cross-service communication goes through defined boundaries (HTTP, BullMQ, sockets).
7. **Documentation follows implementation, never precedes it.** Do not document planned features as if they exist.
8. **Prefer consistency over cleverness.** A pattern that can be followed by a new contributor beats an elegant solution only the original author understands.
9. **Production is never broken for the sake of cleanup.** Repository hygiene changes are applied carefully, in isolation, and tested before merge.
10. **The FREE tier must remain generous enough to demonstrate real value.** Never reduce free tier limits to drive conversions at the expense of user trust.

---

## 3. Master Roadmap

Phases are sequential. No phase begins until its predecessor is complete by the definition in Section 11.

### Phase 1 — Repository Standardization
**Purpose:** Fix repository-level issues identified in the June 2026 audit so that all future development starts from a consistent, correct foundation.  
**Goals:** Broken workspace reference fixed. Formatter enforced. Node version aligned. Generated artifacts untracked. Empty dead folder removed.  
**Expected Outcome:** `npm run dev:mobile`, `npm run type-check`, and all workspace scripts work. A new contributor can clone and run the project without discovering broken tooling.  
**Dependencies:** None — no product code changes.  
**Estimated Risk:** Low. All changes are structural or config-only; no business logic is touched.  
**Completion Criteria:** All workspace scripts execute correctly. Prettier formats the codebase. Node 22 used consistently. `git status` is clean of generated artifacts.

### Phase 2 — Pre-Launch Validation
**Purpose:** Establish a staging environment and manual QA process before the public launch button is pressed.  
**Goals:** Staging Railway environment configured. Manual E2E smoke test checklist executed against staging. App Store and Google Play submissions prepared.  
**Expected Outcome:** Confidence that the production deployment is stable. App review submitted to both stores.  
**Dependencies:** Phase 1 complete (clean repository before first public attention).  
**Estimated Risk:** Medium. App Store review can introduce delay outside engineering control.  
**Completion Criteria:** Staging environment passes the full smoke test checklist. Both app submissions are in review or approved.

### Phase 3 — Public Launch
**Purpose:** Open the product to the public. Monitor. Respond.  
**Goals:** DNS and production environment confirmed. Monitoring alerts active. Launch communications sent. First 500 users onboarded.  
**Expected Outcome:** Product is live, stable, and being used. Real error and performance data flowing into Sentry and PostHog.  
**Dependencies:** Phase 2 complete. App Store approval received.  
**Estimated Risk:** Medium. Real traffic surfaces issues not caught in testing.  
**Completion Criteria:** 500 registered users. No P0 incidents in the first 72 hours. Sentry error rate below 0.5% of requests.

### Phase 4 — Testing Foundation
**Purpose:** Build a test safety net that enables confident future development. The current test coverage gap (no web-app tests, no mobile tests, no E2E tests) creates invisible risk as features are added.  
**Goals:** Web-app unit test coverage above 60%. Playwright E2E suite covering the critical user path (register → upload → analysis → tutor → billing). Backend coverage thresholds raised from 30% to 60%.  
**Expected Outcome:** Every commit runs a test suite that catches regressions before they reach production.  
**Dependencies:** Phase 3 complete (real production flows to test against).  
**Estimated Risk:** Low. Tests do not change product behaviour.  
**Completion Criteria:** CI passes on every `main` branch push. Web-app coverage ≥60%. E2E suite covers: registration, login, song upload, analysis completion (mocked AI), AI tutor, plan upgrade.

### Phase 5 — Shared Package & Type Consistency
**Purpose:** Eliminate the type divergence between `@wilsify/shared`, `web-app`, and `mobile_app`. Establish the shared package as the single source of truth for all domain types.  
**Goals:** `web-app/src/lib/types/` removed; web-app imports from `@wilsify/shared`. Mobile workspace properly connected. `@wilsify/shared` has a `tsconfig.json` and `build` script.  
**Expected Outcome:** A type change in `shared/` propagates to all packages and is caught at compile time.  
**Dependencies:** Phase 1 complete (workspace reference fixed first).  
**Estimated Risk:** Medium. Requires careful reconciliation of extended web-app types with canonical shared types.  
**Completion Criteria:** `npm run type-check` at root passes for all packages. No local `Plan`, `User`, or `JobStatus` type re-definitions outside `shared/`.

### Phase 6 — Engagement Features
**Purpose:** Deliver the product features from PRODUCT.md Phase 2 that bring users back daily and deepen the product's value.  
**Goals:** Practice mode (section looping, tempo control). Song sharing (public/unlisted links). Song Insights (AI-generated commentary). Practice Recommendations (AI-generated, per-song). Full mobile performance parity with web.  
**Expected Outcome:** D7 and D30 retention metrics improve. AI Tutor usage increases as Song Insights drives engagement.  
**Dependencies:** Phase 3 complete (real users to validate against).  
**Estimated Risk:** Medium. AI-generated features (Insights, Recommendations) require prompt engineering and quality validation.  
**Completion Criteria:** All features from PRODUCT.md Phase 2 are live on both web and mobile. Feature parity verified.

### Phase 7 — Performance & Scale
**Purpose:** Address performance issues that emerge under real load, and prepare the infrastructure for the next order of magnitude of users.  
**Goals:** Composite database indexes in place. Analysis queue observability. Response caching for read-heavy endpoints (song list, stats). GPU inference exploration for Demucs stem separation.  
**Expected Outcome:** API P95 latency below 150 ms. Analysis P95 below 90 seconds at 10× current load.  
**Dependencies:** Phase 3 (real load data needed to prioritise correctly).  
**Estimated Risk:** Low for indexing; Medium for GPU inference (introduces Modal.com dependency).  
**Completion Criteria:** P95 latency targets met under simulated 10× load. Stem separation time below 60 seconds on GPU path.

### Phase 8 — Growth
**Purpose:** Deliver the features from PRODUCT.md Phase 3 that drive organic growth through social proof and developer adoption.  
**Goals:** Community trending feed. Collaborative song annotations. Advanced admin analytics. Developer API (ENTERPRISE tier, rate-limited, documented with OpenAPI).  
**Expected Outcome:** Organic acquisition from shared song links. First developer API customers.  
**Dependencies:** Phase 6 complete (community features must be stable before expanding them).  
**Estimated Risk:** Medium. Public API introduces a versioning commitment that cannot easily be unwound.  
**Completion Criteria:** Developer API live and documented. At least one third-party integration. Community trending feed active.

### Phase 9 — Platform
**Purpose:** Evolve from an application into a platform — desktop app, browser extension, team accounts.  
**Goals:** Electron desktop app (Mac + Windows). Chrome/Firefox YouTube chord overlay extension. Team accounts (music schools, bands). Plugin marketplace foundation.  
**Expected Outcome:** New acquisition channels. Enterprise and education customers.  
**Dependencies:** Phase 8 complete. API is stable and versioned.  
**Estimated Risk:** High. Desktop and browser extension are new deployment surfaces with their own review and distribution challenges.  
**Completion Criteria:** Desktop app published on Mac App Store and Windows. Browser extension live on Chrome Web Store. First enterprise team account active.

---

## 4. Phase Checklist

### Phase 1 — Repository Standardization

**Status:** In Progress | **Priority:** Critical | **Effort:** 1 day | **Risk:** Low

- [x] Fix `package.json` workspace: change `"mobile-rn"` to `"mobile_app"`
- [x] Fix `dev:mobile` script: `--workspace=mobile-rn` → `--workspace=mobile_app`
- [x] Fix `type-check` script: same rename
- [x] Add missing root scripts: `dev:web`, `build:web`, `test:backend`, `test:web` — added 2026-06-30; updated 2026-06-30 to use `--workspace=web-app` after workspace inclusion
- [x] Delete `mobile-flutter/` empty folder — removed 2026-06-30
- [x] Add `.prettierrc` at repository root — created 2026-06-30
- [x] Add `.editorconfig` at repository root — created 2026-06-30
- [x] Add root `.nvmrc` pinned to Node 22 — created 2026-06-30; also bumped root `engines.node` to `>=22.0.0`
- [x] Remove `backend/coverage/` from git tracking — already clean; root `.gitignore` covers `coverage/`
- [x] Add `coverage/` to `backend/.gitignore` if not already present — already present
- [x] Add `tsconfig.tsbuildinfo` to `web-app/.gitignore` — already present (`*.tsbuildinfo`)
- [x] Untrack `ai-service/__pycache__/` root entry from git — already clean; root `.gitignore` covers `__pycache__/`
- [x] Resolve `mobile_app/constants/api.ts` vs `config/api.ts` duplicate — no duplicate exists; only `config/api.ts` present
- [ ] Run initial Prettier format pass (one isolated commit) — 193 files need formatting; requires dedicated commit
- [x] Update `backend/Dockerfile` from `node:20-slim` to `node:22-slim` — done 2026-06-30; also bumped `backend/package.json` and `mobile_app/package.json` engines.node from `>=20.0.0` to `>=22.0.0`
- [ ] Move `backend/src/services/redis.ts` → `backend/src/plugins/redis.ts` (update all imports)
- [ ] Move BullMQ worker in `scheduler.service.ts` to `backend/src/workers/scheduler.worker.ts`
- [x] Add `.gitkeep` or short README to 18 intentional placeholder folders in mobile — done 2026-06-30; .gitkeep added to all 18 dirs in app/, assets/, components/, and src/
- [x] Add ESLint to `backend` (`@typescript-eslint`) with `lint` script — done 2026-06-30; eslint@^9, typescript-eslint@^8, globals@^15; flat config in `backend/eslint.config.js`; 0 errors, 46 warnings (all pre-existing `any` usage + 1 unused `no-unused-vars`)
- [x] Add `lint` script to root `package.json` calling both packages — done 2026-06-30; added `lint:backend`, `lint:web`, and `lint` (web-app lint initially excluded due to `next.config.ts` incompatibility; resolved 2026-06-30 by migrating to `next.config.mjs` and adding `.eslintrc.json`)
- [x] Investigate and resolve pre-existing mobile TypeScript errors — done 2026-07-01 (Sprint 2); root cause was workspace-hoisted `react-native@0.86.0` (via `@expo/vector-icons`) pulling `@types/react@19` to ROOT, conflicting with mobile's React 18 types; fixed via TypeScript `paths` aliases in `mobile_app/tsconfig.json` pinning `react` → `./node_modules/@types/react@18.3.31` and `react-native` → `./node_modules/react-native@0.76.9/types`; 89 TS2786 errors eliminated; `tsc --noEmit` now passes with 0 errors
- [x] Add ESLint to `mobile_app` — done 2026-07-01 (Sprint 2); eslint@^9, typescript-eslint@^8, globals@^15; flat config in `mobile_app/eslint.config.mjs`; added `lint` script to `mobile_app/package.json`; added `lint:mobile` to root `package.json` and included in `lint` aggregate; 0 errors (76 pre-existing warnings)
- [x] Add `web-app` to root npm workspace array — done 2026-06-30; all web scripts updated to `--workspace=web-app`; `web-app/package-lock.json` intentionally retained as Docker-isolated lockfile (Dockerfile uses `COPY package.json package-lock.json* ./; npm ci` in isolation from monorepo root)

- [x] Fix backend rate-limit resilience — done 2026-07-01 (Sprint 3); `skipOnError: true` added to `@fastify/rate-limit` (fail-open when Redis unavailable); removed `errorResponseBuilder` returning plain object (was causing 500 instead of 429); 429 now formatted centrally in `app.ts` error handler; all 67 backend tests pass; build, type-check, lint all clean

**Validation Steps:**
- `npm run dev:mobile` resolves to the correct workspace
- `npm run type-check` runs for both backend and mobile without error
- `npx prettier --check .` returns clean
- `git status` shows no generated artifacts

**Rollback Strategy:** All changes are git-reversible. No behavior is modified.

---

### Phase 2 — Pre-Launch Validation

**Status:** In Progress | **Priority:** Critical | **Effort:** 3–5 days | **Risk:** Medium

**Production readiness hardening completed 2026-07-02 (Sprint 7):**
- [x] Fix backend Dockerfile HEALTHCHECK URL (`/api/v1/health` → `/health`) — critical; Docker containers were always unhealthy
- [x] Add `@sentry/node` to backend `package.json` — was dynamically imported but not installed; Sentry was silently failing
- [x] Harden `AI_SERVICE_SECRET` validation in backend: change warning → `process.exit(1)` in production (consistent with AI service behavior)
- [x] Document `METRICS_SECRET` in `backend/.env.example` — was used in metrics.ts but undocumented
- [x] Complete `web-app/.env.example` — was missing `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SOCKET_URL`
- [x] Add ESLint step to `backend-ci.yml` lint-and-type-check job — CI job was named "Lint & Type Check" but only ran type-check
- [x] Add `shared/**` path trigger to `frontend-ci.yml` — shared type changes no longer skip web CI
- [x] Add `NEXT_PUBLIC_SOCKET_URL` env to `frontend-ci.yml` CI jobs
- [x] Add web-app test step to `staging.yml` webapp-ci job — staging CI ran only type-check, not tests
- [x] Create `.github/workflows/ai-service-ci.yml` — standalone CI running ruff lint + pytest on every push to main/develop touching ai-service/**
- [x] Fix Python version inconsistency: README updated to Python 3.12 (was 3.11); Node version updated to 22+ (was 20+)
- [x] Update `docs/TESTING.md`: add `rate-limit.test.ts` to test file table; correct total count (56 → 67)
- Full audit: `docs/SPRINT7_PRODUCTION_REPORT.md`

**Release candidate audit completed 2026-07-03 (Sprint 8):**
- [x] Fix `AnalysisService.get()` missing `duration` field — chord timeline on web-app analysis page was always hidden; `song.duration` now included in both return paths (no extra DB query — song already fetched for ownership check)
- [x] Fix wrong Socket.IO env var name in docs — `NEXT_PUBLIC_WS_URL` → `NEXT_PUBLIC_SOCKET_URL` in `DEPLOYMENT.md` (dev setup + Vercel section) and `ENVIRONMENT.md` (web-app table); code reads `NEXT_PUBLIC_SOCKET_URL` per `SocketProvider.tsx:27`
- [x] Fix broken web-app `.env` copy command in `DEPLOYMENT.md` — `cp .env.local.example .env.local` → `cp .env.example .env.local` (only `.env.example` exists)
- [x] Fix stale version numbers in `ARCHITECTURE.md` mermaid diagram — `Node 20` → `Node 22`, `Python 3.11` → `Python 3.12`
- [x] Fix stale prerequisites in `DEPLOYMENT.md` — `Node.js 20+` → `Node.js 22+`, `Python 3.11+` → `Python 3.12+`
- [x] Fix stale `AI_SERVICE_SECRET` description in `ENVIRONMENT.md` — "startup warning" → "`process.exit(1)` on startup"
- [x] Add `METRICS_SECRET` row to `ENVIRONMENT.md` backend observability section
- [x] Add `NEXT_PUBLIC_APP_URL` row to `ENVIRONMENT.md` web-app section
- Full audit: `docs/SPRINT8_RELEASE_CANDIDATE_REPORT.md`

**v1.0.0 release validation completed 2026-07-03 (Sprint 9):**
- [x] Read all documentation (README, all docs/) — confirmed accurate post-Sprint 8
- [x] Full validation suite: backend build ✅ type-check ✅ lint 0 errors ✅ tests 67/67 ✅
- [x] Full validation suite: web-app build ✅ type-check ✅ lint 0 errors ✅ tests 131/131 ✅
- [x] Full validation suite: mobile type-check ✅ lint 0 errors ✅
- [x] Full validation suite: AI service ruff 0 errors ✅ pytest 98/98 passed, 2 skipped ✅
- [x] Fix README.md `Node.js 20+` → `Node.js 22+` in tech stack table
- [x] Fix `docs/TESTING.md` web-app section — incorrect claim "no automated tests"; replaced with full table of 131 tests across 13 files
- [x] Create `docs/releases/v1.0.0.md` — full release notes
- [x] Update `docs/CHANGELOG.md` — v1.0.0 entry added
- [x] Update `docs/VERSIONS.md` — Current Stable: v1.0.0; Dashboard updated
- [x] Verify known limitations (difficulty, mode) — confirmed deferred to v1.1; web-app handles gracefully
- Full audit: `docs/SPRINT9_RELEASE_REPORT.md`

- [ ] Provision Railway staging environment (backend + AI service)
- [ ] Configure staging environment variables (separate secrets from production)
- [ ] Confirm `staging.yml` CI workflow deploys to staging on `staging` branch push
- [ ] Execute smoke test checklist on staging:
  - [ ] Register new account → receive verification email → verify
  - [ ] Upload MP3 → analysis completes → chords visible
  - [ ] AI Tutor responds (PRO account)
  - [ ] Stripe checkout → plan upgrades correctly
  - [ ] Razorpay checkout → plan upgrades correctly
  - [ ] Apple IAP receipt verify (TestFlight)
  - [ ] Expo push notification received on analysis complete
  - [ ] Community post created and liked
  - [ ] Password reset flow completes
  - [ ] Admin panel accessible on ADMIN account
- [ ] App Store Connect: screenshots, description, metadata prepared
- [ ] Google Play Console: store listing prepared
- [ ] TestFlight build submitted for internal testing
- [ ] Submit iOS app for App Store review
- [ ] Submit Android app for Google Play review

**Validation Steps:** Smoke test checklist 100% passing on staging.

**Rollback Strategy:** Staging is isolated. Production is untouched until Phase 3.

---

### Phase 3 — Public Launch

**Status:** Not Started | **Priority:** Critical | **Effort:** 1–2 days | **Risk:** Medium

- [ ] Confirm production DNS and SSL
- [ ] Confirm Sentry alerts active for P0 error rate threshold
- [ ] Confirm PostHog funnel tracking is live
- [ ] Set up Railway production alerting (health check failure → notification)
- [ ] Launch communications (social, email list, Product Hunt)
- [ ] Monitor error rate for first 72 hours
- [ ] Monitor analysis queue depth for first 72 hours
- [ ] First 500 user milestone tracked

**Validation Steps:** No P0 incidents in first 72 hours. Sentry error rate below 0.5%.

**Rollback Strategy:** Railway supports instant rollback to previous deployment.

---

### Phase 4 — Testing Foundation

**Status:** Not Started | **Priority:** High | **Effort:** 1–2 weeks | **Risk:** Low

- [ ] Web-app: configure Vitest + React Testing Library (already installed, no test files yet)
- [ ] Web-app tests — auth pages: login, register, forgot-password
- [ ] Web-app tests — dashboard page
- [ ] Web-app tests — analysis page
- [ ] Web-app tests — billing page
- [ ] Web-app tests — `lib/api/client.ts` (token refresh logic)
- [ ] Web-app coverage threshold: 60% lines/functions
- [ ] Backend: raise coverage thresholds from 30% to 60%
- [ ] Backend: add integration test for upload → analysis queue path
- [ ] E2E: install Playwright
- [ ] E2E: test — register → verify email → login
- [ ] E2E: test — upload song → poll until complete → view analysis
- [ ] E2E: test — AI Tutor sends a message (PRO account)
- [ ] E2E: test — billing upgrade (Stripe test mode)
- [ ] Add E2E job to CI (`staging.yml` or new `e2e.yml`)

**Validation Steps:** `npm run test:coverage` passes thresholds. E2E suite green on CI.

**Rollback Strategy:** Tests are additive; no production code changes.

---

### Phases 5–9 — Checklists to be detailed when each phase becomes active

Expand each phase checklist when the predecessor is complete. Do not plan tasks more than one phase ahead at full detail — requirements change.

---

## 5. Development Workflow

Every implementation session must follow this sequence without exception.

```
1. Open PROJECT_PLAN.md
   ↓
2. Identify the current active phase
   ↓
3. Choose ONE unchecked task from the phase checklist
   ↓
4. Implement ONLY that task
   (Do not begin a second task in the same session unless the first is fully validated)
   ↓
5. Run validation steps for that task
   ↓
6. If architecture changed: update ARCHITECTURE.md or docs/decisions/
   If environment variables changed: update .env.example files
   If API contract changed: update API.md
   ↓
7. Commit with a clear message referencing the task
   ↓
8. Check the task off in PROJECT_PLAN.md
   ↓
9. Stop, or return to step 3 for the next task
```

**Rules:**
- Never implement tasks from two different phases in the same session.
- Never start a task that has unchecked prerequisites above it.
- Never mark a phase complete without running all validation steps.
- If a task reveals new work not in the checklist, add it to the checklist before starting it.

---

## 6. Quality Gates

Every phase must clear all of these before it is considered complete. No exceptions.

| Gate | Check |
|---|---|
| **Build** | `npm run build` succeeds in every changed package |
| **Type check** | `npm run type-check` passes in every changed package |
| **Lint** | `npm run lint` passes (no errors, warnings reviewed) |
| **Tests** | `npm run test` passes; coverage does not drop below thresholds |
| **Formatting** | `npx prettier --check .` returns clean |
| **No duplicate code** | No new logic that duplicates existing functionality in the same codebase |
| **No breaking API changes** | All existing API contracts honoured; if a contract changed, migration documented |
| **Documentation current** | Any changed architecture, env vars, or APIs reflected in docs |
| **Committed** | All changes in a clean commit on the main branch |

---

## 7. Decision Matrix

Before adding any feature or significant change, answer every question. If any answer is "No" or "Unsure," stop and resolve it before proceeding.

| Question | Source of truth |
|---|---|
| Does PRODUCT.md require it? | `docs/PRODUCT.md` Section 4 (Core Modules) and Section 7 (Feature Roadmap) |
| Does ARCHITECTURE.md support it? | `docs/ARCHITECTURE.md` — service boundaries, security model, data model |
| Does it belong to exactly one module? | `docs/PRODUCT.md` Section 4 — every feature has one owner |
| Does it overlap existing functionality? | Search the codebase before adding |
| Can it be delivered in the current phase? | Check the current phase checklist |
| Can it be tested? | Name the test before writing the code |
| Is it in scope? | `docs/PRODUCT.md` Section 14 (Out of Scope) — check the explicit list |

If all seven are "Yes," the work may begin.

---

## 8. Technical Debt Register

Sourced from the Phase 6 launch audit and the June 2026 repository standardization audit. No invented issues.

| # | Issue | Priority | Impact | Risk if Ignored | Planned Phase | Status |
|---|---|---|---|---|---|---|
| 1 | Workspace declares `mobile-rn` — folder is `mobile_app` | Critical | `dev:mobile` and `type-check` silently fail | Broken developer experience; CI type-check misses mobile | Phase 1 | **Resolved** — workspace array fixed 2026-06-29 |
| 2 | No Prettier or EditorConfig | High | Code style diverges across contributors | Noisy diffs, merge conflicts | Phase 1 | Open |
| 3 | No ESLint in `backend` or `mobile_app` | High | Logic errors and anti-patterns not caught automatically | Quality regression over time | Phase 1 | **Resolved** — ESLint added to `backend` (2026-06-30) and `mobile_app` (2026-07-01, Sprint 2); both use flat config with typescript-eslint@^8 |
| 4 | `backend/coverage/` committed to git | High | Generated artifacts pollute git history | Larger repo, spurious conflicts | Phase 1 | **Resolved** — confirmed already untracked; root `.gitignore` and `backend/.gitignore` both cover `coverage/` |
| 5 | `backend/Dockerfile` used Node 20; `web-app/Dockerfile` used Node 22 | Medium | Runtime version inconsistency between services | Hard-to-reproduce environment bugs | Phase 1 | **Resolved** — `backend/Dockerfile` bumped to `node:22-slim` 2026-06-30; both services on Node 22 |
| 6 | `redis.ts` in `backend/src/services/` (wrong layer) | Medium | Breaks folder ownership semantics | New contributors add infrastructure to wrong folder | Phase 1 | Open |
| 7 | BullMQ scheduler worker in `services/` not `workers/` | Medium | Two workers in two different directories | Inconsistent module boundaries | Phase 1 | Open |
| 8 | `mobile-flutter/` empty folder at root | Medium | False signal of Flutter development | Contributor confusion | Phase 1 | Open |
| 9 | Mobile `User` type defined inline, not from `@wilsify/shared` | High | Type drift between platforms | Mobile accepts/rejects data the API would not | Phase 5 | Open |
| 10 | `web-app/src/lib/types/` duplicates `@wilsify/shared` types | Medium | Types diverge silently | Subtle runtime mismatches | Phase 5 | Open |
| 11 | No staging environment | High | Every `main` merge deploys directly to production | A bad merge breaks paying users immediately | Phase 2 | Open |
| 12 | No web-app or mobile test suite | High | Regressions invisible until users report them | Fragile release process | Phase 4 | **Partially resolved** — web-app test suite established 2026-07-01 (Sprint 4): 131 tests, all green; build/type-check/lint all pass; mobile tests still open |
| 13 | No E2E test suite | High | Full user flows not automatically verified | Launch-breaking bugs reach production | Phase 4 | Open |
| 14 | Backend test coverage thresholds at 30% | Medium | Low bar catches few regressions | False confidence from passing CI | Phase 4 | Open |
| 15 | `ai-service/services/r2.py` is an infrastructure client in the wrong layer | Low | Breaks folder ownership in the Python service | New contributors add storage logic to wrong folder | Phase 7 | Open |
| 16 | `mobile_app/` uses snake_case — inconsistent with `web-app/`, `ai-service/` | Low | Naming inconsistency | Minor confusion for new contributors | Phase 5 | Open |
| 17 | `constants/api.ts` and `config/api.ts` may be duplicates in mobile | Medium | Dead code or diverging constants | API URL changes missed in one copy | Phase 1 | Open |
| 18 | 20+ empty placeholder folders in `mobile_app` | Low | Tree noise, false signals | Contributor uncertainty about project structure | Phase 1 | Open |
| 19 | Pre-existing mobile TypeScript errors: `LinearGradient`, `Ionicons`, `Animated.View` TS2786 (`refs` missing — React 18 / Expo type compatibility) | High | `npm run type-check` fails for mobile | Mobile type safety is unverified; errors invisible until workspace was connected | Phase 1 | **Resolved** — 2026-07-01 (Sprint 2); TypeScript `paths` aliases in `mobile_app/tsconfig.json` pin `react` and `react-native` to local v18/v0.76.9 types; `tsc --noEmit` passes with 0 errors |
| 20 | Backend rate-limit returns HTTP 500 when limit exceeded (and when Redis unavailable) | High | `npm test` had 6 failing rate-limit tests; production: Redis outage surfaces as 500 to all clients | Clients can't distinguish rate-limit from server crash; Redis outage takes down the API | Phase 1 | **Resolved** — 2026-07-01 (Sprint 3); `skipOnError: true` added (fail-open on Redis outage); `errorResponseBuilder` removed (was returning plain object, causing error-handler check `statusCode === 429` to miss); 429 formatted centrally in `app.ts` error handler; 67/67 tests pass |

---

## 9. Risks

### High Risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| App Store / Play Store rejection delays launch | Medium | Submit early. Read guidelines carefully. Have a contingency web-only launch plan. |
| Real traffic reveals analysis pipeline reliability issues | Medium | Monitor Celery dead-letter queue in first week. Have Redis + Railway alerts on queue depth. |
| Type drift between `shared` and individual packages causes production bugs | Medium | Phase 5 (type consistency) is prioritised immediately after launch stabilises. |
| No staging environment means a bad deploy hits all users | High | Phase 2 addresses this. Do not skip. |

### Medium Risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| AI Tutor API costs spike unexpectedly | Low | Monthly counters enforce per-user limits. Monitor Anthropic dashboard weekly. |
| Demucs stem separation OOMs on Railway | Medium | Concurrency is 1 on the slow queue. Monitor memory. GPU path (Phase 7) is the long-term fix. |
| Stripe or Razorpay webhook delivery failure leaves subscription in wrong state | Low | Webhook idempotency keys prevent duplicate processing. Manual webhook replay available from provider dashboards. |
| Broken workspace reference causes silent CI type-check failures for mobile | High | Fix in Phase 1, Day 1. |

### Low Risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| Code style divergence across contributors | High | Addressed in Phase 1 with Prettier. Ignored until then. |
| Competitor ships similar feature before Phase 6 engagement features | Low | Core analysis product is differentiated. Community and practice features reinforce retention, not acquisition. |
| LilyPond PDF generation fails for unusual chord progressions | Medium | Already wrapped in try/except with graceful fallback. `ENABLE_SHEET` flag allows disabling per environment. |

---

## 10. Milestones

| Milestone | Definition | Target |
|---|---|---|
| **Repository Clean** | Phase 1 complete. All workspace scripts work. Formatter enforced. No generated artifacts in git. | Before any new feature work |
| **Launch Ready** | Phase 2 complete. Staging passing. App Store submission in review. | Q3 2026 |
| **Public Live** | Phase 3 complete. 500 registered users. 72h stability confirmed. | Q3 2026 |
| **Test Safety Net** | Phase 4 complete. Web-app coverage ≥60%. E2E suite on CI. | Q4 2026 |
| **Type Consistency** | Phase 5 complete. `@wilsify/shared` used by all packages. | Q4 2026 |
| **Engagement Complete** | Phase 6 complete. Practice mode, sharing, Song Insights live. | Q1 2027 |
| **Scale Ready** | Phase 7 complete. P95 targets met at 10× load. | Q1 2027 |
| **v1.0** | All Phase 1–7 criteria met. API stable. 2,000 paying subscribers. | Q2 2027 |
| **v2.0** | Phase 8–9 complete. Developer API live. Desktop app published. Enterprise tier active. | 2028 |

---

## 11. Completion Definition

A phase is complete when **all** of the following are true. Partial completion is not completion.

| Criterion | Verification |
|---|---|
| **All checklist items checked** | PROJECT_PLAN.md phase checklist is 100% checked |
| **All quality gates pass** | Build, type-check, lint, tests, formatting — all green |
| **No regressions** | Existing tests pass. No new Sentry errors introduced. |
| **Documentation current** | Any changed architecture, APIs, or env vars documented |
| **Reviewed** | At minimum a self-review: re-read every changed file before marking done |
| **Committed** | All changes in clean commits on `main`; no uncommitted work |
| **Phase status updated** | This document updated to reflect the new phase status |

---

## 12. Future Backlog

Items in this list are not scheduled. They are captured so they do not re-enter planning discussions prematurely. Expand and schedule only when the preceding phases are complete.

- GPU inference on Modal.com for Demucs (sub-20s stem separation)
- Public developer API (ENTERPRISE / Developer tier, OpenAPI documented)
- Collaborative song annotations (multi-user, real-time)
- Electron desktop application (macOS + Windows)
- Chrome / Firefox browser extension (YouTube in-page chord overlay)
- Team accounts (music schools, bands)
- Plugin marketplace (community-contributed analysis modules)
- Setlist builder (organise songs by key for harmonic mixing)
- Audio recording in browser (no mobile app required for live detection)
- Multi-language UI and tutor (Spanish, Portuguese, French, German)
- AI-generated practice exercises from detected chord difficulty
- Difficulty progression recommendations (next song to learn)
- Public song library (community-curated, opt-in, browseable by key/BPM/genre)
- MusicXML and GuitarPro export
- Batch upload (multiple songs in one operation)
- Custom instrument tuning (arbitrary tunings beyond 8 presets)
- Instrument auto-detection from audio
- Chord diagram generation (guitar, piano, ukulele voicings)
- Karaoke mode (use stems to mute vocals or instruments for practice)
- Referral program

---

## 13. Project Rules

These rules are non-negotiable. They exist because violating them has a known cost.

1. **Never skip phases.** Phases are not suggestions. A skipped phase creates technical debt that costs more to fix later than to do now.
2. **Never implement multiple major systems in one session.** Focus is the difference between working and almost working.
3. **Never break production for cleanup.** Repository hygiene, refactors, and consistency improvements are applied in isolated commits, tested, and confirmed safe before merging.
4. **Never add a library that duplicates an existing one.** Check `package.json` before adding a dependency. If something similar already exists, use it or replace it — never add alongside.
5. **Never commit generated artifacts.** Build output, coverage reports, `.tsbuildinfo`, `__pycache__`, `dist/` — all gitignored.
6. **Never add a feature to the wrong module.** Every feature has exactly one owner from `PRODUCT.md` Section 4. If the right owner is unclear, resolve it before writing code.
7. **Never duplicate documentation.** One document per topic. If the same information lives in two places, one of them is wrong. Update the authoritative one; remove the other.
8. **Never hardcode secrets.** Every secret lives in environment variables. Every `.env.example` is kept current.
9. **Never change an API contract without a deprecation window.** Mobile app users cannot be force-updated. Any removed or renamed endpoint breaks apps in the field.
10. **Never start Phase N+1 before Phase N is complete.** The completion definition in Section 11 is the gate. No partial credit.
11. **Prefer explicit over implicit.** Clear naming, obvious imports, no magic. Future contributors should understand the code without asking.
12. **Ship small, validate, then continue.** A small change that is confirmed correct is always better than a large change that might be.

---

## 14. Final Dashboard

*Update this section at the start of each working session.*

| Dimension | Status |
|---|---|
| **Overall Progress** | v1.0.0 released (2026-07-03, Sprint 9 GO) — Phase 1 (Repository Standardization) complete; Phase 2 (Pre-Launch Validation) in progress |
| **Current Phase** | Phase 2 — Pre-Launch Validation (staging, smoke tests, store submission still open) |
| **Next Phase** | Phase 3 — Public Launch |
| **Blocking Issue** | Prettier format pass (193 files) not yet run; Railway staging environment not yet provisioned |
| **Repository Health** | 8.2/10 — All 5 workspaces registered, scripts consistent, config files in place, all services release-ready |
| **Documentation Health** | 9/10 — Comprehensive and current (this document refreshed as part of the July 2026 documentation reorganization) |
| **Architecture Health** | 8/10 — Solid boundaries, minor misplaced infrastructure files (see debt items 6, 7, 15) |
| **Test Coverage** | Backend: 67 tests (30% threshold) · Web-app: 131 tests · AI service: 98 passed / 2 skipped · Mobile: 0 · E2E: 0 — all green per Sprint 9 validation |
| **Technical Debt Items** | 13 open, 1 partially resolved, 6 resolved (of 20 total — see Section 8) |
| **Overall Readiness** | v1.0.0 shipped; Sprint 9 "NOT VERIFIED" list (Railway/Vercel/EAS live deployment, live payment credentials) is the remaining gate before Phase 2 can close — see `docs/deployment/LAUNCH_CHECKLIST.md` |
| **Last Updated** | 2026-07-03 — Sprint 9 (v1.0.0 Release Validation) complete: full build/type-check/lint/test suite green across all four services |

---

*This document evolves with the project. When a phase completes, update its status, check off its tasks, and expand the next phase's checklist to full detail. Do not rewrite sections that are still accurate — annotate and extend.*

---

## Related Documents

- [../product/PRODUCT.md](../product/PRODUCT.md) — what to build (this document covers when and in what order)
- [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — how it is built
- [VERSIONS.md](VERSIONS.md) — release versioning strategy and roadmap
- [../deployment/LAUNCH_CHECKLIST.md](../deployment/LAUNCH_CHECKLIST.md) — operational checklist for the current phase
- [../README.md](../README.md) — documentation map
