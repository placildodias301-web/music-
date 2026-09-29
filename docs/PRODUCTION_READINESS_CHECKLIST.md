# Production Readiness Checklist — Wilsify AI

Status reflects what was verifiable from the ZIP as of this audit. ✅ = confirmed present and working · ⚠️ = partially present / needs verification · ❌ = not found.

## Testing
- ✅ Backend automated test suite exists (README states 67 tests, with a `test:coverage` script)
- ✅ CI runs tests before deploy (`backend-ci.yml` / `ai-service-ci.yml` referenced in deployment docs)
- ⚠️ AI-service test coverage — not verified in this pass; confirm a `tests/` directory exists with meaningful coverage, not just smoke tests
- ⚠️ Frontend (web-app) test coverage — README lists a `npm test` script for web-app; confirm it's more than a placeholder
- ❌ Mobile app automated tests — none found referenced
- ❌ End-to-end tests across the full upload → analyze → export flow — not found

## Security
- ✅ Password reset flow prevents account enumeration
- ✅ Refresh token is `httpOnly`, `sameSite: strict`, path-scoped
- ✅ Per-route rate limiting on sensitive auth endpoints, on top of a global limit
- ✅ CORS restricted to an explicit origin allowlist in production (both backend and AI service)
- ✅ Helmet security headers enabled on the backend
- ✅ No hardcoded secrets found in sampled source files
- ⚠️ Rate-limit key generation trusts a raw `X-Forwarded-For` header read — see `docs/AUDIT_VERIFICATION_REPORT.md` §5 for the fix
- ⚠️ Explicit MIME-type allowlist at the file-upload layer — not confirmed in the sampled files; verify in `routes/uploads/index.ts`
- ❌ No evidence of a dependency vulnerability scan (`npm audit` / `pip-audit` / Snyk / Dependabot) wired into CI — confirm before public launch

## Deployment
- ✅ Backend + AI service deploy to Railway via Nixpacks (no Docker), configured in `railway.json`
- ✅ Web app deploys to Vercel
- ✅ Mobile builds via Expo EAS
- ✅ Migrations run automatically on every backend deploy, before the server starts (`deploy.startCommand`)
- ✅ Health check endpoints (`/health`) on both backend and AI service, polled by Railway
- ⚠️ Rollback procedure — not documented; confirm Railway's deployment history is sufficient or document a manual rollback path

## Monitoring
- ✅ Sentry integration present on both backend and AI service (activates when `SENTRY_DSN` is set)
- ✅ PostHog referenced for product analytics
- ⚠️ Alerting thresholds (e.g. error-rate spikes, queue backlog size) — not found configured; likely needs to be set up in Sentry/PostHog dashboards directly, outside the codebase
- ❌ Uptime monitoring for public-facing endpoints (e.g. a status page) — not found

## Backups
- ✅ `docs/deployment/BACKUP_STRATEGY.md` exists and documents PostgreSQL (Railway automated daily backups) and Redis (AOF persistence) strategy
- ⚠️ Backup restore procedure — confirm it has actually been tested end-to-end at least once, not just documented

## Environment Management
- ✅ `.env.example` present for backend; environment variables centrally documented in `docs/deployment/ENVIRONMENT.md`
- ✅ Backend validates required environment variables at startup and fails fast (Zod-based validation, confirmed in `app.ts` error-handling path)
- ✅ `AI_SERVICE_SECRET` / `BACKEND_INTERNAL_SECRET` shared-secret pattern documented for backend↔AI-service auth
- ⚠️ Confirm `.env.example` exists and is current for **every** module (`web-app`, `mobile_app`, `ai-service`) — backend's was verified; the others were not individually re-checked in this pass

## API Rate Limiting
- ✅ Global limit (200 req/min) + tighter per-route limits on auth endpoints
- ✅ Fails open on Redis outage (documented trade-off, not an oversight)
- ⚠️ See rate-limit key fix above

## Authentication
- ✅ JWT access + refresh token rotation
- ✅ Email verification flow exists
- ✅ Password reset flow exists, enumeration-safe
- ⚠️ Confirm password hashing algorithm and cost factor (e.g. bcrypt/argon2 rounds) meet current recommended minimums — not read in this pass, check `auth.service.ts`
- ❌ No multi-factor authentication — reasonable to defer for a student project, worth listing as future scope for a commercial launch

## Logging
- ✅ Structured logging via Pino (backend) with request-ID correlation (`X-Request-ID` header echoed back)
- ✅ Python `logging` module configured in AI service
- ⚠️ Log retention / centralized log aggregation beyond each platform's own dashboard (Railway/Vercel) — not found; acceptable at current scale, revisit before higher traffic

---

## Summary by Priority

**Must fix before this goes in front of a company:** the rate-limit key generation fix (5-minute change, documented above); confirm the missing `web/WILSIFY.md` situation; confirm password hashing parameters.

**Should fix before public launch:** dependency vulnerability scanning in CI; MIME-type allowlist confirmation on uploads; expand AI-service and mobile test coverage; test the backup restore procedure at least once.

**Nice to have, later:** uptime monitoring/status page; alerting thresholds; multi-factor authentication; centralized log aggregation.
