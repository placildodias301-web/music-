# Wilsify AI — Launch Checklist

**Status**: v1.0.0 is code-complete and tagged (2026-07-03, Sprint 9 GO). This checklist covers the **operational** work remaining to take a fresh environment from "code deployed" to "publicly launched" — infrastructure provisioning, credentials, store submission, and smoke testing.

**Merged from**: the former `BETA_CHECKLIST.md`, `BETA_LAUNCH.md`, and `launch/LAUNCH_DAY_CHECKLIST.md` (all three overlapped heavily and are now archived under `docs/archive/launch-cycle/` and `docs/archive/phase6-audit-cycle/`). Their bug-fix sections described issues from a June 2026 audit cycle that are already resolved in the current codebase (see `docs/development/CHANGELOG.md` v0.7.0 onward) and have been dropped here.

**How to use this list**: work through each section in order. A section should be 100% before moving to the next.
🔴 **BLOCKER** = cannot launch without this · 🟡 **REQUIRED** = must be done before real users onboard · 🟢 **RECOMMENDED** = do before public (non-beta) launch

---

## 1. Infrastructure

### Database
- [ ] 🔴 PostgreSQL 16 provisioned (Railway managed Postgres)
- [ ] 🔴 `DATABASE_URL` set in backend Railway environment
- [ ] 🔴 `npx prisma migrate deploy` run against production
- [ ] 🔴 Daily automatic backups enabled (see `BACKUP_STRATEGY.md`)

### Redis
- [ ] 🔴 Redis 7 provisioned (Railway Redis or Upstash), AOF persistence on
- [ ] 🔴 `REDIS_URL` set in backend Railway environment
- [ ] 🔴 Verify BullMQ connects successfully (check Railway logs on backend startup)

### Cloudflare R2
- [ ] 🔴 R2 bucket created (`wilsify-uploads`)
- [ ] 🔴 `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` set on backend **and** AI service
- [ ] 🔴 R2 CORS policy configured (allow `GET` from the production frontend domain only)

### Backend API (Railway)
- [ ] 🔴 Deployed; `GET /health` returns `200`
- [ ] 🔴 All required env vars set — see [ENVIRONMENT.md](ENVIRONMENT.md)
- [ ] 🔴 `ALLOWED_ORIGINS` includes production web + mobile origins (no `localhost`)
- [ ] 🟡 Custom domain configured (e.g. `api.wilsify.ai`) with TLS

### AI Service (Railway)
- [ ] 🔴 Deployed on an instance with ≥2 GB RAM (Demucs stem separation needs ~4 GB per concurrent job — see `AI_SERVICE.md`)
- [ ] 🔴 `GET /health` returns `200`
- [ ] 🔴 `AI_SERVICE_SECRET` matches the backend's value exactly
- [ ] 🔴 R2 credentials set (same bucket as backend)

---

## 2. Security

- [ ] 🔴 `JWT_SECRET` and `JWT_REFRESH_SECRET` are unique, ≥64 chars, and different from each other (not the `.env.example` placeholders)
- [ ] 🔴 `AI_SERVICE_SECRET` is unique, ≥32 chars
- [ ] 🔴 No `.env` files committed to git — verify with `git log --all -p -- "**/.env"` (should return nothing)
- [ ] 🔴 HTTPS enforced on all Railway/Vercel services (automatic on both platforms)
- [ ] 🟡 `npx tsx scripts/validate-production-env.ts` exits `0` (checks 20+ variables for presence, format, and placeholder values)

---

## 3. Payments

### Razorpay (primary — India)
- [ ] 🔴 Live account activated (KYC complete)
- [ ] 🔴 `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` set (live keys, not `rzp_test_*`)
- [ ] 🔴 Webhook URL registered: `https://<api-domain>/api/v1/subscriptions/webhooks/razorpay`
- [ ] 🔴 Webhook events enabled: `payment.captured`, `subscription.cancelled`
- [ ] 🔴 Subscription plans created in the Razorpay dashboard matching the PRO/STUDIO price points

### Stripe (international)
- [ ] 🟡 Account activated; `STRIPE_SECRET_KEY` (live) and `STRIPE_WEBHOOK_SECRET` set
- [ ] 🟡 4 price IDs created and set in env vars
- [ ] 🟡 Webhook registered in the Stripe dashboard for `customer.subscription.*`

### Apple IAP
- [ ] 🔴 IAP products created in App Store Connect (4 products matching `IAP_SKU_MAP`), status "Ready to Submit"
- [ ] 🔴 `eas.json` `appleId` / `ascAppId` filled with real values (see EAS.md)
- [ ] 🔴 Sandbox-tested on a real iOS device via TestFlight

### Google Play Billing
- [ ] 🔴 Subscription products created in Google Play Console
- [ ] 🔴 `GOOGLE_SERVICE_ACCOUNT_JSON` set
- [ ] 🔴 Google Play RTDN webhook configured
- [ ] 🔴 Sandbox-tested on a real Android device

---

## 4. Mobile Build & Store Submission

- [ ] 🔴 `app.json` `extra.eas.projectId` replaced with the real Expo project UUID (`npx eas init` inside `mobile_app/`)
- [ ] 🔴 `eas.json` production profile `EXPO_PUBLIC_API_URL` points at the production API
- [ ] 🔴 `eas build --platform android --profile production` succeeds
- [ ] 🔴 `eas build --platform ios --profile production` succeeds
- [ ] 🟡 `EXPO_PUBLIC_SENTRY_DSN` set in the EAS production profile
- [ ] 🔴 App Store: icon, 5× 6.7" + 5× 6.5" screenshots, description, keywords, privacy policy URL, test account in review notes
- [ ] 🔴 Google Play: feature graphic, icon, 2–8 screenshots, descriptions, content rating, Data Safety form, privacy policy URL
- [ ] 🔴 iOS build submitted to TestFlight / App Store review
- [ ] 🔴 Android build submitted to Google Play internal testing / review

Full checklist: [EAS.md](EAS.md) · [STORE_ASSETS.md](STORE_ASSETS.md)

---

## 5. Monitoring

- [ ] 🟡 `SENTRY_DSN` set on backend, AI service, and mobile (`EXPO_PUBLIC_SENTRY_DSN`)
- [ ] 🟡 `@sentry/node`, `sentry-sdk`, `@sentry/react-native` installed in their respective services
- [ ] 🟢 Uptime monitor configured (Railway alerting or an external service) for `/health` failures and 5xx error rate >1%
- [ ] 🟢 BullMQ queue-depth alert configured (>50 waiting jobs)

Full reference: [MONITORING.md](MONITORING.md)

---

## 6. Smoke Test (run against the deployed environment before inviting users)

- [ ] **M1 — difficulty/mode persistence** (migration `20260720000001_add_analysis_difficulty_mode`, hand-authored — no live database was available to verify it at implementation time): apply the migration against a real PostgreSQL instance, confirm the migration history table updates and the four new `analyses` columns exist, run the backend integration tests, execute one real analysis end to end, and confirm `mode`/`difficulty` persist, are returned by `GET /songs/:id/analysis`, and render on the web-app analysis page.
- [ ] Register a new account → verification email received → verify → can log in
- [ ] Upload an MP3 → analysis completes → chords/BPM/key visible
- [ ] YouTube URL import completes
- [ ] AI Tutor responds (PRO test account)
- [ ] Stripe checkout upgrades the account plan
- [ ] Razorpay checkout upgrades the account plan
- [ ] Apple IAP sandbox purchase upgrades the account plan (TestFlight)
- [ ] Push notification received within ~1 minute of analysis completion; tapping it opens the right analysis screen
- [ ] Community post can be created and liked
- [ ] Password reset flow completes end to end
- [ ] Admin panel accessible on an `ADMIN`-role account
- [ ] `cd backend && npm test` and `cd ai-service && python -m pytest` both pass in CI against the deployed configuration

---

## 7. Rollback Plan

| Component | Rollback |
|---|---|
| Backend / AI service | Railway dashboard → redeploy previous deployment, or `railway rollback --service <name>` |
| Mobile (JS-only change) | `eas update --branch production --rollback-to-embedded` |
| Mobile (native change) | Bump `versionCode`/`buildNumber`, submit a new build — cannot be rolled back OTA |
| Database migration | `npx prisma migrate resolve --rolled-back <migration_name>`, then write a new forward migration |

---

## Release Sign-Off

| Role | Sign-off | Date |
|---|---|---|
| Engineering | ☐ | |
| QA | ☐ | |
| Product | ☐ | |
| Security | ☐ | |

**All 🔴 BLOCKER items must be checked before this sign-off is valid.**

---

## Related Documents

- [DEPLOYMENT.md](DEPLOYMENT.md) — the deployment steps this checklist verifies
- [EAS.md](EAS.md) · [STORE_ASSETS.md](STORE_ASSETS.md) — mobile build and store submission detail
- [../development/PROJECT_PLAN.md](../development/PROJECT_PLAN.md) — Phase 2 checklist this maps to
- [../README.md](../README.md) — documentation map
