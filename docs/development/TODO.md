# Wilsify AI TODO

Live checklist of real, currently-open work discovered during the July 2026 documentation audit. Cross-referenced against `docs/development/PROJECT_PLAN.md` (Technical Debt Register), `docs/development/VERSIONS.md`, `docs/releases/SPRINT9_RELEASE_REPORT.md`, and `docs/deployment/LAUNCH_CHECKLIST.md` — nothing here is invented. See those documents for full detail on any item.

## v1.0.1 — Launch Verification

- [ ] Verify Railway deployment (backend + AI service) against real infrastructure
- [ ] Verify Vercel deployment (web app) against real infrastructure
- [ ] Verify Expo EAS production build — `app.json` `extra.eas.projectId` and `eas.json` `appleId`/`ascAppId` are still `TODO_`-prefixed placeholders
- [ ] Run the pending Prettier format pass across the repository (193 files, tracked in `PROJECT_PLAN.md` Phase 1)
- [ ] Complete the remaining `docs/deployment/LAUNCH_CHECKLIST.md` items: staging environment, live payment provider credentials (Razorpay KYC, Apple IAP products, Stripe live keys), store submission assets
- [x] ~~Reconcile the credit-system description mismatch~~ — Fixed 2026-08-03: `web/index.html` and `web/script.js` now say "50 credits/month" to match `backend/src/config/plans.ts` (source of truth). Note: `web/WILSIFY.md`, referenced elsewhere in `docs/`, was not found in this repository snapshot — either it was deleted without cleaning up its references, or it never made it into this export. Confirm before next submission.

## v1.1 — Engagement & Consistency

- [ ] Persist AI-generated difficulty into the database (`Analysis.difficulty Json?` — see `backend/prisma/schema.prisma`)
- [ ] Persist AI-generated mode, Major/Minor (`Analysis.mode String?` — see `backend/prisma/schema.prisma`)
- [ ] Add a Playwright E2E test suite (register → upload → analysis → tutor → billing)
- [ ] Configure a mobile CI pipeline (EAS Build GitHub Action)
- [ ] Add Detox or Maestro mobile testing (no automated mobile test suite exists today)
- [ ] Move `backend/src/services/redis.ts` → `backend/src/plugins/redis.ts` (infrastructure client in the wrong layer)
- [ ] Move the BullMQ scheduler worker into `backend/src/workers/` (currently in `services/`)
- [ ] Remove local `User`/`Plan`/type re-definitions in `web-app` and `mobile_app` in favor of `@wilsify/shared`

## v1.2 — Quality & Performance

- [ ] Improve Lighthouse performance score for the web app (no baseline audit run yet)
- [ ] Add additional accessibility testing (no automated a11y audit exists)
- [ ] Increase backend and AI service test coverage thresholds beyond the current baseline
- [ ] Add mypy static type checking to AI service CI (config already exists in `pyproject.toml`, unused)
- [ ] Add benchmark report generation for the AI service analysis pipeline

## Housekeeping (low priority)

- [ ] Capture production screenshots for the root README
- [ ] Test the mobile app on additional Android/iOS devices
- [ ] Verify backup and restore in live production (`docs/deployment/BACKUP_STRATEGY.md`)
- [ ] Verify monitoring dashboards after deployment; configure uptime monitoring

## v2+

- [ ] Continue the roadmap from `docs/development/VERSIONS.md` §4 — v2.x (Developer API, Community Growth) through v6.x (AI Platform)

---

*This file tracks real, discovered work only. When an item is completed, check it off and — if it originated from `PROJECT_PLAN.md`'s Technical Debt Register — update that register's status too, so the two stay in sync.*
