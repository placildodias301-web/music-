# Stem separation pipeline

> **Scope:** this is a standalone offline command-line tool in `docs/stem_separation/`. It is **not wired into the app**: the Stem Splitter screen in the frontend is a preview only, and the backend `/api/stems/*` endpoints are not implemented (see [`../../MVP_PLAN.md`](../../MVP_PLAN.md)).

Splits a track into the most detailed set of stems that open-source models can resolve *honestly*,
checks every stem, and writes a report plus an A/B listening page.

## Install (Windows / macOS / Linux, Python 3.10–3.13)

1. Install FFmpeg and make sure `ffmpeg` and `ffprobe` work in a terminal
   (Windows: `winget install Gyan.FFmpeg`, macOS: `brew install ffmpeg`).
2. Install the Python packages:
   ```
   pip install "audio-separator[gpu]" soundfile pyloudnorm librosa scipy numpy audioread resampy   # NVIDIA GPU
   pip install "audio-separator[cpu]" soundfile pyloudnorm librosa scipy numpy audioread resampy   # no GPU
   ```
   Apple Silicon: the `[cpu]` extra uses the Mac GPU automatically.
3. The first run downloads three model files (about 1.3 GB total) from GitHub into `~/.cache/stem_models`.
   If your network blocks GitHub downloads, download them by hand and put them in that folder.

## Run

```
python stem_pipeline.py "song.mp4" --out stems_out --format wav        # or --format flac
python stem_pipeline.py "song.mp4" --out test_out --start 30 --seconds 25   # 25 s test first
```

Options: `--no-split-vocals`, `--no-drum-kit`, `--models <folder>`. Re-running resumes from the cached stages in `<out>/_work`.

## Speed

CPU: roughly 10–15x the track length for the whole pipeline. A modern NVIDIA GPU is typically 20–50x faster.
(Measured here on a 2-core CPU: 25 s clip = 11 min.)

## Output

`01_lead_vocal`, `02_backing_vocals`, `03_drums`, `04_bass`, `05_guitar`, `06_piano_keys`, `10_residual_other`,
`drum_kit/` (kick, snare, toms, hh, ride, crash), `checks/` (sum of stems and the residual),
`original`, `separation_report.md`, `inspection.json`, `validation.json`, and `preview.html` (open it in a browser).

## Models (all open source)

| Stage | Model |
|---|---|
| 6 stems: vocals, drums, bass, guitar, piano, other | BS-Roformer-SW |
| Lead vs backing vocals | Mel-Roformer Karaoke (aufr33 / viperx) |
| Drum kit pieces | MDX23C DrumSep (aufr33 / jarredou) |

## Limits (by design, not bugs)

- Not 100%: stems are model estimates. The report shows the sum-of-stems error, bleed indicators and a confidence per layer.
- No open model reliably isolates strings, brass, synths, pads or FX. They stay in `10_residual_other` and are labelled *mixed / unresolved*.
- Electric and acoustic guitar share one stem; piano and other keys share one stem.
- A lossy source (MP3/AAC) bakes its artifacts into every stem.
