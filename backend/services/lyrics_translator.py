"""
Google Translate-Style Chord Sheet Translation & Multilingual Audio Engine.

Preserves harmonic alignment: Every chord ([G], [C], [D/F#], [Em7]) and its
karaoke acoustic timing [start, end] is locked to the exact corresponding
translated word/syllable in the target language.

Supports English, Konkani (Romi & Devanagari), Hindi, Marathi, Tamil, Spanish,
French, Portuguese, German, Korean, Japanese, and Arabic.

Provides phonetic Romanization for non-Latin scripts (Devanagari, Hangul, Kana)
so any musician can sing along immediately.

Uses Wilsify AI (gemini-2.5-flash via google-genai) as the primary engine with
local disk caching (backend/data/lyrics_translation_cache.json) and a 100%
offline proportional fallback engine when offline or out of quota.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import unicodedata
from typing import Any

logger = logging.getLogger("wilsify.lyrics_translator")

CACHE_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lyrics_translation_cache.json")

SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "kok": "Konkani",
    "hi": "Hindi",
    "mr": "Marathi",
    "ta": "Tamil",
    "es": "Spanish",
    "fr": "French",
    "pt": "Portuguese",
    "de": "German",
    "ko": "Korean",
    "ja": "Japanese",
    "it": "Italian",
    "ar": "Arabic",
}

NON_LATIN_LANGS = {"hi", "kok", "mr", "ta", "ko", "ja", "ar"}

# ─── Language Detection ────────────────────────────────────────────────────────

def detect_language(text: str) -> tuple[str, str]:
    """
    Detects language from text characters (Unicode ranges) and musical vocabulary.
    Returns (lang_code, lang_name).
    """
    if not text or not text.strip():
        return "en", "English"

    # 1. Unicode Block Scanning
    devanagari_count = len(re.findall(r"[\u0900-\u097F]", text))
    tamil_count = len(re.findall(r"[\u0B80-\u0BFF]", text))
    hangul_count = len(re.findall(r"[\uAC00-\uD7AF\u1100-\u11FF]", text))
    japanese_count = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF]", text))
    arabic_count = len(re.findall(r"[\u0600-\u06FF]", text))

    total_special = devanagari_count + tamil_count + hangul_count + japanese_count + arabic_count
    if total_special > 3:
        if tamil_count > total_special * 0.4:
            return "ta", "Tamil"
        if hangul_count > total_special * 0.4:
            return "ko", "Korean"
        if japanese_count > total_special * 0.4:
            return "ja", "Japanese"
        if arabic_count > total_special * 0.4:
            return "ar", "Arabic"
        if devanagari_count > total_special * 0.4:
            lower_text = text.lower()
            # Distinguish Konkani, Marathi, Hindi
            kok_words = {"हांव", "तुका", "आसा", "भोव", "बरो", "काल", "कितें", "खंय", "कशी", "म्हजो", "तुजो", "मोग"}
            mr_words = {"आहे", "नाही", "माझे", "तुझे", "झाला", "झाली", "मध्ये", "का", "कसा"}
            words = set(re.findall(r"[\u0900-\u097F]+", lower_text))
            if words & kok_words:
                return "kok", "Konkani"
            if words & mr_words:
                return "mr", "Marathi"
            return "hi", "Hindi"

    # 2. Latin Script Keyword Frequency
    lower = f" {text.lower()} "
    words = set(re.findall(r"\b[a-z']+\b", lower))

    # Romi Konkani markers
    kok_romi = {"mog", "tuka", "hanv", "kalliz", "bori", "sobit", "dis", "sodanch", "kitem", "kedna", "re", "go", "mai", "pai", "bhav", "bhoinn", "goa", "konkani", "mhaka", "amcho", "tuzo", "tumkam"}
    if len(words & kok_romi) >= 2:
        return "kok", "Konkani"

    # Spanish markers
    es_markers = {"que", "de", "no", "la", "el", "es", "en", "por", "qué", "me", "una", "te", "los", "se", "con", "para", "mi", "amor", "corazón", "vida"}
    if len(words & es_markers) >= 3:
        return "es", "Spanish"

    # French markers
    fr_markers = {"je", "de", "ne", "pas", "le", "la", "et", "les", "des", "en", "un", "du", "une", "que", "est", "pour", "amour", "toi", "moi", "avec", "dans"}
    if len(words & fr_markers) >= 3:
        return "fr", "French"

    # Portuguese markers
    pt_markers = {"não", "você", "com", "uma", "mais", "como", "mas", "foi", "ao", "ele", "das", "tem", "seu", "sua", "quando", "muito", "amor", "coração", "obrigado"}
    if len(words & pt_markers) >= 3:
        return "pt", "Portuguese"

    # German markers
    de_markers = {"ich", "sie", "das", "ist", "du", "nicht", "die", "und", "es", "der", "wir", "was", "zu", "liebe", "herz"}
    if len(words & de_markers) >= 3:
        return "de", "German"

    return "en", "English"


# ─── Phonetic Romanization ───────────────────────────────────────────────────

DEVANAGARI_MAP = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ः": "h", "्": "",
}

HANGUL_INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
HANGUL_MEDIALS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
HANGUL_FINALS = ["", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lg", "lm", "lb", "ls", "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "h"]


def romanize_devanagari(text: str) -> str:
    """Converts Devanagari text to natural phonetic Latin sing-along script."""
    res: list[str] = []
    i = 0
    chars = list(text)
    n = len(chars)
    while i < n:
        c = chars[i]
        if c in DEVANAGARI_MAP:
            val = DEVANAGARI_MAP[c]
            # Handle implicit schwa 'a' after consonants if not followed by matra or halant
            is_consonant = "\u0915" <= c <= "\u0939"
            next_char = chars[i + 1] if i + 1 < n else ""
            has_matra_or_halant = "\u093E" <= next_char <= "\u094D" or next_char in ("ं", "ः")
            if is_consonant and not has_matra_or_halant and next_char not in (" ", "", "\n", ".", ","):
                res.append(val + "a")
            else:
                res.append(val)
        else:
            res.append(c)
        i += 1
    out = "".join(res)
    # Tidy up common double letters
    out = re.sub(r"aa+", "aa", out)
    out = re.sub(r"ee+", "ee", out)
    return out


def romanize_hangul(text: str) -> str:
    """Converts Korean Hangul to Revised Romanization phonetics."""
    res = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            syl_idx = code - 0xAC00
            initial = syl_idx // (21 * 28)
            medial = (syl_idx % (21 * 28)) // 28
            final = syl_idx % 28
            res.append(HANGUL_INITIALS[initial] + HANGUL_MEDIALS[medial] + HANGUL_FINALS[final])
        else:
            res.append(ch)
    return "".join(res)


def romanize_text(text: str, lang_code: str) -> str:
    """Returns phonetic English-alphabet sing-along text for non-Latin languages."""
    if lang_code in ("hi", "kok", "mr"):
        return romanize_devanagari(text)
    if lang_code == "ko":
        return romanize_hangul(text)
    # For Latin or unsupported, return original stripped
    return text


# ─── Local Multilingual Translation Dictionary (Offline Fallback) ─────────────

# Common musical & lyrical phrases mapped to standard target languages
DICTIONARY_MAP: dict[str, dict[str, str]] = {
    "amazing grace": {
        "hi": "अद्भुत अनुग्रह",
        "kok": "अजापी कृपा",
        "mr": "अद्भुत कृपा",
        "es": "Gracia sublime",
        "fr": "Grâce infinie",
        "pt": "Graça sublime",
        "de": "Erstaunliche Gnade",
        "ko": "놀라운 은혜",
        "ja": "アメイジング・グレイス",
        "ta": "அற்புத கிருபை",
    },
    "how sweet the sound": {
        "hi": "कितना मधुर यह स्वर",
        "kok": "कितलो गोड हो आवाज",
        "mr": "किती मधुर हा नाद",
        "es": "Qué dulce es el son",
        "fr": "Si doux au cœur",
        "pt": "Quão doce o som",
        "de": "Wie süß der Klang",
        "ko": "얼마나 달콤한 소리인가",
        "ja": "甘美なる調べ",
        "ta": "எவ்வளவு இனிமையான ஒலி",
    },
    "that saved a wretch like me": {
        "hi": "जिसने मुझ जैसे पापी को बचाया",
        "kok": "जाणे म्हज्या सारक्याक सांबाळ्ळो",
        "mr": "ज्याने माझ्यासारख्याला तारले",
        "es": "Que salvó a un ser como yo",
        "fr": "Qui sauva un être comme moi",
        "pt": "Que salvou a um réu como eu",
        "de": "Der mich gerettet hat",
        "ko": "나 같은 죄인을 구하셨네",
        "ja": "我を救い給う",
        "ta": "என்னை மீட்டெடுத்ததே",
    },
    "i once was lost": {
        "hi": "मैं पहले खोया था",
        "kok": "हांव पयलीं संदलोलो",
        "mr": "मी हरवला होतो",
        "es": "Perdido estuve yo",
        "fr": "J'étais perdu autrefois",
        "pt": "Eu já fui perdido",
        "de": "Ich war einst verloren",
        "ko": "나 한때 길 잃었으나",
        "ja": "かつて迷いし我",
        "ta": "நான் ஒரு காலத்தில் தொலைந்தேன்",
    },
    "but now am found": {
        "hi": "पर अब मिल गया हूँ",
        "kok": "पूण आतां मेळ्ळो",
        "mr": "पण आता सापडलो",
        "es": "Mas hoy hallado soy",
        "fr": "Mais maintenant retrouvé",
        "pt": "Mas agora fui achado",
        "de": "Doch nun gefunden",
        "ko": "이제는 찾았네",
        "ja": "今は見出されぬ",
        "ta": "இப்போது கண்டெடுக்கப்பட்டேன்",
    },
    "was blind but now i see": {
        "hi": "अंधा था पर अब देखता हूँ",
        "kok": "कुड्डो आशिल्लो पूण आतां दिसता",
        "mr": "आंधळा होतो पण आता पाहतो",
        "es": "Ciego fui mas ya veo hoy",
        "fr": "Aveugle mais je vois",
        "pt": "Era cego e agora vejo",
        "de": "War blind, doch nun seh ich",
        "ko": "눈멀었으나 이제 보네",
        "ja": "見えざる目も今ぞ見る",
        "ta": "குருடனாயிருந்தேன் இப்போது காண்கிறேன்",
    },
    "i love you": {
        "hi": "मैं तुमसे प्यार करता हूँ",
        "kok": "हांव तुजो मोग करतां",
        "mr": "मी तुझ्यावर प्रेम करतो",
        "es": "Te quiero tanto",
        "fr": "Je t'aime",
        "pt": "Eu te amo",
        "de": "Ich liebe dich",
        "ko": "사랑해 그대를",
        "ja": "愛しているよ",
        "ta": "நான் உன்னை காதலிக்கிறேன்",
    },
}

WORD_MAP: dict[str, dict[str, str]] = {
    "love": {"hi": "प्यार", "kok": "मोग", "mr": "प्रेम", "es": "amor", "fr": "amour", "pt": "amor", "de": "Liebe", "ko": "사랑", "ja": "愛", "ta": "அன்பு"},
    "heart": {"hi": "दिल", "kok": "काळिज", "mr": "हृदय", "es": "corazón", "fr": "cœur", "pt": "coração", "de": "Herz", "ko": "마음", "ja": "心", "ta": "இதயம்"},
    "baby": {"hi": "प्रिय", "kok": "बाळ", "mr": "सख्या", "es": "nena", "fr": "bébé", "pt": "amor", "de": "Schatz", "ko": "그대", "ja": "ベイビー", "ta": "அன்பே"},
    "night": {"hi": "रात", "kok": "रात", "mr": "रात्र", "es": "noche", "fr": "nuit", "pt": "noite", "de": "Nacht", "ko": "밤", "ja": "夜", "ta": "இரவு"},
    "day": {"hi": "दिन", "kok": "दीस", "mr": "दिवस", "es": "día", "fr": "jour", "pt": "dia", "de": "Tag", "ko": "하루", "ja": "日", "ta": "நாள்"},
    "forever": {"hi": "सदा", "kok": "सदांच", "mr": "नेहमी", "es": "siempre", "fr": "toujours", "pt": "sempre", "de": "für immer", "ko": "영원히", "ja": "永遠に", "ta": "என்றென்றும்"},
    "dream": {"hi": "सपना", "kok": "स्वप्न", "mr": "स्वप्न", "es": "sueño", "fr": "rêve", "pt": "sonho", "de": "Traum", "ko": "꿈", "ja": "夢", "ta": "கனவு"},
    "light": {"hi": "रोशनी", "kok": "उजवाड", "mr": "प्रकाश", "es": "luz", "fr": "lumière", "pt": "luz", "de": "Licht", "ko": "빛", "ja": "光", "ta": "ஒளி"},
    "you": {"hi": "तुम", "kok": "तूं", "mr": "तू", "es": "tú", "fr": "toi", "pt": "você", "de": "du", "ko": "너", "ja": "君", "ta": "நீ"},
    "me": {"hi": "मुझे", "kok": "म्हाका", "mr": "मला", "es": "mí", "fr": "moi", "pt": "mim", "de": "mich", "ko": "나", "ja": "僕", "ta": "என்னை"},
    "together": {"hi": "साथ", "kok": "सांगाता", "mr": "सोबत", "es": "juntos", "fr": "ensemble", "pt": "juntos", "de": "zusammen", "ko": "함께", "ja": "共に", "ta": "ஒன்றாக"},
    "sky": {"hi": "आसमान", "kok": "मळब", "mr": "आभाळ", "es": "cielo", "fr": "ciel", "pt": "céu", "de": "Himmel", "ko": "하늘", "ja": "空", "ta": "வானம்"},
}


def _offline_translate_line(text: str, target_lang: str) -> str:
    """Translates a single line using phrase matches or word substitutions."""
    low = text.lower().strip()
    # Check known complete phrases
    for phrase, translations in DICTIONARY_MAP.items():
        if phrase in low and target_lang in translations:
            low = low.replace(phrase, translations[target_lang])
            return low

    # Fallback: token-by-token replacement
    words = text.split()
    translated_tokens = []
    for w in words:
        clean = re.sub(r"[^\w]", "", w.lower())
        if clean in WORD_MAP and target_lang in WORD_MAP[clean]:
            trans = WORD_MAP[clean][target_lang]
            translated_tokens.append(trans)
        else:
            translated_tokens.append(w)
    return " ".join(translated_tokens)


# ─── Cache Management ────────────────────────────────────────────────────────

def _load_cache() -> dict[str, Any]:
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Failed to read translation cache: %s", e)
        return {}


def _save_cache(cache: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("Failed to save translation cache: %s", e)


def _cache_key(lines: list[dict], source_lang: str, target_lang: str) -> str:
    chords_repr = ",".join(str([c.get("chord") or c.get("originalChord") for c in l.get("chords", [])]) for l in lines)
    raw = f"{source_lang}->{target_lang}:{chords_repr}:" + "|".join(l.get("text", "") for l in lines)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


# ─── Dual Engine Translation ─────────────────────────────────────────────────

def _translate_with_gemini(
    lines: list[dict],
    source_lang_name: str,
    target_lang: str,
    target_lang_name: str,
) -> list[dict] | None:
    """Calls Gemini 2.5 Flash for natural, singable translation with chord-index mapping."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or os.environ.get("TESTING") == "1":
        return None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        model = os.environ.get("GEMINI_LYRICS_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"

        system_instruction = (
            "You are the Wilsify AI Studio Chord & Lyric Sheet Translator. "
            f"Translate these song lyric lines from {source_lang_name} into singable, rhythmically matched {target_lang_name}. "
            "CRITICAL: Maintain the exact number and musical order of chords. "
            "For each line, return the translated words and specify which translated word index (0-based) receives each chord. "
            "If target language is non-Latin (Devanagari, Korean, Japanese, etc.), also supply phonetic 'romanized_text' and 'romanized_words'. "
            "Return JSON matching: {\"lines\": [{\"id\": \"...\", \"text\": \"...\", \"romanized_text\": \"...\", \"words\": [\"...\"], \"romanized_words\": [\"...\"], \"chord_word_indices\": [0, 2]}]}"
        )

        prompt_data = []
        for l in lines:
            chords_list = [c.get("chord") or c.get("originalChord") for c in l.get("chords", [])]
            prompt_data.append({
                "id": l.get("id"),
                "text": l.get("text", ""),
                "chords": chords_list,
            })

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            temperature=0.2,
        )

        resp = client.models.generate_content(
            model=model,
            contents=json.dumps(prompt_data, ensure_ascii=False),
            config=config,
        )
        data = json.loads(resp.text)
        return data.get("lines")
    except Exception as e:
        logger.warning("Gemini lyrics translation failed: %s. Using local engine.", e)
        return None


def translate_chord_sheet(
    lines: list[dict],
    target_lang: str,
    source_lang: str = "auto",
) -> dict[str, Any]:
    """
    Translates a full Chord & Lyric Sheet, anchoring all chords and timing accurately.
    Returns:
    {
        "detected_source_lang_code": str,
        "detected_source_lang_name": str,
        "target_lang_code": str,
        "target_lang_name": str,
        "translated_lines": list[dict]
    }
    """
    if not lines:
        return {
            "detected_source_lang_code": "en",
            "detected_source_lang_name": "English",
            "target_lang_code": target_lang,
            "target_lang_name": SUPPORTED_LANGUAGES.get(target_lang, target_lang.capitalize()),
            "translated_lines": [],
        }

    # 1. Source Language Detection
    combined_text = " ".join(l.get("text", "") for l in lines)
    if source_lang in ("auto", "", None):
        source_code, source_name = detect_language(combined_text)
    else:
        source_code = source_lang.strip().lower()
        source_name = SUPPORTED_LANGUAGES.get(source_code, source_code.capitalize())

    target_code = target_lang.strip().lower()
    target_name = SUPPORTED_LANGUAGES.get(target_code, target_code.capitalize())

    # Return original if source matches target or target is original
    if target_code == "original" or target_code == source_code:
        return {
            "detected_source_lang_code": source_code,
            "detected_source_lang_name": source_name,
            "target_lang_code": source_code,
            "target_lang_name": source_name,
            "translated_lines": lines,
        }

    # 2. Check Cache
    c_key = _cache_key(lines, source_code, target_code)
    cache = _load_cache()
    if c_key in cache:
        logger.info("Serving translated lyrics from local cache.")
        return cache[c_key]

    # 3. Try Gemini Translation
    gemini_lines = _translate_with_gemini(lines, source_name, target_code, target_name)

    # 4. Process Lines & Map Chords
    translated_lines: list[dict] = []
    gemini_by_id = {g.get("id"): g for g in (gemini_lines or [])}

    for orig in lines:
        line_id = orig.get("id", "")
        orig_text = orig.get("text", "")
        orig_chords = orig.get("chords", [])
        orig_words = orig.get("words", [])
        start_time = orig.get("startTime")
        end_time = orig.get("endTime")

        # Did Gemini succeed for this line?
        g_line = gemini_by_id.get(line_id)
        if g_line and g_line.get("text"):
            trans_text = g_line.get("text", "")
            raw_words = g_line.get("words") or trans_text.split()
            chord_indices = g_line.get("chord_word_indices") or []
            romanized_text = g_line.get("romanized_text") or (
                romanize_text(trans_text, target_code) if target_code in NON_LATIN_LANGS else None
            )
            raw_rom_words = g_line.get("romanized_words") or (
                romanized_text.split() if romanized_text else None
            )
        else:
            # Offline Fallback
            trans_text = _offline_translate_line(orig_text, target_code)
            raw_words = trans_text.split()
            romanized_text = romanize_text(trans_text, target_code) if target_code in NON_LATIN_LANGS else None
            raw_rom_words = romanized_text.split() if romanized_text else None

            # Proportional chord mapping: map each original chord index onto new words count
            chord_indices = []
            for c_idx, _ in enumerate(orig_chords):
                if not raw_words:
                    chord_indices.append(0)
                else:
                    ratio = c_idx / max(1, len(orig_chords) - 1) if len(orig_chords) > 1 else 0
                    mapped_idx = min(len(raw_words) - 1, int(round(ratio * (len(raw_words) - 1))))
                    chord_indices.append(mapped_idx)

        # Build timed words [start, end] interpolated across line duration
        timed_words = []
        n_words = max(1, len(raw_words))
        base_start = start_time if start_time is not None else (orig_words[0]["start"] if orig_words else 0.0)
        base_end = end_time if end_time is not None else (orig_words[-1]["end"] if orig_words else base_start + 3.0)
        dur = max(0.2, base_end - base_start)

        for w_i, w_str in enumerate(raw_words):
            w_start = round(base_start + (w_i / n_words) * dur, 2)
            w_end = round(base_start + ((w_i + 1) / n_words) * dur, 2)
            timed_words.append({
                "word": w_str,
                "start": w_start,
                "end": max(w_end, round(w_start + 0.1, 2)),
                "charStart": trans_text.find(w_str),
            })

        # Build parallel romanized words
        timed_rom_words = None
        if raw_rom_words:
            timed_rom_words = []
            for r_i, r_str in enumerate(raw_rom_words):
                w_start = round(base_start + (r_i / max(1, len(raw_rom_words))) * dur, 2)
                w_end = round(base_start + ((r_i + 1) / max(1, len(raw_rom_words))) * dur, 2)
                timed_rom_words.append({
                    "word": r_str,
                    "start": w_start,
                    "end": max(w_end, round(w_start + 0.1, 2)),
                    "charStart": 0,
                })

        # Anchor chords directly to the translated word positions
        mapped_chords = []
        for i, c in enumerate(orig_chords):
            c_symbol = c.get("chord") or c.get("originalChord") or "C"
            word_target_idx = chord_indices[i] if i < len(chord_indices) else min(i, max(0, len(timed_words) - 1))
            anchor_time = timed_words[word_target_idx]["start"] if timed_words else base_start

            mapped_chords.append({
                "originalChord": c_symbol,
                "chord": c_symbol,
                "time": anchor_time,
                "endTime": anchor_time + 1.5,
                "charIndex": timed_words[word_target_idx]["charStart"] if timed_words else 0,
                "confidence": c.get("confidence", 0.95),
            })

        translated_lines.append({
            "id": line_id,
            "text": trans_text,
            "romanized_text": romanized_text,
            "chords": mapped_chords,
            "words": timed_words,
            "romanized_words": timed_rom_words,
            "startTime": base_start,
            "endTime": base_end,
            "section": orig.get("section"),
            "instrumental": orig.get("instrumental", False),
        })

    result = {
        "detected_source_lang_code": source_code,
        "detected_source_lang_name": source_name,
        "target_lang_code": target_code,
        "target_lang_name": target_name,
        "translated_lines": translated_lines,
    }

    # Save to Cache
    cache[c_key] = result
    _save_cache(cache)

    return result
