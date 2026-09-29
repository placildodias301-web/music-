# PRODUCT.md — Wilsify AI

**Document type:** Product Reference  
**Audience:** Developers, designers, contributors, future team members  
**Companion documents:** [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), [VERSIONS.md](../development/VERSIONS.md) (roadmap — the former standalone `ROADMAP.md` was merged into `VERSIONS.md` §0 in July 2026)

---

## 1. Product Overview

### What Wilsify AI Is

Wilsify AI is an AI-powered music intelligence platform. It listens to any piece of audio — an uploaded file or a YouTube URL — and converts it into structured musical knowledge: chord progressions, key signature, tempo, scale, difficulty rating, MIDI file, sheet music PDF, and separated instrument stems. On top of that foundation sits an AI tutor that answers music theory questions grounded in the specific song the user is studying.

### Why It Exists

Learning to play music by ear is hard. The gap between hearing a song and understanding it — what chords it uses, what key it is in, how difficult it would be to play — is enormous for most musicians. Professional tools that close this gap are expensive, desktop-only, or limited to a narrow genre. Wilsify AI exists to make that gap disappear for any musician, on any device, for any genre, at a price that scales with their needs.

### Target Audience

**Primary:** Beginner to intermediate guitarists, pianists, and vocalists who want to learn songs by understanding their musical structure rather than watching tutorial videos.

**Secondary:** Advanced players who need MIDI exports, sheet music, and stem separation for practice, production, or teaching.

**Tertiary (future):** Music teachers, YouTube creators, recording artists, and developers who want music analysis capabilities in their own tools via a public API.

### Problems It Solves

| Problem | How Wilsify Solves It |
|---|---|
| "What chords does this song use?" | Chord detection with timestamps |
| "What key is this in?" | Key and scale identification |
| "How fast is the tempo?" | BPM detection |
| "Can I get a MIDI file to practice with?" | MIDI export from any audio |
| "I want sheet music but can't transcribe" | Automated sheet music PDF generation |
| "I want to learn the guitar part only" | Stem separation (vocals, drums, bass, other) |
| "I have a music theory question about this song" | AI tutor with song context |
| "I want to practice the chord progression in real time" | Live chord detection via microphone |

### Long-Term Vision

Wilsify AI aspires to become the intelligence layer that sits between every musician and every piece of music they want to learn, play, or create. In five years it should be the default answer to "how do I understand this song?" — the same way Spotify is the default answer to "how do I listen to music?" The platform evolves from a personal analysis tool into a collaborative music intelligence network: shared practice sessions, a community library of analysed songs, a public API that powers third-party music education apps, and real-time feedback as you play your instrument.

---

## 2. Product Philosophy

### AI-First, Human-Controlled

Every feature that benefits from AI uses AI. Chord detection, key identification, difficulty rating, tutoring — all AI-powered. But AI is always a tool in the user's hands, never an autonomous agent replacing their musical judgement. The user decides what to do with what the AI surfaces.

### Instant Feedback Over Long Waits

A musician who uploads a song should see partial results — BPM, key, basic chords — within seconds. Full stems and sheet music can follow. Fast partial results keep users engaged and make the product feel alive, even when heavy computation is running in the background.

### Privacy by Default

A user's uploaded music is their own. Audio files are stored privately. Nothing is shared publicly without an explicit action by the user. Analysis results belong to the user who created them. The product never uses uploaded audio to train models or for any purpose outside the user's own analysis.

### Cross-Platform Parity

A user should be able to start a session on their phone, continue it on the web, and pick it up again on their phone. The feature set on web and mobile should be equivalent — not identical in layout, but equivalent in capability. Features that exist on one platform should exist on the other within the same release cycle.

### Earned Complexity

The interface should be immediately useful to a beginner — upload a file, get chords. Advanced features (MIDI download, stem separation, sheet music, live detection) are accessible but not forced on users who do not need them. Complexity is revealed progressively as a user's engagement deepens.

### Reliable Over Impressive

A feature that works every time is more valuable than a feature that sometimes works brilliantly. Accuracy of chord detection at 90% with consistent behaviour is more valuable than accuracy at 95% with occasional complete failures. Reliability is a product value, not just an engineering concern.

### Transparent Pricing

Users should never be surprised by a charge. Every feature's plan requirement is visible before the user tries to use it. Credit costs are displayed before they are deducted. Subscription limits are communicated proactively before they are hit.

---

## 3. Product Goals

### Short-Term Goals (0–6 months)

- Launch a fully functional product on web and iOS/Android simultaneously.
- Deliver chord detection, BPM, key/scale, MIDI, and sheet music for any audio file up to 10 minutes.
- Deliver a working AI tutor for PRO and STUDIO users.
- Implement a complete four-tier subscription model (FREE, PRO, STUDIO, ENTERPRISE) with Stripe, Razorpay, and IAP.
- Reach 1,000 registered users and 200 paying subscribers within 60 days of public launch.
- Achieve sub-60-second full analysis time for a 4-minute track at PRO tier.

### Mid-Term Goals (6–18 months)

- Ship real-time live chord detection on mobile (microphone → chord display with <300 ms latency).
- Ship the instrument tuner feature on mobile.
- Build a community feed where users can share analysed songs and chord sheets.
- Launch a credits system that allows pay-as-you-go for users who do not need a subscription.
- Reach 10,000 registered users and 2,000 paying subscribers.
- Achieve 99.9% API uptime.
- Launch a public-facing API (developer tier) that third-party developers can use.

### Long-Term Goals (18 months–5 years)

- Build collaborative practice sessions (two users, same song, shared annotations in real time).
- Launch a plugin marketplace for community-created analysis extensions.
- Ship a desktop app (Electron) and a browser extension for YouTube in-page chord display.
- Build a music school enterprise tier with team accounts, student management, and analytics.
- Reach 100,000 monthly active users.
- Become the canonical public API for music analysis — the "Stripe for music intelligence."

---

## 4. Core Modules

Every feature in Wilsify AI belongs to exactly one module. Cross-module interactions go through defined service boundaries, never direct feature-to-feature coupling.

---

### Platform

The foundational layer that every other module depends on.

| Feature | Description |
|---|---|
| **Authentication** | Registration, login, email verification, password reset, token refresh, OAuth (future) |
| **User Profile** | Display name, avatar, instrument selection, account settings |
| **Dashboard** | Upload entry point, recent songs, usage summary, quick-access to last analysed song |
| **Notifications** | In-app and push notifications for analysis completion, community activity, payment events |
| **Settings** | Account settings, notification preferences, connected accounts, data export |

---

### Music Suite

The core value of the product. All music intelligence features live here.

| Feature | Description |
|---|---|
| **Upload** | Audio file upload (MP3, WAV, FLAC, M4A) and YouTube URL import; presigned direct-to-storage upload |
| **Analysis** | Full-song pipeline: chords, BPM, key, scale, Camelot key, energy, difficulty rating, performance analysis |
| **Chord View** | Visual chord timeline synced to audio playback; individual chord cards with root, quality, and timestamp |
| **MIDI Export** | Download a MIDI file generated from the detected notes in the song |
| **Sheet Music** | Download a sheet music PDF generated from the analysis |
| **Stems** | Download four separated audio tracks: vocals, drums, bass, other (instruments) |
| **Live Detection** | Real-time chord detection from the device microphone; chord displayed as you play |
| **Tuner** | Instrument tuner using device microphone; detects pitch and displays note name and cents deviation |
| **Practice Mode** | Loop a chord section, set BPM for slow practice, drill individual chords |
| **History** | Chronological list of all uploaded and analysed songs; re-analysis trigger |

---

### AI Platform

All AI-powered interaction features. Distinct from the Music Suite analysis features, which are deterministic signal-processing pipelines.

| Feature | Description |
|---|---|
| **AI Tutor** | Conversational AI assistant that answers music theory questions in the context of a specific song; understands chords, key, scale, BPM from the analysis |
| **Song Insights** | AI-generated plain-language summary of what makes a song musically interesting: chord substitutions, unusual progressions, genre characteristics |
| **Practice Recommendations** | AI-generated practice suggestions based on the song's difficulty and the user's instrument |

---

### Community

Social features that allow users to share their musical discoveries and connect with other musicians.

| Feature | Description |
|---|---|
| **Song Feed** | Chronological and trending feed of community-shared song analyses |
| **Posts** | Users can publish a song analysis with commentary to the community feed |
| **Likes** | Users can like community posts |
| **Song Sharing** | Share a direct link to a song analysis (optionally public or unlisted) |

---

### Billing

All monetisation features. Completely separated from feature modules to allow pricing changes without touching product code.

| Feature | Description |
|---|---|
| **Plans** | Subscription plan management: view current plan, upgrade, downgrade, cancel |
| **Credits** | Credit balance display, purchase credits, view credit transaction history |
| **Payment Methods** | Add, update, or remove a payment method |
| **Billing History** | Invoice list, receipt download |
| **Webhooks (internal)** | Stripe, Razorpay, Apple IAP, Google Play event processing |

---

### Administration

Internal-facing tools for the team. Not visible to regular users.

| Feature | Description |
|---|---|
| **User Management** | Search users, view account details, adjust plan, suspend account |
| **Platform Analytics** | Total users, daily active users, analyses run, revenue by provider |
| **Queue Monitor** | View background job queue depths, failed jobs, retry controls |
| **Content Moderation** | Review reported community posts, remove content, manage moderators |
| **System Health** | Service health status, recent errors, uptime metrics |

---

## 5. User Roles

### Guest

A visitor who has not registered. Can view the landing page, marketing content, and a public song analysis if a share link is opened. Cannot access any authenticated features.

### Free User

A registered user on the FREE plan. Can upload songs, receive basic analysis (chords, BPM, key), view chord timelines, and access song history. AI Tutor, MIDI export, sheet music, stems, and live detection are not available. Monthly upload limit applies. Credits earned on registration can be spent to unlock individual analyses beyond the free tier.

### PRO User

A registered user on the PRO plan. Full access to all Music Suite features: MIDI export, sheet music, stems, live detection, tuner. AI Tutor access with a monthly message cap. Priority in the analysis queue over FREE users. Higher monthly upload limit.

### STUDIO User

A registered user on the STUDIO plan. Everything in PRO, plus a higher AI Tutor message cap, the highest upload limits, and first access to new experimental features before general availability.

### ENTERPRISE User

A user on a custom contract. Unlimited AI Tutor messages, unlimited uploads, dedicated queue priority, SLA support, and access to the developer API. Managed directly by the team.

### Moderator

A trusted community member (or team member) with the ability to review reported community posts, remove violating content, and issue warnings. Cannot access billing data, user account details, or system settings.

### Administrator

Full access to the Administration module: user management, platform analytics, queue monitoring, system health. Can promote users to Moderator. Cannot delete user audio files without user consent (privacy principle).

---

## 6. User Journey

```
VISITOR
  Arrives via marketing, word-of-mouth, search, or a shared song link.
  Sees the landing page. Reads feature list. Views a sample analysis.
  ↓

REGISTRATION
  Creates an account with email and password.
  Receives a verification email.
  Earns 5 welcome credits on first login.
  ↓

ONBOARDING
  Selects their instrument (guitar, piano, bass, vocals, other).
  Views a short product tour of the dashboard.
  Is prompted to upload their first song.
  ↓

FIRST VALUE MOMENT
  Uploads a song or pastes a YouTube URL.
  Waits <60 seconds.
  Sees BPM, key, and chord progression.
  Plays back the song with chords displayed in sync.
  This is the moment the product earns the user's trust.
  ↓

DAILY USAGE
  Returns to analyse new songs they are learning.
  Builds a library of analysed songs.
  Uses chord timeline during practice sessions.
  Refers to history when returning to old songs.
  ↓

FEATURE DISCOVERY
  Hits the limit of the FREE plan (upload cap or AI Tutor wall).
  Discovers MIDI export, sheet music, or stem separation via the upgrade prompt.
  Tries the AI Tutor with a purchased credit bundle or upgrades to PRO.
  ↓

CONVERSION TO PAID
  Upgrades to PRO or STUDIO for regular access.
  Or purchases credits for occasional use.
  ↓

COMMUNITY ENGAGEMENT
  Shares an interesting analysis to the community feed.
  Discovers songs shared by other users.
  Follows musicians with similar tastes.
  ↓

LONG-TERM RETENTION
  Wilsify becomes the first tool they open when they want to learn a new song.
  Their analysed song library grows into a personal music knowledge base.
  They invite friends and other musicians.
```

---

## 7. Feature Roadmap

Phases represent logical release milestones, not fixed calendar dates. Each phase must be fully complete and stable before the next begins. No phase ships until its predecessor is in production.

### Phase 1 — Foundation (Launch)

Everything required for a paying user to get full value from day one.

- User registration, email verification, login, password reset
- Song upload (file + YouTube URL)
- Full analysis pipeline: chords, BPM, key, scale, Camelot key, difficulty
- MIDI export
- Sheet music PDF export
- Stem separation (4 stems: vocals, drums, bass, other)
- Chord timeline with synced audio playback
- AI Tutor (PRO+ plan)
- Song history
- Subscription management (Stripe, Razorpay, Apple IAP, Google Play)
- Credits system
- Push notifications (analysis completion)
- FREE, PRO, STUDIO, ENTERPRISE plans

### Phase 2 — Engagement

Features that bring users back daily and deepen the product's value.

- Live chord detection (real-time, microphone)
- Instrument tuner
- Practice mode (section looping, tempo control)
- Song sharing (public/unlisted links)
- Community feed (posts, likes)
- Song Insights (AI-generated plain-language commentary)
- Practice Recommendations (AI-generated, per-song)
- Mobile performance parity with web

### Phase 3 — Growth

Features that drive organic growth through social proof and developer adoption.

- Public developer API (API key authentication, rate-limited, paid tier)
- Community trending feed
- Collaborative song annotations (comments on specific chords/timestamps)
- Advanced admin analytics dashboard
- Referral program
- Moderator tools

### Phase 4 — Platform

Features that establish Wilsify AI as a platform rather than a tool.

- Desktop application (Electron, Mac and Windows)
- Browser extension (YouTube in-page chord overlay)
- Plugin marketplace (community-contributed analysis modules)
- Team accounts (music schools, bands, creators)
- Collaborative practice sessions (real-time, multi-user)
- Public song library (community-curated, opt-in)

---

## 8. Subscription Model

### FREE

No credit card required. Designed to demonstrate the core value of the product and convert curious users into paying subscribers.

- Up to **5 song uploads per month**
- Basic analysis: chords, BPM, key, scale
- Chord timeline playback
- Song history (last 20 songs)
- Community feed (read-only)
- No AI Tutor access
- No MIDI export
- No sheet music
- No stem separation
- No live detection
- Welcome credits (5) that can unlock individual premium analyses

### PRO

For the regular musician who wants the full music intelligence suite.

- Up to **50 song uploads per month**
- Full analysis pipeline (chords, BPM, key, scale, Camelot, difficulty, performance)
- MIDI export
- Sheet music PDF
- Stem separation (4 stems)
- Live chord detection
- Instrument tuner
- Practice mode
- AI Tutor — **500 messages per month**
- Priority analysis queue (ahead of FREE tier)
- Community posting and sharing

### STUDIO

For the advanced musician, producer, or educator who uses Wilsify as a professional tool.

- **Unlimited song uploads**
- Everything in PRO
- AI Tutor — **2,000 messages per month**
- Highest analysis queue priority
- Early access to experimental features
- Extended song history (unlimited)

### ENTERPRISE

Custom pricing. For music schools, publishers, or businesses integrating Wilsify into their workflow.

- Everything in STUDIO
- Unlimited AI Tutor messages
- Developer API access
- Team account management
- SLA-backed uptime commitment
- Dedicated onboarding support
- Invoiced billing

### Credits

Credits are an alternative to subscription upgrades for users who need occasional access to premium features. Credits never expire. A credit can be spent to unlock a single premium analysis (MIDI, sheet music, or stems) on a FREE plan account. Credits are earned on registration (5 credits) and can be purchased in bundles at any time, regardless of plan.

---

## 9. AI Capabilities

### Current AI Capabilities

**Audio Analysis Pipeline**  
Automated detection of chord progressions, key signature, scale, BPM, Camelot wheel key, difficulty rating, and performance quality metrics from any audio file. This is the core of the product and the primary AI-powered feature.

**Chord Transcription**  
Neural note-to-chord transcription using a trained ONNX model (basic-pitch). Outputs individual chords with start time, end time, root note, quality, and confidence score.

**Stem Separation**  
Deep learning separation of a mixed audio track into four instrument stems (vocals, drums, bass, other) using a pre-trained neural model (Demucs). STUDIO-tier feature.

**AI Tutor**  
Conversational assistant that answers music theory questions. The tutor is aware of the specific song being discussed: it has access to the key, scale, BPM, and detected chords as context. It does not simply answer generic music theory — it explains this song, these chords, this progression.

**Real-Time Chord Detection**  
On-device microphone audio is streamed to an inference endpoint that returns a chord name with sub-300 ms latency. Used for the live chord detection and tuner features.

### Planned AI Capabilities

**Song Insights**  
An AI-generated paragraph explaining what makes a song musically notable: unusual chord substitutions, borrowed chords, interesting rhythm patterns, genre-defining characteristics. Delivered automatically as part of every analysis.

**Practice Recommendations**  
AI-generated suggestions for how to practise a specific song based on its difficulty, chord complexity, and the user's instrument. Updated as the user improves.

**Difficulty Progression**  
Given a user's history of analysed songs, AI suggests the next songs in a difficulty progression that match their current level and genre preferences.

---

## 10. Platforms

### Web Application

The primary platform for desktop users. Built on Next.js 14. Accessible from any modern browser. The web app is the most feature-complete surface and the primary surface for analysis, MIDI export, sheet music, billing management, and the admin panel.

### Mobile Application

iOS and Android applications built with Expo and React Native. The mobile app adds features that require device hardware: the microphone for live chord detection and instrument tuning, and the camera for future sheet music scanning. Analysis, AI Tutor, chord playback, and community features are fully available on mobile. The mobile app is the primary surface for real-time features.

### REST API (Public, Future — Phase 3)

A versioned REST API (`/api/public/v1/`) available to developers under the ENTERPRISE plan or a dedicated Developer tier. Allows third-party applications to submit audio for analysis, retrieve results, and call the AI Tutor programmatically. The API is documented with OpenAPI and exposed at `/api/public/docs`.

### Desktop Application (Future — Phase 4)

An Electron desktop application for macOS and Windows. Primarily aimed at musicians and producers who work at a desk and want native file system integration: drag a file from their DAW project folder directly into Wilsify, or export MIDI directly into Ableton Live's session folder. The desktop app consumes the same REST API as the web app.

### Browser Extension (Future — Phase 4)

A Chrome and Firefox extension that overlays chord information directly on YouTube music videos as they play. When a user opens a YouTube video, the extension checks the Wilsify API for existing analysis of that track and displays the chord progression in a sidebar or overlay. If no analysis exists, the user can trigger one from within the extension.

---

## 11. Success Metrics

### Acquisition

| Metric | Definition | Initial Target |
|---|---|---|
| New Registrations | Unique account creations per week | 200/week at launch |
| Conversion Rate | % of visitors who register | >8% |
| Channel Attribution | Which source (organic, referral, social) drives most registrations | Track from day one |

### Activation

| Metric | Definition | Target |
|---|---|---|
| First Analysis Rate | % of new users who complete one analysis within 48 hours | >60% |
| Onboarding Completion | % of users who select an instrument during onboarding | >80% |
| Time to First Value | Minutes between registration and first completed analysis | <5 minutes |

### Engagement

| Metric | Definition | Target |
|---|---|---|
| Weekly Active Users | Users who complete at least one analysis per week | 30% of registered users |
| Songs Analysed Per User | Average per active user per month | >4 |
| AI Tutor Sessions | Active tutor conversations per week (PRO+ only) | Tracked |
| Session Duration | Average time per session | >8 minutes |

### Retention

| Metric | Definition | Target |
|---|---|---|
| D7 Retention | % of users who return in the first 7 days | >35% |
| D30 Retention | % of users who return in the first 30 days | >20% |
| Monthly Churn | % of paid subscribers who cancel per month | <5% |

### Revenue

| Metric | Definition | Target |
|---|---|---|
| Monthly Recurring Revenue | Sum of all active subscriptions | Tracked |
| Average Revenue Per User | MRR / paying users | Tracked |
| Free-to-Paid Conversion | % of FREE users who upgrade within 30 days | >6% |
| Credit Purchase Rate | % of FREE users who buy credits | >3% |

### Quality

| Metric | Definition | Target |
|---|---|---|
| Analysis Success Rate | % of submitted songs that complete successfully | >99% |
| Analysis P95 Latency | Time to full analysis at 95th percentile | <90 seconds |
| API P95 Latency | Non-AI endpoint response time | <150 ms |
| Tutor P95 Latency | AI Tutor first-token response time | <2 seconds |
| Uptime | Monthly API availability | >99.9% |

---

## 12. Product Principles

These principles act as a filter for every product decision. A feature or change that violates more than one principle should not proceed.

- **Every feature must solve a documented user problem.** If a user has not asked for it or the product team cannot articulate the problem it solves, it does not get built.
- **No feature ships to two modules.** Duplication creates maintenance debt and user confusion. Every feature has exactly one owner.
- **Mobile and web must reach parity within one release cycle.** A feature shipped on web but not mobile (or vice versa) creates a fragmented experience and adds unplanned technical debt.
- **Performance is a feature.** A fast product is a better product. No visual enhancement is worth adding if it introduces noticeable latency.
- **AI should enhance the user's understanding, not replace their effort.** The AI Tutor explains; it does not play for them. Analysis surfaces structure; users interpret it. Wilsify makes musicians better, not dependent.
- **Pricing must be transparent before the user acts.** Every plan-gated feature shows the required plan before the user tries to use it. Credits are always deducted with visible confirmation.
- **Free users are future paying users.** The FREE tier is generous enough to demonstrate real value but limited enough to create a clear reason to upgrade. It is never so restricted that it feels hostile.
- **Breaking changes to the API require a deprecation period.** No existing API contract is changed without a migration window. External developers and mobile app users cannot be forced to update immediately.
- **Privacy decisions default to restrictive.** When there is ambiguity about whether a user's data should be shared, processed, or retained, the default is the most private option.
- **Ship small, ship often.** Prefer incremental releases over large batches. A smaller change is easier to test, easier to roll back, and easier for users to absorb.

---

## 13. Future Vision

### Years 1–2: Depth

The product deepens its core music intelligence. Analysis accuracy improves with model fine-tuning. The AI Tutor becomes more contextually aware — it remembers the user's skill level and instrument across sessions, not just within one conversation. Practice mode evolves into a structured practice curriculum: given a song, Wilsify suggests a 4-week practice plan broken into daily sessions. The community grows from a feed into a curated library of analysed songs that any user can explore.

### Years 2–3: Breadth

Wilsify expands to new surfaces. The desktop app becomes the preferred tool for DAW users who need MIDI and stem files integrated into their workflow. The browser extension brings chord overlays to YouTube with no friction. The public API reaches a critical mass of third-party integrations — music education apps, DAW plugins, guitar tab sites — creating a network effect where the community's uploaded songs benefit all users.

### Years 3–5: Platform

Wilsify becomes a platform rather than an application. Music schools and institutions use the enterprise tier to manage student libraries, track progress, and generate practice reports. A plugin marketplace allows specialist developers to add genre-specific analysis (jazz chord substitutions, flamenco rhythms, classical voice leading) as installable extensions. Collaborative sessions allow a guitar teacher and a student to look at the same song analysis simultaneously, annotate chords together, and run a live detection session side by side. The platform begins to accumulate a dataset — with full user consent and anonymisation — that enables genuinely novel AI capabilities: detecting emotional character, predicting how long a song will take to learn, or suggesting alternative voicings for a difficult chord.

The long-term aspiration is to be the canonical intelligence layer for music: the platform that any musician, educator, developer, or creator reaches for when they need to understand a piece of music, not just listen to it.

---

## 14. Out of Scope

The following features are explicitly not planned for the current roadmap. Listing them prevents recurring debate and scope creep.

**Music streaming.** Wilsify is not a music player or streaming service. Users bring their own audio. Wilsify analyses; it does not host or distribute music.

**Audio recording and editing.** Wilsify does not record full songs (only short microphone buffs for live detection and tuning) and does not edit audio. It is not a DAW.

**Music generation.** AI-generated music, beats, melodies, or lyrics are not part of the product. Wilsify analyses existing music; it does not create new music.

**Social networking.** Wilsify has a community feed for sharing analyses, but it is not a social network. There are no follower graphs, direct messages, or user profiles with public activity streams (beyond shared analyses).

**Music licensing or copyright management.** Wilsify does not verify whether a user has the right to upload a piece of audio. It does not manage publishing rights, synchronisation licences, or royalty tracking.

**Notation editor.** The sheet music feature generates PDFs for viewing and printing. It does not provide an interactive notation editor where users can manually edit the generated sheet music.

**Video sync.** Chord overlays on user-uploaded video (as opposed to YouTube via the extension) are not planned.

**Offline analysis.** All analysis runs on the server. Client-side offline analysis is not planned due to the computational requirements of the pipeline (Demucs alone requires several gigabytes of RAM).

**Vocal pitch correction or autotune.** The tuner feature detects pitch for reference purposes only; it does not modify audio.

---

## 15. Decision Rules

Before any feature is designed, scoped, or built, the following questions must be answered with a clear, written response. If any answer is "no" or "unsure," the feature should be deferred.

**1. Does it solve a real, documented user problem?**  
Can you point to user feedback, a support ticket, or an observed behaviour that shows users struggling with this problem today? If not, the feature is speculative.

**2. Which module owns it?**  
Name the exact module from Section 4. If it overlaps two modules or does not fit any, the module architecture needs to be resolved before the feature is built.

**3. Is it consistent with the product philosophy?**  
Check it against Section 2. Features that require AI to act autonomously without user control, or that compromise user privacy, or that introduce complexity without a commensurate increase in value, should not proceed.

**4. Which plan(s) does it belong to?**  
Name the specific plan. A feature without a clear plan assignment creates pricing inconsistency.

**5. Does it overlap with an existing feature?**  
Review Section 4. If an existing feature already solves the same problem, the answer is to improve the existing feature, not add a new one.

**6. What phase is it planned for?**  
If it is not in the current phase from Section 7, it should not be started. Phases are gates, not suggestions.

**7. How will success be measured?**  
Name the metric from Section 11 that this feature is expected to move. A feature that cannot be tied to a measurable outcome is unlikely to be worth building.

If all seven questions have clear answers, the feature may enter the design stage.

---

*This document describes the product, not the implementation. For implementation details, architecture decisions, and technical standards, see `ARCHITECTURE.md`.*

---

## Related Documents

- [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — how the product described here is implemented
- [../development/VERSIONS.md](../development/VERSIONS.md) — which version each feature belongs to
- [../development/PROJECT_PLAN.md](../development/PROJECT_PLAN.md) — execution order and phase gating
- [../README.md](../README.md) — documentation map
