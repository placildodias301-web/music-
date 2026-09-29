# Wilsify AI — Documentation Index (Archived)

> **Superseded** by the July 2026 documentation reorganization. See [docs/README.md](../README.md) for the current documentation map. Internal links below point at the flat pre-reorganization layout and are kept as-is for historical reference only.

**Last updated**: June 2026

| Document | Category | Purpose | Required Reading |
|----------|----------|---------|-----------------|
| [README.md](README.md) | Overview | Master documentation entry point | Yes — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture | System architecture, data models, API routes, auth flow, WebSocket events | Yes |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Operations | End-to-end production deployment guide: Railway, EAS, R2, migrations, CI/CD | Yes — before any deployment |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Operations | All environment variables: backend, mobile (EAS), AI service; validation script | Yes — before deployment |
| [DATABASE.md](DATABASE.md) | Operations | Prisma migrations, schema changelog, database indexes | Yes |
| [EAS.md](EAS.md) | Operations | Expo EAS build profiles, blockers fixed, submit commands | Yes — before mobile builds |
| [SECURITY.md](SECURITY.md) | Security | OWASP/MASVS audit, authentication, authorization, rate limits, known risks | Yes |
| [PAYMENTS.md](PAYMENTS.md) | Features | All 4 payment providers, mobile SDK integration, subscription lifecycle | Yes |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) | Features | Push notification system, token registration, deep-link routing | Yes |
| [MONITORING.md](MONITORING.md) | Operations | Sentry, structured logging, health checks, BullMQ metrics, alerting | Recommended |
| [PERFORMANCE.md](PERFORMANCE.md) | Quality | React Query audit, Zustand re-renders, memory leaks, NSDF audio, bundle size | Recommended |
| [STORE_ASSETS.md](STORE_ASSETS.md) | Launch | App Store + Google Play screenshots, metadata, ASO, IAP products | Before store submission |
| [BETA_CHECKLIST.md](BETA_CHECKLIST.md) | Launch | 110-item pre-beta launch checklist (🔴 BLOCKER / 🟡 REQUIRED / 🟢 RECOMMENDED) | Before inviting beta testers |
| [BETA_LAUNCH.md](BETA_LAUNCH.md) | Launch | Phase 6 completion summary, architectural decisions locked, feature completeness | Reference |
| [HANDOVER.md](HANDOVER.md) | Reference | Complete project handover: screens, state, backend, stack, how to continue | For new developers |
| [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) | Meta | Inventory of all 24 original markdown files and their reorganization decisions | Reference |
| [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) | Meta | This file | — |
| [archive/phase-reports/PHASE4_REPORT.md](archive/phase-reports/PHASE4_REPORT.md) | Archive | Phase 4 completion report (historical) | No |
| [archive/phase-reports/BETA_READINESS_REPORT.md](archive/phase-reports/BETA_READINESS_REPORT.md) | Archive | Phase 3 beta readiness assessment (historical) | No |

---

## Documents by Category

### Start Here (New Developer / Handover)
1. [README.md](README.md) — what this is
2. [HANDOVER.md](HANDOVER.md) — everything you need to pick this up
3. [ARCHITECTURE.md](ARCHITECTURE.md) — how it all fits together

### Before Deploying
1. [ENVIRONMENT.md](ENVIRONMENT.md) — set all env vars first
2. [DATABASE.md](DATABASE.md) — migrations to run
3. [DEPLOYMENT.md](DEPLOYMENT.md) — step-by-step launch guide

### Before Store Submission
1. [EAS.md](EAS.md) — build configuration
2. [STORE_ASSETS.md](STORE_ASSETS.md) — screenshots, metadata, IAP products
3. [BETA_CHECKLIST.md](BETA_CHECKLIST.md) — complete every item

### Reference (Feature Implementation)
- [PAYMENTS.md](PAYMENTS.md) — payment providers, SDK integration, webhook flows
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — push notification system and deep links
- [SECURITY.md](SECURITY.md) — security audit findings and remaining actions
- [MONITORING.md](MONITORING.md) — observability and alerting
- [PERFORMANCE.md](PERFORMANCE.md) — performance analysis and optimization notes
