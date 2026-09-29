# Wilsify AI — Documentation Map

> [!IMPORTANT]
> ### Standalone MVP Notice & Documentation Guide
> 1. **Current Working Product:** The active codebase in this repository is the **standalone Wilsify AI MVP** — consisting of the Python/FastAPI backend (`backend/`) performing real audio signal processing and the Vite/React/TypeScript frontend (`frontend/`).
> 2. **Authoritative Setup Documentation:** For instructions on running, testing, building, and deploying the current product, consult the root documentation:
>    - [README.md](../README.md) — Product overview, DSP explanation, and quickstart.
>    - [INSTALLATION.md](../INSTALLATION.md) — Comprehensive, step-by-step setup guide and verification log.
> 3. **Historical and Roadmap Material:** The subdirectories in this `docs/` folder (such as `architecture/`, `deployment/`, `development/`, and `archive/`) document earlier multi-service designs and the enterprise roadmap (including references to Fastify, Next.js, Prisma, PostgreSQL, Redis, Celery, and mobile app clients).
> 4. **Infrastructure Clarification:** The architectural specifications inside `docs/` reflect future product evolution and historical design cycles; they are **not currently deployed infrastructure** and should not be interpreted as requirements for running the working standalone MVP.

---

## architecture/ — System design

| Document | Covers |
|---|---|
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | Service diagram, request/auth/billing flows, Socket.IO events, database relations |
| [API.md](architecture/API.md) | Full REST endpoint reference — every route, request/response shape, error codes |
| [DATABASE.md](architecture/DATABASE.md) | PostgreSQL schema, ERD, credit system, migrations, indexes |
| [AI_SERVICE.md](architecture/AI_SERVICE.md) | Analysis pipeline, Celery queues, real-time chord detection, AI tutor |
| [PAYMENTS.md](architecture/PAYMENTS.md) | Stripe, Razorpay, Apple IAP, Google Play — flows, webhooks, subscription lifecycle |
| [NOTIFICATIONS.md](architecture/NOTIFICATIONS.md) | Push notification system, token registration, deep-link routing |
| [web-tuner.md](web-tuner.md) | Web tuner architecture, shared audio-engine package, browser support, troubleshooting |

## deployment/ — Getting it running and keeping it running

| Document | Covers |
|---|---|
| [MAC_DEPLOYMENT_GUIDE.md](deployment/MAC_DEPLOYMENT_GUIDE.md) | Beginner, step-by-step: full stack on macOS, local + production |
| [ANDROID_DEPLOYMENT_GUIDE.md](deployment/ANDROID_DEPLOYMENT_GUIDE.md) | Beginner, step-by-step: Android Studio, EAS, and Play Store builds |
| [DEPLOYMENT.md](deployment/DEPLOYMENT.md) | Condensed reference: dev setup + production deploy (Railway, Vercel, EAS) |
| [ENVIRONMENT.md](deployment/ENVIRONMENT.md) | Every environment variable for every service |
| [EAS.md](deployment/EAS.md) | Expo EAS build profiles and store submission |
| [SECURITY.md](deployment/SECURITY.md) | Auth model, token security, rate limits, payment verification |
| [MONITORING.md](deployment/MONITORING.md) | Sentry, structured logging, health checks, alerting |
| [BACKUP_STRATEGY.md](deployment/BACKUP_STRATEGY.md) | PostgreSQL/Redis/R2 backup and restore procedures |
| [STORE_ASSETS.md](deployment/STORE_ASSETS.md) | App Store + Google Play screenshots, metadata, ASO |
| [LAUNCH_CHECKLIST.md](deployment/LAUNCH_CHECKLIST.md) | The remaining operational checklist before public launch |

## development/ — Building and maintaining the product

| Document | Covers |
|---|---|
| [PROJECT_PLAN.md](development/PROJECT_PLAN.md) | Master execution guide — phases, checklists, technical debt register |
| [TESTING.md](development/TESTING.md) | Test strategy, current suite, coverage targets |
| [PERFORMANCE.md](development/PERFORMANCE.md) | React Query/Zustand/query audit, bundle size |
| [VERSIONS.md](development/VERSIONS.md) | Versioning strategy, phase history, v1.x–v6.x roadmap, release checklist |
| [CHANGELOG.md](development/CHANGELOG.md) | Release history |
| [HANDOVER.md](development/HANDOVER.md) | Full project handover — screens, state, stack, how to continue |
| [DOCUMENTATION_QUALITY_REPORT.md](development/DOCUMENTATION_QUALITY_REPORT.md) | Sprint 10 formatting/consistency audit results |

## product/ — What to build and why

| Document | Covers |
|---|---|
| [PRODUCT.md](product/PRODUCT.md) | Product philosophy, modules, journey, subscription model, out-of-scope list |

## releases/ — Point-in-time release records

| Document | Covers |
|---|---|
| [v1.0.0.md](releases/v1.0.0.md) | Official v1.0.0 release notes and known limitations |
| [SPRINT9_RELEASE_REPORT.md](releases/SPRINT9_RELEASE_REPORT.md) | Final v1.0.0 release validation (2026-07-03) |
| [SPRINT8_RELEASE_CANDIDATE_REPORT.md](releases/SPRINT8_RELEASE_CANDIDATE_REPORT.md) | Release-candidate audit (2026-07-03) |
| [SPRINT7_PRODUCTION_REPORT.md](releases/SPRINT7_PRODUCTION_REPORT.md) | Production hardening sprint (2026-07-02) |
| [SPRINT6_SHARED_REPORT.md](releases/SPRINT6_SHARED_REPORT.md) | `@wilsify/shared` type unification (2026-07-02) |
| [AI_SERVICE_RELEASE_REPORT.md](releases/AI_SERVICE_RELEASE_REPORT.md) | AI service QA sprint (2026-07-02) |

## decisions/ — Architecture Decision Records

See [decisions/README.md](decisions/README.md) for the ADR template and index.

## Other

| Document | Covers |
|---|---|
| [blueprint.md](blueprint.md) | Master product charter |
| [STYLE_GUIDE.md](STYLE_GUIDE.md) | Documentation formatting standard (headings, tables, callouts, terminology) |

## archive/ — Historical, superseded documents

Not required reading. Kept for provenance: `archive/phase-reports/`, `archive/phase6-audit-cycle/` (June 2026 audit cycle — all findings since fixed), `archive/launch-cycle/` (superseded by `deployment/LAUNCH_CHECKLIST.md`), plus earlier phase snapshots of architecture/database/environment/security/deployment docs and two prior documentation-audit records.

---

## Current Status

See [development/VERSIONS.md](development/VERSIONS.md) §2 and §10 for the authoritative current version and dashboard. In short: **v1.0.0 shipped 2026-07-03**; Phase 2 (staging environment, smoke tests, store submission) is the remaining pre-launch work — tracked in [deployment/LAUNCH_CHECKLIST.md](deployment/LAUNCH_CHECKLIST.md) and the repository [TODO.md](development/TODO.md).
