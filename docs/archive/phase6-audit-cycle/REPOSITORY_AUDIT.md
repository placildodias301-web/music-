# Wilsify AI — Repository Audit
**Date:** 2026-06-16  
**Auditor:** Principal Architect / Senior Engineering Review  
**Scope:** Full pre-launch repository inspection — evidence-based findings only

---

## PART 1 — CODE AUDIT

### CRITICAL (launch-blocking)

---

**C-1: Apple IAP product ID mismatch — purchase verification will always fail**

- Severity: **Critical**
- File: [mobile-rn/app/pricing/index.tsx](../mobile-rn/app/pricing/index.tsx#L47) vs [backend/src/payments/apple.provider.ts](../backend/src/payments/apple.provider.ts#L9)
- Evidence:
  - Mobile sends: `"ai.wilsify.app.pro.monthly"`, `"ai.wilsify.app.pro.annual"`, `"ai.wilsify.app.studio.monthly"`, `"ai.wilsify.app.studio.annual"`
  - Backend verifies against: `"ai.wilsify.pro.monthly"`, `"ai.wilsify.pro.annual"`, `"ai.wilsify.studio.monthly"`, `"ai.wilsify.studio.annual"`
  - `PRODUCT_PLAN[latest.product_id]` will always be `undefined` → `verifyPurchase` returns `{ success: false }`
- Recommended action: **FIX** — align product IDs. Backend map must match App Store Connect product identifiers exactly.

---

**C-2: Subscription order API field name mismatch — every order creation will 400**

- Severity: **Critical**
- File: [mobile-rn/src/api/apiService.ts](../mobile-rn/src/api/apiService.ts#L143) vs [backend/src/routes/subscriptions/index.ts](../backend/src/routes/subscriptions/index.ts#L28)
- Evidence:
  - Mobile sends: `{ planId, billing, provider }` where `planId` is lowercase (`"pro"`, `"studio"`)
  - Backend Zod schema: `z.enum(["PRO", "STUDIO", "ENTERPRISE"])` bound to field `plan` (not `planId`)
  - Result: Zod throws a 400 validation error on every call to `POST /api/v1/subscriptions/order`
- Recommended action: **FIX** — change `apiService.createOrder` to send `{ plan: planId.toUpperCase(), billing, provider }`

---

**C-3: Missing password reset endpoint — forgot-password flow is broken end-to-end**

- Severity: **Critical**
- File: [backend/src/routes/auth/index.ts](../backend/src/routes/auth/index.ts#L99)
- Evidence:
  - `forgot-password` handler generates URL: `https://wilsify.ai/reset-password?token=${result.rawToken}`
  - No `POST /api/v1/auth/reset-password` route exists in the backend
  - No handler exists in the web landing page (`web/index.html`) for consuming the token
  - The `PasswordReset` model exists in Prisma schema and tokens are created — but there is no route to consume them
- Recommended action: **FIX** — add `POST /api/v1/auth/reset-password` route that validates token and sets new password

---

**C-4: EAS `app.json` has TODO placeholder for projectId — EAS builds will fail**

- Severity: **Critical**
- File: [mobile-rn/app.json](../mobile-rn/app.json#L58)
- Evidence:
  - Line 58: `"projectId": "TODO_your-eas-project-uuid-from-expo-dev"`
  - EAS build and push notification delivery both require a valid project UUID from expo.dev
- Recommended action: **FIX** — replace with actual EAS project UUID from expo.dev dashboard

---

**C-5: `eas.json` has TODO placeholders — submission to App Store will fail**

- Severity: **Critical**
- File: [mobile-rn/eas.json](../mobile-rn/eas.json#L20)
- Evidence:
  - Line 21: `"appleId": "TODO_your_apple_id@yourdomain.com"`
  - Line 22: `"ascAppId": "TODO_your_asc_app_id_from_app_store_connect"`
- Recommended action: **FIX** — set real Apple ID and App Store Connect App ID

---

**C-6: Stripe webhook signature verification is incomplete**

- Severity: **Critical**
- File: [backend/src/payments/stripe.provider.ts](../backend/src/payments/stripe.provider.ts#L68)
- Evidence:
  - `verifyWebhookSignature` only checks `signature.startsWith("t=")` — this is not cryptographic verification
  - Stripe requires `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` for real verification
  - Any request with a header starting with `t=` will be accepted as a valid Stripe event
- Recommended action: **FIX** — implement proper HMAC verification using `stripe.webhooks.constructEvent`

---

### HIGH (must fix before beta)

---

**H-1: Google provider reads wrong environment variable — Google Play verification always fails**

- Severity: **High**
- File: [backend/src/payments/google.provider.ts](../backend/src/payments/google.provider.ts#L24)
- Evidence:
  - Code reads: `process.env.GOOGLE_SERVICE_ACCOUNT_JSON` (a full JSON blob)
  - `.env.example` documents: `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (separate fields)
  - `env.ts` Zod schema has neither variable
  - Result: `serviceAccountKey` is always `undefined` → `verifyPurchase` returns `{ success: false }`
- Recommended action: **FIX** — either add `GOOGLE_SERVICE_ACCOUNT_JSON` to `env.ts` schema, or rewrite `google.provider.ts` to use the two separate env fields

---

**H-2: Apple webhook has no signature verification**

- Severity: **High**
- File: [backend/src/payments/apple.provider.ts](../backend/src/payments/apple.provider.ts#L66)
- Evidence:
  - `verifyWebhookSignature` always returns `true`
  - Apple App Store Server Notifications v2 use JWS (signed JWT) — verification requires Apple's root CA
  - Current implementation accepts any POST to `/webhooks/apple` as legitimate
- Recommended action: **FIX** — implement JWS verification using Apple's root certificate, or document this as an accepted risk for beta with a tracking note

---

**H-3: Google webhook has no signature verification**

- Severity: **High**
- File: [backend/src/payments/google.provider.ts](../backend/src/payments/google.provider.ts#L60)
- Evidence:
  - `verifyWebhookSignature` always returns `true`
  - Google RTDN via Pub/Sub does include a message signature
- Recommended action: **FIX for public launch** — acceptable for closed beta with IP allowlisting as mitigation

---

**H-4: `APPLE_IAP_SHARED_SECRET` not in Zod schema — will be undefined in production**

- Severity: **High**
- File: [backend/src/payments/apple.provider.ts](../backend/src/payments/apple.provider.ts#L27) vs [backend/src/config/env.ts](../backend/src/config/env.ts)
- Evidence:
  - `apple.provider.ts:27`: `const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET`
  - `env.ts` Zod schema does not include `APPLE_IAP_SHARED_SECRET`
  - `.env.example` does not document it
  - Auto-renewable subscription receipt verification without the shared secret fails for production receipts
- Recommended action: **FIX** — add `APPLE_IAP_SHARED_SECRET` to `env.ts` schema and `.env.example`

---

**H-5: `backend/coverage/` directory committed — generated files in repo**

- Severity: **High**
- Evidence:
  - `backend/coverage/` contains ~40 HTML, CSS, JS, PNG, and JSON files generated by `vitest --coverage`
  - `backend/.gitignore` correctly lists `coverage/` but these were committed before `.gitignore` was applied
  - Inflates repo size and pollutes git history
- Recommended action: **DELETE** from git index: `git rm --cached -r backend/coverage/`

---

**H-6: `shared/types/index.ts` PLAN_CREDITS inconsistent with backend**

- Severity: **High**
- File: [shared/types/index.ts](../shared/types/index.ts#L156) vs [backend/src/config/plans.ts](../backend/src/config/plans.ts#L4)
- Evidence:
  - `shared/types`: `FREE=5, PRO=50, STUDIO=-1`
  - `backend/config/plans.ts`: `FREE=50, PRO=2500, STUDIO=5000`
  - Backend uses its own values for credit grants. `shared/types` is imported by neither the backend nor the mobile (no source imports from `@wilsify/shared` found in mobile-rn src)
  - Risk: any future developer using `shared/types` will get wrong credit values
- Recommended action: **FIX** — update `shared/types/index.ts` to match backend values, or delete `PLAN_CREDITS` from shared types

---

### MEDIUM

---

**M-1: Hardcoded streak badge value — placeholder in production UI**

- Severity: **Medium**
- File: [mobile-rn/app/(tabs)/index.tsx](../mobile-rn/app/(tabs)/index.tsx#L71)
- Evidence: `<StreakBadge count={12} />` — hardcoded, not from API or store
- Recommended action: **FIX** — wire to stats API or remove until streak feature is implemented

---

**M-2: `emailService.sendAnalysisComplete` is dead code**

- Severity: **Medium**
- File: [backend/src/services/email.service.ts](../backend/src/services/email.service.ts#L40)
- Evidence:
  - Method defined at line 40
  - The analysis worker (`analysis.worker.ts`) sends push notifications and in-app notifications, but does NOT call `emailService.sendAnalysisComplete`
  - No other file calls this method
- Recommended action: **FIX** — either call it from the analysis worker, or delete it

---

**M-3: `RAZORPAY_WEBHOOK_SECRET` documented but not in Zod schema**

- Severity: **Medium**
- File: [backend/.env.example](../backend/.env.example#L43) vs [backend/src/config/env.ts](../backend/src/config/env.ts)
- Evidence:
  - `.env.example` documents `RAZORPAY_WEBHOOK_SECRET`
  - `validate-production-env.ts:181` checks for it
  - `env.ts` Zod schema only has `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
  - `razorpay.provider.ts:90` correctly uses `env.RAZORPAY_KEY_SECRET` for HMAC (no separate webhook secret needed for Razorpay)
  - The `.env.example` and validate script are misleading
- Recommended action: **FIX** — remove `RAZORPAY_WEBHOOK_SECRET` from `.env.example` and `validate-production-env.ts`

---

**M-4: `EXPO_PUBLIC_STRIPE_PK` in mobile env but unused**

- Severity: **Medium**
- File: [mobile-rn/.env.example](../mobile-rn/.env.example)
- Evidence:
  - Mobile uses Razorpay on Android, Apple IAP on iOS
  - No Stripe SDK is imported in the mobile codebase
  - `EXPO_PUBLIC_STRIPE_PK` is a misleading and unnecessary variable
- Recommended action: **FIX** — remove from `.env.example`

---

**M-5: `zod-to-json-schema` in backend package.json — usage not found in source**

- Severity: **Medium**
- File: [backend/package.json](../backend/package.json#L43)
- Evidence: Grep of `backend/src/**/*.ts` for `zod-to-json-schema` returns no results. Package is installed but not imported.
- Recommended action: **FIX** — remove from `dependencies` if not needed

---

**M-6: `mobile-flutter/` directory exists but contains no tracked files**

- Severity: **Medium**
- Evidence: Directory exists on disk but no files are tracked. Project uses React Native exclusively.
- Recommended action: **DELETE** the directory if no Flutter work is planned

---

### LOW

---

**L-1: Auth `isVerified: true` hardcoded — intentional but undocumented**

- Severity: **Low**
- File: [backend/src/services/auth.service.ts](../backend/src/services/auth.service.ts#L27)
- Evidence: `isVerified: true` set at registration. Email verification is skipped by design for beta.
- Recommended action: **KEEP** — intentional for beta, but add a TODO comment for post-beta email verification flow

---

**L-2: `EXPO_PUBLIC_AI_URL` defined but mobile never calls AI service directly**

- Severity: **Low**
- File: [mobile-rn/config/api.ts](../mobile-rn/config/api.ts)
- Evidence: `AI_URL` defined in `API_CONFIG` but `apiService.ts` never uses `API_CONFIG.AI_URL` — all requests go through the backend
- Recommended action: **DELETE** `AI_URL` from `API_CONFIG` and `.env.example`

---

**L-3: Google Play billing flow not wired in mobile pricing screen (Android uses Razorpay)**

- Severity: **Low** (by design)
- File: [mobile-rn/app/pricing/index.tsx](../mobile-rn/app/pricing/index.tsx#L115)
- Evidence: Android path uses Razorpay. `apiService.verifyGooglePlay` exists but is not called from any screen. Backend Google provider is present but not exercised via any mobile flow.
- Recommended action: **KEEP** — document that Google Play Billing is deferred. Android goes through Razorpay.

---

**L-4: `onSeeAll` handler in home screen is empty**

- Severity: **Low**
- File: [mobile-rn/app/(tabs)/index.tsx](../mobile-rn/app/(tabs)/index.tsx#L103)
- Evidence: `<SectionHeader title="Recent songs" onSeeAll={() => {}} />` — empty function
- Recommended action: **KEEP** — acceptable for beta, no navigation target for "see all" yet

---

## PART 2 — GENERATED / COMMITTED FILES

| Path | Issue | Action |
|------|-------|--------|
| `backend/coverage/` | ~40 generated HTML/CSS/JS/JSON/PNG files from vitest coverage run | DELETE from index |
| `mobile-flutter/` | Empty placeholder directory, no tracked files | DELETE directory |

---

## PART 3 — ENVIRONMENT VARIABLE GAPS

| Variable | Expected By | In env.ts Schema | In .env.example | Status |
|----------|-------------|------------------|-----------------|--------|
| `APPLE_IAP_SHARED_SECRET` | `apple.provider.ts:27` | NO | NO | **Missing — add to both** |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `google.provider.ts:24` | NO | NO (has separate fields instead) | **Mismatch — standardize** |
| `RAZORPAY_WEBHOOK_SECRET` | `.env.example`, validate script | NO | YES | **Remove from example/validate** |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | `pricing/index.tsx:123` | N/A (mobile) | Not in mobile .env.example | **Add to mobile .env.example** |
| `EXPO_PUBLIC_PROJECT_ID` | `_layout.tsx:54` | N/A (mobile) | Not in mobile .env.example | **Add to mobile .env.example** |
| `EXPO_PUBLIC_SENTRY_DSN` | `_layout.tsx:76` | N/A (mobile) | Not in mobile .env.example | **Add to mobile .env.example** |

---

## SUMMARY TABLE

| ID | Severity | Area | Issue | Action |
|----|----------|------|-------|--------|
| C-1 | Critical | iOS Payments | Apple IAP product ID mismatch | FIX |
| C-2 | Critical | Payments | Order API field `planId` vs `plan` | FIX |
| C-3 | Critical | Auth | Missing reset-password endpoint | FIX |
| C-4 | Critical | Build | EAS projectId is TODO placeholder | FIX |
| C-5 | Critical | Build | eas.json Apple IDs are TODO | FIX |
| C-6 | Critical | Security | Stripe webhook HMAC not verified | FIX |
| H-1 | High | Google Play | Wrong env var → always fails | FIX |
| H-2 | High | Security | Apple webhook no verification | FIX |
| H-3 | High | Security | Google webhook no verification | FIX (post-beta ok) |
| H-4 | High | iOS Payments | `APPLE_IAP_SHARED_SECRET` not in schema | FIX |
| H-5 | High | Repo | `backend/coverage/` committed | DELETE |
| H-6 | High | Shared | `PLAN_CREDITS` inconsistent in shared types | FIX |
| M-1 | Medium | Mobile UI | Hardcoded streak badge | FIX |
| M-2 | Medium | Backend | `sendAnalysisComplete` dead code | FIX |
| M-3 | Medium | Config | `RAZORPAY_WEBHOOK_SECRET` misleading | FIX |
| M-4 | Medium | Config | Unused `EXPO_PUBLIC_STRIPE_PK` | FIX |
| M-5 | Medium | Backend | `zod-to-json-schema` unused | FIX |
| M-6 | Medium | Repo | Empty `mobile-flutter/` dir | DELETE |
| L-1 | Low | Auth | `isVerified: true` hardcoded | KEEP (document) |
| L-2 | Low | Config | `AI_URL` in mobile config but unused | DELETE |
| L-3 | Low | Android | Google Play not wired (Razorpay used) | KEEP (by design) |
| L-4 | Low | Mobile UI | Empty `onSeeAll` handler | KEEP |
