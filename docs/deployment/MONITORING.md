# Wilsify AI — Monitoring

**Date**: June 2026  
**Phase**: 5 — Production Launch Preparation

---

## 1. Current Monitoring State

| Component | Error Logging | Sentry | Metrics | Alerts |
|-----------|--------------|--------|---------|--------|
| Backend API | ✅ Pino logger | ✅ DSN-gated | ⚠️ None | ⚠️ None |
| BullMQ Worker | ✅ console.info/error | ⚠️ Not integrated | ⚠️ None | ⚠️ None |
| AI Service | ✅ Python logging | ✅ DSN-gated | ⚠️ None | ⚠️ None |
| Mobile | ✅ __DEV__ console | ✅ DSN-gated | ⚠️ None | ⚠️ None |
| WebSocket | ✅ Fastify logger | ⚠️ Not integrated | ⚠️ None | ⚠️ None |

---

## 2. Backend — Sentry Integration

### Current State
```typescript
// app.ts — init
if (env.SENTRY_DSN) {
  await import("@sentry/node")
    .then(Sentry => Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV }))
    .catch(() => {});
}

// app.ts — error handler (Phase 5 addition)
if (env.SENTRY_DSN) {
  import("@sentry/node")
    .then(Sentry => Sentry.captureException(error))
    .catch(() => {});
}
```

### What Gets Captured
- ✅ Unhandled 5xx errors via `setErrorHandler`
- ⚠️ Worker errors: logged to console but NOT sent to Sentry
- ⚠️ WebSocket errors: NOT captured
- ⚠️ BullMQ job failures: NOT captured

### Recommended Addition — Worker Sentry Integration
Add to `analysis.worker.ts` `worker.on("failed")` handler:
```typescript
import * as Sentry from "@sentry/node";

worker.on("failed", async (job, error) => {
  if (env.SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: { songId: job?.data.songId, queue: "analysis" },
    });
  }
  // ... existing handler
});
```

### Recommended Addition — WebSocket Sentry Integration
In `websocket/index.ts` `forwardChunkToAI()` error handler:
```typescript
socket.on("error", (err) => {
  fastify.log.error({ err }, "[ws] socket error");
  if (env.SENTRY_DSN) {
    import("@sentry/node").then(S => S.captureException(err)).catch(() => {});
  }
});
```

---

## 3. Mobile — Sentry Integration

### Current State (`_layout.tsx`)
```typescript
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (dsn) {
  import("@sentry/react-native")
    .then(Sentry => Sentry.init({ dsn, environment: __DEV__ ? "development" : "production" }))
    .catch(() => {});
}
```

### What Gets Captured
- ✅ Unhandled JS exceptions (Sentry wraps the root component automatically)
- ⚠️ API errors: caught in apiService but not forwarded to Sentry
- ⚠️ Navigation errors: not captured

### Recommended: Wrap Navigation Errors
```typescript
// _layout.tsx — add after Sentry init:
Sentry.setTag("platform", Platform.OS);
Sentry.setTag("appVersion", "1.0.0");
```

### Recommended: Capture API Errors
```typescript
// apiService.ts — in response interceptor:
.catch(async (error) => {
  if (error.response?.status >= 500) {
    const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (dsn) {
      import("@sentry/react-native")
        .then(S => S.captureException(error))
        .catch(() => {});
    }
  }
  return Promise.reject(error);
});
```

---

## 4. AI Service — Sentry Integration

### Current State (`main.py`)
```python
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(dsn=_sentry_dsn, environment=os.getenv("ENV", "production"))
```

### What Gets Captured
- ✅ FastAPI route exceptions (Sentry auto-instruments FastAPI)
- ✅ Uncaught exceptions in services

### What to Add
```python
# api/analyze.py — in the except handler:
except Exception as e:
    if _sentry_dsn:
        sentry_sdk.capture_exception(e)
    raise
```

---

## 5. Structured Logging

### Backend
Pino logger is already configured. Key log events:

| Event | Level | Fields |
|-------|-------|--------|
| Server start | info | host, port, NODE_ENV |
| Worker start | info | — |
| Analysis complete | info | song, duration, chords |
| Analysis failed | error | song, duration, error |
| Unhandled error | error | err, reqId |
| Push notification sent | info | songId |
| WebSocket connect | info | userId |
| WebSocket disconnect | info | userId, reason |

### Missing Log Events (Recommended)
```typescript
// In auth.service.ts:
fastify.log.info({ userId, email }, "User registered");
fastify.log.warn({ email, ip: req.ip }, "Failed login attempt");

// In subscription routes:
fastify.log.info({ userId, plan, provider }, "Subscription activated");
fastify.log.info({ userId, provider }, "Subscription cancelled");
```

---

## 6. Health Checks

### Backend `GET /healthz`
Returns:
```json
{
  "ok": true,
  "version": "1.0.0",
  "uptime": 12345,
  "timestamp": "2026-06-16T..."
}
```
Used by Railway healthcheck every 30 seconds.

### AI Service `GET /health`
```json
{ "status": "ok", "gpu_available": false }
```

### Recommended: Deep Health Check
Add `GET /healthz/deep` that verifies:
- PostgreSQL: `prisma.$queryRaw\`SELECT 1\``
- Redis: `redis.ping()`
- Returns 503 if any dependency is unhealthy

```typescript
fastify.get("/healthz/deep", async (_req, reply) => {
  const checks: Record<string, boolean> = {};
  try { await fastify.prisma.$queryRaw`SELECT 1`; checks.db = true; } catch { checks.db = false; }
  try { await redis.ping(); checks.redis = true; } catch { checks.redis = false; }
  const healthy = Object.values(checks).every(Boolean);
  return reply.code(healthy ? 200 : 503).send({ ok: healthy, checks });
});
```

---

## 7. BullMQ Worker Metrics

Current: Worker logs completion/failure with `duration=${ms}ms chords=${count}`.

### Recommended: Queue Depth Monitoring
```typescript
// Add to index.ts after worker start:
setInterval(async () => {
  const Queue = await import("bullmq").then(m => m.Queue);
  const q = new Queue("analysis", { connection: { url: env.REDIS_URL } });
  const counts = await q.getJobCounts();
  fastify.log.info({ queue: "analysis", ...counts }, "[queue] depth");
}, 60_000);
```

---

## 8. Alerting Recommendations

Configure Railway or an external service (PagerDuty, BetterStack) for:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| `/healthz` fails | 2 consecutive failures | Page on-call |
| 5xx error rate | >1% of requests | Alert |
| BullMQ queue depth | >50 waiting jobs | Alert |
| Analysis duration | >5 minutes | Alert |
| Redis connection lost | Any | Alert |
| Worker process crash | Any | Auto-restart (Railway handles) |

---

## 9. Checklist to Enable Full Monitoring

- [ ] Set `SENTRY_DSN` in backend Railway env
- [ ] Set `EXPO_PUBLIC_SENTRY_DSN` in mobile EAS env
- [ ] Set `SENTRY_DSN` in AI service Railway env
- [ ] Install `@sentry/node` in backend: `npm install @sentry/node`
- [ ] Install `@sentry/react-native` in mobile: `npx expo install @sentry/react-native`
- [ ] Install `sentry-sdk` in AI service: `pip install sentry-sdk`
- [ ] Add worker Sentry integration (see Section 2)
- [ ] Add deep healthcheck endpoint `/healthz/deep`
- [ ] Set up Railway alerting or external uptime monitor

---

## Related Documents

- [DEPLOYMENT.md](DEPLOYMENT.md) — where health checks fit in the deploy process
- [../development/PERFORMANCE.md](../development/PERFORMANCE.md) — related performance analysis
- [../README.md](../README.md) — documentation map
