# Wilsify AI — Sponsor Demo Quick Cheat Sheet

> **One-Page Meeting Companion:** Keep this document open during live demonstrations for immediate reference.

---

## 30-Second Pitch
*"Wilsify AI is an AI-powered music learning companion that performs genuine audio signal processing on any uploaded song or video. In under a second, it detects the real key, BPM, and chord progression, maps them directly to guitar, ukulele, and piano visualizers, lets you practice at variable speeds with a synchronized metronome, and exports printable lead sheets and MIDI files. The MVP proves that real music intelligence can run fast and reliably in a zero-friction browser workflow."*

---

## 5-Minute Demo Flow
1. **Studio** (`/studio`) → Show home dashboard, week activity chart, and instrument toolkit.
2. **Upload** (`/upload`) → Click **"Use Sample Track"** → Check rights attestation → Click **"Analyze Song"**.
3. **Analysis** (`/analysis`) → Highlight Key (`C Major`), BPM (`83.4`), Duration, Difficulty (`Beginner`), and Chords (`C → G → Am → F`).
4. **Instrument Views** → Toggle Guitar (click CAGED barre voicings), Ukulele, and Piano roll.
5. **Practice Mode** (`/practice`) → Hit Play, change speed (0.75x), loop, and start BPM-synced metronome.
6. **Chromatic Tuner** (`/tuner`) → Click "Start Tuner", hum into mic, show frequency, note, and needle.
7. **AI Tutor** (`/assistant`) → Ask: *"What chords are used in this song?"* → Show song-grounded answer.
8. **Exports** → Download and open **MIDI** (`.mid`) and **PDF Lead Sheet** (`.pdf`).
9. **Library & Dashboard** → Hit "Save to Library" → Show saved song card and practice stats.

---

## Top 5 Strongest Features
1. **Real DSP Analysis Pipeline**: Actual CQT chromagram and Krumhansl-Kessler key correlation; not mock data.
2. **"Use Sample Track" Synthesizer**: Web Audio generates uncompressed WAV in-browser—100% demo dependability.
3. **Real Deliverables**: Downloadable Type-0 MIDI files (`mido`) and vector lead-sheet PDFs (`reportlab`).
4. **Interactive Voicing Visualizers**: Dynamic SVG chord fingerings (open + barre shapes, ukulele, piano roll).
5. **Sub-Second Processing Speed**: Lifespan warmup JIT pre-compiles kernels; analysis completes in $< 1$ second.

---

## 5 Critical Limitations (Honesty First)
1. **Not an LLM**: The AI Tutor is a rule-based prototype grounded in active song data; do not claim it is ChatGPT.
2. **2-Stem DSP**: Stem separation uses stereo phase cancellation ($L - R$), not 4-stem neural Demucs.
3. **Local Storage**: User library, practice history, and community feed are saved in browser `localStorage`.
4. **Zero-Database MVP**: No PostgreSQL, Redis, or cloud sync in this build; keeps deployment zero-cost.
5. **Triad Scope**: Analysis detects 24 major and minor triads; complex jazz chords collapse to nearest root.

---

## Quick Q&A Cheat Sheet

| Question | What to Say |
|---|---|
| **Is the analysis real?** | Yes, 100% genuine signal processing using FFmpeg and librosa. Real DSP, zero canned data. |
| **Is it generative AI?** | No. Audio analysis is classical MIR signal processing; the assistant is a rule-based prototype. |
| **What tech stack?** | Python, FastAPI, librosa, FFmpeg, React 19, TypeScript, Vite, Tailwind CSS, and Web Audio API. |
| **Why no database?** | Deliberate MVP architecture. Zero database eliminates hosting overhead and failure modes. |
| **Can it scale?** | Yes. The stateless backend containerizes cleanly and migrates to async S3/Celery worker queues. |
| **How accurate is it?** | Highly accurate on clean acoustic, piano, and pop music; honest heuristics on noisy mixes. |
| **What's the business model?** | Freemium SaaS ($9.99/mo) for cloud library sync, neural stem separation, and full AI tutoring. |
| **What would funding build?** | Neural transcription models (Basic Pitch), Demucs 4-stem separation, cloud DB, and mobile apps. |

---

## Demo Fallback
- **If any upload hiccup occurs**: Click **"Use Sample Track"**. It works 100% of the time, offline or online.
- **If mic fails in Tuner**: Switch to **Chord Library** (`/chords`) and click "Play" on chord cards to demo audio synthesis.
