"""
Automated Verification Suite for the 5-Pillar Wilsify Universal Audio Analysis Upgrade:
  1. `G -> C -> D` Standard & Soft-Chord Test (0–2s G at 0.8, 2–4s C at 0.08, 4–6s D at 0.05)
     both with GEMINI_API_KEY active and with GEMINI_API_KEY="".
  2. Passing & Filler Chords (`G -> G/B -> C`, `A -> E/G# -> F#m`, `D -> Dsus4 -> D`)
     retaining 300ms slash passing chords (`role: "passing"`) and sus4 fillers (`role: "filler"`).
  3. Fast 150 BPM Time-Stretch Test (`0.60 <= stretchRatio <= 0.85` and `< 25ms` timestamp drift).
  4. Fingerstyle Intro Solver Test (`string 1–6`, `fret`, `duration`, `leftFinger`, `rightFinger`).
  5. Teacher-Student Self-Learning Test (Teacher correction persisted into
     `backend/data/learned_harmony_rules.json` and subsequent offline `GEMINI_API_KEY=""` run
     produces the corrected chord).
"""
import copy
import json
import os
import sys

import librosa
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import services.analysis_engine as ae
from services.analysis_engine import (
    ANALYSIS_SR,
    LEARNED_HARMONY_RULES_PATH,
    analyze_from_array,
    solve_fingerstyle_notes,
)


def _synth_chord_segment(
    bass_midi: int,
    upper_midis: list[int],
    duration_sec: float,
    sr: int = ANALYSIS_SR,
    amplitude: float = 0.8,
) -> np.ndarray:
    n = int(round(duration_sec * sr))
    t = np.linspace(0.0, duration_sec, n, endpoint=False)
    sig = np.zeros(n, dtype=np.float64)

    f_bass = librosa.midi_to_hz(bass_midi)
    sig += 1.35 * np.sin(2.0 * np.pi * f_bass * t)
    sig += 0.45 * np.sin(2.0 * np.pi * 2.0 * f_bass * t)

    for m in upper_midis:
        f = librosa.midi_to_hz(m)
        sig += 0.90 * np.sin(2.0 * np.pi * f * t)
        sig += 0.30 * np.sin(2.0 * np.pi * 2.0 * f * t)

    env = 0.35 + 0.65 * np.exp(-t / max(duration_sec * 1.5, 0.35))
    atk = min(int(round(0.008 * sr)), n // 4)
    if atk > 1:
        env[:atk] *= np.linspace(0.0, 1.0, atk)

    sig = sig * env
    peak = float(np.max(np.abs(sig)))
    if peak > 1e-9:
        sig = (sig / peak) * amplitude
    return sig.astype(np.float32)


def test_1_g_c_d_standard_and_soft_chord_online_and_offline(monkeypatch):
    """
    1. `G -> C -> D` Standard & Soft-Chord Test:
       Synthesize `0–2s G` at `0.8` amplitude, `2–4s C` at `0.08` amplitude (10x softer),
       and `4–6s D` at `0.05` amplitude (16x softer).
       Assert the output equals `["G", "C", "D"]` with boundary error `< 0.10s`,
       both with `GEMINI_API_KEY` active and with `GEMINI_API_KEY=""`.
    """
    seg_g = _synth_chord_segment(43, [55, 59, 62], 2.0, amplitude=0.80)
    seg_c = _synth_chord_segment(36, [60, 64, 67], 2.0, amplitude=0.08)
    seg_d = _synth_chord_segment(38, [62, 66, 69], 2.0, amplitude=0.05)
    y = np.concatenate([seg_g, seg_c, seg_d])

    # Run 1: Offline / Zero-Quota mode (`GEMINI_API_KEY=""`)
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GEMINI_API_KEY_2", "")
    monkeypatch.setenv("GEMINI_API_KEY_3", "")
    res_offline = analyze_from_array(y, ANALYSIS_SR)

    assert res_offline["chordProgression"] == ["G", "C", "D"], (
        f"Expected ['G', 'C', 'D'] offline, got {res_offline['chordProgression']}"
    )
    tl_off = res_offline["chordTimeline"]
    assert abs(tl_off[0]["start"] - 0.0) < 0.05
    assert abs(tl_off[1]["start"] - 2.0) < 0.05
    assert abs(tl_off[2]["start"] - 4.0) < 0.05
    assert abs(tl_off[2]["end"] - 6.0) < 0.05
    assert res_offline["wilsifyAi"]["source"] == "symbolic_referee"
    assert res_offline["aiSummary"]
    assert res_offline["strummingOrPickingPattern"]
    assert res_offline["capoRecommendation"]
    assert len(res_offline["playingTips"]) >= 2

    # Run 2: Online mode with GEMINI_API_KEY active
    monkeypatch.setenv("GEMINI_API_KEY", "test-active-gemini-key")
    monkeypatch.setattr(
        ae,
        "_call_gemini_teacher_api",
        lambda *_args, **_kwargs: {
            "verified_key": "G Major",
            "verified_time_signature": "4/4",
            "refined_chords": [
                {"chord": "G", "start": 0.0, "end": 2.0, "role": "main"},
                {"chord": "C", "start": 2.0, "end": 4.0, "role": "main"},
                {"chord": "D", "start": 4.0, "end": 6.0, "role": "main"},
            ],
            "ai_summary": "Verified G -> C -> D progression in G Major.",
            "strumming_or_picking_pattern": "D - D U - U D U",
            "capo_recommendation": "No Capo needed in G Major.",
            "playing_tips": ["Anchor ring finger on D4 when switching G to D."],
        },
    )
    res_online = analyze_from_array(y, ANALYSIS_SR)
    assert res_online["chordProgression"] == ["G", "C", "D"]
    assert abs(res_online["chordTimeline"][1]["start"] - 2.0) < 0.05
    assert abs(res_online["chordTimeline"][2]["start"] - 4.0) < 0.05
    assert res_online["wilsifyAi"]["source"] == "gemini-2.5-flash"


def test_2_passing_and_filler_chords_retained(monkeypatch):
    """
    2. Passing & Filler Chords:
       Synthesize `G -> G/B -> C`, `A -> E/G# -> F#m`, and `D -> Dsus4 -> D`.
       Assert `300ms` slash passing chords and `sus4` fillers are retained with
       `role: "passing"` and `role: "filler"`.
    """
    monkeypatch.setenv("GEMINI_API_KEY", "")

    # (A) G (1.7s) -> G/B (0.30s) -> C (2.0s)
    y_gb = np.concatenate(
        [
            _synth_chord_segment(43, [55, 59, 62], 1.70, amplitude=0.8),
            _synth_chord_segment(47, [55, 59, 62], 0.30, amplitude=0.55),
            _synth_chord_segment(36, [60, 64, 67], 2.00, amplitude=0.8),
        ]
    )
    res_gb = analyze_from_array(y_gb, ANALYSIS_SR)
    gb_segs = [s for s in res_gb["chordTimeline"] if s["chord"] == "G/B"]
    assert len(gb_segs) >= 1, f"Expected G/B in {res_gb['chordTimeline']}"
    assert gb_segs[0]["role"] == "passing"

    # (B) A (1.7s) -> E/G# (0.30s) -> F#m (2.0s)
    y_eg = np.concatenate(
        [
            _synth_chord_segment(45, [57, 61, 64], 1.70, amplitude=0.8),
            _synth_chord_segment(44, [52, 56, 59], 0.30, amplitude=0.55),
            _synth_chord_segment(42, [54, 57, 61], 2.00, amplitude=0.8),
        ]
    )
    res_eg = analyze_from_array(y_eg, ANALYSIS_SR)
    eg_segs = [s for s in res_eg["chordTimeline"] if s["chord"] in ("E/G#", "E")]
    assert len(eg_segs) >= 1, f"Expected E/G# in {res_eg['chordTimeline']}"
    assert eg_segs[0]["role"] == "passing"

    # (C) D (1.5s) -> Dsus4 (0.35s) -> D (1.65s)
    y_dsus4 = np.concatenate(
        [
            _synth_chord_segment(38, [62, 66, 69], 1.50, amplitude=0.8),
            _synth_chord_segment(38, [62, 67, 69], 0.35, amplitude=0.6),
            _synth_chord_segment(38, [62, 66, 69], 1.65, amplitude=0.8),
        ]
    )
    res_dsus4 = analyze_from_array(y_dsus4, ANALYSIS_SR)
    sus_segs = [s for s in res_dsus4["chordTimeline"] if s["chord"] == "Dsus4"]
    assert len(sus_segs) >= 1, f"Expected Dsus4 in {res_dsus4['chordTimeline']}"
    assert sus_segs[0]["role"] == "filler"


def test_3_fast_150_bpm_time_stretch_and_rescaling(monkeypatch):
    """
    3. Fast 150 BPM Time-Stretch Test:
       Verify that a `150 BPM` rapid chord progression triggers adaptive slowdown
       (`stretch_ratio` between `0.60` and `0.85`) and accurately rescales timestamps
       back to `1.0x` time (`< 25ms` drift).
    """
    monkeypatch.setenv("GEMINI_API_KEY", "")
    sr = ANALYSIS_SR
    bpm = 150.0
    beat_sec = 60.0 / bpm  # 0.40s per beat
    bar_sec = 4.0 * beat_sec  # 1.60s per 4-beat bar

    # 4 bars at 150 BPM: G (0.0–1.6s), C (1.6–3.2s), D (3.2–4.8s), G (4.8–6.4s)
    seg_g1 = _synth_chord_segment(43, [55, 59, 62], bar_sec, amplitude=0.75)
    seg_c = _synth_chord_segment(36, [60, 64, 67], bar_sec, amplitude=0.75)
    seg_d = _synth_chord_segment(38, [62, 66, 69], bar_sec, amplitude=0.75)
    seg_g2 = _synth_chord_segment(43, [55, 59, 62], bar_sec, amplitude=0.75)
    y = np.concatenate([seg_g1, seg_c, seg_d, seg_g2])

    # Add crisp drum clicks at 150 BPM (every 0.40s) so beat tracker locks onto 150 BPM
    rng = np.random.default_rng(42)
    total_dur = len(y) / sr
    for b_time in np.arange(0.0, total_dur, beat_sec):
        idx = int(round(b_time * sr))
        click_len = min(int(0.012 * sr), len(y) - idx)
        if click_len > 0:
            click = rng.normal(0.0, 0.35, click_len).astype(np.float32) * np.hanning(click_len).astype(np.float32)
            y[idx: idx + click_len] += click

    res = analyze_from_array(y, sr)
    assert res["adaptiveSlowdown"]["applied"] is True
    assert 0.60 <= res["stretchRatio"] <= 0.85

    tl = res["chordTimeline"]
    chords = [s["chord"] for s in tl]
    assert chords[:3] == ["G", "C", "D"], f"Expected ['G', 'C', 'D', ...], got {chords}"
    # Verify rescaled timestamps match 1.0x bar boundaries (1.60s, 3.20s, 4.80s) within < 25ms
    c_seg = next(s for s in tl if s["chord"] == "C")
    d_seg = next(s for s in tl if s["chord"] == "D")
    assert abs(c_seg["start"] - 1.60) < 0.025, f"Expected C start ~1.60s (<25ms), got {c_seg['start']}"
    assert abs(d_seg["start"] - 3.20) < 0.025, f"Expected D start ~3.20s (<25ms), got {d_seg['start']}"


def test_4_fingerstyle_intro_solver_dual_hand():
    """
    4. Fingerstyle Intro Solver Test:
       Verify plucked note events return valid `string (1–6)`, `fret`, `duration`,
       `leftFinger`, and `rightFinger` (`p/i/m/a`).
    """
    timeline = [{"chord": "C", "start": 0.0, "end": 4.0}]
    raw_events = [
        (0.42, 48, 0.25),  # C3 on A string (5th string), fret 3 -> Ring (3), p (Thumb)
        (0.67, 52, 0.25),  # E3 on D string (4th string), fret 2 -> Middle (2), p (Thumb)
        (0.92, 55, 0.25),  # G3 on G string (3rd string), fret 0 -> Open (0), i (Index)
        (1.17, 60, 0.25),  # C4 on B string (2nd string), fret 1 -> Index (1), m (Middle)
        (1.42, 64, 0.30),  # E4 on e string (1st string), fret 0 -> Open (0), a (Ring)
    ]
    solved = solve_fingerstyle_notes(raw_events, timeline, tonic=0, mode="major")
    assert len(solved) == 5
    assert solved[0] == {
        "time": 0.42,
        "duration": 0.25,
        "chord": "C",
        "noteName": "C3",
        "string": 5,
        "stringName": "A (5th string)",
        "fret": 3,
        "leftFinger": "Ring (3)",
        "rightFinger": "p (Thumb)",
    }
    for n in solved:
        assert 1 <= n["string"] <= 6
        assert 0 <= n["fret"] <= 15
        assert "duration" in n and n["duration"] > 0
        assert n["leftFinger"] in ("Open (0)", "Index (1)", "Middle (2)", "Ring (3)", "Pinky (4)")
        assert n["rightFinger"] in ("p (Thumb)", "i (Index)", "m (Middle)", "a (Ring)")


def test_5_teacher_student_self_learning_persistence(monkeypatch):
    """
    5. Teacher-Student Self-Learning Test:
       Verify that a Teacher correction is persisted into `backend/data/learned_harmony_rules.json`
       and a subsequent run with `GEMINI_API_KEY=""` produces the corrected chords offline!
    """
    with open(LEARNED_HARMONY_RULES_PATH, "r", encoding="utf-8") as f:
        original_rules = copy.deepcopy(json.load(f))

    try:
        # Synthesize G (0-2s) -> C (2-4s) -> D (4-6s) where the Teacher refines the final D to D7
        seg_g = _synth_chord_segment(43, [55, 59, 62], 2.0, amplitude=0.8)
        seg_c = _synth_chord_segment(36, [60, 64, 67], 2.0, amplitude=0.8)
        seg_d = _synth_chord_segment(38, [62, 66, 69], 2.0, amplitude=0.8)
        y = np.concatenate([seg_g, seg_c, seg_d])

        # Step 1: Run WITH Teacher API active where Teacher refines the 4.0-6.0s chord from D -> D7
        monkeypatch.setenv("GEMINI_API_KEY", "teacher-self-learning-key")
        monkeypatch.setattr(
            ae,
            "_call_gemini_teacher_api",
            lambda *_args, **_kwargs: {
                "verified_key": "G Major",
                "verified_time_signature": "4/4",
                "refined_chords": [
                    {"chord": "G", "start": 0.0, "end": 2.0, "role": "main"},
                    {"chord": "C", "start": 2.0, "end": 4.0, "role": "main"},
                    {"chord": "D7", "start": 4.0, "end": 6.0, "role": "main"},
                ],
                "ai_summary": "Teacher refined V chord to dominant D7.",
                "strumming_or_picking_pattern": "D - D U - U D U",
                "capo_recommendation": "No Capo needed.",
                "playing_tips": ["Add C4 on the 2nd string 1st fret for D7."],
            },
        )
        res_teacher = analyze_from_array(y, ANALYSIS_SR)
        assert res_teacher["chordProgression"] == ["G", "C", "D7"]

        # Verify that the distilled rule was written to `backend/data/learned_harmony_rules.json`
        with open(LEARNED_HARMONY_RULES_PATH, "r", encoding="utf-8") as f:
            persisted_rules = json.load(f)
        distilled = [
            r
            for r in persisted_rules.get("chord_confusion_fixes", [])
            if r.get("source") == "teacher_distilled" and r.get("corrected_chord") == "D7"
        ]
        assert len(distilled) >= 1, "Expected Teacher correction to be saved in learned_harmony_rules.json"

        # Step 2: Now disable the API key completely (`GEMINI_API_KEY=""`) and run offline!
        monkeypatch.setenv("GEMINI_API_KEY", "")
        monkeypatch.setenv("GEMINI_API_KEY_2", "")
        monkeypatch.setenv("GEMINI_API_KEY_3", "")
        monkeypatch.setattr(ae, "_call_gemini_teacher_api", lambda *_a, **_kw: None)

        res_student_offline = analyze_from_array(y, ANALYSIS_SR)
        assert res_student_offline["wilsifyAi"]["source"] == "symbolic_referee"
        assert res_student_offline["wilsifyAi"]["learnedRulesApplied"] >= 1
        assert res_student_offline["chordProgression"] == ["G", "C", "D7"], (
            f"Expected offline Student to apply learned rule ['G', 'C', 'D7'], got {res_student_offline['chordProgression']}"
        )
    finally:
        # Restore original pre-seeded rules file cleanly
        with open(LEARNED_HARMONY_RULES_PATH, "w", encoding="utf-8") as f:
            json.dump(original_rules, f, indent=2)


# ---------------------------------------------------------------------------
# 6. Audio normalization gate + /api/audio/{media_id} streaming + yt-dlp
#    multi-client fallback.
# ---------------------------------------------------------------------------
import shutil
import subprocess

import pytest

from services import audio_extract, media_fetch


def _ffmpeg_or_skip() -> str:
    ffmpeg = audio_extract.find_ffmpeg()
    if not ffmpeg:
        pytest.skip("ffmpeg is not installed")
    return ffmpeg


def _encode(ffmpeg: str, tmp_path, ext: str, args: list[str]) -> str:
    """Encodes a 2 s G-major tone into `ext` (with a video stream for .mp4)."""
    out = str(tmp_path / f"in{ext}")
    cmd = [ffmpeg, "-y", "-v", "error",
           "-f", "lavfi", "-i", "sine=frequency=196:duration=2",
           *args, out]
    subprocess.run(cmd, check=True, capture_output=True, timeout=60)
    return out


@pytest.mark.parametrize("ext,args", [
    (".mp4", ["-f", "lavfi", "-i", "color=c=black:s=64x64:d=2", "-shortest",
              "-c:v", "libx264", "-c:a", "aac"]),
    (".webm", ["-c:a", "libopus"]),
    (".mkv", ["-c:a", "libvorbis"]),
])
def test_6_ffmpeg_normalization_to_44k_pcm(tmp_path, monkeypatch, ext, args):
    import soundfile as sf

    ffmpeg = _ffmpeg_or_skip()
    monkeypatch.setattr(audio_extract, "PLAYBACK_DIR", str(tmp_path / "playback"))
    try:
        src = _encode(ffmpeg, tmp_path, ext, args)
    except subprocess.CalledProcessError as e:
        pytest.skip(f"this ffmpeg build can't encode {ext}: {e.stderr[-200:]!r}")

    media_id, wav = audio_extract.normalize_for_playback(src)
    info = sf.info(wav)
    assert info.samplerate == 44100
    assert info.channels == 2
    assert info.subtype == "PCM_16"
    assert abs(info.duration - 2.0) < 0.15
    assert audio_extract.playback_path(media_id) == wav


def test_6_playback_path_rejects_traversal_and_unknown_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(audio_extract, "PLAYBACK_DIR", str(tmp_path))
    assert audio_extract.playback_path("../../etc/passwd") is None
    assert audio_extract.playback_path("0" * 32) is None
    assert audio_extract.playback_path("ABC") is None


def test_6_sweep_drops_expired_and_over_cap_copies(tmp_path, monkeypatch):
    monkeypatch.setattr(audio_extract, "PLAYBACK_DIR", str(tmp_path))
    monkeypatch.setattr(audio_extract, "PLAYBACK_MAX_FILES", 2)
    now = 1_000_000.0
    for i, age in enumerate([10, 20, 30, 10 ** 6]):
        p = tmp_path / f"{i:032x}.wav"
        p.write_bytes(b"x")
        os.utime(p, (now - age, now - age))
    audio_extract.sweep_playback_cache(now=now)
    assert sorted(os.listdir(tmp_path)) == [f"{0:032x}.wav", f"{1:032x}.wav"]


def test_6_analyze_returns_audio_url_and_stream_serves_ranges(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    import main

    ffmpeg = _ffmpeg_or_skip()
    monkeypatch.setattr(audio_extract, "PLAYBACK_DIR", str(tmp_path / "playback"))
    # The DSP itself is covered above; here only the ingestion contract matters.
    monkeypatch.setattr(main, "analyze", lambda _wav, _report=None: {
        "chordProgression": ["G"], "bpm": 90.0, "durationSeconds": 2.0, "key": "G",
    })
    monkeypatch.setattr(main, "rate_difficulty", lambda **_k: {"difficultyLabel": "Beginner"})
    src = _encode(ffmpeg, tmp_path, ".webm", ["-c:a", "libopus"])

    with TestClient(main.app) as client:
        with open(src, "rb") as fh:
            r = client.post("/api/analyze", files={"file": ("mic-recording.webm", fh, "audio/webm")})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["chordProgression"] == ["G"]        # existing contract intact
        assert body["audioUrl"] == f"/api/audio/{body['mediaId']}"

        full = client.get(body["audioUrl"])
        assert full.status_code == 200
        assert full.headers["content-type"] == "audio/wav"
        assert full.content[:4] == b"RIFF"

        part = client.get(body["audioUrl"], headers={"Range": "bytes=0-1023"})
        assert part.status_code == 206
        assert len(part.content) == 1024
        assert part.headers["content-range"].startswith("bytes 0-1023/")

        assert client.get("/api/audio/" + "f" * 32).status_code == 404
        assert client.get("/api/audio/not-an-id").status_code == 404


def test_6_youtube_falls_back_across_player_clients(monkeypatch):
    tried = []

    def fake_download(url, request_id, **kw):
        client = kw["extra_opts"]["extractor_args"]["youtube"]["player_client"][0]
        tried.append(client)
        if client != "web":
            raise media_fetch.MediaFetchError("Sign in to confirm you're not a bot")
        return "/tmp/x.m4a", "Song.m4a"

    monkeypatch.setattr(media_fetch, "_download_media", fake_download)
    assert media_fetch._download_youtube_video("https://www.youtube.com/watch?v=abcdefghijk", "abcdefghijk", "r") == (
        "/tmp/x.m4a", "Song.m4a")
    assert tried == ["android", "ios", "web"]


def test_6_youtube_definitive_errors_do_not_retry(monkeypatch):
    tried = []

    def fake_download(url, request_id, **kw):
        tried.append(1)
        raise media_fetch.MediaFetchError("That YouTube video is private or members-only and cannot be analyzed.")

    monkeypatch.setattr(media_fetch, "_download_media", fake_download)
    with pytest.raises(media_fetch.MediaFetchError):
        media_fetch._download_youtube_video("https://youtu.be/abcdefghijk", "abcdefghijk", "r")
    assert tried == [1]


@pytest.mark.parametrize("url,expected", [
    ("https://cdn.example.com/music/song.mp3", True),
    ("https://cdn.example.com/clip.MP4?sig=1", True),
    ("https://www.instagram.com/reel/abc/", False),
])
def test_6_direct_media_links_use_generic_extractor_only_for_files(url, expected):
    assert media_fetch.is_direct_media_url(url) is expected


@pytest.mark.parametrize("url", [
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk",
    "https://www.youtube.com/shorts/abcdefghijk",
    "https://music.youtube.com/watch?v=abcdefghijk",
])
def test_6_supported_youtube_url_shapes(url):
    assert media_fetch.extract_youtube_video_id(url) == "abcdefghijk"
