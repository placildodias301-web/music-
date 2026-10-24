"""/api/sheet/scan: picture of printed music -> MusicXML. The recogniser itself is faked; only the endpoint's rules are tested."""

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["GEMINI_API_KEY"] = ""

import main  # noqa: E402
from main import app  # noqa: E402
from services import sheet_scan  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture()
def client():
    main._request_times.clear()
    with TestClient(app) as c:
        yield c


def test_scan_returns_musicxml(client, monkeypatch):
    monkeypatch.setattr(sheet_scan, "scan", lambda path: "<score-partwise><note/></score-partwise>")
    r = client.post("/api/sheet/scan", files={"file": ("My Page.png", PNG, "image/png")})
    assert r.status_code == 200
    assert r.json() == {"title": "My Page", "musicxml": "<score-partwise><note/></score-partwise>"}


def test_scan_rejects_non_images(client):
    assert client.post("/api/sheet/scan", files={"file": ("song.mp3", PNG, "audio/mpeg")}).status_code == 400
    assert client.post("/api/sheet/scan", files={"file": ("fake.png", b"not a picture at all", "image/png")}).status_code == 400
    assert client.post("/api/sheet/scan", files={"file": ("empty.png", b"", "image/png")}).status_code == 400


def test_scan_reports_unreadable_pages_and_missing_install(client, monkeypatch):
    def unreadable(path):
        raise sheet_scan.SheetScanError("Couldn't find any notes in that picture.")

    monkeypatch.setattr(sheet_scan, "scan", unreadable)
    r = client.post("/api/sheet/scan", files={"file": ("p.jpg", b"\xff\xd8\xff" + b"\x00" * 32, "image/jpeg")})
    assert r.status_code == 400 and "notes" in r.json()["detail"]

    def missing(path):
        raise ImportError("homr")

    monkeypatch.setattr(sheet_scan, "scan", missing)
    r = client.post("/api/sheet/scan", files={"file": ("p.png", PNG, "image/png")})
    assert r.status_code == 503 and "pip install homr" in r.json()["detail"]


def test_audio_endpoint_makes_mp3(client):
    import struct

    pcm = b"\x00\x00" * 4410
    wav = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 44100, 88200, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm
    r = client.post("/api/sheet/audio", files={"file": ("sheet.wav", wav, "audio/wav")})
    if r.status_code == 503:
        pytest.skip("ffmpeg not installed")
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg"
    assert r.content[:3] == b"ID3" or r.content[0] == 0xFF
    assert client.post("/api/sheet/audio", files={"file": ("x.wav", b"not a wav file at all", "audio/wav")}).status_code == 400
