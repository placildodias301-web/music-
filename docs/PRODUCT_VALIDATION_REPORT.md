# Wilsify AI — Product Validation & Future-Readiness Report

**Date:** 2026-08-15
**Scope:** Product/strategy audit, continuing from the corrected codebase documented in `docs/FINAL_AUDIT_REPORT.md`. No code was changed as part of this report.
**Method:** Every claim below is grounded in reading the actual source (`ai-service/services/*.py`, `ai-service/api/*.py`, `backend/src/routes|services|prisma`, `web-app/src/app`, `mobile_app/app|src`), not the docs or the pitch. Where I reasoned rather than verified (market sizing, cost bands, roadmap), I say so explicitly. Business/legal/market sections are informed judgment, not fact-checked claims — treat them as a starting analysis, not legal or financial advice.

---

## 1. Product Overview — What Wilsify AI Actually Is

Reading the code rather than the README: Wilsify AI is a **song analysis and practice platform** with a real DSP/MIR backend (librosa, basic-pitch, Demucs, music21), a Fastify API with auth/billing/credits, a Next.js web app, and an Expo mobile app. It is **not** a toy project — there's a working freemium credit system, three payment providers, email verification, a community feed, and an LLM-based tutor. It is meaningfully more built-out than a typical capstone project, but several headline "vision" features (transpose, MusicXML, exposed stems, real-time chord detection) are either unimplemented or implemented only on the backend with no user-facing path.

---

## 2. Feature Reality Matrix

| Feature | Intended | Actually Implemented | Tested | Production Ready | Problems |
|---|---|---|---|---|---|
| Song upload | Yes | **IMPLEMENTED** — `backend/src/routes/uploads`, R2/S3 storage | Unit-tested (backend) | Yes | — |
| Chord detection | Yes | **IMPLEMENTED** — `ai-service/services/chords.py` (670 lines): basic-pitch note extraction → template matching, tiered triad/7th/9th/11th/13th with amplitude-evidence gating for extensions | Not run end-to-end (no ML deps installed in this sandbox — see §Not Verified) | Likely, pending real-audio validation | Accuracy unverified on real songs; complexity noted below |
| Passing-chord detection | Implied | **NOT SEPARATELY IMPLEMENTED** — chord detector runs on fixed windows; no distinct "passing chord" vs. "structural chord" classification found | No | No | Would need beat-aligned segmentation + harmonic-function logic, not present |
| Key detection | Yes | **IMPLEMENTED** — `ai-service/services/key.py`: real Krumhansl-Schmuckler profile correlation, Camelot wheel mapping | Not run end-to-end | Likely | — |
| Tempo/BPM detection | Yes | **IMPLEMENTED** — `ai-service/services/bpm.py`: librosa onset-strength beat tracking with a real confidence heuristic | Not run end-to-end | Likely | — |
| Pitch analysis | Yes | **IMPLEMENTED** — `ai-service/services/pitch.py`: pYIN-based, note+cents output | Not run end-to-end | Likely | — |
| Tuner (web) | Yes | **IMPLEMENTED** — `web-app/src/hooks/useWebTuner.ts` + 4 components (~390 lines), Web Audio API autocorrelation | Typechecked, per prior audit | Plausible; live-mic behavior not testable in sandbox | — |
| Tuner (mobile) | Yes | **IMPLEMENTED** — `mobile_app/src/tuner/useTunerEngine.ts` (155 lines), shares algorithm with web via `packages/shared/src/tuner` | Typechecked | Plausible; not device-tested | — |
| Audio playback | Yes | **IMPLEMENTED** — standard `<audio>`/expo-av usage | Not runtime-tested | Likely | — |
| **Transpose** | Yes (core vision item) | **NOT IMPLEMENTED** — zero matches for "transpos" anywhere in the codebase (backend, web-app, mobile, ai-service) | N/A | No | This is listed in the product vision as a core capability but does not exist in any layer |
| Sheet music generation | Yes | **IMPLEMENTED** — `ai-service/services/sheet.py` (226 lines): music21 → LilyPond → PDF/PNG, wired through `analyze.py` → backend `analysis.service.ts` → web-app download button | Not runtime-tested (requires LilyPond binary, not present in sandbox) | Only with LilyPond installed on the server — external native dependency | Sheet output is a rendered PDF, not editable notation |
| **MusicXML export** | Yes (core vision item) | **NOT IMPLEMENTED** — zero matches for "musicxml" anywhere in the project, despite music21 (already a dependency) supporting MusicXML export natively | N/A | No | Would be a comparatively small addition given music21 is already in use for sheet.py |
| MIDI export | Yes | **IMPLEMENTED end-to-end** — `ai-service/services/midi.py` (music21/pretty_midi voicing) → `analyze.py` → `analysis.service.ts` (`midiUrl`/`midiReady` in Prisma `Analysis` model) → web-app `DownloadBtn` | Backend unit-tested; not runtime-verified | Yes, architecturally complete | Genuinely one of the more finished features |
| Stem separation | Yes | **PARTIALLY IMPLEMENTED — backend only.** `ai-service/services/stems.py` runs real Demucs (htdemucs) as a subprocess and is invoked from `analyze.py` when `include_stems=true`. But the Prisma `Analysis` model has **no stem URL fields**, and no frontend code (web or mobile) references stem output. Stems are computed and then have nowhere to go. | No | No | Silent dead-end: real compute cost with no user-visible output. Either wire it up or gate it off until it is. |
| Live/real-time chord detection | Yes | **PROTOTYPE, explicitly unwired.** `ai-service/api/realtime.py` has a working chord-from-audio-chunk endpoint, but its own docstring says: *"Phase 4 will wire the actual WebSocket flow. For now this endpoint is fully implemented and tested in isolation so it's ready to integrate."* Mobile's `app/live/index.tsx` is 99 lines — a shell. | Isolated tests only (per file docstring) | No | This is the most honestly self-documented gap in the codebase — trust it |
| AI theory tutor | Yes | **IMPLEMENTED** — `ai-service/services/tutor.py`: real Claude-primary/OpenAI-fallback chat with music-context system prompt; routes exist in both backend (`routes/tutor`) and mobile (`app/ai-tutor/[songId].tsx`) and web (`(dashboard)/tutor`) | Not runtime-tested (needs live API key) | Architecturally yes | Cost driver — see §Cost Model |
| Difficulty rating | Not in original list, found in code | **IMPLEMENTED** — `ai-service/services/difficulty.py`: BPM + chord-complexity + variety + change-rate composite score, 0–10 with labels | Not runtime-tested | Likely | Nice unadvertised feature — could be marketed more |
| Practice tools (loop, slow-down, sections) | Yes | **NOT IMPLEMENTED** — `mobile_app/app/practice/` contains only `.gitkeep`; no equivalent in web-app | N/A | No | Currently a placeholder route, nothing behind it |
| Community | Yes | **PARTIALLY IMPLEMENTED** — real backend (`community.service.ts`, `CommunityPost`/`PostLike` Prisma models, ~130 lines of route+service code) and a mobile tab; feature is basic (post/like) with no evidence of moderation, reporting, or ranking | Not runtime-tested | Basic version only | Fine as an MVP community feature, not a fleshed-out social layer |
| Auth (register/login/verify/reset) | Yes | **IMPLEMENTED** — full flow: `RefreshToken`, `PasswordReset`, `EmailVerification` Prisma models, corresponding routes and web-app pages | Unit-tested per prior audit | Yes | — |
| Billing / subscriptions | Not in original feature list, found in code | **IMPLEMENTED** — Stripe, Razorpay, Apple, and Google payment providers (`backend/src/payments/`), `Subscription` + `CreditLedger` Prisma models, plan-based monthly credit top-ups (`PLAN_CREDITS`) | Not runtime-tested (needs live provider keys) | Architecturally mature | This is significantly more built-out than most college/portfolio projects reach |
| Indian music (raga/sargam/Carnatic/Hindustani) | Discussed as future differentiator | **NOT IMPLEMENTED** — zero matches for raga, sargam, Carnatic, Hindustani, or swara anywhere in the codebase | N/A | No | See §15 below |

**Read on the whole matrix:** the *deterministic and infrastructural* half of the product (auth, billing, credits, upload, MIDI export, sheet PDF, tuner, AI tutor) is genuinely production-grade. The *ambitious MIR/interaction* half (transpose, MusicXML, exposed stems, live chord detection, practice tools) ranges from missing to backend-only. That split is the single most important fact for prioritizing what to build next.

---

## 3–8. User Problem Validation & Journeys

Rather than restate all six personas abstractly, here's what the *actual* implementation supports end-to-end today vs. where it breaks:

| Persona | Can complete their core loop today? |
|---|---|
| **Beginner** | Partially. Upload → key/BPM/chords → tuner all work. "Learn a chord" has no dedicated instructional content; "practice slowly" (tempo-adjusted playback) doesn't exist. |
| **Student** | Partially. Analysis + difficulty score are real and useful for study. No slow-tempo practice, no exportable study material beyond MIDI/PDF sheet. |
| **Teacher** | Weak. No lesson-prep tooling, no student accounts/progress tracking, no arrangement generation beyond the fixed sheet-music pipeline. |
| **Singer** | **Broken at the second step.** Key detection works, but there is no transpose — so "detect key → pick a comfortable key → practice" cannot be completed. Pitch analysis (pYIN) exists and could support pitch feedback, but nothing in the UI surfaces it as a practice tool yet. |
| **Instrumentalist** | Mostly works: chord detection → chord display → sheet PDF → tuner. Missing: transpose, slow playback, section looping. |
< /br>
| **Producer** | **Breaks after analysis.** Tempo/key/chords work; stems are computed server-side but never delivered to the user; MIDI export works; MusicXML doesn't exist. A producer cannot currently get stems or MusicXML out of the product at all, despite the compute for stems already running. |

The **singer** and **producer** journeys are the two most clearly broken relative to their promised path — both fail on a feature that's either wholly absent (transpose) or computed-but-discarded (stems). Fixing the stems hand-off is a much smaller lift than it looks, since the hard part (running Demucs) already works.

---

## 9. The "Magic Moment"

Based on actual implementation quality, not marketing: **upload a song → get back key, tempo, chords, difficulty score, a downloadable MIDI file, and a rendered PDF chart, in one request** (`POST /:id/analyze`) is the real magic moment today. It's the most technically complete, most automated, and least dependent on features that don't exist yet.

The tutor chat is a close second technically (it works), but "AI chat about your song" is a much more commoditized magic moment than "upload → full musical breakdown + exportable chart," which is comparatively rare to see fully wired.

If forced to name the *strongest possible future* magic moment given the existing architecture: **stems + MIDI + sheet, delivered together as a "practice pack"** — this requires no new ML capability, only plumbing (Prisma fields + frontend links) for stems that are already being computed and thrown away.

---

## 10–11. Competitive Positioning & USP

| Capability | Wilsify AI | Typical chord app | Typical tuner | Typical sheet tool | DAW |
|---|---|---|---|---|---|
| Chord detection from audio | Yes | Yes (often their whole product) | No | No | Rarely, and usually a plugin |
| Key/BPM detection | Yes | Sometimes | No | No | Yes |
| Tuner | Yes (both platforms) | Rarely | Yes (their whole product) | No | No |
| MIDI export from audio | Yes | Rarely | No | No | Yes (but you supply the audio→MIDI step) |
| Sheet/PDF from audio | Yes | No | No | Yes (from MIDI/manual entry, not audio) | Plugin-dependent |
| MusicXML | **No** | No | No | Yes (core feature) | Sometimes |
| Transpose | **No** | Often yes | N/A | Yes | Yes |
| Stem separation delivered to user | **No (computed, not delivered)** | Rare | No | No | Plugin-dependent |
| AI theory tutor | Yes | No | No | No | No |
| Billing/credits/community | Yes | Varies | No | No | No |

**Current USP:** breadth — chord+key+BPM+MIDI+sheet+tuner+tutor in one authenticated product with billing, is not something any single competitor category offers together.
**Strongest technical differentiator:** the analyze pipeline (basic-pitch → chord templates → music21 → MIDI/PDF) is real MIR engineering, not a thin LLM wrapper.
**Strongest user-facing differentiator:** one-click "upload → full musical breakdown," if stems get wired up, becomes "upload → full breakdown + practice pack."
**Weakest area:** the singer/producer journeys, because transpose and stems delivery are missing — these are exactly the two audiences your competitive table suggests you're best positioned to win against dedicated chord/tuner apps.
**Feature that sounds impressive but isn't sufficiently implemented:** stem separation and live/real-time chord detection — both are real engineering work already done that currently produces zero user value.

---

## 12–13. AI Value Audit & Quality Risks

**Real ML/MIR:** chord detection (basic-pitch + template matching), key detection (Krumhansl-Schmuckler), stem separation (Demucs), pitch detection (pYIN), difficulty scoring (composite heuristic — arguably DSP-derived, not ML, but genuinely computed, not hardcoded).
**Real LLM use:** the AI tutor (Claude/OpenAI) — this is the one place a general-purpose LLM is used, and it's used appropriately (contextual coaching, not core music analysis).
**Normal software:** upload, playback, auth, billing, MIDI voicing rules (deterministic, not ML), sheet rendering (deterministic).

**Quality risks worth flagging in-product:**
- Chord detection complexity (9th/11th/13th chords gated by "amplitude-evidence") is exactly the kind of thing that will sometimes be wrong on real, noisy, or polyphonic audio — the tiering system in `chords.py` suggests the team is already aware of this and building in caution, which is a good sign.
- No confidence score is surfaced to the user anywhere in the reviewed frontend code for chords (BPM has a confidence field in `bpm.py`, but I found no equivalent exposed confidence for chords or key in the Prisma schema beyond raw values).
- No mechanism found for users to correct/flag wrong AI output (no "was this chord wrong?" UI or correction-storage table in Prisma).

**Recommendation (not yet built):** surface confidence for chords/key the same way `bpm.py` already computes it for tempo, and add a lightweight correction/feedback path — this is cheap relative to its trust payoff.

---

## 14. Music Theory Intelligence

What exists: key, scale, chord quality (up to 13th chords with evidence gating), Camelot wheel, difficulty scoring.
What doesn't exist: Roman numeral analysis, harmonic function, cadence detection, modulation detection, borrowed chords/secondary dominants, melody-chord relationship analysis.

**Highest-value next step:** Roman numeral / harmonic function labeling is the natural next layer — it's derivable from the chord + key data *already computed*, without new ML, and it's the single theory feature that would most differentiate Wilsify from "just a chord detector."

---

## 15. Indian Music Support

**Currently supported:** none. Zero code references to raga, sargam, Carnatic, Hindustani, or swara.
**Possible with current architecture:** partially. The chord-template-matching approach in `chords.py` is fundamentally Western-tonal (12-tone equal temperament, triad/7th/9th templates) and would not generalize to raga-based melodic systems, which aren't chord-driven. Pitch detection (`pitch.py`, pYIN-based) *could* be reused as a foundation for swara/microtone detection since it already does fine-grained Hz→cents conversion.
**Requires major research:** raga identification, tala (rhythm cycle) detection, and microtonal (shruti) analysis are each substantial MIR research problems on their own — this is not a "few weeks" feature.
**Categorization:** Future feature, and a genuinely differentiated one if pursued — but it should be scoped as its own research-and-build phase, not bolted onto the existing chord pipeline.

---

## 16. Accessibility

Not redesigning per instructions; flagging only. I did not find in this review: explicit ARIA labeling conventions, a documented color-contrast pass, or screen-reader-specific handling in the reviewed web-app components (tuner components are visual/canvas-heavy, which is typically the hardest case for screen readers). This needs a dedicated accessibility pass; I can't respond "IMPLEMENTED" or "NOT IMPLEMENTED" responsibly without a proper audit of every component, which is out of scope here — flagging as **NOT VERIFIED**, not "not implemented."

---

## 17–18. Educational Value

As an academic project, the codebase legitimately demonstrates: real MIR/DSP (librosa, pYIN, Krumhansl-Schmuckler), applied ML (basic-pitch, Demucs), full-stack engineering (Next.js/Fastify/Prisma/Postgres), mobile development (Expo/React Native), async job processing (Celery/Redis + BullMQ per `queue.service.ts`), third-party payment integration (4 providers), and LLM integration. This is a materially stronger portfolio/academic project than a CRUD app because the hard parts (signal processing, ML pipeline orchestration, cross-platform shared code via `packages/shared`) are real, not simulated.

For a strong presentation, prioritize documenting: the chord-template amplitude-evidence gating system (shows genuine algorithmic thinking beyond "call a library"), the shared-tuner-code architecture between web/mobile, and the async analyze pipeline (Celery/BullMQ + Prisma status tracking). Do not claim accuracy metrics you haven't measured — no chord/key/tempo accuracy benchmarking exists in this codebase; if presenting academically, either measure it against a small labeled dataset or explicitly state it as future work.

---

## 19–23. Business Model, Licensing, API, Cost Model

**Freemium is already built, not just planned** — `PLAN_CREDITS`, monthly top-ups, and a `CreditLedger` model exist. This is further along than most projects reach before considering monetization.

**Cost drivers (approximate bands, not measured dollar figures):**
- Demucs stem separation: **High** — CPU-bound, ~60–120s per track per the code's own comment in `stems.py`; currently pure cost with no revenue path since it isn't delivered to users.
- basic-pitch chord/note transcription: **Medium** — ONNX runtime (no GPU required per `requirements.txt` comment), but still real per-request compute.
- LilyPond sheet rendering: **Low–Medium** — subprocess-based, fast relative to Demucs.
- AI tutor (Claude/OpenAI): **Medium**, scales directly with usage — needs per-user rate limiting if not already enforced (I did not find tutor-specific rate limiting in the reviewed backend middleware; general rate-limiting existed per the prior audit's Fastify plugin review, but I didn't re-verify per-route limits for `/tutor`).
- Storage (R2/S3 for audio/MIDI/PDF): **Low–Medium**, grows linearly with users.

**API business:** chord/key/tempo/MIDI/sheet generation could realistically be exposed as a B2B API — the ai-service already has a clean internal REST boundary (`api/analyze.py`, secret-header-gated). This is a genuine future revenue line, but stems delivery would need to be fixed first to make the "full pipeline" API offer coherent.

---

## 24–25. Scalability

| Users | Likely bottleneck |
|---|---|
| 100 | None — current architecture (Fastify + Postgres + Redis + async workers) comfortably handles this |
| 1,000 | Demucs/basic-pitch CPU inference becomes the first real constraint if stem separation is turned on broadly; the code already runs analysis async via Celery/BullMQ, which is the right call |
| 10,000 | Need dedicated AI worker scaling (horizontal Celery workers), likely GPU for Demucs to keep latency reasonable, object storage egress costs start to matter |
| 100,000 | Full job-queue/worker separation from the API tier (already structurally close, given Celery is in use), CDN in front of audio/MIDI/PDF downloads, LLM tutor cost becomes a real budget line item requiring usage caps per plan |
| 1,000,000 | Out of scope to reason about credibly from this codebase alone — would need dedicated infra work not yet represented in the repo |

The architecture is already closer to "modular monolith + async workers" than a naive synchronous design — that's the right shape and doesn't need a rewrite. The main scaling risk is **compute cost of ML inference**, not the web/API layer.

---

## 26–30. Roadmap, Prioritization, What Not to Build, Retention, Monetization

**Recommended Phase 1 (fix before adding anything new):**
- **P0** — Wire up stem delivery (Prisma fields + frontend download links). The hard part is done; this is plumbing.
- **P0** — Implement transpose. It's advertised as core and touches the singer/instrumentalist journeys directly.
- **P1** — MusicXML export via music21 (already a dependency, already used for sheet.py — comparatively low effort for real differentiation vs. sheet-tool competitors).
- **P1** — Surface a confidence indicator + correction mechanism for chords/key (trust matters more than one more feature).

**Phase 2:** Roman numeral/harmonic-function analysis (derivable from existing data), practice tools (slow playback, section looping) to complete the beginner/student journeys.

**Phase 3 (premium):** Advanced AI tutor features, stems as a paid tier (the compute cost justifies gating it behind premium once delivered).

**Phase 4 (education):** teacher/student accounts, assignments, progress tracking — none of this exists yet and each is a real multi-week build (Prisma models, RBAC, dashboards).

**Phase 5 (creator/producer):** DAW-friendly exports, batch analysis, API access — natural once MusicXML/stems are user-facing.

**Phase 6 (platform):** public API productization.

**What NOT to build yet:** live/real-time chord detection (already prototyped but the WebSocket integration is nontrivial and the core "upload and analyze" loop isn't fully polished yet — finish that first), Indian music support (real research project, don't bolt it onto the current chord-template engine), a full social/community layer beyond the existing basic post/like.

**Retention:** the smallest useful mechanism given what exists is a simple practice-history/streak view built on data you already have (every analyzed song + timestamp is already in Postgres) — no new pipeline required.

**Monetization:** the existing credit system is a sound foundation; once stems are delivered, gating them (and unlimited MIDI/sheet exports) behind premium is a natural, already-scaffolded paywall — you don't need a new billing concept, just new gates on `CreditService`.

---

## 31–33. Legal, Privacy, Trust

- **YouTube download (`yt-dlp` in `requirements.txt`)**: this is present in dependencies. I did not find it wired into any API route in `ai-service/api/`, but if it's used anywhere for fetching third-party audio, that's a real copyright exposure point (downloading and processing copyrighted audio from YouTube) — flag for legal review specifically; don't ship a URL-based YouTube ingestion path without counsel input.
- Generated MIDI/PDF sheets derived from user-uploaded copyrighted songs raise standard derivative-work questions common to this entire product category — not unique to Wilsify, but worth a stated policy (e.g., "for personal practice use").
- **Privacy**: audio files, MIDI, and PDFs are stored in R2/S3 with URLs persisted in Postgres (`Analysis.midiUrl`, `Analysis.sheetUrl`) — I did not find an automatic deletion/retention policy in the reviewed code. Recommend adding one; audio of a user's voice/instrument is meaningfully personal.
- **Trust/transparency**: currently no UI distinction found between "AI detected" vs. "user confirmed" chord/key data — worth adding once a correction mechanism exists (see §12–13).

---

## 34. Product Metrics (recommended, not measured)

Activation: first completed analysis. Engagement: analyses/week, tutor messages/week. Retention: 7-day/30-day. Conversion: free→paid credit purchases/subscriptions. AI quality: rate of user-flagged incorrect chords (requires building the correction mechanism first — currently no way to measure this).

---

## 35. Final Product Scorecard

| Dimension | Score (1–10) | Justification |
|---|---|---|
| Problem importance | 7 | Real, recurring pain for musicians (no single tool does chord+key+tuner+export today) |
| User value | 6 | High for instrumentalists/beginners today; broken for singers/producers until transpose/stems ship |
| Innovation | 7 | The all-in-one pipeline (audio → chords/key/BPM/MIDI/sheet) in one request is genuinely uncommon |
| AI usefulness | 7 | Real MIR, not an LLM wrapper; tutor is a sensible, secondary LLM use |
| Technical complexity | 8 | Legitimate DSP/ML pipeline, async job architecture, multi-platform shared code |
| Academic value | 8 | Strong demonstration of full-stack + ML + mobile + payments in one coherent system |
| Commercial potential | 5 | Credit/billing infrastructure exists, but the two most monetizable outputs (stems, MusicXML) aren't user-facing yet |
| Scalability | 6 | Architecture shape is right (async workers); ML compute cost is the real long-term constraint |
| Competitive differentiation | 6 | Strong breadth advantage today; weakens if stems/transpose stay unshipped, since competitors already do those individually |
| Current implementation quality | 7 | Infra/auth/billing layer is production-grade; several headline MIR features are backend-only or absent |

---

## 36. Biggest Strengths

1. The core analyze pipeline (chord + key + BPM + MIDI + PDF sheet) is real, coherent, end-to-end working engineering — not a demo.
2. Billing/credits/auth infrastructure is more mature than the ML features it supports, which is an unusual and valuable imbalance for a project at this stage.
3. Shared tuner code between web and mobile (`packages/shared/src/tuner`) shows real cross-platform engineering discipline, not copy-paste duplication.
4. The chord-detection tiering system (amplitude-evidence gating for extended chords) shows the team is already thinking about false-positive risk, not just "get an answer out."
5. Async job architecture (Celery + BullMQ + Prisma status tracking) is the correct foundation for scaling ML compute — it doesn't need to be rebuilt later.

## 37. Biggest Weaknesses

1. Transpose — a headline vision feature — does not exist anywhere in the codebase.
2. Stem separation runs real, costly compute and then discards the result; it's currently pure cost with zero user value.
3. No MusicXML export despite music21 (which supports it) already being a dependency used for the sheet pipeline.
4. No confidence surfacing or correction mechanism for AI-detected chords/key — a trust gap for a product whose core value is "trust our detection."
5. Practice tools (slow playback, looping) — needed to actually complete the beginner/student journey — are unbuilt placeholders.

## 38. Biggest Risks

| Risk | Level |
|---|---|
| AI/chord-detection accuracy on real, noisy, or polyphonic audio | MEDIUM — the tiering system mitigates but doesn't eliminate this |
| Compute cost of Demucs/basic-pitch at scale, especially with no revenue tied to stems currently | HIGH |
| Copyright exposure if YouTube ingestion (`yt-dlp` dependency) is ever wired to a public-facing route | HIGH if activated, LOW today since I found no route using it |
| Feature-vision vs. implementation gap (transpose, MusicXML) undermining product credibility if marketed before built | MEDIUM |
| LLM tutor cost scaling with usage without confirmed per-route rate limiting | MEDIUM |
| Scalability of ML inference at 10k+ users without GPU infra | MEDIUM-HIGH, but not urgent at current stage |

---

## 39. Three-Year Vision (only if executed well — not a guarantee)

**Year 1:** Ship the P0/P1 gaps (stems delivery, transpose, MusicXML, confidence/correction UX) to make the existing vision actually match the existing code; validate with real users, especially the singer/instrumentalist journeys this closes.
**Year 2:** Education features (teacher/student, assignments) and premium gating around stems/exports, funded by the credit system already in place.
**Year 3:** Expose the analyze pipeline as a real B2B API (chord/key/tempo/MIDI/MusicXML), since the internal architecture (`ai-service` as a clean internal REST service) is already shaped for it.

---

## 40. Final Recommendation

**Is Wilsify AI a genuinely strong project idea?** Yes — the combination of real MIR/DSP engineering with production infrastructure (billing, auth, async jobs) is uncommon at this stage of a project.
**Is it academically strong?** Yes, clearly — see §17–18.
**Is it technically impressive?** Yes, particularly the chord-detection tiering and the shared cross-platform tuner code.
**Is it commercially viable?** Plausibly, but not yet — the two features with the clearest monetization story (stems, MusicXML/exports) aren't user-facing.
**What makes it different?** Breadth: no single competitor category (chord apps, tuners, sheet tools, DAWs) combines all of this in one authenticated, billed product.
**What is currently missing?** Transpose, MusicXML, stem delivery, practice tools, confidence/correction UX.
**What should I build next?** In order: stem delivery (cheapest, since Demucs already runs), transpose, MusicXML, confidence/correction UX.
**What should I NOT build yet?** Live/real-time chord detection, Indian music support, a full social layer, teacher/student ecosystem — all real future value, all premature relative to finishing the core loop.
**What should become the core feature?** "Upload → full musical breakdown + exportable practice pack (MIDI + sheet + stems)" — this is achievable almost entirely with plumbing on top of what already works.
**Biggest technical risk?** ML inference cost/accuracy at scale, particularly Demucs.
**Biggest business risk?** Shipping vision-language ("transpose," "MusicXML") in marketing/docs before the code supports it — this is already partially true in your own README/docs relative to the codebase and should be reconciled.
**What would make this stand out in a college evaluation?** The DSP/ML pipeline detail (chord tiering, Krumhansl-Schmuckler key detection, pYIN pitch tracking) — lead with that, not the CRUD/billing layer.
**What would make it attractive as a real startup?** Closing the stems/transpose/MusicXML gap turns "impressive demo" into "tool people would actually pay for," because it directly unblocks the singer and producer personas who are currently the worst-served.
