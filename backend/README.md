# Wilsify AI — Backend Engine

High-performance Python audio signal processing, neural source separation, and AI music services powered by FastAPI.

---

## Key Modules & Capabilities

1. **Audio Analysis Engine (`services/analysis_engine.py`)**:
   - Constant-Q Transform (CQT) chromagram analysis with harmonic-percussive source separation.
   - Dynamic beat and downbeat tracking with sub-beat chord division.
   - Recognizes major, minor, 7th, m7th, diminished, and slash chords.
   - Fingerstyle intro and hand guide generation (`1-2-3-4` / `p-i-m-a`).
   - Self-learning rule distillation into `data/learned_harmony_rules.json`.

2. **Neural Stem Separation (`services/stem_separation.py`)**:
   - Demucs (`htdemucs`) neural audio separation.
   - Extracts 2 stems (vocals + instrumental) or 4 stems (vocals, drums, bass, other).

3. **Multilingual Lyrics Transcription (`services/lyrics_transcribe.py`)**:
   - Blends 88% isolated vocals + 12% high-passed original audio to preserve consonant transients (`s, t, k, p`).
   - `-46.0 dB` vocal floor with 150ms collar padding and silence hallucination stripping.
   - Automatic language detection using Whisper multilingual ASR.
   - Optional `gemini-2.5-flash` verification pass for singing spellings and vowel glides.

4. **Chord Sheet Translator Engine (`services/lyrics_translator.py`)**:
   - Google Translate-style language detection (`auto`) and translation into 11+ languages.
   - Rhythm-matched lyrics with chords strictly locked to matching translated words.
   - Phonetic Romanization for non-Latin scripts (Hindi, Konkani, Korean, Japanese, Tamil).
   - Local disk cache in `data/lyrics_translation_cache.json`.

5. **AI Music Tutor (`services/assistant_engine.py`)**:
   - Song-grounded music theory tutor referencing active key, chords, and tempo.
   - Gemini API integration with 25-topic rule-based offline fallback bank.

6. **Exports & Media Fetch**:
   - `services/media_fetch.py`: Resilient YouTube & URL ingestion via `yt-dlp`.
   - `services/midi_export.py`: Standard Type-0 MIDI generation (`mido`).
   - `services/pdf_export.py`: Printable vector lead sheet generation (`reportlab`).

---

## Setup & Running

```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\Activate.ps1
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Running Tests
```bash
pytest tests/ -v
```\n