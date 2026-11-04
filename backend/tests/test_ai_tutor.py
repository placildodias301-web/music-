import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["TESTING"] = "1"
os.environ["GEMINI_API_KEY"] = ""  # Test deterministic local rules & guardrail

from services.ai_tutor import ask_music_tutor, is_obviously_off_topic


def test_beginner_question():
    res = ask_music_tutor("How do I play an A major chord?")
    assert res.is_music_related is True
    assert res.difficulty_level == "Beginner"
    assert res.has_widget is True
    assert len(res.options) >= 1
    opt = res.options[0]
    assert len(opt.chords) >= 1
    chord = opt.chords[0]
    assert chord.name == "A"
    assert chord.frets == [-1, 0, 2, 2, 2, 0]
    assert len(chord.midi_notes) >= 3


def test_complex_theory_passing_chord_question():
    res = ask_music_tutor("In guitar to go A to F#m in between I want to put a chord")
    assert res.is_music_related is True
    assert res.has_widget is True
    assert res.difficulty_level in ("Advanced", "Intermediate")
    assert len(res.options) >= 3

    labels = [o.label for o in res.options]
    assert any("E/G#" in l for l in labels)
    assert any("C#7" in l for l in labels)
    assert any("G#dim7" in l for l in labels)

    # Check fret arrays and midi notes for E/G#
    eg_opt = next(o for o in res.options if "E/G#" in o.label)
    assert len(eg_opt.chords) == 3  # A -> E/G# -> F#m
    a_chord, eg_chord, fsm_chord = eg_opt.chords
    assert a_chord.name == "A"
    assert a_chord.frets == [-1, 0, 2, 2, 2, 0]
    assert eg_chord.name == "E/G#"
    assert eg_chord.frets == [4, -1, 2, 4, 5, -1]
    assert fsm_chord.name == "F#m"
    assert fsm_chord.frets == [2, 4, 4, 2, 2, 2]
    assert eg_opt.bass_movement == "A (45) -> G# (44) -> F# (42)"


def test_off_topic_guardrail_refusal():
    res = ask_music_tutor("What is the weather in Mumbai today?")
    assert res.is_music_related is False
    assert res.has_widget is False
    assert res.difficulty_level == "Off-Topic"
    assert len(res.options) == 0
    assert "exclusively" in res.answer_markdown.lower() or "music" in res.answer_markdown.lower()
    assert len(res.follow_up_suggestions) == 3


def test_off_topic_detector():
    assert is_obviously_off_topic("What is the temperature in London?") is True
    assert is_obviously_off_topic("Write python code for a flask app") is True
    assert is_obviously_off_topic("Who won the football world cup?") is True
    assert is_obviously_off_topic("How do I play guitar chords?") is False
    assert is_obviously_off_topic("Tell me about polyrhythms in drums") is False


def test_tutor_api_endpoint():
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        r = client.post("/api/tutor/ask", json={"question": "In guitar to go A to F#m in between I want to put a chord"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_music_related"] is True
        assert data["has_widget"] is True
        assert len(data["options"]) >= 3

        r_off = client.post("/api/tutor/ask", json={"question": "What is the weather in Mumbai today?"})
        assert r_off.status_code == 200
        data_off = r_off.json()
        assert data_off["is_music_related"] is False
        assert data_off["has_widget"] is False
        assert data_off["difficulty_level"] == "Off-Topic"
