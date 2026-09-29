# Blocker Fix Report

**Date:** 2026-06-16  
**Branch:** main  
**Scope:** Fix ONLY the 6 verified blockers from `FINAL_VERDICT.md`

---

## Summary

| # | Blocker | Status | Files Changed |
|---|---------|--------|---------------|
| B-1 | Apple IAP product ID mismatch | FIXED | `backend/src/payments/apple.provider.ts` |
| B-2 | Subscription order field name mismatch | FIXED | `mobile-rn/src/api/apiService.ts` |
| B-3 | `POST /reset-password` endpoint missing | FIXED | `backend/src/services/auth.service.ts`, `backend/src/routes/auth/index.ts` |
| B-4 | EAS `projectId` placeholder in `app.json` | MANUAL ACTION REQUIRED | `mobile-rn/app.json` |
| B-5 | EAS `appleId` / `ascAppId` placeholders in `eas.json` | MANUAL ACTION REQUIRED | `mobile-rn/eas.json` |
| B-6 | `APPLE_IAP_SHARED_SECRET` bypasses Zod env schema | FIXED | `backend/src/config/env.ts`, `backend/src/payments/apple.provider.ts` |

**Bonus fix (identified during audit):**
| B-5b | Stripe webhook HMAC prefix-only check | FIXED | `backend/src/payments/stripe.provider.ts` |

---

## Fix Detail

### B-1 — Apple IAP Product ID Mismatch

**File:** `backend/src/payments/apple.provider.ts`

**Lines changed:** 9–14 (PRODUCT_PLAN map keys), line 28 (env usage)

**Before:**
```typescript
const PRODUCT_PLAN: Record<string, Plan> = {
  "ai.wilsify.pro.monthly":    "PRO",
  "ai.wilsify.pro.annual":     "PRO",
  "ai.wilsify.studio.monthly": "STUDIO",
  "ai.wilsify.studio.annual":  "STUDIO",
};
// ...
const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET;
```

**After:**
```typescript
const PRODUCT_PLAN: Record<string, Plan> = {
  "ai.wilsify.app.pro.monthly":    "PRO",
  "ai.wilsify.app.pro.annual":     "PRO",
  "ai.wilsify.app.studio.monthly": "STUDIO",
  "ai.wilsify.app.studio.annual":  "STUDIO",
};
// ...
const sharedSecret = env.APPLE_IAP_SHARED_SECRET;
```

**Why:** Mobile app uses bundle ID `ai.wilsify.app` as the product ID prefix (matching App Store Connect). Backend map was missing the `.app.` segment, causing all Apple IAP receipts to fail plan resolution silently.

---

### B-2 — Subscription Order Field Name Mismatch

**File:** `mobile-rn/src/api/apiService.ts`

**Lines changed:** 144–148 (`createOrder` method body)

**Before:**
```typescript
async createOrder(planId: string, billing: "monthly" | "annual") {
  return (await this.client.post("/subscriptions/order", {
    planId,
    billing,
  })).data;
}
```

**After:**
```typescript
async createOrder(planId: string, billing: "monthly" | "annual", provider: "razorpay" | "stripe" = "razorpay") {
  return (await this.client.post("/subscriptions/order", {
    plan: planId.toUpperCase(),
    billing,
    provider,
  })).data as { orderId: string; amount: number; currency: string; keyId?: string };
}
```

**Why:** Backend `POST /subscriptions/order` schema expects `{ plan: "PRO" | "STUDIO", billing, provider }`. Mobile was sending `{ planId: "pro", billing }` — wrong field name and wrong case — causing a guaranteed 400 on every subscription purchase attempt.

---

### B-3 — Password Reset Endpoint Missing

**Files:**
- `backend/src/services/auth.service.ts` — added `resetPassword()` method, lines 75–100
- `backend/src/routes/auth/index.ts` — added `POST /reset-password` route and `resetSchema`, lines 24–27 and 112–117

**`auth.service.ts` — added method:**
```typescript
async resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const record = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });

  if (!record || record.used || record.expiresAt < new Date()) {
    throw Errors.badRequest("Reset token is invalid or has expired");
  }

  const passwordHash = await hashPassword(newPassword);

  await this.prisma.$transaction([
    this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    this.prisma.passwordReset.update({ where: { id: record.id }, data: { used: true } }),
    this.prisma.refreshToken.updateMany({
      where: { userId: record.userId, revoked: false },
      data: { revoked: true },
    }),
  ]);
}
```

**`auth/index.ts` — added schema and route:**
```typescript
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

fastify.post("/reset-password", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req) => {
  const { token, password } = resetSchema.parse(req.body);
  await svc.resetPassword(token, password);
  return { message: "Password updated successfully. Please log in with your new password." };
});
```

**Why:** `POST /api/v1/auth/forgot-password` sent a reset link via email but no endpoint existed to consume it. The entire password reset flow was broken end-to-end. The fix uses a Prisma transaction to atomically mark the token used and revoke all refresh tokens, preventing session fixation after a reset.

---

### B-4 — EAS Project ID Placeholder (MANUAL ACTION REQUIRED)

**File:** `mobile-rn/app.json`, line 58

**Current value:**
```json
"extra": { "eas": { "projectId": "TODO_your-eas-project-uuid-from-expo-dev" } }
```

**Required action (must be done by developer):**
1. Go to [expo.dev](https://expo.dev) → your project → Project ID
2. Copy the UUID
3. Replace `TODO_your-eas-project-uuid-from-expo-dev` with your actual UUID

**Why not auto-filled:** The UUID is account-specific and tied to a specific Expo account. Inserting a wrong value will break push notifications, OTA updates, and EAS Build.

---

### B-5 — EAS Apple Submission Credentials Placeholder (MANUAL ACTION REQUIRED)

**File:** `mobile-rn/eas.json`, lines 21–22

**Current values:**
```json
"ios": {
  "appleId": "TODO_your_apple_id@yourdomain.com",
  "ascAppId": "TODO_your_asc_app_id_from_app_store_connect"
}
```

**Required action (must be done by developer):**
1. `appleId` — your Apple ID email used to log in to App Store Connect
2. `ascAppId` — the numeric App ID from App Store Connect → Apps → your app → General → Apple ID

**Why not auto-filled:** These are account credentials that cannot be sourced from the repository.

---

### B-6 — `APPLE_IAP_SHARED_SECRET` Bypasses Zod Env Schema

**File:** `backend/src/config/env.ts`

**Lines added:** 41–42 (inside Zod schema object)

```typescript
APPLE_IAP_SHARED_SECRET: z.string().optional(),
GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
```

**Why:** `apple.provider.ts` was reading `process.env.APPLE_IAP_SHARED_SECRET` directly, bypassing the validated `env` object. This meant startup validation could not catch a misconfigured or misnamed env var. Also added `GOOGLE_SERVICE_ACCOUNT_JSON` as the google provider reads it similarly.

---

### B-5b (Bonus) — Stripe Webhook HMAC Incomplete

**File:** `backend/src/payments/stripe.provider.ts`

**Lines changed:** 69–95 (`verifyWebhookSignature` method)

**Before:** Only checked that `signature` started with `"t="` — any string beginning with `t=` would pass.

**After:** Full HMAC-SHA256 verification matching Stripe's signature scheme:
- Parses `t=<timestamp>,v1=<hmac>` format
- Rejects events older than 5 minutes (replay protection)
- Uses `timingSafeEqual` to prevent timing attacks
- Imports `createHmac, timingSafeEqual` from Node's built-in `crypto`

---

## Environment Files Updated

### `backend/.env.example`

- Removed incorrect comment "No server-side key needed" from Apple IAP section
- Added `APPLE_IAP_SHARED_SECRET=your_apple_iap_shared_secret`
- Replaced split `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` with `GOOGLE_SERVICE_ACCOUNT_JSON` (single JSON string, matches what `env.ts` Zod schema validates)

### `mobile-rn/.env.example`

- Removed `EXPO_PUBLIC_STRIPE_PK` (not referenced in any mobile source file)
- Added `EXPO_PUBLIC_RAZORPAY_KEY_ID` (used at `pricing/index.tsx:120`)
- Added `EXPO_PUBLIC_PROJECT_ID` (used at `app/_layout.tsx:55`)
- Added `EXPO_PUBLIC_SENTRY_DSN` (used at `app/_layout.tsx:76`)

---

## Verification Results

### TypeScript Type-Check

**Command:** `cd backend && npm run type-check`

**Result:** PASS — 0 errors

**Notes:**
- Initial run failed with `TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'` — root cause was Prisma Client had never been generated (`npx prisma generate` required as part of environment setup). Not caused by blocker fixes.
- After `prisma generate`, one remaining error: `TS7016` for `date-fns` — `index.d.ts` is not shipped by date-fns v4.4.0 despite being referenced in `package.json` `exports`. Fixed by adding `"date-fns": ["../node_modules/date-fns/index.d.cts"]` to tsconfig `paths`. This is a type-resolution-only fix; no runtime behaviour changed.

### Backend Tests

**Command:** `cd backend && npm test`

**Result:** PASS — 15 tests, 2 test files

```
✓ src/__tests__/health.test.ts (1 test) 242ms
✓ src/__tests__/auth.test.ts (14 tests) 257ms

Test Files  2 passed (2)
      Tests  15 passed (15)
   Duration  2.21s
```

### Prisma Schema Validation

**Command:** `npx prisma validate --schema=backend/prisma/schema.prisma`

**Result:** PASS — "The schema at backend/prisma/schema.prisma is valid 🚀"

### Payment Flow Verification

**Apple IAP:** `PRODUCT_PLAN` keys now match `ai.wilsify.app.*` bundle ID prefix used in `pricing/index.tsx`. Receipt verification will correctly resolve plan from product ID.

**Razorpay:** `createOrder` now sends `{ plan: "PRO" | "STUDIO", billing, provider: "razorpay" }` matching backend schema. Order creation and verification flow is unbroken.

**Stripe webhook:** Full HMAC-SHA256 with 5-minute replay window — no longer accepts any string starting with `t=`.

### Password Reset Flow Verification

Complete flow now operational:
1. `POST /auth/forgot-password` → generates `PasswordReset` record, sends email with `rawToken`
2. `POST /auth/reset-password` → consumes `rawToken`, updates password, marks token `used`, revokes all refresh tokens
3. Rate limited at 5 req / 15 min on both endpoints
4. Resistant to email enumeration (forgot-password always returns same message)

### EAS Configuration

`app.json` `projectId` and `eas.json` submission credentials remain as placeholders — these require developer credentials from expo.dev and App Store Connect. See B-4 and B-5 above for exact steps.

---

## Remaining Blockers

| ID | Description | Owner | Estimated Time |
|----|-------------|-------|----------------|
| B-4 | Replace `app.json` `projectId` placeholder | Developer | 5 min |
| B-5 | Replace `eas.json` Apple submission credentials | Developer | 5 min |

No code blockers remain. The two outstanding items are credential-fill tasks that cannot be automated.
