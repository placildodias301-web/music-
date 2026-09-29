# Wilsify AI — Deployment

> **First time deploying this project?** This document is a condensed reference that assumes some familiarity with Railway (Nixpacks builds) and Expo/EAS. For a fully-explained, step-by-step walkthrough that assumes none of that, use [MAC_DEPLOYMENT_GUIDE.md](MAC_DEPLOYMENT_GUIDE.md) (full stack) or [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md) (mobile only) instead.

---

## Before You Begin

This guide assumes:
- You already have accounts for the services you intend to use: [Railway](https://railway.app) (backend + AI service hosting), [Vercel](https://vercel.com) (web dashboard hosting), [Cloudflare](https://dash.cloudflare.com) (R2 object storage), and [Expo](https://expo.dev) (mobile builds via EAS). Every one of these has a free tier sufficient to get started.
- You have cloned this repository and have a terminal open at its root.
- "Production" and "local development" are separate concerns below — you do not need Railway/Vercel accounts to run the project on your own machine (see **Development**), only to deploy it publicly (see **Production**).

**Suggested order for a first production deployment** (each step depends on the ones before it):
1. Provision PostgreSQL and Redis (**Database**, **Redis** sections below) — the backend cannot start without a `DATABASE_URL`.
2. Create the Cloudflare R2 bucket (**Cloudflare R2** section) — uploads and analysis results have nowhere to be stored without it.
3. Deploy the AI service, then the backend (**AI Service**, **Backend — Railway** sections) — the backend calls the AI service, so both need to exist before either is useful; they also share the `AI_SERVICE_SECRET` value.
4. Run database migrations against production (**Database** section) — the schema must exist before the backend can serve requests.
5. Deploy the web dashboard (**Web Dashboard — Vercel** section) — it needs the backend's public URL, so deploy the backend first.
6. Configure payment providers and mobile builds last (**Mobile App — App Stores** section) — these are the slowest steps (KYC, app review) and unrelated to whether the core app works.

Skipping ahead (e.g. building the mobile app before the backend has a stable URL) is not harmful, but you will end up re-entering environment variables once the URL is known — doing it in this order avoids rework.

## Development

### Prerequisites

- Node.js 22+ (backend, web-app)
- Node.js 22 (mobile app — not 24)
- Python 3.11 (exactly — `basic-pitch`'s pinned `tensorflow<2.15.1` has no Python 3.12 wheels; verified via `pip install --dry-run` on 2026-08-15, see docs/FINAL_AUDIT_REPORT.md)
- PostgreSQL 16, Redis 7 — installed and running locally. No Docker required.
- LilyPond (optional, for sheet music)

### Start infrastructure

```bash
# Make sure PostgreSQL 16 and Redis 7 are running locally, then run the
# one-shot bootstrap script from the repo root:
./setup.sh
```

### Backend

```bash
cd backend
cp .env.example .env       # fill in secrets (see ENVIRONMENT.md)
npm install
npm run db:generate        # generates Prisma client from schema
npm run db:migrate         # applies migrations to the dev DB
npm run dev                # tsx watch — hot reload on :4000
```

### AI Service

```bash
cd ai-service
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Start FastAPI
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# In a separate terminal — fast Celery worker
celery -A celery_app worker --queues fast_queue --concurrency 2 --loglevel info

# In a third terminal — slow Celery worker (stems/sheet)
celery -A celery_app worker --queues slow_queue --concurrency 1 --loglevel info
```

### Web Dashboard

```bash
cd web-app
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000
# Set NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
npm install
npm run dev                # starts on :3000
```

### Mobile App

```bash
cd mobile_app
npm install
# Place font files in assets/fonts/ (see mobile_app/README.md)
npx expo start             # i=iOS simulator, a=Android, scan QR for real device
```

For a real device, use your machine's local IP (not `localhost`) in `mobile_app/.env`.

---

## Production

### Backend — Railway

The backend is deployed to Railway using **Nixpacks** (see `backend/railway.json`, `"builder": "NIXPACKS"`) — Railway builds directly from `package.json`, it does not use a Dockerfile. `backend/Dockerfile` was a leftover from an earlier Docker-based setup and has been removed; it was not part of the actual deploy path.

**One-time setup:**

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Create a new project (if you don't have one yet): `railway init` from the repository root, or create one in the [Railway dashboard](https://railway.app/dashboard) → New Project. Give it any name (e.g. `wilsify-ai`) — this becomes the container for all your services (backend, AI service, PostgreSQL, Redis).
4. Link this local checkout to that project: `railway link` (prompts you to pick the project you just created)
5. Add PostgreSQL and Redis to the project from the Railway dashboard: **New** → **Database** → **Add PostgreSQL**, then **New** → **Database** → **Add Redis**. Railway provisions these automatically and generates `DATABASE_URL` / `REDIS_URL` for you — copy those into the backend service's variables rather than typing them by hand.

**Deploy:**

```bash
cd backend
railway up --service wilsify-backend
```

Or push to `main` — GitHub Actions runs `backend-ci.yml` which deploys automatically after tests pass.

**Startup sequence** (see `backend/railway.json` → `deploy.startCommand`):

```bash
npm run db:migrate:deploy && npm start
```

Migrations run before the server starts. This ensures the DB schema is always in sync with the deployed code.

**Environment variables on Railway:**

Set via Railway dashboard or CLI:
```bash
railway variables set JWT_SECRET=... JWT_REFRESH_SECRET=... DATABASE_URL=... REDIS_URL=...
```

All required variables are listed in [ENVIRONMENT.md](ENVIRONMENT.md).

**Health check:**

```
GET /health
```

`railway.json` configures a healthcheck (`healthcheckPath: /health`) that Railway polls after each deploy.

---

### Web Dashboard — Vercel

```bash
# Install Vercel CLI
npm install -g vercel

cd web-app
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard and configure automatic deployments from `main`.

**Vercel environment variables** (set in project settings):

```
NEXT_PUBLIC_API_URL=https://api.wilsify.ai
NEXT_PUBLIC_SOCKET_URL=https://api.wilsify.ai
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

---

### Landing Page — GitHub Pages

The `web/` directory is automatically deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`. No manual steps required.

---

### AI Service — Railway or Self-hosted

#### Railway

```bash
cd ai-service
railway up --service wilsify-ai-service
```

**Required environment variables:**
```
APP_ENV=production
AI_SERVICE_SECRET=<same as backend>
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=https://pub-xxx.r2.dev
CELERY_BROKER_URL=redis://...
CELERY_RESULT_BACKEND=redis://...
ANTHROPIC_API_KEY=sk-ant-...
BACKEND_URL=https://api.wilsify.ai
BACKEND_INTERNAL_SECRET=<same as AI_SERVICE_SECRET>
```

#### Self-hosting without Railway

This project targets Railway (Nixpacks) and does not ship a Docker/Compose setup. To self-host on your own server instead, run the same commands Railway runs (`ai-service/railway.json` → `deploy.startCommand`), under a process manager:

```bash
cd ai-service
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

Manage it with `systemd`, `pm2`, or `supervisord` so it restarts on crash/reboot.

---

### Database — Railway PostgreSQL

Railway provides a managed PostgreSQL 16 instance with automated daily backups.

```bash
# Create database service in Railway dashboard, then:
railway variables set DATABASE_URL=postgresql://...
```

Run migrations against production:

```bash
cd backend
DATABASE_URL=postgresql://... npx prisma migrate deploy
```

See [BACKUP_STRATEGY.md](BACKUP_STRATEGY.md) for backup and restore procedures.

---

### Redis — Railway Redis

Railway provides managed Redis. Add the service in the Railway dashboard and set:

```bash
railway variables set REDIS_URL=redis://...
```

For self-hosting, install Redis 7 directly and enable AOF persistence (`appendonly yes` in `redis.conf`) so queued jobs survive a restart.

---

### Cloudflare R2

R2 is used for all object storage (audio files, MIDI, PDFs, stems). Railway's filesystem is ephemeral — anything written to local disk is lost on every redeploy or restart — so uploaded audio and generated files must live in object storage rather than on the container itself. R2 was chosen over S3 because it has zero egress fees, which matters here since every analysis result (MIDI, PDF, stems) is downloaded by the client after generation.

**Setup:**

1. Create a Cloudflare account
2. Go to R2 → Create bucket → name: `wilsify-uploads`
3. Create R2 API token with read/write access
4. Enable public access on the bucket (or use a custom domain)
5. Set environment variables:
   ```
   R2_ACCOUNT_ID=<Cloudflare account ID>
   R2_ACCESS_KEY_ID=<R2 access key>
   R2_SECRET_ACCESS_KEY=<R2 secret key>
   R2_BUCKET_NAME=wilsify-uploads
   R2_PUBLIC_URL=https://pub-xxx.r2.dev
   ```

See [BACKUP_STRATEGY.md](BACKUP_STRATEGY.md) for versioning and offsite backup recommendations.

---

### SSL

- **Railway:** TLS is automatically provisioned for all deployed services.
- **Vercel:** TLS is automatic.
- **GitHub Pages:** TLS is automatic.
- **Self-hosted:** Use Caddy or Nginx with Certbot for Let's Encrypt.

---

### Monitoring

| Tool | Setup |
|---|---|
| Sentry (backend) | Set `SENTRY_DSN` in backend env; install `@sentry/node` |
| Sentry (web) | Set `NEXT_PUBLIC_SENTRY_DSN`; handled by `web-app/src/lib/sentry.ts` |
| PostHog (web) | Set `NEXT_PUBLIC_POSTHOG_KEY`; handled by `AnalyticsProvider` |
| Sentry (AI service) | Set `SENTRY_DSN` in AI service env; install `sentry-sdk` |
| Railway metrics | Built-in CPU/memory/request graphs in Railway dashboard |

---

### Scaling

**Backend:**

BullMQ analysis workers run in-process with the Fastify server (`backend/src/index.ts`). Concurrency is set to 2. For higher throughput, increase `concurrency` in `createAnalysisWorker` or deploy multiple Railway replicas (each will pull from the shared Redis queue independently).

**AI Service:**

- `fast_queue` workers: scale by running more Celery workers with `--concurrency 2`
- `slow_queue` workers: limited by RAM (Demucs needs ~4 GB per concurrent job)
- For GPU, provision a GPU instance and set `USE_GPU=true`

**Database:**

Railway PostgreSQL scales vertically. Add read replicas for high-read workloads (connection string points to replica for read-only queries).

---

## Mobile App — App Stores

```bash
cd mobile_app

# Install EAS CLI
npm install -g eas-cli
eas login

# Android — preview APK (for testers)
eas build --platform android --profile preview

# Android — Play Store
eas build --platform android --profile production
eas submit --platform android

# iOS — TestFlight (requires Apple Developer account)
eas build --platform ios --profile production
eas submit --platform ios
```

Before building, ensure:
- Font files are in `mobile_app/assets/fonts/`
- App icon and splash screen are in `mobile_app/assets/images/`
- `mobile_app/.env` has production API URLs

---

## Deployment Checklist

- [ ] All required environment variables set (see [ENVIRONMENT.md](ENVIRONMENT.md))
- [ ] `prisma migrate deploy` run against production database
- [ ] Railway automated backups enabled on PostgreSQL service
- [ ] Redis AOF persistence active (`redis-cli CONFIG GET appendonly` → `yes`)
- [ ] `AI_SERVICE_SECRET` set on both backend and AI service (same value)
- [ ] Stripe webhook URL configured: `https://api.wilsify.ai/api/v1/subscriptions/webhooks/stripe`
- [ ] Razorpay webhook URL configured: `https://api.wilsify.ai/api/v1/subscriptions/webhooks/razorpay`
- [ ] CORS `ALLOWED_ORIGINS` set to production frontend domain
- [ ] `APP_URL` set to production frontend URL (used in email links)
- [ ] Sentry DSN configured for error reporting
- [ ] Health check passing: `curl https://api.wilsify.ai/health`

---

## Related Documents

- [MAC_DEPLOYMENT_GUIDE.md](MAC_DEPLOYMENT_GUIDE.md) — beginner, step-by-step version of this guide
- [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md) — mobile-specific beginner guide
- [ENVIRONMENT.md](ENVIRONMENT.md) — every environment variable referenced above
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — the operational checklist for going live
- [../README.md](../README.md) — documentation map
