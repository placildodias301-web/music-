# TASK-10 Test Coverage — MVP core loop

How to run (full commands for Windows and macOS/Linux: [`../../INSTALLATION.md`](../../INSTALLATION.md) §7): backend `.\backend\venv\Scripts\python.exe -m pytest -q` · frontend (in `frontend/`) `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

**Status column** = result of the last run in the Linux sandbox. Nothing has been run on Windows yet (see [`FINAL_VERIFICATION_REPORT.md`](./FINAL_VERIFICATION_REPORT.md)).

Type key: **Unit** = one module's logic · **API** = real FastAPI app driven through HTTP (externals mocked) · **Component/route** = real `<App/>` rendered in jsdom with React Testing Library + userEvent; only Supabase (module boundary), the backend (XHR/fetch) and audio hardware APIs are faked.

## Backend — `backend/tests/test_api.py`

| MVP flow | Test | Type | What it verifies | Status |
|---|---|---|---|---|
| Request tracing | `test_request_id_*` | API | Generated UUID when absent; safe client ID preserved; 4 unsafe IDs replaced; ID returned **and logged** on error responses | Pass |
| Structured errors | `ERROR_CASES` table (18 parametrized cases) | API | Each bad request returns the expected status + `{"detail": …}` and never leaks internals (`LEAK_MARKERS`) | Pass |
| Upload validation | spoofed-media (5 files × 2 endpoints), empty, oversized | API | Fake audio / empty / >limit files are rejected before analysis runs | Pass |
| Upload cleanup | valid upload to stream endpoint | API | Temp files removed after success | Pass |
| YouTube validation | 24 bad URLs | API | Rejected with the downloader asserted **never called** | Pass |
| YouTube timeout | download + search timeout | API | User-safe 504 with the fallback message; YouTube fully mocked | Pass |
| Analysis progress | stream success | API | Ordered progress events, exactly one result, "completed" log | Pass |
| Analysis failure | stream failure | API | Error event, no result event, "failed" log | Pass |
| Analysis cancel | endpoint-level disconnect (raw ASGI driver) | API | Worker cancelled, `cancelled_by_client` logged, temp dir empty, no result sent, server recovers | Pass |
| Rate limit | 5 deterministic tests | API | Limit per bucket, window reset, 429 body; no real network | Pass |
| Hermeticity | autouse `_hermetic` fixture | API | No DNS, no real YouTube; rate-limit state reset per test | Pass |

Backend result: 146 passed.

## Frontend — logic (`frontend/src/lib/mvpCoreLoop.test.ts`)

| MVP flow | Test | Type | What it verifies | Status |
|---|---|---|---|---|
| Auth | hydrates stored session / no session | Unit | Real `createAuthController` → authenticated / unauthenticated | Pass |
| Auth | SIGNED_OUT event, stop() | Unit | User cleared, account data forgotten, listener unsubscribed | Pass |
| Auth | hung session check | Unit | Becomes retryable `timeout` state | Pass |
| Auth | `authMessage` mapping | Unit | Human messages for bad credentials, network, rate limit, unconfirmed email | Pass |
| Upload | `validateUploadFile`, `validateYouTubeUrl` | Unit | Missing/empty/oversized/unsupported rejected with specific text | Pass |
| Upload | `analyzeFile` (fake XHR) | Unit | Invalid file never sends; network failure → retryable `network` error; aborted signal cancels | Pass |
| Analysis persistence | `saveToLibrary` | Unit | Resolvable by id / file name / `file:` name; incomplete analysis refused; same file updates not duplicates | Pass |
| Analysis persistence | active-song restore | Unit | Survives refresh; corrupt or `blob:` refs fall back to empty state | Pass |
| Song sheet | transpose/capo/simplify | Unit | Persist on record; out-of-range rejected | Pass |
| Song sheet | lyrics by file name ↔ Library id | Unit | Saved under one key, found under the other | Pass |
| Practice | preferences + mic errors | Unit | Per-song round trip, invalid speed → 1x, corrupt data ignored, plain-language mic messages | Pass |

## Frontend — screens and routes

File: `frontend/src/components/coreLoopScreens.test.tsx`

| MVP flow | Test | Type | What it verifies | Status |
|---|---|---|---|---|
| Auth / protected route | signed-out visitor from 6 protected paths | Component/route | Redirected to `/login` with "Please sign in to continue."; no app shell | Pass |
| Auth / protected route | signed-in user | Component/route | Can open `/library`; session check shows loading screen, not content | Pass |
| Error handling | ErrorBanner (3 tests) | Component | Title, message, action, request ID, sanitized details (JWT/Bearer/path removed); Retry calls handler; warning is `status`; ErrorBoundary shows banner | Pass |
| Empty states | Library empty CTA; Return to Studio | Component/route | Correct copy; "Upload a Track" → `/upload` | Pass |
| Empty states | no active song; unknown `/song/:id` | Component/route | "No active song", Upload/Library links, disabled Practice Studio with reason | Pass |
| Song sheet | saved song without lyrics | Component/route | Chord sheet shown + "Add lyrics" CTA opens editor | Pass |
| Unfinished modules | Community | Component/route | "Coming soon"; no fake people, leaderboard, likes/follow/post | Pass |
| Unfinished modules | Plans | Component/route | "Coming soon" + free-MVP text; no buy/checkout/price controls | Pass |
| Cloud sync | Supabase failure | Component/route | Non-blocking "Cloud Sync Unavailable" status; Library still usable and unchanged; dismissible | Pass |
| Cloud sync | Supabase healthy | Component/route | No warning; local song pushed to account | Pass |
| Song sheet | lyrics `/song/current` → `/song/:id` and reverse (+refresh) | Component/route | Same lyrics visible from both routes | Pass |
| Song sheet | transpose + capo + simplify across refresh | Component/route | Restored after refresh; stored on Library record | Pass |

File: `frontend/src/pages/uploadAnalysisFlow.test.tsx`

| MVP flow | Test | Type | What it verifies | Status |
|---|---|---|---|---|
| Analysis | successful analysis | Component/route | Request shape (endpoint, `X-Source-Type`, file), rights attestation logged, navigates to `/analysis`, saved to Library, synced, survives refresh and `/song/current` restore | Pass |
| Analysis | server failure | Component/route | Error alert + Retry/Choose another; **nothing saved locally or in the cloud** | Pass |
| Analysis | connection closed with no result | Component/route | Reported; nothing saved | Pass |
| Analysis | user cancel | Component/route | XHR aborted, back to form, "Analysis cancelled.", nothing saved | Pass |
| Upload | rights not confirmed / unsupported / oversized | Component/route | Blocked client-side, no request sent | Pass |
| Backend offline | network error → Retry | Component/route | "Can't reach the Wilsify server" alert (analysis screen's own alert, not the `ErrorBanner` component); Retry sends a 2nd request and can succeed | Pass |
| Backend busy | HTTP 429 | Component/route | "The server is busy" + Retry | Pass |

File: `frontend/src/pages/practiceStudio.test.tsx`

| MVP flow | Test | Type | What it verifies | Status |
|---|---|---|---|---|
| Practice Mode B | no audio | Component/route | "Mode B: Chord Practice", "Re-attach audio file", no player; chords selectable | Pass |
| Practice Mode B | no song | Component/route | "No Active Song Loaded", Upload link, no Re-attach | Pass |
| Re-attach | valid file | Component/route | Switches to "Mode A: Full Audio Practice", player appears | Pass |
| Re-attach | different name | Component/route | Confirmation dialog; Cancel keeps Mode B; Attach switches | Pass |
| Re-attach | unsupported / empty / >100 MB | Component/route | Rejected with app validation message, stays Mode B, nothing attached, retry works | Pass |
| Practice settings | speed saved once | Component/route | One click → no endless save/reload loop (**defect fixed, see report**) | Pass |
| Practice settings | speed across refresh | Component/route | Speed badge restored after refresh | Pass |
| Cleanup | leaving Practice | Component/route | Metronome interval(s) all cleared, ≤1 active at any time; mic track stopped, mic AudioContext closed, analyser loop stops | Pass |
| Cleanup | audio pause on leave | Component/route | Audio element paused on unmount (**defect fixed, see report**) | Pass |
| Cleanup | return to Practice | Component/route | Exactly one scheduler after revisiting | Pass |
| Mic | stop / permission denied | Component/route | Tracks released; plain-language error, page usable | Pass |

## Other test files touched

| File | Change | Why |
|---|---|---|
| `frontend/src/lib/youtubeValidation.test.ts` | Added `// @vitest-environment node` | Test builds `new Response(new Blob())`; jsdom's Blob is incompatible with Node's `Response`. Assertions unchanged. |

## Known gaps

- Real browser, real Supabase, real audio output and real YouTube are not exercised (all faked at the boundary).
- Mic accuracy scoring with real pitch input is not tested (analyser returns silence).
- Stems, Assistant, Tuner, Dashboard and settings screens other than Plans have no new route tests.
- Backend-offline on Upload uses the analysis screen's alert, not `ErrorBanner`.
