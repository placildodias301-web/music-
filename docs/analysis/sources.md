# Wilsify AI — Sources, Citations, and Verification Index

> **Point-in-time analysis.** Written before the 2026-10 documentation cleanup; it describes the project as analysed at that time and is not the source of current status. Current scope/status: [`MVP_PLAN.md`](../../MVP_PLAN.md); verification: [`../verification/FINAL_VERIFICATION_REPORT.md`](../verification/FINAL_VERIFICATION_REPORT.md).
> **Missing source files:** `docs/benchmark/RESULTS.md` and `docs/benchmark/ground_truth.json` are cited by this analysis but are **not present in the current tree and not in any Git history of `docs/benchmark/`**. The 17/19, 15/19 (leave-one-out) and 6/7 (held-out) key figures are recorded in [`docs/benchmark/README.md`](../benchmark/README.md) (the 89.5% = 17/19 percentage is derived from them); per-track ensemble output is in `docs/benchmark/ensemble_results.json`. The original results file could not be re-checked during the 2026-10-19 documentation cleanup, so treat the figures as reported, not re-verified.

**Project Title:** Wilsify AI — AI-Powered Music Learning, Audio Analysis, and Interactive Practice Platform  
**Companion Reports:** [`project_analysis.md`](./project_analysis.md) | [`requirements.md`](./requirements.md) | [`feasibility_and_risks.md`](./feasibility_and_risks.md)

This document catalogs every external web reference (`[VERIFIED FROM WEB SOURCE]`), internal repository file (`[VERIFIED FROM MY CODE]`), and analytical assumption (`[ASSUMPTION/RECOMMENDATION]`) used to produce the Wilsify AI Project Analysis deliverables.

---

## 1. External Web Sources (`[VERIFIED FROM WEB SOURCE]`)

All external claims regarding existing commercial and open-source music systems (Section 2 of [`project_analysis.md`](./project_analysis.md)) were verified against official product websites, help documentation, and official GitHub repositories:

| # | System / Technology | Official URL / Citation | Exact Facts Verified from Source |
| :-: | :--- | :--- | :--- |
| **W-01** | **Chordify** (Official Website & User Guide) | • [https://chordify.net](https://chordify.net)<br>• [https://chordify.net/pages/how-to-use-chordify](https://chordify.net/pages/how-to-use-chordify) | Verified that Chordify extracts chords and beat grids from uploaded audio files and streaming links (YouTube, SoundCloud); provides animated guitar, ukulele, and piano views; and restricts tempo slowdown, section looping, capo/transpose, MIDI export, and PDF chord downloads to paid Chordify Premium subscribers. |
| **W-02** | **Moises.ai** (Official Platform & Features Page) | • [https://moises.ai](https://moises.ai)<br>• [https://moises.ai/features/](https://moises.ai/features/) | Verified that Moises provides cloud-based AI audio stem separation (vocals, drums, bass, guitar, piano, other), AI chord detection, key/BPM detection, pitch changer, smart metronome, speed changer, and lyric transcription across web/mobile/desktop, with monthly upload quotas on its free tier and no vector A4 guitar-diagram lead-sheet PDF or Standard MIDI chord progression exporter. |
| **W-03** | **Ultimate Guitar** (Official Platform) | • [https://www.ultimate-guitar.com](https://www.ultimate-guitar.com) | Verified that Ultimate Guitar operates a catalog of 2,000,000+ community and official tabs/chord sheets with chord transposition, a "Simplify" chord toggle, autoscroll, and Pro interactive playback, but does not accept arbitrary user-uploaded audio/video files for automated signal-processing chord extraction. |
| **W-04** | **Yamaha Chord Tracker** (Official Product Documentation) | • [https://usa.yamaha.com/products/apps/chord_tracker/index.html](https://usa.yamaha.com/products/apps/chord_tracker/index.html) | Verified that Yamaha Chord Tracker is a mobile-only application (iOS and Android) that analyzes local unencrypted audio files stored on a user's mobile device to display chord sequences, transpose keys, and adjust tempo, without supporting video files, web browsers, DRM streaming tracks, stem separation, lyric alignment, or PDF export. |
| **W-05** | **Spotify Basic Pitch** (Official App & GitHub Repository) | • [https://basicpitch.io](https://basicpitch.io)<br>• [https://github.com/spotify/basic-pitch](https://github.com/spotify/basic-pitch) | Verified that Basic Pitch is an open-source (`Apache-2.0`) lightweight neural network by Spotify's Audio Intelligence Lab for polyphonic, instrument-agnostic audio-to-MIDI note transcription with pitch-bend estimation, outputting note-level MIDI rather than named harmonic chord progressions, key/BPM/meter lead sheets, or practice tools. |

---

## 2. Internal Repository Files Inspected (`[VERIFIED FROM MY CODE]`)

Before writing any analysis section, 60+ files across the `reyhanamando35/wilsify-ai` (`wilbur` branch) repository were directly inspected. The table below documents each major file and the exact facts verified from it:

### 2.1 Root Documentation & Configuration
| Repository File Path | Facts Verified from Codebase |
| :--- | :--- |
| `README.md` | Verified high-level project architecture, feature summary, and repository structure. |
| `INSTALLATION.md` | Verified software prerequisites: Node.js 20+, Python 3.10+ (3.11+ recommended), `ffmpeg`, Supabase URL/Key setup, and optional `GEMINI_API_KEY`. |
| `LICENSE` | Verified MIT License (Copyright 2026) and the two project authors: **Reyhan Amando** and **Wilbur Nathan Fernandes**. |
| `SPONSOR_DEMO.md` & `SPONSOR_CHEATSHEET.md` | Verified end-to-end demonstration flow, core talking points, and target user personas. |

### 2.2 Backend (`backend/`)
| Repository File Path | Facts Verified from Codebase |
| :--- | :--- |
| `backend/requirements.txt` & `backend/requirements-dev.txt` | Verified exact Python dependencies and version bounds (`fastapi>=0.110,<1.0`, `uvicorn[standard]>=0.29,<1.0`, `librosa>=0.10,<2.0`, `numpy>=1.24`, `soundfile>=0.12`, `scipy>=1.11`, `reportlab>=4.0,<6.0`, `mido>=1.3,<2.0`, `httpx>=0.27,<1.0`, `yt-dlp>=2025.1.1`, `PyJWT[crypto]>=2.8,<3`, `pytest>=8.0,<10.0`). |
| `backend/main.py` | Verified all 10 FastAPI endpoints (`/api/health`, `/api/analyze`, `/api/analyze/stream`, `/api/fetch-media`, `/api/youtube/search`, `/api/assistant`, `/api/export/midi`, `/api/export/pdf`, `/api/pitch-shift`, `/api/rights-attestation`), `MAX_UPLOAD_BYTES = 100 MB`, 14 supported audio/video extensions, 60 req/min per-IP rate limiting, startup `_warmup_analysis_engine` lifespan hook, Supabase JWKS JWT verification (`ES256`/`RS256`), NDJSON streaming with 10s heartbeats and cooperative cancellation, and `finally: cleanup(...)` temp file deletion. |
| `backend/models/schemas.py` | Verified Pydantic v2 schemas: `ChordSegment`, `DifficultyBreakdown`, `DifficultyInfo`, `AnalysisResult` (`analysisVersion = 2`), `AssistantRequest`, `AssistantResponse`, `MidiExportRequest`, `PdfExportRequest`, and `LeadSheetRequest`. |
| `backend/services/analysis_engine.py` | Verified the complete MIR pipeline: `ANALYSIS_SR = 11025`, `HOP = 256`, `BEAT_HOP = 128`, HPSS (`kernel_size=17`, `n_fft=1024`), tuning estimation, 36-bin/octave CQT `_on_pitch_chroma`, `40–180 Hz` `_bass_chroma`, 48 chord templates (`major`, `minor`, `7`, `m7`) with 4-harmonic overtone decay (`0.6`) and `SEVENTH_PENALTY = 0.035` + `_NO_CHORD`, 2-pass HMM Viterbi decoding (`SELF_TRANSITION = 0.985`, `KEY_PRIOR_PENALTY = 0.08`), Krumhansl-Kessler key detection + `0.35` tonic chord share, `_choose_tempo` (`110 BPM` Gaussian prior + harmonic cycle), and `estimate_meter` (`3/4` vs `4/4`). |
| `backend/services/difficulty.py` | Verified the weighted `0–100` difficulty formula (`40%` chord complexity outside `BEGINNER_OPEN_CHORDS`, `30%` chord-change rate, `20%` tempo, `10%` modulation proxy) and `Beginner (<35)`, `Intermediate (35–64)`, `Advanced (>=65)` thresholds. |
| `backend/services/assistant_engine.py` | Verified the 3-tier AI tutor: Google Gemini REST API (`gemini-flash-latest` primary, `gemini-flash-lite-latest` backup on HTTP 429/500/503, up to 4,000 chars of JSON song context and 20 history turns), deterministic song-grounded engine (`_grounded_answer`), and 12 regex music-theory rules (`RULES`). |
| `backend/services/audio_extract.py` | Verified fast-path `soundfile` decoding for `.wav/.flac/.ogg` and `ffmpeg` mono `22,050 Hz` PCM WAV extraction (`timeout=120s`) for compressed audio and video containers. |
| `backend/services/media_fetch.py` | Verified `_assert_public_host` DNS SSRF guard (`not ip.is_global`), `yt-dlp` platform list (`YTDLP_HOSTS`), 20-minute duration cap (`MAX_DURATION_SEC = 1200`), 100 MB file size cap, direct `httpx` streaming (up to 5 redirects), and `search_youtube` (`ytsearch{limit}:{query}`, up to 24 results). |
| `backend/services/pitch_shift.py` | Verified `ffmpeg` pitch shifting (`-12..+12` semitones) into 44.1 kHz AAC `.m4a` using `rubberband=pitch=...:formant=preserved` with automatic fallback to `aresample + asetrate + atempo`. |
| `backend/services/pdf_export.py` | Verified ReportLab A4 vector PDF lead-sheet generator (`build_lead_sheet_pdf`), bundled OFL fonts (`PlusJakartaSans`, `SpaceGrotesk`, `NotoMusic`), dark/light palettes, bar cells, pickup bars, loop brackets, and 6-per-row guitar fretboard diagrams. |
| `backend/services/midi_export.py` | Verified Mido Standard MIDI file creation (`480` ticks/beat, 4 beats/chord, `ROOT_MIDI_BASE = 48` C3, intervals for major, minor, `7`, and `m7`). |
| `backend/tests/test_*.py` | Verified backend unit and integration test suites (`test_api.py`, `test_analysis.py`, `test_difficulty.py`, `test_assistant.py`). |

### 2.3 Frontend (`frontend/`)
| Repository File Path | Facts Verified from Codebase |
| :--- | :--- |
| `frontend/package.json` | Verified exact frontend dependencies (`react@^19.2.8`, `react-router-dom@^7.18.2`, `@supabase/supabase-js@^2.117.3`, `tailwindcss@^4.3.3`, `typescript@~6.0.2`, `vite@^8.2.0`, `vitest@^5.0.3`, `oxlint@^1.75.0`). |
| `frontend/src/App.tsx` | Verified all public auth routes and protected `<Layout />` routes (`/studio`, `/upload`, `/analysis`, `/practice`, `/assistant`, `/tuner`, `/chords`, `/dashboard`, `/library`, `/song/:songId`, `/community`, `/tools`, `/settings/*`). |
| `frontend/src/lib/api.ts` | Verified frontend API client functions, NDJSON stream reader (`analyzeFileStream`), and `AnalysisResult` TypeScript types (including optional `v3` `CapoEstimate` and `PassingChord` interfaces). |
| `frontend/src/lib/mvpContext.tsx` | Verified global state management for active song analysis, audio object URLs, progress stages, library persistence, and Supabase cloud sync triggers. |
| `frontend/src/lib/authContext.tsx` & `supabase.ts` | Verified Supabase session lifecycle, Email/Password auth, Google/GitHub OAuth, and graceful handling when `.env` credentials are omitted. |
| `frontend/src/lib/cloudSync.ts` | Verified `hydrateFromCloud` and `syncLibraryToCloud` / `syncChatsToCloud` / `syncPracticeToCloud` against Supabase table `public.user_data`. |
| `frontend/src/lib/transpose.ts` | Verified enharmonic pitch transposition (`transposeChord`), scale-aware spellings, and `capoSuggestions()` ranking frets `0–7` by open-chord duration share. |
| `frontend/src/lib/chordTheory.ts` & `chords.ts` | Verified `33` chord qualities $\times$ `12` roots = `396` chord symbols (`ALL_CHORD_SYMBOLS`), open and CAGED barre guitar shapes, algorithmic guitar voicing solver (`findGuitarVoicings`), ukulele/keyboard/mallet/accordion/harp voicings, and Web Audio synthesis (`playChordVoicing`). |
| `frontend/src/lib/stemSeparation.ts`, `stemMixer.ts` & `components/analysis/StemMixer.tsx` | Verified both the active 2-stem phase-cancellation separator (`separateStems` in `stemSeparation.ts`, mounted on `Analysis.tsx`) and the 4-lane cascaded 24 dB/oct `BiquadFilter` mixer (`stemMixer.ts` + `StemMixer.tsx` + `stemMixer.test.ts`, prepared in repository). |
| `frontend/src/lib/tuner/*` & `pitchDetect.ts` | Verified the YIN fundamental frequency detector (`pitch.ts`, RMS gate `0.01`, threshold `0.15`), 10 instrument presets (`instruments.ts`), 7-pedal harp state machine (`harp.ts`), and reference tone synthesis (`tone.ts`). |
| `frontend/src/lib/song/*` & `pages/Song.tsx` | Verified lyric-chord alignment (`alignment.ts`), LRC parser/serializer (`lrc.ts`), triad chord simplifier (`simplify.ts`), original AI lyric generator (`aiLyrics.ts`), playback clock/cursor hooks, interactive Tap-Sync (`Song.tsx`), and local lyric persistence (`songStore.ts`). |
| `frontend/src/pages/Practice.tsx` & `hooks/useMetronome.ts` | Verified playback speed steps (`0.5x–1.5x`), lookahead Web Audio metronome (`25 ms` scheduler, `100 ms` lookahead), live microphone root-note accuracy checking, and `autoTempoEnabled` (`>= 70%` rolling 4s accuracy). |
| `frontend/src/lib/plans.ts` & `pages/settings/Plans.tsx` | Verified the 3-tier INR subscription and credit model (`Free ₹0`, `Pro ₹299/mo`, `Studio ₹699/mo`, 25% annual discount, credit costs) and beta non-charging notice. |
| `frontend/src/lib/community.ts` & `pages/Community.tsx` | Verified the `localStorage`-backed community feed prototype (`wilsify_community_v1`) seeded with 4 demo posts. |

### 2.4 Database Migrations & Benchmark Suite (`supabase/`, `docs/benchmark/`)
| Repository File Path | Facts Verified from Codebase |
| :--- | :--- |
| `supabase/migrations/0001_user_data.sql` | Verified active `public.user_data` table (`user_id`, `kind`, `id`, `data jsonb`, `updated_at`) and 4 RLS policies enforcing `auth.uid() = user_id`. |
| `supabase/migrations/0002_song_sheet.sql` | Verified prepared 7-table relational schema (`songs`, `song_analysis`, `song_sections`, `lyric_lines`, `lyric_words`, `chord_events`, `practice_sessions`) with RLS policies. |
| `docs/benchmark/README.md` (original `RESULTS.md` and `ground_truth.json` **missing from the tree**), `synth_validation.json` | Verified benchmark dataset (`TEST_001`–`TEST_020`), `17/19` (`89.5%`) key accuracy for the untuned 16-voter ensemble (`15/19` LOO-CV, `6/7` held-out test), and synthetic tempo/meter validation results. |

---

## 3. Summary of Analytical Assumptions & Recommendations (`[ASSUMPTION/RECOMMENDATION]`)

In compliance with the strict accuracy rules, the following items are explicitly categorized as analytical estimates or engineering recommendations rather than hard-coded runtime behaviors:

1. **Client & Server Hardware Sizing (`requirements.md` Section 3):** Minimum and recommended CPU/RAM/disk figures (`Dual-core 1.8 GHz / 4 GB RAM` client; `2–4 vCPU / 2–4 GB RAM` server) are engineering sizing recommendations derived from the memory footprint of Float32 PCM buffers and `librosa` CQT/Viterbi computations.
2. **12–16 Week Academic Timeline Allocation (`feasibility_and_risks.md` Section 1.4):** The 5-phase, 14-week milestone schedule reflects a standard 1-semester academic project distribution for the 2-developer team (`Reyhan Amando` & `Wilbur Nathan Fernandes`), confirmed with the project owner during requirements clarification.
3. **Production Licensing Recommendation for `yt-dlp` (`feasibility_and_risks.md` Section 1.5):** While `/api/fetch-media` enforces technical caps (`100 MB`, `20 min`, SSRF DNS guard), restricting `yt-dlp` to Creative Commons / user-owned media or licensed APIs is recommended before commercial SaaS deployment to ensure compliance with third-party streaming platform Terms of Service.
4. **Future Wiring of Prepared In-Repo Modules (`feasibility_and_risks.md` Section 2.2 & 2.3):** Mounting the completed 4-lane `StemMixer.tsx` component inside `Analysis.tsx` and connecting `songStore.ts` to the prepared `0002_song_sheet.sql` relational tables are recommended next steps for the post-MVP release.
