# Wilsify AI — Production Infrastructure, API & Cost Guide

A verified architectural and financial blueprint for deploying, running, and scaling **Wilsify AI** in production with zero-downtime audio processing, stem separation, chord timeline syncing, and AI tutoring.

---

## 1. Executive Cost Summary

| Growth Stage | Active Users | Songs Processed / Mo | Monthly Estimate (USD) | Monthly Estimate (INR) | Recommended Setup |
|---|---|---|---|---|---|
| **Stage 1: MVP / Launch** | 0 – 500 | Up to 1,500 songs | **$7 – $25 / month** | ~₹600 – ₹2,150 | Modal Free Tier ($30/mo credit) + Hetzner CX22 + Supabase Free + R2 Free |
| **Stage 2: Growing Production** | 500 – 5,000 | 1,500 – 15,000 songs | **$95 – $220 / month** | ~₹8,100 – ₹18,900 | Supabase Pro + Hetzner CPX31 + Modal/RunPod Serverless GPU + R2 |
| **Stage 3: High Scale** | 10,000+ | 50,000+ songs | **$450 – $850 / month** | ~₹38,500 – ₹73,000 | Load-balanced FastAPI + Concurrent Serverless GPUs + R2 + Dedicated Redis |

> **Why Stage 1 is under $25/mo:** Modal.com provides **$30/month in free serverless GPU credits** permanently on their starter plan, covering ~1,000–1,500 full song separations per month for **$0**.

---

## 2. Core Infrastructure & Hosting Architecture

### A. Serverless GPU Worker (Stems, Chords, Beats & ASR Alignment)
- **What it runs**:
  1. `HTDemucs` (`htdemucs_ft` or `htdemucs_6s`) for 4-stem or 6-stem separation.
  2. `beat_this` / `madmom` for frame-accurate BPM, beat, and downbeat grids.
  3. `BTC-ISMIR19` / `librosa` CQT chroma on isolated `bass` + `other` stems for main and passing chord extraction.
  4. `faster-whisper` + `stable-ts` on the isolated `vocals` stem for word-level LRC syncing.
  5. `FFmpeg` to compress output stems from `.wav` (200 MB) to `.m4a` / `.opus` (18 MB) before uploading to Cloudflare R2.
- **Why ALL DSP runs here (Not on the Web Server)**: Running `librosa` CQT or `Demucs` on your main FastAPI web server will peg the CPU at 100% and freeze HTTP requests for all other users. Combining stems + chords + Whisper inside a single GPU container run adds only ~3 seconds to the GPU job while keeping your web API 100% responsive.
- **Recommended Provider**: **Modal.com** *(Primary)* or **RunPod Serverless** *(Fallback)*.
  - **Recommended GPU**: **Nvidia L4** ($0.80/hr → ~$0.0033 per 15-sec job) or **Nvidia T4** ($0.59/hr → ~$0.0025 per 15-sec job).
  - **Free Tier**: Modal includes **$30/month free compute credits** (scales to $0 when idle).

### B. Backend Web API Server (Lightweight I/O & Orchestration)
- **What it runs**: Python 3.12, FastAPI (`main.py` via `gunicorn` + `uvicorn` workers), JWT auth validation, R2 Presigned URL generation, webhook handlers, AI Tutor routing, and job status endpoints.
- **Recommended Provider**: **Hetzner Cloud** (CX22 / CPX31) or **DigitalOcean / Railway**.
  - **Specs**: 2–4 vCPU, 4 GB–8 GB RAM, NVMe SSD, Ubuntu 24.04 LTS + Docker Compose + Caddy (automatic HTTPS).
  - **Cost**: **$5.50 – $15 / month** (Hetzner) or **$12 – $24 / month** (DigitalOcean).

### C. Database & Authentication
- **What it runs**: PostgreSQL 16 with Row-Level Security (`public.user_data`), user authentication (Email + Google OAuth), JWT sessions, saved chord sheets, and song analysis JSON metadata (~20 KB per song).
- **Recommended Provider**: **Supabase**.
  - **Free Tier**: 50,000 Monthly Active Users (MAU), 500 MB database storage (**$0/mo**). *Note: Free projects pause after 7 days of inactivity—set up a free GitHub Action or UptimeRobot cron ping every 24 hours during development.*
  - **Pro Tier**: 8 GB database storage, daily automated backups, 100,000 MAU, zero auto-pausing (**$25/mo**).

### D. Object Storage & Direct Upload Pipeline (Audio & Stems)
- **What it runs**: Temporary storage for uploaded source audio and compressed stem files (`vocals.m4a`, `drums.m4a`, `bass.m4a`, `other.m4a`).
- **Recommended Provider**: **Cloudflare R2** (S3-compatible API).
  - **Why R2**: **$0 egress fees** (data download bandwidth is free). Streaming stems from AWS S3 would cost $0.09/GB; R2 saves hundreds of dollars monthly.
  - **Critical Architecture Rule (Presigned URLs + CORS)**:
    - **Never** proxy 50 MB audio uploads through FastAPI. FastAPI generates a **Presigned `PUT` URL** (`boto3`), and the React frontend uploads directly to R2.
    - Configure explicit **CORS rules** on your R2 bucket (`AllowedMethods: ["GET", "PUT", "HEAD"]`, `AllowedHeaders: ["content-type", "range"]`) so Web Audio API / WaveSurfer can stream byte ranges directly in the browser.
  - **Cost**: First 10 GB/month free; then $0.015 / GB-month (**$0 – $5 / month**).

### E. Frontend Hosting & Global Edge CDN
- **What it runs**: Compiled React 19 + Vite Single-Page Application (SPA).
- **Recommended Provider**: **Cloudflare Pages** *(Recommended)* or **Vercel**.
  - **Why Cloudflare Pages**: Unlimited free bandwidth and commercial use allowed on the Free tier (Vercel's Hobby tier technically prohibits commercial SaaS monetization without upgrading to Pro at $20/mo).
  - **Required Audio Worklet Header**: If using multi-threaded WebAssembly (e.g., `Essentia.js` or pitch-shifting via `SharedArrayBuffer` in the browser), add `_headers` in your `public/` folder with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

### F. Domain & DNS
- **Recommended Provider**: **Cloudflare Registrar** (sells domains at wholesale cost with zero markup).
  - **Cost**: ~$10.44 / year for `.com`, ~$70 / year for `.ai` (2-year minimum registration required by the `.ai` registry).

---

## 3. Verified Production API Stack

### 1. AI & Large Language Models (LLM)
| API Provider | Model ID | Purpose in Wilsify AI | Verified Pricing |
|---|---|---|---|
| **Google Gemini API** *(Primary)* | `gemini-2.5-flash` | Music Theory AI Tutor, singing lyrics verification, syllable-locked multi-language translation | Free tier available; Paid tier ~$0.15 / 1M input tokens |
| **Groq Cloud API** *(Real-time Chat)* | `llama-3.3-70b-versatile` | Instant interactive Music Tutor & chord substitutions (250+ tokens/sec) | Free tier available; $0.59 / 1M input tokens |
| **OpenAI API** *(Fallback)* | `gpt-4o-mini` | Structured JSON schema fallback for chord-lyrics verification | $0.15 / 1M input tokens |

### 2. Speech-to-Text & Word-Level Lyrics Sync
| Method | Model / Tool | How It Works | Cost |
|---|---|---|---|
| **In-Worker GPU (Recommended)** | `faster-whisper` + `stable-ts` | Runs directly inside your Modal/RunPod container on the isolated `vocals.wav` stem right after Demucs finishes. Zero network transfer overhead and accurate forced alignment. | **$0 extra API cost** (~1.5s of GPU time) |
| **Groq Whisper API** *(Fast External)* | `whisper-large-v3-turbo` | Send compressed `vocals.m4a` stem to Groq API with `timestamp_granularities=["word", "segment"]`. | **$0.04 / hour** of audio (~$0.002 per song) |
| **OpenAI Whisper API** *(Fallback)* | `whisper-1` | Secondary external fallback (25 MB file size limit). | $0.006 / minute ($0.36 / hour) |

### 3. Serverless Audio Analysis & Stem Separation
| Approach | Provider / Model | How It Works | Cost |
|---|---|---|---|
| **Custom Serverless Worker (Best)** | **Modal.com** / **RunPod** | Runs your own Docker image (`HTDemucs` + `BTC` Chords + `beat_this` + `FFmpeg`) via webhook/queue. | **$0/mo** up to ~1,200 songs on Modal's $30 free credit; then **~$0.003 / song** |
| **Turnkey API (Zero-DevOps)** | **Replicate API** (`cjwbw/demucs`) | POST audio URL → returns 4 stem URLs. (Note: Still requires your own chord/beat pipeline). | ~$0.015 – $0.025 per song |
| **Commercial B2B All-in-One** | **Music.AI (Moises API)** | Enterprise fallback returning stems + beat-synced passing chords + BPM in one call. | ~$0.15 – $0.25 per song |

### 4. Metadata, Album Art & Audio Previews
> **⚠️ Critical 2025/2026 Industry Update:** Spotify permanently deprecated `preview_url`, `/audio-features`, and `/audio-analysis` for new developer apps (returning `null`). **Do not rely on Spotify for 30-second MP3 previews or BPM lookup.**

| API | Purpose | Pricing |
|---|---|---|
| **Apple iTunes Search API** | **30-second high-quality `.m4a` audio previews**, track search, and high-res album artwork (`https://itunes.apple.com/search?term=...&entity=song`). | **100% Free** (No API key required) |
| **Deezer Public API** | Secondary fallback for 30-second MP3 previews, explicit BPM metadata, and ISRC lookup. | **100% Free** |
| **Spotify Web API** | Track catalog search, Spotify URI linking, and artist metadata *(no audio previews)*. | Free (Developer App) |
| **LRCLIB API (`lrclib.net`)** | Crowd-sourced database of millions of pre-synced `.lrc` lyrics files—check this first before running Whisper to save compute! | **100% Free & Open Source** |
| **MusicBrainz API** | Open-source music metadata, release dates, and ISRC lookup. | **100% Free** |

### 5. Payment Gateways & SaaS Monetization (India + Global)
| Gateway | Target Users | Fee | Critical Compliance Note (India) |
|---|---|---|---|
| **Razorpay / Cashfree** | India (UPI, RuPay, Cards) | ~2% per domestic transaction | Supports **UPI Autopay** for recurring monthly SaaS subscriptions in INR. (Requires business KYC/PAN; MSME Udyam registration takes 15 mins). |
| **Lemon Squeezy / Paddle** | Global Users (USD / EUR / GBP) | 5% + 50¢ | Acts as **Merchant of Record (MoR)**—automatically collects and remits EU VAT/US sales tax and pays out to your Indian bank account via SWIFT/Wire without needing a US LLC. |

---

## 4. Critical Operational Requirements (Production Checklist)

### 1. Custom Transactional Email (SMTP)
- **The Problem**: Supabase's built-in email server is strictly limited to **2–4 emails per hour** and is meant only for local testing. In production, user signups and password resets will silently fail.
- **Solution**: Connect **Resend** (`smtp.resend.com`) in *Supabase Dashboard → Authentication → SMTP Settings*.
- **Cost**: **$0** (3,000 free emails/month, 100/day).

### 2. Asynchronous Job Queue & Webhook Architecture
- **The Problem**: Reverse proxies (Cloudflare) drop open HTTP requests after **100 seconds**. If a user uploads a 6-minute song and waits on a synchronous `POST /analyze` request, the browser will throw a `524 Timeout` error.
- **The 100% Working Flow**:
  1. Frontend requests a Presigned URL from FastAPI (`POST /api/upload-url`) and uploads audio directly to Cloudflare R2.
  2. Frontend calls `POST /api/jobs/create` with the R2 key. FastAPI creates a job record in **Upstash Redis** (or Supabase Realtime table) with status `queued`, triggers the **Modal.com** GPU function asynchronously (`.spawn()`), and immediately returns `{"job_id": "uuid"}` in **< 100ms**.
  3. The GPU worker processes stems + chords, updates progress (`25% Separating stems...`, `70% Extracting passing chords...`), writes the final JSON + R2 stem URLs to Supabase, and marks the job `completed`.
  4. Frontend listens via **Supabase Realtime** or polls `GET /api/jobs/{job_id}` every 2 seconds.

### 3. Cloudflare R2 Object Lifecycle Rules (Auto-Deletion)
- **The Problem**: Writing a custom Python cron job to delete expired `.m4a` stems can fail if the server restarts.
- **Solution**: Configure a native **Object Lifecycle Rule** directly inside the Cloudflare R2 Dashboard:
  - *Rule 1 (`temp-uploads/`)*: Automatically delete source uploads after **1 day**.
  - *Rule 2 (`free-tier-stems/`)*: Automatically delete generated stem files after **2 days** (while keeping the 20 KB chord/beat/lyric JSON in Supabase PostgreSQL permanently).
  - *Rule 3 (`pro-tier-stems/`)*: Retain stems for active Pro subscribers.

### 4. Browser Web Audio Memory Management (iOS Safari Protection)
- **The Problem**: Loading four uncompressed `.wav` stems into `AudioContext.decodeAudioData()` consumes **400+ MB of uncompressed PCM RAM**, which immediately crashes mobile Safari on iPhones.
- **Solution**:
  - Always serve compressed **192kbps `.m4a` (AAC)** or **160kbps `.opus`** stems.
  - Explicitly call `audioBuffer = null` and `audioContext.close()` when a user switches songs in the Practice Studio to prevent memory leaks.

### 5. Rate Limiting & Abuse Protection
- Protect GPU-triggering endpoints using **`slowapi`** (FastAPI rate limiter backed by Upstash Redis) + **Cloudflare Turnstile** (free, invisible CAPTCHA replacement) so bots cannot exhaust your GPU credits or LLM tokens.

### 6. Legal, DMCA & Copyright Safe Harbor
- **Terms of Service**: Users must explicitly check a box affirming they own or have rights to process the uploaded audio for personal educational/practice use.
- **Private Signed Playback URLs**: Never make your R2 stem bucket public-read to the open internet. Serve stems using temporary **Presigned `GET` URLs** (expiring in 2 hours) so Wilsify AI cannot be used as an unauthorized public music distribution host.
- **DMCA Takedown Page**: Publish a dedicated `/dmca` contact endpoint to maintain Safe Harbor protection.

---

## 5. Five Golden Architectural Rules to Save 85% on Costs

1. **Use Modal's $30/mo Free GPU Credit + Serverless Scaling**: Never rent a $350/month 24/7 dedicated GPU instance at launch. Serverless GPUs charge by the millisecond and cost **$0** when no user is uploading a song.
2. **Lookup `LRCLIB.net` + SHA-256 Audio Hash Cache Before Running GPUs**: Before spawning a GPU job, compute a fast SHA-256 hash (or check `artist + title + duration`) against your Supabase database. If another user already analyzed that song, return the cached chord timeline and lyrics in **50 milliseconds for $0**.
3. **Compress Stems to `.m4a`/`.opus` Before Leaving the GPU Worker**: Cuts Cloudflare R2 storage costs by **90%** and prevents mobile browser crashes.
4. **Use Cloudflare R2 + Direct Presigned Uploads**: Eliminates AWS S3 egress fees ($0 bandwidth) and keeps heavy file transfers completely off your Hetzner FastAPI CPU.
5. **Distill Static Music Theory Locally**: Serve standard chord diagrams, scale formulas, and the 25-topic theory engine from local static JSON/Markdown caches, reserving `gemini-2.5-flash` and `llama-3.3-70b` strictly for dynamic, song-specific questions.