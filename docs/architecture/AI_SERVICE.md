# Wilsify AI — AI Service

The AI service is a Python FastAPI microservice responsible for all audio analysis, real-time chord detection, and AI tutor functionality.

**Port:** 8000

**Interactive docs:** `GET /docs` (Swagger UI) or `GET /redoc`

---

## Architecture

```text
┌──────────────────────────────────────────────┐
│  FastAPI app (main.py)                        │
│  5 routers: health, analyze, realtime,        │
│             tutor, status                     │
└──────┬───────────────────────────────────────┘
       │ HTTP
┌──────▼─────────────────┐  ┌────────────────────┐
│  /api/analyze           │  │  Celery workers     │
│  Synchronous pipeline   │  │  fast_queue (~10s)  │
│  called by BullMQ worker│  │  slow_queue (~120s) │
└──────┬──────────────────┘  └────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│  Services layer                                  │
│  audio · bpm · key · chords · difficulty         │
│  midi · sheet · stems · pitch · performance      │
│  tutor · r2                                      │
└──────────────────────────────────────────────────┘
```

---

## Analysis Pipeline

`POST /api/analyze` runs synchronously and is called directly by the Fastify BullMQ worker. It has a 10-minute timeout on the caller side.

### Step 1 — Audio download and decode (`services/audio.py`)

```python
y, sr, duration, tmp_dir = load_audio(audio_url, target_sr=22050)
```

- YouTube URLs: downloaded via `yt-dlp` to a temp directory
- File URLs (R2): downloaded via `httpx`
- Decoded with `librosa.load()` at 22050 Hz mono
- Max size: 100 MB, max duration: 10 minutes (configurable via `MAX_AUDIO_SIZE_BYTES`, `MAX_AUDIO_DURATION_SECONDS`)
- Temp directory is always cleaned up in the `finally` block

---

### Step 2 — BPM detection (`services/bpm.py`)

```python
bpm_result = detect_bpm_multi(y, sr)
# → BpmResult { bpm, confidence, beat_times }
```

Uses `librosa.beat.beat_track()` with three different `start_bpm` seeds and takes the consensus. Returns a `confidence` score based on how many of the three estimates agree.

---

### Step 3 — Key and scale detection (`services/key.py`)

```python
key_result  = detect_key(y, sr)
scale_result = detect_scale(key_result, y, sr)
# → KeyResult { key, mode, key_signature, camelot_key }
# → ScaleResult { scale }
```

Key detection uses the Krumhansl-Schmuckler algorithm: computes a chroma vector and correlates it with major/minor profile templates for all 24 keys. Highest correlation wins.

Scale detection compares the pitch class histogram against known scale patterns.

Camelot notation (used by DJs for harmonic mixing) is derived from key + mode.

---

### Step 4 — Energy calculation

```python
rms   = librosa.feature.rms(y=y)[0]
energy = float(np.clip(np.mean(rms) / (np.max(rms) + 1e-8), 0.0, 1.0))
```

Normalised RMS energy in the range [0, 1].

---

### Step 5 — Chord detection (`services/chords.py`)

```python
chord_result = detect_chords(wav_path)
# → ChordResult { chords: List[ChordItem] }
```

Two-stage pipeline:

1. **basic-pitch** (Spotify's neural network pitch estimator): extracts note events from the WAV file with onset/offset times and pitches.
2. **Template matching**: groups overlapping notes into chords by sliding a time window, then matches the resulting pitch classes against major, minor, dominant 7th, minor 7th, major 7th, sus2, sus4, and diminished templates.

Each chord has `{ name, root, quality, start_time, end_time, confidence }`.

---

### Step 6 — Difficulty rating (`services/difficulty.py`)

```python
difficulty = rate_difficulty(bpm_result.bpm, chord_result.chords, duration)
# → DifficultyResult { score: float, label: str }
```

Heuristic scorer based on:
- BPM (fast = harder)
- Number of unique chords
- Presence of complex chord qualities (7ths, diminished, augmented)
- Average chord duration (shorter = harder)

Labels: `Beginner`, `Easy`, `Intermediate`, `Advanced`, `Expert`.

---

### Step 7 — MIDI export (`services/midi.py`)

```python
midi_path = generate_midi_for_song(chord_result.chords, bpm=bpm_result.bpm, song_id=song_id)
midi_url  = r2_service.upload_midi(midi_path, song_id)
```

Uses `music21` to create a MIDI stream from chord events. Each chord is written as a simultaneous note group at the detected start time. Uploads to R2 at `analyses/{song_id}/midi.mid`.

Only runs if R2 is configured.

---

### Step 8 — Sheet music PDF (`services/sheet.py`)

Runs only when `include_sheet=true` AND `ENABLE_SHEET=true`.

```python
sheet_files = generate_sheet_music(chord_result.chords, song_id, bpm=bpm_result.bpm)
sheet_url   = r2_service.upload_pdf(sheet_files["pdf"], song_id)
```

Pipeline:
1. Convert chords to a `music21.stream.Score`
2. music21 renders to LilyPond `.ly` syntax
3. LilyPond binary compiles to PDF
4. Upload PDF to R2 at `analyses/{song_id}/sheet.pdf`

Requires LilyPond installed on the system. Configurable via `LILYPOND_PATH` env var.

Duration: ~10–30 seconds.

---

### Step 9 — Stem separation (`services/stems.py`)

Runs only when `include_stems=true` AND `ENABLE_STEMS=true`.

```python
stems = separate_stems(wav_path, song_id, output_dir=tmp_dir)
# → { "vocals": path, "drums": path, "bass": path, "other": path }
for stem_name, stem_path in stems.items():
    r2_service.upload_stem(stem_path, song_id, stem_name)
```

Uses **Demucs** `htdemucs` model (4-source separation: vocals, drums, bass, other).

Uploads to:
- `analyses/{song_id}/stems/vocals.wav`
- `analyses/{song_id}/stems/drums.wav`
- `analyses/{song_id}/stems/bass.wav`
- `analyses/{song_id}/stems/other.wav`

Duration: ~60–120 seconds depending on song length. RAM-intensive (~4 GB for a 4-minute track).

---

## Real-Time Chord Detection

`POST /api/realtime/chunk` — called by the Fastify WebSocket server for each audio chunk.

**Auth:** `X-Internal-Secret` header

**Request:**
```json
{
  "session_id": "live_userId",
  "user_id": "clxxx",
  "data": [0.002, -0.001, ...],
  "sample_rate": 44100,
  "channels": 1
}
```

Uses autocorrelation pitch detection (`services/pitch.py`) on a sliding buffer. Returns the detected chord and confidence immediately (target latency: < 100ms).

**Response:**
```json
{
  "chord": "G",
  "confidence": 0.83,
  "timestamp": 1234567890.123,
  "bpm": null
}
```

The backend WebSocket server emits `live:chord-detected` to the connected client immediately after receiving this response.

---

## AI Tutor

`POST /api/tutor/chat`

**Auth:** `X-Internal-Secret` header

The tutor endpoint is also exposed on the **backend** (`/api/v1/tutor/chat`), which handles plan gating, monthly limits, and message trimming before calling the AI provider. The AI service's `/api/tutor/chat` endpoint is for internal use.

**Model selection:**
1. `ANTHROPIC_API_KEY` set → `claude-haiku-4-5-20251001` (primary)
2. `OPENAI_API_KEY` set → `gpt-4o-mini` (fallback)
3. Neither set → mock response with setup hint

System prompt includes: tutor persona, music theory context (key, BPM, scale, chord progression, song title).

---

## Celery Workers

Two queues with separate worker pools:

| Queue | Tasks | Concurrency | Timeout |
|---|---|---|---|
| `fast_queue` | `fast_analyze_task` | 2 workers | — |
| `slow_queue` | `slow_analyze_task`, `separate_stems_task`, `generate_sheet_task` | 1 worker | 720s (slow), 600s (stems), 180s (sheet) |

Task routing is defined in `celery_app.py`:

```python
task_routes = {
    "workers.tasks.fast_analyze_task":    {"queue": "fast_queue"},
    "workers.tasks.slow_analyze_task":    {"queue": "slow_queue"},
    "workers.tasks.separate_stems_task":  {"queue": "slow_queue"},
    "workers.tasks.generate_sheet_task":  {"queue": "slow_queue"},
}
```

Workers restart after 50 tasks (`worker_max_tasks_per_child=50`) to reclaim memory from Demucs/librosa.

### Celery tasks

| Task | Duration | What it does |
|---|---|---|
| `fast_analyze_task` | ~10–30s | BPM + key + chords + difficulty + MIDI |
| `separate_stems_task` | ~60–120s | Demucs htdemucs → 4 stems → R2 |
| `generate_sheet_task` | ~10–30s | music21 + LilyPond → PDF → R2 |
| `slow_analyze_task` | ~120–180s | All three above sequentially |

All tasks post results back to the Fastify backend via `BACKEND_URL` webhook when configured.

---

## Redis Queues

Redis database layout:

| DB | Purpose |
|---|---|
| `redis://redis:6379/0` | Celery broker (tasks) |
| `redis://redis:6379/1` | Celery result backend |

---

## Runtime Setup

This project does not use Docker. Locally and on Railway, the AI service runs directly via Nixpacks (`ai-service/nixpacks.toml`, `ai-service/railway.json`), which installs:
- Python dependencies from `requirements.txt`
- `ffmpeg` (audio decoding)
- `lilypond` (sheet music, if `ENABLE_SHEET=true`)
- `libsndfile` (WAV/FLAC I/O)
- Demucs is installed via pip (`demucs` package which pulls PyTorch)

GPU support: set `USE_GPU=true` and deploy to a GPU-capable host. CPU-only by default.

**Start in development (with live reload):**
```bash
cd ai-service
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Start Celery workers:**
```bash
# Fast queue (2 concurrent)
celery -A celery_app worker --queues fast_queue --concurrency 2 --loglevel info

# Slow queue (1 concurrent — stems are RAM-intensive)
celery -A celery_app worker --queues slow_queue --concurrency 1 --loglevel info
```

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `APP_ENV` | No | `development` | Set to `production` to enable secret validation |
| `AI_SERVICE_SECRET` | Yes (prod) | — | Shared secret; startup FATAL if unset in production |
| `R2_ACCOUNT_ID` | For MIDI/PDF/stems | — | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | For MIDI/PDF/stems | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | For MIDI/PDF/stems | — | R2 secret key |
| `R2_BUCKET_NAME` | No | `wilsify-uploads` | R2 bucket |
| `R2_PUBLIC_URL` | For MIDI/PDF/stems | — | Public CDN URL for uploaded files |
| `CELERY_BROKER_URL` | No | `redis://localhost:6379/0` | Redis broker |
| `CELERY_RESULT_BACKEND` | No | `redis://localhost:6379/1` | Redis results |
| `ANTHROPIC_API_KEY` | For tutor | — | Claude API key (primary tutor) |
| `OPENAI_API_KEY` | For tutor (fallback) | — | OpenAI API key |
| `BACKEND_URL` | For Celery callbacks | — | Fastify URL for webhook callbacks |
| `BACKEND_INTERNAL_SECRET` | For callbacks | — | Same value as `AI_SERVICE_SECRET` on backend |
| `ENABLE_STEMS` | No | `true` | Enable Demucs stem separation |
| `ENABLE_SHEET` | No | `true` | Enable LilyPond sheet music |
| `ENABLE_TUTOR` | No | `true` | Enable AI tutor endpoint |
| `USE_GPU` | No | `false` | Use CUDA for Demucs |
| `MAX_AUDIO_DURATION_SECONDS` | No | `600` | Max audio length (10 min) |
| `MAX_AUDIO_SIZE_BYTES` | No | `104857600` | Max file size (100 MB) |
| `LILYPOND_PATH` | No | auto-detect | Path to LilyPond binary |
| `SENTRY_DSN` | No | — | Sentry error reporting |

---

## Performance Notes

| Operation | Typical duration | Notes |
|---|---|---|
| Audio download | 2–15s | Depends on file size and network |
| BPM detection | ~2s | librosa is fast |
| Key detection | ~1s | — |
| Chord detection | 5–30s | basic-pitch is CPU-bound; longer for longer songs |
| MIDI export | ~1s | music21 is fast for MIDI |
| Sheet music PDF | 10–30s | LilyPond compilation is slow |
| Stem separation | 60–120s | Demucs htdemucs — very CPU/RAM intensive |
| Total (no stems/sheet) | ~15–40s | Typical fast analysis |
| Total (with stems+sheet) | 90–180s | Full Studio/Enterprise analysis |

Demucs `htdemucs` requires ~4 GB of RAM per concurrent job. Keep `slow_queue` concurrency at 1 unless the machine has ≥ 16 GB RAM.

For GPU acceleration, set `USE_GPU=true` and ensure a CUDA 11.8+ environment. Stems separate in ~20s on a T4 GPU vs ~120s on CPU.

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the AI service fits into the wider system
- [API.md](API.md) — the backend endpoints that call into this service
- [../deployment/MONITORING.md](../deployment/MONITORING.md) — Sentry and health checks for this service
- [../development/PERFORMANCE.md](../development/PERFORMANCE.md) — broader performance notes
- [../README.md](../README.md) — documentation map
