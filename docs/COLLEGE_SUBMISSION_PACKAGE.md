# Wilsify AI: Intelligent Music Learning and Creation Platform
### Final-Year BCA Project — Submission Package

---

## Abstract

Wilsify AI: Intelligent Music Learning and Creation Platform is a full-stack music intelligence system that converts any song — an uploaded audio file or a YouTube link — into structured musical knowledge. The platform detects chord progressions, tempo (BPM), key signature, and scale using digital signal processing and machine-learning models, and generates downloadable MIDI files, sheet-music PDFs, and separated instrument stems (vocals, drums, bass, other). A context-aware AI tutor, built on a large language model, answers music-theory questions grounded in the specific song a user is analyzing, rather than giving generic textbook answers. The system is delivered across three surfaces sharing one backend: a Next.js web dashboard, a React Native mobile app for iOS and Android, and a versioned REST API for third-party integration. The backend is built on Fastify and PostgreSQL with Prisma as the ORM, and the AI analysis pipeline is a separate Python/FastAPI microservice using librosa, basic-pitch, and Demucs, connected by a Redis-backed job queue so long-running audio analysis never blocks the request/response cycle. The project implements a four-tier subscription model with a credit-based usage system, JWT authentication with refresh-token rotation, and a CI/CD pipeline that runs automated tests before every deployment. The result is a working, deployed product — not a static prototype — demonstrating applied skills in full-stack web development, mobile development, distributed systems design, audio signal processing, and applied machine learning within a single coherent product.

*(Word count: ~230)*

---

## Problem Statement

Learning to play a song by ear is one of the most common but least supported tasks in music education. A musician who hears a song they want to learn typically needs to work out, manually and slowly, what key it's in, what chords are being played, how fast it goes, and how difficult it will be to play — using trial and error on their instrument, or an easily-outdated static tab website with no guarantee of accuracy. Existing tools that solve part of this problem are typically one of: expensive desktop-only software aimed at audio engineers rather than learners; narrow single-purpose apps (a tuner, or a metronome, or a chord-lookup site, but never all three plus theory guidance in one place); or paid transcription services with multi-day turnaround. There is no single, affordable, instant, cross-platform tool that takes a musician from "I like this song" to "I understand how to play this song" in one step.

---

## Objectives

1. Design and implement an end-to-end pipeline that accepts an audio file or YouTube URL and returns chord progression, key, scale, tempo, and a difficulty rating within seconds for the initial result.
2. Generate three practical, exportable artifacts from that analysis: a MIDI file, a sheet-music PDF, and separated instrument stems.
3. Build a conversational AI tutor that is grounded in the specific analyzed song, not generic music theory, so its answers are directly useful to what the user is actively learning.
4. Deliver the same feature set consistently across a web dashboard and native mobile apps, sharing one backend and one set of business rules.
5. Implement a sustainable monetization model (subscription tiers + credits) with correct authorization gating, so the system is viable as a real product, not only a technical demonstration.
6. Apply production-grade engineering practice throughout: automated testing, CI/CD, structured error handling, environment-based configuration, and API documentation — rather than treating those as out of scope for a student project.

---

## Scope

**In scope:** audio upload and YouTube-link ingestion; chord/key/tempo/scale detection; MIDI and sheet-music export; stem separation; AI tutor chat; user authentication and profiles; a credit/subscription billing model; a community feed for sharing analyzed songs; a REST API; web and mobile clients; deployment to production infrastructure (Railway, Vercel, Expo EAS).

**Out of scope for this submission:** live multi-user collaboration/jam sessions; a desktop native app; a public plugin marketplace; automated music generation/composition (the platform analyzes and teaches existing music — it does not compose new music); enterprise SSO. These are noted as future scope, not omissions of a required feature.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Web frontend | Next.js 14, React 18, Tailwind CSS, Zustand, TanStack Query | Web dashboard — analysis UI, billing, community feed |
| Mobile app | Expo SDK 54, React Native 0.76, Expo Router | Native iOS + Android app, same feature set as web |
| Backend API | Fastify 5, Node.js 22, TypeScript, Prisma ORM | Auth, business logic, billing, job orchestration |
| AI service | FastAPI, Python 3.12, librosa, basic-pitch, Demucs, music21, Celery | Audio analysis, MIDI/sheet generation, stem separation |
| Database | PostgreSQL 16 | Durable storage — users, songs, analyses, credits, subscriptions |
| Queue / cache | Redis 7 (AOF persistence) | Async job queue (BullMQ/Celery), rate-limit counters |
| Object storage | Cloudflare R2 | Uploaded audio, generated MIDI/PDF/stem files |
| AI / LLM | Anthropic Claude API | Context-grounded AI tutor conversations |
| Payments | Stripe, Razorpay, Apple IAP, Google Play Billing | Subscription and credit purchases across platforms |
| CI/CD | GitHub Actions → Railway (backend + AI service), Vercel (web), EAS (mobile) | Automated test-then-deploy pipeline |
| Monitoring | Sentry, PostHog | Error tracking and product analytics |

---

## Module List

| Module | Description |
|---|---|
| **Authentication & Users** | Registration, login, JWT + refresh-token rotation, password reset, email verification, profile management |
| **Song Analysis** | Upload/YouTube ingestion, chord detection, BPM/key/scale detection, difficulty rating |
| **Export Engine** | MIDI generation, sheet-music PDF (via LilyPond), stem separation (Demucs) |
| **AI Tutor** | Context-grounded conversational assistant scoped to the analyzed song |
| **Live Tools** | Real-time microphone chord detection, chromatic instrument tuner (8 tunings) |
| **Community** | Song feed, posts, likes, sharing of analyzed tracks |
| **Billing & Credits** | Four-tier subscriptions (Free/Pro/Studio/Enterprise), credit ledger, multi-provider payments |
| **Notifications** | In-app and (where configured) email notifications for account and billing events |
| **Admin** | Internal administrative routes for platform operation |
| **Mobile App** | Full feature parity with web, built for iOS and Android via Expo |

---

## Conclusion

Wilsify AI demonstrates that a final-year academic project can also be a real, deployable product. Rather than a proof-of-concept limited to one feature or one platform, the system integrates audio signal processing, applied machine learning, distributed backend architecture, and multi-platform frontend engineering into one coherent pipeline that ships to production. Building it required decisions that go beyond a typical classroom assignment — how to keep a slow AI analysis job from blocking a user-facing API, how to keep a web and a mobile client in sync against one backend, how to structure a billing model that's both fair to users and sustainable, and how to fail safely (rate limiting that degrades gracefully, structured error handling, environment-validated startup) rather than just working on the happy path. The result is a project whose architecture and code quality can be evaluated the same way a hiring engineer would evaluate a production codebase, not only the way an academic project is normally graded.

---

## Future Enhancements

- **Collaborative practice rooms** — real-time multi-user sessions where a teacher and student (or a band) view the same chord timeline together.
- **Public developer API** — expose the analysis pipeline to third-party developers with its own API-key tier and usage-based billing.
- **Desktop application** — a native desktop build for DAW-adjacent workflows (drag a stem directly into a session).
- **Automatic difficulty-adjusted practice plans** — turn a single analyzed song into a structured multi-week practice curriculum.
- **Expanded instrument coverage** — genre- and instrument-specific fine-tuning of the chord/difficulty models beyond the current guitar/piano/vocal focus.
- **Offline mobile mode** — cache a limited on-device model for basic chord detection without a network connection.
