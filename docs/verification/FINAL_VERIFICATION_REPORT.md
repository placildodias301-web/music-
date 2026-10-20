# Wilsify AI MVP — Final Verification Report (adversarially reviewed)

**Revision:** 3 (2026-10-18, 21:05 IST). Revision 2 corrected the first version after an adversarial re-check (§6 lists those corrections). Revision 3 adds a real demo-media run (§2A) and re-checks the live database.
**Code under test:** local commit `9202746` on `main` (on top of `f782027`). Neither commit was pushed when this revision was written; both have since been pushed to `origin/main` (head `937375d`, observed 2026-10-19). All automated evidence below was produced from an exact `git archive` of `9202746`, with a clean `npm ci` from the committed lockfile.
**Application code changed during this review:** none.
**File location:** moved on 2026-10-19 from the repository root to `docs/verification/` (documentation cleanup, see `DOCUMENTATION_AUDIT.md`); content otherwise unchanged. Companion test map: [`TEST_COVERAGE.md`](./TEST_COVERAGE.md). Setup: [`../../INSTALLATION.md`](../../INSTALLATION.md). Scope/status: [`../../MVP_PLAN.md`](../../MVP_PLAN.md).

### Evidence labels
- **AUTOMATED**: verified by an automated test that ran and passed on `9202746`.
- **MANUAL (sandbox)**: verified by a command or HTTP request run by hand in the Linux sandbox.
- **INSPECTION**: verified by reading the code or configuration only. Nothing was executed.
- **NOT VERIFIED**: no evidence exists yet.
- **BLOCKED**: cannot be verified until something outside the code changes (named in the row).

Every sandbox result is **Run in Linux sandbox**. Nothing in this report was run on Windows: **Not run — requires Windows/local verification**.

---

## 1. Automated gates (Run in Linux sandbox, commit `9202746`)

| # | Command | Expected | Actual | Result |
|---|---|---|---|---|
| A0 | `npm ci` (committed lockfile) | Installs cleanly | exit 0, 142 packages. The lockfile contains the Windows x64 native bindings (`@rolldown/binding-win32-x64-msvc`, `@oxlint/binding-win32-x64-msvc`, `lightningcss-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`). | PASS |
| A1 | `python -m pytest -q` (backend) | All pass | `146 passed, 17 warnings in 15.03s`: 145 in `test_api.py` and 1 in `test_analysis_engine.py`. None skipped (ffmpeg 6.1.1 present). The warnings are library deprecation warnings. | PASS |
| A2 | `npm test` | All pass | `Test Files 24 passed (24)`, `Tests 415 passed (415)`, exit 0 | PASS |
| A3 | `npm run typecheck` | 0 errors | `tsc -b --noEmit` exit 0 | PASS |
| A4 | `npm run lint` | 0 errors | exit 0. **0 errors, 30 warnings**: 19 `only-export-components`, 7 `set-state-in-effect`, 1 `preserve-manual-memoization`, 1 `purity`, 1 `no-unsafe-optional-chaining`. None of the warnings is in `Practice.tsx` or in the TASK-10 test files. | PASS (with warnings) |
| A5 | `npm run build` | Build succeeds | exit 0. JS `1,138.83 kB` (gzip `320.30 kB`), CSS `143.66 kB`. Vite warns about a chunk over 500 kB. Built without `.env`, so this proves compilation only. | PASS (with warning) |
| A6 | `npm audit --omit=dev` | 0 production vulnerabilities | `found 0 vulnerabilities` | PASS |
| A7 | `npm audit` | — | 1 high: `source-map-js 1.0.0–1.2.1`, dev-only and transitive | Known issue |
| A8 | Same commands in Windows PowerShell | Same as above | — | **NOT VERIFIED** (Not run — requires Windows/local verification) |

## 2. Live environment checks

| # | Check | Command / step | Actual | Label | Result |
|---|---|---|---|---|---|
| L1 | Backend starts and is healthy | `uvicorn main:app --port 8765`, then `curl -D - /api/health` | `200` `{"status":"ok","service":"wilsify-mvp-backend","mode":"real-analysis"}`, with the header `x-request-id: 75ad5755-…` (generated) | MANUAL (sandbox) | PASS |
| L2 | A supplied request ID is echoed and logged | `curl -H "X-Request-ID: smoke-verify-1" /api/health` | The response header echoes `smoke-verify-1`. The log line: `{"event":"http_access","request_id":"smoke-verify-1","method":"GET","path":"/api/health","status_code":200,…}` | MANUAL (sandbox) | PASS |
| L3 | An empty upload is rejected with a clear message | `curl -F file=@/dev/null;filename=empty.mp3 /api/analyze` | `400 {"detail":"File is empty. Please upload a non-empty audio or video file."}` | MANUAL (sandbox) | PASS |
| L4 | **Live Supabase project has the MVP schema** (re-checked 2026-10-18 21:0x IST) | Supabase project `wilsify-ai` (`jyvivwpb…`, the one `frontend/.env` points to): `select to_regclass('public.user_data')` and list the public tables | **`user_data` = NULL. The `public` schema has no tables.** Migration `0001_user_data.sql` has **not** been applied. | MANUAL (read-only SQL) | **FAIL (configuration)** |
| L5 | Live Supabase Auth has been used | `select count(*) from auth.users` | 1 user, 1 confirmed. Real sign-up and confirmation have worked at least once, but not necessarily on this commit. | MANUAL (read-only SQL) | Partial evidence |
| L6 | Supabase security advisors | `get_advisors(security)` | 3 warnings. (1) and (2): `public.rls_auto_enable()` is a `SECURITY DEFINER` function that `anon` and `authenticated` can execute; it does not come from this repo's migrations. (3) Leaked-password protection is disabled. | MANUAL | Known issue |

## 2A. Real demo-media analysis (Run in Linux sandbox)

**Method:**
- Copies of `TEST_007.mp4` and `TEST_003.mp4` were taken from `Analysis_demo folder`. The originals' MD5 sums were re-checked afterwards and are unchanged (`a0a338db…`, `df13c3fd…`); their sizes and modified times are also unchanged.
- Each copy was posted to `POST /api/analyze/stream` on a live `uvicorn` running commit `9202746`, with `X-Request-ID` and `X-Source-Type: file`.
- To test auto-save, the **recorded real NDJSON stream** was replayed through the real `<App/>` (jsdom; the network and Supabase are faked). This covered Upload → Analyze → Library → refresh → `/song/current`, in a throwaway test that is **not** in the repo.
- Temporary copies were deleted afterwards. The recorded streams are kept as evidence in the sandbox only.

| Field | TEST_007.mp4 | TEST_003.mp4 |
|---|---|---|
| Size / container | 3,595,604 B · H.264 + AAC · 32.46 s | 5,896,879 B · H.264 + AAC · 25.93 s |
| Upload / validation | Passed (`200`, `application/x-ndjson`) | Passed (`200`) |
| Stages observed | uploaded → decoding ×2 → separating → beats → chroma → chords → key → meter → result (progress 2→94, monotonic) | same |
| Heartbeat events | none. The run finished in under 1 s, and heartbeats only fire every 10 s, so heartbeats are still not exercised. | none (same reason) |
| Key | E Minor (confidence 1.00) | F Major (confidence 0.94; alternative A♯ Major 0.786) |
| BPM | 119.5 (`detected`) | 84.0 (`estimated`) |
| Meter | 4/4 | 3/4 |
| Chords (10 / 16 segments) | Em Am G B C D Em C D Em | F D# F A# F Gm D# Gm7 D# F A# F F D# A# F |
| Difficulty | Intermediate (44) | Advanced (74) |
| Processing time | 0.96 s server (`duration_ms 966.43`); about 1.0 s wall | 0.80 s server (`805.26`); about 0.84 s wall |
| Request ID | `demo-TEST_007-1792337560`: echoed in the header and present in `http_access` and `analysis_stream_complete` | `demo-TEST_003-1792337561`: same |
| Telemetry | `analysis_status: completed`, `failure_reason: null`, `file_size_bytes`, `source_type: file` | same |
| Errors / warnings | none for either file. One librosa `n_fft` UserWarning appeared at startup warm-up only. | none |
| Temp-file cleanup | 0 files left in the backend temp dir | 0 files left |
| Auto-save to Library (real app code, replayed stream) | Saved 1 record (`TEST_007.mp4`, E Minor, 119.5, 10 chords). Push to the fake account sync happened. Still listed after refresh. `/song/current` shows the chords and "Open Practice Studio". | Same, with 16 chords |
| Classification | **PASS** | **PASS** (the pipeline worked; see the accuracy note) |

**Accuracy note (informational, NOT VERIFIED).** The demo folder's `Wilsify_Analysis_Truth_Table.xlsx` reference columns marked "Verified" are empty, so the reference is unconfirmed, not ground truth.
- **TEST_007** matches the reference on every field: key E Minor, BPM 119.6, 4/4, and the identical chord sequence.
- **TEST_003** differs on three fields:

| Field | Reference | This run |
|---|---|---|
| Key | B♭ Major | F Major (B♭ Major was not offered as an alternative) |
| BPM | 155.4 | 84.0, flagged `estimated` |
| Meter | 4/4 | 3/4 |

That sheet's own earlier "Wilsify" run recorded 155 BPM for TEST_003, so the tempo or meter choice may have changed since. This is not classified as a defect: the reference is unverified, and the app marks the BPM as `estimated`. **Follow-up:** have a human confirm TEST_003's tempo and meter, then decide.

## 3. The 10-step acceptance loop

| Step | Flow | Exact step | Expected | Actual | Label | Result |
|---|---|---|---|---|---|---|
| 1 | Start backend | see L1 | Healthy, with a request ID | as L1 | MANUAL (sandbox) | PASS |
| 1b | Start frontend in a real browser | `npm run dev`, open `http://localhost:5173` | App loads | Only compilation is proven (A5). No browser was opened. | — | **NOT VERIFIED** |
| 2 | Sign up / log in | Real UI against the real project | Session; protected pages open | Faked Supabase: an unauthenticated user is redirected to `/login`, a signed-in user gets the page, "Checking your session" shows while hydrating, an 8 s hydration timeout is retryable, auth errors map to plain messages, and a `SIGNED_OUT` event unsubscribes and wipes data (`coreLoopScreens.test.tsx`, `mvpCoreLoop.test.ts`, `auth.test.ts`). The real project has 1 confirmed user (L5). | AUTOMATED (faked) + partial | PASS (automated); real sign-in on this commit **NOT VERIFIED** |
| 3 | Upload real demo media | `TEST_007.mp4` and `TEST_003.mp4` (copies) → `/api/analyze/stream` | Accepted and analysed | Both completed (§2A) | MANUAL (sandbox) | **PASS**. Upload through a real browser on Windows: **NOT VERIFIED** |
| 3a | Upload validation | — | Empty, oversized, unsupported and spoofed files are rejected | Backend: empty (L3), spoofed media (parametrised), and temp-file cleanup. UI: unsupported → "Invalid", over 100 MB → message, nothing is sent, and the rights checkbox is required. | AUTOMATED + MANUAL | PASS |
| 3b | YouTube | Search and fetch one real short video | Audio fetched | Only validation is tested: playlists/channels rejected, `javascript:`/`ftp:` rejected, live streams rejected, the timeout path and temp cleanup (all mocked). No real YouTube call. | AUTOMATED (mocked) | Validation PASS; live fetch **NOT VERIFIED** |
| 4 | Analysis with visible progress | — | Ordered stages, then a result; cancel stops it | Backend runs the **real** engine on synthetic chord audio: progress is ordered, the result has `["D","A","Bm","G"]`, failure produces an error event, and a disconnect cancels and cleans up. The UI shows progress and cancel against a faked stream. **Heartbeats: inspection only** (`main.py:656`); no test covers them. Real video decode was not exercised. | AUTOMATED + INSPECTION | **PASS**: synthetic tests plus two real MP4s (§2A). Heartbeat: INSPECTION only |
| 5 | Auto-saved to Library | — | Completed run saved once; failed or cancelled runs save nothing | `uploadAnalysisFlow.test.tsx` covers success → 1 record, plus failure, early close and cancel → 0 records. **The real TEST_007 and TEST_003 streams were replayed through the real app: each saved 1 record, which survived refresh (§2A).** | AUTOMATED + replay of real output | **PASS** (jsdom). Real browser: **NOT VERIFIED** |
| 5b | Synced to the account | Real project | A row in `public.user_data` | The upsert is verified only against the fake. **On the live project it cannot succeed: the table does not exist (L4).** | — | **BLOCKED**: apply migration 0001 |
| 6 | Refresh (F5) | Browser reload | State survives | The app is unmounted and re-rendered from storage (jsdom) for `/library`, `/song/current` and `/practice` | AUTOMATED (simulated) | PASS (simulated); real F5 **NOT VERIFIED** |
| 7 | Reopen from Library | Library → Open | `/song/:id` shows the song | The test clicks Library → Open → `/song/<id>`, and the lyrics are present | AUTOMATED | PASS |
| 7b | Direct `/analysis` after refresh | Open `/analysis` cold | The analysis renders | **No test renders `/analysis` cold.** The tests only reach it by navigation after an analysis. | — | **NOT VERIFIED** |
| 8 | Chords, lyrics, transpose/capo/simplify and Practice mode persist | — | Same values after refresh | Lyrics match both ways between `/song/current` and `/song/:id`, including after a refresh. Transpose, capo and simplify are restored. Practice Mode B works without audio. Practice speed survives a refresh. | AUTOMATED | PASS |
| 9 | Re-attach audio | — | Mode A; invalid file rejected | A valid file switches to Mode A. A file with a different name asks for confirmation, and Cancel keeps Mode B. An invalid file is rejected by the shared validator (`mvpCoreLoop.test.ts`). | AUTOMATED (fake audio) | PASS; real playback and mic **NOT VERIFIED** |
| 9b | Practice cleanup | Leave the page | Scheduler, audio and mic stopped; no duplicate interval | Covered, including the speed-loop regression (1 write) and a denied mic → plain message | AUTOMATED | PASS |
| 10a | Backend offline | Stop the backend, press Analyze | Clear, retryable error | Faked network error → `role="alert"` with the heading "Can't reach the Wilsify server" and a Retry button that succeeds on the second try; nothing is saved. A 429 → "The server is busy". | AUTOMATED (simulated) | PASS (simulated); real stopped server **NOT VERIFIED** |
| 10b | Supabase sync failure | — | Non-blocking warning; local Library usable | Faked sync error → warning, and the Library stays usable | AUTOMATED | PASS (with the live table missing, this is the path real users get today) |
| 10c | Analysis timeout | — | Clear error | Only the YouTube timeout path is tested. There is no test for the upload/read timeout (`main.py:414`). | INSPECTION | **NOT VERIFIED** |
| 10d | Coming soon | `/community`, `/settings/plans` | No fake data, no checkout | Covered | AUTOMATED | PASS |

## 4. Items from the QA brief that have no executed evidence

| Item | Status | Exact blocker | Next action |
|---|---|---|---|
| Real demo-media analysis | **DONE** (§2A) for 2 of the 20 files | — | Optional: run more files. Get human ground truth for TEST_003. |
| Cloud sync in production | **BLOCKED** | Re-checked 2026-10-18 21:0x IST: `public.user_data` is still missing on the live project | You run `supabase/migrations/0001_user_data.sql` in the SQL Editor (INSTALLATION §2.1), or explicitly approve me applying it through the Supabase connector |
| Real Windows browser 10-step loop | **NOT VERIFIED** | No results have been provided yet, and I have not driven a browser on your PC | You run it and send the results, or explicitly approve me driving the built-in browser on your PC |
| Windows command results | **NOT VERIFIED** | No Windows output has been provided. The connected device shell is a Linux VM, not PowerShell. | Run §8 in PowerShell and paste the summaries |
| Analysis heartbeat, upload read timeout, path traversal (`os.path.basename` at `main.py:345`), UUID temp names (`main.py:403`) | INSPECTION only | No test | Optional focused tests (test code only) |
| `aria-current` (AppShell), `aria-invalid`/`aria-describedby` (Upload, auth forms) | INSPECTION only | No test asserts them | Optional |
| Logs contain no secrets | Partial | `test_analyze_telemetry_logs_success_and_failure_reason` sends `Authorization: Bearer secret-token-value` and checks the logs | A broader audit was not done |

## 5. Defects found and fixed in TASK-10 (both approved)

| Defect | Reproduction | Fix | Regression test |
|---|---|---|---|
| Changing the Practice speed caused an endless save/reload loop | Change the speed. Before the fix, the test's write guard (limit 100) tripped. | Effect dependency changed to `[targetSongRef]` | "changing the playback speed saves it once…" |
| The audio was never paused on unmount (React clears the ref before cleanup) | Leave Practice while it is playing | Capture the element when the effect runs, and pause it in cleanup | "pauses the audio element when the user leaves the page" |

No new application defect was found during this review.

## 6. Corrections made to revision 1

1. **Lint was misreported.** Revision 1 said "4 pre-existing warnings". On the committed tree the result is **30 warnings** (0 errors). The earlier run used a sandbox copy that lacked `frontend/.oxlintrc.json`, so the React rules were not active. It was also wrong to call the warnings "pre-existing" without checking: several are in TASK-09 files committed in `9202746` (`ErrorBanner.tsx`, `Plans.tsx`, `Community.tsx`, `AppShell.tsx`).
2. **The evidence was not tied to the committed code.** Revision 1 used working copies. Everything has been re-run on an exact archive of `9202746`, with `npm ci`.
3. **Unsupported Supabase claim.** Revision 1 implied that the account sync path works. The live project has **no `user_data` table**, so real cloud sync fails today.
4. **Step 3 overstated.** "Upload a real audio file — PASS" was based on synthetic and faked audio. It is now BLOCKED, pending approval for demo media.
5. **Step 4 overstated.** Heartbeats were listed as verified but are inspection only. Real video decode was never exercised.
6. **Step 7 overstated.** A cold load of `/analysis` after refresh is not tested. It is now NOT VERIFIED.
7. **Step 9 wording.** The offline state is a `role="alert"` region with a Retry button. It is not the shared `ErrorBanner`, as revision 1 had claimed.
8. **"Lockfile generated on Linux" was a speculative risk.** It is now checked: `npm ci` is clean, and the Windows x64 bindings are in the lockfile.
9. Added the security advisories from the live project (L6).

## 7. Remaining known issues

1. **Migration 0001 is not applied on the live Supabase project.** This blocks cloud sync.
2. Supabase advisories: `rls_auto_enable()` is a `SECURITY DEFINER` function callable by `anon`, and leaked-password protection is off.
3. 30 lint warnings (0 errors).
4. A 1.14 MB JS bundle and a Vite chunk warning.
5. A dev-only `source-map-js` high advisory; 0 production vulnerabilities.
6. The Stem Splitter backend (`/api/stems/*`) is not implemented; the UI is a preview.
7. `0002_song_sheet.sql` is unused.
8. The rate limiter and the rights-attestation log live in memory, so they only work with a single backend instance.
9. Raw audio is never stored, by design: the file must be re-attached after a refresh.
10. The chord vocabulary is limited to major, minor, 7, m7 and N.
11. YouTube depends on the upstream service.
12. The upload error uses its own alert, not the shared `ErrorBanner`.
13. The items in §4.

## 8. Final status

**NOT READY** (unchanged in revision 3).

The checklist for **MVP READY**:

| Requirement | Status |
|---|---|
| `public.user_data` exists and cloud sync succeeds | **FAIL / BLOCKED**: the table is missing (re-checked) |
| At least one real demo file completes analysis and auto-saves | **PASS**: TEST_007 and TEST_003 (§2A; auto-save through the real app code in jsdom) |
| Full browser refresh / Library / Practice loop passes | **NOT VERIFIED**: no real-browser run |
| Backend and frontend suites pass on Windows | **NOT VERIFIED**: Linux only (all pass there) |
| Failure paths show clear user-facing errors | **PASS** (automated, simulated); a real stopped server is **NOT VERIFIED** |

No application defect is open.

**It becomes MVP READY WITH KNOWN LIMITATIONS once these three steps are done:**
1. Apply `0001_user_data.sql` to the live project and confirm `select count(*) from public.user_data;` runs.
2. Pass one real run of the 10-step loop on Windows using `TEST_007.mp4`, including F5, a cold `/analysis`, Practice re-attach and a stopped backend.
3. Run §1 on Windows and get the same results.

### Commands for Windows (PowerShell)
```powershell
cd C:\Users\wilbu\OneDrive\Desktop\wilsify-ai-mvp\wilsify-ai
.\backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt -r backend\requirements-dev.txt
.\backend\venv\Scripts\python.exe -m pytest -q backend
cd frontend
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```
Manual loop: Terminal 1 `cd backend; .\venv\Scripts\Activate.ps1; uvicorn main:app --reload --port 8000`. Terminal 2 `cd frontend; npm run dev`. Then follow `INSTALLATION.md` §6.
