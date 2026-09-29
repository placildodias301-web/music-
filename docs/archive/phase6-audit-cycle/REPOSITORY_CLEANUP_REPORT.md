# Wilsify AI — Repository Cleanup Report
**Date:** 2026-06-16  
**Note:** This report lists files and directories to act on. Nothing below is deleted automatically.

---

## Files to KEEP

| Path | Reason |
|------|--------|
| `backend/src/**` | All active backend source |
| `backend/prisma/schema.prisma` | Database schema |
| `backend/prisma/migrations/` | Migration history — never delete |
| `backend/prisma/seed.ts` | Dev seeding |
| `backend/scripts/validate-production-env.ts` | Pre-deploy validation — critical |
| `backend/.env.example` | Deployment reference |
| `backend/tsconfig.json` | TypeScript config |
| `backend/vitest.config.ts` | Test runner config |
| `backend/package.json` | Workspace manifest |
| `backend/railway.json` | Railway deployment config |
| `mobile-rn/app/**` | All app screens |
| `mobile-rn/src/**` | All mobile source |
| `mobile-rn/components/**` | All UI components |
| `mobile-rn/assets/images/**` | App icons and splash |
| `mobile-rn/app.json` | Expo config (after fixing TODO) |
| `mobile-rn/eas.json` | EAS build config (after fixing TODOs) |
| `mobile-rn/package.json` | Mobile workspace manifest |
| `mobile-rn/.env.example` | Mobile env reference (after cleanup) |
| `ai-service/**` | All Python service source |
| `ai-service/requirements.txt` | Python dependencies |
| `ai-service/nixpacks.toml` | Railway build config |
| `ai-service/railway.json` | Railway deployment config |
| `shared/types/index.ts` | Shared type definitions (after credit fix) |
| `docs/**` | All documentation (after reorganisation) |
| `.github/workflows/**` | CI/CD pipelines |
| `.gitignore` | Root gitignore |
| `.gitattributes` | Line-ending control |
| `backend/.gitignore` | Backend gitignore |
| `mobile-rn/.gitignore` | Mobile gitignore |
| `package.json` | Root workspace manifest |
| `package-lock.json` | Monorepo lockfile |
| `README.md` | Project readme |
| `LICENSE` | Open source license |

---

## Files to DELETE from git index

> Run these commands to untrack generated/unnecessary files without deleting them from disk where indicated.

### backend/coverage/ — generated test coverage reports

```bash
git rm --cached -r backend/coverage/
echo "coverage/" >> backend/.gitignore   # already present, verify
```

Impact: Removes ~40 HTML/CSS/JS/JSON/PNG generated files from git history going forward. No source code is affected. Run `npm run test:coverage` to regenerate locally.

---

## Directories to DELETE from disk

| Path | Reason | Impact |
|------|--------|--------|
| `mobile-flutter/` | Empty placeholder directory, no tracked files, project uses React Native | None — not tracked |

```bash
# Only after confirming no in-progress Flutter work:
rm -rf mobile-flutter/
```

---

## Files to FIX before treating as KEEP

| Path | Fix Required |
|------|-------------|
| `mobile-rn/app.json` | Replace TODO projectId with real EAS project UUID |
| `mobile-rn/eas.json` | Replace TODO Apple ID and ASC App ID |
| `mobile-rn/.env.example` | Remove `EXPO_PUBLIC_STRIPE_PK`, add `EXPO_PUBLIC_RAZORPAY_KEY_ID`, `EXPO_PUBLIC_PROJECT_ID`, `EXPO_PUBLIC_SENTRY_DSN` |
| `backend/.env.example` | Add `APPLE_IAP_SHARED_SECRET`, standardise Google service account variable |
| `backend/src/config/env.ts` | Add `APPLE_IAP_SHARED_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON` |
| `shared/types/index.ts` | Align `PLAN_CREDITS` values with `backend/src/config/plans.ts` |

---

## Code to DELETE (dead code)

| Location | Dead Code | Reason |
|----------|-----------|--------|
| `backend/src/services/email.service.ts:40-54` | `sendAnalysisComplete` method | Never called — analysis completion uses push notifications |
| `mobile-rn/config/api.ts:3` | `AI_URL` constant | Mobile never calls AI service directly |
| `mobile-rn/.env.example` | `EXPO_PUBLIC_AI_URL`, `EXPO_PUBLIC_STRIPE_PK` | Unused in mobile |
