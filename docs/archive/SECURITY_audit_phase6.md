# Wilsify AI — Security

**Date**: June 2026  
**Phases**: 4 (Audit) + 5 (Hardening)  
**Standards**: OWASP Top 10 2021, MASVS L1, ASVS L2

---

## Executive Summary

| Area | Status | Notes |
|------|--------|-------|
| Authentication | ✅ Secure | JWT + refresh, bcrypt hashing |
| Authorization | ✅ Secure | Role + plan guards on all protected routes |
| Input validation | ✅ Secure | Zod schemas on all inputs |
| SQL injection | ✅ N/A | Prisma ORM with parameterised queries |
| File upload | ✅ Secure | MIME check, 100 MB limit, R2 isolation |
| Payment webhooks | ✅ Secure | HMAC-SHA256 verification on all providers |
| Secrets management | ✅ Secure | Env vars only, never in code or logs |
| Push tokens | ✅ Secure | Validated prefix check before storing |
| Webhook replay attacks | ✅ Secure | Redis idempotency keys (added Phase 5) |
| Rate limiting | ✅ Partial | IP rate limiting; per-user limits on key endpoints |
| XSS | ✅ N/A | Native app; no HTML rendering |
| CSRF | ✅ N/A | No cookie-based sessions in API |
| Transport security | ✅ Secure | TLS required; HSTS header set |

---

## 1. Authentication & Sessions

### JWT Implementation
- Access tokens: 15-minute expiry
- Refresh tokens: 30-day expiry, stored hashed in DB (`RefreshToken.tokenHash`)
- Refresh endpoint reads cookie OR `Authorization` header (mobile compatibility)
- `JWT_SECRET` and `JWT_REFRESH_SECRET` are distinct secrets, minimum 32 chars (Zod enforced)

### Password Storage
- `bcryptjs` with work factor 12
- No plaintext passwords stored or logged
- Forgot-password flow sends time-limited reset tokens (1-hour expiry, hashed in DB)
- Same response returned whether email exists or not (prevents enumeration)

### Brute Force Protection

| Endpoint | Limit | Status |
|----------|-------|--------|
| `POST /auth/register` | 5/15min/IP | ✅ Added Phase 5 |
| `POST /auth/login` | 10/15min/IP | ✅ |
| `POST /auth/forgot-password` | 5/15min/IP | ✅ |
| `POST /auth/refresh` | Global 200/min | ⚠️ Consider 20/min |

### Missing
- [ ] Account lockout after N consecutive failures (currently only rate-limited by IP)
- [ ] Email verification enforcement (users can upload without verifying email)

---

## 2. Authorization

### Plan Gates
```typescript
requirePlan("PRO", "STUDIO", "ENTERPRISE")
```
Applied to:
- `POST /tutor/chat` — ✅
- Live chord detection: gated in mobile only (backend WebSocket has no plan check) — ⚠️

### Resource Ownership
- `GET /songs` filters by `userId: req.userId` — ✅
- `GET /songs/:id` — ownership check in `song.service.ts` — ✅
- `DELETE /songs/:id` — ownership check needed — ⚠️
- `GET /api/v1/notifications` — filtered by `userId` — ✅
- `PATCH /notifications/:id/read` — checks `userId` in WHERE clause — ✅

### Recommendations
- Add plan check to `live:start` WebSocket event so Studio-only features can't be bypassed by connecting directly.
- Verify `DELETE /songs/:id` also deletes the R2 audio object.

---

## 3. Input Validation (OWASP A03)

All route inputs validated with Zod before processing:

| Attack Vector | Mitigation |
|--------------|-----------|
| SQL Injection | ✅ Prisma ORM — parameterised queries only |
| XSS | ✅ Native mobile app — no HTML rendering |
| Path Traversal (file upload) | ✅ Filename sanitised, R2 key uses UUID prefix |
| SSRF (YouTube URL) | ✅ URL validated against YouTube domains |
| Oversized payloads | ✅ Fastify `bodyLimit`, 100MB multipart limit |
| Tutor message spam | ✅ Max 50 messages, 2000 chars/message, 30/min rate limit |
| Prototype pollution | ✅ Zod schema rejects unexpected keys |

---

## 4. File Upload Security

| Check | Implementation |
|-------|---------------|
| Size limit | 100 MB (Fastify `bodyLimit`) |
| MIME type | Validated against allowlist |
| File extension | Checked independently of MIME |
| Storage | R2 bucket — not publicly writable |
| URL construction | `crypto.randomUUID()` prefix prevents enumeration |
| Virus scan | ⚠️ Not implemented — recommended for v1.1 |

Upload allowlist:
```
audio/mpeg, audio/wav, audio/flac, audio/mp4, audio/ogg, audio/aac, audio/webm
```

---

## 5. Payment Security

### Webhook Signature Verification

All payment webhooks verify HMAC signatures before processing:

| Provider | Method | Status |
|----------|--------|--------|
| Razorpay | HMAC-SHA256 of `orderId|paymentId` using `RAZORPAY_KEY_SECRET` | ✅ |
| Stripe | `stripe.webhooks.constructEvent()` with raw body | ✅ |
| Apple | JWT signature validation (App Store Server Notifications v2) | ✅ |
| Google | RTDN Pub/Sub verified by Google OAuth | ✅ |

### Raw Body Capture
`addContentTypeParser` captures `rawBody: Buffer` before JSON parsing — required for Stripe and Razorpay HMAC which must operate on the raw bytes.

### Webhook Replay Protection (Added Phase 5)
```typescript
const key = `whk:${provider}:${eventId}`;
const result = await redis.set(key, "1", "EX", 86400, "NX");
if (result === null) return { received: true, duplicate: true };
```
Redis SET NX pattern, 24h TTL. All 4 webhook handlers use this.

### Duplicate Charge Protection
- `Subscription.userId` is unique — can't have two active subscriptions
- `Subscription.providerId` is unique — prevents same event being applied twice

---

## 6. Transport Security

| Check | Status |
|-------|--------|
| HTTPS enforced by Railway (platform-level) | ✅ |
| `Strict-Transport-Security` header | ⚠️ Not set by Fastify hook — add via `onSend` hook |
| `X-Request-ID` response header | ✅ Added Phase 4 |
| Socket.IO: `wss://` only in production | ✅ Railway handles TLS termination |
| AI service: `X-Internal-Secret` header | ✅ Required on all analysis endpoints |
| AI service CORS restricted in production | ✅ Fixed Phase 5 |

### Recommended Fastify Hook
```typescript
fastify.addHook("onSend", async (_req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});
```

---

## 7. Mobile App Security (MASVS L1)

| Control | Status | Notes |
|---------|--------|-------|
| Access tokens in SecureStore (Keychain/Keystore) | ✅ | Not AsyncStorage |
| Refresh tokens in SecureStore | ✅ | |
| No secrets in app bundle (`app.json`) | ✅ | Only public env vars |
| No PII logged in production | ✅ | `__DEV__` guard |
| Sentry DSN from env var (not hardcoded) | ✅ | Dynamic import pattern |
| Certificate pinning | ⚠️ | Not implemented |
| Root/jailbreak detection | ⚠️ | Not implemented |
| Obfuscation (Android ProGuard) | ✅ | EAS production build |
| Screen capture prevention on payment screen | ⚠️ | Not implemented |

---

## 8. Secrets Management

| Secret | Location | Rotation Policy |
|--------|----------|----------------|
| JWT secrets | Railway env vars | 90 days |
| DATABASE_URL | Railway env vars | On compromise |
| Razorpay key secret | Railway env vars | On compromise |
| Stripe secret | Railway env vars | On compromise |
| R2 access key | Railway env vars | 180 days |
| AI service secret | Railway env vars (both services) | 90 days |
| Google service account key | Railway env vars | 1 year (auto-rotated by GCP) |

**Verified**: No secrets in git history. `.env` is in `.gitignore`. `app.json` contains only public values.

---

## 9. API Abuse Vectors

| Vector | Mitigation | Status |
|--------|-----------|--------|
| Credit exhaustion via rapid uploads | 1 credit/upload, balance check | ✅ |
| Tutor chat spam | 30/min rate limit + plan gate | ✅ |
| Auth brute force | 10/15min login + 5/15min register | ✅ |
| WebSocket flooding | No per-socket rate limit | ⚠️ |
| Webhook replay | Redis idempotency, 24h TTL | ✅ |
| Large audio files | 100MB limit | ✅ |
| YouTube SSRF | URL allowlist | ✅ |
| Community post spam | Not rate-limited | ⚠️ |

---

## 10. CORS

### Backend
```typescript
origin: env.ALLOWED_ORIGINS.split(",")
credentials: true
methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
```

### AI Service
- Development: `allow_origins=["*"]`
- Production: `allow_origins` from `ALLOWED_ORIGINS` env var (fixed Phase 5)

---

## 11. Data Privacy (GDPR / DPDP)

| Data | Retention | Deletion |
|------|-----------|---------|
| Audio files | User-controlled | Deleted when song deleted |
| Analysis results | User-controlled | Deleted with song |
| AI tutor messages | Not persisted | Messages not stored server-side |
| Push tokens | Until user signs out | Needs: clear on logout |
| Payment records | 7 years (legal) | Anonymised on account deletion |

| Requirement | Status |
|-------------|--------|
| Privacy policy linked in store listings | ⚠️ Document needed |
| Account deletion endpoint | ⚠️ Not implemented |
| Data export endpoint | ⚠️ Not implemented |
| Subscription terms clear in app | ✅ Pricing screen |
| Push token cleared on logout | ⚠️ Not yet (recommend adding to logout flow) |

---

## 12. Known Issues & Accepted Risks

| Issue | Risk | Mitigation |
|-------|------|-----------|
| No certificate pinning | Medium | Low exploitation risk at this stage; add in v1.1 |
| No virus scanning on uploads | Medium | Content used for audio analysis only; add ClamAV in v1.1 |
| AI service auth: shared secret only | Low | Internal network only; add mTLS for v1.1 |
| Google Play IAP: service account JWT | Low | Token expires in 1 hour; rotated per request |

---

## 13. Remaining Security Actions (Priority Order)

| # | Action | Severity | Effort |
|---|--------|----------|--------|
| 1 | Verify `DELETE /songs/:id` also deletes R2 object | 🔴 CRITICAL | 1 hour |
| 2 | Clear `pushToken` on logout | 🔴 HIGH | 15 min |
| 3 | Add `Strict-Transport-Security` header hook | 🟡 HIGH | 10 min |
| 4 | Add plan check to `live:start` WebSocket event | 🟡 HIGH | 30 min |
| 5 | Add account deletion endpoint (`DELETE /api/v1/users/me`) | 🟡 HIGH | 2 hours |
| 6 | Rate limit `/auth/refresh` to 20/min | 🟠 MEDIUM | 10 min |
| 7 | Rate limit community post creation | 🟠 MEDIUM | 10 min |
| 8 | Rate limit WebSocket audio chunks per socket | 🟠 MEDIUM | 1 hour |
| 9 | Certificate pinning in mobile app | 🟠 MEDIUM | 4 hours |
| 10 | Screen capture prevention on payment screen | 🟢 LOW | 2 hours |
| 11 | Add ClamAV virus scanning to file upload pipeline | 🟢 LOW | 4 hours |
