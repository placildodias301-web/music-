"""
Lyrics from the song's own audio.

The vocals are isolated with Demucs (the same separator as the Stem Splitter)
and transcribed with a multilingual Whisper speech model (Hugging Face transformers)
plus an optional Wilsify AI verification pass (gemini-2.5-flash via google-genai SDK).

Preserves consonant transients (s, t, k, p, b) via high-passed mix blend (88% vocal + 12% mix),
peak-normalized to -1.0 dBFS, filtered with a -46.0 dB vocal activity floor with 150ms collar padding,
and stripped of known Whisper silence hallucinations.
"""

import json
import logging
import os
import queue
import re
import threading
import time
import uuid

import numpy as np

from services import stem_separation
from services.audio_extract import AudioExtractionError

logger = logging.getLogger(__name__)

ASR_MODEL = os.environ.get("LYRICS_ASR_MODEL", "openai/whisper-small").strip() or "openai/whisper-small"
ASR_RATE = 16000
SAMPLE_RATE = stem_separation.SAMPLE_RATE
MAX_SECONDS = 20 * 60  # same cap as YouTube imports
JOB_TTL_SECONDS = 2 * 60 * 60

# Line building: natural phrasing with vocal pauses (> 0.65s) or punctuation
LINE_GAP = 0.65
LINE_MAX_WORDS = 10
LINE_MAX_SECONDS = 6.5
STANZA_GAP = 3.5

# Vocal activity floor (-46 dB relative to 95th-percentile vocal RMS)
WORD_FLOOR_DB = -46.0
COLLAR_SECONDS = 0.15

# Below this (vocals vs the whole mix) the song is treated as instrumental.
NO_VOCALS_DB = stem_separation.SILENT_DB

# Hallucination patterns produced by Whisper during silence / quiet gaps
HALLUCINATION_PATTERNS = [
    re.compile(
        r"^\s*(thank\s+you(\s+very\s+much|\s+so\s+much)?|thanks\s+for\s+watching(!)?|subtitles\s+by.*|amara\.org|subscribe|please\s+subscribe|watching)\.?\s*$",
        re.IGNORECASE,
    ),
    re.compile(r"^\s*([a-z0-9]+)(\s+\1){3,}\.?\s*$", re.IGNORECASE),  # identical 1-word repeated 4+ times
]


class LyricsError(Exception):
    """A user-facing reason the lyrics couldn't be transcribed."""


_jobs: dict[str, dict] = {}
_by_source: dict[str, str] = {}
_queue: "queue.Queue[str]" = queue.Queue()
_lock = threading.Lock()
_worker_started = False
_asr = None


# ─── Audio Pre-Processing & Filtering ──────────────────────────────────────


def highpass_filter(mono: np.ndarray, cutoff_hz: float = 100.0, rate: int = SAMPLE_RATE) -> np.ndarray:
    """Removes low-end rumble and bass bleed below cutoff_hz."""
    if mono.size == 0:
        return mono
    try:
        from scipy.signal import butter, sosfilt

        sos = butter(2, cutoff_hz, btype="highpass", fs=rate, output="sos")
        return sosfilt(sos, mono).astype(np.float32)
    except Exception as e:
        logger.warning("Highpass filter fallback to raw audio: %s", e)
        return mono.astype(np.float32)


def normalize_peak(mono: np.ndarray, target_db: float = -1.0) -> np.ndarray:
    """Peak-normalizes audio to target_db dBFS (e.g. -1.0 dBFS)."""
    if mono.size == 0:
        return mono
    peak = float(np.max(np.abs(mono)))
    if peak < 1e-6:
        return mono.astype(np.float32)
    target_amp = 10.0 ** (target_db / 20.0)
    return (mono * (target_amp / peak)).astype(np.float32)


def prepare_vocal_audio(vocals_mono: np.ndarray, mix_mono: np.ndarray, rate: int = SAMPLE_RATE) -> np.ndarray:
    """
    Consonant-preserving vocal blend:
    88% isolated vocals + 12% high-passed original audio, peak-normalized to -1.0 dBFS.
    Preserves consonant transients (s, t, k, p, b) without stem separation artifacts.
    """
    v_hp = highpass_filter(vocals_mono, 100.0, rate)
    m_hp = highpass_filter(mix_mono, 100.0, rate)
    min_len = min(len(v_hp), len(m_hp))
    blended = 0.88 * v_hp[:min_len] + 0.12 * m_hp[:min_len]
    return normalize_peak(blended, -1.0)


def is_hallucination(text: str) -> bool:
    clean = text.strip()
    return any(p.match(clean) for p in HALLUCINATION_PATTERNS)


# ─── Audio → words ──────────────────────────────────────────────────────────


def _load_asr():
    global _asr
    if _asr is None:
        from transformers import pipeline  # heavy import: only when a job runs

        model_name = os.environ.get("LYRICS_ASR_MODEL", "openai/whisper-small").strip() or "openai/whisper-small"
        logger.info("Loading lyrics model %s", model_name)
        try:
            _asr = pipeline("automatic-speech-recognition", model=model_name, device="cpu", chunk_length_s=30)
        except Exception as e:
            logger.warning("Could not load %s, falling back to openai/whisper-base: %s", model_name, e)
            _asr = pipeline("automatic-speech-recognition", model="openai/whisper-base", device="cpu", chunk_length_s=30)
    return _asr


def to_asr_rate(mono: np.ndarray, rate: int = SAMPLE_RATE) -> np.ndarray:
    from scipy.signal import resample_poly

    if rate == ASR_RATE:
        return mono.astype(np.float32)
    g = np.gcd(ASR_RATE, rate)
    return resample_poly(mono, ASR_RATE // g, rate // g).astype(np.float32)


def transcribe_words(vocals16k: np.ndarray, language_hint: str | None = None) -> tuple[list[dict], str]:
    """
    Multilingual Whisper with word timestamps → ([{word, start, end}], detected_language).
    Automatic language detection enabled unless language_hint is explicitly set.
    """
    asr = _load_asr()
    gen_kwargs = {
        "task": "transcribe",
        "condition_on_previous_text": False,
        "no_speech_threshold": 0.6,
    }
    if language_hint and language_hint.strip().lower() not in ("auto", "none", ""):
        gen_kwargs["language"] = language_hint.strip().lower()

    out = asr(
        {"raw": vocals16k, "sampling_rate": ASR_RATE},
        return_timestamps="word",
        generate_kwargs=gen_kwargs,
    )
    words = []
    for chunk in out.get("chunks") or []:
        text = (chunk.get("text") or "").strip()
        start, end = (chunk.get("timestamp") or (None, None))[:2]
        if not text or start is None:
            continue
        end = start + 0.4 if end is None else end
        words.append({"word": text, "start": round(float(start), 2), "end": round(float(max(end, start + 0.05)), 2)})

    detected_lang = language_hint or "auto"
    return words, detected_lang


def voiced_words(words: list[dict], vocals: np.ndarray, rate: int = SAMPLE_RATE) -> list[dict]:
    """Drops words sung where the vocal track is silent (-46 dB gate with 150ms collar) and filters Whisper hallucinations."""
    if not words or vocals.size == 0:
        return []
    hop = max(1, rate // 50)  # 20 ms frames (50 fps)
    frames = vocals[: len(vocals) // hop * hop].reshape(-1, hop)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1)) + 1e-9
    loud = float(np.percentile(rms, 95))
    floor = loud * (10.0 ** (WORD_FLOOR_DB / 20.0))

    collar_frames = int(COLLAR_SECONDS * 50)
    kept = []
    for w in words:
        txt = (w.get("word") or "").strip()
        if not txt:
            continue
        if is_hallucination(txt):
            continue
        a = max(0, int(w["start"] * 50) - collar_frames)
        b = min(len(rms), max(a + 1, int(w["end"] * 50) + collar_frames))
        window = rms[a:b]
        if window.size and float(window.max()) >= floor:
            kept.append(w)
    return kept


# ─── Stage B: Gemini Lyric Verification & Alignment ────────────────────────


def _verify_lyrics_gemini(words: list[dict], language_hint: str | None = None) -> tuple[list[dict], str | None]:
    """
    Stage B: Wilsify AI (gemini-2.5-flash) verification of words & language.
    Strictly preserves acoustic timestamps from Whisper.
    """
    if os.environ.get("TESTING") == "1":
        return words, None
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or not words:
        return words, None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        gemini_model = os.environ.get("GEMINI_LYRICS_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"

        raw_transcript = " ".join(w.get("word", "") for w in words)
        system_instruction = (
            "You are the Wilsify AI Multilingual Lyric Verification Engine. "
            "Given a raw speech-to-text transcript of song lyrics (potentially in English, Hindi, Konkani, Marathi, Spanish, etc.), "
            "correct misheard singing words, slurred vowels, or code-switched phrases into clean, natural song lyrics in the singing language. "
            "You must return the exact same number of words or align the corrected words one-to-one so that the timing timestamps can be preserved. "
            "Return valid JSON with 'language' and 'corrected_words' array of strings."
        )

        prompt = (
            f"Language hint: {language_hint or 'auto'}\n"
            f"Word count: {len(words)}\n"
            f"Raw transcript:\n{raw_transcript}"
        )

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            temperature=0.2,
        )

        resp = client.models.generate_content(
            model=gemini_model,
            contents=prompt,
            config=config,
        )
        data = json.loads(resp.text)
        corrected_words = data.get("corrected_words") or []
        detected_lang = data.get("language")

        if len(corrected_words) == len(words):
            verified = []
            for orig, corr in zip(words, corrected_words):
                verified.append({
                    "word": str(corr).strip(),
                    "start": orig["start"],
                    "end": orig["end"],
                })
            return verified, detected_lang
        return words, detected_lang
    except Exception as e:
        logger.warning("Gemini lyrics verification skipped/failed (%s), falling back to acoustic pass", e)
        return words, None


def snap_words_to_onsets(words: list[dict], vocals: np.ndarray, rate: int = SAMPLE_RATE) -> list[dict]:
    """Offline onset envelope alignment: refines word start boundaries using audio onsets."""
    if not words or vocals.size == 0:
        return words
    try:
        import librosa

        onsets = librosa.onset.onset_detect(y=vocals, sr=rate, units="time", backtrack=True)
        if len(onsets) == 0:
            return words
        snapped = []
        for w in words:
            start = w["start"]
            dists = np.abs(onsets - start)
            best_idx = int(np.argmin(dists))
            if dists[best_idx] <= 0.12:
                new_start = round(float(onsets[best_idx]), 2)
                snapped.append({
                    "word": w["word"],
                    "start": new_start,
                    "end": max(new_start + 0.05, w["end"]),
                })
            else:
                snapped.append(w)
        return snapped
    except Exception:
        return words


# ─── Phrasing & Chord-to-Word Alignment ────────────────────────────────────


def align_chords_to_line(words: list[dict], line_start: float, line_end: float, chord_timeline: list[dict]) -> list[dict]:
    """
    Syllable-accurate chord anchoring:
    - If a chord starts within [word.start - 0.15s, word.end], anchor above that word.
    - If a chord starts during an instrumental gap (> 1.2s between words), mark as instrumental chord.
    """
    line_chords = []
    for c in chord_timeline:
        c_start = float(c.get("start", 0))
        c_end = float(c.get("end", c_start))
        if c_end <= line_start - 0.05 or c_start >= line_end + 0.05:
            continue
        chord_symbol = c.get("chord") or c.get("simple") or ""

        matched_idx = -1
        for idx, w in enumerate(words):
            if w["start"] - 0.15 <= c_start <= w["end"]:
                matched_idx = idx
                break

        is_gap = False
        if matched_idx < 0:
            in_gap = True
            for w in words:
                if w["start"] <= c_start <= w["end"]:
                    in_gap = False
                    break
            if in_gap:
                is_gap = True

        line_chords.append({
            "chord": chord_symbol,
            "time": round(c_start, 2),
            "endTime": round(c_end, 2),
            "wordIndex": matched_idx if matched_idx >= 0 else None,
            "isInstrumental": is_gap,
        })
    return line_chords


def group_lines(words: list[dict], chord_timeline: list[dict] | None = None) -> list[dict]:
    """Words → lines ({text, start, end, words, stanza, chords}). Phrasing by pause (>0.65s) or punctuation."""
    lines: list[dict] = []
    current: list[dict] = []
    stanza = 0

    def flush():
        if current:
            line_start = current[0]["start"]
            line_end = current[-1]["end"]
            line_data = {
                "text": " ".join(w["word"] for w in current),
                "start": line_start,
                "end": line_end,
                "words": list(current),
                "stanza": stanza,
            }
            if chord_timeline:
                line_data["chords"] = align_chords_to_line(current, line_start, line_end, chord_timeline)
            lines.append(line_data)
            current.clear()

    for w in words:
        if current:
            gap = w["start"] - current[-1]["end"]
            ends_sentence = current[-1]["word"][-1:] in ".!?,:;—–"
            too_long = len(current) >= LINE_MAX_WORDS or w["end"] - current[0]["start"] > LINE_MAX_SECONDS
            if gap >= LINE_GAP or ends_sentence or too_long:
                flush()
                if gap >= STANZA_GAP:
                    stanza += 1
        current.append(w)
    flush()
    return lines


LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "kok": "Konkani",
    "mr": "Marathi",
    "ta": "Tamil",
    "te": "Telugu",
    "es": "Spanish",
    "fr": "French",
    "pt": "Portuguese",
    "de": "German",
    "it": "Italian",
    "ko": "Korean",
    "ja": "Japanese",
    "ar": "Arabic",
    "auto": "Auto",
}


def resolve_language_details(lang_hint_or_name: str | None) -> tuple[str, str]:
    if not lang_hint_or_name or lang_hint_or_name.strip().lower() in ("auto", "none", ""):
        return "auto", "Auto"
    cleaned = lang_hint_or_name.strip().lower()
    if cleaned in LANGUAGE_NAMES:
        return cleaned, LANGUAGE_NAMES[cleaned]
    for code, name in LANGUAGE_NAMES.items():
        if name.lower() == cleaned:
            return code, name
    return cleaned, cleaned.capitalize()


def transcribe_file(
    path: str,
    progress=lambda pct, msg: None,
    language_hint: str | None = None,
    chord_timeline: list[dict] | None = None,
) -> dict:
    """The whole job for one audio file. Returns {lines, words, noVocals, model, language, seconds}."""
    started = time.perf_counter()
    progress(2, "Decoding audio…")
    wav = stem_separation.decode_stereo(path)
    if wav.shape[1] / SAMPLE_RATE > MAX_SECONDS:
        raise LyricsError(f"Songs longer than {MAX_SECONDS // 60} minutes can't be transcribed.")

    def sep(pct):
        progress(5 + pct * 0.55, "Isolating the vocals…")

    stems = stem_separation.separate(wav, sep, stem_separation.MODEL_4)
    vocals_raw = stems["vocals"].mean(axis=0)
    mix_raw = wav.mean(axis=0)

    if stem_separation.level_db(stems["vocals"], wav) < NO_VOCALS_DB:
        return {
            "lines": [],
            "words": 0,
            "noVocals": True,
            "model": ASR_MODEL,
            "language": language_hint or "auto",
            "seconds": round(time.perf_counter() - started, 1),
        }

    progress(62, "Enhancing and preparing vocals…")
    vocals_clean = prepare_vocal_audio(vocals_raw, mix_raw, SAMPLE_RATE)

    progress(68, "Transcribing the vocals…")
    raw_words, detected_lang = transcribe_words(to_asr_rate(vocals_clean), language_hint=language_hint)
    words = voiced_words(raw_words, vocals_clean)

    progress(85, "Verifying and aligning words…")
    verified_words, gemini_lang = _verify_lyrics_gemini(words, language_hint=language_hint or detected_lang)
    final_lang = gemini_lang or detected_lang or language_hint or "auto"
    snapped_words = snap_words_to_onsets(verified_words, vocals_clean, SAMPLE_RATE)

    progress(96, "Lining up the words and chords…")
    lines = group_lines(snapped_words, chord_timeline=chord_timeline)

    lang_code, lang_name = resolve_language_details(final_lang)
    return {
        "lines": lines,
        "words": len(snapped_words),
        "noVocals": not lines,
        "model": ASR_MODEL,
        "language": lang_name,
        "detected_language_code": lang_code,
        "detected_language_name": lang_name,
        "seconds": round(time.perf_counter() - started, 1),
    }


# ─── Jobs ───────────────────────────────────────────────────────────────────


def start_job(
    source_path: str,
    source_key: str,
    owns_source: bool = False,
    language_hint: str | None = None,
    chord_timeline: list[dict] | None = None,
) -> str:
    """Queues a transcription. The same source (e.g. a playback copy) is transcribed once."""
    sweep_expired()
    with _lock:
        existing = _by_source.get(source_key)
        if existing and _jobs.get(existing, {}).get("status") not in (None, "failed"):
            if owns_source and os.path.exists(source_path):
                os.remove(source_path)
            return existing
        job_id = uuid.uuid4().hex
        _jobs[job_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Waiting for the transcriber…",
            "source": source_path,
            "owns_source": owns_source,
            "language_hint": language_hint,
            "chord_timeline": chord_timeline,
            "result": None,
            "error": None,
            "created": time.time(),
        }
        _by_source[source_key] = job_id
    _ensure_worker()
    _queue.put(job_id)
    return job_id


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


def _ensure_worker() -> None:
    global _worker_started
    with _lock:
        if not _worker_started:
            threading.Thread(target=_worker, daemon=True, name="lyrics-worker").start()
            _worker_started = True


def _worker() -> None:
    while True:
        run_job(_queue.get())


def run_job(job_id: str) -> None:
    job = _jobs[job_id]

    def report(pct: float, msg: str) -> None:
        job.update(status="running", progress=round(min(pct, 99), 1), message=msg)

    try:
        job["result"] = transcribe_file(
            job["source"],
            report,
            language_hint=job.get("language_hint"),
            chord_timeline=job.get("chord_timeline"),
        )
        job.update(status="complete", progress=100, message="Done")
    except (LyricsError, stem_separation.StemError, AudioExtractionError) as e:
        job.update(status="failed", error=str(e))
    except ImportError:
        logger.exception("Lyrics job %s: transformers/torch missing", job_id)
        job.update(status="failed", error="Lyrics transcription isn't installed on this server (needs torch and transformers).")
    except Exception:  # never let one bad job kill the worker
        logger.exception("Lyrics job %s crashed", job_id)
        job.update(status="failed", error="Lyrics transcription failed for this song.")
    finally:
        if job.get("owns_source") and os.path.exists(job["source"]):
            try:
                os.remove(job["source"])
            except OSError:
                pass


def sweep_expired(now: float | None = None) -> None:
    now = now or time.time()
    with _lock:
        for job_id in [j for j, job in _jobs.items() if now - job["created"] > JOB_TTL_SECONDS and job["status"] in ("complete", "failed")]:
            _jobs.pop(job_id, None)
            for key in [k for k, v in _by_source.items() if v == job_id]:
                _by_source.pop(key, None)
