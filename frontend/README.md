# Wilsify AI — Frontend Application

Modern, high-performance music learning interface built with Vite, React 19, TypeScript, and Tailwind CSS v4.

---

## Key Interfaces & Features

1. **Analysis Hub (`src/pages/Analysis.tsx`)**:
   - Interactive waveform scrubber, now-playing chord indicators, and chord progression timeline.
   - Dynamic CAGED guitar chord voicings (open + barre), ukulele fretboards, and piano roll visualizers.
   - Inline **Chord & Lyric Sheet** with real-time karaoke word tracking and `A- / A+` font scaling.

2. **Google Translate-Style Chord Sheet Language Bar (`src/components/analysis/ChordSheetPreview.tsx`)**:
   - Auto-detect source language badge with manual override.
   - 1-click language swap (`⇄`) and instant restore (`↺ Original`).
   - 11+ supported target languages (`English`, `Konkani`, `Hindi`, `Marathi`, `Tamil`, `Spanish`, `French`, `Portuguese`, `German`, `Korean`, `Japanese`).
   - `Aa Romanized` phonetic toggle for non-Latin scripts.

3. **Practice Studio (`src/pages/Practice.tsx`)**:
   - Variable playback speed (0.5x – 1.5x) with pitch preservation.
   - A/B loop practice and tempo-synced metronome.
   - Real-time microphone pitch accuracy tracking.

4. **Additional Tools**:
   - **Stem Splitter (`src/pages/Stems.tsx`)**: Isolate vocals, drums, bass, and accompaniment.
   - **Sheet Music (`src/pages/Sheet.tsx`)**: ScoreTab and grand staff notation via AlphaTab.
   - **Chromatic Tuner (`src/pages/Tuner.tsx`)**: High-precision microphone tuning needle.
   - **AI Assistant (`src/pages/Assistant.tsx`)**: Music theory conversations grounded in your songs.

---

## Setup & Development

```bash
cd frontend
npm install
npm run dev      # Runs dev server at http://localhost:5173
```

### Production Build & Linting
```bash
npm run build    # tsc -b && vite build
npm test         # Run Vitest test suite
```\n