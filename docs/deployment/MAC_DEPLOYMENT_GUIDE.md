# macOS Deployment Guide — Wilsify AI Full Stack

**Audience:** someone who has never deployed a full-stack application before, working on a Mac. This guide explains not just *what* to run, but *why* each piece exists, so the system stays debuggable once it's running.

**What you're deploying:** Wilsify AI is four separately-runnable services plus a static site:

| Service | What it does | Language/Framework | Default port |
|---|---|---|---|
| `backend/` | REST API, auth, billing, database access, job queue | Node.js / Fastify | 4000 |
| `ai-service/` | Audio analysis (chords, BPM, key, MIDI, stems, AI tutor) | Python / FastAPI + Celery | 8000 |
| `web-app/` | The web dashboard users log into | Next.js | 3000 |
| `mobile_app/` | The iOS/Android app | Expo / React Native | n/a (native build) |
| `web/` | The public marketing landing page | Static HTML | n/a (GitHub Pages) |

They're separate because each has a different job and a different failure mode: the AI service does CPU/memory-heavy audio processing and should be able to crash or restart without taking down login and billing, which live in the backend. Keeping them as independent services means you can also deploy, scale, and reason about them independently.

---

## Part 1 — Local Development on macOS

The goal here is to run the whole stack on your own Mac so you can test changes before anything touches the internet.

### 1.1 Install Homebrew (if you don't have it)

Homebrew is the standard macOS package manager — it's how you'll install Node, Python, and other tools below without hunting for individual installers.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 1.2 Install Node.js 22

The project's `package.json` requires `"node": ">=22.0.0"`. Using an older Node can cause subtle dependency resolution differences; using Node 24 has caused issues with the mobile app specifically (see `mobile_app/README.md`), so pin to 22.

```bash
brew install nvm
mkdir ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 22
nvm use 22
node --version    # confirm v22.x.x
```

### 1.3 Install Python 3.11

The AI service requires **exactly Python 3.11** — `basic-pitch` pins `tensorflow<2.15.1`, which has no Python 3.12 wheels on Linux/macOS (verified via `pip install --dry-run`, see `docs/FINAL_AUDIT_REPORT.md`). Python 3.12 will fail to resolve dependencies.

```bash
brew install python@3.11
python3.11 --version
```

### 1.4 Install PostgreSQL and Redis

This project runs PostgreSQL and Redis as native local services — no Docker.

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

Verify both are running:
```bash
psql postgres -c "SELECT version();"
redis-cli ping     # should print PONG
```

Create the local database and a role matching what `backend/.env.example` expects:
```bash
createdb wilsify
psql wilsify -c "CREATE ROLE wilsify WITH LOGIN PASSWORD 'wilsify_dev' SUPERUSER;"
```

### 1.5 Clone the Repository

```bash
git clone <your-repository-url> wilsify-ai
cd wilsify-ai
```

### 1.6 Confirm Infrastructure Is Running

You already started PostgreSQL and Redis as native services in Section 1.4. Confirm they're both reachable before continuing:

```bash
psql wilsify -c "SELECT 1;"
redis-cli ping     # PONG
```

For Redis persistence during local development, enable AOF so queued analysis jobs survive a restart:
```bash
redis-cli config set appendonly yes
```

### 1.7 Run the Backend

```bash
cd backend
cp .env.example .env
```

Now open `.env` in a text editor and fill in the required values. At minimum for local dev:
- `DATABASE_URL=postgresql://wilsify:wilsify_dev@localhost:5432/wilsify` (matches the role you created in Section 1.4)
- `REDIS_URL=redis://localhost:6379`
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — generate real random values, don't leave them blank:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
  Run this twice to get two different secrets. **Why two secrets?** Access tokens and refresh tokens are verified independently; if one secret is ever compromised, having a second, different secret for the other token type limits the blast radius.
- `AI_SERVICE_SECRET` — any random string for local dev (e.g. `dev-secret`), but it must be the **same value** you set for the AI service in step 1.8 — this is how the backend and AI service authenticate to each other.

See [ENVIRONMENT.md](ENVIRONMENT.md) for what every other variable does.

Now install and run:
```bash
npm install
npm run db:generate     # generates the Prisma client from backend/prisma/schema.prisma
npm run db:migrate      # creates all tables in your local Postgres
npm run dev             # starts the API on http://localhost:4000
```

**Why `db:generate` before `db:migrate`?** Prisma's client (the typed database API the backend code imports) is generated from the schema file, not the live database — you need it generated once so the TypeScript code compiles, and `db:migrate` then makes the actual database match that schema.

Verify it's running:
```bash
curl http://localhost:4000/health
# {"ok":true, ...}
```

### 1.8 Run the AI Service

In a **new terminal tab** (leave the backend running in the other one):

```bash
cd ai-service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Why a virtual environment (`venv`)?** It isolates this project's Python packages from your system Python and from any other Python project on your machine — without it, installing `librosa` here could silently conflict with a different version needed by another project.

Copy and edit the env file:
```bash
cp .env.example .env
```
Set `AI_SERVICE_SECRET` to the **exact same value** you used in the backend's `.env`.

Start the API:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

In two more terminal tabs, start the Celery workers (these process the actual analysis jobs asynchronously so the API can respond instantly while work happens in the background):
```bash
# Tab 3 — fast jobs (BPM, key, chords: ~10s)
celery -A celery_app worker --queues fast_queue --concurrency 2 --loglevel info

# Tab 4 — slow jobs (stem separation, sheet music: ~120s)
celery -A celery_app worker --queues slow_queue --concurrency 1 --loglevel info
```

**Why two separate queues instead of one?** Stem separation is memory-heavy (~4 GB per job) and slow; if it shared a queue with the fast BPM/chord jobs, a stem-separation job could block quick requests behind it for two minutes. Separating them means fast requests stay fast regardless of what's happening in the slow queue.

Verify:
```bash
curl http://localhost:8000/health
```

### 1.9 Run the Web Dashboard

New terminal tab:
```bash
cd web-app
cp .env.example .env.local
```
Set `NEXT_PUBLIC_API_URL=http://localhost:4000` and `NEXT_PUBLIC_SOCKET_URL=http://localhost:4000` in `.env.local`.

```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 1.10 Run the Mobile App

New terminal tab:
```bash
cd mobile_app
cp .env.example .env
```
For the iOS Simulator, `EXPO_PUBLIC_API_URL=http://localhost:4000` works. For a real physical phone, `localhost` means *the phone itself*, not your Mac — replace it with your Mac's LAN IP:
```bash
ipconfig getifaddr en0   # prints your Mac's local network IP, e.g. 192.168.1.42
```
Then set `EXPO_PUBLIC_API_URL=http://192.168.1.42:4000` (and the WS/AI URLs similarly) in `mobile_app/.env`.

Before first run, add required font and image assets — see `mobile_app/README.md` ("Fonts" and "Image assets" sections); the app shows a blank white screen without them.

```bash
npm install
npx expo start
```
Press **`i`** for the iOS Simulator (requires Xcode — see Part 3) or **`a`** for Android (requires Android Studio — see [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md)), or scan the printed QR code with the Expo Go app on a real phone on the same Wi-Fi network.

### 1.11 The One-Command Alternative

Instead of running Sections 1.7–1.8 as separate manual steps, use the repository's bootstrap script from the repo root — it installs every workspace's dependencies, sets up the `ai-service` Python virtualenv, and copies each `.env.example` to `.env` where one doesn't already exist:
```bash
./setup.sh
```
You'll still start each service (`backend`, `ai-service`, `web-app`, `mobile_app`) in its own terminal tab as shown above — `setup.sh` only handles one-time install/bootstrap, not process supervision.

---

## Part 2 — Environment Variables Reference

Every variable used across all four services is documented in [ENVIRONMENT.md](ENVIRONMENT.md). Skim it now — the two mistakes that cause the most confusion for first-time deployers are:
1. Forgetting that `AI_SERVICE_SECRET` must be **identical** in both `backend/.env` and `ai-service/.env` — a mismatch causes every analysis request to fail with a 401, with no obvious error in the frontend.
2. Using `localhost` in a mobile `.env` when testing on a real device — a phone's `localhost` refers to the phone, not your computer (Section 1.10).

---

## Part 3 — iOS Simulator Note (macOS-specific)

Since you're on a Mac, you additionally have the option to run the app in the iOS Simulator (not available on Windows/Linux):
1. Install **Xcode** from the Mac App Store (multi-GB download; budget real time for this).
2. Open Xcode once after installing so it finishes its own component installation, and accept the license.
3. Install the command-line tools: `xcode-select --install`.
4. From `mobile_app/`, run `npx expo start` and press **`i`** — Expo boots the Simulator and installs the app automatically.

For an actual App Store deployment (not just simulator testing), you'll need an Apple Developer account ($99/year) — see [EAS.md](EAS.md) for the iOS build/submit flow, which mirrors the Android flow in [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md) but targets TestFlight/App Store Connect instead of Google Play.

---

## Part 4 — Production Deployment

Once the app works locally, "production" means: the backend and AI service run on servers that are always on and publicly reachable, the web app is served from a CDN, and the mobile app is built as a real installable binary. This project uses three different platforms, one per concern, because each is the best fit for that specific workload:

- **Railway** — for the backend and AI service (traditional always-running server processes with a database and a job queue)
- **Vercel** — for the Next.js web app (Vercel is purpose-built for Next.js and handles its CDN/edge caching automatically)
- **Expo EAS** — for building and submitting the mobile app (native mobile compilation requires macOS/Xcode for iOS and a full Android SDK for Android; EAS runs both in the cloud so you don't need to own both a Mac and set up a full Android toolchain just to ship a release)

### 4.1 Railway Deployment (Backend + AI Service)

1. Create a free account at [railway.app](https://railway.app).
2. Install the CLI and log in:
   ```bash
   npm install -g @railway/cli
   railway login
   ```
3. From the repository root, create a new Railway project:
   ```bash
   railway init
   ```
   Or create one from the [Railway dashboard](https://railway.app/dashboard) → **New Project**. A "project" in Railway is a container that groups related services together — you'll add your backend, AI service, PostgreSQL, and Redis all into this one project so they can privately talk to each other over Railway's internal network.
4. Add managed databases from the dashboard: **New** → **Database** → **Add PostgreSQL**, and again for **Add Redis**. Railway auto-generates connection strings for these — copy the generated `DATABASE_URL` and `REDIS_URL` into your backend service's variables rather than typing them yourself, to avoid transcription errors.
5. Link your local checkout to the project and deploy the backend:
   ```bash
   cd backend
   railway link
   railway up --service wilsify-backend
   ```
   Railway builds this with **Nixpacks** (see `backend/railway.json`, `"builder": "NIXPACKS"`) directly from `package.json` — there is no Dockerfile in this project. The configured start command (`deploy.startCommand` in `railway.json`) runs `npm run db:migrate:deploy && npm start` — migrations are applied automatically on every deploy, before the server starts, so the database schema can never be out of sync with the code that's about to serve requests.
6. Set the required environment variables (see [ENVIRONMENT.md](ENVIRONMENT.md) for the full list) via the Railway dashboard's **Variables** tab, or the CLI:
   ```bash
   railway variables set JWT_SECRET=... JWT_REFRESH_SECRET=... AI_SERVICE_SECRET=...
   ```
   Generate real secrets the same way as in Section 1.7 — never reuse your local dev secrets in production.
7. Repeat steps 5–6 for the AI service (`cd ai-service && railway up --service wilsify-ai-service`), using the **same** `AI_SERVICE_SECRET` value as the backend.
8. Confirm both are live:
   ```bash
   curl https://<your-backend-url>/health
   curl https://<your-ai-service-url>/health
   ```

Alternatively, connect your GitHub repository in the Railway dashboard once, and every push to `main` deploys automatically via the `backend-ci.yml` / `ai-service-ci.yml` GitHub Actions workflows already in this repository (they run tests first and only deploy if tests pass) — this is the recommended path once you've done the first manual deploy above and understand what it's doing.

### 4.2 Vercel Deployment (Web App)

1. Create a free account at [vercel.com](https://vercel.com).
2. Install the CLI: `npm install -g vercel`.
3. From `web-app/`, run `vercel --prod` and follow the prompts (it detects the Next.js framework automatically).
4. In the Vercel project's dashboard → **Settings → Environment Variables**, set `NEXT_PUBLIC_API_URL` to your Railway backend's public URL, plus `NEXT_PUBLIC_SOCKET_URL` (same URL — the backend serves both REST and WebSocket traffic) and optionally the PostHog/Sentry variables. **Why `NEXT_PUBLIC_` prefix matters:** Next.js only exposes environment variables prefixed this way to browser-side code; anything without the prefix stays server-side only. Getting this wrong means the browser silently can't reach your API.
5. Alternatively, connect the GitHub repo in the Vercel dashboard for automatic deploys on every push to `main`.

### 4.3 Expo EAS Deployment (Mobile)

Full walkthrough (Java, Android Studio, signing, Play Store) is in [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md). The macOS-specific iOS equivalent:
```bash
cd mobile_app
eas build --platform ios --profile production
eas submit --platform ios
```
This requires an Apple Developer account and real `appleId`/`ascAppId` values filled into `eas.json` (see [EAS.md](EAS.md)) — EAS builds the actual iOS binary on Apple-hosted macOS build machines even if you don't own a Mac, though since you're following this guide on a Mac you additionally have the option to build locally with `npx expo run:ios` for faster debug iteration.

### 4.4 The Landing Page

`web/` (the static marketing site) deploys automatically to GitHub Pages via `.github/workflows/deploy.yml` on every push to `main` — no manual steps required, and nothing macOS-specific about it.

---

## Part 5 — Health Checks

After any deployment, confirm every service reports healthy before considering the deploy done:

```bash
curl https://<backend-url>/health        # {"ok":true,...}
curl https://<ai-service-url>/health     # {"status":"ok",...}
```

Railway also polls `healthcheckPath: /health` (configured in each service's `railway.json`) every 30 seconds and will flag a service as unhealthy in its dashboard if it stops responding — check the Railway dashboard's service status page as a second confirmation.

---

## Part 6 — Logs

- **Local development:** logs print directly in the terminal tab running each service (backend uses Pino, AI service uses Python's `logging`).
- **Railway:** open the project in the Railway dashboard → click a service → **Deployments** tab → click the active deployment → **View Logs**. This streams live logs and is the first place to look when a deployed service behaves differently than it did locally.
- **Vercel:** project dashboard → **Deployments** → click a deployment → **Runtime Logs** / **Build Logs**.
- **PostgreSQL / Redis (local):** `brew services list` shows their status; `tail -f $(brew --prefix)/var/log/postgresql@16.log` or `redis-cli monitor` for live activity if something looks wrong.

---

## Part 7 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend won't start: `Environment validation failed` | A required env var is missing or malformed (Zod validates `backend/.env` at startup and fails fast rather than starting in a broken state) | Re-read the error message — it names the exact variable; cross-check against [ENVIRONMENT.md](ENVIRONMENT.md) |
| Analysis requests fail with 401 from the AI service | `AI_SERVICE_SECRET` differs between `backend/.env` and `ai-service/.env` | Make both values identical, restart both services |
| PostgreSQL/Redis running but the backend can't connect | `DATABASE_URL`/`REDIS_URL` in `backend/.env` don't match your local setup | Confirm `brew services list` shows both `started`; confirm `.env` uses `localhost:5432` / `localhost:6379` and the role/password you created in Section 1.4 |
| Prisma migration fails with a connection error | PostgreSQL not running, or wrong credentials in `DATABASE_URL` | `brew services list` to confirm PostgreSQL is `started`; confirm the password matches what you set with `CREATE ROLE` in Section 1.4 |
| Web app builds locally but API calls fail after Vercel deploy | `NEXT_PUBLIC_API_URL` not set in Vercel's environment variables, or set without the `NEXT_PUBLIC_` prefix | Re-check Section 4.2 step 4; redeploy after fixing (env var changes require a new deployment to take effect) |
| Railway deployment builds but immediately crashes / restarts in a loop | Usually a missing required production env var causing the Node process or Python process to exit on startup (both services are designed to fail fast rather than run half-configured) | Check **View Logs** (Part 6) for the specific startup error; it will name the missing variable |
| Stem separation jobs time out or the AI service container gets killed (OOM) | Demucs needs ~4 GB RAM per concurrent slow-queue job; the Railway instance is undersized | Increase the AI service's memory allocation in Railway, or reduce `celery-slow` concurrency (it defaults to 1 already — do not increase it without more RAM) |
| Mobile app can't reach the local backend on a real device | Using `localhost` in `mobile_app/.env` instead of your Mac's LAN IP | Follow Section 1.10 — get your IP with `ipconfig getifaddr en0` |
| `xcrun: error` or Simulator won't launch | Xcode command-line tools not installed or not selected | `xcode-select --install`, then `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer` |

---

## Related Documents

- [DEPLOYMENT.md](DEPLOYMENT.md) — condensed reference version of this guide
- [ENVIRONMENT.md](ENVIRONMENT.md) — every environment variable, every service
- [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md) — Android Studio, Gradle, Play Store detail
- [EAS.md](EAS.md) — EAS build profiles and current blocker status
- [BACKUP_STRATEGY.md](BACKUP_STRATEGY.md) — PostgreSQL/Redis/R2 backup and restore
- [MONITORING.md](MONITORING.md) — Sentry, health checks, alerting in more depth
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — the full pre-launch operational checklist
