# Wilsify AI — Performance

**Date**: June 2026  
**Phase**: 5 — Production Launch Preparation

---

## 1. React Query Usage Audit

### queryClient (`src/queryClient.ts`)
```typescript
new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
```

✅ Singleton pattern (prevents duplicate clients)  
✅ `staleTime: 30s` avoids redundant network calls  
✅ `refetchOnWindowFocus: false` prevents refetch on tab switch  
✅ `retry: 1` prevents infinite retry loops on hard failures  

### Per-query configurations

| Query | Key | Interval | Status |
|-------|-----|----------|--------|
| Songs list | `["songs"]` | none | ✅ |
| Analysis | `["analysis", songId]` | 3s (until complete) | ✅ Polls correctly |
| Notifications | `["notifications"]` | 30s | ✅ |
| Stats | `["stats"]` | none | ✅ |

### Potential Issues

1. **Analysis polling is unconditional**:
   ```typescript
   // app/analysis/[songId].tsx
   refetchInterval: analysis?.status === "COMPLETED" || analysis?.status === "FAILED" ? false : 3000
   ```
   ✅ This correctly stops polling when done.

2. **No `staleTime` override on notifications**: 30s global staleTime means unread count could lag. Consider:
   ```typescript
   staleTime: 0  // always fresh for notifications
   ```

3. **Community feed**: paginated with `page` param but no infinite query — each page-change triggers a full refetch. Consider `useInfiniteQuery` for better UX.

---

## 2. Zustand Stores Audit

### authStore
- Persisted via AsyncStorage (`hasSeenOnboarding` only — tokens go to SecureStore) ✅
- `isHydrating` flag prevents flash of wrong screen ✅
- No `subscribeWithSelector` — fine for this usage ✅

### wsStore (`wsStore.ts`)
- Holds `socket` ref and `isConnected` ✅
- `socket` is not serialisable but Zustand handles this without persist ✅

### planStore
- Derives `isPro`/`isStudio` from `authStore` — no duplication ✅
- `usePlanStore` holds `credits` separately — small and clean ✅

### audioStore
- Check: does it hold large audio buffers? If so, large Zustand state can cause slow re-renders.

---

## 3. Re-render Analysis

### Key hot paths

**Home screen `(tabs)/index.tsx`**:
- Subscribes to `useAuthStore(s => s.user)` and `usePlanStore`
- 2 React Query subscriptions (`["songs"]`, `["stats"]`)
- Re-renders on: song upload, credit spend, plan upgrade
- ✅ Acceptable — not high frequency

**Analysis screen**:
- 3s polling interval when `status !== COMPLETED`
- Each poll triggers re-render of the chord timeline
- ✅ Acceptable — polling stops on completion

**Notifications screen**:
- 30s refetch interval
- `FadeInDown` animations on list mount
- ✅ Acceptable

**Live chord screen (`live/index.tsx`)**:
- `useLiveChords()` calls `setCurrentChord` and `setChordHistory` on every chord event
- Chord events arrive every 500ms (capture chunk duration)
- Each update re-renders the piano keyboard (12 note tiles)
- ⚠️ **Potential issue**: If `chordHistory` grows unbounded, state updates become expensive
- ✅ **Already capped**: `setChordHistory(h => [data, ...h].slice(0, 12))` — capped at 12 items

**WebSocketManager (`WebSocketManager.tsx`)**:
- Renders null — no UI cost ✅
- Effect re-runs on `[isAuthenticated, token]` change — correct ✅

---

## 4. Memory Leak Audit

### Socket.IO Listeners
```typescript
// analysis/[songId].tsx
useEffect(() => {
  if (!socket) return;
  socket.on("analysis:complete", handler);
  return () => socket.off("analysis:complete", handler);
}, [socket, songId]);
```
✅ Cleanup registered correctly.

```typescript
// useLiveChords.ts
socket.on("live:chord-detected", handleChord);
return () => socket.off("live:chord-detected", handleChord);
```
✅ Cleanup registered correctly.

### Audio Recording Loops
Both `useTunerEngine.ts` and `useLiveChords.ts` use `activeRef` to break the recording loop:

```typescript
const activeRef = useRef(false);
// in loop:
while (activeRef.current) { ... }
// in cleanup:
useEffect(() => { return () => { activeRef.current = false; }; }, []);
```
✅ Correct pattern — loop terminates when component unmounts.

### Temp Audio Files
Both loops call:
```typescript
FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
```
✅ Temp files cleaned up after each chunk.

### Potential Leak: Notifications Timer
`refetchInterval: 30_000` on notifications query — stopped by React Query when screen is unmounted. ✅ No leak.

---

## 5. Audio Processing Performance

### Tuner (useTunerEngine.ts)
- **Chunk size**: 90ms
- **Operation**: base64 decode → WAV parse → NSDF autocorrelation
- **Bottleneck**: NSDF is O(n²) in naive form; current implementation uses nested loops
- **Signal length at 22050 Hz, 90ms**: ~1984 samples
- **NSDF iterations**: 1984 × (2000 - 11) ≈ 3.9M multiplications

On a modern mobile CPU this takes ~5–10ms. With 90ms chunks, this is ~6–11% CPU utilization.

**Optimization available**: Use FFT-based autocorrelation (O(n log n)) if CPU usage is too high on older devices.

### Live Chord Capture (useLiveChords.ts)
- **Chunk size**: 500ms — less frequent, lower CPU impact
- **Operation**: base64 → WAV parse → Float32 → Socket.IO emit
- **Network**: Each 500ms chunk at 22050 Hz, 16-bit = ~44KB per emission
- ✅ Acceptable for WiFi; may degrade on weak cellular

---

## 6. Backend Performance

### Prisma Query Patterns

| Query | Index | Status |
|-------|-------|--------|
| `findMany songs by userId` | userId (implicit) | ⚠️ No explicit index on userId for songs |
| `findMany notifications by userId` | `@@index([userId, createdAt(sort: Desc)])` | ✅ |
| `findMany community feed` | `@@index([likesCount(sort: Desc)])` | ✅ |
| `findFirst RefreshToken by tokenHash` | `@@index([tokenHash])` | ✅ |

**Recommendation**: Add `@@index([userId])` on Song model in schema.

### N+1 Query Risk

`GET /community/feed` — if songs are included in posts, each post could trigger a separate song query. Verify `community.service.ts` uses `include` or `select` to batch.

### BullMQ Worker

- **Concurrency**: 2 jobs at a time — adequate for early beta
- **Job timeout**: 10 minutes (AbortSignal.timeout)
- **removeOnComplete**: last 100 jobs kept — prevents Redis bloat ✅

---

## 7. Bundle Size (Mobile)

Libraries adding significant bundle weight:
| Library | Size | Notes |
|---------|------|-------|
| `react-native-reanimated` | ~2MB | Required for animations |
| `@shopify/flash-list` | ~0.3MB | ✅ Used for community feed |
| `socket.io-client` | ~0.4MB | |
| `axios` | ~0.2MB | |
| `expo-av` | ~1MB | Required for audio |
| `expo-camera` | ~1.5MB | Only used for profile photo — consider lazy import |

**Total estimated JS bundle**: ~8–12MB (acceptable for music app)

---

## 8. Optimization Recommendations

| Priority | Recommendation | Effort |
|----------|----------------|--------|
| 🟡 HIGH | Add `@@index([userId])` to Song in Prisma schema | 5 min + migration |
| 🟡 HIGH | Add `staleTime: 0` to notifications query | 5 min |
| 🟠 MEDIUM | Implement `useInfiniteQuery` for community feed | 2 hours |
| 🟠 MEDIUM | Lazy import `expo-camera` (only used in profile) | 1 hour |
| 🟢 LOW | FFT-based autocorrelation in tuner if CPU issues arise | 4 hours |
| 🟢 LOW | Chunk compression before WebSocket send (live chord) | 3 hours |

---

## Related Documents

- [../architecture/AI_SERVICE.md](../architecture/AI_SERVICE.md) — analysis pipeline performance notes
- [../deployment/MONITORING.md](../deployment/MONITORING.md) — how these numbers are observed in production
- [../README.md](../README.md) — documentation map
