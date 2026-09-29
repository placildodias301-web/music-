# Wilsify AI — Security Model

---

## Authentication

### JWT Access Tokens

- Signed with `HS256` using `JWT_SECRET` (minimum 32 characters, recommended 64-byte hex)
- Payload: `{ id, email, plan, role, iat, exp }`
- TTL: 15 minutes (`JWT_ACCESS_EXPIRES`)
- Transmitted in the `Authorization: Bearer <token>` header

### Refresh Tokens

- Generated as a cryptographically random opaque string
- Stored as SHA-256 hash in the `refresh_tokens` table (raw token never persisted)
- TTL: 30 days (`JWT_REFRESH_EXPIRES`)
- Transmitted and stored as an `httpOnly`, `SameSite=Strict` cookie at path `/api/v1/auth/refresh`
- **Rotated on every use**: old token deleted, new token created atomically
- **Mobile exception**: the mobile app sends the refresh token in a `Cookie` header manually (no browser cookie jar)

### Middleware

```typescript
// authenticate.ts
// Verifies JWT, populates req.userId and req.userPayload
export async function authenticate(req, reply) { ... }

// requireVerified — checked live from DB, not JWT
// Avoids false negatives from stale JWT plan data
export async function requireVerified(req, reply) { ... }

// requirePlan — checked against JWT plan field (15-min window)
export function requirePlan(...plans: string[]) { ... }
```

`requireVerified` always reads `isVerified` from the database because the JWT may be up to 15 minutes old. A user whose email was just verified would still have `isVerified: false` in their JWT until they refresh the token. The DB check avoids blocking legitimate requests.

---

## Email Verification

New accounts start with `isVerified: false`. The following actions are gated behind email verification:

- `POST /uploads/file`
- `POST /uploads/youtube`
- `POST /tutor/chat`

Verification flow:
1. Register → `isVerified: false` → verification email sent with 24h token
2. User clicks link → `POST /auth/verify-email { token }` → `isVerified: true`
3. User can now upload and use the tutor

Tokens are one-time use (`used: true` after consumption) and expire after 24 hours.

`resend-verification` invalidates all previous tokens before creating a new one.

---

## Admin Authorization

The admin endpoints at `/api/v1/admin/*` require `role: ADMIN` in the JWT payload.

```typescript
async function requireAdmin(req, reply) {
  await authenticate(req, reply);
  if (req.userPayload.role !== "ADMIN") throw Errors.forbidden();
}
```

Role assignment is done manually via `PATCH /admin/users/:id { role: "ADMIN" }` by an existing admin.

---

## AI Service Authentication

All requests from the Fastify backend to the AI service must include:

```text
X-Internal-Secret: <AI_SERVICE_SECRET>
```

The AI service rejects requests where this header is absent or incorrect:

```python
def _verify_secret(x_internal_secret: Optional[str] = Header(default=None)) -> None:
    settings = get_settings()
    if settings.AI_SERVICE_SECRET and x_internal_secret != settings.AI_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Secret header")
```

**Production startup assertion:**

```python
def validate_production_secrets(self) -> None:
    if self.APP_ENV == "production":
        if not self.AI_SERVICE_SECRET:
            print("FATAL: AI_SERVICE_SECRET must be set in production.", file=sys.stderr)
            sys.exit(1)
```

This is called before any routers are loaded in `main.py`. The service will not start in production without this secret.

The backend also emits a warning log at startup if `AI_SERVICE_SECRET` is unset in production:

```typescript
if (env.NODE_ENV === "production" && !env.AI_SERVICE_SECRET) {
  console.error("WARNING: AI_SERVICE_SECRET is not set. The AI service internal endpoints are unprotected in production.");
}
```

---

## Rate Limiting

Rate limiting is applied globally via `@fastify/rate-limit`. Default: 100 requests / minute per IP.

Tighter limits on sensitive endpoints:

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5 / 15 min |
| `POST /auth/login` | 10 / 15 min |
| `POST /auth/forgot-password` | 5 / 15 min |
| `POST /auth/reset-password` | 5 / 15 min |
| `POST /auth/verify-email` | 10 / 15 min |
| `POST /tutor/chat` | 30 / minute |

---

## Payment Security

### Razorpay webhook and purchase verification

Both `verifyPurchase()` and `verifyWebhookSignature()` use `timingSafeEqual` instead of string equality:

```typescript
import { timingSafeEqual } from "crypto";

const expected = Buffer.from(expectedSignature, "hex");
const actual   = Buffer.from(signature, "hex");

// Length check first (timingSafeEqual throws on length mismatch)
if (expected.length !== actual.length) return false;
return timingSafeEqual(expected, actual);
```

This prevents timing side-channel attacks where an attacker could brute-force the HMAC by measuring response time.

### Stripe webhook verification

Stripe webhook signatures are verified using the official `stripe` library's `constructEvent()` which validates the `Stripe-Signature` header and timestamp (prevents replay attacks within the default 5-minute tolerance window).

### Webhook idempotency

All four webhook handlers (Stripe, Razorpay, Apple, Google) check for duplicate events:

```typescript
async function isDuplicateWebhookEvent(provider: string, eventId: string): Promise<boolean> {
  const key = `whk:${provider}:${eventId}`;
  const result = await redis.set(key, "1", "EX", 86400, "NX");
  return result === null; // null = key already existed = duplicate
}
```

Redis `SET NX` is atomic — no race condition. TTL is 24 hours.

---

## File Validation

File uploads go through `UploadService.uploadAudioFile()` which validates:
- MIME type must be a known audio type
- File extension must match
- Size is implicitly limited by `@fastify/multipart` configuration

The AI service enforces:
- `MAX_AUDIO_SIZE_BYTES` (default 100 MB)
- `MAX_AUDIO_DURATION_SECONDS` (default 600 seconds / 10 minutes)

---

## CORS

```typescript
// backend/src/plugins/cors.ts
origins: env.NODE_ENV === "development" ? "*" : env.ALLOWED_ORIGINS.split(",")
```

In production, only the domains listed in `ALLOWED_ORIGINS` may send cross-origin requests. The web dashboard and mobile app URLs must be listed.

---

## Security Headers

`@fastify/helmet` is registered globally and sets standard security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (browsers handle this natively)
- `Strict-Transport-Security` (in production)
- `Referrer-Policy: no-referrer`

Content Security Policy is disabled (`contentSecurityPolicy: false`) because the Swagger UI requires inline scripts.

---

## Error Handling

4xx errors return structured JSON without stack traces:

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Song not found", "statusCode": 404 }
}
```

5xx errors return:

```json
{
  "success": false,
  "error": { "code": "INTERNAL_ERROR", "message": "An unexpected error occurred", "statusCode": 500 }
}
```

Stack traces are only logged server-side (via Pino), never sent to clients.

---

## No localStorage / sessionStorage

The web app stores no sensitive data in browser storage. The Zustand auth store is in-memory only. The access token is kept in memory; the refresh token is in an `httpOnly` cookie that JavaScript cannot read.

---

## Security Best Practices

1. **Rotate JWT secrets** if a secret is suspected to be compromised. All access tokens will immediately become invalid.
2. **Set `AI_SERVICE_SECRET`** in production. Without it, any client can call the AI service directly, bypassing credit checks and plan enforcement.
3. **Enable R2 bucket CORS policy** to only allow requests from your frontend domain.
4. **Restrict `ALLOWED_ORIGINS`** to known frontend URLs in production.
5. **Keep dependencies updated.** Run `npm audit` and `pip-audit` regularly.
6. **Use Sentry** to monitor for unexpected 5xx spikes that may indicate an attack.
7. **Never log full tokens or passwords.** The codebase does not log these, but verify this if adding new log statements.

---

## Related Documents

- [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — where these controls sit in the request lifecycle
- [ENVIRONMENT.md](ENVIRONMENT.md) — the secrets referenced throughout this document
- [../architecture/PAYMENTS.md](../architecture/PAYMENTS.md) — payment-specific security detail
- [../README.md](../README.md) — documentation map
