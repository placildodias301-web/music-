# Wilsify AI — Production Deployment Guide

**Date**: June 2026  
**Phases**: 4 (Initial) + 5 (Validation) + 6 (Final Audit)  
**Platform**: Railway (backend + AI service), Expo EAS (mobile), GitHub Pages (web)  
**Go/No-Go**: CONDITIONAL GO — blocked by operational setup only

---

## Launch Blockers

| # | Blocker | Severity | Status |
|---|---------|----------|--------|
| 1 | Railway backend not provisioned | 🔴 P0 | ⏳ Pending |
| 2 | PostgreSQL not provisioned | 🔴 P0 | ⏳ Pending |
| 3 | Redis not provisioned | 🔴 P0 | ⏳ Pending |
| 4 | Cloudflare R2 bucket not created | 🔴 P0 | ⏳ Pending |
| 5 | AI service not deployed | 🔴 P0 | ⏳ Pending |
| 6 | JWT secrets are defaults (not generated) | 🔴 P0 | ⏳ Pending |
| 7 | EAS projectId is placeholder | 🔴 P0 | ⏳ Pending |
| 8 | Apple ID + ASC app ID missing from eas.json | 🔴 P0 | ⏳ Pending |
| 9 | Razorpay live account not activated (KYC) | 🔴 P0 | 1–5 days |
| 10 | Apple IAP products not created in App Store Connect | 🔴 P0 | ⏳ Pending |
| 11 | EAS production builds not submitted | 🔴 P0 | ⏳ Pending |
| 12 | `pushToken` field migration not run in production | 🔴 P0 | ⏳ Pending (migration file exists) |

---

## Required Accounts and Services

| Service | Cost | Purpose |
|---------|------|---------|
| Railway (Hobby plan) | ~$5/month | Backend API hosting |
| Railway (Hobby plan) | ~$5/month | AI service hosting |
| PostgreSQL (Railway plugin) | ~$5/month | Primary database |
| Redis (Upstash free or Railway) | Free–$5/month | BullMQ queue + idempotency |
| Cloudflare R2 | ~$0.015/GB | Audio file storage |
| Expo EAS | Free (500 builds/month) | Mobile builds |
| Apple Developer | $99/year | App Store + APNs |
| Google Play | $25 one-time | Google Play Store |
| Razorpay | 2% fee | India payments |
| Resend | Free (100 emails/day) | Transactional email |

**Estimated infrastructure cost:**
- 100 active users: ~$123/month
- 1,000 active users: ~$484/month (Railway scale-out + R2 egress)

---

## 1. Generate Secrets

Run these commands locally before setting any Railway env vars:

```bash
# JWT secrets (must be distinct)
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 64   # → JWT_REFRESH_SECRET

# Internal service secret (shared between backend and AI service)
openssl rand -hex 32   # → AI_SERVICE_SECRET

# One-time token for email reset
openssl rand -hex 32   # → RESET_TOKEN_SECRET
```

---

## 2. Cloudflare R2 Setup

### 2.1 Create Bucket
1. Log into Cloudflare dashboard → R2 → Create bucket
2. Bucket name: `wilsify-audio` (or your preference)
3. Region: auto

### 2.2 Generate API Token
1. R2 → Manage R2 API Tokens → Create API Token
2. Permissions: Object Read & Write
3. Save `Access Key ID` → `R2_ACCESS_KEY_ID`
4. Save `Secret Access Key` → `R2_SECRET_ACCESS_KEY`
5. Save `Account ID` from R2 overview page → `R2_ACCOUNT_ID`

### 2.3 Enable Public Access
1. Bucket → Settings → Public Access → Allow Access
2. Custom Domain (optional): `cdn.wilsify.ai` → CNAME to your R2 bucket URL
3. Save URL → `R2_PUBLIC_URL`

### 2.4 CORS Policy
In bucket Settings → CORS, paste:
```json
[
  {
    "AllowedOrigins": ["https://api.wilsify.ai", "https://wilsify.ai"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 3. Backend — Railway Deployment

### 3.1 Create Service
1. Railway → New Project → Deploy from GitHub repo
2. Select `Wilsify Ai` repo → Root Directory: `backend`
3. Railway auto-detects Node.js

### 3.2 `railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### 3.3 Backend Environment Variables

**Required (service fails to start without these):**
```
NODE_ENV=production
DATABASE_URL=postgresql://...        # Railway PostgreSQL plugin
REDIS_URL=redis://...               # Railway Redis or Upstash
JWT_SECRET=<64-char hex>
JWT_REFRESH_SECRET=<64-char hex>
RESET_TOKEN_SECRET=<32-char hex>
R2_ACCOUNT_ID=<from cloudflare>
R2_ACCESS_KEY_ID=<from cloudflare>
R2_SECRET_ACCESS_KEY=<from cloudflare>
R2_BUCKET_NAME=wilsify-audio
R2_PUBLIC_URL=https://cdn.wilsify.ai
AI_SERVICE_URL=https://ai.wilsify.ai
AI_SERVICE_SECRET=<32-char hex>
ALLOWED_ORIGINS=https://wilsify.ai,https://api.wilsify.ai
```

**Required for specific features:**
```
RESEND_API_KEY=re_...               # Forgot-password emails
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_STUDIO_MONTHLY_PRICE_ID=price_...
STRIPE_STUDIO_ANNUAL_PRICE_ID=price_...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
GOOGLE_PACKAGE_NAME=ai.wilsify.app
```

**Optional:**
```
SENTRY_DSN=https://...@sentry.io/...
PORT=4000
```

### 3.4 Add PostgreSQL Plugin
1. Railway project → Add Plugin → PostgreSQL
2. `DATABASE_URL` auto-injected into the service

### 3.5 Add Redis
**Option A** — Railway Redis plugin (simpler):
1. Add Plugin → Redis
2. `REDIS_URL` auto-injected

**Option B** — Upstash (cheaper at scale):
1. upstash.com → Create Database → Regional → US-East-1
2. Copy `REDIS_URL` (`rediss://...`) → set in Railway

### 3.6 Run Database Migrations
```bash
# After service is deployed and DATABASE_URL is set:
railway run npx prisma migrate deploy

# Or connect via Railway shell:
railway shell
npx prisma migrate deploy
```

This applies both migrations:
- `20260616000001_init` — full schema baseline
- `20260616000002_add_push_token` — `User.pushToken` field

### 3.7 Set Custom Domain
1. Railway → Service → Settings → Custom Domains
2. Add `api.wilsify.ai` → Create DNS CNAME record at your domain provider

---

## 4. AI Service — Railway Deployment

### 4.1 Create Service
1. Railway → New Service → GitHub → Root Directory: `ai-service`
2. Set memory to ≥2GB RAM (required for librosa + spleeter)

### 4.2 AI Service Environment Variables
```
AI_SERVICE_SECRET=<same value as backend>
ALLOWED_ORIGINS=https://api.wilsify.ai
ANTHROPIC_API_KEY=sk-ant-...          # For AI Tutor
OPENAI_API_KEY=sk-...                 # Fallback for AI Tutor
SENTRY_DSN=https://...               # Optional
PORT=8000
```

### 4.3 AI Service `railway.json`
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pip install -r requirements.txt"
  },
  "deploy": {
    "startCommand": "uvicorn main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 60
  }
}
```

### 4.4 Set Custom Domain
Add `ai.wilsify.ai` in Railway → AI service → Settings → Custom Domains.

---

## 5. Mobile — EAS Configuration

### 5.1 Initialize EAS
```bash
cd mobile-rn
npx eas init          # Creates projectId → update app.json
```

### 5.2 Update app.json
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "<uuid-from-eas-init>"
      }
    }
  }
}
```

### 5.3 Update eas.json (iOS)
```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "1234567890",
        "appleTeamId": "XXXXXXXXXX"
      }
    }
  }
}
```

### 5.4 EAS Environment Variables (Production Profile)
```
EXPO_PUBLIC_API_URL=https://api.wilsify.ai
EXPO_PUBLIC_WS_URL=wss://api.wilsify.ai
EXPO_PUBLIC_PROJECT_ID=<uuid-from-eas-init>
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...
EXPO_PUBLIC_SENTRY_DSN=https://...    # Optional
```

Set via: `eas secret:create --scope project --name NAME --value VALUE`

### 5.5 Build Commands
```bash
# Development build (for internal testing)
eas build --profile development --platform all

# Preview build (for TestFlight/Play internal testing)
eas build --profile preview --platform all

# Production build (for store submission)
eas build --profile production --platform all
```

### 5.6 Submit to Stores
```bash
# iOS — App Store Connect (TestFlight → App Review)
eas submit --platform ios --profile production

# Android — Google Play (Internal Testing → Production)
eas submit --platform android --profile production
```

---

## 6. Webhook URLs to Register

After deploying backend at `https://api.wilsify.ai`, register these in each payment provider's dashboard:

| Provider | Webhook URL |
|----------|------------|
| Razorpay | `https://api.wilsify.ai/api/v1/subscriptions/webhooks/razorpay` |
| Stripe | `https://api.wilsify.ai/api/v1/subscriptions/webhooks/stripe` |
| Apple APNS | `https://api.wilsify.ai/api/v1/subscriptions/webhooks/apple` |
| Google RTDN | `https://api.wilsify.ai/api/v1/subscriptions/webhooks/google` |

---

## 7. Validate Environment

Run the production environment validation script:
```bash
cd backend
npx tsx scripts/validate-production-env.ts
```

Checks performed:
- All required env vars present and non-empty
- JWT_SECRET and JWT_REFRESH_SECRET are at least 32 chars
- DATABASE_URL starts with `postgresql://` or `postgres://`
- REDIS_URL starts with `redis://` or `rediss://`
- AI_SERVICE_URL is reachable (HTTP health check)
- R2 bucket is accessible (SDK connection test)

---

## 8. Deployment Checklist (5-Day Order)

### Day 1 — Infrastructure Provisioning
- [ ] Create Cloudflare R2 bucket + CORS policy
- [ ] Deploy backend to Railway (set all required env vars)
- [ ] Add PostgreSQL + Redis plugins in Railway
- [ ] Run `railway run npx prisma migrate deploy`
- [ ] Verify `GET https://api.wilsify.ai/healthz` returns `{"status":"ok"}`
- [ ] Deploy AI service to Railway (set AI_SERVICE_SECRET, ANTHROPIC_API_KEY)
- [ ] Verify `GET https://ai.wilsify.ai/health` returns `{"status":"ok"}`

### Day 2 — Payments Setup
- [ ] Complete Razorpay KYC (if not already active)
- [ ] Create 4 Apple IAP products in App Store Connect (matching SKU map in [docs/PAYMENTS.md](PAYMENTS.md))
- [ ] Create Stripe webhook endpoint + note webhook secret
- [ ] Register all 4 webhook URLs in each payment provider dashboard

### Day 3 — Mobile Build
- [ ] Run `npx eas init` → update `app.json` projectId
- [ ] Fill Apple ID + ascAppId + teamId in `eas.json`
- [ ] Set all EAS production env secrets
- [ ] Run `eas build --profile production --platform all`
- [ ] Run `eas submit --platform ios --profile production`
- [ ] Run `eas submit --platform android --profile production`

### Day 4 — End-to-End Smoke Test
- [ ] Register new account → verify welcome email arrives
- [ ] Upload MP3 → verify analysis completes → push notification received → tap opens analysis screen
- [ ] Test iOS IAP (sandbox account)
- [ ] Test Android Razorpay (test keys)
- [ ] Cancel subscription → verify `status: "cancelling"` in DB (not FREE)
- [ ] Test forgot password flow

### Day 5 — Pre-Beta Review
- [ ] Run `npx tsx scripts/validate-production-env.ts` (all checks pass)
- [ ] Review [docs/BETA_CHECKLIST.md](BETA_CHECKLIST.md) and mark remaining items
- [ ] Confirm landing page at https://wilsify.ai is live (GitHub Pages deploy)
- [ ] Invite beta testers

---

## 9. Smoke Test Script

```bash
BASE=https://api.wilsify.ai

# 1. Health check
curl -sf $BASE/healthz | jq .

# 2. Register test user
TOKEN=$(curl -sf -X POST $BASE/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234!","displayName":"Smoke Test","instrument":"guitar"}' \
  | jq -r '.token')

echo "Token: $TOKEN"

# 3. Get current user
curl -sf $BASE/api/v1/users/me -H "Authorization: Bearer $TOKEN" | jq .

# 4. Get credits
curl -sf $BASE/api/v1/credits -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 10. CI/CD — GitHub Actions

### Backend Deploy (`.github/workflows/deploy-backend.yml`)
```yaml
name: Deploy Backend
on:
  push:
    branches: [main]
    paths: ["backend/**"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: cd backend && npm ci && npm run build
      - name: Deploy to Railway
        run: npx railway up --service backend
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### Mobile OTA Update (`.github/workflows/eas-update.yml`)
```yaml
name: EAS Update (OTA)
on:
  push:
    branches: [main]
    paths: ["mobile-rn/**"]

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm install -g eas-cli
      - run: cd mobile-rn && npm ci
      - run: cd mobile-rn && eas update --auto
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

> OTA updates push JS bundle changes to users without requiring a new store submission. Binary changes (native modules) still require a full `eas build + eas submit`.

---

## 11. Scaling

| Component | Current Config | At 1,000 Users | Scaling Action |
|-----------|---------------|----------------|---------------|
| Backend | 1 Railway service | ~50 req/s | Railway horizontal scaling (2+ instances) |
| AI service | 1 Railway service (2GB) | Queue backup | Add BullMQ worker instances |
| PostgreSQL | Railway plugin | 10k connections | PgBouncer + connection pooling |
| Redis | Upstash free | 10k ops/day limit | Upgrade to Upstash Pro |
| R2 | Pay-as-you-go | Linear cost | No config changes needed |
| Socket.IO | Single instance | Session affinity lost | Redis adapter (`@socket.io/redis-adapter`) |

---

## 12. Rollback Procedures

### Backend Rollback
```bash
# Railway maintains deployment history — roll back in dashboard
# Or redeploy previous commit:
git revert HEAD
git push origin main
```

### Database Rollback
```bash
# Prisma does not support automatic down-migrations.
# For the pushToken field (migration 20260616000002):
railway run npx prisma migrate resolve --rolled-back 20260616000002_add_push_token

# Then run the manual SQL:
railway run psql $DATABASE_URL -c "ALTER TABLE users DROP COLUMN IF EXISTS push_token;"
```

### Mobile Rollback (OTA)
```bash
# Roll back OTA update to previous publish:
eas update --branch production --message "rollback" --republish
```

---

## 13. Deployment Validation Results (Phase 5)

These issues were found during Phase 5 validation and have been **resolved in the codebase**. They must still be applied to the production environment before launch:

| # | Issue | File | Status |
|---|-------|------|--------|
| 1 | `pushToken` field missing from DB | `prisma/migrations/20260616000002_add_push_token/` | ✅ Migration file created — run `prisma migrate deploy` |
| 2 | `subscription.status: "cancelling"` not checked on login | `backend/src/services/auth.service.ts` | ✅ Fixed in code |
| 3 | Dual PrismaClient instances | `backend/src/app.ts` + worker | ✅ Fixed — singleton pattern |
| 4 | AI service CORS `allow_origins=["*"]` in production | `ai-service/main.py` | ✅ Fixed — reads from env var |
| 5 | Webhook replay attacks possible | All 4 webhook handlers | ✅ Redis idempotency added |
| 6 | Register rate limit missing | `backend/src/routes/auth/index.ts` | ✅ 5/15min added |
| 7 | Tutor chat rate limit missing | `backend/src/routes/tutor/index.ts` | ✅ 30/min added |
| 8 | EAS `eas.json` iOS placeholders | `mobile-rn/eas.json` | ✅ Fixed — placeholders marked for fill |
| 9 | EAS `app.json` projectId placeholder | `mobile-rn/app.json` | ✅ Marked — requires `eas init` |
| 10 | Dev payment bypass in pricing screen | `mobile-rn/app/pricing/index.tsx` | ✅ Removed — real SDKs wired |

---

## 14. Cost Estimates

### At 100 Active Users
| Service | Monthly Cost |
|---------|-------------|
| Railway Backend | $5 |
| Railway AI Service | $5 |
| Railway PostgreSQL | $5 |
| Upstash Redis | Free |
| Cloudflare R2 (5GB storage + 50GB egress) | ~$1 |
| Resend (emails) | Free |
| Expo EAS | Free |
| **Total** | **~$16–23/month** |

> Plus payment provider fees: Razorpay 2%, Stripe 2.9% + $0.30

### At 1,000 Active Users
| Service | Monthly Cost |
|---------|-------------|
| Railway Backend (2 instances) | $10 |
| Railway AI Service (2+ instances) | $15 |
| Railway PostgreSQL + PgBouncer | $15 |
| Upstash Redis Pro | $10 |
| Cloudflare R2 (50GB + 500GB egress) | ~$10 |
| Resend Pro | $20 |
| **Total** | **~$80–120/month** |

---

## 15. Health Endpoints

| Endpoint | Purpose | Expected response |
|----------|---------|-------------------|
| `GET /health` | Liveness probe (load balancer) | `{ status: "ok", uptime }` |
| `GET /health/database` | PostgreSQL reachability | `{ service: "database", status, latencyMs }` |
| `GET /health/redis` | Redis PING | `{ service: "redis", status, latencyMs }` |
| `GET /health/storage` | R2 credentials presence | `{ service: "storage", status }` |
| `GET /health/workers` | BullMQ queue depths | `{ service: "workers", status, queue: { waiting, active, failed, delayed } }` |
| `GET /health/all` | All checks in parallel | `{ status, checks: { database, redis, storage } }` |

Status codes: `200` for `ok`/`degraded`, `503` for `down`. Set `HEALTH_STORAGE_LIVE=true` to perform a real R2 HEAD request instead of the credential-presence check.

---

## 16. Prometheus Metrics

The backend exposes `/metrics` in Prometheus text format.

**Required env var**: `METRICS_SECRET` — set this to a long random string. If unset, the endpoint is accessible from loopback only.

**Prometheus scrape config:**
```yaml
scrape_configs:
  - job_name: wilsify_backend
    static_configs:
      - targets: ["api.wilsify.ai:3000"]
    authorization:
      credentials: <METRICS_SECRET>
```

**Custom metrics exported:**

| Metric | Type | Labels |
|--------|------|--------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` |
| `wilsify_uploads_total` | Counter | `status` (success/rejected_*) |
| `wilsify_ai_analysis_total` | Counter | `status` (queued/completed/failed) |
| `wilsify_ai_analysis_duration_seconds` | Histogram | `type` (fast/slow/stems/sheet) |
| `wilsify_queue_length` | Gauge | `queue`, `state` (waiting/active/failed/delayed) |
| `wilsify_rate_limit_hits_total` | Counter | `route` |
| `wilsify_auth_events_total` | Counter | `event` |

---

## 17. Staging Environment

### Required GitHub Secrets (staging)

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN_STAGING` | Railway token scoped to the staging project |
| `VERCEL_TOKEN` | Vercel token (shared with production) |
| `VERCEL_ORG_ID` | Vercel org ID |
| `VERCEL_PROJECT_ID` | Vercel project ID for `web-app/` |

### Staging Railway Services

Create two Railway services in a separate staging project:
- `wilsify-backend-staging` — points to `backend/`
- `wilsify-ai-staging` — points to `ai-service/`

Set all the same env vars as production but pointing to staging DB, Redis, and R2 bucket.

### CI/CD Flow

```
push to staging branch
  → backend-ci (type-check + unit + integration tests)
  → webapp-ci (type-check)
  → ai-service-ci (ruff lint)
  → [all pass] → deploy backend/AI to Railway staging + web-app to Vercel preview
```

PRs targeting `main` run all CI jobs but skip the deploy steps (CI-only gate).

---

## 18. Go/No-Go Summary

**CONDITIONAL GO** — All application code is complete and correct. Launch is blocked only by:

1. Provisioning hosting infrastructure (Railway, PostgreSQL, Redis, R2)
2. Running database migrations in production
3. Razorpay KYC activation (1–5 business days — start immediately)
4. Creating Apple IAP products in App Store Connect
5. EAS build + store submission
6. Setting `METRICS_SECRET`, `RAILWAY_TOKEN_STAGING` secrets in GitHub

**Estimated time to launch from a standing start: 5–7 days** (dominated by Razorpay KYC and App Store review).
