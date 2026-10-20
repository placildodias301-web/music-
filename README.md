# Wilsify AI

An AI-assisted music learning companion. Sign in, upload a song (audio or video) or pick a YouTube video, and Wilsify AI analyses it with a signal-processing pipeline (ffmpeg + librosa, with HMM/Viterbi chord smoothing) to detect **key, tempo (BPM), time signature and a timed chord progression**. You then read a synced chord and lyric sheet and practise along with it.

**Status: MVP in active development — NOT READY for production.** The code for the core loop is complete and automated tests pass in a Linux sandbox, but the real Windows browser run, the Windows command run and the live Supabase migration are still outstanding. See [`docs/verification/FINAL_VERIFICATION_REPORT.md`](./docs/verification/FINAL_VERIFICATION_REPORT.md).

## Core MVP features
- **Accounts:** Supabase email/password sign-in (Google optional).
- **Input:** local audio/video upload, YouTube search/URL import, a built-in sample track and microphone recording.
- **Analysis:** live stage-by-stage progress, then key, BPM, 3/4 or 4/4 meter, timed chords and a difficulty score.
- **Library:** every completed analysis is saved automatically (browser `localStorage`, synced to Supabase `public.user_data` when available) and survives a refresh. Raw audio is not stored.
- **Chord & lyric sheet:** synced playback, `.lrc` or tap-synced lyrics, transpose, capo, chord simplification.
- **Practice Studio:** speed control, looping, metronome, tap tempo and microphone accuracy tracking. After a refresh it works without audio (chord practice) until you re-attach the file.
- **Extras:** chromatic tuner, chord library, AI tutor, MIDI/PDF export.

## Quick start
Follow [`INSTALLATION.md`](./INSTALLATION.md) — the only setup, run, migration and deployment guide.

## Documentation
| Document | What it is |
|---|---|
| [`INSTALLATION.md`](./INSTALLATION.md) | Setup, environment variables, Supabase migration, run, test, deploy, troubleshooting |
| [`MVP_PLAN.md`](./MVP_PLAN.md) | Current scope, task status, roadmap/backlog, known limitations |
| [`docs/verification/FINAL_VERIFICATION_REPORT.md`](./docs/verification/FINAL_VERIFICATION_REPORT.md) | The only verification status (evidence per check) |
| [`docs/verification/TEST_COVERAGE.md`](./docs/verification/TEST_COVERAGE.md) | Test map: 146 backend + 415 frontend tests |
| [`docs/analysis/`](./docs/analysis/) | Project analysis, requirements, feasibility/risks, sources |
| [`docs/README.md`](./docs/README.md) | Full documentation index, including archived legacy material |

## Key known limitations
- Results are estimates: dense or noisy mixes analyse less reliably than clean recordings, and the chord vocabulary is limited to major, minor, 7 and m7 (plus no-chord).
- Meter detection chooses between 4/4 and 3/4 only.
- The **Stem Splitter UI is a preview**; the backend stem endpoints are not implemented.
- Paid plans and the community feed are placeholders ("Coming soon").
- Uploads are capped at 100 MB (YouTube: 20 minutes / 100 MB); the rate limiter is in-process, so run a single backend instance.
- Lint reports 0 errors and 30 warnings; the production bundle is about 1.1 MB.

Full list: [`MVP_PLAN.md`](./MVP_PLAN.md) §10.
