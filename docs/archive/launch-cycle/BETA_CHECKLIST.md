# Wilsify AI — Beta Release Checklist

**Date**: June 2026  
**Target**: Closed Beta Launch  
**Phase**: 5–6 — Production Launch Preparation

---

## HOW TO USE THIS CHECKLIST
Work through each section in order. A section must be 100% before deployment.  
**🔴 BLOCKER** = cannot ship without this  
**🟡 REQUIRED** = must be done before beta users onboard  
**🟢 RECOMMENDED** = do before public launch  

---

## 1. INFRASTRUCTURE

### Database
- [ ] 🔴 PostgreSQL provisioned (Railway or Supabase)
- [ ] 🔴 `DATABASE_URL` set in backend Railway env
- [ ] 🔴 Run `npx prisma migrate deploy` in production
- [ ] 🔴 Daily automatic backups enabled
- [ ] 🟡 Connection pooler (PgBouncer) configured for >50 users

### Redis
- [ ] 🔴 Redis 7 provisioned (Railway Redis or Upstash)
- [ ] 🔴 `REDIS_URL` set in backend Railway env
- [ ] 🔴 Verify BullMQ connects successfully (check Railway logs)

### Cloudflare R2
- [ ] 🔴 R2 bucket created (`wilsify-uploads`)
- [ ] 🔴 `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` set
- [ ] 🔴 `R2_BUCKET_NAME` and `R2_PUBLIC_URL` set in backend + ai-service envs
- [ ] 🔴 R2 CORS policy configured (allow GET from `*.wilsify.ai`)
- [ ] 🟡 Custom domain mapped to R2 bucket

### Backend API (Railway)
- [ ] 🔴 Deployed and `/healthz` returns `200 { ok: true }`
- [ ] 🔴 All required env vars set (see [ENVIRONMENT.md](ENVIRONMENT.md))
- [ ] 🔴 `ALLOWED_ORIGINS` includes production origins
- [ ] 🟡 Custom domain configured (`api.wilsify.ai`)
- [ ] 🟡 SSL certificate active

### AI Service (Railway)
- [ ] 🔴 Deployed on instance with ≥2GB RAM
- [ ] 🔴 `/health` returns `200 { status: "ok" }`
- [ ] 🔴 `AI_SERVICE_SECRET` matches backend's `AI_SERVICE_SECRET`
- [ ] 🔴 R2 credentials set for MIDI/PDF upload
- [ ] 🟡 `APP_ENV=production` set
- [ ] 🟡 `ALLOWED_ORIGINS` set to backend URL

---

## 2. SECURITY

- [ ] 🔴 `JWT_SECRET` is unique, ≥64 chars (not the .env.example placeholder)
- [ ] 🔴 `JWT_REFRESH_SECRET` is unique, ≥64 chars, different from JWT_SECRET
- [ ] 🔴 `AI_SERVICE_SECRET` is unique, ≥32 chars
- [ ] 🔴 No `.env` files committed to git (verify with `git log --all -p | grep -i "JWT_SECRET"`)
- [ ] 🔴 HTTPS enforced on all Railway services
- [ ] 🟡 `Strict-Transport-Security` header added to Fastify hooks
- [ ] 🟡 Push token cleared on user logout
- [ ] 🟡 `DELETE /songs/:id` also removes R2 audio object
- [ ] 🟡 Account deletion endpoint implemented
- [ ] 🟢 Certificate pinning in mobile app
- [ ] 🟢 Payment screen capture prevention (FLAG_SECURE on Android)

---

## 3. PAYMENTS

### Razorpay
- [ ] 🔴 Live Razorpay account activated (KYC complete)
- [ ] 🔴 `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (live keys) set
- [ ] 🔴 `RAZORPAY_WEBHOOK_SECRET` set
- [ ] 🔴 Webhook URL registered: `https://api.wilsify.ai/api/v1/subscriptions/webhooks/razorpay`
- [ ] 🔴 Webhook events enabled: `payment.captured`, `subscription.cancelled`
- [ ] 🔴 Subscription plans created in Razorpay dashboard (Pro ₹299/mo, Studio ₹699/mo)
- [ ] 🔴 `react-native-razorpay` SDK installed and integrated in mobile ✅ Done

### Stripe (International)
- [ ] 🟡 Stripe account activated
- [ ] 🟡 `STRIPE_SECRET_KEY` (live) and `STRIPE_WEBHOOK_SECRET` set
- [ ] 🟡 4 price IDs created and set in env vars
- [ ] 🟡 Webhook registered in Stripe dashboard
- [ ] 🟡 Webhook events enabled: `customer.subscription.*`

### Apple IAP
- [ ] 🔴 IAP products created in App Store Connect (4 products matching SKU map)
- [ ] 🔴 All products in "Ready to Submit" status
- [ ] 🔴 `react-native-iap` installed and integrated in mobile ✅ Done
- [ ] 🔴 Sandbox-tested on real iOS device

### Google Play Billing
- [ ] 🔴 Subscription products created in Google Play Console
- [ ] 🔴 `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` set
- [ ] 🔴 Google Play RTDN webhook configured
- [ ] 🔴 Sandbox-tested on real Android device

---

## 4. AI SERVICE

- [ ] 🔴 Audio analysis returns correct BPM, key, chords for a test song
- [ ] 🔴 MIDI file is generated and uploaded to R2
- [ ] 🔴 Analysis completes in <5 minutes for a 3-minute song
- [ ] 🟡 Realtime chord detection responds in <3 seconds to a 500ms chunk
- [ ] 🟡 YouTube analysis works (yt-dlp available in production environment)
- [ ] 🟡 GPU utilization configured if available (`USE_GPU=true`)

---

## 5. MOBILE APP

### Build
- [ ] 🔴 `eas.json` `projectId` updated from placeholder to real Expo project UUID
- [ ] 🔴 `eas.json` `appleId` and `ascAppId` updated from placeholders
- [ ] 🔴 `EXPO_PUBLIC_API_URL` set to production API URL in EAS production profile
- [ ] 🔴 `eas build --platform ios --profile production` succeeds
- [ ] 🔴 `eas build --platform android --profile production` succeeds
- [ ] 🟡 `EXPO_PUBLIC_SENTRY_DSN` set in EAS production profile
- [ ] 🟡 `EXPO_PUBLIC_PROJECT_ID` set in EAS production profile

### Push Notifications
- [ ] 🔴 Push notification permission appears on first login
- [ ] 🔴 Token is saved to backend (check `User.pushToken` in DB)
- [ ] 🔴 Analysis complete push delivered within 1 minute of completion
- [ ] 🔴 Deep link from notification opens the correct analysis screen ✅ Done

### Core Features — End-to-End Test
- [ ] 🔴 Register new account → onboarding → home screen
- [ ] 🔴 Upload MP3 → analysis queued → push received → result correct
- [ ] 🔴 Tuner opens, detects pitch on real device
- [ ] 🔴 Live chord detection starts session, detects chords
- [ ] 🔴 AI Tutor responds (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
- [ ] 🔴 Notifications screen shows analysis_complete notification
- [ ] 🔴 Subscribe to Pro plan (sandbox) → plan badge updates
- [ ] 🔴 Restore purchases works after reinstall

### Devices to Test
- [ ] 🔴 iPhone (iOS 16+, real device)
- [ ] 🔴 iPhone (iOS 17+, real device)
- [ ] 🔴 Android (API 30+, real device)
- [ ] 🔴 Android (API 34, real device)

---

## 6. BACKEND

- [ ] 🔴 `GET /healthz` returns 200
- [ ] 🔴 `POST /api/v1/auth/register` creates user + returns token
- [ ] 🔴 `POST /api/v1/uploads/file` uploads to R2 and queues analysis
- [ ] 🔴 Analysis worker processes job and writes results to DB
- [ ] 🔴 `POST /api/v1/subscriptions/webhooks/stripe` returns 200 (tested with Stripe CLI)
- [ ] 🔴 `POST /api/v1/subscriptions/webhooks/razorpay` returns 200
- [ ] 🟡 All Swagger docs accessible at `/docs`
- [ ] 🟡 No TypeScript errors: `npm run build` succeeds in CI
- [ ] 🟡 All tests pass: `npm test` in CI

---

## 7. STORE READINESS

### App Store (iOS)
- [ ] 🔴 App icon 1024×1024 PNG (no alpha)
- [ ] 🔴 Screenshots: 5× iPhone 6.7" (1290×2796)
- [ ] 🔴 Screenshots: 5× iPhone 6.5" (1242×2688)
- [ ] 🔴 App description written (≤4000 chars)
- [ ] 🔴 Keywords set (≤100 chars)
- [ ] 🔴 Privacy policy URL live
- [ ] 🔴 Test account in App Review notes
- [ ] 🔴 App Review notes explain audio/mic usage
- [ ] 🟡 App preview video (15–30 seconds)

### Google Play
- [ ] 🔴 Feature graphic 1024×500
- [ ] 🔴 App icon 512×512 PNG (32-bit with alpha)
- [ ] 🔴 Screenshots: 2–8 phone screenshots
- [ ] 🔴 Short description (≤80 chars)
- [ ] 🔴 Full description (≤4000 chars)
- [ ] 🔴 Content rating questionnaire complete
- [ ] 🔴 Data Safety form complete
- [ ] 🔴 Privacy policy URL live

---

## 8. MONITORING

- [ ] 🟡 `SENTRY_DSN` set in backend Railway env
- [ ] 🟡 `EXPO_PUBLIC_SENTRY_DSN` set in mobile EAS env
- [ ] 🟡 `SENTRY_DSN` set in AI service Railway env
- [ ] 🟡 `@sentry/node` installed in backend
- [ ] 🟡 `@sentry/react-native` installed in mobile
- [ ] 🟡 `sentry-sdk` installed in AI service
- [ ] 🟢 Uptime monitor configured (BetterStack or Railway)
- [ ] 🟢 Alert configured for `/healthz` failure
- [ ] 🟢 Alert configured for 5xx error rate >1%
- [ ] 🟢 Alert configured for BullMQ queue depth >50

---

## 9. BACKUP STRATEGY

- [ ] 🔴 PostgreSQL daily automatic backup enabled (Railway Pro)
- [ ] 🟡 Manual snapshot taken before each deployment
- [ ] 🟡 R2 bucket versioning enabled (optional — audio files are re-uploadable)

### Restore Procedure
```bash
# 1. Download backup from Railway dashboard
# 2. Create fresh DB: railway run psql $DATABASE_URL -c "CREATE DATABASE wilsify_restore"
# 3. Restore: pg_restore -d $DATABASE_URL_RESTORE backup.dump
# 4. Verify: railway run node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.user.count().then(console.log)"
```

---

## 10. ROLLBACK STRATEGY

### Backend
```bash
# Railway: redeploy previous deployment from dashboard
# Or via CLI:
railway rollback --service wilsify-backend
```

### Mobile
```bash
# For OTA-patchable JS changes:
eas update --branch production --rollback-to-embedded

# For native changes (requires new binary):
# Update versionCode/buildNumber and submit new build
```

### Database Schema Rollback
```bash
# If a migration must be undone:
npx prisma migrate resolve --rolled-back <migration_name>
# Then manually reverse the schema changes and create a new migration
```

---

## Release Sign-Off

| Role | Sign-Off | Date |
|------|----------|------|
| Engineering | ☐ | |
| QA | ☐ | |
| Product | ☐ | |
| Security | ☐ | |

**All BLOCKER items must be checked before this sign-off is valid.**
