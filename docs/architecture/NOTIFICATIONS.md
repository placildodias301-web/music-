# Wilsify AI — Push Notifications

**Date**: June 2026  
**Phases**: 4 (Infrastructure) + 5 (Backend) + 6 (Deep Links)  
**Status**: COMPLETE — pending EXPO_ACCESS_TOKEN and real project ID

---

## Architecture

```text
[Mobile App — on first login]
  ↓ expo-notifications.getExpoPushTokenAsync({ projectId })
  ↓ POST /api/v1/users/push-token { token }
  ↓ User.pushToken saved in DB

[BullMQ Analysis Worker — on job complete]
  ↓ Fetch user.pushToken
  ↓ POST https://exp.host/--/api/v2/push/send
  ↓ Expo push delivery → APNs / FCM → Device

[User taps notification]
  ↓ addNotificationResponseReceivedListener fires   (running app)
  ↓ OR getLastNotificationResponseAsync             (cold start)
  ↓ Read data.type + data.songId
  ↓ router.push(`/analysis/${songId}`)
```

---

## 1. Database Model

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  title     String
  body      String
  type      String   // flexible — no enum needed
  metadata  Json?    // e.g. { songId }
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
}
```

- `type` is a plain `String` — add new notification types without migration
- `metadata` JSON blob for deep-link routing
- `onDelete: Cascade` — notifications deleted with user

---

## 2. Backend Notification Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/notifications` | ✅ | Returns `{ notifications, unread }`, limit 30 |
| `PATCH /api/v1/notifications/:id/read` | ✅ | Mark single notification read |
| `PATCH /api/v1/notifications/read-all` | ✅ | Mark all read |
| `POST /api/v1/users/push-token` | ✅ | Store device push token |

### NotificationService Methods
```typescript
async list(userId, limit = 30)     // ordered by createdAt desc
async unreadCount(userId)           // count where read = false
async markRead(userId, id)          // update where id + userId (ownership check)
async markAllRead(userId)           // updateMany where userId
async create({ userId, title, body, type, metadata })
```

---

## 3. Push Token Registration (`_layout.tsx`)

```typescript
async function registerForPushNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  const finalStatus = existing === "granted"
    ? existing
    : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== "granted") return null;
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  });
  return token.data;
}

// Fires once after isAuthenticated becomes true (guarded by ref)
useEffect(() => {
  if (!isAuthenticated || tokenRegistered.current) return;
  tokenRegistered.current = true;
  registerForPushNotifications()
    .then((token) => { if (token) apiService.registerPushToken(token).catch(() => {}); })
    .catch(() => {});
}, [isAuthenticated]);
```

- Registration runs once per authenticated session
- Failure is silently swallowed — push is non-critical
- Android notification channel created before requesting permission

---

## 4. Backend: Storing Push Tokens

```typescript
// POST /api/v1/users/push-token
fastify.post("/push-token", { preHandler: [authenticate] }, async (req, reply) => {
  const { token } = req.body as { token: string };
  if (!token.startsWith("ExponentPushToken[")) {
    return reply.code(400).send({ error: "Invalid push token format" });
  }
  await fastify.prisma.user.update({
    where: { id: req.user.id },
    data: { pushToken: token },
  });
  return { success: true };
});
```

Token validated with `ExponentPushToken[` prefix before storing.

---

## 5. Backend: Sending Pushes (Analysis Worker)

```typescript
if (user.pushToken) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: user.pushToken,
      title: "Analysis Complete ✓",
      body: `${song.title} is ready`,
      data: { type: "analysis_complete", songId: song.id },
      sound: "default",
    }),
  });
}
```

---

## 6. Notification Handler Configuration

```typescript
// Set at module level in _layout.tsx
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,   // required in Expo Notifications v0.31 (SDK 54)
    shouldShowList: true,     // required in Expo Notifications v0.31 (SDK 54)
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
```

---

## 7. Deep-Link Handler (`_layout.tsx`) — Added Phase 6

```typescript
useEffect(() => {
  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as Record<string, string> | undefined;
    if (!data) return;
    if (data.type === "analysis_complete" && data.songId) {
      router.push(`/analysis/${data.songId}` as any);
    } else if (data.screen) {
      router.push(data.screen as any);
    } else {
      router.push("/notifications/index" as any);
    }
  }

  // Running app (foreground or background)
  const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

  // Cold start — app opened from killed state via notification tap
  Notifications.getLastNotificationResponseAsync()
    .then((response) => { if (response) handleNotificationResponse(response); })
    .catch(() => {});

  return () => sub.remove();
}, []);
```

### Routing Logic

| `data.type` | `data.songId` | Route |
|------------|---------------|-------|
| `analysis_complete` | present | `/analysis/{songId}` |
| *(any)* | — | `data.screen` if set |
| *(fallback)* | — | `/notifications/index` |

---

## 8. Notification Types

| Type | Trigger | Deep Link | Status |
|------|---------|-----------|--------|
| `analysis_complete` | BullMQ worker on success | `/analysis/:songId` | ✅ Implemented |
| `like` | Community post liked | - | ⚠️ Not wired |
| `comment` | Community post commented | - | ⚠️ Not wired |
| `payment` | Subscription renewed | `/pricing/index` | ⚠️ Not wired |
| `system` | Welcome message, announcements | - | ⚠️ Not wired |

### Wiring Remaining Types (Code Snippets)

**Subscription renewal** (in `subscription.service.ts`):
```typescript
await notificationSvc.create({
  userId, type: "payment",
  title: "Subscription renewed",
  body: `Your ${plan} plan has been renewed. Enjoy your credits!`,
  metadata: { screen: "pricing" } as any,
});
```

**Community like** (in POST /posts/:id/like route):
```typescript
if (likedPost.userId !== req.userId) {
  await notificationSvc.create({
    userId: likedPost.userId, type: "like",
    title: `${liker.displayName} liked your post`,
    body: likedPost.title ?? "Your community post",
    metadata: { postId } as any,
  });
}
```

**Welcome notification** (in `auth.service.ts` register):
```typescript
await prisma.notification.create({
  data: {
    userId: user.id, type: "system",
    title: "Welcome to Wilsify AI 🎵",
    body: "Upload your first song to detect chords, BPM, and key instantly.",
  },
});
```

---

## 9. Required Configuration

| Item | Value | Status |
|------|-------|--------|
| `EXPO_PUBLIC_PROJECT_ID` | Expo project UUID | Placeholder — set after `eas init` |
| `EXPO_ACCESS_TOKEN` | Expo server-side token (optional) | For enhanced delivery receipts |
| Firebase (FCM) | Auto-configured by EAS for Android | No manual setup needed |
| APNs | Auto-configured via EAS credentials for iOS | No manual setup needed |
| `UIBackgroundModes: ["remote-notification"]` | `app.json` | ✅ Already set |
| `expo-notifications` plugin | `app.json` | ✅ Already configured |

---

## 10. Testing Push Notifications

```bash
# Test via curl:
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to":"ExponentPushToken[xxx]","title":"Test","body":"Hello from Wilsify","data":{"type":"analysis_complete","songId":"song123"}}'
```

Or use the Expo push notification tool at [expo.dev](https://expo.dev).

---

## 11. Status

- [x] `registerForPushNotifications()` implemented
- [x] `apiService.registerPushToken()` implemented
- [x] Token saved to `User.pushToken` in DB
- [x] Token validated with `ExponentPushToken[` prefix
- [x] Analysis worker sends push on completion
- [x] Notification handler shows alert/sound/badge (with SDK 54 required fields)
- [x] Android notification channel created
- [x] Deep-link handler added (Phase 6)
- [x] Cold-start tap handled via `getLastNotificationResponseAsync`
- [ ] `EXPO_PUBLIC_PROJECT_ID` set to real Expo project UUID
- [ ] End-to-end test: upload → analysis → push delivered → tap → opens analysis screen

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — where notification events fit in the request lifecycle
- [../deployment/ENVIRONMENT.md](../deployment/ENVIRONMENT.md) — required push notification environment variables
- [../deployment/EAS.md](../deployment/EAS.md) — mobile build configuration for push tokens
- [../README.md](../README.md) — documentation map
