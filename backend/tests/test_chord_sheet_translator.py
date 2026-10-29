"""
Unit tests for the Google Translate-Style Chord Sheet Translator Engine.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["GEMINI_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

import main
from services import lyrics_translator


def test_language_detection():
    # English
    en_code, en_name = lyrics_translator.detect_language("Amazing grace how sweet the sound that saved a wretch like me")
    assert en_code == "en"
    assert en_name == "English"

    # Hindi (Devanagari)
    hi_code, hi_name = lyrics_translator.detect_language("अद्भुत अनुग्रह कितना मधुर यह स्वर जिसने मुझ जैसे को बचाया")
    assert hi_code == "hi"
    assert hi_name == "Hindi"

    # Konkani (Devanagari)
    kok_code, kok_name = lyrics_translator.detect_language("हांव तुजो मोग करतां भोव बरो आवाज आसा")
    assert kok_code == "kok"
    assert kok_name == "Konkani"

    # Konkani (Romi)
    kok_romi_code, kok_romi_name = lyrics_translator.detect_language("Hanv tuka mog sodanch kitem bori sobit kalliz")
    assert kok_romi_code == "kok"
    assert kok_romi_name == "Konkani"

    # Spanish
    es_code, es_name = lyrics_translator.detect_language("Gracia sublime qué dulce es el son con amor y corazón")
    assert es_code == "es"
    assert es_name == "Spanish"


def test_romanization_for_non_latin():
    hindi_text = "अद्भुत अनुग्रह"
    rom = lyrics_translator.romanize_devanagari(hindi_text)
    assert "adbhut" in rom.lower() or "anugrah" in rom.lower()

    hangul_text = "사랑해"
    rom_korean = lyrics_translator.romanize_hangul(hangul_text)
    assert len(rom_korean) > 0


def test_proportional_chord_and_timing_preservation():
    # Line: [G]Amazing [C]grace how [D]sweet the [G]sound
    line = {
        "id": "line-1",
        "text": "Amazing grace how sweet the sound",
        "startTime": 10.0,
        "endTime": 15.0,
        "chords": [
            {"chord": "G", "time": 10.0, "beatOffset": 0.0},
            {"chord": "C", "time": 11.2, "beatOffset": 1.0},
            {"chord": "D", "time": 13.0, "beatOffset": 2.5},
            {"chord": "G", "time": 14.5, "beatOffset": 3.5},
        ],
        "words": [
            {"word": "Amazing", "start": 10.0, "end": 10.8},
            {"word": "grace", "start": 11.0, "end": 11.8},
            {"word": "how", "start": 12.0, "end": 12.5},
            {"word": "sweet", "start": 12.8, "end": 13.5},
            {"word": "the", "start": 13.8, "end": 14.2},
            {"word": "sound", "start": 14.4, "end": 15.0},
        ],
    }

    # Test Hindi translation (offline fallback)
    hi_res = lyrics_translator.translate_chord_sheet([line], target_lang="hi", source_lang="auto")
    assert hi_res["detected_source_lang_code"] == "en"
    assert hi_res["target_lang_code"] == "hi"

    hi_line = hi_res["translated_lines"][0]
    assert len(hi_line["chords"]) == 4
    # All 4 chords preserved in identical sequence
    assert [c["chord"] for c in hi_line["chords"]] == ["G", "C", "D", "G"]
    # Timestamps are within the line's [10.0, 15.0] range
    for c in hi_line["chords"]:
        assert 10.0 <= c["time"] <= 15.0
    for w in hi_line["words"]:
        assert 10.0 <= w["start"] <= w["end"] <= 15.0
    # Romanized words are present for Hindi
    assert hi_line["romanized_text"] is not None
    assert len(hi_line["romanized_words"]) == len(hi_line["words"])

    # Test Spanish translation
    es_res = lyrics_translator.translate_chord_sheet([line], target_lang="es", source_lang="auto")
    assert es_res["target_lang_code"] == "es"
    es_line = es_res["translated_lines"][0]
    assert len(es_line["chords"]) == 4
    assert [c["chord"] for c in es_line["chords"]] == ["G", "C", "D", "G"]

    # Test Konkani translation
    kok_res = lyrics_translator.translate_chord_sheet([line], target_lang="kok", source_lang="auto")
    assert kok_res["target_lang_code"] == "kok"
    kok_line = kok_res["translated_lines"][0]
    assert len(kok_line["chords"]) == 4
    assert [c["chord"] for c in kok_line["chords"]] == ["G", "C", "D", "G"]


def test_api_translate_endpoint():
    client = TestClient(main.app)
    payload = {
        "lines": [
            {
                "id": "l-1",
                "text": "Amazing grace how sweet the sound",
                "startTime": 5.0,
                "endTime": 9.0,
                "chords": [
                    {"chord": "G", "time": 5.0},
                    {"chord": "C", "time": 6.5},
                    {"chord": "D", "time": 8.0},
                ],
            }
        ],
        "target_lang": "hi",
        "source_lang": "auto",
    }
    resp = client.post("/api/lyrics/translate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["detected_source_lang_code"] == "en"
    assert data["target_lang_code"] == "hi"
    assert len(data["translated_lines"]) == 1
    t_line = data["translated_lines"][0]
    assert len(t_line["chords"]) == 3
    assert [c["chord"] for c in t_line["chords"]] == ["G", "C", "D"]
