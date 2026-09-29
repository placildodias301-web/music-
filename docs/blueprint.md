# Wilsify AI --- Master Project Prompt & Audit

> Professionally reformatted for GitHub and VS Code.

## Table of Contents

- [Wilsify AI --- Master Project Prompt \& Audit](#wilsify-ai-----master-project-prompt--audit)
  - [Table of Contents](#table-of-contents)
- [MASTER PROMPT FOR CLAUDE CODE (VS CODE)](#master-prompt-for-claude-code-vs-code)
- [PROJECT NAME](#project-name)
- [PROJECT DESCRIPTION](#project-description)
- [PROJECT GOALS](#project-goals)
- [DEVELOPMENT RULES](#development-rules)
- [CODING STANDARDS](#coding-standards)
- [TECH STACK](#tech-stack)
- [APPLICATION MODULES](#application-modules)
- [USER ROLES](#user-roles)
- [DASHBOARD FEATURES](#dashboard-features)
- [MUSIC ANALYSIS FEATURES](#music-analysis-features)
- [AI MUSIC TUTOR](#ai-music-tutor)
- [EXPORT OPTIONS](#export-options)
- [DATABASE DESIGN](#database-design)
- [API DESIGN](#api-design)
- [SECURITY](#security)
- [FILE UPLOAD SYSTEM](#file-upload-system)
- [UI/UX](#uiux)
- [ADMIN PANEL](#admin-panel)
- [DOCUMENTATION](#documentation)
- [TESTING](#testing)
- [PERFORMANCE](#performance)
- [PROJECT STRUCTURE](#project-structure)
- [GIT](#git)
- [ERROR HANDLING](#error-handling)
- [LOGGING](#logging)
- [DEVELOPMENT PHASES](#development-phases)
- [MCA REQUIREMENTS](#mca-requirements)
- [DEVELOPMENT APPROACH](#development-approach)
- [CODE QUALITY](#code-quality)
- [IMPORTANT INSTRUCTIONS](#important-instructions)
- [PROJECT AUDIT --- CURRENT STATE VS BLUEPRINT](#project-audit-----current-state-vs-blueprint)
  - [Executive Summary](#executive-summary)
  - [Tech Stack --- Blueprint vs Actual](#tech-stack-----blueprint-vs-actual)
  - [Application Modules](#application-modules-1)
  - [User Roles](#user-roles-1)
  - [Dashboard Features](#dashboard-features-1)
  - [Music Analysis Features (AI Service)](#music-analysis-features-ai-service)
  - [AI Music Tutor](#ai-music-tutor-1)
  - [Export Options](#export-options-1)
  - [Analysis Report (bundled)           ❌ MISSING](#analysis-report-bundled------------missing)
  - [Database Design](#database-design-1)
  - [API Design](#api-design-1)
  - [Security](#security-1)
  - [File Upload System](#file-upload-system-1)
  - [UI/UX](#uiux-1)
  - [Admin Panel](#admin-panel-1)
  - [Documentation](#documentation-1)
  - [Statement, Data Flow Diagram)](#statement-data-flow-diagram)
  - [Testing \& CI](#testing--ci)
  - [Git Hygiene](#git-hygiene)
  - [Prioritized Gap List](#prioritized-gap-list)

------------------------------------------------------------------------

## MASTER PROMPT FOR CLAUDE CODE (VS CODE)

You are the lead software architect, senior full-stack engineer, AI
engineer, DevOps engineer, UI/UX designer, database architect, QA
engineer, and technical documentation writer for this project.

You are helping build a real production-grade SaaS application called
**Wilsify AI**.

This project is also an MCA major project that will be presented to a
project guide and evaluated academically. Therefore, every architectural
decision, documentation file, module, and implementation must be
professional enough for academic evaluation while also following
real-world software engineering standards.

This is **not** a prototype, hackathon project, or MVP. Treat it as a
complete commercial SaaS product.

------------------------------------------------------------------------

## PROJECT NAME

Wilsify AI

------------------------------------------------------------------------

## PROJECT DESCRIPTION

Wilsify AI is an AI-powered music analysis platform capable of analyzing
uploaded songs or YouTube links and providing musicians with
comprehensive music insights.

Users should be able to upload audio files or paste YouTube URLs and
receive:

-   Chord Detection
-   BPM Detection
-   Key Detection
-   Scale Detection
-   Time Signature
-   Chord Timeline
-   Melody Detection
-   Instrument Detection
-   Song Structure
-   Difficulty Rating
-   Genre Prediction
-   Mood Detection
-   Stem Separation
-   MIDI Generation
-   Sheet Music PDF
-   Chord Charts
-   AI Music Tutor
-   Practice Recommendations
-   Downloadable Reports

The goal is to build one of the most advanced AI music analysis
platforms.

------------------------------------------------------------------------

## PROJECT GOALS

The application must be

-   Modern
-   Fast
-   Responsive
-   Highly scalable
-   Modular
-   Secure
-   Easy to maintain
-   Production-ready
-   Professional enough for academic submission

------------------------------------------------------------------------

## DEVELOPMENT RULES

Before implementing any feature:

1.  Analyze requirements.
2.  Design architecture.
3.  Explain reasoning.
4.  Identify dependencies.
5.  Write clean code.
6.  Test implementation.
7.  Update documentation.

Never rush into coding.

------------------------------------------------------------------------

## CODING STANDARDS

Always follow:

-   SOLID Principles
-   DRY
-   KISS
-   Clean Architecture
-   Feature-based Architecture
-   Separation of Concerns
-   Reusable Components
-   Type Safety
-   Proper Error Handling
-   Logging
-   Validation
-   Security Best Practices

Never create duplicate logic.

Always prefer reusable utilities.

------------------------------------------------------------------------

## TECH STACK

Frontend

-   Next.js 15
-   React
-   TypeScript
-   Tailwind CSS
-   Shadcn UI
-   Framer Motion

Backend

-   Node.js
-   Express
-   TypeScript

Database

-   PostgreSQL

ORM

-   Prisma

Authentication

-   Clerk or Auth.js

Storage

-   Cloudinary / AWS S3

Payments

-   Stripe

Email

-   Resend

Queue

-   BullMQ

Redis

Caching

AI

-   Python Microservices
-   TensorFlow
-   PyTorch
-   Librosa
-   Essentia
-   Music21
-   Demucs
-   Whisper
-   Basic ML models where required

Deployment

Frontend

-   Vercel

Backend

-   Railway / Render / Docker

Database

-   PostgreSQL

------------------------------------------------------------------------

## APPLICATION MODULES

Design the project with separate modules.

Authentication

Dashboard

Music Upload

YouTube Import

Music Analysis

AI Tutor

Reports

Downloads

Projects

User Profile

Subscription

Billing

Notifications

Admin Dashboard

Settings

API

Documentation

------------------------------------------------------------------------

## USER ROLES

Guest

Free User

Premium User

Administrator

Each role must have different permissions.

------------------------------------------------------------------------

## DASHBOARD FEATURES

Dashboard should display

Recent Projects

Analysis History

Favorite Songs

Credits Remaining

Storage Usage

Recent Downloads

Learning Progress

Statistics

Quick Actions

Notifications

------------------------------------------------------------------------

## MUSIC ANALYSIS FEATURES

After upload

Detect

BPM

Key

Scale

Chords

Chord Progression

Chord Timeline

Genre

Mood

Time Signature

Energy

Danceability

Tempo Stability

Dynamic Range

Pitch Analysis

Song Structure

Instrument Detection

Melody

Harmony

Stem Separation

Practice Difficulty

Finger Position Suggestions

Practice Speed

Practice Plan

------------------------------------------------------------------------

## AI MUSIC TUTOR

Generate

Learning Tips

Practice Schedule

Exercises

Music Theory Explanation

Chord Explanation

Scale Explanation

Improvisation Tips

Mistake Detection

Personalized Feedback

Learning Progress

------------------------------------------------------------------------

## EXPORT OPTIONS

Allow users to export

PDF

MIDI

Chord Chart

JSON

CSV

Analysis Report

------------------------------------------------------------------------

## DATABASE DESIGN

Design a scalable normalized PostgreSQL database.

Include

Users

Projects

Songs

Uploads

Analysis Results

Chord Data

Timeline Data

Reports

Downloads

Subscriptions

Payments

Notifications

Settings

Logs

API Keys

Sessions

Audit Logs

Admin Tables

Relationships

Indexes

Constraints

Migration Strategy

------------------------------------------------------------------------

## API DESIGN

Design REST APIs.

Each endpoint must include

Purpose

Request

Response

Authentication

Validation

Error Codes

Examples

Versioning

Rate Limiting

------------------------------------------------------------------------

## SECURITY

Implement

JWT/Auth Sessions

CSRF Protection

XSS Protection

SQL Injection Prevention

Rate Limiting

Secure Headers

File Validation

Virus Scan Hooks

Role Permissions

Audit Logging

Encryption

Secrets Management

Secure Uploads

------------------------------------------------------------------------

## FILE UPLOAD SYSTEM

Support

MP3

WAV

FLAC

AAC

OGG

M4A

Large uploads

Background processing

Progress bars

Retry

Resume

Validation

------------------------------------------------------------------------

## UI/UX

Modern SaaS Design

Dark Mode

Light Mode

Responsive

Accessibility

Smooth Animations

Professional Typography

Reusable Components

Skeleton Loaders

Empty States

Error States

Success States

Toast Notifications

Beautiful Charts

Professional Icons

Minimal Design

------------------------------------------------------------------------

## ADMIN PANEL

Dashboard

Users

Subscriptions

Payments

Reports

Logs

Analytics

Content

Announcements

Support

AI Usage

System Monitoring

Database Monitoring

Storage Usage

API Usage

------------------------------------------------------------------------

## DOCUMENTATION

Maintain documentation continuously.

Include

README

Installation Guide

Architecture

Folder Structure

API Docs

Database Docs

Deployment Guide

Environment Variables

Developer Guide

Contribution Guide

Testing Guide

Release Notes

Changelog

User Manual

Admin Manual

MCA Project Documentation Notes

------------------------------------------------------------------------

## TESTING

Implement

Unit Tests

Integration Tests

API Tests

UI Tests

Authentication Tests

Performance Tests

Security Tests

Regression Tests

Accessibility Tests

Maintain excellent test coverage where practical.

------------------------------------------------------------------------

## PERFORMANCE

Optimize

Lazy Loading

Code Splitting

Caching

Compression

Image Optimization

Streaming

Database Optimization

Background Jobs

Efficient Queries

Virtual Lists

Memoization

------------------------------------------------------------------------

## PROJECT STRUCTURE

Organize code professionally.

Separate

Frontend

Backend

Shared Packages

AI Services

Scripts

Database

Config

Docs

Tests

Assets

Infrastructure

------------------------------------------------------------------------

## GIT

Use

Meaningful commits

Feature branches

Pull request workflow

Conventional commits

Version tags

------------------------------------------------------------------------

## ERROR HANDLING

Every API

Every Page

Every Component

Every Service

Every Database Operation

must have proper error handling.

------------------------------------------------------------------------

## LOGGING

Create structured logging.

Include

Errors

Warnings

Performance

Security

Authentication

Uploads

AI Jobs

Payments

Admin Actions

------------------------------------------------------------------------

## DEVELOPMENT PHASES

Phase 1

Project Setup

Architecture

Folder Structure

Database

Authentication

Design System

Phase 2

Dashboard

User System

Uploads

Storage

Phase 3

Music Analysis

AI Services

Reports

Exports

Phase 4

AI Tutor

Advanced Analysis

Recommendations

Phase 5

Subscriptions

Payments

Admin Dashboard

Phase 6

Optimization

Testing

Documentation

Deployment

Release

------------------------------------------------------------------------

## MCA REQUIREMENTS

This project must satisfy major project expectations.

Prepare the codebase and documentation so that it is easy to explain:

-   Problem Statement
-   Existing System
-   Proposed System
-   Objectives
-   Scope
-   Architecture Diagram
-   Data Flow
-   ER Diagram
-   Database Design
-   Module Description
-   Algorithms
-   Technologies Used
-   Testing
-   Results
-   Future Scope
-   References

Whenever diagrams are requested, generate them in Mermaid format where
appropriate.

------------------------------------------------------------------------

## DEVELOPMENT APPROACH

Never generate random code.

Before every major feature:

1.  Explain the architecture.
2.  Explain the folder structure.
3.  Explain the implementation plan.
4.  Mention dependencies.
5.  Implement incrementally.
6.  Test the implementation.
7.  Update documentation.

------------------------------------------------------------------------

## CODE QUALITY

Every file should be production quality.

Use consistent naming conventions.

Avoid code duplication.

Prefer composition over inheritance.

Keep functions small.

Use TypeScript strictly.

Document complex logic.

------------------------------------------------------------------------

## IMPORTANT INSTRUCTIONS

-   Do not make assumptions without stating them.
-   Ask for clarification only when a requirement is genuinely
    ambiguous.
-   Prioritize maintainability over shortcuts.
-   Keep the repository clean and organized.
-   Ensure every new feature integrates cleanly with the existing
    architecture.
-   Regularly review the project structure and refactor where necessary
    without breaking functionality.
-   Treat this as a long-term product intended to scale to thousands of
    users.

You are my long-term engineering partner for Wilsify AI. Your
responsibility is to help design, build, document, test, optimize, and
maintain this project to professional industry standards while keeping
it suitable for MCA major project evaluation.





## PROJECT AUDIT --- CURRENT STATE VS BLUEPRINT

**Audit date:** 2026-07-06 **Method:** Direct source inspection of
`web-app/`, `mobile_app/`, `backend/`, `ai-service/`, `shared/`,
`docs/`, `.github/workflows/`, and git history. Not based on prior chat
summaries.

### Executive Summary

Wilsify AI is substantially further along than a prototype: auth,
uploads, real AI-based analysis (chords/BPM/key/scale/stems/MIDI/sheet
music), payments (Stripe + Razorpay + Apple/Google IAP), a job queue,
and an admin panel all exist and are wired end-to-end across backend,
web-app, and mobile_app, backed by 44 test files and 5 CI workflows. The
biggest gaps against this blueprint are: (1) several analysis features
described in the blueprint were never built (genre, mood, instrument
detection, song structure segmentation, time signature detection,
danceability/tempo-stability/dynamic-range), (2) the tech stack diverges
from the blueprint in a few places (custom JWT instead of Clerk/Auth.js,
Cloudflare R2 instead of Cloudinary/S3, no Shadcn UI, no Google OAuth),
(3) academic/process artifacts (git commit hygiene, ER/data-flow
diagrams as standalone docs, user/admin manuals) are thin or missing,
and (4) mobile_app and the "Projects" concept are behind web-app.

### Tech Stack --- Blueprint vs Actual

| Layer | Blueprint | Actual | Status |
|---|---|---|---|
| Frontend framework | Next.js 15 | Next.js (web-app/) | ✅ Match |
| UI library | Tailwind + Shadcn UI | Tailwind installed, but pages hand-built with inline styles + CSS-variable design tokens; **no Shadcn** | ⚠️ Deviation |
| Backend | Node.js + Express | Fastify 5 (not Express) | ⚠️ Deviation (equivalent, faster, but not what was specified) |
| Database | PostgreSQL | PostgreSQL 16 | ✅ Match |
| ORM | Prisma | Prisma | ✅ Match |
| Auth | Clerk or Auth.js | Custom JWT (access + rotating refresh token) | ⚠️ Deviation --- works, but no OAuth, no Clerk/Auth.js session ecosystem |
| Storage | Cloudinary / AWS S3 | Cloudflare R2 (S3-compatible) | ⚠️ Deviation (compatible, cheaper, but not literally what's listed) |
| Payments | Stripe | Stripe **+** Razorpay **+** Apple IAP **+** Google IAP | ✅ Exceeds spec |
| Email | Resend | Resend | ✅ Match |
| Queue | BullMQ + Redis | BullMQ + Redis | ✅ Match |
| AI | TensorFlow, PyTorch, Librosa, Essentia, Music21, Demucs, Whisper | librosa, music21, basic-pitch, Demucs (subprocess), torch (GPU check only) --- **no TensorFlow, no Essentia, no Whisper actually used** | ⚠️ Partial --- core DSP stack present, but the deep-learning/ML breadth implied by the blueprint isn't there |
| Deployment | Vercel (front) / Railway-Render-Docker (back) | Vercel (web-app), Railway (backend + ai-service), GitHub Pages (landing) | ✅ Match |

### Application Modules

| Module | Web-app | Mobile | Backend |
|---|---|---|---|
| Authentication | PARTIAL (no email-verify page, no OAuth) | PARTIAL (Google button is a stub alert, no reset-password screen) | EXISTS --- JWT, refresh rotation, email verification, password reset |
| Dashboard | PARTIAL (missing favorites, storage usage, downloads, learning progress, notifications) | EXISTS (tab home) | --- |
| Music Upload | EXISTS | EXISTS | EXISTS (`uploads` route, strong file validation) |
| YouTube Import | EXISTS | EXISTS | --- |
| Music Analysis | PARTIAL (see feature table below) | EXISTS (screen) | EXISTS (`songs`, `analysis` worker) |
| AI Tutor | EXISTS | EXISTS | EXISTS (`tutor` route + usage limits) |
| Reports/Downloads | PARTIAL (MIDI + PDF only; no chord chart/JSON/CSV) | MISSING (no export UI) | --- |
| Projects | **MISSING** (only a flat `/history` list, no folders/projects concept) | **MISSING** | **MISSING** (no `Project` model in Prisma) |
| User Profile | EXISTS | PARTIAL (no dedicated settings screen) | EXISTS (`users` route) |
| Subscription/Billing | EXISTS | EXISTS | EXISTS |
| Notifications | **MISSING** (no UI at all) | EXISTS | EXISTS (`notifications` route) |
| Admin Dashboard | PARTIAL (Overview/Users/Subscriptions/Queue; no Payments/Reports/Logs/Analytics tabs) | **MISSING** | PARTIAL (`admin` route: overview, users, subscriptions, analyses --- no logs/system-monitoring endpoint) |
| Settings | EXISTS | PARTIAL | --- |
| API docs (public-facing page) | **MISSING** | --- | EXISTS (`@fastify/swagger` UI at `/docs`, but sparse per-route schemas) |
| Documentation | --- | --- | See Documentation section below |

### User Roles

Blueprint specifies Guest / Free / Premium / Administrator with
differing permissions. **Actual:** Prisma `UserRole` enum is
`USER / MODERATOR / ADMIN`, plan-based gating
(`FREE/PRO/STUDIO/ENTERPRISE`) is separate from role. Guest
(unauthenticated) access is implicit, not a formal role. `MODERATOR`
role exists in the enum but has no distinct permission checks anywhere
--- **dead role**. Status: ⚠️ **Functionally equivalent but not
literally matching the spec's four-role model**; recommend either wiring
up MODERATOR or removing it.

### Dashboard Features

| Feature | Status |
|---|---|
| Recent Projects | MISSING (no projects concept) |
| Analysis History | EXISTS (`/history`) |
| Favorite Songs | MISSING |
| Credits Remaining | EXISTS |
| Storage Usage | MISSING |
| Recent Downloads | MISSING |
| Learning Progress | MISSING |
| Statistics | EXISTS (tracks analyzed, completed, avg BPM) |
| Quick Actions | MISSING (only inline upload widget) |
| Notifications | MISSING |

### Music Analysis Features (AI Service)

| Feature | Status | Notes |
|---|---|---|
| BPM Detection | ✅ EXISTS | `services/bpm.py` |
| Key Detection | ✅ EXISTS | `services/key.py`, Krumhansl-Schmuckler |
| Scale Detection | ✅ EXISTS | `services/key.py` |
| Chords / Chord Progression | ✅ EXISTS | `services/chords.py`, basic-pitch + template matching |
| Chord Timeline | ✅ EXISTS | time-stamped `ChordItem[]` |
| Time Signature | ❌ MISSING | hardcoded to 4/4 in `midi.py`/`sheet.py` |
| Genre Prediction | ❌ MISSING | no code anywhere |
| Mood Detection | ❌ MISSING | no code anywhere |
| Energy | ✅ EXISTS | RMS-based |
| Danceability | ❌ MISSING | |
| Tempo Stability | ❌ MISSING | |
| Dynamic Range | ❌ MISSING | |
| Pitch Analysis | ⚠️ PARTIAL | `services/pitch.py` exists but scoped to vocal-performance scoring, not full-song melody |
| Song Structure (intro/verse/chorus) | ❌ MISSING | |
| Instrument Detection | ❌ MISSING | |
| Melody Detection | ❌ MISSING (as distinct output) | pitch.py not exposed as song melody |
| Harmony Analysis | ❌ MISSING | beyond raw chord labels |
| Stem Separation | ✅ EXISTS | Demucs `htdemucs`, opt-in by plan entitlement |
| Difficulty Rating | ✅ EXISTS | `services/difficulty.py` |
| Finger Position Suggestions | ❌ MISSING | tutor gives generic text tips only, no tab/fretboard data |
| Practice Speed / Practice Plan | ⚠️ PARTIAL | tutor LLM can produce free-text plans; no structured feature |

### AI Music Tutor

Chat-based tutor (Claude/OpenAI-backed, `services/tutor.py`) exists in
web-app, mobile, and backend, with Redis-based monthly usage limits per
plan. Delivers free-text theory/coaching. **Not implemented as distinct
structured features:** learning-progress tracking, a scheduled practice
plan object, mistake-detection against a reference performance (pitch.py
is only used in the tuner/live-chords context, not tutor-integrated).

### Export Options

| Format | Status |
|---|---|
| PDF (sheet music) | ⚠️ PARTIAL --- `services/sheet.py` silently no-ops if `lilypond` binary missing at runtime (confirmed in local test log), even though Dockerfile installs it |
| MIDI | ✅ EXISTS |
| Chord Chart (distinct lead-sheet format) | ❌ MISSING |
| JSON | ❌ MISSING |
| CSV | ❌ MISSING |
| Analysis Report (bundled) | ❌ MISSING |

### Database Design

Prisma models present: `User`, `RefreshToken`, `PasswordReset`,
`EmailVerification`, `Song`, `Analysis`, `Chord`, `CommunityPost`,
`PostLike`, `CreditLedger`, `Subscription`, `Notification`, enums
`Plan`/`JobStatus`/`UserRole`. Indexes exist on email, userId,
tokenHash, createdAt, and a composite (userId,status).

**Missing vs blueprint's table list:** dedicated `Project`, `Downloads`,
`Reports`, `ApiKeys`, `Sessions` (session state is JWT-based, not
DB-tracked), `AuditLogs`, `Settings`, `Logs`, and a standalone
`Payments` table (payment state currently lives inside `Subscription`).
Whether these are truly needed depends on product decisions (e.g., a
`Project` model is required before "Projects management" can exist at
all).

### API Design

REST, versioned under `/api/v1/*`. Modules: auth, users, songs, uploads,
credits, community, stats, notifications, subscriptions, tutor, admin.
Swagger UI mounted at `/docs` but route schemas are mostly Zod-validated
rather than declared as Fastify JSON schemas, so generated docs are
sparse. No public API-docs page in web-app. No customer-facing API key
system (`ApiKeys` table doesn't exist), so the blueprint's "API" module
(as a product surface, not just internal REST) is **not built**.

### Security

| Control | Status |
|---|---|
| JWT/session auth | ✅ EXISTS |
| Rate limiting | ✅ EXISTS (Redis-backed, `@fastify/rate-limit`) |
| Secure headers | ✅ EXISTS (`@fastify/helmet`) |
| CORS | ✅ EXISTS |
| File validation (MIME/magic-byte/size/path-traversal) | ✅ EXISTS --- strong |
| Virus scan hooks | ❌ MISSING --- no ClamAV/AV integration |
| CSRF | ⚠️ PARTIAL --- mitigated via sameSite=strict cookies + bearer tokens, no explicit CSRF token |
| XSS sanitization | ⚠️ PARTIAL --- no explicit sanitizer library found |
| Role permissions (RBAC) | ⚠️ PARTIAL --- coarse USER/MODERATOR/ADMIN, MODERATOR unused |
| Audit logging | ❌ MISSING --- no `AuditLog` model |
| Secrets management | ⚠️ PARTIAL --- env-var + zod validation, no vault/rotation policy |
| Webhook signature verification | ✅ EXISTS --- Stripe/Razorpay, timing-safe compare + idempotency |

### File Upload System

Formats, size limits, and validation are handled server-side
(`upload.service.ts`) with MIME allowlist, extension allowlist,
magic-byte signature checks, and UUID storage keys. Progress bars exist
client-side. **Not confirmed/likely missing:** resumable/chunked uploads
(retry/resume for large files) --- not found in the audit; worth
verifying directly if large-file reliability becomes a concern.

### UI/UX

Tailwind is installed but not used as the component system --- pages are
hand-styled against CSS variables defined in `globals.css` (a locked
purple/dark "glass" design system, see architecture memory). **No Shadcn
UI**, despite the blueprint specifying it. **No dark/light mode toggle**
in web-app or mobile --- the product is dark-mode-only by design (this
may be an intentional brand decision rather than an oversight; confirm
with product owner before treating as a gap).

### Admin Panel

Web-app has Overview/Users/Subscriptions/Queue tabs, role-gated. Backend
has matching `/admin/*` routes. **Missing:** Payments tab, Reports,
Logs, Content/Announcements, Support, AI Usage breakdown,
System/Database/Storage monitoring beyond basic counts. No admin surface
at all in mobile_app (acceptable --- admin is typically web-only).

### Documentation

| Doc | Status |
|---|---|
| README | ✅ EXISTS, accurate |
| Installation Guide | ❌ MISSING (only Quick Start in root README) |
| Architecture | ✅ EXISTS (`docs/ARCHITECTURE.md`, has Mermaid) |
| Folder Structure (standalone) | ❌ MISSING |
| API Docs | ✅ EXISTS (`docs/API.md`, 1000+ lines) |
| Database Docs | ✅ EXISTS (`docs/DATABASE.md`, includes ER diagram) |
| Deployment Guide | ✅ EXISTS |
| Environment Variables | ✅ EXISTS |
| Developer Guide | ❌ MISSING |
| Contribution Guide | ⚠️ PARTIAL (5 bullets in README, no CONTRIBUTING.md) |
| Testing Guide | ✅ EXISTS |
| Release Notes/Changelog | ✅ EXISTS |
| User Manual | ❌ MISSING |
| Admin Manual | ❌ MISSING |
| MCA academic docs (Problem Statement, Data Flow Diagram) | ❌ MISSING as standalone docs |

### Testing & CI

-   Test files: backend 10, web-app 13, ai-service 11--12, **mobile_app
    0**.
-   CI: 5 GitHub Actions workflows covering backend, web-app,
    ai-service, staging, and landing-page deploy. **No mobile CI.**
-   Last known full-suite result (per Sprint 9 release memory,
    2026-07-03): 296 tests passing.

### Git Hygiene

All 20 most recent commits are the literal message `"commit"` --- **no
conventional commits**, despite the blueprint requiring them. No feature
branches (only `main` exists locally), no version tags. This directly
contradicts the blueprint's Git section and should be corrected going
forward (does not require rewriting history --- just adopt conventional
messages from here on).

### Prioritized Gap List

1.  **Git commit discipline** --- start using conventional commits
    (`feat:`, `fix:`, `docs:`, etc.) immediately; zero cost to fix going
    forward.
2.  **Projects module** --- no `Project` model or UI exists anywhere;
    blocks "Recent Projects," "Projects management," and proper
    multi-song organization.
3.  **Notifications UI in web-app** --- backend + mobile already support
    it; web-app has no UI for it at all.
4.  **Missing analysis features** --- genre, mood, instrument detection,
    song structure, time signature,
    danceability/tempo-stability/dynamic-range are in the blueprint's
    feature list but entirely unbuilt in `ai-service/`.
5.  **Export gaps** --- chord chart, JSON, CSV, bundled analysis report
    are unbuilt; PDF sheet music has a silent-failure mode in production
    if LilyPond isn't resolved at runtime.
6.  **Security hardening** --- audit logging, explicit CSRF tokens, XSS
    sanitization, virus scanning are all missing or partial.
7.  **Mobile parity** --- 0 tests, no CI, stubbed Google OAuth, no
    settings/projects/export screens.
8.  **Academic/documentation artifacts** --- Installation Guide,
    Developer Guide, Contribution Guide, User/Admin Manuals, standalone
    Problem Statement and Data Flow Diagram needed for MCA evaluation.
9.  **Tech-stack deviations** --- decide whether to formally update the
    blueprint to reflect Fastify/custom-JWT/R2 (recommended, since these
    are working, deliberate choices) or migrate to the originally
    specified Express/Clerk/S3 stack.

**How to apply:** Treat this audit as a living gap list, not a one-time
report --- re-verify against code (not this snapshot) before starting
work on any item, since the codebase moves faster than this document.

---

## Related Documents

- [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) — current system design (supersedes this audit's snapshot)
- [product/PRODUCT.md](product/PRODUCT.md) — current product scope and out-of-scope decisions
- [development/PROJECT_PLAN.md](development/PROJECT_PLAN.md) — current technical debt register
- [README.md](README.md) — documentation map
