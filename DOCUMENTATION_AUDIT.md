# Documentation Audit — Wilsify AI MVP

**Scope:** every tracked `.md` file on branch `main` at `937375d` (80 files). The checked-out `wilbur` branch has 78 (it lacks `FINAL_VERIFICATION_REPORT.md` and `TEST_COVERAGE.md`). Excluded: `.pytest_cache/README.md` and `backend/.pytest_cache/README.md` (untracked, git-ignored).
**Status of this file:** Step 1–3 proposal. **No file has been moved, renamed, edited or deleted.** Nothing below is implemented until approved.
**Naming note:** `docs/archive/DOCUMENTATION_AUDIT.md` already exists (a June 2026 audit of the *legacy* repo). This file is a different, newer document; on approval the old one is renamed to `docs/archive/DOCUMENTATION_AUDIT_2026-06.md` so the names do not collide.

**Read depth (honest):** fully read — README, INSTALLATION, MVP_PLAN, FINAL_VERIFICATION_REPORT, TEST_COVERAGE, frontend/README, docs/README, docs/legacy/MVP_DEMO_README, docs/benchmark/README, docs/stem_separation/README, LAUNCH_CHECKLIST, PROJECT_PLAN, TODO, COPYRIGHT_POLICY. Scanned by headings, banners, status lines and targeted greps — everything else (marked ◐ below). Every ◐ row needs a full read before its content is merged or archived; no unique information is assumed absent.

## Status key
KEEP · UPDATE (edit in place) · MERGE (content folded into another file, original archived) · ARCHIVE (moved to `docs/archive/`, content untouched except a pointer banner) · DELETE CANDIDATE (none proposed in this pass).

---

## Bucket 1 — Essential product docs

| Path | Purpose | Status | Overlaps | Outdated / contradictory | Unique info to preserve | Action | Reason |
|---|---|---|---|---|---|---|---|
| `README.md` (146 L) | Project front page | **UPDATE** | INSTALLATION (run steps, env table, deploy), MVP_PLAN | Says "13 tests" (real: 146 backend + 415 frontend); flow starts at "Upload Song" with no auth, Supabase, Library or auto-save; no status/limitations; full env table + deploy notes duplicate INSTALLATION | Feature list, Practice Mode description, `/api/health` check | Shrink to: what it is, core features, quick start (3 commands), doc links, known limitations; move env/deploy detail out (already in INSTALLATION) | Must be short and non-contradictory |
| `INSTALLATION.md` (~284 L) | Setup, env vars, migrations, run, deploy, troubleshooting | **KEEP** (small UPDATE) | README, MVP_PLAN env table, LAUNCH_CHECKLIST | None known (rewritten 2026-10, commit 9202746). Will absorb LAUNCH_CHECKLIST ops items | Supabase setup, `0001`/`0002` migration steps, env tables, Windows + Unix commands, troubleshooting | Add deployment/launch checklist items from LAUNCH_CHECKLIST (deduped); fix links after moves | Single setup/run/migration/deploy guide |
| `MVP_PLAN.md` (~211 L) | Scope, task status, roadmap | **UPDATE** | PROJECT_PLAN, TODO, LAUNCH_CHECKLIST, README, INSTALLATION (env table lines ~72–79, run table ~153) | Own env/run tables duplicate INSTALLATION; otherwise current (status 2026-10-18, NOT READY) | TASK-01..12 table, scope, blockers | Replace duplicated env/run tables with links to INSTALLATION; add open TODO items (below) | Single scope/roadmap/status file |

## Bucket 2 — Verification / QA

| Path | Purpose | Status | Overlaps | Outdated / contradictory | Unique info | Action | Reason |
|---|---|---|---|---|---|---|---|
| `FINAL_VERIFICATION_REPORT.md` (188 L, rev 3) | Only verification status (NOT READY) | **KEEP → move** `docs/verification/` | MVP_PLAN status banner; TEST_COVERAGE counts | None known; links to move | All evidence, commit refs, demo-media results, blockers | Move; fix relative links | Target structure |
| `TEST_COVERAGE.md` (101 L) | Test map (146 backend / 415 frontend) | **KEEP → move** `docs/verification/` | Report A1/A2 counts (consistent) | Run command shown is Windows-only | Full test→flow map | Move; fix links; add Unix command | Target structure |
| `CHORD_ACCURACY_REPORT.md` | — | **does not exist** | — | — | Chord data is in `docs/benchmark/` and the report | Do **not** create an empty file; list as a documentation gap | No invented content |
| `docs/PRODUCT_VALIDATION_REPORT.md` (288 L) ◐ | Older product validation | **ARCHIVE** | Verification report | Legacy-monorepo era | Possibly validation evidence | `docs/archive/legacy-audits/` after full read | Superseded status |
| `docs/AUDIT_VERIFICATION_REPORT.md` (128) ◐, `docs/FINAL_AUDIT_REPORT.md` (174) ◐, `docs/AUDIT_AND_CLEANUP_2026-09.md` (120) ◐, `docs/PRODUCTION_READINESS_CHECKLIST.md` (79) ◐ | Earlier audits / readiness verdicts | **ARCHIVE** | Verification report, MVP_PLAN | Any "ready/GO" verdict conflicts with current NOT READY | Dates, past findings | `docs/archive/legacy-audits/` | Historical; competing status claims |

## Bucket 3 — Analysis / research

| Path | Purpose | Status | Overlaps | Outdated / contradictory | Unique info | Action | Reason |
|---|---|---|---|---|---|---|---|
| `analysis/project_analysis.md` (331) ◐ | Competitor + project analysis | **KEEP → move** `docs/analysis/` | requirements, sources | Header says "Branch: wilbur"; point-in-time — predates auth/Library? (to verify); tags `[VERIFIED FROM MY CODE]` may be stale | Competitor comparison, tag legend | Move; add "as of" date banner; verify tagged claims only if you ask | Target structure |
| `analysis/requirements.md` (159) ◐ | Functional/non-functional requirements | **KEEP → move** | project_analysis | Same staleness risk | Req IDs table | Move; fix links | Target structure |
| `analysis/feasibility_and_risks.md` (114) ◐ | Feasibility, SWOC, risks | **KEEP → move** | MVP_PLAN known limitations | Cites `docs/benchmark/RESULTS.md` — file not in tree (broken ref) | 17/19 key-ensemble result, risk register | Move; fix/flag the `RESULTS.md` reference (point to `docs/benchmark/README.md`) | Preserve benchmark result |
| `analysis/sources.md` (86) ◐ | Citation index | **KEEP → move** | — | Links to siblings must follow | All source URLs | Move; fix links | Preserve citations |
| `docs/benchmark/README.md` (13) | Benchmark dataset + key/BPM validation notes | **KEEP in place** | feasibility doc | None | 17/19, 6/7 held-out, 15/19 LOO; BPM truth still UNKNOWN | Keep next to its data/scripts | Data-adjacent |
| `docs/stem_separation/README.md` (52), `TEST_011_separation_report.md` (86) | Standalone stem pipeline (offline tool) + one report | **KEEP in place** | MVP_PLAN "stem splitter not implemented" | README may suggest a feature the app lacks — clarify "offline tool, not wired to the app" | Install/run commands, model sizes, speed | Add one-line scope note | Valid commands |

## Bucket 4 — Temporary / one-off task docs, plans, demo scripts

| Path | Purpose | Status | Overlaps | Outdated / contradictory | Unique info | Action | Reason |
|---|---|---|---|---|---|---|---|
| `docs/development/PROJECT_PLAN.md` (63) | Old "MVP master plan", status *Active* | **MERGE → MVP_PLAN, archive** | MVP_PLAN | "Python 3.12, basic-pitch" (real: 3.10+, librosa HMM); Phase 3 "capture screenshots"; claims "Need automated frontend tests – Open" (415 tests exist) | Phases 1–3, debt register (cache analysis, alt pitch libs) | Fold 3 open items into MVP_PLAN roadmap; archive original | Second status file |
| `docs/development/TODO.md` (28) | Task checklist, *Active* | **MERGE → MVP_PLAN, archive** | MVP_PLAN, PROJECT_PLAN | Unchecked items already covered/duplicated | Open: regression tests (pitch-shift/noise), analysis caching, 2nd key method, capo-vs-sounding UI, transpose, bundle size, screenshots | Fold open items into MVP_PLAN "Backlog" | Second status file |
| `docs/deployment/LAUNCH_CHECKLIST.md` (60) | Ops checklist | **MERGE → INSTALLATION, archive** | INSTALLATION deploy checklist | "Python 3.12+" vs 3.10+ everywhere else | Host/CORS/health/static-host checks | Dedupe into INSTALLATION deploy checklist | One deploy guide |
| `SPONSOR_DEMO.md` (412) ◐ | Investor demo script | **ARCHIVE** (or UPDATE — your call, Q1) | CHEATSHEET | "Verified GO (95/100)" contradicts NOT READY; "$9.99 freemium / neural stem separation" are plans not facts (stem backend unbuilt); "analysis under a second" unsupported; flow starts `/studio` without login; MIDI/PDF export claims unverified vs MVP_PLAN | Demo script, Q&A, honesty table | `docs/archive/demo/` unless you want it rewritten | Overstated claims |
| `SPONSOR_CHEATSHEET.md` (60) ◐ | One-page demo companion | **ARCHIVE** (Q1) | SPONSOR_DEMO | Same pitch claims | 5-minute flow | Same as above | Same |
| `docs/COLLEGE_SUBMISSION_PACKAGE.md` (93) ◐, `docs/VIVA_PREPARATION.md` (91) ◐ | Academic submission / viva prep | **Needs review (Q2)** | analysis/*, README | Likely written against legacy stack | Possibly your only copy of viva prep | Default: keep at `docs/` unchanged unless you decide | Personal/academic value |
| `docs/releases/*` (6) ◐: `AI_SERVICE_RELEASE_REPORT`, `SPRINT6_SHARED_REPORT`, `SPRINT7_PRODUCTION_REPORT`, `SPRINT8_RELEASE_CANDIDATE_REPORT`, `SPRINT9_RELEASE_REPORT`, `v1.0.0` | Legacy sprint/release reports | **ARCHIVE** | docs/README "v1.0.0 shipped 2026-07-03" | Describe the legacy multi-service product, not this MVP | Release history | `docs/archive/legacy-releases/` | Historical |

## Bucket 5 — Duplicate / obsolete (legacy multi-service monorepo: Fastify, Next.js, Prisma, Expo, Redis, Celery, Stripe/Razorpay — none of that code exists in this repo)

| Path | Status | Contradiction | Action |
|---|---|---|---|
| `docs/blueprint.md` (1265) ◐, `docs/product/PRODUCT.md` (631) ◐ | ARCHIVE | Product spec of the legacy platform (payments, mobile, credits) | `docs/archive/legacy-product/` |
| `docs/architecture/{ARCHITECTURE, API, DATABASE, AI_SERVICE, NOTIFICATIONS, PAYMENTS}.md` ◐ | ARCHIVE | Describe services/tables/endpoints that don't exist; MVP API (`/api/analyze/stream`, `/api/assistant`, `/api/health`) and `public.user_data` are documented only in INSTALLATION/MVP_PLAN | `docs/archive/legacy-architecture/`. **Gap:** no current API/architecture doc (see Gaps) |
| `docs/deployment/{ANDROID_DEPLOYMENT_GUIDE, MAC_DEPLOYMENT_GUIDE, EAS, STORE_ASSETS}.md` ◐ | ARCHIVE | Mobile/Expo/store — no mobile app here | `docs/archive/legacy-deployment/` |
| `docs/deployment/{DEPLOYMENT, ENVIRONMENT, BACKUP_STRATEGY, MONITORING, SECURITY}.md` ◐ | ARCHIVE (after full read for still-valid items) | Legacy env vars/infra; conflict with INSTALLATION env tables. Any still-valid control (e.g. security advice) is folded into INSTALLATION/MVP_PLAN during implementation | `docs/archive/legacy-deployment/` |
| `docs/development/{CHANGELOG, VERSIONS, HANDOVER, PERFORMANCE, TESTING, DOCUMENTATION_QUALITY_REPORT}.md` ◐ | ARCHIVE | `TESTING.md` lists 67/131 Fastify tests vs TEST_COVERAGE (146/415) | `docs/archive/legacy-development/` |
| `docs/web-tuner.md` (96) | ARCHIVE | Refers to `web-app/`, `packages/shared`, `mobile_app/` — none exist; tuner now lives in `frontend/` (commit f782027) | Archive; **Gap:** no current tuner doc |
| `docs/legacy/MVP_DEMO_README.md` (160) | ARCHIVE | Earlier Express demo returning "demo data"; real analysis is librosa | `docs/archive/legacy-demo/` |
| `docs/STYLE_GUIDE.md` (135) ◐ | Needs review (Q3) | Unknown whether it styles the legacy UI | Keep until reviewed |
| `docs/archive/**` (21 files: `ARCHITECTURE_phase4`, `DATABASE_phase6_migrations`, `DEPLOYMENT_phase6_status`, `DOCUMENTATION_AUDIT`, `DOCUMENTATION_INDEX`, `ENVIRONMENT_phase6`, `SECURITY_audit_phase6`, `WILSIFY-landing-page-doc`, `launch-cycle/*` (2), `phase-reports/*` (2), `phase6-audit-cycle/*` (8)) | KEEP (already archived) | `DOCUMENTATION_INDEX` is stale | Leave contents; rename old `DOCUMENTATION_AUDIT.md` (see naming note); add `docs/archive/README.md` index |

## Bucket 6 — Unknown / needs review

| Path | Status | Note |
|---|---|---|
| `docs/README.md` (89) | **UPDATE** | Banner already says README/INSTALLATION are authoritative; the map lists legacy docs and "v1.0.0 shipped 2026-07-03". Rewrite as a short docs index matching the new structure |
| `docs/legal/COPYRIGHT_POLICY.md` (46) | **UPDATE** | Says results live "only in your browser session… until you close the tab" and mentions `MvpContext`; the MVP auto-saves to Library (localStorage `wilsify_library_v1` + Supabase `public.user_data`). The rights-attestation logging claim is unverified against current code. Keep path; correct the storage table only |
| `docs/decisions/README.md` (46) | **KEEP** | ADR template; no ADRs exist |
| `frontend/README.md` (11) | **KEEP** (small UPDATE) | Add link to INSTALLATION |

---

## Proposed final structure

```
/
├── README.md                          (UPDATE – short)
├── INSTALLATION.md                    (KEEP + absorbs LAUNCH_CHECKLIST)
├── MVP_PLAN.md                        (UPDATE + absorbs PROJECT_PLAN, TODO)
├── DOCUMENTATION_AUDIT.md             (this file)
├── frontend/README.md                 (KEEP)
└── docs/
    ├── README.md                      (UPDATE – index of the below)
    ├── verification/
    │   ├── FINAL_VERIFICATION_REPORT.md   (moved)
    │   └── TEST_COVERAGE.md               (moved)
    │   (CHORD_ACCURACY_REPORT.md – not created; see Gaps)
    ├── analysis/
    │   ├── project_analysis.md · requirements.md · feasibility_and_risks.md · sources.md   (moved from /analysis)
    ├── benchmark/README.md            (stays)
    ├── stem_separation/               (stays)
    ├── legal/COPYRIGHT_POLICY.md      (UPDATE)
    ├── decisions/README.md            (stays)
    └── archive/
        ├── README.md                  (new index)
        ├── (existing 21 files, untouched)
        ├── DOCUMENTATION_AUDIT_2026-06.md   (renamed)
        ├── legacy-architecture/ · legacy-deployment/ · legacy-development/ · legacy-product/
        ├── legacy-releases/ · legacy-audits/ · legacy-demo/ · demo/
```

Moves use `git mv`-equivalent semantics (history preserved if you commit them as renames). `docs/PROJECT_OVERVIEW.md` (the 8-diagram overview I wrote earlier, currently not in the repo) can be added to `docs/` if you want it — Q4.

## Merge map

| Source | Destination | What goes where |
|---|---|---|
| `docs/development/PROJECT_PLAN.md` | `MVP_PLAN.md` § Roadmap/Backlog | Phase goals still open; debt items: analysis caching, alternative pitch libraries. Dropped as false: "need automated frontend tests" |
| `docs/development/TODO.md` | `MVP_PLAN.md` § Backlog | 8 open items listed above; the 2 checked items are recorded as done |
| `docs/deployment/LAUNCH_CHECKLIST.md` | `INSTALLATION.md` § Deploy checklist | Host, ffmpeg, health check, `CORS_ORIGINS`/`FRONTEND_ORIGIN`, static host, build step. Python version kept at 3.10+ |
| `README.md` env table + deploy notes | already in `INSTALLATION.md` | Verify each var (`FRONTEND_ORIGIN`, `VITE_API_URL`) exists there, then delete from README |
| `MVP_PLAN.md` env/run tables | link to `INSTALLATION.md` | Same verification |
| `docs/deployment/{SECURITY,ENVIRONMENT,MONITORING,BACKUP_STRATEGY,DEPLOYMENT}.md` | `INSTALLATION.md` / `MVP_PLAN.md` known limitations — **only** controls verified to apply to this stack | Decided after full read; everything else stays in archive |
| `analysis/*` | `docs/analysis/*` | 1:1 move, links rewritten |
| Root verification files | `docs/verification/*` | 1:1 move; MVP_PLAN/README links rewritten |

## Contradictions found

1. **Test counts:** README "13 tests" · `docs/development/TESTING.md` "67 / 131 tests (Fastify)" · TEST_COVERAGE + MVP_PLAN + report "146 backend / 415 frontend in 24 files". Current = the last.
2. **Readiness:** `SPONSOR_DEMO.md` "Verified GO (95/100)" and earlier audit reports vs FINAL_VERIFICATION_REPORT / MVP_PLAN **NOT READY**.
3. **Python version:** LAUNCH_CHECKLIST + PROJECT_PLAN "3.12" vs README/INSTALLATION/MVP_PLAN "3.10+" (stem tool 3.10–3.13).
4. **Chord engine:** PROJECT_PLAN "basic-pitch" vs real librosa HMM/Viterbi (basic-pitch appears only as a competitor in analysis).
5. **Data storage:** COPYRIGHT_POLICY "results only in the browser session" vs auto-save to Library + Supabase.
6. **Product shape:** README flow (no login, no Library) vs INSTALLATION/MVP_PLAN (auth → upload → auto-save → Library → Practice).
7. **Analysis behaviour:** `docs/legacy/MVP_DEMO_README.md` "demo data" vs real analysis.
8. **Stem separation:** SPONSOR_DEMO sells "neural stem separation" and MVP_PLAN lists a Browser Stem Mixer, while the backend splitter is not implemented (only an offline tool in `docs/stem_separation/`).
9. **Stale paths:** web-tuner (`web-app/`, `packages/shared`, `mobile_app/`), docs/README map, feasibility doc → missing `docs/benchmark/RESULTS.md`.
10. **Duplicated status:** MVP_PLAN, PROJECT_PLAN, TODO, LAUNCH_CHECKLIST each present themselves as the active plan.
11. **Name clash:** two `DOCUMENTATION_AUDIT.md` (root-new vs `docs/archive/`).
12. **Non-md, out of scope, noted only:** `.gitignore` header still mentions `web-app/mobile_app/ai-service`; link `supabase/migrations/0001_user_data.sql` from MVP_PLAN is valid (file exists on `main`).

## Documentation gaps (not created without your OK — nothing is invented)

- No `CHORD_ACCURACY_REPORT.md`; chord accuracy is not measured against ground truth (BPM/meter/chord truth still UNKNOWN in `docs/benchmark`).
- No current API reference (`/api/analyze/stream`, `/api/assistant`, `/api/health`, headers, error shapes) and no current architecture doc (only `PROJECT_OVERVIEW.md`, uncommitted).
- No current tuner or Practice Studio doc.
- No ADRs.

## Questions for you (defaults if you just say "approved")

- **Q1** Sponsor docs: archive (default) or rewrite to match NOT READY?
- **Q2** `COLLEGE_SUBMISSION_PACKAGE` / `VIVA_PREPARATION`: leave in `docs/` (default) or archive?
- **Q3** `STYLE_GUIDE`: leave until reviewed (default).
- **Q4** Add `docs/PROJECT_OVERVIEW.md` and use it as the architecture/user-flow doc (default: no).
- **Q5** Where to apply the changes: default is the working tree of the checked-out `wilbur` branch, left **uncommitted** for you to review. Alternative: commit to `main` via the private-index method used before. No commit happens without your explicit say-so.

Files proposed for deletion: **none** (everything is kept or archived).

---

## Decisions and execution record (2026-10-19) — supersedes the proposal above where they differ

Approved by the owner, applied to the **`wilbur` working tree, uncommitted**. No file deleted; no commit, push, stash, reset or branch change.

**On hold — untouched, no banner, not in the active index:** `SPONSOR_DEMO.md`, `SPONSOR_CHEATSHEET.md`, `docs/COLLEGE_SUBMISSION_PACKAGE.md`, `docs/VIVA_PREPARATION.md`. Also left alone: `docs/STYLE_GUIDE.md` (its links to `development/PROJECT_PLAN.md` and the example `path.md` are therefore still broken), `docs/benchmark/`, `Wilsify AI.html`, application code, config, `.gitignore`, and the pre-existing contents of `docs/archive/`.
**Not done (by decision):** no `docs/PROJECT_OVERVIEW.md`; no new architecture, API, chord-accuracy, tuner or Practice Studio documentation.

| Action | Result |
|---|---|
| Moved | 4 analysis files → `docs/analysis/`; 39 legacy files → `docs/archive/legacy-*/`; `FINAL_VERIFICATION_REPORT.md` and `TEST_COVERAGE.md` placed in `docs/verification/` (copied from `main` @ `937375d`, because they do not exist on `wilbur`) |
| Renamed | `docs/archive/DOCUMENTATION_AUDIT.md` → `docs/archive/DOCUMENTATION_AUDIT_2026-06.md` |
| Rewritten / updated | `README.md`, `INSTALLATION.md` (`main` version + merged items), `MVP_PLAN.md` (`main` version + backlog, links), `docs/README.md`, `docs/legal/COPYRIGHT_POLICY.md` (storage table), `docs/stem_separation/README.md` (scope note), `frontend/README.md`, `docs/decisions/README.md` (one link), the four `docs/analysis/` files (banner, benchmark note, links), the two verification files (links, location note, "not pushed" corrected), this file |
| Created | `docs/archive/legacy-demo/README_before_2026-10-19_cleanup.md` (verbatim copy of the old root README, for provenance) |

### Preserved from archived deployment-era docs
| Archived file | Valid items kept | Destination |
|---|---|---|
| `legacy-deployment/LAUNCH_CHECKLIST.md` | host/ffmpeg/health, CORS origin, static host, build step, `VITE_API_URL`, HTTPS, no committed `.env`, payload-size limits, smoke test, rollback plan, sign-off | `INSTALLATION.md` §8 checklist + §8.1, §8.2, §8.6 |
| `SECURITY.md` | restrict CORS origins; per-IP rate limit; upload size limits; structured errors without stack traces; keep dependencies updated (`npm audit`/`pip-audit`); never log tokens; watch 5xx spikes | `INSTALLATION.md` §8.3. Everything else (JWT/refresh tokens, admin roles, AI-service secret, Razorpay/Stripe webhooks, Redis idempotency, Helmet, `localStorage`-free web app) describes the legacy stack and stays only in the archive |
| `BACKUP_STRATEGY.md` | export data before migrations/launch; test a restore; restore into a new database, never over live data | `INSTALLATION.md` §8.4, rewritten for Supabase `public.user_data` and labelled as a recommendation. Railway/Redis/R2 procedures stay in the archive |
| `MONITORING.md` | health check as uptime probe; alert on repeated health failures, 5xx rate, long analyses | `INSTALLATION.md` §8.5, labelled as a recommendation (Sentry/BullMQ/WebSocket items are legacy-only) |
| `DEPLOYMENT.md` | frontend on a static host (Vercel/Netlify/Cloudflare Pages), `uvicorn` command, health check | already in `INSTALLATION.md` §4–§5, §8; Railway/EAS/Vercel-project steps stay in the archive. Its `--workers 2` is **not** carried over (the rate limiter is in-process) |
| `ENVIRONMENT.md` | `MAX_AUDIO_*` style limits | superseded by the MVP limits already in `INSTALLATION.md`/`MVP_PLAN.md` (100 MB; YouTube 20 min); all other variables are legacy |
| `ANDROID_`/`MAC_DEPLOYMENT_GUIDE`, `EAS`, `STORE_ASSETS` | none (mobile/store; no mobile app here) | archive only |
| `PROJECT_PLAN.md`, `TODO.md` (development) | open backlog items | `MVP_PLAN.md` §11 |

### Known remaining issues
- 94 broken relative links remain, all in `docs/archive/` files that were already archived before this cleanup (they point at `backend/src/…`, `mobile-rn/…`, `ai-service/…`, and sibling docs of the old layout) — left untouched by decision; plus 2 in the held-for-review `docs/STYLE_GUIDE.md`.
- `docs/benchmark/RESULTS.md` and `ground_truth.json` are cited by the analysis docs but are not in the tree (noted in each analysis file).
- Documentation gaps: no `CHORD_ACCURACY_REPORT.md`; no current API reference, architecture/user-flow doc, tuner or Practice Studio doc; no ADRs.

### Branch caution (found during final checks)
The checked-out `wilbur` branch (HEAD `3234c3a`) is 8 commits **behind** `main` (`wilbur` is an ancestor of `main`). The code and tests on `wilbur` are older: 18 test files and 55 backend test functions, versus 24 test files and 73 backend test functions (145 parametrized cases + 1 = 146 tests) on `main`. The verified figures used throughout the active docs (146 backend, 415 frontend, X-Request-ID, Practice fixes, the tests named in `MVP_PLAN.md` §2 such as `practiceStudio.test.tsx`) describe **`main` @ `937375d`**. In the `wilbur` working tree those test files do not exist yet, so a few references will not resolve until `main` is merged into `wilbur`.

