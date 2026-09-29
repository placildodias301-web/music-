"""
Focused tests for the MVP's critical paths and the riskiest behaviour:
input validation, error-message hygiene, the export endpoints, and the
difficulty scoring function. Deliberately small - these cover what would
actually break a demo, not every line.
"""

import os
import shutil
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402
from services.difficulty import rate_difficulty  # noqa: E402

HAS_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# --- health -----------------------------------------------------------

def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# --- analyze validation ----------------------------------------------

def test_analyze_rejects_non_media_file(client):
    r = client.post("/api/analyze", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 400
    assert "audio or video" in r.json()["detail"]


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not installed")
def test_analyze_rejects_corrupt_media_without_leaking_ffmpeg_output(client):
    r = client.post("/api/analyze", files={"file": ("broken.mp3", b"not really audio", "audio/mpeg")})
    assert r.status_code == 400
    detail = r.json()["detail"]
    # Regression guard: ffmpeg's stderr used to be pasted into the response.
    assert "libav" not in detail
    assert "ffmpeg" not in detail.lower()


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not installed")
def test_analyze_detects_key_of_a_real_c_major_tone(client, tmp_path):
    wav = tmp_path / "c.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=261.63:duration=5",
         "-f", "lavfi", "-i", "sine=frequency=329.63:duration=5",
         "-f", "lavfi", "-i", "sine=frequency=392:duration=5",
         "-filter_complex", "amix=inputs=3", "-ac", "1", "-ar", "22050", str(wav)],
        check=True, capture_output=True,
    )
    with open(wav, "rb") as f:
        r = client.post("/api/analyze", files={"file": ("c.wav", f.read(), "audio/wav")})
    assert r.status_code == 200
    body = r.json()
    assert body["key"] == "C Major"
    assert body["isDemo"] is False
    assert body["bpm"] > 0
    assert body["difficulty"]["difficultyLabel"] in {"Beginner", "Intermediate", "Advanced"}


# --- assistant --------------------------------------------------------

def test_assistant_answers_known_topic(client):
    r = client.post("/api/assistant", json={"question": "what is bpm?"})
    assert r.status_code == 200
    assert "Beats Per Minute" in r.json()["answer"]


def test_assistant_rejects_blank_question(client):
    r = client.post("/api/assistant", json={"question": "   "})
    assert r.status_code == 400


def test_assistant_grounds_answer_in_song_context(client):
    r = client.post("/api/assistant", json={
        "question": "what key is this song in?",
        "context": {"fileName": "demo.wav", "key": "G Major", "bpm": 100,
                    "timeSignature": "4/4", "chordProgression": ["G", "D"]},
    })
    assert r.status_code == 200
    assert "G Major" in r.json()["answer"]


# --- exports ----------------------------------------------------------

def test_midi_export_returns_a_real_midi_file(client):
    r = client.post("/api/export/midi", json={"chordProgression": ["C", "G", "Am", "F"], "bpm": 120})
    assert r.status_code == 200
    assert r.content[:4] == b"MThd"  # Standard MIDI File header


def test_pdf_export_returns_a_real_pdf(client):
    r = client.post("/api/export/pdf", json={
        "songTitle": "demo", "key": "C Major", "scale": "C Ionian",
        "bpm": 120, "timeSignature": "4/4", "chordProgression": ["C", "G"],
    })
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


def test_export_rejects_oversized_progression(client):
    r = client.post("/api/export/midi", json={"chordProgression": ["C"] * 5000, "bpm": 120})
    assert r.status_code == 422


def test_export_rejects_absurd_bpm(client):
    r = client.post("/api/export/midi", json={"chordProgression": ["C"], "bpm": 100000})
    assert r.status_code == 422


# --- difficulty engine ------------------------------------------------

def test_difficulty_rates_simple_slow_progression_as_beginner():
    result = rate_difficulty(["C", "G", "Am", "F"], bpm=70, duration_seconds=200, key="C Major")
    assert result["difficultyLabel"] == "Beginner"


def test_difficulty_rates_complex_fast_progression_higher():
    easy = rate_difficulty(["C", "G"], bpm=70, duration_seconds=200, key="C Major")
    hard = rate_difficulty(["F#m", "Bmaj7", "C#dim", "G#m", "D#m", "A#m"],
                           bpm=175, duration_seconds=60, key="F# Minor")
    assert hard["difficultyScore"] > easy["difficultyScore"]
