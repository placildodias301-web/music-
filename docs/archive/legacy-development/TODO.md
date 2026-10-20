# Wilsify AI TODO

This document tracks current and upcoming tasks for the **standalone Wilsify AI MVP** (FastAPI backend + Vite/React frontend). 

## Active MVP Priorities

### Backend (Python/FastAPI)
- [x] Fix Key Detection Across Multiple Instagram Reels (resolved enharmonic spelling, tuning aware chroma, major/minor profiles)
- [x] Implement robust key estimation with capo-to-shape conversion separation
- [ ] Add further regression tests for pitch-shifted and noisy inputs
- [ ] Implement caching mechanism for repeated audio analysis
- [ ] Evaluate secondary independent key-estimation method

### Frontend (Vite/React/TypeScript)
- [x] Synchronize chord playback display with new backend key estimates
- [ ] Improve UI for distinguishing detected sounding key from guitar chord shapes (capo applied)
- [ ] Add user-requested transpose functionality (display or playback transposition)
- [ ] Optimize frontend bundle size and initial load time
- [ ] Capture and update production screenshots for documentation

### Documentation & Maintenance
- [x] Align all markdown files with the current standalone MVP architecture
- [ ] Continue codebase cleanup of legacy/historical references (as appropriate)

---

> **Note: Historical Documentation**
> For legacy roadmap items (Prisma, Next.js, React Native, etc.), refer to the `docs/archive/` or other legacy architectural documentation which have been preserved for historical context.
