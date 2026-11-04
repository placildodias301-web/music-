"""
AI Tutor cost control: the shared response cache, the free-tier daily quota, Pro,
and which answers are free (off-topic, built-in tutor, cache hits, failures).
Gemini is replaced by a counting fake; nothing leaves the machine.
"""
import os
import sys
import time

import pytest

os.environ["TESTING"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import ai_tutor as at  # noqa: E402
from services.ai_tutor import TutorQuota, TutorResponse, TutorResponseCache, tutor_cache_key  # noqa: E402

GEMINI_ANSWER = TutorResponse(
    is_music_related=True, difficulty_level="Intermediate", answer_markdown="Use E/G# between A and F#m.",
)


@pytest.fixture
def tutor(monkeypatch, tmp_path):
    """Fresh cache (in tmp), a 3-per-day quota, and a fake Gemini that counts its calls."""
    calls = []
    state = {"answer": GEMINI_ANSWER}

    def fake_gemini(question, context=None, history=None):
        calls.append(question)
        return state["answer"]

    monkeypatch.setattr(at, "_query_gemini", fake_gemini)
    monkeypatch.setattr(at, "TUTOR_CACHE", TutorResponseCache(str(tmp_path / "tutor_cache.json")))
    monkeypatch.setattr(at, "TUTOR_QUOTA", TutorQuota(daily_limit=3, ip_limit=9))
    monkeypatch.delenv("TUTOR_PRO_CLIENT_IDS", raising=False)
    monkeypatch.delenv("TUTOR_PRO_USER_IDS", raising=False)
    return calls, state, tmp_path


def ask(q, client="client-aaaa1111", ip="10.0.0.1", **kw):
    return at.answer_with_budget(q, kw.pop("context", None), kw.pop("history", None), client_id=client, ip=ip, **kw)


# ── cache key ──────────────────────────────────────────────────────────────

def test_cache_key_ignores_wording_but_not_direction_or_key():
    a = tutor_cache_key("How to go from A to F#m?", {"key": "A"})
    assert a == tutor_cache_key("how do I go from A to F#m", {"key": "A"})
    assert a != tutor_cache_key("How to go from F#m to A?", {"key": "A"})  # the other way round
    assert a != tutor_cache_key("How to go from A to F#m?", {"key": "D"})  # answers are written in the song's key
    assert tutor_cache_key("How to play a B minor chord", None) == tutor_cache_key("how to play a b minor chord?", None)


def test_follow_ups_are_not_standalone():
    assert not at.is_standalone_question("explain that again")
    assert not at.is_standalone_question("Can you show another one?")
    assert at.is_standalone_question("How do I play a G/B chord?")


# ── cache ──────────────────────────────────────────────────────────────────

def test_repeat_question_is_served_from_cache_without_gemini_or_quota(tutor):
    calls, _, _ = tutor
    first, meta1 = ask("Which scale works over a slow minor blues?")
    assert meta1["source"] == "gemini" and meta1["cached"] is False and len(calls) == 1
    assert meta1["quota"]["remaining_free"] == 2

    started = time.perf_counter()
    second, meta2 = ask("which scale works over a slow minor blues", client="client-bbbb2222", ip="10.0.0.2")  # another user
    elapsed = time.perf_counter() - started
    assert meta2 == {**meta2, "source": "cache", "cached": True}
    assert meta2["quota"]["cached"] is True and meta2["quota"]["remaining_free"] == 3  # not charged
    assert second.answer_markdown == first.answer_markdown and len(calls) == 1
    assert elapsed < 0.005, f"cache hit took {elapsed * 1000:.1f} ms"


def test_cache_survives_a_restart_and_is_capped(tutor, tmp_path):
    path = str(tmp_path / "lru.json")
    cache = TutorResponseCache(path, max_entries=3)
    for i in range(5):
        cache.put(f"q{i}", GEMINI_ANSWER)
    reloaded = TutorResponseCache(path, max_entries=3)
    assert len(reloaded) == 3
    assert reloaded.get("q0") is None and reloaded.get("q4") is not None
    reloaded.get("q2")  # touch: now most recent
    reloaded.put("q5", GEMINI_ANSWER)
    assert reloaded.get("q3") is None and reloaded.get("q2") is not None  # least recently used went first


def test_corrupt_cache_file_starts_empty(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text("{not json", encoding="utf-8")
    assert len(TutorResponseCache(str(path))) == 0


def test_follow_up_with_history_is_not_cached(tutor):
    calls, _, _ = tutor
    history = [{"role": "user", "text": "Which scale works over a slow minor blues?"}, {"role": "assistant", "text": "D Dorian."}]
    ask("explain that again", history=history)
    _, meta = ask("explain that again", history=history)
    assert meta["source"] == "gemini" and len(calls) == 2


# ── what is free ───────────────────────────────────────────────────────────

def test_off_topic_is_free_and_never_cached(tutor):
    calls, _, _ = tutor
    resp, meta = ask("What is the weather in Mumbai today?")
    assert resp.is_music_related is False and meta["source"] == "off_topic"
    assert not calls and meta["quota"]["remaining_free"] == 3


def test_gemini_refusal_is_free_and_not_cached(tutor):
    calls, state, _ = tutor
    state["answer"] = TutorResponse(is_music_related=False, difficulty_level="Off-Topic", answer_markdown="Music only!")
    ask("Write me a poem about my cat's birthday party")
    _, meta = ask("Write me a poem about my cat's birthday party")
    assert len(calls) == 2 and meta["quota"]["remaining_free"] == 3


def test_failed_gemini_falls_back_free_and_uncached(tutor):
    calls, state, _ = tutor
    state["answer"] = None  # error, 429, no key
    resp, meta = ask("Which scale fits a ii-V-I in Bb?")
    assert meta["source"] == "fallback" and resp.is_music_related and meta["quota"]["remaining_free"] == 3
    state["answer"] = GEMINI_ANSWER
    _, meta = ask("Which scale fits a ii-V-I in Bb?")
    assert meta["source"] == "gemini"  # the failure was not cached


def test_local_knowledge_answers_are_free(tutor):
    calls, _, _ = tutor
    _, meta = ask("In guitar to go A to F#m in between I want to put a chord")
    assert meta["source"] == "local" and not calls and meta["quota"]["remaining_free"] == 3


# ── quota and Pro ──────────────────────────────────────────────────────────

def test_free_quota_runs_out_and_falls_back_to_the_built_in_tutor(tutor):
    calls, _, _ = tutor
    for i in range(3):
        _, meta = ask(f"Explain modal interchange example {i} in C major")
    assert meta["quota"]["remaining_free"] == 0 and len(calls) == 3
    resp, meta = ask("What is a Neapolitan sixth chord used for?")
    assert meta["quota_exceeded"] is True and meta["source"] == "fallback" and len(calls) == 3
    assert "free live AI answers" in resp.answer_markdown
    _, meta = ask("Explain modal interchange example 0 in C major")
    assert meta["cached"] is True  # cache hits keep working after the limit


def test_pro_is_unlimited_and_server_decided(tutor, monkeypatch):
    calls, _, _ = tutor
    monkeypatch.setenv("TUTOR_PRO_CLIENT_IDS", "client-pro99999")
    for i in range(5):
        _, meta = ask(f"Pro question number {i} about voice leading", client="client-pro99999")
    assert meta["quota"] == {"remaining_free": None, "daily_limit": 3, "is_pro": True, "cached": False}
    assert len(calls) == 5
    monkeypatch.setenv("TUTOR_PRO_USER_IDS", "user-123")
    _, meta = ask("A signed-in pro user's question on reharmonisation", client="client-zzzz0000", user_id="user-123")
    assert meta["quota"]["is_pro"] is True


def test_rotating_client_ids_cannot_reset_the_quota(tutor):
    for i in range(12):
        _, meta = ask(f"Rotating question {i} about chord inversions", client=f"client-rot{i:05d}", ip="10.9.9.9")
    assert meta["quota_exceeded"] is True  # the address ceiling (9) stopped it


def test_quota_resets_every_day():
    now = [1_700_000_000.0]
    q = TutorQuota(daily_limit=2, ip_limit=10, clock=lambda: now[0])
    q.consume("id:a", "ip")
    q.consume("id:a", "ip")
    assert q.remaining("id:a", "ip") == 0
    now[0] += 86_400
    assert q.remaining("id:a", "ip") == 2


def test_malformed_client_id_falls_back_to_the_address():
    assert at.client_key("short", "1.2.3.4") == "ip:1.2.3.4"
    assert at.client_key("../../etc/passwd", "1.2.3.4") == "ip:1.2.3.4"
    assert at.client_key("client-aaaa1111", "1.2.3.4") == "id:client-aaaa1111"


# ── API ────────────────────────────────────────────────────────────────────

def test_api_reports_quota_and_cache(tutor):
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as client:
        h = {"X-Client-ID": "client-api00001"}
        assert client.get("/api/tutor/quota", headers=h).json() == {
            "remaining_free": 3, "daily_limit": 3, "is_pro": False, "cached": False}
        body = {"question": "Which scale works over a slow minor blues?", "is_pro": True}  # a client can't make itself Pro
        r1 = client.post("/api/tutor/ask", json=body, headers=h).json()
        assert r1["cached"] is False and r1["quota"]["remaining_free"] == 2 and r1["quota"]["is_pro"] is False
        r2 = client.post("/api/tutor/ask", json=body, headers=h).json()
        assert r2["cached"] is True and r2["quota"] == {"remaining_free": 2, "daily_limit": 3, "is_pro": False, "cached": True}
        assert r2["answer_markdown"] == r1["answer_markdown"]
        assert client.get("/api/tutor/quota", headers=h).json()["remaining_free"] == 2
