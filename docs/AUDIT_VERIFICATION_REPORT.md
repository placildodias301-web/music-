# Wilsify AI — Audit Verification & Fix Report

Verifies the 5 issues you flagged, adds what a deeper pass found, and gives corrected code where needed. Grounded in what's actually in the ZIP — every claim below was checked against the repository, not assumed.

---

## 1. Your 5 Flagged Issues — Verified

| # | Issue | Verified? | Status after this pass |
|---|---|---|---|
| 1 | Root `.gitignore` missing | **Confirmed.** No `.gitignore` at repo root (module-level ones exist, e.g. `backend/.gitignore` for `node_modules`, but nothing at root). | **Fixed** — new root `.gitignore` added, covers Node, Next.js, Expo, Python, Prisma, logs, env files, IDE, OS. |
| 2 | Docker files present, should be removed | **Confirmed.** Found `ai-service/Dockerfile`, `ai-service/.dockerignore`, `backend/Dockerfile`, `backend/.dockerignore`, `web-app/Dockerfile`. **Deeper finding:** these were already dead code — `backend/railway.json` and `ai-service/railway.json` both explicitly set `"builder": "NIXPACKS"`, meaning Railway was never actually building from these Dockerfiles in the first place. | **Fixed** — all 5 files deleted from the clean package. 17 documentation files referenced Docker; the ones stating *current, active* setup steps were rewritten (see §6); dated changelog/release-report files were left untouched (rewriting history to hide that Docker was once considered would make those records inaccurate). |
| 3 | ZIP contains `.git` folder / history | **Confirmed.** `.git` was present and is 286 MB — larger than the entire rest of the project (3.9 MB). | **Fixed in the clean package** — see §4 for how to do this yourself going forward. |
| 4 | `web-app` vs `web` naming inconsistency | **Confirmed, and clarified.** These are two different, both-legitimate folders, not a naming inconsistency: `web-app/` is the real Next.js 14 product (dashboard, referenced in root `package.json` workspaces, 17 doc references as the active app). `web/` is a static marketing/landing page (plain HTML/CSS/JS, deployed separately to GitHub Pages via `.github/workflows/deploy.yml`) — it is **not** in the npm workspaces list, so it's not part of the app monorepo proper. Keep both; the naming is fine once you know what each is. Consider renaming `web/` → `landing/` only if the current name is confusing a reader — functionally nothing needs to change. | No action needed — documented for clarity. |
| 5 | Want a clean final submission package | — | **Delivered** — `Wilsify_AI_Submission_Clean.zip`, see §4. |

---

## 2. A Bug I Found While Verifying #2 (not on your list)

While confirming the Docker files were unused, I found `docs/development/TODO.md` already had this open item, in the project's own words:

> Reconcile the credit-system description mismatch between `web/WILSIFY.md` / `web/index.html` ("50 credits every 24 hours") and the actual backend (`backend/src/config/plans.ts`), which allocates credits **monthly** per plan.

I checked both sides:
- `backend/src/config/plans.ts` — comment literally says `// Monthly credit allocation per plan`, `FREE: 50`.
- `web/index.html` / `web/script.js` — said "50 credits every 24 hours" / "resets every 24 hrs" in four places.

This is a real product-facing bug: the marketing page promises daily credit resets the backend does not do. **Fixed** in the clean package — `web/` now says "50 credits/month" everywhere, matching the backend.

Also found while checking this: `web/WILSIFY.md` is referenced by three files under `docs/` (including a whole audit report describing edits made to it) but **does not exist** in this ZIP. Either it was deleted after that audit ran and the references were never cleaned up, or it didn't make it into this export. I didn't fabricate a replacement — flagging it for you to check against your own source control.

---

## 3. Self-Correction (transparency, not spin)

While rewriting `docs/deployment/DEPLOYMENT.md`'s Docker-free prerequisites, I initially wrote "Python 3.11" with a fabricated justification ("tensorflow/basic-pitch has no 3.12 wheels yet"). That was wrong and unverified. Cross-checking against `README.md`, `docs/deployment/MAC_DEPLOYMENT_GUIDE.md`, and `docs/architecture/AI_SERVICE.md` — all three independently say **Python 3.12** — I corrected both files back to 3.12+. Flagging this myself because a "brutally honest" audit should hold its own output to the same bar it holds yours to.

---

## 4. How To Produce a Clean Submission ZIP Yourself (going forward)

You don't need to re-export from your zip tool each time. Once you have a real `git` repo with the new `.gitignore` committed:

```bash
# Option A — archive directly from git, .git folder never included
git archive --format=zip --output=wilsify-ai-submission.zip HEAD

# Option B — if you're not ready to commit yet, exclude manually
zip -r wilsify-ai-submission.zip . \
  -x ".git/*" -x "*/node_modules/*" -x "*/.next/*" \
  -x "*/__pycache__/*" -x "*/.venv/*" -x "*/dist/*"
```
`git archive` is the correct long-term habit — it's impossible to accidentally include `.git` or anything already covered by `.gitignore`.

---

## 5. Code Quality — Sampled Findings

I read representative files end-to-end from every module (bootstrap/app files, auth routes + service, CORS/rate-limit/JWT/multipart plugins, AI service entrypoint + audio pipeline, Prisma schema, `plans.ts`) rather than skimming file names. This is a sampling-based deep read, not a literal line-by-line pass over all 505 files — flagging that honestly rather than implying more coverage than actually happened. If you want a specific file audited line-by-line, name it and I'll do that next.

### Strengths worth stating plainly (severity: N/A — these are good)
- **`backend/src/app.ts`** — centralized error handler distinguishes `AppError` (4xx, not sent to Sentry) from unexpected 5xx (logged + sent to Sentry) from Zod validation errors from rate-limit errors, all normalized to one response shape. This is the kind of error-handling discipline a lot of production codebases skip.
- **`backend/src/routes/auth/index.ts`** — `forgot-password` returns the identical response whether or not the email exists, correctly preventing account enumeration. Refresh token is `httpOnly`, `sameSite: strict`, scoped to `/api/v1/auth/refresh` only. Every auth-adjacent route has its own tighter rate limit (5/15min on register, 10/15min on login) layered on top of the 200/min global limit.
- **`ai-service/services/audio.py`** — streams downloads in 64KB chunks and aborts early if the file exceeds `MAX_AUDIO_SIZE_BYTES`, instead of buffering the whole file into memory first. YouTube downloads are restricted to an explicit host allowlist (`_YOUTUBE_HOSTS`), not arbitrary URLs.
- **Rate limiting fails open, deliberately, with a comment explaining why** (`rateLimit.ts`) — a Redis outage degrades to "no rate limiting" instead of "API down." That's a considered production trade-off, not an oversight.
- No hardcoded secrets found in the sampled backend/AI-service/web-app/mobile-app source (`grep` scan for key-shaped strings and common patterns came back clean — only false positives from font-family strings like `"SpaceGrotesk-Bold"`).

### Issues found, with severity

**[Medium] `backend/src/plugins/rateLimit.ts` — rate-limit key trusts `x-forwarded-for` directly**
```ts
keyGenerator: (req) =>
  (req.headers["x-forwarded-for"] as string | undefined) ?? req.ip,
```
`X-Forwarded-For` is a client-settable header. If Railway's edge doesn't strip/overwrite it before your app sees it (confirm this — Railway's proxy behavior isn't something I can verify from the ZIP alone), a client could set an arbitrary value here and get a fresh rate-limit bucket on every request, defeating the per-IP limit entirely.
*Fix:* Fastify already has `trustProxy: true` set in `app.ts`, which makes `req.ip` resolve correctly *if* you're behind a proxy that only forwards a trusted chain. Use `req.ip` alone and drop the manual header read:
```ts
keyGenerator: (req) => req.ip,
```
*Why:* `req.ip` goes through Fastify's own trusted-proxy resolution instead of trusting the raw header verbatim in application code.

**[Low] `docs/development/TODO.md` / `web/WILSIFY.md`** — dangling doc reference to a file not present in this export (see §2). Not a code bug, but will confuse the next person (or examiner) who tries to open that link.

**[Low] `backend/src/plugins/multipart.ts` — no explicit MIME-type allowlist at the plugin level**
```ts
await fastify.register(fastifyMultipart, {
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fieldSize: 1024 },
});
```
Size and file-count are capped, which is good, but nothing here rejects non-audio MIME types before the file reaches your upload route handler. If the actual MIME check happens later in `routes/uploads/index.ts` (I did not read that specific handler in this pass), this may be a non-issue — worth a 2-minute check to confirm the validation exists somewhere in the request path, not just relying on the AI service's `_AUDIO_EXTENSIONS` allowlist downstream.

**[Info, not a defect] Sentry initialization uses `await import(pkg)` with a variable built from a string literal** (`app.ts`, `main.py` equivalent) — this is a deliberate optional-dependency pattern (Sentry only loads if `SENTRY_DSN` is set and the package is installed), correctly wrapped in `try/catch`. Flagging only because dynamic `import()` of a computed specifier can look like a red flag out of context; here it isn't one — no user input reaches that string.

---

## 6. Documentation Files Rewritten in This Pass

| File | What changed |
|---|---|
| `.gitignore` (new) | Created — full monorepo coverage |
| `README.md` | Removed Docker from Quick Start; now points to `./setup.sh` + natively-running Postgres/Redis; corrected folder tree |
| `docs/deployment/DEPLOYMENT.md` | Removed Docker Compose local-infra step and self-host Docker example; corrected the false "deployed using `backend/Dockerfile`" claim to the real Nixpacks/`railway.json` path |
| `docs/deployment/MAC_DEPLOYMENT_GUIDE.md` | Rewrote §1.4, §1.6, §1.7, §1.11, §4.1, Part 5, Part 6, and 2 troubleshooting rows — Docker Desktop install replaced with native Homebrew Postgres/Redis; the one-command Docker alternative replaced with `./setup.sh` |
| `docs/deployment/ENVIRONMENT.md` | "Docker Compose" section retitled and reworded — same variables, no longer implies Docker |
| `docs/deployment/BACKUP_STRATEGY.md` | Redis AOF instructions no longer reference a nonexistent `docker-compose.yml` |
| `docs/architecture/AI_SERVICE.md` | "Docker Setup" section replaced with the real Nixpacks/venv runtime setup |
| `docs/architecture/DATABASE.md` | One inline comment corrected (Dockerfile `CMD` → `railway.json` `deploy.startCommand`) |
| `docs/development/TODO.md` | Credit-mismatch item marked resolved, with a note about the missing `WILSIFY.md` |
| `web/index.html`, `web/script.js` | Credit system copy corrected from "50/day" to "50/month" to match `backend/src/config/plans.ts` |

**Left untouched, deliberately:** `docs/development/PROJECT_PLAN.md`, `VERSIONS.md`, `CHANGELOG.md`, everything under `docs/releases/`, everything under `docs/archive/`, and `docs/blueprint.md`'s planned-vs-shipped comparison table. These are dated historical/planning records. Editing them to remove "Docker" would make them factually inaccurate about what was true *at the time they were written* — a changelog that's been quietly retconned is worse than one that shows the project's real history, including decisions later reversed.

---

## 7. Final Verdict

**Needs Minor Fixes** — not "Submission Ready" only because of two things entirely within your control before you submit:
1. Confirm what happened to `web/WILSIFY.md` (§2) — either it should exist and doesn't, or the doc references to it should be removed.
2. Decide whether to act on the rate-limit key finding (§5) — low effort, one-line fix, worth doing before this goes in front of a company.

Everything else — architecture, error handling, auth security posture, the AI pipeline's defensive coding, the CI/CD setup, the Prisma schema — reads like a real production codebase, not a student demo. That's genuinely uncommon for a final-year project and is worth stating plainly rather than hedging.
