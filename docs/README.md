# Wilsify AI — Documentation Index

Wilsify AI is a standalone MVP: a Python/FastAPI backend (`backend/`) and a Vite/React/TypeScript frontend (`frontend/`), with Supabase for sign-in and cloud sync. **Current status: NOT READY** until the Windows browser loop and Windows command verification are complete ([report](./verification/FINAL_VERIFICATION_REPORT.md)).

One authoritative file per topic:

| Topic | File |
|---|---|
| What it is, features, limitations | [`../README.md`](../README.md) |
| Setup, environment variables, migrations, run, test, deploy, troubleshooting | [`../INSTALLATION.md`](../INSTALLATION.md) |
| Current scope, roadmap/backlog, task status, known limitations | [`../MVP_PLAN.md`](../MVP_PLAN.md) |
| Verification status (evidence per check) | [`verification/FINAL_VERIFICATION_REPORT.md`](./verification/FINAL_VERIFICATION_REPORT.md) |
| Test map (146 backend, 415 frontend tests) | [`verification/TEST_COVERAGE.md`](./verification/TEST_COVERAGE.md) |

## Active reference

| Path | Contents |
|---|---|
| [`analysis/`](./analysis/) | Point-in-time project analysis: [`project_analysis.md`](./analysis/project_analysis.md), [`requirements.md`](./analysis/requirements.md), [`feasibility_and_risks.md`](./analysis/feasibility_and_risks.md), [`sources.md`](./analysis/sources.md) |
| [`benchmark/`](./benchmark/README.md) | Key/BPM benchmark data and scripts (the `RESULTS.md` and `ground_truth.json` cited by the analysis are not in the repository) |
| [`stem_separation/`](./stem_separation/README.md) | Offline stem-separation tool. Not part of the app: the Stem Splitter UI is a preview and the backend stem endpoints are not implemented |
| [`legal/COPYRIGHT_POLICY.md`](./legal/COPYRIGHT_POLICY.md) | What is stored and for how long; rights attestation |
| [`decisions/README.md`](./decisions/README.md) | Architecture Decision Record template (no ADRs written yet) |
| [`STYLE_GUIDE.md`](./STYLE_GUIDE.md) | Documentation formatting standard (not yet reviewed for the MVP) |

## Archive (historical — does not describe the current MVP)

Everything below describes an earlier, larger multi-service design (Fastify, Next.js, Prisma, Expo, Redis, Stripe/Razorpay) whose code is not in this repository, or point-in-time audit/release records. Where an archived file claims "ready", "GO", a test count, a Python version or a storage behaviour, the active documents above take precedence. Some of these files contain Mermaid diagrams of that legacy design (for example `legacy-architecture/ARCHITECTURE.md` and `DATABASE.md`); there is no current architecture or user-flow diagram in the repository.

| Folder | Contents |
|---|---|
| [`archive/legacy-architecture/`](./archive/legacy-architecture/) | Former `docs/architecture/` (architecture, API, database, AI service, notifications, payments) |
| [`archive/legacy-deployment/`](./archive/legacy-deployment/) | Former `docs/deployment/` (Railway/Vercel/EAS, Android/Mac guides, environment, security, monitoring, backup, launch checklist) |
| [`archive/legacy-development/`](./archive/legacy-development/) | Former `docs/development/` (changelog, versions, handover, performance, testing, project plan, TODO) |
| [`archive/legacy-product/`](./archive/legacy-product/) | Blueprint, product spec, web tuner doc |
| [`archive/legacy-releases/`](./archive/legacy-releases/) | v1.0.0 and sprint release reports |
| [`archive/legacy-audits/`](./archive/legacy-audits/) | Earlier audit, validation and readiness reports |
| [`archive/legacy-demo/`](./archive/legacy-demo/) | Earlier Express demo README and the pre-cleanup root README |
| [`archive/`](./archive/DOCUMENTATION_AUDIT_2026-06.md) | Earlier archived material (phase reports, launch cycle, phase-6 audit cycle, landing-page doc); the June 2026 documentation audit is `DOCUMENTATION_AUDIT_2026-06.md` |

The audit and decisions behind this layout: [`../DOCUMENTATION_AUDIT.md`](../DOCUMENTATION_AUDIT.md).
