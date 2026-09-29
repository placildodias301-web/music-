# Wilsify AI — Release Versions

**Document type:** Release Planning Guide  
**Version:** 1.0 — June 2026  
**Status:** Active  
**Audience:** Solo developer today; expandable to a team without restructuring  
**Companion documents:** [PRODUCT.md](../product/PRODUCT.md), [PROJECT_PLAN.md](PROJECT_PLAN.md), [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), [CHANGELOG.md](CHANGELOG.md)

> This document answers *which features belong to which version*, *when breaking changes may occur*, and *how the product evolves across major releases*. `PRODUCT.md` answers what to build. `PROJECT_PLAN.md` answers when and in what order. This document answers how the numbered versions are organised and what each one represents.

---

## 0. Phase History (Pre-v1.0.0)

*Merged from the former standalone `ROADMAP.md` (retired — this section is now the single source for pre-launch phase history; forward-looking roadmap content lives in Section 4 below and in `PROJECT_PLAN.md`).*

### Phase 1 — Landing Page
- Static landing page (`web/`) deployed to GitHub Pages
- Product description, feature list, pricing table
- CI: auto-deploy via `deploy.yml` on push to `main`

### Phase 2 — Backend Foundation
- Fastify 5 REST API, PostgreSQL 16 via Prisma ORM
- JWT authentication (access + refresh tokens, rotation, revocation)
- Password reset flow (email link, hashed token, single-use)
- Credit ledger system (append-only, balance from last row)
- BullMQ analysis queue with Redis, Cloudflare R2 object storage
- Song management (create, list with pagination, delete)
- `@fastify/swagger` + Swagger UI at `/docs`
- Global error handler, Zod environment validation, `@fastify/helmet`, rate limiting

### Phase 3 — AI Service
- FastAPI microservice; full analysis pipeline (BPM, key, scale, energy, chord detection)
- Difficulty scoring heuristic; MIDI export via music21; sheet music PDF via music21 + LilyPond
- Stem separation via Demucs `htdemucs` (vocals/drums/bass/other)
- Celery workers (fast_queue ~10s, slow_queue ~120s)
- Real-time chord detection via autocorrelation pitch estimation
- `X-Internal-Secret` authentication on all AI service endpoints

### Phase 4 — Mobile App
- Expo SDK 54 React Native app (iOS + Android)
- Upload via file picker, YouTube URL, microphone recording
- Song analysis view, AI Tutor chat (PRO+), chromatic tuner (8 tunings, plan gating)
- Real-time chord detection via Socket.IO (PRO+), community feed with likes
- Stripe / Razorpay / Apple IAP / Google Play billing, push notifications, onboarding flow

### Phase 5 — Next.js Web Dashboard
- Next.js 14 App Router; auth pages; dashboard with KPIs, recent songs, analysis history
- Song analysis viewer, AI Tutor chat page (PRO+), billing page, admin panel
- PostHog analytics, Sentry error reporting, centralised API client with auto token refresh
- Zustand auth store (in-memory only, no localStorage), Socket.IO provider

### Phase 6 — Billing & Admin Polish
- Apple IAP + Google Play webhook handlers; webhook idempotency (Redis NX, 24h TTL)
- Admin overview/user-list/queue-health endpoints; community posts + likes
- In-app notification system; stats endpoints

### Phase 6.1 — Launch Remediation (June 2026)
- Double-credit fix (idempotency on `POST /songs/:id/analyze`)
- Email verification (`EmailVerification` model, `requireVerified` middleware on uploads/tutor)
- Monthly credit reset (BullMQ cron), Tutor usage limits (Redis monthly counter)
- Stem entitlements resolved at enqueue time; Razorpay `timingSafeEqual` HMAC check
- Stripe `invoice.payment_failed` → `past_due` handling
- AI service production secret enforcement (`sys.exit(1)` if unset)
- Backend Dockerfile hardening (multi-stage, non-root, healthcheck, migrations on start)
- PostgreSQL + Redis persistence in docker-compose; `SongService` pagination
- Test suite expansion (56 tests, 9 files); `docs/deployment/BACKUP_STRATEGY.md` written

Phases 7–9 (Sprints 5–9: AI service hardening, shared package unification, production hardening, release-candidate audit, v1.0.0 release validation) are documented individually in `docs/releases/`. See `docs/releases/SPRINT6_SHARED_REPORT.md` through `docs/releases/SPRINT9_RELEASE_REPORT.md` and `docs/releases/v1.0.0.md`.

---

## 1. Versioning Strategy

Wilsify AI follows [Semantic Versioning 2.0.0](https://semver.org): **MAJOR.MINOR.PATCH**.

### Major Versions

A major version bump signals a significant shift in the product's scope, architecture, or API surface. Major versions may introduce breaking changes to public contracts — the external REST API, the webhook payload shape, and published SDK interfaces.

Major versions are not released frequently. Each represents a cohesive generation of the product with a clear identity: v1 is the public foundation, v2 is growth and developer adoption, v3 is the platform release, and so on.

Breaking changes **only** occur in major versions. They are announced in the previous minor release cycle with a documented migration path and a minimum 90-day deprecation window before removal.

### Minor Versions

A minor version adds new features and improvements in a backward-compatible way. Existing API contracts are preserved. Existing integrations continue to function without modification.

Minor versions are the primary cadence of feature delivery. A minor release may introduce new endpoints, new plan entitlements, new analysis capabilities, or new platform surfaces, as long as nothing existing breaks.

Minor versions follow the pattern v1.1, v1.2, v1.3 up to approximately v1.5 within any major version, before the next major cycle begins.

### Patch Versions

A patch version contains bug fixes, security patches, and infrastructure corrections only. No new features. No deprecations. No changed behaviour. A patch is always safe to apply.

Patches may be released at any time in response to a production incident, a security disclosure, or accumulated small fixes. They do not require a migration step and do not appear in the feature roadmap.

### Pre-Release Labels

Before a stable release, versions carry a pre-release suffix:

| Label | Meaning |
|---|---|
| `-dev` | Active development; not feature-complete |
| `-alpha` | Internal testing only; may be unstable |
| `-beta` | External testing available; features complete, bugs expected |
| `-rc.N` | Release candidate; production-equivalent, final validation in progress |

Example sequence: `v1.0.0-dev` → `v1.0.0-beta.1` → `v1.0.0-rc.1` → `v1.0.0`

---

## 2. Current Version

| Dimension | Value |
|---|---|
| **Current Development Version** | v1.0.0 |
| **Current Stable Version** | v1.0.0 — Public Launch |
| **Current Target Release** | v1.1.0 (Engagement) |
| **Repository Version** | v1.0.0 (Sprint 9 release validation complete; GO issued) |
| **Status** | Stable — public launch release |
| **Last Updated** | July 2026 |

The product was built to feature-complete status (v0.8.0) before public launch. All Phase 1 product features — authentication, music analysis, AI Tutor, billing, community, push notifications, and administration — are implemented and production-ready. Three dedicated production-hardening sprints (Sprints 7, 8, 9) brought the repository from v0.8.0 to v1.0.0: security hardening, CI/CD gaps closed, Docker health checks fixed, full validation suite passing, and documentation corrected throughout.

---

## 3. Release Lifecycle

Every version passes through the following stages. Not every stage is publicly visible; internal stages gate access to the next step.

| Stage | Description | Exit Criterion |
|---|---|---|
| **Planning** | Features scoped, acceptance criteria written, phase checklist drafted | All items in checklist are defined and prioritised |
| **Development** | Implementation in progress on `main` or a feature branch | All checklist items complete; build and type-check pass |
| **Testing** | Internal QA: unit tests, integration tests, manual smoke testing on staging | All tests pass; smoke test checklist 100% clear |
| **Beta** | Selected external users access the build under `v1.x.0-beta` label | No P0 issues after 7 days of beta traffic |
| **Release Candidate** | Identical to the intended stable build; final validation only | No issues found within 72 hours on RC traffic |
| **Stable** | Public release; all users on this version | — |
| **Maintenance** | Only patch releases; no new features | All development effort shifts to the next minor or major |
| **Deprecated** | Announced end-of-life; users given migration path | Deprecation window (90 days minimum) expires |
| **Archived** | No further support; version removed from active infrastructure | — |

At any given time, the repository actively supports:
- The current stable version (full support)
- The previous minor version (security patches only, 6-month window)

---

## 4. Version Roadmap

The six major versions below represent the complete planned evolution of Wilsify AI from its public launch through platform maturity. Each major version has a clear identity and gates the next.

---

### v1.x — Foundation

**Vision:** Establish Wilsify AI as the most accessible and accurate music analysis tool on any device. Prove that musicians will pay for AI-powered song understanding and return daily to use it.

**Goals:**
- Publicly launch with all core music intelligence features stable and reliable
- Deliver the engagement features that convert curious users into habitual ones
- Reach 10,000 registered users and 2,000 paying subscribers
- Prove AI Tutor retention value through measurable D30 retention improvement

**Expected Features:**
- Full analysis pipeline (chords, BPM, key, scale, Camelot, difficulty, MIDI, sheet music, stems)
- AI Tutor (PRO and STUDIO plans)
- Practice mode with section looping and tempo control
- Song Insights and Practice Recommendations (AI-generated commentary)
- Live chord detection and instrument tuner (mobile)
- Song sharing (public and unlisted links)
- Community feed (posts, likes)
- Credits system and four-tier subscription model
- Push notifications on analysis completion

**Technical Goals:**
- Analysis P95 latency below 90 seconds at steady-state load
- API P95 latency below 150 ms for non-AI endpoints
- Test coverage above 60% across backend and web-app
- Zero critical security vulnerabilities in any release
- GPU inference path available for Demucs stem separation (below 60 seconds)

**Success Criteria:**
- 10,000 registered users
- 2,000 paying subscribers
- D30 retention above 20%
- Analysis success rate above 99%
- No P0 incidents within 30 days of v1.0 launch

**What Will NOT Be Included:**
- Public developer API (v2.x)
- Desktop or browser extension (v3.x)
- Team or enterprise accounts (v4.x)
- Plugin marketplace (v5.x)
- Collaborative real-time sessions (v3.x)
- Multi-language support (v3.x)
- Batch upload (v4.x)

**Estimated Readiness:** Q3–Q4 2026

---

### v2.x — Growth

**Vision:** Transform Wilsify AI from a personal tool into a networked platform. Developers can build on it. Users bring others to it. The community creates organic reach that paid acquisition cannot.

**Goals:**
- Launch a public developer API that powers at least one third-party integration
- Grow the community into a self-sustaining feature with organic song discovery
- Reach 50,000 registered users and 8,000 paying subscribers
- Generate measurable organic acquisition from shared song links

**Expected Features:**
- Developer API (`/api/public/v1/`): audio submission, analysis retrieval, AI Tutor access; API key authentication; rate-limited by tier
- OpenAPI documentation at `/api/public/docs`
- Community trending feed (algorithmic and time-based)
- Collaborative song annotations (comments on specific chords and timestamps)
- Advanced admin analytics dashboard (revenue cohorts, retention funnels, queue performance)
- Referral program with credit rewards
- Moderator tools (report review, content removal, community moderation queue)
- Batch upload (multiple audio files in one operation)
- MusicXML and GuitarPro export
- Setlist builder (organise songs by key for harmonic mixing)
- Public song library (community-curated, opt-in, browsable by key, BPM, genre)
- Karaoke mode (use stems to mute individual instruments during playback)

**Technical Goals:**
- API versioning strategy in place before v2.0 ships
- Developer API rate limits enforced at infrastructure level, not application level
- Admin analytics queries optimised with composite indexes and materialised views
- Analysis P95 below 60 seconds with GPU path as default on STUDIO and ENTERPRISE

**Success Criteria:**
- Developer API live with at least one documented third-party integration
- Community trending feed drives 15% of new user registrations via shared links
- 50,000 registered users
- MRR growth rate above 10% month-over-month

**What Will NOT Be Included:**
- Desktop application (v3.x)
- Browser extension (v3.x)
- Team accounts (v4.x)
- Plugin marketplace (v5.x)
- On-device AI inference (v5.x)

**Estimated Readiness:** 2027

---

### v3.x — Platform

**Vision:** Wilsify AI leaves the browser and arrives everywhere musicians work: on the desktop next to their DAW, in the browser while watching YouTube, and in shared sessions with teachers and collaborators.

**Goals:**
- Ship a desktop application that integrates with DAW workflows
- Ship a browser extension that makes YouTube a chord analysis surface
- Launch team accounts for music schools and teaching studios
- Establish a plugin marketplace foundation that enables community-contributed extensions
- Reach 100,000 monthly active users

**Expected Features:**
- Electron desktop application (macOS and Windows)
  - Native file system drag-and-drop from DAW project folders
  - Direct MIDI export into Ableton, Logic, and GarageBand session folders
  - Offline song history (cached from cloud)
- Chrome and Firefox browser extension
  - YouTube in-page chord overlay as the video plays
  - Automatic lookup for previously analysed tracks
  - One-click analysis trigger from within the extension
- Team accounts: music schools, teaching studios, bands
  - Student management: invite, remove, view activity
  - Teacher view: see all student song libraries and analysis activity
  - Shared song collections within a team
- Collaborative practice sessions: two users, same song, shared annotations in real time
- Plugin marketplace foundation
  - Third-party developer registration and review process
  - Plugin distribution pipeline (versioned, signed, sandboxed)
  - Initial plugin categories: genre-specific analysis (jazz, classical, flamenco)
- Multi-language UI: Spanish, Portuguese, French, German
- Chord diagram generation: guitar, piano, and ukulele voicings for each detected chord
- Audio recording in browser (short clips for live detection without the mobile app)

**Technical Goals:**
- Desktop app distributed via Mac App Store and Microsoft Store
- Browser extension approved on Chrome Web Store and Firefox Add-ons
- Real-time collaborative sessions built on WebRTC or Socket.IO rooms with operational transforms
- Plugin sandbox: WASM-based, no access to user audio data without explicit permission
- Internationalisation (i18n) framework in place across all client surfaces

**Success Criteria:**
- Desktop app published on both Mac App Store and Microsoft Store
- Browser extension live on Chrome Web Store with more than 1,000 weekly active users
- At least 10 active team accounts in the music school or teaching studio category
- Plugin marketplace open with at least 5 published third-party plugins

**What Will NOT Be Included:**
- On-device AI model inference at full analysis quality (v5.x)
- Enterprise SLA contracts (v4.x)
- Emotional character detection (v6.x)
- AI practice coaching in real time (v6.x)

**Estimated Readiness:** 2027–2028

---

### v4.x — Enterprise

**Vision:** Wilsify AI becomes the institutional standard for music education. Schools, conservatories, and large teaching organisations manage student learning at scale, with analytics that prove outcomes.

**Goals:**
- Launch a formal enterprise tier with SLA-backed contracts
- Build student management and progress analytics tools for music institutions
- Expand the developer API to v2 with full graph and webhook capabilities
- Reach 200,000 monthly active users
- Close at least 10 enterprise contracts with music schools or publishers

**Expected Features:**
- Music school enterprise tier
  - Organisation-level account with multi-seat licensing
  - Student onboarding via invitation codes or SSO
  - Progress tracking: songs analysed, time spent, difficulty curve
  - Automated practice curriculum generation: given a song and a skill level, generate a 4-week daily practice plan
  - Teacher-generated assignments (analyse this song, practice this section)
  - Exportable progress reports (PDF, CSV)
- Advanced admin analytics (enterprise view): cohort revenue, per-institution usage, churn indicators
- Developer API v2
  - Webhook subscriptions (analysis completion, tutor session events)
  - Batch analysis endpoint (up to 50 songs per request)
  - Full graph query capability (search by key, BPM, difficulty, genre across all analysed songs)
- Custom instrument tuning (arbitrary tuning presets beyond the 8 shipped defaults)
- Instrument auto-detection from audio (identifies primary instrument in the uploaded track)
- GuitarPro export (full chord progression exported in GP7 format)
- AI-generated practice exercises from chord difficulty patterns in a specific song

**Technical Goals:**
- SSO support: SAML 2.0 and OAuth 2.0 for institutional login
- Webhook delivery with exponential backoff, dead-letter queue, and replay endpoint
- API v2 deployed alongside API v1 with a documented migration window
- Batch analysis endpoint backed by a dedicated high-concurrency worker pool
- Instrument auto-detection model evaluated for accuracy across 5 primary instrument classes

**Success Criteria:**
- 10 active enterprise contracts
- Progress report feature in active use by at least 3 institutions with more than 100 students each
- Developer API v2 has at least 3 active integrations using webhooks or batch endpoints
- 200,000 monthly active users

**What Will NOT Be Included:**
- AI inference on user-contributed datasets (v6.x)
- Emotional character detection (v6.x)
- Full on-device analysis (v5.x)
- Plugin marketplace maturity features (v5.x)

**Estimated Readiness:** 2028–2029

---

### v5.x — Marketplace

**Vision:** Wilsify AI becomes an open ecosystem. Third-party developers, educators, and musicians contribute to the platform. The community library and plugin marketplace create compounding network value — the more people use it, the more valuable it becomes for everyone.

**Goals:**
- Grow the plugin marketplace to a self-sustaining developer economy
- Establish Wilsify as the canonical public API for music analysis — the reference integration for music education apps, DAW tools, and guitar tab sites
- Build a community-curated song library at meaningful scale (100,000+ analysed songs)
- Integrate with at least 5 major music education or creator platforms
- Reach 500,000 monthly active users

**Expected Features:**
- Plugin marketplace maturity
  - Revenue sharing for paid plugins (developer retains 70%)
  - Community ratings, reviews, and editorial curation
  - Genre-specific modules from specialist contributors: jazz chord substitution detection, classical voice-leading analysis, flamenco compás rhythm patterns
  - Instrument-specific plugins: brass transposition, guitar capo adjustment, vocal range analysis
- Difficulty progression recommendations at scale
  - AI model trained on anonymised user data (opt-in) predicts how long a song will take to learn based on the user's history
  - Suggests the next song in a skill progression
  - Genre and instrument-aware curriculum generation
- Third-party integrations
  - DAW plugin (VST/AU format) that calls the Wilsify API from within Ableton, Logic, or Pro Tools
  - Guitar tab site integrations: chord overlays on tab pages
  - Music education platform integrations: LMS plugins for institutions using Canvas, Schoology, or Moodle
- Multi-language AI Tutor: responds in the user's language with culturally appropriate theory explanations
- Dataset-powered analysis improvements
  - Models fine-tuned on community-contributed and consented audio data
  - Chord detection accuracy above 95% across all major genres
  - Genre classification added to the analysis output
- Real-time collaborative annotation with operational transforms: two users annotate the same song simultaneously, changes merge without conflicts

**Technical Goals:**
- Plugin SDK published with versioning guarantees and a compatibility matrix
- Developer marketplace backend: payment processing, revenue split, fraud detection
- Fine-tuned chord detection model benchmarked against MIREX standards
- Operational transforms for collaborative annotations proven at 100+ concurrent users per session
- API v3 with full capabilities: graph queries, streaming, webhooks, batch, public library access

**Success Criteria:**
- 50 active third-party plugins in the marketplace
- At least one paid plugin with more than 1,000 active installs
- 500,000 monthly active users
- 100,000+ songs in the public community library
- Chord detection accuracy above 95% in benchmark testing across pop, rock, jazz, and classical genres

**What Will NOT Be Included:**
- AI emotional character detection as a consumer feature (v6.x — requires deeper research validation)
- Full AI-to-AI automation pipelines (v6.x)
- Real-time performance feedback while playing a physical instrument (v6.x)

**Estimated Readiness:** 2029–2030

---

### v6.x — AI Platform

**Vision:** Wilsify AI becomes the intelligence infrastructure for the music world. Developers build on it not as a music tool but as an AI service. The platform automates what used to require human expertise, and enables entirely new categories of application that were not possible before.

**Goals:**
- Publish a first-class developer SDK with client libraries in at least three languages
- Enable automation pipelines where AI analysis triggers AI practice coaching triggers AI curriculum generation with no human intervention
- Reach 1,000,000 monthly active users across all surfaces
- Achieve the "Stripe for music intelligence" positioning: the platform that any developer reaches for when they need music AI

**Expected Features:**
- Developer SDK: first-class client libraries for Python, TypeScript, and Swift; auto-generated from the OpenAPI schema; versioned and published to npm, PyPI, and Swift Package Index
- Automation framework
  - Trigger-and-action pipelines: "when analysis completes → generate practice curriculum → notify student → log to LMS"
  - Webhook-native: every platform event is addressable as a trigger
  - No-code automation builder for institutional administrators
- AI practice coaching in real time
  - Listens to the user playing via microphone
  - Detects which chords the user is playing vs. which chords the song requires
  - Provides real-time feedback on accuracy, timing, and common mistakes
  - Compares the user's performance across sessions to detect improvement
- Emotional character detection
  - AI-generated description of a song's emotional character: tense, melancholic, energetic, peaceful
  - Based on harmonic content, rhythm density, key, and BPM in combination
  - Delivered as part of the Song Insights output
- Genre-specific analysis extensions as first-party modules
  - Jazz: secondary dominant analysis, tritone substitutions, quartal harmony detection
  - Classical: voice leading analysis, counterpoint rules, cadence classification
  - Flamenco: compás rhythm pattern classification, palo identification
- Full on-device inference option (WASM-based, compressed models)
  - Basic chord detection available offline on mobile and desktop
  - Falls back to server for full analysis pipeline
- AI curriculum generation at institutional scale
  - Given a class of 30 students with different skill levels and instruments, generate 30 personalised 12-week curricula automatically
  - Progress tracking across the full curriculum lifecycle

**Technical Goals:**
- SDK code generation pipeline automated from OpenAPI schema changes
- Real-time practice coaching latency below 100 ms chord-to-feedback
- On-device WASM model compressed to below 20 MB with above 85% chord detection accuracy
- Automation pipeline execution engine with at-least-once delivery and dead-letter recovery
- Genre-specific models benchmarked against specialist ground truth datasets

**Success Criteria:**
- Developer SDK published and actively used by at least 20 external projects
- Real-time practice coaching feature in active use with measurable D30 improvement for mobile users
- 1,000,000 monthly active users across all surfaces
- Automation pipelines actively used by at least 5 enterprise institutions
- Wilsify API cited or integrated in at least one peer-reviewed music education research paper

**What Will NOT Be Included:**
- Music generation or composition (out of scope by product principle)
- Music streaming or distribution (out of scope by product principle)
- Social networking beyond community feed and shared analyses (out of scope by product principle)
- Audio recording and editing (out of scope by product principle)

**Estimated Readiness:** 2030 and beyond

---

## 5. Minor Releases

### v1.x Series

---

#### v1.0 — Public Launch

**Purpose:** Open the product to the public for the first time.

**Major Features:**
- User registration, email verification, login, password reset
- Song upload (MP3, WAV, FLAC, M4A; YouTube URL import)
- Full analysis pipeline: chords, BPM, key, scale, Camelot key, energy, difficulty
- MIDI export
- Sheet music PDF export
- Stem separation (4 tracks: vocals, drums, bass, other)
- Chord timeline with synced audio playback
- AI Tutor (PRO and STUDIO plans)
- Song history
- Subscription management: Stripe, Razorpay, Apple IAP, Google Play
- Credits system (welcome credits, purchasable bundles)
- FREE, PRO, STUDIO, ENTERPRISE plans
- Push notifications on analysis completion
- Community feed (posts, likes)
- Admin panel (user management, queue monitoring, platform analytics)
- Web application (Next.js) and mobile application (Expo iOS + Android)

**Improvements:** Repository standardized, staging environment validated, App Store and Google Play approved.

**Performance:** Analysis P95 below 90 seconds. API P95 below 150 ms.

**Developer Experience:** Backend ESLint foundation, Prettier formatting, Node 22 alignment across all services.

**Known Risks:** App Store review delay; real traffic may surface analysis queue reliability issues not visible in staging.

**Release Status:** Stable — Released 2026-07-03

---

#### v1.1 — Engagement

**Purpose:** Deliver the features that move users from occasional visitors to daily practitioners.

**Major Features:**
- Practice mode: section looping, BPM adjustment for slow practice, drill mode for individual chords
- Song sharing: public and unlisted links; shared analysis accessible without login

**Improvements:** Community feed improvements (filtering by instrument, key, genre); notification preferences; onboarding flow refinement based on first 30-day retention data.

**Performance:** Response caching for read-heavy endpoints (song list, stats pages). First composite database indexes based on observed production query patterns.

**Developer Experience:** Web-app unit test coverage raised above 60%. Playwright E2E suite covering the critical user path.

**Known Risks:** Practice mode UX requires user research from real v1.0 usage patterns to validate the looping interface.

**Release Status:** Planned

---

#### v1.2 — AI Enrichment

**Purpose:** Surface AI-generated insight for every analysed song, giving users a reason to return to songs they have already analysed.

**Major Features:**
- Song Insights: AI-generated plain-language commentary on what makes a song musically interesting — unusual chord substitutions, borrowed chords, interesting rhythm patterns, genre-defining characteristics
- Practice Recommendations: AI-generated practice suggestions tailored to the song's difficulty and the user's instrument

**Improvements:** AI Tutor context window improved (remembers the user's instrument and stated skill level within the session). Analysis result page redesigned to surface Song Insights prominently.

**Performance:** Prompt caching for Song Insights generation (reduce Anthropic API cost on repeated requests for popular songs). Analysis queue priority adjusted to run Insights generation asynchronously after core analysis completes.

**Developer Experience:** Shared package (`@wilsify/shared`) established as single source of truth for all domain types. Web-app and mobile both import from shared instead of local type definitions.

**Known Risks:** Prompt engineering for Song Insights requires careful validation to avoid musically incorrect explanations. Quality review process required before enabling for all users.

**Release Status:** Planned

---

#### v1.3 — Mobile Parity

**Purpose:** Bring mobile feature completeness to the same level as the web application, and ship the real-time features that differentiate the mobile experience.

**Major Features:**
- Live chord detection fully stable on iOS and Android (real-time microphone → chord display with sub-300 ms latency)
- Instrument tuner: pitch detection, note name display, cents deviation indicator, standard and custom tuning presets
- Full analysis result view on mobile: chord timeline playback, MIDI download, sheet music viewer, stems player

**Improvements:** Mobile TypeScript errors resolved (React 18 / Expo type compatibility). Mobile performance profiling pass: render time, scroll performance, memory usage. Background audio session handling on iOS.

**Performance:** Mobile analysis queue polling optimised to use WebSocket updates instead of polling. Push notification delivery reliability above 99%.

**Developer Experience:** Mobile workspace properly connected (`@wilsify/shared` types used throughout mobile). ESLint added to mobile.

**Known Risks:** React 18 + Expo SDK 54 type compatibility errors (80+ known issues across 15 files) must be resolved; may require Expo SDK upgrade.

**Release Status:** Planned

---

#### v1.4 — Scale

**Purpose:** Harden the infrastructure to handle 10× current load without degradation.

**Major Features:** None. This is an infrastructure and performance release.

**Improvements:**
- GPU inference path live for Demucs stem separation (below 60 seconds at STUDIO tier)
- Composite database indexes on all high-frequency query patterns identified in production
- Analysis queue observability: BullMQ dashboard, dead-letter queue alerts, concurrency telemetry
- Redis caching layer for read-heavy API endpoints (song list, stats, community feed)
- API P95 latency below 150 ms verified under 10× simulated load

**Performance:** This entire release is a performance release. Every shipped item must include a before/after benchmark.

**Developer Experience:** Backend test coverage raised from 30% to 60%. Integration test suite against real database added for the upload → analysis queue path.

**Known Risks:** GPU inference on Modal.com introduces a new infrastructure dependency. If Modal.com is unavailable, the system must fall back to CPU gracefully.

**Release Status:** Planned

---

#### v1.5 — Community Depth

**Purpose:** Deepen the community features from a basic feed into a discovery layer that surfaces the best of the community's analysed songs.

**Major Features:**
- Community trending feed: algorithmic ranking by likes, shares, and engagement over time
- Song re-analysis: users can trigger a fresh analysis of any previously uploaded song to pick up model improvements
- Difficulty rating display in the community feed: users can filter by difficulty before exploring a song

**Improvements:** Moderator tools: community report review queue, content removal, warning system. Admin analytics improved: daily active users per tier, analysis success rate tracking, Tutor message usage per user. Community feed pagination and infinite scroll performance.

**Performance:** Community feed query optimised with materialised rankings updated on a 5-minute interval rather than computed on request.

**Developer Experience:** Backend module structure refactored: `redis.ts` moved from `services/` to `plugins/`; scheduler worker moved from `services/` to `workers/`. Folder ownership semantics correct throughout.

**Known Risks:** Trending algorithm requires careful tuning to avoid surfacing inappropriate content before moderator tools are fully operational.

**Release Status:** Planned

---

### v2.x Series

---

#### v2.0 — Developer API

**Purpose:** Open Wilsify AI to third-party developers and grow through integrations and organic community reach.

**Major Features:** Public developer API, community trending feed, collaborative annotations, referral program, moderator tools. See Section 4 (v2.x) for full scope.

**Improvements:** API v1 routes versioned and stabilised. OpenAPI schema published at `/api/public/docs`.

**Performance:** API rate limiting enforced at infrastructure level. Batch analysis endpoint available.

**Developer Experience:** API changelog maintained alongside `CHANGELOG.md`. SDK generation pipeline drafted.

**Known Risks:** Public API introduces a versioning commitment. Any future change to API v1 requires the 90-day deprecation process.

**Release Status:** Planned

---

#### v2.1 — Export Expansion

**Purpose:** Add export formats that serve advanced musicians and DAW users.

**Major Features:** MusicXML export. GuitarPro 7 export. Setlist builder (organise analysed songs by key for harmonic DJ mixing or rehearsal sequencing).

**Improvements:** MIDI export quality improvements: velocity information derived from energy analysis; time signature detection for compound metres.

**Performance:** Export generation moved to a dedicated background queue separate from the analysis queue.

**Known Risks:** GuitarPro format is partially documented; output may require manual verification against the GP7 specification.

**Release Status:** Planned

---

#### v2.2 — Discovery

**Purpose:** Help users find their next song and understand their musical progression.

**Major Features:** Public song library (browsable by key, BPM, genre, difficulty; opt-in for users who have shared analyses). Karaoke mode: use existing stem separation to mute selected instruments during chord timeline playback.

**Improvements:** Community feed filters expanded: filter by instrument, key, BPM range, difficulty, genre. Profile page shows public song library for users who opt in.

**Performance:** Public song library backed by a read-optimised index with full-text search on song title and artist.

**Known Risks:** Public song library requires clear copyright guidance — users share analysis results (keys, chords), not audio files, but the policy should be documented explicitly.

**Release Status:** Planned

---

#### v2.3 — Progression

**Purpose:** Turn Wilsify from a per-song tool into a long-term learning companion.

**Major Features:** Difficulty progression recommendations: AI suggests the next song in a skill progression based on the user's analysis history, instrument, and stated genre preferences. Batch upload (up to 10 songs in a single operation for STUDIO and ENTERPRISE plans).

**Improvements:** Song history UI redesigned to show learning curve: difficulty over time, genre distribution, key frequency.

**Performance:** Recommendation engine runs asynchronously after each new analysis; result cached until new analysis invalidates it.

**Known Risks:** Difficulty progression recommendations require enough analysis history to be useful (typically 10+ songs). New users will see a "build your library first" placeholder.

**Release Status:** Planned

---

#### v2.4 — Moderation and Safety

**Purpose:** Harden community safety features to scale with a growing user base.

**Major Features:** Expanded moderator tools: bulk content review, appeal workflow, automated flagging for common policy violations. User reporting improvements: category selection, optional additional context. Community health dashboard for admin.

**Improvements:** Content moderation queue performance for high-volume review periods. Notification system extended to notify moderators of new reports immediately.

**Performance:** Automated flagging pipeline runs as a background job; does not block the post creation flow.

**Known Risks:** Automated flagging may produce false positives for musical content that superficially matches policy violation patterns (e.g., song titles or lyrics references in analysis commentary).

**Release Status:** Planned

---

#### v2.5 — Annotation

**Purpose:** Let the community add human knowledge on top of AI analysis.

**Major Features:** Collaborative song annotations: comments attached to specific chords or timestamps in the analysis. Community users can add theory annotations ("this is a tritone substitution"), corrections to detected chords, or practice tips. Upvote/downvote on annotations.

**Improvements:** Analysis result page redesigned to accommodate inline annotations without cluttering the chord timeline.

**Performance:** Annotations stored and served from a separate table with denormalised counts to avoid joining on every chord timeline render.

**Known Risks:** Annotations require moderation at scale. Spam and off-topic annotations need filtering before they become visible to all users.

**Release Status:** Planned

---

### v3.x — v6.x Series

Minor releases for v3.x through v6.x will be detailed in full when each major version enters active development. Expanding all minor releases at this stage would introduce false precision into plans that are 2–5 years out.

The pattern within each major release cycle follows the same structure: the .0 release ships the defining capability, and .1 through .5 deepen, harden, and extend it based on real production data from .0 users.

Planned focus areas for each major series' minor cycles:

| Series | Minor Release Focus Areas |
|---|---|
| v3.x | Desktop stability, browser extension features, team management depth, plugin SDK maturity, i18n coverage, collaborative sessions |
| v4.x | Enterprise SSO, progress report formats, API v2 features, instrument detection accuracy, GuitarPro export quality, practice curriculum variations |
| v5.x | Plugin marketplace economy, model fine-tuning releases, third-party integration depth, community library curation, collaborative annotation scale |
| v6.x | SDK language support, automation pipeline capabilities, on-device model compression, real-time coaching accuracy, AI curriculum personalisation |

---

## 6. Breaking Change Policy

Breaking changes are changes that require an existing user, client, or integration to modify their behaviour or configuration to continue working correctly.

### What Counts as Breaking

- Removing or renaming an API endpoint
- Changing the shape of an API request or response (removing a field, changing a type)
- Changing the authentication mechanism or token format
- Removing a plan tier or entitlement that paying users currently have
- Removing a webhook event type that integrators may be consuming
- Changing the meaning of a returned value without renaming it
- Removing a feature that is listed in an active subscription contract

### What Does Not Count as Breaking

- Adding new optional fields to an API response
- Adding a new endpoint
- Adding a new plan tier
- Adding a new webhook event type
- Bug fixes that change incorrect behaviour to correct behaviour
- Performance improvements
- Internal architecture changes with no externally visible effect
- Changes to the admin panel or internal tooling

### Policy Rules

1. Breaking changes only occur in major versions (v2.0, v3.0, etc.).
2. The preceding minor version (e.g., v1.5) announces the upcoming breaking change and provides a migration guide.
3. A minimum 90-day deprecation window is maintained between the deprecation announcement and the removal.
4. During the deprecation window, the old and new behaviour both work. The old behaviour returns a deprecation warning in the API response header (`Deprecation` and `Sunset` headers per RFC 8594).
5. Mobile app users cannot be force-updated. Any breaking change to the API must maintain the previous contract for at least 6 months after the major release to allow for App Store propagation.
6. Enterprise contracts that reference specific API versions are honoured for the full contract term, regardless of the deprecation timeline.

---

## 7. Release Checklist

Every stable release — patch, minor, or major — must clear every item on this checklist before the version tag is applied. No exceptions. A release with a known unchecked item is not a release; it is a beta.

### Universal (All Releases)

- [ ] `npm run build` succeeds in every changed package
- [ ] `npm run type-check` passes in every changed package
- [ ] `npm run lint` passes with zero errors (warnings reviewed; no new errors)
- [ ] `npm run test` passes; coverage does not drop below thresholds
- [ ] `npx prettier --check .` returns clean
- [ ] All database migrations have been tested on a staging database with production-equivalent data volume
- [ ] `CHANGELOG.md` entry written for this version
- [ ] `docs/PROJECT_PLAN.md` phase checklist updated to reflect this release
- [ ] Version number bumped in all relevant `package.json` files

### For Minor and Major Releases (in addition to Universal)

- [ ] API compatibility verified: all existing API contracts honoured
- [ ] New API endpoints documented in OpenAPI schema and `API.md`
- [ ] New environment variables added to all `.env.example` files
- [ ] Architecture changes reflected in `ARCHITECTURE.md`
- [ ] Security review completed for any change touching authentication, billing, file handling, or webhook processing
- [ ] Performance review: no new P95 regressions on monitored endpoints
- [ ] Smoke test checklist executed on staging against production-equivalent data
- [ ] Release notes published (users notified via in-app banner and email for significant changes)

### For Major Releases (in addition to all above)

- [ ] Breaking change migration guide published at least 90 days before this release
- [ ] Deprecation warnings active in the previous version since the announcement
- [ ] Mobile app compatibility verified: the old API contract still works for the deprecation window period
- [ ] Enterprise contract review: no active contracts broken by this release
- [ ] `VERSIONS.md` updated to reflect the new current version and move the previous version to Maintenance

---

## 8. Changelog Policy

Every version entry in `CHANGELOG.md` uses the following structure. Sections that have no entries are omitted.

```markdown
## [vX.Y.Z] — YYYY-MM-DD

### Added
New features and capabilities that did not exist before.

### Changed
Modifications to existing features that alter behaviour in a visible way.

### Improved
Performance improvements, UX improvements, accuracy improvements.

### Fixed
Bug fixes and corrections to incorrect behaviour.

### Deprecated
Features or API contracts that will be removed in the next major version.

### Removed
Features or API contracts removed in this version (previously deprecated).

### Security
Security fixes, vulnerability patches, or changes to the security model.
```

**Rules:**
- Every line in the changelog is written for the end user or integrator, not the developer. "Fixed an off-by-one error in the chord timestamp calculation" is not useful; "Fixed a bug where detected chord timestamps were offset by one beat for songs with a pickup bar" is.
- Patch releases that fix a single bug get a single-line changelog entry. They do not require the full section structure.
- Internal changes (refactoring, test additions, dependency bumps without visible effect) are not logged in `CHANGELOG.md`. They belong in the commit history.
- The `Unreleased` section at the top of `CHANGELOG.md` accumulates entries during active development and is converted to a versioned entry at release time.

---

## 9. Future Ideas

The items below have been identified as potentially valuable but are not scheduled in any version. They are captured here to prevent recurring debate and to serve as input when a future major version is being planned.

**Analysis capabilities:**
- Sheet music scanning: photograph printed sheet music and convert to digital chord analysis
- Vocal pitch correction for reference: show the correct pitch for a melody line so a user can compare while practising singing
- Chord substitution suggestion: given a detected progression, suggest common substitutions that fit the same key
- Song comparison: show how two songs are harmonically related (shared key, shared chord vocabulary)
- Rhythm complexity score as a separate metric from harmonic difficulty

**Platform surfaces:**
- Smart TV application (Apple TV, Android TV) for chord display on a large screen while practising
- Voice interface integration (Siri Shortcuts, Google Assistant) for hands-free song lookup
- DAW plugin (VST/AU) as an alternative to the full desktop app for users who live in their DAW

**Community and social:**
- Following system: users can follow specific community members and see their new analyses in a personalised feed (not a full follower graph; the community feed remains the primary surface)
- Song challenges: a community-posted challenge to learn a specific song, with a date and a response thread
- Teacher marketplace: verified music teachers list their availability and rate; students book sessions through Wilsify

**AI and intelligence:**
- Genre classification as part of the analysis output (pop, jazz, blues, classical, flamenco, etc.)
- Lyric analysis: if lyrics are provided, detect the emotional theme and map it to the harmonic content
- Cross-song AI Tutor: the tutor is aware of multiple songs in the user's library and can compare them
- AI-generated chord sheets: produce a printable lead sheet (chord symbols above lyrics) for songs with known lyrics

**Infrastructure:**
- Self-hosted deployment option for enterprise customers who cannot send audio to a third-party cloud
- On-device full analysis for STUDIO and ENTERPRISE mobile users (large download, local GPU)
- Federated community: Wilsify community posts interoperable with ActivityPub-compatible platforms

None of these items will be scheduled until the relevant major version is in active planning and user research confirms the value.

---

## 10. Dashboard

*Update this section at the start of each release cycle.*

| Dimension | Value |
|---|---|
| **Current Development Version** | v1.0.0 |
| **Next Release** | v1.1.0 (Engagement) |
| **Latest Stable** | v1.0.0 — Public Launch (2026-07-03) |
| **Latest Beta** | None |
| **Repository Status** | Phase 2 in progress — code-complete and v1.0.0 tagged; staging environment, smoke tests, and store submission still open (see `PROJECT_PLAN.md` Phase 2 checklist) |
| **Overall Product Progress** | v1.0.0 released; full feature set live; staging + App Store submission are Phase 2 remaining items |
| **Active Roadmap Window** | v1.1 through v1.5 |
| **Versioning Policy** | Semantic Versioning 2.0.0 |
| **Last Updated** | July 2026 |

---

*This document tracks the version strategy and release roadmap for Wilsify AI. Update it after every release: bump the dashboard, move the released version's status to Stable or Maintenance, and expand the next major version's minor release detail when that major version enters active development. Do not add features to a version entry after that version has been released — use the next minor or major version instead.*

---

## Related Documents

- [../product/PRODUCT.md](../product/PRODUCT.md) — what to build
- [PROJECT_PLAN.md](PROJECT_PLAN.md) — when and in what order
- [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — how it is built
- [CHANGELOG.md](CHANGELOG.md) — what actually shipped, release by release
- [../README.md](../README.md) — documentation map
