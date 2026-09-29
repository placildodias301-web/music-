# Viva Preparation — Wilsify AI: Intelligent Music Learning and Creation Platform

## 20 Likely Viva Questions, With Answers

**1. What problem does your project solve?**
It closes the gap between hearing a song and being able to play it — automatically detecting chords, key, tempo, and difficulty instead of requiring the musician to work it out by ear or search unreliable tab websites.

**2. Why did you split the backend and the AI service into two separate applications instead of one?**
Different languages fit each job best: Node.js/Fastify is well suited to fast request/response API work (auth, billing, CRUD), while Python has the mature audio/ML ecosystem (librosa, Demucs, basic-pitch) needed for signal processing. Splitting them also means the slow, CPU/GPU-heavy analysis work can scale and fail independently of the fast, always-on API.

**3. How does the system avoid a slow analysis job blocking the API?**
The backend enqueues an analysis job onto a Redis-backed queue (BullMQ on the Node side, Celery on the Python side) and returns immediately. The AI service's worker processes pull jobs off the queue asynchronously and write results back; the client polls or receives a callback rather than holding a request open for the duration of the analysis.

**4. What database are you using, and why PostgreSQL specifically?**
PostgreSQL 16. The data is fundamentally relational — users have songs, songs have analyses, analyses have chords, users have subscriptions and a credit ledger — with real foreign-key relationships and a need for transactional integrity (e.g. a credit deduction and a job creation should succeed or fail together). A relational database with strong ACID guarantees is the right fit; a NoSQL store would just force those relationships back into application code.

**5. What ORM are you using and why?**
Prisma. It gives type-safe, autocompleted database queries in TypeScript, generates and tracks schema migrations, and its schema file (`schema.prisma`) doubles as clear, readable documentation of the entire data model.

**6. Walk me through what happens when a user uploads a song.**
The web/mobile client uploads the file to the backend, which validates it, stores the raw audio in Cloudflare R2 object storage, creates a `Song` row, and enqueues an analysis job. The AI service picks up the job, downloads the audio, runs chord/key/tempo/scale detection, optionally MIDI/sheet/stem generation, writes structured `Analysis` and `Chord` rows back through the backend, and the client is notified the result is ready.

**7. How does authentication work?**
JWT access tokens (short-lived) plus a refresh token (long-lived, `httpOnly` cookie, `sameSite: strict`, scoped only to the refresh endpoint's path). The access token is sent on every request and validated per-request; when it expires, the client calls `/auth/refresh` with the cookie to get a new one, without asking the user to log in again.

**8. Why a refresh token in a cookie instead of just a long-lived access token?**
A long-lived token that's stolen (e.g. via XSS) stays valid for its whole lifetime. Short-lived access tokens limit that exposure window, and keeping the refresh token in an `httpOnly` cookie means client-side JavaScript can never read it, which meaningfully reduces the impact of an XSS vulnerability.

**9. How do you prevent account enumeration on the "forgot password" endpoint?**
The endpoint returns the exact same response — "If an account with that email exists, a reset link has been sent" — regardless of whether the email is actually registered, so an attacker can't use response differences to discover which emails have accounts.

**10. What is a credit system, and why use one instead of just per-feature paywalls?**
Different actions cost different amounts of real compute (a chord detection is cheap; stem separation with Demucs is GPU/CPU-heavy). A credit ledger lets each plan tier allocate a monthly credit budget and each action consume credits proportional to its actual cost, which is both fairer to the user and more sustainable for infrastructure cost than a flat "unlimited" promise.

**11. How does the AI Tutor know what song the user is asking about?**
Each tutor conversation is scoped to a specific `Analysis` record. The backend passes that analysis's chord progression, key, tempo, and structure into the LLM's context before the user's question, so the model answers with the actual song's data rather than generic music theory.

**12. What audio libraries does the AI service use, and what does each do?**
`librosa` — core audio loading and DSP (tempo, spectral analysis). `basic-pitch` — polyphonic pitch/note detection, feeding chord inference. `Demucs` — source separation into vocal/drum/bass/other stems. `music21` — symbolic music representation, used in generating MIDI and sheet-music output.

**13. How is sheet music actually generated?**
The detected notes are converted into a symbolic score representation via `music21`, then rendered to a PDF using LilyPond, an open-source music engraving program invoked as an external process.

**14. How do you handle a YouTube link instead of a direct file upload?**
The AI service uses `yt-dlp` to extract and download the audio track from the URL, restricted to a fixed allowlist of YouTube hostnames, before running it through the same analysis pipeline as an uploaded file.

**15. What happens if the audio file is too large or malicious?**
Downloads are streamed in small chunks with a running size check that aborts the moment a configured maximum is exceeded, rather than buffering the whole file into memory first. This bounds both memory use and the blast radius of an oversized or malicious upload.

**16. How does rate limiting work, and what happens if Redis goes down?**
A global limit (200 requests/minute) plus tighter per-route limits on sensitive endpoints (e.g. 5 registration attempts per 15 minutes) are enforced via a Redis-backed store. If Redis is unreachable, the system is configured to "fail open" — allow the request rather than reject it — because rate limiting is a defense-in-depth layer, and an infrastructure outage in that layer shouldn't take the entire API down with it.

**17. Why build both a web app and a mobile app instead of just one?**
Musicians practice in different contexts — at a desk analyzing a song in detail (web) versus in the room with their instrument (mobile, for the live tuner and live chord detection especially). Sharing one backend and one set of business rules means both surfaces stay consistent without duplicating logic.

**18. What testing exists in this project?**
The backend has an automated test suite (67 tests at last count) with coverage reporting, run automatically via GitHub Actions on every push before deployment is allowed to proceed. AI-service and frontend testing exist but are less complete — see the audit report for the honest current state.

**19. How is the project deployed, and why those specific platforms?**
Backend and AI service → Railway (built via Nixpacks, not Docker — see `railway.json`), chosen because both need to run as long-lived server processes with a database and job queue attached. Web app → Vercel, purpose-built for Next.js with automatic CDN/edge handling. Mobile → Expo EAS, which builds native iOS/Android binaries in the cloud without needing to own a Mac for iOS builds.

**20. What would you do differently, or improve, if you kept building this?**
Tighten the rate-limit key generation to rely solely on Fastify's trusted-proxy-resolved `req.ip` instead of also reading the raw `X-Forwarded-For` header; add a MIME-type allowlist explicitly at the multipart-upload layer; expand automated test coverage on the AI service and frontend to match the backend's; and reconcile a couple of stale documentation references found during a recent internal audit (see `docs/AUDIT_VERIFICATION_REPORT.md`).

---

## Architecture Explanation (for the panel)

Wilsify AI is a **polyglot microservice-adjacent monorepo**: one Node.js/Fastify backend acts as the system of record and API gateway, and a separate Python/FastAPI service handles all audio/ML work. They communicate over an internal HTTP call authenticated by a shared secret (`AI_SERVICE_SECRET` / `BACKEND_INTERNAL_SECRET` — the same value configured on both sides), plus a Redis-backed job queue for the long-running analysis work itself. Two client applications — a Next.js web app and an Expo React Native mobile app — talk only to the Fastify backend, never directly to the AI service, so all business rules (auth, billing, plan gating) are enforced in exactly one place regardless of which client is calling.

## Database Explanation

Twelve Prisma models capture the domain: `User`, `RefreshToken`, `PasswordReset`, `EmailVerification` (identity/auth); `Song`, `Analysis`, `Chord` (the core music-analysis domain — a `Song` has one or more `Analysis` runs, each `Analysis` has many `Chord` rows for its timestamped progression); `CommunityPost`, `PostLike` (social feed); `CreditLedger`, `Subscription` (billing); `Notification` (in-app alerts). The schema separates *what a user uploaded* (`Song`) from *what the AI produced from it* (`Analysis`/`Chord`), which allows re-analysis or multiple analysis passes on the same song without data loss.

## AI Workflow Explanation

1. Client uploads audio or submits a YouTube URL → backend stores the file (R2) and creates a `Song` + queued job.
2. AI service worker picks up the job → downloads/loads the audio (`librosa`) → runs BPM, key, and scale detection → runs `basic-pitch` for note/chord transcription.
3. If the user's plan includes it: generates MIDI (`music21`), a sheet-music PDF (`music21` → LilyPond), and separated stems (`Demucs`).
4. Results are written back to PostgreSQL via the backend (`Analysis` + `Chord` rows) and generated files are stored in R2.
5. If the user opens the AI Tutor for that song, the stored `Analysis` data is injected into the LLM's context before each question, so answers are grounded in that specific song rather than generic music theory.

## Frontend–Backend Communication Explanation

Both clients speak to the Fastify backend over a versioned REST API (`/api/v1/...`) using JSON, with the access token sent as a Bearer token in the `Authorization` header (web additionally relies on the `httpOnly` refresh cookie; mobile reads and resends that cookie manually since it has no browser cookie jar). Long-running operations (analysis) are not held open as a single request — the client submits, then polls a status endpoint or receives a push notification when the result is ready, keeping every HTTP request short-lived even though the underlying work can take much longer.
