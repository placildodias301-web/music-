# Wilsify AI — Changelog

All notable changes are documented here. Follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- **Persisted AI-computed difficulty & key mode** (M1): the AI service has computed a 0–10 difficulty score and major/minor key mode on every analysis since launch, but both were silently discarded before reaching the database — no client ever saw them. `Analysis` gains `mode`, `difficultyScore`, `difficultyLabel`, `difficultyDetail` (migration `20260720000001_add_analysis_difficulty_mode`, not yet verified against a live database — see `LAUNCH_CHECKLIST.md` §6). `GET /songs/:id/analysis` now returns both fields; the web-app analysis page's difficulty display and the AI Tutor's context message — both already built against this exact shape, previously always inert — are live for the first time with no frontend changes required.

---

## [1.0.0] — 2026-07-03 — Public Launch

### Added
- **`docs/releases/v1.0.0.md`**: Full release notes document covering architecture, feature set, security model, performance targets, known limitations, and upgrade notes.

### Fixed
- **README Node.js version**: Tech stack table listed `Node.js 20+`; updated to `Node.js 22+` to match the actual runtime requirement.

### Improved
- **`docs/TESTING.md` web-app section**: The document incorrectly stated no automated tests existed for the web dashboard. The web-app has 131 tests across 13 test files (Vitest 4 + React Testing Library). Section replaced with the complete test file inventory.

---

## [0.9.1] — 2026-07-03 — Release Candidate Audit

### Fixed
- **Chord timeline always hidden on analysis page**: `AnalysisService.get()` never included `duration` in its response. The web-app analysis page gates the entire chord timeline on `analysis.duration` being truthy, so it was permanently hidden regardless of analysis state. The fix passes `song.duration` (already fetched for ownership verification) through both return paths.
- **Wrong Socket.IO env var name in docs**: `docs/DEPLOYMENT.md` and `docs/ENVIRONMENT.md` documented `NEXT_PUBLIC_WS_URL` as the Socket.IO URL variable. The actual code (`SocketProvider.tsx`) reads `NEXT_PUBLIC_SOCKET_URL`. A developer following the deployment guide would set the wrong variable, causing all real-time events to silently fail in production.
- **`.env.local.example` copy command fails**: `docs/DEPLOYMENT.md` instructed `cp .env.local.example .env.local` for the web-app. Only `web-app/.env.example` exists; the command would fail with "file not found". Corrected to `cp .env.example .env.local`.

### Improved
- **`METRICS_SECRET` documented in `ENVIRONMENT.md`**: The Prometheus bearer token was added to `backend/.env.example` in Sprint 7 but not added to the environment variable reference doc.
- **`NEXT_PUBLIC_APP_URL` documented in `ENVIRONMENT.md`**: Added to `web-app/.env.example` in Sprint 7 but missing from the web-app section of `ENVIRONMENT.md`.
- **`AI_SERVICE_SECRET` description corrected in `ENVIRONMENT.md`**: The backend description said "startup warning if unset in production". The behaviour changed to `process.exit(1)` in Sprint 7; the doc now reflects this.
- **Stale version numbers in `ARCHITECTURE.md` and `DEPLOYMENT.md`**: System diagram and prerequisites still referenced Node 20 and Python 3.11 after the Sprint 7 README correction. Updated to Node 22 and Python 3.12 consistently.

---

## [0.9.0] — 2026-07-02 — CI/CD & Production Readiness

### Fixed
- **Backend Dockerfile HEALTHCHECK URL**: The Docker health probe was targeting `/api/v1/health` but the health route is registered without the `/api/v1` prefix, so the actual URL is `/health`. Docker containers were always considered unhealthy. Fixed to `http://localhost:4000/health`.
- **`AI_SERVICE_SECRET` enforcement in backend production**: Previously only logged a warning when `AI_SERVICE_SECRET` was unset in production, leaving AI service internal endpoints exposed. Now exits with code 1 on startup (consistent with the AI service's own `sys.exit(1)` guard).
- **Sentry silently failing in backend**: `@sentry/node` was dynamically imported in `app.ts` when `SENTRY_DSN` is set, but the package was not listed in `package.json`. Sentry was a no-op in production. Added `@sentry/node` to backend dependencies.
- **`web-app/.env.example` incomplete**: Was missing `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_SOCKET_URL`. New developers had no reference for these required variables.
- **Python version inconsistency in docs**: README stated Python 3.11 but Dockerfile and CI use Python 3.12. Corrected to 3.12.
- **Backend test count undocumented**: `rate-limit.test.ts` (11 tests) was missing from `docs/TESTING.md`. Count updated from 56 to 67 across 10 test files.

### Improved
- **Backend CI**: `backend-ci.yml` lint-and-type-check job now runs `npm run lint` in addition to `npm run type-check`. The job was named "Lint & Type Check" but only ran the type check.
- **`METRICS_SECRET` documented**: Added to `backend/.env.example` with generation instructions. The Prometheus `/metrics` bearer token was previously undocumented.
- **`@wilsify/shared` type changes trigger web CI**: Added `shared/**` to `frontend-ci.yml` path filters. Previously, changes to shared types would not re-validate the web-app.
- **Staging CI runs web-app tests**: `staging.yml` webapp-ci job now runs `npm test` before `npm run type-check`.
- **CI environment variables aligned**: `frontend-ci.yml` and `staging.yml` webapp-ci jobs now include all required `NEXT_PUBLIC_*` environment variables.

### Added
- **Standalone AI service CI** (`.github/workflows/ai-service-ci.yml`): Runs ruff lint and pytest on every push to `main`/`develop` that touches `ai-service/**`. Previously the AI service was only tested as part of the staging workflow.

---

## [0.8.0] — 2026-06-27 — Production Hardening

### Security
- **File upload hardening**: magic bytes validation added on top of MIME check — server now reads the first 12 bytes of every upload and rejects files whose content does not match known audio signatures (MP3/ID3, WAV/RIFF, FLAC, OGG, M4A/ftyp, AIFF, WebM/EBML). Extension allowlist enforced separately from MIME type.
- **Filename sanitization**: uploaded filenames are now stripped of path separators and control characters before being stored in R2 metadata, preventing path traversal via `Content-Disposition`.
- **Rate limits expanded**: `/auth/refresh` limited to 20 req/15 min; `/auth/resend-verification` limited to 5 req/hour. All five auth endpoints now have per-route limits.
- **Docker non-root user**: AI service Dockerfile creates and switches to a dedicated `wilsify` system user (UID 1001) before the application process starts.
- **`.dockerignore`**: added to both `backend/` and `ai-service/` — excludes `node_modules`, `dist`, `.env*`, test files, coverage artefacts, and editor config from Docker build context.

### Infrastructure
- **Expanded health endpoints**: `/health/database` (Prisma `SELECT 1`), `/health/redis` (PING), `/health/storage` (credential presence check; optional live HEAD with `HEALTH_STORAGE_LIVE=true`), `/health/workers` (BullMQ queue depth), `/health/all` (parallel aggregate). All return `{ status: "ok"|"degraded"|"down", latencyMs }`.
- **Staging CI/CD workflow** (`.github/workflows/staging.yml`): runs on `staging` branch pushes; executes backend CI (lint + type-check + Postgres + Redis integration tests), web-app type-check, AI service Ruff lint in parallel; deploys backend + AI service to Railway staging and web-app to Vercel preview on success.

### Database
- **Composite indexes** (migration `20260626000004`): `songs(userId, status)`, `subscriptions(userId, status)`, `notifications(userId, read)`, `notifications(userId, createdAt DESC)`. Eliminates full-table scans on the most common dashboard and notification queries.

### AI Pipeline
- **Exponential backoff retries**: all Celery task retries now use `min(base × 2^n, 300s)` countdown instead of a fixed delay. `fast_analyze_task` base = 10 s, all slow tasks base = 30 s.
- **Dead-letter queue**: `dead_letter` Kombu queue added to `celery_app.py`. When a task exhausts its retry budget (`MaxRetriesExceededError`), it is forwarded to `handle_dead_letter` task which logs at `ERROR` level; ready to be wired to PagerDuty/Slack.
- **Increased retry budgets**: `fast_analyze_task` raised to max 3 retries; `separate_stems_task` and `generate_sheet_task` raised to max 2 retries.

### Observability
- **Prometheus metrics** (`GET /metrics`): protected by `Bearer ${METRICS_SECRET}` (falls back to loopback-only if unset). Exposes default Node.js process metrics plus custom counters and histograms: `http_request_duration_seconds`, `wilsify_uploads_total{status}`, `wilsify_ai_analysis_total{status}`, `wilsify_ai_analysis_duration_seconds{type}`, `wilsify_queue_length{queue,state}`, `wilsify_rate_limit_hits_total{route}`, `wilsify_auth_events_total{event}`.

### Testing
- **Rate-limit test suite** (`src/__tests__/rate-limit.test.ts`): 12 tests verifying per-route 429 enforcement and error response shape for register (5/15min), login (10/15min), forgot-password (5/15min), refresh (20/15min), and resend-verification (5/hour).

---

## [0.7.1] — 2026-06-26 — Web Dashboard Bug Fixes

### Fixed
- **Admin page React hooks violation**: `useQuery`/`useMutation` hooks were called after a conditional early return, breaking React's Rules of Hooks. Restructured so all hooks are declared unconditionally before any `return` statement; `enabled` flags on each query prevent fetching when the user is not an admin. Removed all `eslint-disable-next-line react-hooks/rules-of-hooks` suppressions.
- **Missing `@keyframes pulse`**: Skeleton loaders in the dashboard and history pages referenced an undefined `pulse` keyframe animation. Added `@keyframes pulse` to `globals.css` (`0%/100% opacity:1 → 50% opacity:0.4`); skeletons now animate correctly.

---

## [0.7.0] — 2026-06-26 — Launch Remediation

### Security
- **Razorpay timing attack fix**: `verifyPurchase()` and `verifyWebhookSignature()` now use `crypto.timingSafeEqual` on hex-decoded Buffers instead of direct string comparison
- **AI service production gate**: `validate_production_secrets()` calls `sys.exit(1)` if `AI_SERVICE_SECRET` is unset when `APP_ENV=production`; backend emits a startup warning under the same condition
- **Email verification**: new accounts start with `isVerified: false`; uploads and tutor are blocked until verified via a 24-hour token sent by email

### Fixed
- **Double credit deduction**: `POST /songs/:id/analyze` now checks analysis status before charging; returns 202 immediately if already QUEUED or PROCESSING
- **`APP_URL` in email service**: was incorrectly reading `NEXT_PUBLIC_APP_URL` (a frontend-only variable); now reads `env.APP_URL` from the server-side env schema
- **Stripe `invoice.payment_failed` unhandled**: webhook now handles `invoice.payment_failed` and `invoice.payment_action_required`, sets subscription to `past_due`, and sends a payment failure email

### Added
- **Monthly credit reset scheduler**: BullMQ cron job (`0 0 1 * *`) processes all users in cursor-based batches of 100 and tops up credits to plan limit
- **Tutor monthly usage limits**: Redis counter per user per month; PRO=500, STUDIO=2000, ENTERPRISE=unlimited; throws 429 when exceeded
- **Tutor message history trimming**: last 10 messages forwarded to LLM (reduces token cost)
- **Stem entitlements in job**: user plan resolved at enqueue time in `AnalysisService`; `includeStems` and `includeSheet` booleans passed through BullMQ job data so the worker never needs DB access to check plan features
- **Email notifications**: `sendPaymentFailed()`, `sendSubscriptionExpired()`, `sendEmailVerification()` added to email service; subscription webhook handlers send appropriate emails on state transitions
- **`POST /auth/verify-email`**: verifies email with token; rate-limited 10/15min
- **`POST /auth/resend-verification`**: re-sends verification email; invalidates previous tokens; requires authentication
- **Backend Dockerfile**: multi-stage Node 20 build (deps → builder → runner); non-root user `wilsify`; `prisma migrate deploy && node dist/index.js` CMD; HEALTHCHECK on `/api/v1/health`
- **PostgreSQL service in docker-compose**: `postgres:16-alpine` with persistent `postgres_data` volume and `pg_isready` healthcheck
- **Redis AOF persistence**: `redis-server --appendonly yes --appendfsync everysec` in docker-compose
- **SongService pagination**: `list()` accepts `page`, `limit` (max 100), `status`; returns `{ songs, total, page, limit, pages }`
- **Test suite**: 28 new tests across 5 new test files (auth verification, Stripe webhook, Razorpay, song service, analysis service)
- **`docs/BACKUP_STRATEGY.md`**: PostgreSQL, Redis, and R2 backup procedures with RTO table

---

## [0.6.0] — 2026-06 — Admin, Billing & Community

### Added
- **Admin panel**: `GET /admin/overview`, `GET /admin/users` (paginated, searchable), `GET /admin/users/:id`, `PATCH /admin/users/:id`, `GET /admin/subscriptions`, `GET /admin/analyses`
- **Apple IAP webhook**: `POST /subscriptions/webhooks/apple` handles App Store Server Notifications
- **Google Play webhook**: `POST /subscriptions/webhooks/google` handles Pub/Sub push notifications
- **Webhook idempotency**: Redis NX check on all four webhook handlers (24h TTL)
- **Community posts**: `POST /community/posts`, `GET /community/feed` (feed/trending/following tabs), `POST /community/posts/:id/like`
- **Notifications**: `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`
- **Stats endpoints**: `GET /stats` (user stats), `GET /stats/public` (platform counts)
- **Socket.IO `analysis:complete`** event emitted by worker when job completes
- **Expo push notifications**: worker sends push via Expo API on analysis completion

---

## [0.5.0] — 2026-05 — Next.js Web Dashboard

### Added
- Next.js 14 App Router web dashboard (`web-app/`)
- Auth pages: login, register, forgot password, reset password, email verification placeholder
- Dashboard page with analysis history
- Song analysis viewer (chords, BPM, key, MIDI/PDF download)
- AI Tutor page (PRO+)
- Billing page (plan upgrade, cancel subscription)
- Admin page (ADMIN role)
- Centralised API client (`lib/api/client.ts`) with automatic token refresh on 401
- Zustand auth store (in-memory, no localStorage/sessionStorage)
- Socket.IO provider for real-time events
- PostHog analytics integration
- Sentry browser error reporting
- `ErrorBoundary` component
- `AnalyticsProvider`, `ToastProvider`, `SocketProvider`, `AuthProvider`, `QueryProvider`

---

## [0.4.0] — 2026-04 — Billing & Subscriptions

### Added
- Stripe integration: create checkout session, verify payment, `customer.subscription.*` webhooks
- Razorpay integration: create order, verify payment (`orderId|paymentId` HMAC), `payment.captured` webhook
- Apple IAP provider: receipt verification via Apple `/verifyReceipt` API
- Google Play provider: purchase token verification via Google Play Developer API
- Subscription management: `GET /subscriptions`, `POST /subscriptions/order`, `/verify`, `/cancel`
- Plan-gated features: `requirePlan()` middleware
- `CreditService.resetMonthlyCredits()` (scheduler not yet wired up — added in 0.7.0)
- `sendPasswordReset()`, `sendWelcome()` email templates

---

## [0.3.0] — 2026-03 — Real-Time Features & Tutor

### Added
- Socket.IO server on the same port as the REST API
- Live chord detection: `live:start`, `live:stop`, `live:audio-chunk` → `live:chord-detected`
- `POST /api/realtime/chunk` AI service endpoint (autocorrelation pitch detection)
- `POST /tutor/chat` backend endpoint (Claude primary, OpenAI fallback, mock fallback)
- `POST /api/tutor/chat` AI service endpoint
- `requirePlan("PRO", "STUDIO", "ENTERPRISE")` guard on tutor
- Celery fast/slow queue workers with task routing
- `generate_sheet_task`, `separate_stems_task`, `slow_analyze_task` Celery tasks
- Async result callback from Celery to backend via `BACKEND_URL`

---

## [0.2.0] — 2026-02 — Mobile App & AI Pipeline

### Added
- Expo SDK 54 React Native app (`mobile_app/`)
- Upload via file picker, YouTube URL, microphone recording
- Song analysis view (chord timeline, BPM, key, export buttons)
- GuitarTuna-style chromatic tuner (8 tunings, plan gating)
- Community feed with likes
- In-app purchase screens
- Onboarding flow (4 slides, AsyncStorage flag)
- Expo push notification token registration
- AI service analysis pipeline: BPM, key, scale, energy, chord detection, difficulty
- MIDI export via music21
- Sheet music PDF via music21 + LilyPond
- Stem separation via Demucs `htdemucs`
- R2 upload for all generated files
- Analysis worker (`analysis.worker.ts`) — BullMQ consumer, concurrency 2, 3 retries

---

## [0.1.0] — 2026-01 — Backend Foundation & Landing Page

### Added
- Fastify 5 REST API (`backend/`)
- PostgreSQL 16 with Prisma 6 ORM
- JWT authentication (access 15m + refresh 30d cookie, rotation, revocation)
- Password reset via email (hashed token, 1h expiry)
- Credit ledger (append-only, balance from last row)
- BullMQ analysis queue with Redis
- Cloudflare R2 file upload
- Song CRUD endpoints
- `@fastify/swagger` at `/docs`
- Global error handler (structured JSON)
- `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`
- Zod environment validation (fail-fast on startup)
- Vitest test setup with Prisma mocks
- Static landing page (`web/`) deployed to GitHub Pages via `deploy.yml`
- `backend-ci.yml`: type-check → test → deploy to Railway
