# Wilsify AI — Complete Project Analysis Report

> **Point-in-time analysis.** Written before the 2026-10 documentation cleanup; it describes the project as analysed at that time and is not the source of current status. Current scope/status: [`MVP_PLAN.md`](../../MVP_PLAN.md); verification: [`../verification/FINAL_VERIFICATION_REPORT.md`](../verification/FINAL_VERIFICATION_REPORT.md).
> **Missing source file:** `docs/benchmark/RESULTS.md` and `docs/benchmark/ground_truth.json` are cited by this analysis but are **not present in the current tree and not in any Git history of `docs/benchmark/`**. The 17/19, 15/19 (leave-one-out) and 6/7 (held-out) key figures are recorded in [`docs/benchmark/README.md`](../benchmark/README.md) (the 89.5% = 17/19 percentage is derived from them); per-track ensemble output is in `docs/benchmark/ensemble_results.json`. The original results file could not be re-checked during the 2026-10-19 documentation cleanup, so treat the figures as reported, not re-verified.

**Project Title:** Wilsify AI — AI-Powered Music Learning, Audio Analysis, and Interactive Practice Platform  
**Repository:** `reyhanamando35/wilsify-ai` (Branch: `wilbur`) `[VERIFIED FROM MY CODE]`  
**Authors / Developers:** Reyhan Amando & Wilbur Nathan Fernandes (`LICENSE`) `[VERIFIED FROM MY CODE]`  
**Domain:** Web Application / Music Information Retrieval (MIR) & AI-Assisted Music Education `[VERIFIED FROM MY CODE]`

---

## Fact Classification Legend

To maintain strict research and quality-assurance integrity throughout this report, every factual claim, architectural capability, external comparison, and analytical projection is explicitly labeled using one of three tags:

- **`[VERIFIED FROM MY CODE]`** — Directly verified by inspecting the source code, SQL migrations, benchmark data, tests, and configuration files inside the `wilsify-ai` repository.
- **`[VERIFIED FROM WEB SOURCE]`** — Directly verified from official product documentation, academic/engineering publications, or official open-source repositories cited in [`sources.md`](./sources.md).
- **`[ASSUMPTION/RECOMMENDATION]`** — Analytical projections, academic schedule estimates, hardware sizing guidelines, or engineering recommendations where direct runtime enforcement is not yet present.

---

## 1. Problem Statement

### 1.1 Definition of the Core Problem
Learning to play a song from an audio or video recording is a fundamental activity for musicians, yet the workflow remains fragmented, slow, and technically intimidating `[ASSUMPTION/RECOMMENDATION]`. When a musician wants to learn an unfamiliar recording, an unindexed regional song, a live cover, or an original composition, they face four interconnected barriers:

1. **Manual Ear Transcription is Difficult and Time-Consuming:** Identifying musical key, tempo (BPM), meter (time signature), and time-stamped chord changes by ear requires years of ear-training and music-theory experience `[ASSUMPTION/RECOMMENDATION]`. Beginners and intermediate players frequently misidentify bass inversions, passing chords, or seventh extensions `[VERIFIED FROM MY CODE: backend/services/analysis_engine.py]`.
2. **Static Text Tabs Lack Audio Synchronization and Verification:** Crowd-sourced chord websites provide static text sheets that do not scroll in real time with the user's audio file, often contain inaccurate community transcriptions, and do not exist at all for unreleased demos, local recordings, or niche social-media clips `[VERIFIED FROM WEB SOURCE: Ultimate Guitar]`.
3. **Tool Fragmentation Across the Practice Workflow:** To learn and practice a single song effectively, a student typically has to switch between five or six separate utilities:
   - An audio-to-chord detector `[VERIFIED FROM WEB SOURCE: Chordify]`
   - A stem separator or EQ isolator to hear buried bass or guitar parts `[VERIFIED FROM WEB SOURCE: Moises.ai]`
   - A chord dictionary and capo calculator `[VERIFIED FROM MY CODE: frontend/src/pages/ChordLibrary.tsx, frontend/src/lib/transpose.ts]`
   - A time-stretching playback loop tool and metronome `[VERIFIED FROM MY CODE: frontend/src/pages/Practice.tsx]`
   - A chromatic instrument tuner `[VERIFIED FROM MY CODE: frontend/src/pages/Tuner.tsx]`
   - A music teacher or forum to ask why a chord progression works or how to simplify a difficult barre chord `[VERIFIED FROM MY CODE: backend/services/assistant_engine.py]`
4. **Lack of Closed-Loop Practice Feedback:** Most chord websites display chords passively on screen without listening to the student's instrument through the microphone to verify whether they are playing the right pitch on time `[VERIFIED FROM MY CODE: frontend/src/pages/Practice.tsx]`.

### 1.2 Why the Problem Matters
- **High Beginner Dropout Rate:** Novice guitarists, pianists, and ukulele players often abandon practice when a song uses unfamiliar barre chords (such as `F` or `Bm`) or moves too fast, without knowing that a simple capo placement or triad simplification would make the song immediately playable `[VERIFIED FROM MY CODE: backend/services/difficulty.py, frontend/src/lib/song/simplify.ts]`.
- **Accessibility of Music Education:** Private music tutoring is expensive and unavailable during solo daily practice sessions. Providing an AI tutor grounded in the exact key, BPM, chord timeline, and weak chords of the song the student is currently practicing bridges the gap between passive software tools and personalized instruction `[VERIFIED FROM MY CODE: backend/services/assistant_engine.py]`.
- **Preservation of Privacy and Copyright Compliance:** Musicians need a way to analyze personal recordings and study tracks without permanently uploading copyrighted audio files to public servers `[VERIFIED FROM MY CODE: backend/main.py, supabase/migrations/0001_user_data.sql]`.

### 1.3 Target Users (Who Faces This Problem)
1. **Beginner and Intermediate Guitarists, Pianists, and Ukulele Players:** Self-taught musicians who want to upload any audio/video file or paste a link, see synchronized chords above lyrics, simplify complex chord extensions (`maj7`, `m7`, `sus4`, `add9`) into basic triads, find optimal capo frets, and slow down playback while maintaining pitch `[VERIFIED FROM MY CODE: frontend/src/pages/Song.tsx, frontend/src/pages/Practice.tsx]`.
2. **Music Students Practicing Ear Training and Timing:** Learners who benefit from live microphone pitch verification, adaptive auto-tempo ramp-up (`+1 step` when rolling accuracy reaches $\ge 70\%$), and weak-chord tracking across sessions `[VERIFIED FROM MY CODE: frontend/src/pages/Practice.tsx, frontend/src/lib/practiceSession.ts]`.
3. **Music Teachers and Instructors:** Educators who need to quickly generate clean, printable A4 vector PDF lead sheets (with bar grids, chord diagrams, capo markings, and difficulty ratings) or Standard MIDI files for classroom instruction `[VERIFIED FROM MY CODE: backend/services/pdf_export.py, backend/services/midi_export.py]`.
4. **Hobbyist Songwriters and Cover Artists:** Musicians recording rough voice memos or demos who want instant harmonic analysis, key/BPM detection, original AI-generated lyric ideas matched to their chord progression, and multi-instrument chord voicings `[VERIFIED FROM MY CODE: frontend/src/lib/song/aiLyrics.ts, frontend/src/pages/ChordLibrary.tsx]`.

---

## 2. Existing System Analysis

To evaluate how Wilsify AI fits into the current landscape of Music Information Retrieval (MIR) and music-practice software, five established commercial and open-source systems were researched using official documentation and repositories `[VERIFIED FROM WEB SOURCE]`.

### 2.1 System 1: Chordify
- **Official / Source Link:** [https://chordify.net](https://chordify.net) | [https://chordify.net/pages/how-to-use-chordify](https://chordify.net/pages/how-to-use-chordify) `[VERIFIED FROM WEB SOURCE]`
- **Main Features:**
  - Automated chord and beat alignment from uploaded audio files or streaming links (YouTube, SoundCloud) `[VERIFIED FROM WEB SOURCE]`.
  - Synchronized four-beat measure grid with animated guitar, piano, and ukulele chord diagrams `[VERIFIED FROM WEB SOURCE]`.
  - Premium tier features include tempo adjustment (slow down/speed up), section looping, pitch transposition/capo views, PDF chord sheet download, and MIDI file export `[VERIFIED FROM WEB SOURCE]`.
- **Advantages:**
  - Large pre-indexed catalog of songs with fast browser-based playback `[VERIFIED FROM WEB SOURCE]`.
  - Simple visual beat grid suitable for beginners `[VERIFIED FROM WEB SOURCE]`.
- **Limitations:**
  - **Paywalled Core Practice Tools:** Essential practice utilities—including tempo slowdown, section looping, capo transposition, PDF lead-sheet export, and MIDI export—are locked behind a paid Chordify Premium subscription `[VERIFIED FROM WEB SOURCE]`.
  - **No Stem Isolation or Mixer:** Does not provide multi-band or phase-based stem separation inside the chord workspace `[VERIFIED FROM WEB SOURCE]`.
  - **No Interactive Pitch Verification or AI Tutor:** Does not listen to the user's microphone to grade chord accuracy, nor does it include a song-grounded conversational AI music tutor `[VERIFIED FROM WEB SOURCE]`.

### 2.2 System 2: Moises.ai
- **Official / Source Link:** [https://moises.ai](https://moises.ai) | [https://moises.ai/features/](https://moises.ai/features/) `[VERIFIED FROM WEB SOURCE]`
- **Main Features:**
  - AI audio stem separation (isolating vocals, drums, bass, guitar, piano, and other instruments into 2, 4, or 5+ tracks) `[VERIFIED FROM WEB SOURCE]`.
  - AI Chord Detection, Key Detection, Pitch Changer, Smart Metronome, Speed Changer, and AI Lyric Transcription across web, mobile, and desktop apps `[VERIFIED FROM WEB SOURCE]`.
- **Advantages:**
  - Industry-leading neural source separation for muting or soloing individual instrument stems `[VERIFIED FROM WEB SOURCE]`.
  - Modern multi-track studio interface with synchronized waveform playback `[VERIFIED FROM WEB SOURCE]`.
- **Limitations:**
  - **Strict Free-Tier Quotas:** The free plan restricts the number of monthly uploads, limits song duration, and restricts real-time chord display or advanced stem models `[VERIFIED FROM WEB SOURCE]`.
  - **No Printable Vector Lead-Sheet PDF or MIDI Chord Export:** Moises focuses on audio stem export rather than generating engraved A4 PDF lead sheets with guitar fretboard diagrams or Standard MIDI chord progression files `[VERIFIED FROM WEB SOURCE]`.
  - **No Built-in Multi-Instrument Chord Dictionary or Chromatic Tuner:** Lacks a dedicated 396-chord multi-instrument reference library (covering guitar, ukulele, keyboard, mallet, accordion, and harp) and a multi-instrument YIN chromatic tuner `[VERIFIED FROM WEB SOURCE]`.

### 2.3 System 3: Ultimate Guitar
- **Official / Source Link:** [https://www.ultimate-guitar.com](https://www.ultimate-guitar.com) `[VERIFIED FROM WEB SOURCE]`
- **Main Features:**
  - World's largest crowd-sourced and licensed catalog of guitar, bass, ukulele, and drum tabs and lyric-chord sheets (over 2 million tabs) `[VERIFIED FROM WEB SOURCE]`.
  - Built-in chord transposition, chord simplification ("Simplify" toggle), autoscroll, interactive chord diagrams, and Ultimate Guitar Pro multi-track tab playback `[VERIFIED FROM WEB SOURCE]`.
- **Advantages:**
  - Massive repository of human-transcribed lyrics aligned directly beneath chord symbols `[VERIFIED FROM WEB SOURCE]`.
  - Curated "Official" tabs created by professional transcribers `[VERIFIED FROM WEB SOURCE]`.
- **Limitations:**
  - **No Custom Audio/Video File Upload for Automated DSP Extraction:** Users cannot upload an arbitrary `.mp3`, `.wav`, `.mp4`, or personal demo recording to automatically extract key, BPM, and timed chord progressions `[VERIFIED FROM WEB SOURCE]`.
  - **Inconsistent Crowd-Sourced Accuracy:** Free community tabs frequently have wrong keys, missing passing chords, or unaligned timing `[ASSUMPTION/RECOMMENDATION]`.
  - **Export Restrictions:** Official tabs cannot be exported as raw MIDI or standard PDF files without subscription constraints `[VERIFIED FROM WEB SOURCE]`.

### 2.4 System 4: Yamaha Chord Tracker
- **Official / Source Link:** [https://usa.yamaha.com/products/apps/chord_tracker/index.html](https://usa.yamaha.com/products/apps/chord_tracker/index.html) `[VERIFIED FROM WEB SOURCE]`
- **Main Features:**
  - Mobile application (iOS and Android) that analyzes local audio files stored on a user's smartphone or tablet to extract a timed chord sequence `[VERIFIED FROM WEB SOURCE]`.
  - Displays guitar and keyboard chord voicings, supports key transposition and tempo adjustments, and integrates with Yamaha smart pianos/keyboards `[VERIFIED FROM WEB SOURCE]`.
- **Advantages:**
  - Free mobile utility with local on-device chord extraction and clean keyboard/guitar display `[VERIFIED FROM WEB SOURCE]`.
- **Limitations:**
  - **Mobile-Only Platform:** Available only on iOS and Android; there is no desktop or web application `[VERIFIED FROM WEB SOURCE]`.
  - **Format & Source Restrictions:** Only reads local unencrypted audio files on the device; does not accept video files (`.mp4`, `.mov`, `.mkv`), social/streaming URLs, or DRM-protected tracks `[VERIFIED FROM WEB SOURCE]`.
  - **No Stem Separation, Lyric Sync, PDF Export, or AI Assistant:** Provides only a basic chord chart without lyric alignment, stem mixing, printable PDF lead sheets, or an AI music-theory tutor `[VERIFIED FROM WEB SOURCE]`.

### 2.5 System 5: Spotify Basic Pitch
- **Official / Source Link:** [https://basicpitch.io](https://basicpitch.io) | [https://github.com/spotify/basic-pitch](https://github.com/spotify/basic-pitch) `[VERIFIED FROM WEB SOURCE]`
- **Main Features:**
  - Open-source, lightweight neural network developed by Spotify's Audio Intelligence Lab for automatic music transcription (AMT) `[VERIFIED FROM WEB SOURCE]`.
  - Converts polyphonic audio recordings into note-level MIDI files with pitch-bend estimation in the browser or via Python CLI/library `[VERIFIED FROM WEB SOURCE]`.
- **Advantages:**
  - Fully free, open-source (`Apache-2.0`), fast, and instrument-agnostic for converting polyphonic audio into raw MIDI notes `[VERIFIED FROM WEB SOURCE]`.
- **Limitations:**
  - **Note-Level MIDI Only (No Named Chord Timeline or Lead Sheets):** Basic Pitch outputs raw polyphonic MIDI notes rather than high-level harmonic chord labels (e.g., `Cmaj7`, `Am7`, `G7`), key signatures, BPM/meter estimates, or capo recommendations `[VERIFIED FROM WEB SOURCE]`.
  - **Not a Practice Platform:** Lacks chord diagrams, lyric synchronization, stem mixing, a tuner, practice speed/loop controls, and an educational tutor `[VERIFIED FROM WEB SOURCE]`.

### 2.6 Comparative Summary Matrix

| Capability / Feature | Chordify `[VERIFIED FROM WEB SOURCE]` | Moises.ai `[VERIFIED FROM WEB SOURCE]` | Ultimate Guitar `[VERIFIED FROM WEB SOURCE]` | Yamaha Chord Tracker `[VERIFIED FROM WEB SOURCE]` | Spotify Basic Pitch `[VERIFIED FROM WEB SOURCE]` | **Wilsify AI** `[VERIFIED FROM MY CODE]` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Custom Audio & Video Upload (`.mp3`, `.wav`, `.mp4`, etc.)** | Audio + Links | Audio + Video | No (Catalog only) | Local Audio only | Audio only | **Yes (14 Audio/Video formats + URLs)** |
| **Timed Chord, Key, BPM & Meter Detection** | Yes | Yes | Manual Catalog | Chords + Tempo | No (Raw MIDI notes) | **Yes (HMM Viterbi + Krumhansl-Kessler)** |
| **Confidence Scores & Alternative Chords** | No | No | No | No | Note confidence | **Yes (Per-chord `0..1` + runner-up)** |
| **Synced Chord-Over-Lyric Sheet + Tap-Sync** | No (Grid only) | AI Lyrics | Static / Pro Tab | No | No | **Yes (LRC + interactive tap-sync + AI lyrics)** |
| **Browser DSP Stem Separation / Mixer** | No | Cloud AI Stems | Pro Backing Tracks | No | No | **Yes (2-stem active UI + 4-lane DSP module)** |
| **Live Mic Pitch Verification & Auto-Tempo** | No | No | Practice Mic (Pro) | No | No | **Yes (YIN pitch detector + auto speed-up)** |
| **Multi-Instrument Tuner & 396-Chord Library** | Basic diagrams | Basic diagrams | Guitar/Ukulele/Piano | Guitar/Keyboard | No | **Yes (10 instruments + Harp + 396 chords)** |
| **Context-Aware AI Music Tutor** | No | No | No | No | No | **Yes (Gemini API + deterministic fallback)** |
| **Free Vector PDF Lead Sheet & MIDI Export** | Paid Premium | No | Restricted | No | MIDI only | **Yes (ReportLab A4 PDF + Mido MIDI)** |

---

## 3. Proposed System Analysis (Wilsify AI)

### 3.1 How Wilsify AI Improves on Existing Systems
Wilsify AI unifies Music Information Retrieval (MIR), browser-based Digital Signal Processing (DSP), interactive practice tools, and generative AI tutoring into a single privacy-preserving web platform `[VERIFIED FROM MY CODE]`:

1. **All-in-One Analysis-to-Practice Pipeline:** Unlike Spotify Basic Pitch (which outputs only raw MIDI notes) or Ultimate Guitar (which relies on pre-written text tabs), Wilsify AI accepts 8 audio formats and 6 video formats (plus public URLs and YouTube search) and transforms them into an interactive practice studio, a synchronized lyric-chord sheet, a printable vector PDF lead sheet, and a Standard MIDI file `[VERIFIED FROM MY CODE: backend/main.py, frontend/src/App.tsx]`.
2. **Transparent Harmonic Confidence & Alternatives:** Instead of acting as a black box, Wilsify AI's analysis engine (`analysisVersion: 2`) outputs a numerical confidence score (`0.0–1.0`) and a runner-up `alternative` chord for every detected chord segment, flagging segments below `0.45` confidence so musicians know where the harmony is ambiguous `[VERIFIED FROM MY CODE: backend/services/analysis_engine.py]`.
3. **Closed-Loop Microphone Practice with Adaptive Auto-Tempo:** During practice (`Practice.tsx`), Wilsify AI uses the YIN fundamental frequency algorithm (`frontend/src/lib/tuner/pitch.ts`) to compare the pitch class played into the user's microphone against the active chord's root note. When `autoTempoEnabled` is active and the player maintains $\ge 70\%$ rolling accuracy over a 4-second window (`16` samples at `250 ms`), the playback speed automatically advances to the next tier (`0.5x -> 0.75x -> 1.0x -> 1.25x -> 1.5x`) `[VERIFIED FROM MY CODE: frontend/src/pages/Practice.tsx]`.
4. **Song-Grounded Hybrid AI Music Tutor ("Ask Wilsify AI"):** The assistant receives the active song's structured metadata (`title`, `key`, `tonic`, `scale`, `bpm`, `timeSignature`, `difficulty`, `chords`, and logged `weakChords`) and uses a 3-tier fallback architecture: Google Gemini (`gemini-flash-latest` with `gemini-flash-lite-latest` backup), a deterministic song-grounded engine (`_grounded_answer`), and a 12-topic music-theory rule engine (`RULES`) `[VERIFIED FROM MY CODE: backend/services/assistant_engine.py]`.
5. **Privacy-First Ephemeral Media Processing:** Uploaded or fetched audio/video files are decoded into temporary working files, analyzed in memory, and immediately deleted inside `finally: cleanup(tmp_input_path, wav_path)` blocks (`backend/main.py`). Only lightweight JSON analysis metadata (`AnalysisResult`) is stored in `localStorage` and synced to Supabase (`public.user_data`) `[VERIFIED FROM MY CODE: backend/main.py, frontend/src/lib/cloudSync.ts]`.

### 3.2 Core Modules and Features (`VERIFIED FROM MY CODE`)

| Module Name | Primary Source Files | Core Capabilities & Active vs. Prepared Implementation Status |
| :--- | :--- | :--- |
| **1. Media Ingestion & URL Fetcher** | `frontend/src/pages/Upload.tsx`, `frontend/src/pages/Studio.tsx`, `backend/main.py`, `backend/services/media_fetch.py`, `backend/services/audio_extract.py` | Accepts local drag-and-drop uploads up to 100 MB (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.wma`, `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`), direct media URLs (`httpx` with DNS SSRF guard), social/video URLs (`yt-dlp` across YouTube, Instagram, TikTok, SoundCloud, Vimeo, etc.), in-app YouTube search (`/api/youtube/search`), and live browser microphone recording (`MediaRecorder`). Requires copyright attestation before upload. |
| **2. DSP & MIR Analysis Engine (`v2`)** | `backend/services/analysis_engine.py`, `backend/services/difficulty.py` | Resamples to 11,025 Hz; performs Harmonic-Percussive Source Separation (HPSS); estimates tuning offset; computes 36-bin/octave CQT chroma (`_on_pitch_chroma`) and bass chroma (`40–180 Hz`); runs 2-pass HMM Viterbi decoding over 48 chord templates (major, minor, `7`, `m7`) + `N` state; detects key via Krumhansl-Kessler profiles + tonic duration share; selects tempo via onset autocorrelation + harmonic cycle + Gaussian prior (`110 BPM`); estimates `4/4` vs `3/4` meter; scores difficulty (`0–100`, Beginner/Intermediate/Advanced). *Note:* Client-side `api.ts` also defines optional `v3` types (`CapoEstimate`, `PassingChord`), while capo fret ranking (`0–7`) is actively computed on the frontend via `capoSuggestions()` in `frontend/src/lib/transpose.ts`. |
| **3. Analysis Workspace & Stem Separation** | `frontend/src/pages/Analysis.tsx`, `frontend/src/lib/stemSeparation.ts`, `frontend/src/lib/stemMixer.ts`, `frontend/src/components/analysis/StemMixer.tsx` | Displays KPI cards (Key, BPM, Meter, Difficulty), interactive confidence-colored chord timeline, capo & transposition selectors (`-12..+12`), server-side formant-preserved pitch shifting (`/api/pitch-shift`), and guitar/piano chord diagrams. **Active vs. Prepared Stem UI:** `Analysis.tsx` currently mounts the 2-stem phase-cancellation separator (`separateStems`: Instrumental $L-R$ and Vocal/Center $(L+R)/2$). A full 4-lane Moises-style browser DSP mixer (`StemMixer.tsx` + `stemMixer.ts` using cascaded 24 dB/oct `BiquadFilter` stages for `Vocals & centre`, `Bass range`, `Highs`, and `Sides` with Mute/Solo/Volume and lock-step `StemPlayer`) is implemented and unit-tested (`stemMixer.test.ts`), ready to be mounted in `Analysis.tsx`. |
| **4. Synced Lyric-Chord Song Sheet** | `frontend/src/pages/Song.tsx`, `frontend/src/lib/song/*`, `frontend/src/components/song/*` | Renders chords positioned above specific lyric words synced to audio playback (`useSongCursor`, `usePlaybackClock`). Supports LRC timestamped lyrics, plain-text lyrics with interactive Tap-Sync (`Enter` key marks line start times during playback), AI-generated original lyrics (`aiLyrics.ts`), triad chord simplification (`simplify.ts`), section loop pills, autoscroll, and an embedded `AskWilsify` drawer. |
| **5. Interactive Practice Studio** | `frontend/src/pages/Practice.tsx`, `frontend/src/hooks/useMetronome.ts`, `frontend/src/components/TapTempo.tsx`, `frontend/src/lib/practiceSession.ts` | Provides variable speed playback (`0.5x` to `1.5x` with `preservesPitch`), A/B loop toggles, drift-free Web Audio lookahead metronome (`25 ms` scheduler, `100 ms` lookahead, `1000 Hz` downbeat / `800 Hz` beat clicks), Tap Tempo calculator, live microphone YIN pitch verification, adaptive Auto-Tempo ramp-up, and session logging (`PracticeSession` with `weakChords` persisted to `localStorage` and Supabase). |
| **6. Multi-Instrument Tuner & 396-Chord Library** | `frontend/src/pages/Tuner.tsx`, `frontend/src/pages/ChordLibrary.tsx`, `frontend/src/lib/chordTheory.ts`, `frontend/src/lib/tuner/*` | **Tuner:** Real-time YIN pitch detector (`30–2100 Hz`, RMS noise gate `0.01`, customizable `A4` reference) supporting Guitar (Acoustic/Electric), Bass, Ukulele, Violin, Mandolin, Piano, Harp (with 7-pedal lever state machine), and Chromatic modes, plus Web Audio reference tone generator. **Chord Library:** 33 chord qualities $\times$ 12 pitch roots = `396` chords with curated CAGED/open guitar voicings, algorithmic fretboard solver, ukulele shapes, keyboard/mallet/accordion inversions, harp chord views, and synthesized Web Audio strum playback. |
| **7. Hybrid AI Music Tutor ("Ask Wilsify AI")** | `frontend/src/pages/Assistant.tsx`, `frontend/src/components/song/AskWilsify.tsx`, `backend/services/assistant_engine.py` | Multi-chat interface and contextual drawer authenticated via Supabase JWT (`require_user`). Answers questions using Google Gemini (`gemini-flash-latest` / `gemini-flash-lite-latest`) injected with up to 4,000 characters of live song JSON context and 20 conversation history turns, falling back seamlessly to deterministic song-grounded answers (`_grounded_answer`) and 12 regex music-theory rules (`RULES`). |
| **8. Vector PDF & Standard MIDI Exporter** | `backend/services/pdf_export.py`, `backend/services/midi_export.py`, `frontend/src/components/LeadSheetModal.tsx` | **PDF:** Uses `reportlab` with bundled OFL fonts (`PlusJakartaSans`, `SpaceGrotesk`, `NotoMusic`) to generate A4 vector lead sheets in dark (`#0a0a0c`) or light (`#ffffff`) themes with bar cells, pickup bars, section headers, repeat brackets, and 6-per-row guitar chord diagrams. **MIDI:** Uses `mido` to export a Standard MIDI file (`480` ticks/beat, 4 beats/chord at detected BPM, octave 3 root `MIDI 48`). |
| **9. Auth, Library & Cloud Sync** | `frontend/src/lib/authContext.tsx`, `frontend/src/lib/cloudSync.ts`, `supabase/migrations/0001_user_data.sql`, `supabase/migrations/0002_song_sheet.sql` | Supabase Auth (Email/Password, Google OAuth, GitHub OAuth, password recovery). **Active vs. Prepared Schema:** `cloudSync.ts` actively syncs `library`, `chat`, and `practice` JSONB records to `public.user_data` (`0001_user_data.sql`) under Row-Level Security (`auth.uid() = user_id`). Migration `0002_song_sheet.sql` defines a normalized 7-table relational schema (`songs`, `song_analysis`, `song_sections`, `lyric_lines`, `lyric_words`, `chord_events`, `practice_sessions`) prepared for fine-grained relational persistence, while `songStore.ts` currently persists song lyrics in `localStorage`. |

### 3.3 Step-by-Step User Flow (`VERIFIED FROM MY CODE`)

1. **Authentication & Session Hydration:**
   - The user signs in via `/login` or `/signup` using email/password or Google/GitHub OAuth (`AuthContext`).
   - Upon login, `MvpContext` triggers `hydrateFromCloud(user.id)` (`frontend/src/lib/cloudSync.ts`), pulling the user's saved song analyses (`library`), AI chat threads (`chat`), and practice history (`practice`) from Supabase `public.user_data` and merging them with `localStorage`.
2. **Song Upload, Link Fetching, or Live Recording (`/studio` or `/upload`):**
   - The user selects a local audio/video file, searches YouTube via `/api/youtube/search`, pastes a media/social URL (`/api/fetch-media`), or records directly from their microphone.
   - The user checks the copyright ownership/permission attestation checkbox, which fires a non-blocking `POST /api/rights-attestation` audit log and starts `POST /api/analyze/stream`.
3. **Real-Time Streaming MIR Analysis:**
   - The frontend reads NDJSON progress events (`uploaded` $\rightarrow$ `decoding` $\rightarrow$ `separating` $\rightarrow$ `beats` $\rightarrow$ `chroma` $\rightarrow$ `chords` $\rightarrow$ `key` $\rightarrow$ `meter` $\rightarrow$ `result`).
   - When the final `AnalysisResult` arrives, `MvpContext` creates a local `Blob` object URL for audio playback, saves the metadata entry to `wilsify_library_v1`, syncs it to Supabase, and navigates to `/analysis` (or `/song/:songId`).
4. **Harmonic Exploration, Transposition & Stem Separation (`/analysis`):**
   - The user inspects the detected Key, BPM, Time Signature, and Difficulty badge (`Beginner`, `Intermediate`, `Advanced`).
   - Clicking any chord block on the timeline seeks the audio player to that timestamp and updates the interactive Guitar/Piano chord diagram.
   - The user tests capo placements (`0–7` frets) or transposes the harmony (`-12` to `+12` semitones), optionally clicking **Pitch Shift Audio** (`POST /api/pitch-shift`) to transpose the actual audio recording using `ffmpeg`.
   - The user runs browser-side stem separation (`separateStems`) to isolate vocals/center from the stereo instrumental backing.
5. **Synchronized Lyric-Chord Sheet & Simplification (`/song/:songId`):**
   - The user opens the full Song Sheet view, pastes plain lyrics (using interactive Tap-Sync to align line timestamps) or imports an `.lrc` file, or requests original AI-generated lyrics (`generateAiLyrics`).
   - The user toggles **Simplify Chords** (`simplify.ts`) to strip complex extensions (`7`, `m7`, `maj7`, `sus4`) down to beginner triads, or opens the **Ask Wilsify AI** drawer to ask song-specific theory questions.
6. **Guided Practice & Live Pitch Verification (`/practice`):**
   - The user slows down playback (`0.5x` or `0.75x`), enables the Web Audio lookahead metronome, sets a loop section, and enables the Microphone Pitch Detector (`YIN` algorithm).
   - As the song plays, Wilsify AI checks whether the note played by the user matches the active chord's root note, calculates a live accuracy percentage, automatically increments playback speed if `autoTempoEnabled` is active and accuracy is $\ge 70\%$, and logs `weakChords` when the session ends.
7. **Exporting Deliverables (`/analysis` / `LeadSheetModal`):**
   - The user exports a customized A4 vector PDF lead sheet (`POST /api/export/pdf`) or a Standard MIDI chord sequence (`POST /api/export/midi`) for offline study or DAW import.

### 3.4 Inputs, Processing Logic, and Expected Outputs (`VERIFIED FROM MY CODE`)

| Subsystem | Inputs | Processing Logic | Expected Outputs |
| :--- | :--- | :--- | :--- |
| **Audio/Video Analysis (`/api/analyze`, `/api/analyze/stream`)** | Multipart file upload ($\le 100\text{ MB}$; `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.wma`, `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`) | 1. Extract mono `22,050 Hz` WAV via `soundfile` or `ffmpeg`.<br>2. Resample to `11,025 Hz` (`HOP = 256`).<br>3. Run HPSS (`kernel_size=17`, `n_fft=1024`) to split `y_harm` and `y_perc`.<br>4. Estimate tuning & compute 36-bin/octave CQT `_on_pitch_chroma` + `40–180 Hz` `_bass_chroma`.<br>5. Track beats & choose BPM via onset autocorrelation + harmonic self-similarity cycle + Gaussian prior (`110 BPM`).<br>6. Decode 48 chord templates + `N` via 2-pass HMM Viterbi (`SELF_TRANSITION=0.985`, `KEY_PRIOR_PENALTY=0.08`).<br>7. Correlate chroma against Krumhansl-Kessler profiles + tonic chord share for Key.<br>8. Score `3/4` vs `4/4` meter and compute weighted Difficulty (`0–100`). | JSON `AnalysisResult`: `key`, `tonic`, `scale`, `keyConfidence`, `keyStatus`, `bpm`, `bpmConfidence`, `bpmStatus`, `timeSignature`, `timeSignatureConfidence`, `timeSignatureStatus`, `durationSec`, `chords[]` (`start`, `end`, `chord`, `confidence`, `uncertain`, `alternative`), `beats[]`, `downbeats[]`, `difficulty` (`label`, `score`, `rationale`, `breakdown`), `analysisVersion: 2`. |
| **Media URL Fetcher (`/api/fetch-media`)** | JSON `{"url": "https://..."}` | 1. Validate URL scheme (`http`/`https`) and run `_assert_public_host` DNS resolution to block non-global/private IPs (SSRF protection).<br>2. If domain matches `YTDLP_HOSTS`, invoke `yt-dlp` (`max_filesize=100MB`, duration $\le 1200\text{s}`, non-live).<br>3. Otherwise stream via `httpx` ($\le 5$ redirects, content-type check). | Binary audio/video `FileResponse` with `X-Media-Filename` and `X-Media-Title` headers; temporary server file deleted immediately via `BackgroundTask`. |
| **Formant Pitch Shift (`/api/pitch-shift`)** | Audio/video file + `semitones` integer (`-12..+12`, $\ne 0$) | Compute pitch factor $2^{\text{semitones}/12}$. Invoke `ffmpeg` with `rubberband=pitch=...:formant=preserved` filter if compiled into `ffmpeg`, otherwise fall back to `aresample=44100,asetrate=...,atempo=...`. Encode as 192 kbps AAC `.m4a`. | Pitch-shifted `.m4a` audio stream at original duration and tempo. |
| **AI Music Assistant (`/api/assistant`)** | Bearer Supabase JWT + JSON `{question, context, history}` | Verify JWT against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. If `GEMINI_API_KEY` is configured, call Gemini (`gemini-flash-latest`, fallback `gemini-flash-lite-latest`) with system prompt + 4,000-char song context + 20 history turns. Otherwise execute `_grounded_answer(q, context)` and regex `RULES`. | JSON `AssistantResponse`: `{question, answer, matchedTopic, isDemo}`. |
| **Lead Sheet PDF & MIDI Export (`/api/export/pdf`, `/api/export/midi`)** | JSON `LeadSheetRequest` or `MidiExportRequest` | **PDF:** Quantize chords into measure bars based on `bpm` and `timeSignature`, draw vector bar grid, section badges, repeat brackets, and 6-per-row guitar diagrams via `reportlab`.<br>**MIDI:** Map chord symbols to MIDI note numbers (`ROOT_MIDI_BASE=48` + intervals `[0,4,7]`, `[0,3,7]`, `[0,4,7,10]`, `[0,3,7,10]`) at `480` ticks/beat via `mido`. | Application/PDF file (`*-lead-sheet.pdf`) or Standard MIDI file (`*.mid`). |

---

## 4. Executive Summary of Companion Analysis Deliverables

In accordance with the modular deliverable structure of this project report, the remaining four sections are documented in full detail in their dedicated companion files and summarized below:

- **Section 4 — Feasibility Analysis** (Detailed in [`docs/analysis/feasibility_and_risks.md`](./feasibility_and_risks.md#1-feasibility-analysis-section-4)):
  - *Technical Feasibility:* Proven via working FastAPI + Librosa MIR pipeline (`89.5%` key benchmark accuracy on 19 labeled songs in [`docs/benchmark/README.md`](../benchmark/README.md); `RESULTS.md` is missing from the tree — see note at top) and React 19 + Web Audio API frontend `[VERIFIED FROM MY CODE]`.
  - *Economic Feasibility:* Zero-cost academic development stack using open-source libraries and free cloud tiers (Supabase Free, Gemini Free tier), paired with a credit-based SaaS pricing model (`Free ₹0/mo` with 50 credits, `Pro ₹299/mo` with 2,500 credits, `Studio ₹699/mo` with 5,000 credits, 25% annual discount in `frontend/src/lib/plans.ts`) `[VERIFIED FROM MY CODE]`.
  - *Operational, Time, and Legal/Ethical Feasibility:* Designed for a 2-developer team over a 12–16 week semester (`LICENSE`), enforcing mandatory copyright attestation (`/api/rights-attestation`), immediate server-side deletion of audio files, non-scraping of copyrighted lyrics, and SSRF protection `[VERIFIED FROM MY CODE]`.
- **Section 5 — Requirement Analysis** (Detailed in [`docs/analysis/requirements.md`](./requirements.md)):
  - Specifies 15 Functional Requirements (`FR-01` to `FR-15`), 6 categories of Non-Functional Requirements (Performance, Security, Usability, Reliability, Scalability, Maintainability), Client/Server Hardware Requirements, Software Stack Versions, and API/Database schemas (`0001_user_data.sql` and `0002_song_sheet.sql`) `[VERIFIED FROM MY CODE]`.
- **Section 6 — SWOC Analysis** (Detailed in [`docs/analysis/feasibility_and_risks.md`](./feasibility_and_risks.md#2-swoc-analysis-section-6)):
  - Evaluates internal **Strengths** (hybrid DSP + LLM architecture, privacy-preserving ephemeral storage, 396-chord multi-instrument engine), internal **Weaknesses** (4-chord-quality HMM vocabulary in backend `v2`, phase/EQ stem separation vs. heavy GPU neural models, prepared components awaiting wiring), external **Opportunities**, and external **Challenges** `[VERIFIED FROM MY CODE]`.
- **Section 7 — Risk Analysis** (Detailed in [`docs/analysis/feasibility_and_risks.md`](./feasibility_and_risks.md#3-risk-analysis-section-7)):
  - Identifies 15 concrete Technical, Security, API, Legal, and User-related risks along with code-verified prevention and mitigation strategies `[VERIFIED FROM MY CODE]`.

---

## 5. Data Flow & System Understanding (Section 8)

### 5.1 High-Level System Architecture & Data Movement (`VERIFIED FROM MY CODE`)

Data in Wilsify AI moves across four distinct execution boundaries:
1. **Browser Client Layer (React 19 + Web Audio API + LocalStorage):** Handles user interaction, real-time audio playback (`HTMLAudioElement` / `AudioContext`), browser-side stem separation (`OfflineAudioContext`), microphone YIN pitch detection (`AnalyserNode.getFloatTimeDomainData`), interactive lyric-chord synchronization, and immediate local caching (`localStorage`) `[VERIFIED FROM MY CODE]`.
2. **Stateless FastAPI Backend Layer (Python + Librosa + FFmpeg + ReportLab + Mido):** Processes heavy signal-processing requests (`POST /api/analyze/stream`, `POST /api/pitch-shift`), external media retrieval (`POST /api/fetch-media`, `GET /api/youtube/search`), document generation (`POST /api/export/pdf`, `POST /api/export/midi`), and authenticated AI tutoring (`POST /api/assistant`). The backend stores **zero permanent user files**; all temporary audio files in `TMP_DIR` are deleted immediately after the HTTP response completes `[VERIFIED FROM MY CODE: backend/main.py]`.
3. **External Cloud Identity & Database Layer (Supabase Auth + PostgreSQL):** Issues JWT tokens (`ES256`/`RS256`), authenticates users via Email/OAuth, and stores per-user JSONB documents (`library`, `chat`, `practice`) in `public.user_data` protected by PostgreSQL Row-Level Security (`auth.uid() = user_id`) `[VERIFIED FROM MY CODE: supabase/migrations/0001_user_data.sql]`.
4. **External AI & Media Providers (Google Gemini REST API & Video/Audio Hosts):** Called on demand by the backend for conversational music tutoring (`generativelanguage.googleapis.com`) and media stream extraction (`yt-dlp` / `httpx`) `[VERIFIED FROM MY CODE: backend/services/assistant_engine.py, backend/services/media_fetch.py]`.

### 5.2 Text-Based End-to-End Data Flow Diagram (`VERIFIED FROM MY CODE`)

```text
+-----------------------------------------------------------------------------------+
|                        USER BROWSER (React 19 + TypeScript)                       |
|                                                                                   |
|  [1. Audio/Video Input]                                                           |
|   |-- Local File (.mp3/.wav/.mp4) ---> Creates Local Blob URL (Audio Player)      |
|   |-- Mic Recording (MediaRecorder) -> Creates Local Blob URL                     |
|   +-- Remote URL / YouTube Search ---> Calls Backend /api/fetch-media             |
|                                                                                   |
|  [2. Browser Web Audio DSP]                                                       |
|   |-- Stem Separation (stemSeparation.ts / stemMixer.ts) -> WAV Stems in Memory   |
|   |-- Metronome (useMetronome.ts) -> Lookahead Oscillator Clicks                  |
|   +-- Mic Pitch Detector (YIN pitch.ts) -> Root Note Match -> Auto-Tempo Step-Up  |
+-----------------------------------------+-----------------------------------------+
                                          |
          +-------------------------------+-------------------------------+
          | HTTPS / REST / NDJSON                                         | HTTPS / JWT (RLS)
          v                                                               v
+-----------------------------------------+     +-----------------------------------+
|      FASTAPI BACKEND (backend/main.py)  |     |     SUPABASE CLOUD PLATFORM       |
|                                         |     |                                   |
|  * Rate Limiter (60 req/min/IP)         |     |  * Supabase Auth (Email / OAuth)  |
|  * JWT Verifier (JWKS ES256/RS256)      |     |  * JWKS Endpoint (/.well-known)   |
|                                         |     |  * Postgres Table: user_data      |
|  [POST /api/analyze/stream]             |     |    - kind: 'library' (JSONB)      |
|   1. Save temp file -> TMP_DIR          |     |    - kind: 'chat'    (JSONB)      |
|   2. soundfile / ffmpeg -> 22.05kHz WAV |     |    - kind: 'practice'(JSONB)      |
|   3. Librosa HPSS (11.025kHz)           |     |  * Prepared Schema (0002_song):   |
|   4. CQT Chroma + Bass Chroma           |     |    - songs, song_analysis,        |
|   5. Beat Tracking + Harmonic Cycle BPM |     |      lyric_lines, chord_events    |
|   6. 2-Pass HMM Viterbi (48 Chords + N) |     +-----------------------------------+
|   7. Krumhansl-Kessler Key + 3/4 vs 4/4 |
|   8. Difficulty Score (0-100)           |     +-----------------------------------+
|   9. Delete temp files (finally block)  |     |      EXTERNAL SERVICES            |
|  10. Stream NDJSON AnalysisResult       |     |                                   |
|                                         |     |  * Google Gemini API              |
|  [POST /api/assistant] -----------------+---->|    (gemini-flash-latest / lite)   |
|   -> Gemini API -> Grounded -> Rules    |     |  * Media Hosts (YouTube, etc.)    |
|                                         |     |    (fetched via yt-dlp / httpx    |
|  [POST /api/export/pdf & /midi]         |     |     with DNS SSRF protection)     |
|   -> ReportLab A4 PDF / Mido MIDI       |     +-----------------------------------+
+-----------------------------------------+
```

### 5.3 Visual Architecture & Data Flow Diagram (Mermaid) (`VERIFIED FROM MY CODE`)

```mermaid
flowchart TD
    subgraph Client["Frontend Web App (React 19 + Vite 8 + Web Audio API)"]
        UI_Upload["Upload / Studio Page\n(Local File, Mic, URL, YT Search)"]
        UI_Analysis["Analysis Workspace\n(Key, BPM, Meter, Chord Timeline)"]
        UI_Song["Synced Song Sheet\n(Lyric-Chord Alignment, Simplify, Tap-Sync)"]
        UI_Practice["Practice Studio\n(Speed 0.5x-1.5x, Loop, Metronome, YIN Mic Check)"]
        UI_TunerChords["Tuner & 396-Chord Library\n(10 Instruments + Harp + CAGED)"]
        UI_Assistant["Ask Wilsify AI\n(Page & Contextual Drawer)"]
        LocalStore[("Browser Storage\nlocalStorage + Blob URLs")]
    end

    subgraph Backend["FastAPI Backend (Python 3.10+)"]
        API_Analyze["POST /api/analyze & /stream\n(Rate Limit: 60/min/IP)"]
        DSP_Extract["Audio Extractor\n(soundfile / ffmpeg -> 22.05 kHz WAV)"]
        DSP_MIR["MIR Engine (analysis_engine.py)\n(HPSS, CQT Chroma, HMM Viterbi, Key, BPM, Meter)"]
        DSP_Diff["Difficulty Scorer (difficulty.py)\n(0-100 Beginner/Intermediate/Advanced)"]
        API_Media["POST /api/fetch-media & GET /api/youtube/search\n(yt-dlp / httpx + SSRF DNS Guard)"]
        API_Pitch["POST /api/pitch-shift\n(ffmpeg rubberband / asetrate)"]
        API_Export["POST /api/export/pdf & /midi\n(ReportLab Vector A4 & Mido MIDI)"]
        API_Tutor["POST /api/assistant\n(Supabase JWKS JWT Guard)"]
    end

    subgraph Cloud["External Cloud & AI Services"]
        Supabase[("Supabase Auth & Postgres\npublic.user_data (RLS)")]
        Gemini["Google Gemini REST API\n(gemini-flash-latest / lite)"]
        MediaHosts["Public Video/Audio Hosts\n(YouTube, SoundCloud, etc.)"]
    end

    UI_Upload -->|"1. Fetch URL / Search"| API_Media
    API_Media -->|"DNS Check + Download"| MediaHosts
    UI_Upload -->|"2. Multipart Audio/Video"| API_Analyze
    API_Analyze --> DSP_Extract --> DSP_MIR --> DSP_Diff
    DSP_Diff -->|"3. NDJSON AnalysisResult"| LocalStore
    LocalStore --> UI_Analysis & UI_Song & UI_Practice
    UI_Analysis -->|"Semitones -12..+12"| API_Pitch
    UI_Analysis -->|"Export Request"| API_Export
    UI_Assistant -->|"Bearer JWT + Song Context"| API_Tutor
    API_Tutor -->|"Verify JWT"| Supabase
    API_Tutor -->|"Prompt + Context"| Gemini
    LocalStore <-->|"cloudSync.ts (JSONB upsert/select)"| Supabase
```

### 5.4 Major System Components and Responsibilities (`VERIFIED FROM MY CODE`)

1. **`frontend/src/lib/mvpContext.tsx` (Central Frontend State Coordinator):**
   - Holds the active song's `AnalysisResult`, playback audio `Blob` URL, upload progress stages (`AnalysisStage`), and recent library items. Coordinates calls to `api.ts`, `library.ts`, and `cloudSync.ts` `[VERIFIED FROM MY CODE]`.
2. **`backend/main.py` (API Gateway, Security & Lifecycle Controller):**
   - Configures CORS, enforces the 100 MB upload ceiling (`MAX_UPLOAD_BYTES`), applies the 60 req/min per-IP sliding-window rate limiter, verifies Supabase JWTs via `PyJWKClient`, pre-warms `numba` JIT kernels during server startup (`lifespan`), and guarantees temporary file cleanup `[VERIFIED FROM MY CODE]`.
3. **`backend/services/analysis_engine.py` (Core MIR Signal Processing Engine):**
   - Executes deterministic harmonic and rhythmic extraction using `librosa`, `numpy`, and `scipy`: HPSS separation, tuning estimation, CQT chroma extraction, bass-note tracking, 2-pass HMM Viterbi chord decoding across 48 chord templates + no-chord state, Krumhansl-Kessler key correlation, onset/harmonic-cycle tempo estimation, and meter classification `[VERIFIED FROM MY CODE]`.
4. **`backend/services/difficulty.py` (Pedagogical Difficulty Classifier):**
   - Evaluates a song's playability on a `0–100` scale using four weighted factors: chord shape complexity (`40%`), chord-change frequency per minute (`30%`), BPM tempo (`20%`), and root-note modulation variety (`10%`) `[VERIFIED FROM MY CODE]`.
5. **`backend/services/assistant_engine.py` (3-Tier Hybrid AI Tutor):**
   - Routes user questions through Google Gemini (`gemini-flash-latest` / `gemini-flash-lite-latest`) with injected song analysis context, falling back to a deterministic song-context responder (`_grounded_answer`) and a 12-rule music-theory knowledge base (`RULES`) `[VERIFIED FROM MY CODE]`.
6. **`backend/services/pdf_export.py` & `backend/services/midi_export.py` (Engraving & Export Engines):**
   - `pdf_export.py` renders multi-page vector A4 lead sheets with custom typography, measure grids, repeat brackets, and fretboard diagrams via `reportlab`. `midi_export.py` encodes timed chord blocks into Standard MIDI files via `mido` `[VERIFIED FROM MY CODE]`.
7. **`frontend/src/lib/tuner/pitch.ts` & `frontend/src/lib/chordTheory.ts` (Client-Side Music Theory & Pitch DSP):**
   - `pitch.ts` runs the YIN autocorrelation pitch detector in the browser for both the multi-instrument Chromatic Tuner (`Tuner.tsx`) and the Practice Studio's live accuracy checker (`Practice.tsx`). `chordTheory.ts` generates voicings, inversions, and fretboard diagrams across `396` chord symbols (`12` roots $\times$ `33` qualities) `[VERIFIED FROM MY CODE]`.
8. **`frontend/src/lib/stemSeparation.ts` & `frontend/src/lib/stemMixer.ts` (Browser-Side Audio Isolation):**
   - Performs zero-server-cost stereo mid/side phase cancellation (`stemSeparation.ts`, active in `Analysis.tsx`) and 4-band cascaded `BiquadFilter` frequency-and-stereo separation (`stemMixer.ts` + `StemMixer.tsx`, implemented and unit-tested in repo) `[VERIFIED FROM MY CODE]`.
9. **`frontend/src/lib/cloudSync.ts` & `supabase/migrations/` (Persistence & Row-Level Security Layer):**
   - Bridges offline-first `localStorage` persistence with authenticated cloud storage in Supabase PostgreSQL (`0001_user_data.sql` active JSONB sync; `0002_song_sheet.sql` prepared relational song-sheet schema) `[VERIFIED FROM MY CODE]`.
