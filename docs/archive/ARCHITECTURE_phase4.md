# Wilsify AI — Architecture

## Monorepo Structure

```
Wilsify Ai/
├── mobile-rn/        React Native (Expo) — current shipping app
├── mobile-flutter/   Flutter — future migration target
├── backend/          Fastify API server (Node.js + TypeScript)
├── ai-service/       FastAPI Python — audio analysis (Phase 2)
├── web/              Static landing page (Phase 6 → Next.js)
├── shared/           TypeScript types shared between packages
└── docs/             Architecture + runbooks
```

## Backend Stack

| Concern         | Technology           |
|-----------------|----------------------|
| Runtime         | Node.js 22           |
| Framework       | Fastify 5            |
| Language        | TypeScript 5 (ESM)   |
| ORM             | Prisma 6             |
| Database        | PostgreSQL 16        |
| Cache / Queues  | Upstash Redis / BullMQ |
| Auth            | JWT (access) + opaque refresh tokens |
| File Storage    | Cloudflare R2 (S3-compatible) |
| Email           | Resend               |
| Real-time       | Socket.IO 4          |
| Validation      | Zod                  |
| Logging         | Pino (pino-pretty in dev) |

## Database Schema (Prisma)

```
User ──< RefreshToken
     ──< PasswordReset
     ──< Song ──< Analysis ──< Chord
     ──< CreditLedger
     ──< CommunityPost ──< PostLike
     ──< Notification
     ──  Subscription
```

### Plan tiers

| Plan       | Credits/month | Features                                      |
|------------|---------------|-----------------------------------------------|
| FREE       | 5             | Chord detection, basic tuner                  |
| PRO        | 50            | + MIDI/PDF export, live detect, AI tutor      |
| STUDIO     | Unlimited     | + Stem separation, priority queue             |
| ENTERPRISE | Unlimited     | + All features                                |

## API Routes

All routes under `/api/v1/`

### Auth
| Method | Path                        | Auth | Description             |
|--------|-----------------------------|------|-------------------------|
| POST   | `/auth/register`            | —    | Create account          |
| POST   | `/auth/login`               | —    | Email + password login  |
| POST   | `/auth/logout`              | ✓    | Revoke refresh token    |
| POST   | `/auth/refresh`             | —    | Rotate refresh token    |
| POST   | `/auth/forgot-password`     | —    | Send reset email        |

### Users
| Method | Path        | Auth | Description   |
|--------|-------------|------|---------------|
| GET    | `/users/me` | ✓    | Get profile   |
| PATCH  | `/users/me` | ✓    | Update profile|

### Songs & Analysis
| Method | Path                    | Auth | Description              |
|--------|-------------------------|------|--------------------------|
| GET    | `/songs`                | ✓    | List user's songs        |
| GET    | `/songs/:id`            | ✓    | Get single song          |
| DELETE | `/songs/:id`            | ✓    | Delete song              |
| GET    | `/songs/:id/analysis`   | ✓    | Get analysis results     |
| POST   | `/songs/:id/analyze`    | ✓    | Enqueue analysis job     |

### Uploads
| Method | Path              | Auth | Description               |
|--------|-------------------|------|---------------------------|
| POST   | `/uploads/file`   | ✓    | Upload audio (mp3/wav/…)  |
| POST   | `/uploads/youtube`| ✓    | Import from YouTube URL   |

### Community
| Method | Path                        | Auth | Description       |
|--------|-----------------------------|------|-------------------|
| GET    | `/community/feed`           | ✓    | Get feed/trending |
| POST   | `/community/posts`          | ✓    | Create post       |
| POST   | `/community/posts/:id/like` | ✓    | Toggle like       |

### Credits & Stats
| Method | Path       | Auth | Description        |
|--------|------------|------|--------------------|
| GET    | `/credits` | ✓    | Balance + history  |
| GET    | `/stats`   | ✓    | Songs, hours, credits |

### Utility
| Method | Path      | Auth | Description      |
|--------|-----------|------|------------------|
| GET    | `/health` | —    | Health check     |

## WebSocket Events

Connection: `ws://host:4000`  
Auth: `{ auth: { token: "<JWT>" } }`

| Direction         | Event                  | Payload                                        |
|-------------------|------------------------|------------------------------------------------|
| Client → Server   | `live:start`           | —                                              |
| Client → Server   | `live:stop`            | —                                              |
| Client → Server   | `live:audio-chunk`     | `{ data, sampleRate, channels }`               |
| Server → Client   | `live:chord-detected`  | `{ chord, confidence, timestamp, bpm? }`       |
| Server → Client   | `live:session-started` | —                                              |
| Server → Client   | `live:session-stopped` | —                                              |
| Server → Client   | `live:error`           | `{ message }`                                  |

## Auth Flow

```
Register/Login → accessToken (JWT 15m) + refreshToken (opaque, hashed in DB, 30d)
               ↓
Mobile stores: accessToken in SecureStore, refreshToken in SecureStore
               ↓
All requests: Authorization: Bearer <accessToken>
               ↓
401 received → POST /auth/refresh with Cookie: refresh_token=<token>
             → new accessToken returned
             → old refresh token revoked, new one issued (rotation)
```

## Analysis Job Flow

```
POST /uploads/file
  → Upload audio to R2
  → Create Song record (status: QUEUED)
  → POST /songs/:id/analyze
     → Create Analysis record (status: QUEUED)
     → Enqueue BullMQ job (analysisQueue)
        → AI worker (Phase 2) processes audio
        → Writes chords, bpm, key, scale to Analysis
        → Updates status: COMPLETED
        → Emits notification via Socket.IO
  → Mobile polls GET /songs/:id/analysis every 3s until status = COMPLETED
```

## Development

### Prerequisites
- Node.js 22+
- PostgreSQL 16 (local install or Railway dev database)
- Upstash Redis (free tier at upstash.com)

### Local setup

```bash
# 1. Clone and install
cd backend
npm install

# 2. Copy env
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, JWT_SECRET (min 32 chars), JWT_REFRESH_SECRET

# 3. Run migrations and seed
npm run db:migrate
npm run db:seed

# 4. Start dev server (hot-reload)
npm run dev
# API available at http://localhost:4000
```

### Run mobile app
```bash
cd mobile-rn
npm install
npm run start
```

## Deployment

### Railway (development / staging)
1. Create Railway project
2. Add PostgreSQL plugin → copy DATABASE_URL
3. Add Redis plugin (or use Upstash) → set REDIS_URL
4. Connect GitHub repo → auto-deploy on push to main
5. Set all env variables in Railway dashboard
6. Railway reads `backend/railway.json` for build config (Nixpacks)

### AWS (production)
- Backend: AWS App Runner or EC2 with PM2
- Database: AWS RDS PostgreSQL (Multi-AZ)
- Redis: Upstash Redis (serverless)
- Storage: Cloudflare R2 (already configured)
- CDN: Cloudflare

## Payment Providers (Phase 3)

```
PaymentProvider (interface)
├── RazorpayProvider   — UPI, cards, net banking (India primary market)
├── StripeProvider     — International cards
├── AppleIAPProvider   — iOS App Store (required)
└── GooglePlayProvider — Android Play Store (required)
```

## Phase Roadmap

| Phase | Status      | Scope                                       |
|-------|-------------|---------------------------------------------|
| 0     | ✅ Complete | Monorepo, shared types, env, CI             |
| 1     | ✅ Complete | Backend API (Fastify + Prisma + PostgreSQL) |
| 2     | Pending     | AI Service (FastAPI + librosa + demucs)     |
| 3     | Pending     | Payments (4 providers)                      |
| 4     | Pending     | Real-time audio (live chord detection)      |
| 5     | Pending     | Flutter migration (all 16 screens)          |
| 6     | Pending     | Web → Next.js                               |
| 7     | Pending     | Missing features (AI Tutor, Notifications…) |
| 8     | Pending     | Testing (80%+ coverage)                     |
