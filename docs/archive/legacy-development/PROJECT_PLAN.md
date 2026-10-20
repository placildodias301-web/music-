# Wilsify AI — Project Plan

**Document type:** MVP Master Execution Guide  
**Status:** Active  

> **Note: Historical Documentation**
> For legacy roadmap items and multi-service architecture plans, please see `docs/archive/`. This document tracks the current standalone Wilsify AI MVP (FastAPI + React).

---

## 1. Project Status

### Current Architecture

The MVP consists of two independently deployable services:

| Service | Stack | Status |
|---|---|---|
| Backend API | Python 3.12, FastAPI, librosa, basic-pitch | Active |
| Web Frontend | React, Vite, TypeScript, Tailwind | Active |

### Current Health

- Core analysis pipeline is functional.
- Web interface successfully displays processed audio data.
- Capo and pitch-shifting logic has been fixed to ensure the sounding key is accurate.

## 2. Master Roadmap

### Phase 1 — MVP Stabilization (Current)
**Purpose:** Ensure core DSP logic is robust and the frontend correctly visualizes all analysis.
**Goals:** 
- Finalize key and chord estimation improvements.
- Verify real-world edge cases (noisy audio, different tunings).
- Add regression tests.

### Phase 2 — UX Polish
**Purpose:** Make the frontend intuitive and responsive.
**Goals:**
- Implement user-requested transpose functionality.
- Optimize bundle size.
- Refine playback synchronization with chord displays.

### Phase 3 — MVP Launch
**Purpose:** Prepare the standalone application for initial user testing.
**Goals:**
- Finalize documentation (`README.md` and `INSTALLATION.md`).
- Ensure easy local setup.
- Capture production screenshots.

---

## 3. Technical Debt Register

| Issue | Priority | Status |
|---|---|---|
| Need automated frontend tests | Medium | Open |
| Cache processed analysis for repeated requests | Low | Open |
| Evaluate alternative pitch detection libraries | Low | Open |

---

*This document evolves with the MVP. When a phase completes, update its status, check off its tasks, and expand the next phase's checklist.*
