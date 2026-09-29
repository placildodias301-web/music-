# Wilsify AI — Environment Variables

**Date**: June 16, 2026  
**Phase**: 6 — Beta Blockers  
**Status**: Script created; production values required

---

## Validation Script

**Location**: `backend/scripts/validate-production-env.ts`

Run before deploying to production:
```bash
cd backend
npx tsx scripts/validate-production-env.ts
```

Checks 20+ variables for presence, format, length, and placeholder values. Exits 1 on any BLOCKER.

---

## Backend Environment Variables

### Required (will crash if missing)

| Variable | Minimum | Notes |
|----------|---------|-------|
| `DATABASE_URL` | 1 char | PostgreSQL connection string |
| `REDIS_URL` | 1 char | Redis connection string |
| `JWT_SECRET` | 32 chars | Must be unique per environment |
| `JWT_REFRESH_SECRET` | 32 chars | Must differ from JWT_SECRET |

### Required for Production Features

| Variable | Feature | Notes |
|----------|---------|-------|
| `R2_ACCOUNT_ID` | File uploads | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | File uploads | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | File uploads | Cloudflare R2 |
| `R2_PUBLIC_URL` | Public file URLs | e.g. `https://cdn.wilsify.ai` |
| `RAZORPAY_KEY_ID` | Android payments | Razorpay live key |
| `RAZORPAY_KEY_SECRET` | Android payments | Razorpay live secret |
| `RAZORPAY_WEBHOOK_SECRET` | Android webhooks | From Razorpay dashboard |
| `AI_SERVICE_URL` | Analysis | e.g. `https://ai.wilsify.ai` |
| `AI_SERVICE_SECRET` | AI auth | 32+ char shared secret |
| `ANTHROPIC_API_KEY` | AI Tutor (Claude) | OR use OPENAI_API_KEY |
| `EXPO_ACCESS_TOKEN` | Push notifications | Expo push service |
| `ALLOWED_ORIGINS` | CORS | Comma-separated origins |

### Optional (degrade gracefully if absent)

| Variable | Feature |
|----------|---------|
| `RESEND_API_KEY` | Transactional email |
| `STRIPE_SECRET_KEY` | Stripe payments (international) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks |
| `STRIPE_*_PRICE_ID` | Stripe product IDs (4 vars) |
| `OPENAI_API_KEY` | AI Tutor fallback |
| `SENTRY_DSN` | Error monitoring |

---

## Mobile Environment Variables (EAS)

Set in the Expo dashboard for the `production` build profile.

| Variable | Value |
|----------|-------|
| `EXPO_PUBLIC_API_URL` | `https://api.wilsify.ai` |
| `EXPO_PUBLIC_PROJECT_ID` | Expo project UUID |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | `rzp_live_...` |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for mobile |

---

## AI Service Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `APP_ENV` | Yes | `production` to restrict CORS |
| `ALLOWED_ORIGINS` | Yes | Backend API URL |
| `R2_ACCOUNT_ID` | Yes | For MIDI/PDF upload |
| `R2_ACCESS_KEY_ID` | Yes | |
| `R2_SECRET_ACCESS_KEY` | Yes | |
| `R2_BUCKET_NAME` | Yes | |
| `AI_SERVICE_SECRET` | Yes | Must match backend |
| `SENTRY_DSN` | Optional | Error monitoring |

---

## Security Validations

The `validate-production-env.ts` script checks:

1. **JWT_SECRET length** ≥ 64 characters (below 64 is technically valid but weak)
2. **JWT_SECRET ≠ JWT_REFRESH_SECRET** (common misconfiguration)
3. **No placeholder values** — rejects values starting with `your_`, `YOUR_`, `changeme`, `example`
4. **DATABASE_URL format** — must start with `postgresql://` or `postgres://`
5. **REDIS_URL format** — must start with `redis://` or `rediss://`
6. **ALLOWED_ORIGINS** — must not contain `localhost` in production

---

## `.env.example` Reference

```env
DATABASE_URL=
REDIS_URL=redis://localhost:6379

JWT_SECRET=                        # generate: openssl rand -hex 64
JWT_REFRESH_SECRET=                # generate: openssl rand -hex 64

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=wilsify-uploads
R2_PUBLIC_URL=

RESEND_API_KEY=

AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_SECRET=                 # generate: openssl rand -hex 32

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_ANNUAL_PRICE_ID=
STRIPE_STUDIO_MONTHLY_PRICE_ID=
STRIPE_STUDIO_ANNUAL_PRICE_ID=

ANTHROPIC_API_KEY=
OPENAI_API_KEY=

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_PACKAGE_NAME=ai.wilsify.app

EXPO_ACCESS_TOKEN=

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081

SENTRY_DSN=
```

---

## Generating Secrets

```bash
# JWT secrets (64 hex chars = 256 bits)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# AI service secret (32 hex chars = 128 bits)
AI_SERVICE_SECRET=$(openssl rand -hex 32)

# Verify lengths
echo -n "$JWT_SECRET" | wc -c        # must be 128
echo -n "$JWT_REFRESH_SECRET" | wc -c # must be 128
echo -n "$AI_SERVICE_SECRET" | wc -c  # must be 64
```

---

## Status

- [x] `backend/scripts/validate-production-env.ts` created
- [x] All required variables documented in `.env.example`
- [x] Security validation logic (length, uniqueness, placeholder detection)
- [ ] Script run against production environment
- [ ] All production secrets generated and stored in Railway env
- [ ] `.env` not committed (verify: `git log --all -- "**/.env"`)
