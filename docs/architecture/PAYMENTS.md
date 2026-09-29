# Wilsify AI — Payments

**Date**: June 2026  
**Phases**: 4 (Implementation) + 5 (Hardening) + 6 (Mobile SDK Integration)  
**Scope**: Razorpay, Stripe, Apple IAP, Google Play Billing

---

## Executive Summary

| Provider | Backend | Mobile | Webhooks | Idempotency | Status |
|----------|---------|--------|----------|-------------|--------|
| Razorpay | ✅ | ✅ SDK wired | ✅ + idempotency | ✅ | Live keys needed |
| Stripe | ✅ | API-ready | ✅ + idempotency | ✅ | Optional (international) |
| Apple IAP | ✅ | ✅ SDK wired | ✅ + idempotency | ✅ | IAP products needed |
| Google Play | ✅ | API-ready | ✅ + idempotency | ✅ | Products needed |

**Phase 6 change**: "Mark as Paid (Dev)" bypass completely removed. Real SDKs (`react-native-iap`, `react-native-razorpay`) wired into pricing screen.

---

## 1. Payment Provider Abstraction

Interface (`backend/src/payments/provider.ts`):

```typescript
interface PaymentProvider {
  createOrder(params): Promise<CreateOrderResult>
  verifyPurchase(params): Promise<VerifyResult>
  verifyWebhookSignature(rawBody, signature): boolean
  handleWebhook(payload): Promise<WebhookResult>
  cancelSubscription(providerId): Promise<void>
}
```

All four providers implement this interface. Providers are instantiated once at module level (not per-request).

---

## 2. Razorpay — Primary (India)

### Flow
```text
User taps "Subscribe" (Android)
  → POST /api/v1/subscriptions/orders { planId, billing, provider: "razorpay" }
  → Backend creates Razorpay order → returns { orderId, amount, currency }
  → RazorpayCheckout.open({ key, order_id, amount, currency })
  → Razorpay payment sheet appears
  → User completes payment
  → POST /api/v1/subscriptions/verify { orderId, paymentId, signature }
  → Backend HMAC-SHA256 verification
  → User.plan updated to PRO/STUDIO
```

### Mobile Integration (Phase 6)
```typescript
import RazorpayCheckout from "react-native-razorpay";

const order = await apiService.createOrder(plan.id, billing, "razorpay");
const data = await RazorpayCheckout.open({
  key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? "",
  order_id: order.orderId,
  amount: order.amount,
  currency: order.currency,
  name: "Wilsify AI",
  description: `${plan.name} ${billing} Plan`,
  theme: { color: "#7C5CFF" },
});
await apiService.verifyPayment(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature);
```

Payment cancellation (`e.code === "PAYMENT_CANCELLED"`) is silently swallowed — no error shown.

### Webhook Events
- `payment.captured` → activates subscription
- `subscription.cancelled` → calls `expireSubscription()`

### Required Configuration

| Variable | Location | Notes |
|----------|----------|-------|
| `RAZORPAY_KEY_ID` | Backend Railway env | Live: `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | Backend Railway env | |
| `RAZORPAY_WEBHOOK_SECRET` | Backend Railway env | From Razorpay dashboard |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | EAS production profile | Same as `RAZORPAY_KEY_ID` |

**Webhook URL**: `https://api.wilsify.ai/api/v1/subscriptions/webhooks/razorpay`

### Action Required
1. Activate Razorpay live account (KYC — 1–5 days)
2. Create subscription plans in Razorpay dashboard
3. Register webhook and enable events

---

## 3. Apple IAP — iOS

### Flow
```text
User taps "Subscribe" (iOS)
  → requestPurchase({ type: "subs", request: { apple: { sku } } })  [react-native-iap v15]
  → Apple payment sheet appears
  → purchaseUpdatedListener fires with transactionReceipt
  → POST /api/v1/subscriptions/verify/apple { transactionReceipt }
  → Backend validates with Apple receipt server (prod → sandbox fallback)
  → User.plan updated to PRO/STUDIO
```

### Product SKU Map (IAP_SKU_MAP in pricing screen)

| Plan | Billing | SKU |
|------|---------|-----|
| Pro | Monthly | `ai.wilsify.app.pro.monthly` |
| Pro | Annual | `ai.wilsify.app.pro.annual` |
| Studio | Monthly | `ai.wilsify.app.studio.monthly` |
| Studio | Annual | `ai.wilsify.app.studio.annual` |

### Mobile Integration (Phase 6 — react-native-iap v15 API)
```typescript
import { initConnection, endConnection, purchaseUpdatedListener, purchaseErrorListener, useIAP } from "react-native-iap";
const { requestPurchase } = useIAP();

// On mount (iOS only):
initConnection().catch(() => {});
const sub = purchaseUpdatedListener(async (purchase) => {
  if (purchase.transactionReceipt) {
    await apiService.verifyAppleIAP(purchase.transactionReceipt);
    // ... invalidate cache, show success
  }
});

// On subscribe:
await requestPurchase({ type: "subs", request: { apple: { sku } } });
```

`E_USER_CANCELLED` error code is silently swallowed.

### iOS Lifecycle
- `initConnection()` called on pricing screen mount
- `endConnection()` called on unmount
- Purchase listeners cleaned up on unmount

### Webhook (App Store Server Notifications v2)
- Handles `signedPayload` (JWT signed by Apple)
- Idempotency via Redis key (first 64 chars of signedPayload), 24h TTL

### Action Required
- Create 4 IAP products in App Store Connect matching the SKU map above
- Set all products to "Ready to Submit" before App Review
- No additional env vars needed — Apple auth is built into EAS credentials

---

## 4. Stripe — International

### Flow
- Creates Checkout Session with `trial_period_days: 7`
- Returns session URL for web-based checkout
- Webhooks: `customer.subscription.created/updated/deleted`

### Webhook Events Handled
- `customer.subscription.created` → activates subscription
- `customer.subscription.updated` → updates plan/status
- `customer.subscription.deleted` → calls `expireSubscription()`

### Required Configuration
```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRO_MONTHLY_PRICE_ID
STRIPE_PRO_ANNUAL_PRICE_ID
STRIPE_STUDIO_MONTHLY_PRICE_ID
STRIPE_STUDIO_ANNUAL_PRICE_ID
```

**Webhook URL**: `https://api.wilsify.ai/api/v1/subscriptions/webhooks/stripe`

---

## 5. Google Play Billing

### Flow
- Uses Android Publisher API to verify subscription via `purchases.subscriptions.get`
- Service account JWT for authentication (no SDK dependency)
- RTDN (Real-Time Developer Notifications) via Pub/Sub

### Required Configuration
```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
GOOGLE_PACKAGE_NAME=ai.wilsify.app
```

### Action Required
- Create subscription products in Google Play Console matching the iOS SKU IDs
- Set up Pub/Sub topic and link to Realtime Notifications in Play Console

---

## 6. Backend Payment Routes

All routes under `/api/v1/subscriptions/`:

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Current subscription |
| `/orders` | POST | Create order (all providers) |
| `/verify` | POST | Verify Razorpay/Stripe payment |
| `/verify/apple` | POST | Verify Apple IAP receipt |
| `/verify/google` | POST | Verify Google Play token |
| `/cancel` | POST | Cancel subscription |
| `/webhooks/stripe` | POST | Stripe webhook |
| `/webhooks/razorpay` | POST | Razorpay webhook |
| `/webhooks/apple` | POST | Apple APNS webhook |
| `/webhooks/google` | POST | Google RTDN webhook |

---

## 7. Subscription Lifecycle

### Plan Flow
```text
FREE → [createOrder] → [verifyPayment] → PRO/STUDIO
PRO  → [cancel]      → "cancelling"    → webhook fired at period end → FREE
```

### Two-Phase Cancel (Fixed Phase 5)
**Before**: `cancelSubscription()` immediately set `user.plan = "FREE"` — user lost access on cancel click.  
**After**: Sets `status: "cancelling"`, keeps plan intact. When webhook fires (`subscription.deleted`/`subscription.cancelled`), `expireSubscription()` sets `user.plan = "FREE"`.

### Duplicate Charge Protection
- `Subscription.userId` is unique — can't have two active subscriptions
- `Subscription.providerId` is unique — prevents same provider subscription being applied twice

### Webhook Idempotency (Phase 5)
```typescript
const key = `whk:${provider}:${eventId}`;
const result = await redis.set(key, "1", "EX", 86400, "NX");
if (result === null) return { received: true, duplicate: true };
```

---

## 8. Restore Purchases

Mobile flow (`pricing/index.tsx`):
1. `handleRestore()` calls `apiService.getSubscription()`
2. If subscription exists and plan != FREE, invalidates auth cache → plan updates in UI
3. Shows confirmation alert

For proper Apple restore: should call `InAppPurchases.getPurchaseHistoryAsync()` and re-verify the latest receipt.

---

## 9. Dev Bypass Removal (Phase 6)

The "Mark as Paid (Dev)" `Alert` button has been completely removed from `pricing/index.tsx`.

**Before** (removed):
```typescript
{
  text: "Mark as Paid (Dev)",
  onPress: async () => {
    await apiService.verifyPayment(order.orderId, "dev_payment_id", "dev_signature");
    ...
  },
}
```

**After**: Real payment SDKs only. No dev bypass exists in any build profile.

---

## 10. Testing Checklist

### iOS Sandbox
- [ ] Create sandbox tester account in App Store Connect
- [ ] Build with `eas build --profile preview`
- [ ] Sign in with sandbox account on real iOS device
- [ ] Subscribe to Pro → verify `User.plan = "PRO"` in DB
- [ ] Cancel → verify `status: "cancelling"` in DB
- [ ] Test restore purchases

### Android Razorpay
- [ ] Use Razorpay test keys (`rzp_test_...`) during preview builds
- [ ] Test successful payment (card: 4111 1111 1111 1111)
- [ ] Test payment cancellation (no error shown)
- [ ] Test failed payment (error alert shown)
- [ ] Verify webhook fires and `User.plan` updates

---

## 11. Status

- [x] `react-native-razorpay` installed
- [x] `react-native-iap` installed (v15.3.2 — Nitro module)
- [x] `react-native-iap` plugin added to `app.json`
- [x] Dev bypass removed
- [x] iOS IAP flow wired (requestPurchase + purchaseUpdatedListener)
- [x] Android Razorpay flow wired
- [x] Backend payment routes implemented (Phase 4)
- [x] Webhook idempotency in place (Phase 5)
- [ ] Razorpay live account activated (KYC)
- [ ] Apple IAP products created in App Store Connect
- [ ] `EXPO_PUBLIC_RAZORPAY_KEY_ID` set in EAS
- [ ] Production webhook URLs registered

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — the Billing Flow diagram this document expands on
- [../deployment/SECURITY.md](../deployment/SECURITY.md) — webhook signature verification and idempotency
- [../deployment/LAUNCH_CHECKLIST.md](../deployment/LAUNCH_CHECKLIST.md) — remaining live-credential setup steps
- [../README.md](../README.md) — documentation map
