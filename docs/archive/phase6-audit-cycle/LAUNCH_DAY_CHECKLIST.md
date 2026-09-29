# Wilsify AI — Launch Day Checklist
**Target:** Closed Beta Launch  
**Date:** 2026-06-16

> Complete in the exact order listed. Check each item before proceeding to the next.

---

## PRE-LAUNCH (must complete before launch day)

### Fix Critical Bugs First

- [ ] **C-1** Fix Apple IAP product IDs — align `mobile-rn/app/pricing/index.tsx:47` with `backend/src/payments/apple.provider.ts:9`
- [ ] **C-2** Fix subscription order field name — change `apiService.createOrder` to send `plan: planId.toUpperCase()` not `planId`
- [ ] **C-3** Add `POST /api/v1/auth/reset-password` endpoint to backend
- [ ] **C-4** Set real EAS project UUID in `mobile-rn/app.json:58`
- [ ] **C-5** Set real Apple ID and ASC App ID in `mobile-rn/eas.json`
- [ ] **C-6** Implement Stripe webhook HMAC using `stripe.webhooks.constructEvent`
- [ ] **H-1** Fix Google provider env var: add `GOOGLE_SERVICE_ACCOUNT_JSON` to `env.ts` or rewrite provider to use separate fields
- [ ] **H-4** Add `APPLE_IAP_SHARED_SECRET` to `env.ts` schema and `.env.example`

---

## INFRASTRUCTURE

### 1. PostgreSQL

- [ ] Provision Railway PostgreSQL (or external managed Postgres)
- [ ] Copy `DATABASE_URL` to backend Railway environment variables
- [ ] Verify URL format: `postgresql://user:password@host:5432/db`
- [ ] Confirm database is NOT publicly accessible (Railway private networking preferred)

### 2. Redis

- [ ] Provision Railway Redis (or Upstash Redis)
- [ ] Copy `REDIS_URL` to backend environment variables
- [ ] Verify URL format: `redis://...` or `rediss://...` (TLS for production)

### 3. Cloudflare R2

- [ ] Create R2 bucket named `wilsify-uploads` (or update `R2_BUCKET_NAME`)
- [ ] Create R2 API token with Object Read & Write permissions
- [ ] Enable public access on bucket OR configure custom domain
- [ ] Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`
- [ ] Test upload: `curl -F "file=@test.mp3" https://api.wilsify.ai/api/v1/uploads/file -H "Authorization: Bearer <token>"`

### 4. Railway Backend Deployment

- [ ] Set all backend environment variables (see `backend/.env.example`)
- [ ] Run pre-deploy validation: `npx tsx scripts/validate-production-env.ts`
- [ ] Verify `NODE_ENV=production`
- [ ] Verify `ALLOWED_ORIGINS` does NOT contain `localhost`
- [ ] Verify `JWT_SECRET` is ≥64 chars and not a placeholder
- [ ] Verify `JWT_REFRESH_SECRET` is ≥64 chars and different from `JWT_SECRET`
- [ ] Deploy backend: Railway auto-deploys on git push to main

### 5. Railway AI Service Deployment

- [ ] Set `AI_SERVICE_SECRET` — must match backend's `AI_SERVICE_SECRET`
- [ ] Set `APP_ENV=production`
- [ ] Set `ALLOWED_ORIGINS` to backend's Railway URL only
- [ ] Set `R2_*` variables (same as backend)
- [ ] Deploy AI service: Railway auto-deploys on git push to main
- [ ] Verify health: `curl https://<ai-service-url>/health`

### 6. Environment Variables — Final Checklist

Backend required:
- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `JWT_SECRET` (64+ chars)
- [ ] `JWT_REFRESH_SECRET` (64+ chars, different from JWT_SECRET)
- [ ] `R2_ACCOUNT_ID`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_PUBLIC_URL`
- [ ] `AI_SERVICE_URL` (Railway internal URL of AI service)
- [ ] `AI_SERVICE_SECRET`
- [ ] `RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_KEY_SECRET`
- [ ] `APPLE_IAP_SHARED_SECRET`
- [ ] `RESEND_API_KEY`
- [ ] `ALLOWED_ORIGINS` (production mobile/web origins only)
- [ ] `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (at least one)

Backend recommended:
- [ ] `SENTRY_DSN`
- [ ] `STRIPE_SECRET_KEY` (if offering international payments)
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, etc.
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON`

Mobile `.env` (baked into EAS build):
- [ ] `EXPO_PUBLIC_API_URL` (production backend URL)
- [ ] `EXPO_PUBLIC_WS_URL` (same as API URL)
- [ ] `EXPO_PUBLIC_RAZORPAY_KEY_ID`
- [ ] `EXPO_PUBLIC_PROJECT_ID` (EAS project UUID)
- [ ] `EXPO_PUBLIC_SENTRY_DSN`

### 7. Database Migration

```bash
# Run from backend directory against production DATABASE_URL
npx prisma migrate deploy
```

- [ ] Confirm migration runs without errors
- [ ] Confirm both migrations applied: `20260616000001_init`, `20260616000002_add_push_token`
- [ ] Run `npx prisma db seed` if initial data is required (optional)

### 8. Queue Verification

- [ ] Upload a test audio file to `POST /api/v1/uploads/file`
- [ ] Confirm song status transitions: `QUEUED` → `PROCESSING` → `COMPLETED`
- [ ] Confirm analysis results written to database
- [ ] Confirm push notification received on test device
- [ ] Confirm `analysis:complete` WebSocket event fired

### 9. Sentry Verification

- [ ] Trigger a test error on backend (or check DSN is accepted at startup)
- [ ] Confirm event appears in Sentry dashboard
- [ ] Set up Sentry alerts for error rate threshold

---

## MOBILE

### 10. Expo Setup

- [ ] Login to Expo: `npx expo login`
- [ ] Confirm project UUID matches `app.json` projectId (from expo.dev dashboard)
- [ ] Confirm bundle IDs: `ai.wilsify.app` on both iOS and Android

### 11. EAS Setup

```bash
cd mobile-rn
npx eas build:configure
```

- [ ] EAS project linked
- [ ] iOS credentials configured (auto-managed or manual)
- [ ] Android keystore configured (auto-managed or manual)

### 12. Android Build

```bash
npx eas build --platform android --profile production
```

- [ ] Build completes without errors
- [ ] Download and install `.aab` on test device
- [ ] Verify Razorpay payment flow on Android
- [ ] Verify push notifications on Android

### 13. iOS Build

```bash
npx eas build --platform ios --profile production
```

- [ ] Build completes without errors
- [ ] Install on TestFlight test device
- [ ] Verify Apple IAP flow on iOS (use sandbox environment first)
- [ ] Verify push notifications on iOS

---

## PAYMENTS

### 14. Razorpay

- [ ] Switch from test keys (`rzp_test_*`) to live keys (`rzp_live_*`)
- [ ] Set Razorpay webhook URL in Razorpay dashboard: `https://api.wilsify.ai/api/v1/subscriptions/webhooks/razorpay`
- [ ] Test a ₹1 trial payment on Android in production
- [ ] Confirm webhook received and processed (check logs)
- [ ] Confirm user's plan updated to PRO in database

### 15. Apple IAP

- [ ] Create App Store Connect products matching IDs in `apple.provider.ts`:
  - `ai.wilsify.pro.monthly` — ₹299/month
  - `ai.wilsify.pro.annual` — ₹2691/year
  - `ai.wilsify.studio.monthly` — ₹699/month
  - `ai.wilsify.studio.annual` — ₹6291/year
- [ ] Set Apple IAP shared secret in App Store Connect → copy to `APPLE_IAP_SHARED_SECRET`
- [ ] Configure App Store Server Notifications URL: `https://api.wilsify.ai/api/v1/subscriptions/webhooks/apple`
- [ ] Test sandbox purchase on iOS TestFlight build
- [ ] Confirm receipt verification succeeds (check backend logs)
- [ ] Confirm user plan updated to PRO in database

### 16. Google Play Billing

- [ ] **Note:** Android users pay via Razorpay in the current implementation. Google Play Billing is not wired in the mobile pricing screen.
- [ ] If Google Play Billing is required: wire `google.provider.ts`, fix env var, create Play Store products
- [ ] If staying with Razorpay for Android: document this clearly for beta users

---

## NOTIFICATIONS

### 17. Push Notification Verification

- [ ] Register a push token via `POST /api/v1/users/push-token` after login
- [ ] Trigger analysis on a test song
- [ ] Confirm push notification received on device within 30 seconds of analysis completing
- [ ] Confirm tapping notification navigates to correct analysis screen
- [ ] Confirm in-app notification appears in notifications list

---

## TESTING

### 18. Smoke Tests

- [ ] `GET /health` → 200 OK
- [ ] `GET /ai-service-url/health` → 200 OK
- [ ] Register new user → receive access token
- [ ] Login with credentials
- [ ] Upload an MP3 file → song created → analysis queued
- [ ] Retrieve analysis results after completion
- [ ] Community feed loads
- [ ] Credits balance returns correct value
- [ ] WebSocket connects and receives `live:session-started` on `live:start` event

### 19. Regression Tests

```bash
cd backend && npm test
```

- [ ] All backend tests pass
- [ ] Coverage report generated

```bash
cd ai-service && python -m pytest
```

- [ ] All AI service tests pass

### 20. Beta User Validation

- [ ] Invite 5-10 internal beta users
- [ ] Each user completes: register → upload → view analysis → subscribe
- [ ] Collect any 4xx/5xx errors from Sentry
- [ ] Collect any payment failures
- [ ] Verify analysis completes within 5 minutes for a 3-minute song

---

## LAUNCH

### 21. Closed Beta Release

- [ ] Submit iOS build to TestFlight with beta group
- [ ] Distribute Android APK (`preview` profile) to beta users OR submit to Play Store internal testing
- [ ] Send onboarding email to beta users with Expo Go / TestFlight link

### 22. Monitoring Verification

- [ ] Sentry dashboard showing events
- [ ] Railway logs showing no startup errors
- [ ] Redis memory usage below 80%
- [ ] Database connection pool not exhausted
- [ ] At least one successful analysis in production logs
- [ ] At least one successful payment in production (or confirm payment sandbox working)

---

## POST-LAUNCH (within 24 hours)

- [ ] Review Sentry for error spikes
- [ ] Check BullMQ for stuck or failed jobs
- [ ] Confirm push notification delivery receipts (if `EXPO_ACCESS_TOKEN` set)
- [ ] Collect beta user feedback
- [ ] Confirm Apple server-to-server notifications routing correctly
- [ ] Confirm Razorpay webhook events routing correctly
