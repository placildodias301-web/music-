# Wilsify AI — Environment Variables

---

## Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in the values.

### Server

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Set to `production` in production |
| `PORT` | No | `4000` | HTTP server port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | No | `info` | Pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

### Database

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string: `postgresql://user:pass@host:5432/dbname` |

### Redis

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string (BullMQ queue + tutor counters) |

### JWT

Generate secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

| Variable | Required | Minimum | Purpose |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | 32 chars | Access token signing secret |
| `JWT_REFRESH_SECRET` | **Yes** | 32 chars | Refresh token signing secret |
| `JWT_ACCESS_EXPIRES` | No | — | Access token TTL (default: `15m`) |
| `JWT_REFRESH_EXPIRES` | No | — | Refresh token TTL (default: `30d`) |

### Cloudflare R2

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `R2_ACCOUNT_ID` | For uploads | — | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | For uploads | — | R2 API access key |
| `R2_SECRET_ACCESS_KEY` | For uploads | — | R2 API secret key |
| `R2_BUCKET_NAME` | No | `wilsify-uploads` | R2 bucket name |
| `R2_PUBLIC_URL` | For uploads | — | Public CDN base URL, e.g. `https://pub-xxx.r2.dev` |

### Email (Resend)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `RESEND_API_KEY` | For email | — | Resend API key (starts with `re_`) |
| `FROM_EMAIL` | No | `noreply@wilsify.ai` | Sender address for transactional emails |

### AI Service

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AI_SERVICE_URL` | No | `http://localhost:8000` | Internal URL of the AI service |
| `AI_SERVICE_SECRET` | **Yes (production)** | — | Shared secret passed in `X-Internal-Secret` header; `process.exit(1)` on startup if unset in production |

### AI Providers (for Tutor)

At least one is required to enable real AI tutor responses. Falls back to a mock response if neither is set.

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | For tutor | Claude API key — uses `claude-haiku-4-5-20251001` |
| `OPENAI_API_KEY` | For tutor (fallback) | OpenAI API key — uses `gpt-4o-mini` |

### Payments — Razorpay (India)

| Variable | Required | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | For Razorpay | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | For Razorpay | Razorpay key secret (also used for webhook HMAC verification) |

### Payments — Stripe (International)

| Variable | Required | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | For Stripe | Stripe secret key (starts with `sk_`) |
| `STRIPE_WEBHOOK_SECRET` | For Stripe webhooks | Webhook signing secret (starts with `whsec_`) |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | For PRO plan | Stripe Price ID for PRO monthly |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | For PRO annual | Stripe Price ID for PRO annual |
| `STRIPE_STUDIO_MONTHLY_PRICE_ID` | For STUDIO plan | Stripe Price ID for STUDIO monthly |
| `STRIPE_STUDIO_ANNUAL_PRICE_ID` | For STUDIO annual | Stripe Price ID for STUDIO annual |

### Payments — Apple IAP

| Variable | Required | Purpose |
|---|---|---|
| `APPLE_IAP_SHARED_SECRET` | For Apple IAP | App Store Connect → Apps → App Information → Shared Secret |

### Payments — Google Play

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | For Google Play | Full JSON of the service account key file (as a single-line string) |

### Mobile

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_ACCESS_TOKEN` | For push notifications | Expo push notification service token |

### Observability

| Variable | Required | Purpose |
|---|---|---|
| `SENTRY_DSN` | No | Sentry DSN for error reporting |
| `METRICS_SECRET` | No | Bearer token protecting `GET /metrics` (Prometheus scrape); if unset, endpoint is loopback-only |

### CORS / App URL

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ALLOWED_ORIGINS` | No | `http://localhost:3000,http://localhost:8081` | Comma-separated list of allowed CORS origins |
| `APP_URL` | No | `https://app.wilsify.ai` | Frontend URL used in email links (password reset, email verification) |

---

## Web App (`web-app/.env.local`)

Copy `web-app/.env.example` to `web-app/.env.local` and fill in values.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | Backend base URL, e.g. `https://api.wilsify.ai` |
| `NEXT_PUBLIC_SOCKET_URL` | No | Socket.IO server URL (defaults to `http://localhost:4000`) |
| `NEXT_PUBLIC_APP_URL` | No | Frontend URL used in OG tags (e.g. `https://app.wilsify.ai`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog analytics project API key |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | PostHog host, e.g. `https://app.posthog.com` |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for browser error tracking |

---

## AI Service (`ai-service/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `APP_ENV` | No | `development` | Set to `production` to enable secret validation at startup |
| `PORT` | No | `8000` | HTTP server port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | No | `info` | Python logging level |
| `AI_SERVICE_SECRET` | **Yes (production)** | — | Shared secret for `X-Internal-Secret` header; `sys.exit(1)` if unset in production |
| `R2_ACCOUNT_ID` | For file upload | — | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | For file upload | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | For file upload | — | R2 secret key |
| `R2_BUCKET_NAME` | No | `wilsify-uploads` | R2 bucket |
| `R2_PUBLIC_URL` | For file upload | — | Public CDN base URL |
| `CELERY_BROKER_URL` | No | `redis://localhost:6379/0` | Celery broker (Redis DB 0) |
| `CELERY_RESULT_BACKEND` | No | `redis://localhost:6379/1` | Celery results (Redis DB 1) |
| `ANTHROPIC_API_KEY` | For tutor | — | Claude API key |
| `OPENAI_API_KEY` | For tutor (fallback) | — | OpenAI API key |
| `BACKEND_URL` | For Celery callbacks | — | Fastify URL for async result callbacks |
| `BACKEND_INTERNAL_SECRET` | For callbacks | — | Same value as `AI_SERVICE_SECRET` on backend |
| `ENABLE_STEMS` | No | `true` | Toggle Demucs stem separation |
| `ENABLE_SHEET` | No | `true` | Toggle LilyPond sheet music PDF |
| `ENABLE_TUTOR` | No | `true` | Toggle AI tutor endpoint |
| `USE_GPU` | No | `false` | Enable CUDA for Demucs |
| `MAX_AUDIO_DURATION_SECONDS` | No | `600` | Maximum audio duration (seconds) |
| `MAX_AUDIO_SIZE_BYTES` | No | `104857600` | Maximum audio file size (100 MB) |
| `LILYPOND_PATH` | No | auto-detect | Path to LilyPond binary |
| `MODAL_TOKEN_ID` | No | — | Modal GPU cloud token (Phase 3+ future feature) |
| `MODAL_TOKEN_SECRET` | No | — | Modal GPU cloud secret |
| `SENTRY_DSN` | No | — | Sentry DSN for error reporting |

---

## Mobile App (`mobile_app/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | **Yes** | `http://localhost:4000` | Backend API base URL |
| `EXPO_PUBLIC_WS_URL` | No | Same as API URL | WebSocket URL for Socket.IO |
| `EXPO_PUBLIC_AI_URL` | No | `http://localhost:8000` | AI service URL (for direct features if any) |

For real device testing, replace `localhost` with your machine's local IP:

```bash
# Mac
ifconfig | grep "inet "

# Windows
ipconfig
```

---

## Local Infrastructure Variables

Variables read from the host environment or a `.env` file in the project root, used when running PostgreSQL/Redis natively (this project does not use Docker):

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | `wilsify_dev` | PostgreSQL password for local dev |
| `AI_SERVICE_SECRET` | `dev-secret` | Internal API secret |
| `R2_ACCOUNT_ID` | — | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | — | R2 key |
| `R2_SECRET_ACCESS_KEY` | — | R2 secret |
| `R2_BUCKET_NAME` | `wilsify-uploads` | R2 bucket |
| `R2_PUBLIC_URL` | — | R2 public CDN URL |
| `ANTHROPIC_API_KEY` | — | Claude API key |
| `OPENAI_API_KEY` | — | OpenAI fallback |
| `BACKEND_URL` | — | Fastify URL for Celery callbacks |
| `BACKEND_INTERNAL_SECRET` | — | Same as `AI_SERVICE_SECRET` |

---

## Secrets Generation Reference

```bash
# 64-byte hex secret (use for JWT_SECRET, JWT_REFRESH_SECRET, AI_SERVICE_SECRET)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Python equivalent
python -c "import secrets; print(secrets.token_hex(64))"

# Verify Stripe webhook secret — from Stripe dashboard:
# Developers → Webhooks → select endpoint → Signing secret → Reveal
```

---

## Related Documents

- [DEPLOYMENT.md](DEPLOYMENT.md) — where these variables are set per environment
- [../architecture/API.md](../architecture/API.md) — endpoints that consume these variables
- [../README.md](../README.md) — documentation map
