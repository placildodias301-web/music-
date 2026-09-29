# Wilsify AI — Testing

---

## Backend

**Framework:** Vitest 2

**Location:** `backend/src/__tests__/`

**Run:**

```bash
cd backend
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with V8 coverage report
```

**CI:** GitHub Actions runs `npm test` against a real PostgreSQL 16 and Redis 7 instance (not mocks).

---

### Test Files

| File | What it covers |
|---|---|
| `health.test.ts` | `GET /health` returns 200 with `{ status: "ok" }` |
| `auth.test.ts` | Register, login, logout, refresh, forgot/reset password (14 tests) |
| `auth.verification.test.ts` | Email verification flow — register sets `isVerified: false`, `verifyEmail()` happy/expired/used/not-found paths, `resendVerification()` conflict guard (6 tests) |
| `credit.service.test.ts` | Balance calculation, `spend()` throws on insufficient credits, `earn()`, `resetMonthlyCredits()` (7 tests) |
| `subscription.service.test.ts` | `upsertSubscription()`, `getSubscription()`, `expireSubscription()`, `cancelSubscription()` (6 tests) |
| `stripe.webhook.test.ts` | `invoice.payment_failed` → `past_due`, `subscription.deleted` → `cancelled`, unknown events → `handled: false` (5 tests) |
| `razorpay.test.ts` | `verifyWebhookSignature()` without secret → false, `handleWebhook()` for `payment.captured` (4 tests) |
| `song.service.test.ts` | Pagination shape, `limit` clamping (max 100), page defaults, ownership check (7 tests) |
| `analysis.service.test.ts` | NOT_FOUND / FORBIDDEN / BAD_REQUEST guards, QUEUED status on success, `includeStems: false` for FREE, `includeStems: true` for STUDIO (6 tests) |
| `rate-limit.test.ts` | Rate limit enforcement on register (5/15min), login (10/15min), forgot-password (5/15min), refresh (20/15min), resend-verification (5/hour); verifies 429 response shape (11 tests) |

**Total: 67 tests across 10 test files**

---

### Mock Strategy

Tests use **Prisma mocks** (plain objects with `vi.fn()` methods) rather than a real database, except in CI where real PostgreSQL is available via GitHub Actions service containers.

The queue service (`analysisQueue`) is mocked with `vi.mock()` to avoid Redis dependency in unit tests:

```typescript
vi.mock("../services/queue.service.js", () => ({
  analysisQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  },
}));
```

Email sending is skipped when `RESEND_API_KEY` is not set (logs a warning instead). This means email tests can run without a real Resend account.

---

### Setup

`backend/src/__tests__/setup.ts` runs before each test suite and configures:
- `DATABASE_URL` pointing to the test database
- `JWT_SECRET` and `JWT_REFRESH_SECRET` with test values
- `NODE_ENV=test`

---

### Coverage

Run with:

```bash
cd backend && npm run test:coverage
```

Coverage report is written to `backend/coverage/`. Currently ~65% line coverage. Target: 80%+.

Critical path coverage (must remain at 100%):
- Credit spend + earn + reset
- JWT sign + verify
- Razorpay + Stripe webhook signature verification
- Email verification token lifecycle
- Analysis idempotency check

---

## AI Service

**Framework:** pytest

**Location:** `ai-service/tests/`

**Run:**

```bash
cd ai-service
source .venv/bin/activate
pytest                          # all tests
pytest -v                       # verbose
pytest tests/test_bpm.py        # single file
pytest --cov=services           # with coverage
```

### Test Files

| File | What it covers |
|---|---|
| `test_health.py` | Health endpoint returns 200 |
| `test_bpm.py` | BPM detection on synthetic sine waves |
| `test_key.py` | Key detection (A major, C minor, etc.) |
| `test_chords.py` | Chord template matching |
| `test_difficulty.py` | Difficulty scoring heuristics |
| `test_pitch.py` | Pitch detection (autocorrelation) |
| `test_performance.py` | Performance analysis service |
| `test_stems.py` | Stem separation (mocked Demucs) |
| `test_sheet.py` | Sheet music generation (mocked LilyPond) |
| `test_tutor.py` | Tutor endpoint (mocked LLM calls) |
| `test_api.py` | Integration tests: `POST /api/analyze`, `POST /api/realtime/chunk` |

**Conftest (`tests/conftest.py`):** Provides shared fixtures including a test audio array (1s 440Hz sine wave at 22050 Hz).

---

### AI Service Mock Strategy

Heavy ML models (Demucs, LilyPond) are mocked in tests. The `conftest.py` patches:
- `services.stems.separate_stems` — returns fake stem paths
- `services.sheet.generate_sheet_music` — returns fake PDF path
- `services.r2.upload_*` — returns fake R2 URLs

This keeps tests fast (<5s) and runnable without GPU or LilyPond.

---

## Web App

**Framework:** Vitest 4 + React Testing Library + jsdom

**Location:** `web-app/src/__tests__/`

**Run:**

```bash
cd web-app
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with V8 coverage report
```

### Test Files

| File | What it covers |
|---|---|
| `store/authStore.test.ts` | Zustand auth store — setAccessToken, clearAuth, hydration |
| `lib/api/client.test.ts` | API client — 401 retry with token refresh, error shapes, 204 handling |
| `lib/api/auth.test.ts` | Auth API helpers — login, register, refresh, logout |
| `lib/hooks/useAnalysisPolling.test.ts` | Polling hook — starts/stops on mount/unmount, status transitions |
| `lib/hooks/useUpload.test.ts` | Upload hook — file upload flow, YouTube URL upload, error states |
| `components/ErrorBoundary.test.tsx` | Error boundary renders fallback on component error |
| `app/auth/login.test.tsx` | Login page — form submission, validation, error display |
| `app/auth/register.test.tsx` | Register page — form submission, password rules |
| `app/auth/forgot-password.test.tsx` | Forgot password page — email submission, success state |
| `app/dashboard/page.test.tsx` | Dashboard page — stats display, recent songs list |
| `app/history/page.test.tsx` | History page — song list, pagination |
| `app/admin/page.test.tsx` | Admin page — user table, plan filter, ADMIN role guard |
| `providers/ToastProvider.test.tsx` | Toast provider — show/dismiss, error and success variants |

**Total: 131 tests across 13 test files**

---

**Planned additions (post-launch):**
- E2E tests with Playwright covering the full upload → analysis → tutor → billing flow

---

## Mobile App

**Current state:** No automated tests for the Expo app.

Manual QA procedures:
1. iOS simulator + Android emulator — test core upload → analysis → tutor flow
2. Real device — test upload with real files, push notifications, live chord detection
3. Payment flow — test in sandbox mode before production

---

## Integration / E2E (Planned)

The full happy path is not yet covered by automated E2E tests. Manual test procedure for each deploy:

1. Register new account → verify email arrives → click link → `isVerified: true`
2. Upload an MP3 file → credit deducted → analysis queued → `analysis:complete` Socket.IO event received → chords visible
3. Upload a YouTube URL → same flow
4. PRO user sends tutor message → response returned
5. Stripe checkout → subscription active → `GET /subscriptions` returns `status: active`
6. Razorpay payment → same
7. Cancel subscription → `status: cancelled`, user retains access until period end
8. `invoice.payment_failed` webhook from Stripe → `status: past_due` → payment failed email sent

---

## Running Tests in CI

Backend CI (`backend-ci.yml`) runs two jobs:

1. **lint-and-type-check** — `tsc --noEmit`
2. **test** — real PostgreSQL + Redis via GitHub Actions service containers, then `npm test`

The test job runs against a freshly migrated test database:
```yaml
- run: npm run db:generate
- run: npm run db:migrate:deploy
- run: npm test
```

---

## Related Documents

- [PROJECT_PLAN.md](PROJECT_PLAN.md) — Quality Gates and per-phase test requirements
- [../releases/SPRINT9_RELEASE_REPORT.md](../releases/SPRINT9_RELEASE_REPORT.md) — most recent full validation run
- [../README.md](../README.md) — documentation map
