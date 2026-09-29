# Wilsify AI — Final Production Audit
**Date:** 2026-06-16  
**Scope:** All services and integrations  
**Rule:** Verified findings only — every item traceable to a specific file and line

---

## Backend (Fastify)

### Critical

**[BACKEND-C1] No `POST /api/v1/auth/reset-password` route exists**  
File: [backend/src/routes/auth/index.ts:99](../backend/src/routes/auth/index.ts#L99)  
`forgot-password` generates reset tokens and constructs a URL `https://wilsify.ai/reset-password?token=...`. No route exists to consume the token and update the password. The `PasswordReset` model is correctly created in DB but never redeemed. Forgot-password is end-to-end broken.

**[BACKEND-C2] Subscription order endpoint rejects every mobile request**  
File: [backend/src/routes/subscriptions/index.ts:28](../backend/src/routes/subscriptions/index.ts#L28)  
Mobile sends `{ planId: "pro" }`, backend Zod schema expects `{ plan: "PRO" }`. Field name differs and case differs. Every call to `POST /api/v1/subscriptions/order` returns 400.

### High

**[BACKEND-H1] Stripe webhook HMAC verification is incomplete**  
File: [backend/src/payments/stripe.provider.ts:68](../backend/src/payments/stripe.provider.ts#L68)  
`verifyWebhookSignature` only checks `signature.startsWith("t=")`. No HMAC comparison. Any request with `stripe-signature: t=anything` is accepted.

**[BACKEND-H2] Apple IAP: `APPLE_IAP_SHARED_SECRET` bypasses Zod — will be `undefined`**  
File: [backend/src/payments/apple.provider.ts:27](../backend/src/payments/apple.provider.ts#L27)  
Read via raw `process.env`. Not in `env.ts` schema. Not documented in `.env.example`. Auto-renewable subscription verification requires the shared secret for production receipts.

**[BACKEND-H3] Google Play: provider reads `GOOGLE_SERVICE_ACCOUNT_JSON`, env provides separate fields**  
File: [backend/src/payments/google.provider.ts:24](../backend/src/payments/google.provider.ts#L24)  
`process.env.GOOGLE_SERVICE_ACCOUNT_JSON` is never defined by `.env.example` or `env.ts`. Always `undefined`. Google Play purchase verification always returns `{ success: false }`.

**[BACKEND-H4] Apple webhook has no signature verification**  
File: [backend/src/payments/apple.provider.ts:66](../backend/src/payments/apple.provider.ts#L66)  
`verifyWebhookSignature` always returns `true`. Any POST to `/webhooks/apple` is processed.

### Medium

**[BACKEND-M1] `emailService.sendAnalysisComplete` is unreachable dead code**  
File: [backend/src/services/email.service.ts:40](../backend/src/services/email.service.ts#L40)  
Method exists but is never called from any route, worker, or service.

**[BACKEND-M2] `RAZORPAY_WEBHOOK_SECRET` documented but not in Zod schema**  
File: [backend/.env.example:43](../backend/.env.example) / [backend/scripts/validate-production-env.ts:181](../backend/scripts/validate-production-env.ts#L181)  
Razorpay webhook HMAC correctly uses `RAZORPAY_KEY_SECRET`. The separate `RAZORPAY_WEBHOOK_SECRET` variable in `.env.example` and validate script is misleading and unused.

**[BACKEND-M3] `zod-to-json-schema` installed but not imported in any source file**  
File: [backend/package.json:43](../backend/package.json)  
Grep of `backend/src/**/*.ts` returns no matches. Unused production dependency.

### Low

**[BACKEND-L1] Auth: `isVerified: true` hardcoded on register**  
File: [backend/src/services/auth.service.ts:27](../backend/src/services/auth.service.ts#L27)  
Intentional for beta (skip email verification). Should be documented with a TODO for post-beta email verification flow.

**[BACKEND-L2] Google webhook: `verifyWebhookSignature` always returns true**  
File: [backend/src/payments/google.provider.ts:60](../backend/src/payments/google.provider.ts#L60)  
Acceptable for closed beta if endpoint URL is not publicly known. Fix before public launch.

---

## AI Service (FastAPI / Python)

### High

**[AI-H1] `on_event("startup")` is deprecated in FastAPI 0.115**  
File: [ai-service/main.py:61](../ai-service/main.py#L61)  
`@app.on_event("startup")` is deprecated. Should use `lifespan` context manager. Not a blocker for beta, but Railway deploys on the latest package so this may produce warnings.

### Medium

**[AI-M1] Real-time chord timestamp is hardcoded to 0.0**  
File: [ai-service/api/realtime.py:59](../ai-service/api/realtime.py#L59)  
`timestamp = 0.0` — placeholder. All chord events emitted from the live detection feature will have `timestamp: 0`.

### Low

**[AI-L1] Energy calculation uses inline import inside request handler**  
File: [ai-service/api/analyze.py:97](../ai-service/api/analyze.py#L97)  
`import librosa` and `import numpy` inside request body. Not a correctness issue (Python caches imports), but non-standard. No action required.

---

## Mobile App (React Native / Expo)

### Critical

**[MOBILE-C1] Apple IAP product IDs in pricing screen don't match backend verification map**  
File: [mobile-rn/app/pricing/index.tsx:47](../mobile-rn/app/pricing/index.tsx#L47)  
Mobile product IDs include `.app.` segment; backend lookup table does not. See C-1 in repository audit.

**[MOBILE-C2] EAS project ID is a TODO placeholder**  
File: [mobile-rn/app.json:58](../mobile-rn/app.json#L58)  
`"projectId": "TODO_your-eas-project-uuid-from-expo-dev"` — EAS builds and Expo push notifications will not work.

**[MOBILE-C3] eas.json submit config has TODO placeholders**  
File: [mobile-rn/eas.json:21](../mobile-rn/eas.json#L21)  
Apple ID and ASC App ID are placeholder strings. App Store submission will fail.

### High

**[MOBILE-H1] Subscription order sends wrong field and wrong case to backend**  
File: [mobile-rn/src/api/apiService.ts:143](../mobile-rn/src/api/apiService.ts#L143)  
`{ planId: "pro" }` → backend expects `{ plan: "PRO" }`. All subscription purchase flows fail.

**[MOBILE-H2] Hardcoded streak badge on home screen**  
File: [mobile-rn/app/(tabs)/index.tsx:71](../mobile-rn/app/(tabs)/index.tsx#L71)  
`<StreakBadge count={12} />` — placeholder. Shipped to production this would display 12 for all users.

### Medium

**[MOBILE-M1] `EXPO_PUBLIC_RAZORPAY_KEY_ID` missing from mobile `.env.example`**  
File: [mobile-rn/app/pricing/index.tsx:123](../mobile-rn/app/pricing/index.tsx#L123)  
`process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID` is read at runtime. Not in `.env.example`. Developers won't know to set it.

**[MOBILE-M2] `EXPO_PUBLIC_SENTRY_DSN` missing from mobile `.env.example`**  
File: [mobile-rn/app/_layout.tsx:76](../mobile-rn/app/_layout.tsx#L76)  
`process.env.EXPO_PUBLIC_SENTRY_DSN` is read. Not in `.env.example`.

**[MOBILE-M3] `EXPO_PUBLIC_PROJECT_ID` missing from mobile `.env.example`**  
File: [mobile-rn/app/_layout.tsx:54](../mobile-rn/app/_layout.tsx#L54)  
`process.env.EXPO_PUBLIC_PROJECT_ID` used for push token registration. Not in `.env.example`.

**[MOBILE-M4] `EXPO_PUBLIC_STRIPE_PK` in `.env.example` but Stripe is unused in mobile**  
File: [mobile-rn/.env.example](../mobile-rn/.env.example)  
No Stripe SDK import exists in mobile. Misleads developers.

### Low

**[MOBILE-L1] `AI_URL` in API config is unused**  
File: [mobile-rn/config/api.ts:3](../mobile-rn/config/api.ts)  
`AI_URL` defined but `apiService.ts` never references `API_CONFIG.AI_URL`. Mobile always routes through backend.

**[MOBILE-L2] Notification deep-link pushes `/notifications/index` path (includes `index`)**  
File: [mobile-rn/app/_layout.tsx:103](../mobile-rn/app/_layout.tsx#L103)  
`router.push("/notifications/index")` — Expo Router file-based routing may resolve correctly but the `/index` suffix is unconventional. Should be `/notifications`.

---

## Payments

### Critical

| Provider | Order | Verify | Webhook Signature | Cancellation |
|----------|-------|--------|-------------------|--------------|
| Razorpay | ✅ Works | ✅ HMAC correct | ✅ HMAC correct | ✅ |
| Stripe | ✅ Works | ✅ Works | ❌ Prefix-only check | ✅ |
| Apple IAP | N/A (client-side) | ❌ Product ID mismatch, shared secret missing | ❌ Always true | N/A (user-managed) |
| Google Play | N/A (Razorpay used) | ❌ Wrong env var | ❌ Always true | N/A |

---

## Notifications

### Verified Working
- Push token registration: `POST /api/v1/users/push-token` → stored in `users.pushToken` ✅
- Analysis complete push: sent in `analysis.worker.ts:172` via Expo Push API ✅
- In-app notification creation: `analysis.worker.ts:161` ✅
- Notification list: `GET /api/v1/notifications` ✅
- Mark read: `PATCH /api/v1/notifications/:id/read` ✅
- Deep-link handling in `_layout.tsx:96-116` ✅

### Gaps
- No push notification for community likes/comments (notification type exists in schema, no worker action)
- `EXPO_ACCESS_TOKEN` required for high-volume delivery receipts — not enforced but documented in validate script

---

## Database / Prisma

### Verified
- Schema fully aligned with all backend services ✅
- Two migrations present and sequential (`20260616000001_init`, `20260616000002_add_push_token`) ✅
- All foreign keys use `onDelete: Cascade` where appropriate ✅
- Indexes on `[email]`, `[tokenHash]`, `[userId]`, `[createdAt(sort: Desc)]` ✅
- `migration_lock.toml` present ✅

### Gaps
- No migration for `ENTERPRISE` plan data — plan enum exists but no billing path defined
- `Subscription.providerId` has `@unique` — if a user re-subscribes after cancellation with the same Razorpay payment ID, upsert will fail with unique constraint violation

---

## Redis / BullMQ

### Verified
- Worker uses BullMQ `Worker` with `connection: { url: env.REDIS_URL }` ✅
- `removeOnComplete: { count: 100 }` and `removeOnFail: { count: 50 }` set ✅
- Concurrency: 2 jobs per worker instance ✅
- WebSocket event emitted on completion ✅
- Webhook idempotency via Redis `SET NX EX` pattern ✅

### Gaps
- No dead letter queue / alerting for persistently failing jobs
- No BullMQ dashboard (Bull Board) configured — blind to queue depth

---

## Cloudflare R2

### Verified
- `UploadService` validates MIME type from allowed list ✅
- 100 MB file size limit enforced in streaming chunked reader ✅
- Key format: `uploads/{userId}/{uuid}.{ext}` ✅
- Public URL construction from `R2_PUBLIC_URL` env ✅
- `deleteFile` method exists for cleanup ✅

### Gaps
- Orphaned R2 files: if song is deleted from DB, `upload.service.deleteFile` is not called from `song.service.delete` (need to verify this — UNVERIFIED, song delete route exists but service not read in full)

---

## Railway Deployment

### Verified
- `backend/railway.json` and `ai-service/railway.json` present ✅
- `ai-service/nixpacks.toml` present for Python build ✅
- Graceful shutdown on SIGTERM/SIGINT in `backend/src/index.ts:25` ✅
- Worker runs in-process with server (same dyno) ✅

### Gaps
- No health check endpoint timeout configured in Railway (default may be too short for cold start with ML model load)
- No Railway-specific environment variable documentation

---

## Expo / EAS

### Critical gaps (verified)
- `app.json` `projectId` is a TODO placeholder — EAS builds will fail
- `eas.json` Apple and ASC IDs are TODO placeholders — iOS submission will fail
- `mobile-rn/eas.json` references `./google-play-key.json` for Android submission — this file does not exist in the repo (correct, should not be committed, but must be present during CI)

### Verified working
- Build profiles defined: `development`, `preview`, `production` ✅
- Android `buildType: "aab"` for production (required for Play Store) ✅
- iOS `credentialsSource: "remote"` (managed by EAS) ✅
- New Architecture enabled: `"newArchEnabled": true` ✅
- Required iOS permissions: microphone, camera, background audio ✅
- Required Android permissions: RECORD_AUDIO, INTERNET ✅

---

## Sentry

### Verified
- Backend: optional dynamic import of `@sentry/node` gated on `env.SENTRY_DSN` ✅
- Backend: unhandled 5xx errors captured in error handler ✅
- Mobile: optional dynamic import of `@sentry/react-native` gated on `EXPO_PUBLIC_SENTRY_DSN` ✅
- AI service: `sentry_sdk.init` on startup if `SENTRY_DSN` set ✅

### Gaps
- `@sentry/node` and `@sentry/react-native` not in `package.json` dependencies — dynamic import will fail at runtime even when DSN is set unless packages are installed separately
- No source maps upload configured for mobile builds

---

## Security Summary

| Area | Status | Notes |
|------|--------|-------|
| JWT access tokens (15m) | ✅ | Short expiry |
| JWT refresh rotation | ✅ | Single-use, revoke on use |
| Password hashing | ✅ | bcrypt via `bcryptjs` |
| Rate limiting on auth | ✅ | 5 req/15min register, 10/15min login |
| CORS | ✅ | Configurable via `ALLOWED_ORIGINS` |
| Webhook idempotency | ✅ | Redis NX pattern |
| Razorpay HMAC | ✅ | Correct |
| Stripe HMAC | ❌ | Prefix check only |
| Apple webhook auth | ❌ | Always true |
| Google webhook auth | ❌ | Always true |
| R2 upload validation | ✅ | MIME + size |
| WebSocket JWT auth | ✅ | Token required on handshake |
| Internal AI secret | ✅ | `X-Internal-Secret` header |
| SQL injection | ✅ | Prisma parameterized queries |
| XSS | N/A | API-only backend |
