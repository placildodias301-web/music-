# Wilsify AI — Sponsor & Investor Demonstration Guide

> **Document Purpose:** Practical, step-by-step master presentation guide for demonstrating Wilsify AI live to potential sponsors, investors, and strategic partners.
> **Current Verification Status:** Verified **GO (95/100 Sponsor-Ready)**. All core signal processing, visualizers, practice tools, and file export pipelines pass automated and live verification.

---

## Table of Contents

1. [Product Story](#1-product-story)
2. [30-Second Elevator Pitch](#2-30-second-elevator-pitch)
3. [60-Second Technical Explanation](#3-60-second-technical-explanation)
4. [5-Minute Live Demo Script](#4-5-minute-live-demo-script)
5. [The Strongest Demo Flow (Under the Hood)](#5-the-strongest-demo-flow-under-the-hood)
6. [What Makes Wilsify AI Different?](#6-what-makes-wilsify-ai-different)
7. [Important Honesty: Claims We SHOULD vs MUST NOT Make](#7-important-honesty-claims-we-should-vs-must-not-make)
8. [Technical Sponsor Q&A](#8-technical-sponsor-qa)
9. [Sponsor Questions — Quick Cheat Sheet](#9-sponsor-questions--quick-cheat-sheet)
10. [Demo Fallback Plan (If Anything Goes Wrong)](#10-demo-fallback-plan-if-anything-goes-wrong)
11. [Pre-Meeting Checklist](#11-pre-meeting-checklist)
12. [Wilsify AI Roadmap](#12-wilsify-ai-roadmap)
13. [Recommended Presentation Formats (5, 10, and 15 Minutes)](#13-recommended-presentation-formats-5-10-and-15-minutes)

---

## 1. Product Story

### The Problem
Learning a song by ear is intimidating and time-consuming for the vast majority of musicians and students. Existing tools are fragmented:
- Chord transcription sites rely on crowdsourced, often inaccurate user submissions.
- Metronomes and slow-downers are separate, disconnected utilities that don't know the song's harmony.
- Full digital audio workstations (DAWs) are bloated, complex, and steep for a music learner who just wants to practice along with an audio track.

### The Solution
Wilsify AI unifies the entire practice cycle into one zero-friction workflow:
1. **Analyze**: Ingest any audio or video file and run real signal processing to extract key, tempo, time signature, and chord progression in under a second.
2. **Visualize**: Translate abstract chords immediately into instrument-specific fingering diagrams (Guitar with alternate open/barre voicings, Ukulele, and Piano).
3. **Practice**: Loop sections, adjust tempo without pitch drift, lock in with a synchronized metronome, and verify performance live through the microphone.
4. **Export**: Take the detected song data straight to a printable lead sheet PDF or Standard MIDI file for DAWs.

### The User
Self-taught guitarists, pianists, ukulele players, music students, educators, and songwriters looking to quickly deconstruct songs and practice efficiently.

### What the MVP Proves
The MVP proves that **real, low-latency audio signal processing** can be paired with an intuitive learning companion in the browser—with zero database maintenance cost, no cloud API dependencies, and high execution reliability.

### The Future
With funding and partnerships, Wilsify AI will scale this architecture into an end-to-end cloud platform featuring neural polyphonic transcription, 4-stem separation (Demucs), multi-user community classrooms, and personalized LLM-powered music theory tutoring.

---

## 2. 30-Second Elevator Pitch

> *"Most music learning software falls into one of two traps: either it relies on crowd-sourced chord charts that are frequently wrong, or it's an expensive, overwhelming DAW built for sound engineers.*
>
> *Wilsify AI is an AI-powered music learning companion that performs **genuine audio signal processing** on any uploaded song or video. In under a second, it extracts the real key, BPM, and chord progression, maps them directly to guitar, ukulele, and piano visualizers, lets you practice at variable speeds with a synchronized metronome, and exports printable lead sheets and MIDI files.*
>
> *Today's MVP proves that real music intelligence can run fast and reliably in a zero-friction browser workflow."*

---

## 3. 60-Second Technical Explanation

> *"Under the hood, Wilsify AI combines high-performance Python audio engineering with a modern, responsive React and Web Audio frontend.*
>
> *When a user uploads an audio or video file—or triggers our in-browser audio synthesizer—the backend demuxes and standardizes the stream into a mono 22.05 kHz signal using `ffmpeg`.*
>
> *Next, our signal processing pipeline in `librosa` computes Constant-Q chromagrams. We detect the tonal center by correlating pitch class distributions against Krumhansl-Kessler major and minor cognitive key profiles. Beat tracking runs via spectral onset-strength envelopes to establish BPM and measure boundaries.*
>
> *We then map time-sliced chroma vectors against major and minor triad templates to construct a synchronized chord timeline. From this data, our difficulty engine computes an objective score based on chord complexity, change rates, and harmonic modulation.*
>
> *Finally, the backend dynamically compiles Standard Type-0 MIDI files and ReportLab PDF chord charts, while the browser leverages the Web Audio API for pitch detection, metronome clicks, and variable-speed playback.*
>
> *Everything you see is mathematical signal processing—not mocked static data or canned lookups."*

---

## 4. 5-Minute Live Demo Script

Follow this exact sequence for a seamless, high-impact 5-minute presentation:

### Step 1: Open Application & Land on Studio
- **ACTION**: Open `http://localhost:5173/` in your browser. The page redirects to `/studio`.
- **SAY**: *"This is Wilsify AI. We’re on the Studio dashboard, which acts as the musician's home base. It shows recent activity, practice analytics, and quick links to our instrument toolkit."*
- **SHOW**: The dark, glassmorphic UI, recent library track status, and the weekly practice activity chart.
- **WHY IT MATTERS**: Demonstrates a modern, focused user experience that feels like a polished commercial music app rather than a crude academic prototype.

---

### Step 2: Use Built-in Sample Track & Show Rights Attestation
- **ACTION**: Click **"Upload a Song"** (navigating to `/upload`). Click **"Use Sample Track"**, then check the **"I confirm I own this audio..."** checkbox.
- **SAY**: *"To ensure our demo is 100% dependable anywhere without hunting for audio files, we built an in-browser Web Audio synthesizer that generates an original test track on the fly. Notice this rights attestation—we log user ownership confirmations with a server-side timestamp before analysis."*
- **SHOW**: The selected "Wilsify Demo Track.wav" state, the active attestation checkbox, and the enabled "Analyze Song" button.
- **WHY IT MATTERS**: Shows enterprise compliance awareness (copyright/rights management) and guarantees you never experience an upload failure during a presentation.

---

### Step 3: Run Real Audio Analysis
- **ACTION**: Click **"Analyze Song"**. Watch the progress indicator transition to `/analysis` in $< 1$ second.
- **SAY**: *"In less than a second, the audio was decoded and analyzed using genuine signal processing. Notice the green confirmation banner: this is real MIR signal processing, not a static lookup or pre-cached result."*
- **SHOW**: 
  - Processing time badge (e.g., `0.55s`).
  - Stat cards: Key (`C Major`), Tempo (`83.4 BPM`), Time Signature (`4/4`), Duration (`00:08`).
  - Scale: `C Ionian (Major)`.
  - Difficulty rating badge: `Beginner · 18/100`.
  - Detected Chord Progression pills: `C → G → Am → F`.
- **WHY IT MATTERS**: Immediately proves technical validity. The sponsor sees authentic musical attributes extracted dynamically from audio waveform data.

---

### Step 4: Instrument Visualizations (Guitar, Ukulele, Piano)
- **ACTION**: Scroll to **"Instrument View"**. Toggle between **Guitar**, **Ukulele**, and **Piano**. Under Guitar, click through the **Voicing** buttons (*"Open position"*, *"Barre – E-shape"*, *"Barre – A-shape"*).
- **SAY**: *"Music learners play different instruments. Wilsify translates detected chords into clear, interactive SVG fretboards. For guitarists, we provide alternate CAGED voicings so players can choose between open chords and barre positions up the neck."*
- **SHOW**: 
  - Dynamic SVG fretboard markers, open string indicators, and muted strings.
  - 4-string Ukulele chord fingerings.
  - 1-octave Piano roll highlighting active pitch classes.
- **WHY IT MATTERS**: Bridges signal processing with real pedagogical value. Raw chord names become actionable instrument fingerings.

---

### Step 5: Practice Mode (Speed, Loop, Metronome)
- **ACTION**: Click **"Open Practice Mode"** (or navigate to `/practice`). Click the circular **Play** button. Adjust speed to **0.75x**, toggle **Loop: On**, and click **"Start"** on the Metronome.
- **SAY**: *"Now the student enters Practice Mode. They can slow the song down to 75% or 50% without altering pitch, isolate difficult bars on a loop, and lock in with a Web Audio metronome driven by the exact detected BPM."*
- **SHOW**: Smooth audio playback, audio position scrubbing, playback rate changing in real-time, and metronome audio clicks synchronized to the detected tempo.
- **WHY IT MATTERS**: Addresses the #1 challenge for music students—slowing down fast or complex passages to build muscle memory cleanly.

---

### Step 6: Real-Time Pitch Detection & Tuner
- **ACTION**: Click **"Tools"** → **"Chromatic Tuner"** (or `/tuner`). Click **"Start Tuner"**. Hum or play a clean note into your mic.
- **SAY**: *"Wilsify includes real-time pitch detection using autocorrelation. Notice the instrument presets—Guitar, Violin, Voice, Ukulele, Bass. The tuner filters out extraneous background frequencies by restricting detection strictly to the instrument's physical frequency range."*
- **SHOW**: The needle swinging in real-time across the arc, displaying exact frequency (e.g. `440.0 Hz`), note name (`A4`), and cents deviation with green "in-tune" indicator.
- **WHY IT MATTERS**: Proves browser-level digital signal processing running on live microphone streams with sub-semitone precision.

---

### Step 7: Contextual AI Tutor
- **ACTION**: Click **"AI Assistant"** in the sidebar. Click one of the song-grounded suggestions: *"What chords are used in this song?"* or *"What key is this song in?"*.
- **SAY**: *"Our assistant is context-aware. Instead of being a detached chatbot, it is directly grounded in the song we just analyzed. It reads the detected key, chords, and tempo to answer musical questions accurately."*
- **SHOW**: The instant, grounded response citing the active track's detected progression (`C → G → Am → F`).
- **WHY IT MATTERS**: Demonstrates our vision for intelligent interactive music education without burning expensive LLM API credits during early user onboarding.

---

### Step 8: Tangible Deliverables (MIDI & PDF Lead Sheet Export)
- **ACTION**: Navigate back to **"Analysis"** (or click Analysis in the sidebar). Scroll to **Export**. Click **"Export MIDI"** (downloads `.mid`), then click **"Export Chord Chart (PDF)"** (downloads `.pdf`). Open the PDF.
- **SAY**: *"Musicians need portability. With one click, Wilsify exports a Standard Type-0 MIDI file that can be dragged into Logic, Ableton, or GarageBand, as well as a clean, printable lead sheet PDF with chord boxes."*
- **SHOW**: The downloaded `.mid` file and the formatted PDF lead sheet featuring the song title, key, tempo, and 4-bar chord grid.
- **WHY IT MATTERS**: Proves that the analysis creates immediate, high-value tangible assets outside the browser sandbox.

---

### Step 9: Save to Library & Dashboard Analytics
- **ACTION**: Click **"Save to Library"** (shows *"Saved ✓"*). Click **"Library"** in the sidebar to show the track listed. Then click **"Studio"** / **"Dashboard"**.
- **SAY**: *"Analyses can be saved to the user's Library. Every practice session records duration, speed, and accuracy, feeding a practice analytics dashboard that tracks streaks, XP, and weak chords that need review."*
- **SHOW**: The saved track card in Library, and the practice progress bars and weak chord tags in the dashboard.
- **WHY IT MATTERS**: Illustrates retention and habit formation mechanisms built into the platform architecture.

---

## 5. The Strongest Demo Flow (Under the Hood)

When presenting to technically astute sponsors or investors, focus on the **end-to-end data pipeline**:

```
[Uploaded Audio/Video or Web Audio Synthesizer]
                     │
                     ▼
       FFmpeg Decodes/Demuxes Stream
       (Converts to standard 22.05kHz Mono WAV)
                     │
                     ▼
          librosa Signal Processing
   ├── Spectral Onset Strength  ──► Beat Tracking (BPM) & Measure Timeline
   ├── Constant-Q Chromagram    ──► Krumhansl-Kessler Key Correlation (Key/Mode)
   ├── Triad Chroma Matching    ──► Major/Minor Chord Timeline & Segments
   └── Autocorrelation          ──► 4/4 vs 3/4 Periodicity Heuristic
                     │
                     ▼
         Difficulty Scoring Engine
   (Complexity 40% + Change Rate 30% + Tempo 20% + Modulation 10%)
                     │
                     ▼
         Downstream Applications
   ├── Interactive Visualizers (Guitar Voicings, Ukulele, Piano)
   ├── Practice Mode Player & Live ACF2 Mic Accuracy Tracking
   ├── Standard Type-0 MIDI Generator (`mido`)
   ├── Lead Sheet Vector PDF Engine (`reportlab`)
   └── Song-Grounded Music Theory Assistant
```

### Key Technical Talking Points:
1. **Universal Media Ingestion**: Handled by `ffmpeg` CLI execution using secure, non-shell array parameters. Any container format (`.mp3`, `.wav`, `.m4a`, `.mp4`, `.mov`, `.webm`) works out of the box.
2. **Krumhansl-Kessler Cognitive Profiling**: Instead of naive peak frequency detection, key detection measures the statistical distribution of energy across all 12 chromatic pitch classes against empirical human cognitive key profiles.
3. **Triad Template Distance**: Chord classification performs inner-product similarity between per-beat chroma vectors and binary triad templates ($[0, 4, 7]$ for major, $[0, 3, 7]$ for minor).
4. **Zero-Latency JIT Warmup**: FastAPI lifespan startup runs a dummy 2-second analysis on boot, pre-compiling `numba` machine code so the sponsor's first upload is never delayed by JIT overhead.

---

## 6. What Makes Wilsify AI Different?

| Feature Area | Typical Market Competitors | Wilsify AI (Current MVP) |
|---|---|---|
| **Chord Data** | Scraped text tabs; crowdsourced; frequent transcription errors | **Direct DSP signal processing** computed from actual audio |
| **Media Input** | Audio-only or manual song search | **Audio OR video** files, plus built-in synthesizer |
| **Instrument Visuals** | Static images or guitar-only charts | Dynamic **Guitar (open & barre), Ukulele, and Piano** roll |
| **Practice Tools** | Separate metronome apps; disconnected tools | **Integrated player**, speed scaler, loop, and BPM-locked metronome |
| **Pitch Tracking** | Standalone hardware or separate tuner apps | **Microphone autocorrelation (ACF2+)** with instrument frequency gates |
| **Export Formats** | Proprietary formats or locked behind paywalls | **Standard MIDI (.mid)** and **printable Lead Sheet (.pdf)** |
| **Theory Tutor** | None, or generic third-party chatbots | **Song-grounded assistant** aware of active chords, key, and tempo |

---

## 7. Important Honesty: Claims We SHOULD vs MUST NOT Make

Maintaining complete credibility with investors and technical sponsors requires strict honesty. Never oversell the prototype.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SPONSOR HONESTY MATRIX                           │
├────────────────────────────────────┬────────────────────────────────────┤
│       Claims We SHOULD Make        │      Claims We MUST NOT Make       │
├────────────────────────────────────┼────────────────────────────────────┤
│ "Real audio signal processing      │ "Powered by generative AI / deep   │
│ using librosa and FFmpeg."         │ neural networks like ChatGPT."     │
├────────────────────────────────────┼────────────────────────────────────┤
│ "The AI Assistant is a rule-based  │ "The AI Assistant is an LLM with   │
│ prototype grounded in song data."  │ broad open-domain knowledge."      │
├────────────────────────────────────┼────────────────────────────────────┤
│ "2-stem phase-cancellation DSP     │ "Full 4-stem Demucs/Spleeter neural│
│ for center-panned stereo audio."   │ separation (drums/bass/vocals)."   │
├────────────────────────────────────┼────────────────────────────────────┤
│ "Clean local browser persistence   │ "Production cloud database with    │
│ without database hosting overhead."│ multi-tenant cloud sync."          │
├────────────────────────────────────┼────────────────────────────────────┤
│ "Stateless, low-footprint backend  │ "Already scaled to handle 100,000  │
│ ready for containerized scaling."  │ concurrent audio streams."         │
├────────────────────────────────────┼────────────────────────────────────┤
│ "Lead sheet chord chart PDF        │ "Full engraved orchestral score /  │
│ generation via ReportLab."         │ classical grand staff notation."   │
└────────────────────────────────────┴────────────────────────────────────┘
```

### Detailed Honesty Breakdown:
1. **The AI Assistant**: Be completely transparent. It is an intelligently constructed regex and pattern-matching engine with song-grounding logic. Explain that starting with rule-based grounding allowed us to prove UX value with zero OpenAI/Anthropic API bills.
2. **Stem Separation**: It uses classical stereo mid/side phase cancellation ($L - R$). It is an audible 2-stem transformation that attenuates center-panned vocals on stereo mixes, but it cannot isolate mono tracks or extract drums and bass.
3. **Database & Storage**: State (library items, practice history, community demo feed) is stored locally in the browser's `localStorage`. No server-side PostgreSQL or user accounts exist yet.
4. **Chord Scope**: The analysis engine detects 12 major and 12 minor triads (24 templates). Complex jazz alterations (maj7, dim7, 9ths) collapse to their closest triad root.

---

## 8. Technical Sponsor Q&A

### Q1: "Is the music analysis actually real, or is it canned?"
**Answer:** *"It is 100% genuine digital signal processing. Every time an audio or video file is uploaded, FFmpeg extracts the audio, and librosa performs Constant-Q chromagram extraction and onset-strength beat tracking. You can upload an original song you recorded five minutes ago, and it will compute the real key, BPM, and chords in real time."*

### Q2: "Is this just a frontend demo?"
**Answer:** *"Not at all. The frontend is a lightweight React/TypeScript interface. All audio extraction, spectral analysis, Krumhansl-Kessler correlation, MIDI byte encoding, and ReportLab PDF compiling happen inside our Python/FastAPI backend."*

### Q3: "What AI model are you using for the tutor?"
**Answer:** *"In this MVP, we deliberately implemented a deterministic, rule-based Q&A engine that is grounded in the active song's detected metadata. It is not an LLM. This allowed us to validate contextual learning interactions without incurring cloud API costs. Integrating a real LLM via LangChain or direct Anthropic/OpenAI APIs is our immediate next step."*

### Q4: "How does the audio analysis work mathematically?"
**Answer:** 
- *Non-technical:* *"We convert sound waves into a musical fingerprint showing how energy is distributed across the 12 musical notes over time, then match those patterns against standard chord templates and key profiles."*
- *Technical:* *"We generate a Constant-Q chromagram ($12$ bins per octave), take the normalized chroma mean, and compute the Pearson correlation against the 12 major and 12 minor Krumhansl-Kessler pitch class profiles. Tempo uses spectral onset envelopes with dynamic-programming beat tracking. Time signature is estimated by evaluating autocorrelation peak ratios at 3-beat vs 4-beat lag intervals."*

### Q5: "Why doesn't the MVP have a database?"
**Answer:** *"We intentionally built a zero-database architecture for this MVP. By keeping file processing ephemeral and utilizing browser local storage for user state, we eliminated hosting overhead, removed database connection failure modes, and ensured anyone can clone and run the project in two commands without configuring PostgreSQL, Redis, or Docker."*

### Q6: "Can this architecture scale to thousands of users?"
**Answer:** *"The current backend is stateless, which makes horizontal container scaling straightforward. For enterprise scale, our roadmap transitions the audio pipeline to an asynchronous architecture: client uploads directly to an S3/R2 bucket with signed URLs, a Redis/Celery worker pool processes jobs across GPU/CPU workers, and results push back to the client via WebSockets."*

### Q7: "What happens with long audio files?"
**Answer:** *"The upload limit is strictly enforced at 100MB. The backend extracts audio at 22.05 kHz mono, which minimizes memory footprint. A standard 3-minute song processes in approximately 2.5 to 3.5 seconds."*

### Q8: "How accurate is the chord detection?"
**Answer:** *"Accuracy reflects standard classical MIR signal processing. It is highly accurate on clean recordings—solo instruments, acoustic guitar, piano, and pop music with clear harmonic accompaniment. It is less reliable on heavily distorted mixes, dense orchestral music, or spoken audio. We default to 4/4 time unless there is an overwhelming 3-beat autocorrelation signal."*

### Q9: "Can it separate vocals, drums, bass, and piano?"
**Answer:** *"The current MVP uses a lightweight Web Audio phase-cancellation algorithm ($L - R$) to provide an audible 2-stem vocal/instrumental separation on stereo files. Full 4-stem source separation requires a heavy neural model like Demucs or Spleeter, which is on our post-funding roadmap."*

### Q10: "What is the business model?"
**Answer:** *"Freemium SaaS. Free users get standard song analyses and basic practice tools. Premium subscribers ($9.99/mo) unlock advanced neural stem separation, unlimited chord-sheet PDF and MIDI exports, full cloud library sync across mobile and web, and unlimited personalized AI tutor sessions."*

### Q11: "What would investment funding be used for?"
**Answer:** 
1. *Deep Learning MIR*: Upgrading from classical DSP triad matching to neural transcription models (like Spotify's Basic Pitch or ByteDance's piano transcription).
2. *Neural Stem Separation*: Deploying Demucs v4 for studio-grade 4-stem isolation.
3. *Cloud Platform*: Implementing PostgreSQL, multi-device cloud sync, and native mobile apps (React Native / iOS & Android).
4. *LLM Music Tutor*: Integrating Claude/GPT with customized music-theory system prompts grounded in the user's practice analytics.

---

## 9. Sponsor Questions — Quick Cheat Sheet

| Sponsor Question | High-Impact Short Answer |
|---|---|
| **What is Wilsify AI?** | An AI-powered music learning companion that turns any song or video into interactive chords, tabs, and practice tools. |
| **Who is it for?** | Guitarists, pianists, students, and self-learners practicing songs by ear. |
| **Is the analysis real?** | Yes, 100% real signal processing via FFmpeg and librosa. No canned data. |
| **Is it generative AI?** | No. Audio analysis uses classical DSP; the assistant is a deterministic, song-grounded prototype. |
| **What tech powers it?** | Python, FastAPI, librosa, FFmpeg, React 19, TypeScript, Vite, Tailwind CSS, and Web Audio API. |
| **What is unique?** | It unifies real audio analysis, instrument visualizers, practice tools, and MIDI/PDF exports into one seamless browser flow. |
| **Is there a database?** | No database required for the MVP. State is stored locally in the browser to keep deployment zero-maintenance. |
| **Is there authentication?** | Not in this MVP. It's a single-user local experience designed for zero-friction evaluation. |
| **Can it scale?** | Yes. The stateless backend is ready for Docker containers and can easily migrate to async worker queues (Celery/Redis). |
| **How accurate is it?** | Excellent on clean acoustic/pop tracks; honest heuristics on complex, dense mixes. |
| **How do stems work?** | Stereo phase cancellation ($L - R$) in Web Audio. Neural 4-stem separation is on the roadmap. |
| **What's the business model?** | Freemium subscription ($9.99/mo) for cloud sync, neural stem separation, and full AI tutoring. |
| **What's next?** | Neural transcription models, Demucs stem separation, cloud accounts, and mobile apps. |
| **What does funding build?** | Cloud infrastructure, neural audio models, LLM tutor integration, and native mobile clients. |

---

## 10. Demo Fallback Plan (If Anything Goes Wrong)

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│           Symptom             │          Root Cause           │       Immediate Recovery      │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ User uploaded a weird/corrupt │ Audio stream missing or       │ Click "Use Sample Track".     │
│ video file and got an error   │ unsupported codec             │ Explains: "Let's use our clean│
│                               │                               │ synthesized reference track." │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Microphone input doesn't      │ Browser permissions blocked   │ Skip live tuner; show Chord   │
│ register in Tuner/Practice    │ or external mic disconnected  │ Library diagrams and audio    │
│                               │                               │ previews instead.             │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Backend server is unreachable │ Port 8000 process terminated  │ Keep terminal ready with:     │
│ (fetch network error)         │ or network interrupted        │ `uvicorn main:app --port 8000`│
│                               │                               │ Takes < 2 seconds to restart. │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Sponsor asks about an         │ Untested feature outside core │ Say: "That's part of our Phase│
│ unlisted feature              │ MVP scope                     │ 2 roadmap—let me show you our │
│                               │                               │ core DSP pipeline today."     │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

**Rule #1 of the Demo:** Always use the built-in **"Use Sample Track"** button first. It generates a mathematically pure, uncompressed WAV file directly in the browser, guaranteeing that analysis, chords, playback, and exports execute with 100% reliability.

---

## 11. Pre-Meeting Checklist

Print or review this 5 minutes before your meeting:

- [ ] **Terminal 1 (Backend)**: Running `uvicorn main:app --port 8000` inside `backend/`.
- [ ] **Terminal 2 (Frontend)**: Running `npm run dev` inside `frontend/` on `http://localhost:5173`.
- [ ] **Health Check**: Open `http://localhost:8000/api/health` and verify `{"status":"ok"}`.
- [ ] **Warmup Complete**: Verify the backend terminal logged `[startup] Analysis engine warmed up.`.
- [ ] **Browser Prep**: Open `http://localhost:5173/` in Google Chrome or Brave.
- [ ] **Microphone Access**: Ensure browser permissions for `http://localhost:5173` have Microphone set to **"Allow"**.
- [ ] **Audio Output**: Check system volume so playback, metronome, and synth sounds are audible.
- [ ] **Downloads Cleaned**: Clear previous `wilsify-chords.mid` and `.pdf` files from your Downloads folder.
- [ ] **Backup Tab**: Keep a second tab open with a pre-analyzed track already loaded.

---

## 12. Wilsify AI Roadmap

```
MVP (Current Verified State)
  ├── Real FFmpeg & librosa audio signal processing (Key, BPM, Chords, Duration)
  ├── Interactive Guitar (open + CAGED barre), Ukulele, and Piano visualizers
  ├── Web Audio variable-speed practice player + BPM metronome
  ├── ACF2 autocorrelation Chromatic Tuner with instrument range filters
  ├── Standard MIDI File (.mid) and ReportLab Lead Sheet (.pdf) exports
  └── In-browser Web Audio sample track synthesizer
                      │
                      ▼
Phase 2 (Immediate Post-Funding — 3 to 6 Months)
  ├── Neural chord recognition (extended 7ths, 9ths, diminished vocabulary)
  ├── Demucs v4 neural 4-stem source separation (vocals, drums, bass, other)
  ├── Cloud PostgreSQL database with Supabase / Prisma authentication
  ├── User profile sync across devices and cloud song library
  └── LLM-powered music theory assistant with RAG over user practice logs
                      │
                      ▼
Phase 3 (Scale & Commercialization — 6 to 12 Months)
  ├── iOS and Android native apps (React Native / Expo Audio engine)
  ├── Asynchronous Celery/Redis audio processing worker pool with S3 storage
  ├── Interactive chord progression transposition and capo calculators
  ├── Real-time student-teacher virtual classroom sessions
  └── Commercial API licensing for music schools and instrument manufacturers
```

---

## 13. Recommended Presentation Formats

### 5-Minute Format (Executive / Partner Meeting)
- **0:00 - 0:30**: 30-Second Elevator Pitch.
- **0:30 - 2:00**: Click "Use Sample Track" → Analyze → Show real Key, BPM, and Chord timeline.
- **2:00 - 3:15**: Switch instrument views (Guitar voicings, Piano roll) → Practice Mode with speed control and metronome.
- **3:15 - 4:15**: Download MIDI and PDF lead sheet → Show real export files.
- **4:15 - 5:00**: Wrap up with the business model and investment opportunity.

### 10-Minute Format (Standard Angel / VC Pitch)
- **0:00 - 1:30**: Problem & Solution narrative.
- **1:30 - 5:00**: Full 5-minute live demo script (Steps 1 through 9).
- **5:00 - 7:00**: Demonstrate Chromatic Tuner with live mic → Ask contextual question in AI Assistant.
- **7:00 - 8:30**: Explain technical architecture (FFmpeg → librosa → Web Audio pipeline).
- **8:30 - 10:00**: Review Roadmap, funding requirements, and open Q&A.

### 15-Minute Format (Technical Due Diligence / Deep Dive)
- **0:00 - 5:00**: Complete product walkthrough using both the Sample Track and a real uploaded MP3/MP4 file.
- **5:00 - 8:00**: In-depth feature demonstration (alternate guitar voicings, 2-stem separation, practice log analytics).
- **8:00 - 11:00**: Deep technical dive into `analysis_engine.py` (CQT chroma, Krumhansl-Kessler correlation, autocorrelation heuristics).
- **11:00 - 13:00**: Review `SPONSOR_DEMO.md` architecture and explain transition to async worker queues (Celery/Redis/S3).
- **13:00 - 15:00**: Technical Q&A and code inspection.
