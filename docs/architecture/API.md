# Wilsify AI — API Reference

**Base URL:** `https://api.wilsify.ai/api/v1`

**Interactive docs:** `GET /docs` (Swagger UI, always available)

**Authentication:** All protected endpoints require `Authorization: Bearer <access_token>`.

**Error format:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "statusCode": 401
  }
}
```

**Common error codes:**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid access token |
| `FORBIDDEN` | 403 | Valid token but insufficient permissions |
| `EMAIL_NOT_VERIFIED` | 403 | Account email not yet verified |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource |
| `INSUFFICIENT_CREDITS` | 402 | Not enough credits for this action |
| `PLAN_REQUIRED` | 403 | Endpoint requires a paid plan |
| `TOO_MANY_REQUESTS` | 429 | Rate limit or monthly usage cap exceeded |
| `VALIDATION_ERROR` | 400 | Request body failed Zod validation |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Health

### GET /health

Check server liveness.

**Auth:** None

**Response 200:**
```json
{ "status": "ok", "timestamp": "2026-06-26T00:00:00.000Z" }
```

---

## Auth

### POST /auth/register

Create a new account. Sends a verification email. Account starts with `isVerified: false`.

**Auth:** None

**Rate limit:** 5 requests / 15 minutes

**Request:**
```json
{
  "email": "user@example.com",
  "password": "minimum8chars",
  "displayName": "Jane Musician",
  "instrument": "guitar"
}
```

| Field | Required | Notes |
|---|---|---|
| `email` | Yes | Must be unique |
| `password` | Yes | Minimum 8 characters |
| `displayName` | Yes | 2–50 characters |
| `instrument` | No | Free text |

**Response 201:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "...",
  "user": {
    "id": "clxxx",
    "email": "user@example.com",
    "displayName": "Jane Musician",
    "plan": "FREE",
    "role": "USER",
    "isVerified": false,
    "createdAt": "2026-06-26T00:00:00.000Z"
  }
}
```

Sets `Set-Cookie: refresh_token=...; HttpOnly; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=2592000`

---

### POST /auth/login

**Auth:** None

**Rate limit:** 10 requests / 15 minutes

**Request:**
```json
{
  "email": "user@example.com",
  "password": "mypassword"
}
```

**Response 200:** Same shape as register response.

**Error 401:** Invalid credentials.

---

### POST /auth/logout

Revoke the refresh token for the authenticated session.

**Auth:** Required

**Response 200:**
```json
{ "success": true }
```

Clears the `refresh_token` cookie.

---

### POST /auth/refresh

Exchange a refresh token for a new access token. Refresh token is rotated on every use.

**Auth:** None (reads `refresh_token` cookie or `Cookie` header)

**Response 200:**
```json
{ "accessToken": "eyJ..." }
```

Sets a new `refresh_token` cookie.

**Error 401:** Token missing, expired, or revoked.

---

### POST /auth/forgot-password

Request a password reset link by email.

**Auth:** None

**Rate limit:** 5 requests / 15 minutes

**Request:**
```json
{ "email": "user@example.com" }
```

**Response 200:** Always returns the same message regardless of whether the email exists (prevents enumeration):
```json
{ "message": "If an account with that email exists, a reset link has been sent." }
```

---

### POST /auth/reset-password

**Auth:** None

**Rate limit:** 5 requests / 15 minutes

**Request:**
```json
{
  "token": "<raw token from email link>",
  "password": "newpassword123"
}
```

**Response 200:**
```json
{ "message": "Password updated successfully. Please log in with your new password." }
```

**Error 400:** Token invalid, expired, or already used.

---

### POST /auth/verify-email

Verify email address using the token sent at registration.

**Auth:** None

**Rate limit:** 10 requests / 15 minutes

**Request:**
```json
{ "token": "<raw token from verification email>" }
```

**Response 200:**
```json
{ "message": "Email verified successfully." }
```

**Error 400:** Token invalid, expired, or already used.

---

### POST /auth/resend-verification

Re-send the verification email. Invalidates all previous verification tokens.

**Auth:** Required

**Response 200:**
```json
{ "message": "Verification email sent." }
```

**Error 409:** Email already verified.

---

## Users

### GET /users/me

Get the authenticated user's profile.

**Auth:** Required

**Response 200:**
```json
{
  "id": "clxxx",
  "email": "user@example.com",
  "displayName": "Jane Musician",
  "avatarUrl": null,
  "instrument": "guitar",
  "plan": "PRO",
  "role": "USER",
  "isVerified": true,
  "createdAt": "2026-06-26T00:00:00.000Z"
}
```

---

### PATCH /users/me

Update display name, avatar URL, or instrument.

**Auth:** Required

**Request:**
```json
{
  "displayName": "Jane Guitar",
  "avatarUrl": "https://example.com/avatar.jpg",
  "instrument": "piano"
}
```

All fields optional.

**Response 200:** Updated user object.

---

### POST /users/push-token

Register an Expo push notification token.

**Auth:** Required

**Request:**
```json
{ "token": "ExponentPushToken[xxxxx]" }
```

**Response 200:**
```json
{ "ok": true }
```

---

## Songs

### GET /songs

List the authenticated user's songs, paginated.

**Auth:** Required

**Query params:**

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `20` | Per page; max 100 |
| `status` | — | Filter: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED` |

**Response 200:**
```json
{
  "songs": [
    {
      "id": "clxxx",
      "title": "My Song",
      "artist": null,
      "duration": 203.4,
      "bpm": 128.0,
      "keySignature": "C major",
      "status": "COMPLETED",
      "sourceType": "file",
      "isPublic": false,
      "createdAt": "2026-06-26T00:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "pages": 3
}
```

---

### GET /songs/:id

Get a single song by ID.

**Auth:** Required (must own song, or song must be public)

**Response 200:** Song object (same shape as list item).

**Error 404:** Song not found.
**Error 403:** Not the song owner and song is private.

---

### DELETE /songs/:id

Delete a song and its analysis.

**Auth:** Required (must own song)

**Response 204:** No body.

---

### GET /songs/:id/analysis

Get the analysis results for a song.

**Auth:** Required

**Response 200:**
```json
{
  "id": "clyyy",
  "songId": "clxxx",
  "keySignature": "A minor",
  "bpm": 120.5,
  "mode": "minor",
  "scale": "natural minor",
  "camelotKey": "8A",
  "energy": 0.72,
  "chords": [
    {
      "id": "clzzz",
      "name": "Am",
      "root": "A",
      "quality": "minor",
      "startTime": 0.0,
      "endTime": 1.93,
      "confidence": 0.91
    }
  ],
  "midiReady": true,
  "sheetReady": false,
  "midiUrl": "https://pub-xxx.r2.dev/analyses/clxxx/midi.mid",
  "sheetUrl": null,
  "difficulty": {
    "score": 5.2,
    "label": "Intermediate",
    "bpmFactor": 0.44,
    "chordComplexity": 0.31,
    "chordVariety": 0.5,
    "changeRate": 0.28
  },
  "status": "COMPLETED"
}
```

`mode` and `difficulty` are `null` if the AI service's mode/difficulty computation didn't run or failed for a given analysis (non-fatal on the AI service's side — the rest of the analysis still completes).

If no analysis record exists yet, returns `{ id: null, status: "QUEUED", chords: [], mode: null, difficulty: null }`.

---

### POST /songs/:id/analyze

Manually trigger (re-)analysis of a song. Charges 1 credit.

**Auth:** Required

If analysis is already `QUEUED` or `PROCESSING`, returns immediately without charging:

**Response 202 (already in flight):**
```json
{ "analysisId": "clyyy", "status": "QUEUED" }
```

**Response 202 (newly queued):**
```json
{ "jobId": "1", "analysisId": "clyyy", "status": "QUEUED" }
```

**Error 402:** Insufficient credits.

---

## Uploads

Both upload endpoints require email verification.

### POST /uploads/file

Upload an audio file for analysis. Charges 1 credit.

**Auth:** Required + email verified

**Content-Type:** `multipart/form-data`

**Body:** Audio file in form field (any name).

Supported formats: MP3, WAV, FLAC, OGG, M4A, AAC (validated by AI service).

**Response 201:**
```json
{
  "songId": "clxxx",
  "song": { /* Song object */ },
  "size": 4200000
}
```

**Error 400:** No file provided.
**Error 402:** Insufficient credits.
**Error 403:** Email not verified.

---

### POST /uploads/youtube

Submit a YouTube URL for analysis. Charges 1 credit.

**Auth:** Required + email verified

**Request:**
```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

Also accepts `youtu.be/` short URLs.

**Response 201:**
```json
{
  "songId": "clxxx",
  "song": { /* Song object */ }
}
```

**Error 400:** Invalid YouTube URL.
**Error 402:** Insufficient credits.
**Error 403:** Email not verified.

---

## Credits

### GET /credits

Get the authenticated user's credit balance and transaction history.

**Auth:** Required

**Response 200:**
```json
{
  "balance": 2498,
  "history": [
    {
      "id": "clzzz",
      "amount": -1,
      "type": "SPEND",
      "reason": "Analysis: My Song",
      "balance": 2498,
      "createdAt": "2026-06-26T00:00:00.000Z"
    },
    {
      "id": "claaa",
      "amount": 2500,
      "type": "EARN",
      "reason": "Monthly credit top-up (PRO)",
      "balance": 2499,
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

Returns last 50 transactions. `amount` is negative for SPEND, positive for EARN.

---

## Tutor

### POST /tutor/chat

Send a message to the AI music tutor.

**Auth:** Required + email verified + PRO plan or higher

**Rate limit:** 30 requests / minute

**Monthly limit:** PRO = 500 messages, STUDIO = 2000 messages, ENTERPRISE = unlimited

**Request:**
```json
{
  "songId": "clxxx",
  "messages": [
    { "role": "user", "content": "Why does this chord progression feel tense?" }
  ],
  "context": {
    "keySignature": "A minor",
    "bpm": 120,
    "scale": "natural minor",
    "chords": ["Am", "F", "C", "G"],
    "songTitle": "My Song"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `messages` | Yes | Array of `{ role, content }`; max 50 messages; only last 10 are sent to LLM |
| `context` | No | Analysis data injected into the system prompt |
| `songId` | No | For reference only (not used server-side) |

**Response 200:**
```json
{
  "role": "assistant",
  "content": "The tension comes from the **Am → F** movement ..."
}
```

**Error 403:** Plan required or email not verified.
**Error 429:** Monthly message limit reached.

---

## Subscriptions

### GET /subscriptions

Get the authenticated user's active subscription.

**Auth:** Required

**Response 200:**
```json
{
  "id": "clsub",
  "provider": "stripe",
  "plan": "PRO",
  "status": "active",
  "currentPeriodEnd": "2026-07-26T00:00:00.000Z",
  "cancelAtPeriodEnd": false
}
```

Returns `{ "status": "none" }` when no subscription exists.

---

### POST /subscriptions/order

Create a Razorpay or Stripe payment order.

**Auth:** Required

**Request:**
```json
{
  "plan": "PRO",
  "billing": "monthly",
  "provider": "razorpay"
}
```

| Field | Values |
|---|---|
| `plan` | `PRO`, `STUDIO`, `ENTERPRISE` |
| `billing` | `monthly`, `annual` |
| `provider` | `razorpay`, `stripe` |

**Response 200 (Razorpay):**
```json
{
  "orderId": "order_xxx",
  "amount": 99900,
  "currency": "INR",
  "keyId": "rzp_live_xxx"
}
```

**Response 200 (Stripe):** Stripe Checkout Session object including `url`.

---

### POST /subscriptions/verify

Verify a completed Razorpay or Stripe payment and activate subscription.

**Auth:** Required

**Request:**
```json
{
  "orderId": "order_xxx",
  "paymentId": "pay_xxx",
  "signature": "hmac_hex",
  "provider": "razorpay"
}
```

**Response 200:**
```json
{ "success": true, "plan": "PRO" }
```

---

### POST /subscriptions/apple/verify

Verify an Apple IAP receipt.

**Auth:** Required

**Request:**
```json
{ "receiptData": "<base64 App Store receipt>" }
```

**Response 200:**
```json
{ "success": true, "plan": "PRO" }
```

---

### POST /subscriptions/google/verify

Verify a Google Play purchase token.

**Auth:** Required

**Request:**
```json
{
  "purchaseToken": "...",
  "productId": "wilsify_pro_monthly"
}
```

**Response 200:**
```json
{ "success": true, "plan": "PRO" }
```

---

### POST /subscriptions/cancel

Cancel at end of billing period. User keeps access until `currentPeriodEnd`.

**Auth:** Required

**Response 200:**
```json
{
  "success": true,
  "message": "Subscription will end at the current billing period."
}
```

---

### POST /subscriptions/webhooks/stripe

Stripe webhook endpoint. Validates `Stripe-Signature` header (HMAC-SHA256).

**Auth:** Stripe signature (no Bearer token)

**Handled events:**
- `customer.subscription.updated` → upsert subscription
- `customer.subscription.deleted` → expire subscription + send expiry email
- `invoice.payment_failed` → set `past_due` + send payment failed email
- `invoice.payment_action_required` → set `past_due`

**Response 200:**
```json
{ "received": true }
```

---

### POST /subscriptions/webhooks/razorpay

Razorpay webhook endpoint. Validates `X-Razorpay-Signature` header.

**Auth:** Razorpay signature

**Handled events:** `payment.captured`, `subscription.cancelled`, `subscription.expired`

---

### POST /subscriptions/webhooks/apple

Apple App Store Server Notifications.

**Auth:** None (Apple sends signed JWS payloads)

---

### POST /subscriptions/webhooks/google

Google Play Real-time Developer Notifications (Pub/Sub push).

**Auth:** None

---

## Stats

### GET /stats

Get authenticated user's personal analytics.

**Auth:** Required

**Response 200:**
```json
{
  "totalSongs": 14,
  "completedAnalyses": 12,
  "failedAnalyses": 1,
  "mostCommonKey": "A minor",
  "averageBpm": 124.5
}
```

---

### GET /stats/public

Platform-wide counts for landing page display. No auth required.

**Auth:** None

**Response 200:**
```json
{
  "totalUsers": 1240,
  "totalSongs": 8710,
  "totalAnalyses": 7890
}
```

---

## Notifications

### GET /notifications

List notifications and unread count for the authenticated user.

**Auth:** Required

**Response 200:**
```json
{
  "notifications": [
    {
      "id": "clnnn",
      "title": "Analysis Complete",
      "body": "\"My Song\" has been analysed — tap to view chords & BPM",
      "type": "analysis_complete",
      "read": false,
      "metadata": { "songId": "clxxx" },
      "createdAt": "2026-06-26T00:00:00.000Z"
    }
  ],
  "unread": 1
}
```

Notification types: `analysis_complete`, `like`, `comment`, `system`, `payment`.

---

### PATCH /notifications/:id/read

Mark a single notification as read.

**Auth:** Required

**Response 200:**
```json
{ "ok": true }
```

---

### PATCH /notifications/read-all

Mark all notifications as read.

**Auth:** Required

**Response 200:**
```json
{ "ok": true }
```

---

## Community

### GET /community/feed

Get the community post feed.

**Auth:** Required

**Query params:**

| Param | Default | Values |
|---|---|---|
| `page` | `1` | Integer |
| `tab` | `feed` | `feed`, `trending`, `following` |

**Response 200:**
```json
{
  "posts": [
    {
      "id": "clppp",
      "content": "Finally nailed that Dm7 → G7 transition!",
      "tag": "jazz",
      "likesCount": 12,
      "user": { "id": "clxxx", "displayName": "Jane Musician", "avatarUrl": null },
      "song": null,
      "createdAt": "2026-06-26T00:00:00.000Z"
    }
  ],
  "page": 1
}
```

---

### POST /community/posts

Create a new community post.

**Auth:** Required

**Request:**
```json
{
  "content": "Check out this chord progression I found!",
  "songId": "clxxx",
  "tag": "rock"
}
```

| Field | Required | Limits |
|---|---|---|
| `content` | Yes | 1–2000 characters |
| `songId` | No | Must be a song the user owns |
| `tag` | No | Max 100 characters |

**Response 201:**
```json
{ "success": true, "data": { /* post object */ } }
```

---

### POST /community/posts/:id/like

Toggle like on a post (like if not liked, unlike if already liked).

**Auth:** Required

**Response 200:**
```json
{ "liked": true, "likesCount": 13 }
```

---

## Admin

All admin endpoints require `role: ADMIN` on the JWT.

### GET /admin/overview

Platform statistics dashboard.

**Auth:** Required (ADMIN role)

**Response 200:**
```json
{
  "users": {
    "total": 1240,
    "verified": 1100,
    "newLast7Days": 45,
    "byPlan": { "FREE": 1100, "PRO": 95, "STUDIO": 40, "ENTERPRISE": 5 }
  },
  "subscriptions": {
    "active": 140,
    "monthlyRevenueCents": 181200
  },
  "analyses": {
    "total": 8710,
    "completed": 8200,
    "failed": 120
  }
}
```

Revenue estimate: PRO count × $12 + STUDIO count × $29 (USD cents).

---

### GET /admin/users

Paginated user list with optional search and plan filter.

**Auth:** Required (ADMIN role)

**Query params:** `page`, `limit` (max 100), `search` (email or name), `plan`

**Response 200:**
```json
{
  "users": [ /* user objects with songCount and subscription */ ],
  "total": 1240,
  "page": 1,
  "limit": 20,
  "totalPages": 62
}
```

---

### GET /admin/users/:id

Full user detail including recent songs and subscription.

**Auth:** Required (ADMIN role)

**Response 200:** User object with `songs[]` (last 10) and `subscription`.

---

### PATCH /admin/users/:id

Update a user's role or plan (manual override).

**Auth:** Required (ADMIN role)

**Request:**
```json
{
  "role": "MODERATOR",
  "plan": "STUDIO"
}
```

Both fields optional.

**Response 200:** Updated user object.

---

### GET /admin/subscriptions

Paginated list of all subscriptions.

**Auth:** Required (ADMIN role)

**Response 200:** Paginated subscriptions with user details.

---

### GET /admin/analyses

Queue health and recent failures.

**Auth:** Required (ADMIN role)

**Response 200:**
```json
{
  "queue": { "queued": 3, "processing": 2 },
  "recentFailures": [
    {
      "id": "clxxx",
      "title": "My Song",
      "updatedAt": "2026-06-26T00:00:00.000Z",
      "user": { "email": "user@example.com" },
      "analysis": { "errorMessage": "Audio download failed: 403 Forbidden" }
    }
  ]
}
```

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — request lifecycle and auth flow behind these endpoints
- [../deployment/SECURITY.md](../deployment/SECURITY.md) — auth, rate limits, and payment signature verification
- [DATABASE.md](DATABASE.md) — the schema these endpoints read and write
- [../README.md](../README.md) — documentation map
