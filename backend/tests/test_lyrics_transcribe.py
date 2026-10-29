"""
Lyrics transcribed from the song's own audio (services/lyrics_transcribe.py).

Offline: Demucs and the Whisper model are replaced by fakes, so these tests
check the parts Wilsify owns: hallucination filtering, line building, the
job flow, quiet sung word retention, multilingual handling, and the API.
"""

import os
import sys
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["GEMINI_API_KEY"] = ""

import main  # noqa: E402
from services import lyrics_transcribe as lt  # noqa: E402
from services import stem_separation as ss  # noqa: E402

SR = ss.SAMPLE_RATE


def w(word, start, end):
    return {"word": word, "start": start, "end": end}


def test_group_lines_breaks_at_breaths_sentences_and_length_and_starts_stanzas_after_silence():
    words = [
        w("I", 1.0, 1.2), w("remember", 1.2, 1.7), w("when", 1.7, 1.9), w("we", 1.9, 2.0), w("met.", 2.0, 2.4),
        w("You", 2.6, 2.8), w("were", 2.8, 3.0), w("there", 3.0, 3.4),
        # breath
        w("and", 4.6, 4.8), w("I", 4.8, 4.9),
        # long silence: new stanza
        w("Chorus", 10.0, 10.5), w("time", 10.5, 11.0),
    ]
    lines = lt.group_lines(words)
    assert [l["text"] for l in lines] == ["I remember when we met.", "You were there", "and I", "Chorus time"]
    assert [l["stanza"] for l in lines] == [0, 0, 0, 1]
    assert lines[0]["start"] == 1.0 and lines[0]["end"] == 2.4
    assert [x["word"] for x in lines[0]["words"]] == ["I", "remember", "when", "we", "met."]

    many = [w(f"w{i}", i * 0.3, i * 0.3 + 0.25) for i in range(25)]
    assert all(len(l["words"]) <= lt.LINE_MAX_WORDS for l in lt.group_lines(many))


def test_words_heard_where_no_voice_sounds_are_dropped():
    vocals = np.zeros(SR * 6, dtype=np.float32)
    t = np.arange(SR * 2) / SR
    vocals[SR : SR * 3] = 0.3 * np.sin(2 * np.pi * 220 * t)  # singing from 1 s to 3 s only
    words = [w("real", 1.2, 1.6), w("also", 2.0, 2.5), w("Thank", 4.5, 4.8), w("you.", 4.8, 5.2)]
    assert [x["word"] for x in lt.voiced_words(words, vocals)] == ["real", "also"]


def test_consonant_preserving_blend_and_peak_normalization():
    vocals = 0.5 * np.sin(np.linspace(0, 1000, SR * 2, dtype=np.float32))
    mix = 0.7 * np.sin(np.linspace(0, 1000, SR * 2, dtype=np.float32))
    out = lt.prepare_vocal_audio(vocals, mix, SR)
    assert len(out) == SR * 2
    peak = float(np.max(np.abs(out)))
    target_amp = 10.0 ** (-1.0 / 20.0)  # ~0.89125
    assert abs(peak - target_amp) < 0.01


def test_quiet_words_at_minus_40db_are_retained():
    vocals = np.zeros(SR * 6, dtype=np.float32)
    # Loud section at peak ~0.8 (establishes 95th percentile RMS)
    t_loud = np.arange(SR * 2) / SR
    vocals[SR : SR * 3] = 0.8 * np.sin(2 * np.pi * 330 * t_loud)
    # Quiet sung verse at -40 dB relative to peak (~0.008 amplitude)
    t_quiet = np.arange(SR) / SR
    vocals[SR * 4 : SR * 5] = 0.008 * np.sin(2 * np.pi * 440 * t_quiet)

    words = [
        w("loud", 1.5, 2.0),
        w("whisper", 4.2, 4.7),  # quiet sung word at -40 dB
        w("phantom", 5.2, 5.6),  # silence gap (<-60 dB)
    ]
    kept = lt.voiced_words(words, vocals, SR)
    kept_words = [x["word"] for x in kept]
    assert "loud" in kept_words
    assert "whisper" in kept_words
    assert "phantom" not in kept_words


def test_silence_hallucinations_are_stripped():
    vocals = np.zeros(SR * 4, dtype=np.float32)
    vocals[SR : SR * 2] = 0.4 * np.sin(np.linspace(0, 500, SR, dtype=np.float32))

    hallucinations = [
        w("Thank you.", 1.2, 1.8),
        w("Thanks for watching!", 1.2, 1.8),
        w("Subtitles by Amara.org", 1.2, 1.8),
        w("please subscribe", 1.2, 1.8),
        w("la la la la la", 1.2, 1.8),
    ]
    for h in hallucinations:
        assert lt.is_hallucination(h["word"]) is True
        assert lt.voiced_words([h], vocals, SR) == []


def test_multilingual_handling_and_language_detection():
    # Multilingual / code-switched phrases
    hindi_words = [w("tum", 1.0, 1.3), w("hi", 1.3, 1.5), w("ho", 1.5, 1.8)]
    lines = lt.group_lines(hindi_words)
    assert lines[0]["text"] == "tum hi ho"

    konkani_words = [w("mog", 1.0, 1.4), w("tuzo", 1.4, 1.8), w("aso", 1.8, 2.2)]
    lines_kok = lt.group_lines(konkani_words)
    assert lines_kok[0]["text"] == "mog tuzo aso"


def test_syllable_accurate_chord_alignment():
    words = [w("Hello", 1.0, 1.5), w("darkness", 1.6, 2.2)]
    timeline = [
        {"chord": "Am", "start": 0.95, "end": 1.5},   # within 0.15s of "Hello" (1.0)
        {"chord": "C/E", "start": 1.62, "end": 2.2},  # inside "darkness"
        {"chord": "G", "start": 3.0, "end": 4.5},    # gap > 1.2s -> instrumental
    ]
    chords = lt.align_chords_to_line(words, 0.9, 4.5, timeline)
    assert len(chords) == 3
    assert chords[0]["chord"] == "Am" and chords[0]["wordIndex"] == 0
    assert chords[1]["chord"] == "C/E" and chords[1]["wordIndex"] == 1
    assert chords[2]["chord"] == "G" and chords[2]["isInstrumental"] is True


def _fake_pipeline(monkeypatch, vocal_gain=0.5, words=None):
    monkeypatch.setattr(ss, "decode_stereo", lambda _p: np.full((2, SR * 4), 0.2, dtype=np.float32) * np.sin(np.linspace(0, 900, SR * 4)))
    monkeypatch.setattr(
        ss,
        "separate",
        lambda wav, progress=None, model=None: {"vocals": wav * vocal_gain, "drums": wav * 0.2, "bass": wav * 0.2, "other": wav * 0.3},
    )
    monkeypatch.setattr(
        lt,
        "transcribe_words",
        lambda _v, language_hint=None: (words if words is not None else [w("hello", 0.5, 0.9), w("world", 0.9, 1.4)], "auto"),
    )


def test_transcribe_file_returns_timed_lines(monkeypatch):
    _fake_pipeline(monkeypatch)
    out = lt.transcribe_file("song.wav")
    assert out["noVocals"] is False
    assert [l["text"] for l in out["lines"]] == ["hello world"]
    assert out["lines"][0]["words"][1]["word"] == "world"
    assert out["lines"][0]["words"][1]["end"] == 1.4
    assert 0.8 <= out["lines"][0]["words"][1]["start"] <= 0.95


def test_an_instrumental_is_reported_as_no_vocals_without_running_speech_to_text(monkeypatch):
    _fake_pipeline(monkeypatch, vocal_gain=0.0001)
    monkeypatch.setattr(lt, "transcribe_words", lambda _v, language_hint=None: pytest.fail("speech-to-text must not run on an instrumental"))
    out = lt.transcribe_file("song.wav")
    assert out["noVocals"] is True and out["lines"] == []


def test_overlong_songs_are_refused(monkeypatch):
    monkeypatch.setattr(ss, "decode_stereo", lambda _p: np.zeros((2, SR * (lt.MAX_SECONDS + 1)), dtype=np.float32))
    with pytest.raises(lt.LyricsError):
        lt.transcribe_file("song.wav")


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def _poll(client, job_id):
    for _ in range(200):
        status = client.get(f"/api/lyrics/job/{job_id}").json()
        if status["status"] in ("complete", "failed"):
            return status
        time.sleep(0.05)
    raise AssertionError("lyrics job never finished")


def test_api_transcribes_an_upload_and_cleans_up_its_copy(client, tmp_path, monkeypatch):
    seen = {}

    def fake(path, progress=lambda *_: None, language_hint=None, chord_timeline=None):
        seen["path"] = path
        progress(50, "Transcribing the vocals…")
        return {
            "lines": [{"text": "hello", "start": 1.0, "end": 1.5, "words": [w("hello", 1.0, 1.5)], "stanza": 0}],
            "words": 1,
            "noVocals": False,
            "model": "fake",
            "language": "auto",
            "seconds": 0.1,
        }

    monkeypatch.setattr(lt, "transcribe_file", fake)
    song = tmp_path / "song.wav"
    sf.write(song, np.zeros(SR // 2, dtype=np.float32), SR)
    with open(song, "rb") as f:
        r = client.post("/api/lyrics/transcribe/upload", files={"file": ("My Song.wav", f, "audio/wav")})
    assert r.status_code == 200, r.text
    status = _poll(client, r.json()["job_id"])
    assert status["status"] == "complete", status
    assert status["result"]["lines"][0]["text"] == "hello"
    assert not os.path.exists(seen["path"])  # the uploaded copy is deleted after the job


def test_api_uses_the_analysis_playback_copy_once_per_song(client, tmp_path, monkeypatch):
    calls = []

    def fake(path, progress=lambda *_: None, language_hint=None, chord_timeline=None):
        calls.append(path)
        return {"lines": [], "words": 0, "noVocals": True, "model": "fake", "language": "auto", "seconds": 0.1}

    monkeypatch.setattr(lt, "transcribe_file", fake)
    playback = tmp_path / "abc123.wav"
    sf.write(playback, np.zeros(SR // 2, dtype=np.float32), SR)
    monkeypatch.setattr(main, "playback_path", lambda media_id: str(playback) if media_id == "abc123" else None)

    first = client.post("/api/lyrics/transcribe", json={"media_id": "abc123"}).json()["job_id"]
    assert _poll(client, first)["result"]["noVocals"] is True
    again = client.post("/api/lyrics/transcribe", json={"media_id": "abc123"}).json()["job_id"]
    assert again == first and len(calls) == 1  # opening the song again doesn't transcribe it twice
    assert playback.exists()  # the playback copy itself is never consumed


def test_api_explains_an_expired_server_copy_and_unknown_jobs(client):
    r = client.post("/api/lyrics/transcribe", json={"media_id": "gone"})
    assert r.status_code == 404 and "Re-attach" in r.json()["detail"]
    assert client.get("/api/lyrics/job/nope").status_code == 404


def test_a_crashing_transcription_fails_cleanly(client, tmp_path, monkeypatch):
    def boom(_path, progress=lambda *_: None, language_hint=None, chord_timeline=None):
        raise RuntimeError("model exploded")

    monkeypatch.setattr(lt, "transcribe_file", boom)
    song = tmp_path / "x.wav"
    sf.write(song, np.zeros(SR // 2, dtype=np.float32), SR)
    with open(song, "rb") as f:
        job = client.post("/api/lyrics/transcribe/upload", files={"file": ("x.wav", f, "audio/wav")}).json()["job_id"]
    status = _poll(client, job)
    assert status["status"] == "failed" and status["error"] == "Lyrics transcription failed for this song."
