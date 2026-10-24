"""
Preprocessing (after FFmpeg, before Demucs) and stem quality checks. Offline:
synthetic clean, quiet, clipped, silent, noisy and speech-like audio
(tests/audio_synth.py); Demucs is the fake from test_pipeline.py.
"""

import math

import numpy as np
import pytest
import soundfile as sf
from audio_synth import SR, music, speech, write

from services import stem_separation
from services.pipeline import errors, preprocess
from services.pipeline.config import PIPELINE_VERSION
from services.pipeline.errors import PipelineError
from services.pipeline.preprocess import (NO_MUSIC_SILENT, NO_MUSIC_SPEECH, NOT_MUSICAL, Preprocessed, check_stems,
                                          clipped_fraction, integrated_loudness, k_weighting, pitch_hold,
                                          preprocess_audio, pulse_strength, shift_times)
from test_pipeline import client, fake_demucs, install_manager, needs_ffmpeg, post_file, wait_done  # noqa: F401

pytestmark = pytest.mark.usefixtures("fake_demucs")


def run(tmp_path, y, sr=SR, name="in.wav", **kw):
    return preprocess_audio(write(tmp_path / name, y, sr=sr), str(tmp_path / "audio"), min_seconds=1.0, **kw)


def db(x):
    return 20 * math.log10(x)


# ── loudness (BS.1770) ─────────────────────────────────────────────────

def test_k_weighting_matches_the_standard_at_48k():
    (b1, a1), (b2, a2) = k_weighting(48000)
    assert np.allclose(b1, [1.53512485958697, -2.69169618940638, 1.19839281085285], atol=1e-6)
    assert np.allclose(a1, [1.0, -1.69065929318241, 0.73248077421585], atol=1e-6)
    assert np.allclose(b2, [1.0, -2.0, 1.0]) and np.allclose(a2, [1.0, -1.99004745483398, 0.99007225036621], atol=1e-6)


def test_a_997_hz_sine_at_minus_20_dbfs_measures_minus_20_lufs():
    t = np.arange(SR * 10) / SR
    y = 0.1 * np.sin(2 * np.pi * 997 * t)
    assert integrated_loudness(np.stack([y, y], 1), SR) == pytest.approx(-20.0, abs=0.1)


def test_silence_has_no_loudness():
    assert integrated_loudness(np.zeros((SR * 3, 2)), SR) is None


# ── the stage on synthetic audio ───────────────────────────────────────

def test_clean_music_passes_through_untouched(tmp_path):
    r = run(tmp_path, music())
    m = r.metrics
    assert r.warnings == [] and r.offset == 0.0 and m["gain_db"] == 0.0
    assert (m["trimmed_start"], m["trimmed_end"]) == (0.0, 0.0)
    assert not m["clipping"]["detected"] and not m["noise"]["excessive"] and not m["low_volume"]
    assert m["regions"]["speech_fraction"] < 0.2 and m["regions"]["music_seconds"] >= 11
    assert r.wav_path == str(tmp_path / "in.wav")  # nothing to change, so no new file
    assert (m["sample_rate"], m["channels"]) == (44100, 2) and -25 < m["integrated_lufs"] < -10


def test_quiet_audio_gets_one_gentle_constant_gain(tmp_path):
    y = music() * 10 ** (-40 / 20)
    r = run(tmp_path, y)
    m = r.metrics
    assert m["low_volume"] and 0 < m["gain_db"] <= preprocess.MAX_GAIN_DB
    assert any("very quiet" in w and "raised by" in w for w in r.warnings)
    out, _ = sf.read(r.wav_path, dtype="float32", always_2d=True)
    original, _ = sf.read(str(tmp_path / "in.wav"), dtype="float32", always_2d=True)
    # The same music, only louder: every sample scaled by one constant (no compression, no EQ).
    ratio = out[:, 0] / np.where(np.abs(original[:, 0]) > 1e-3, original[:, 0], np.nan)
    assert np.nanstd(ratio) / np.nanmean(ratio) < 1e-3
    assert np.nanmean(ratio) == pytest.approx(10 ** (m["gain_db"] / 20), rel=1e-3)
    assert db(float(np.abs(out).max())) <= preprocess.PEAK_CEILING_DBFS + 0.01


def test_gain_never_pushes_peaks_past_minus_1_dbfs(tmp_path):
    # Quiet overall (one loud click, the rest very soft): the peak, not the loudness, limits the gain.
    y = music() * 10 ** (-45 / 20)
    y[SR] = 0.5
    m = run(tmp_path, y).metrics
    assert m["gain_db"] == pytest.approx(preprocess.PEAK_CEILING_DBFS - db(0.5), abs=0.05)


def test_loud_audio_is_never_turned_down(tmp_path):
    assert run(tmp_path, music() * 1.9).metrics["gain_db"] == 0.0


def test_clipping_is_detected_and_reported(tmp_path):
    r = run(tmp_path, np.clip(music() * 6, -1, 1))
    assert r.metrics["clipping"]["heavy"] and r.metrics["clipping"]["fraction"] > 0.01
    assert any("heavily clipped" in w for w in r.warnings)


def test_full_scale_peaks_in_a_mastered_song_are_not_clipping():
    y = music()
    y = y / np.abs(y).max()  # peaks touch 0 dBFS once in a while, as mastered audio does
    assert clipped_fraction(np.stack([y, y], 1)) == 0.0


def test_light_clipping_is_a_milder_warning(tmp_path):
    y = music()
    for k in range(16):  # 16 flat-topped runs of 100 samples: ~0.15 % of the samples, under the 1 % "heavy" line
        y[SR // 2 + k * SR // 2: SR // 2 + k * SR // 2 + 100] = 1.0
    r = run(tmp_path, y)
    assert r.metrics["clipping"]["detected"] and not r.metrics["clipping"]["heavy"]
    assert any(w.startswith("Some clipping") for w in r.warnings)


def test_silent_audio_fails_with_a_clear_message(tmp_path):
    with pytest.raises(PipelineError) as e:
        run(tmp_path, np.zeros(SR * 10))
    assert e.value.code == errors.NO_MUSIC and e.value.message == NO_MUSIC_SILENT


def test_a_blip_in_silence_is_not_enough_to_analyse(tmp_path):
    y = np.zeros(SR * 10)
    y[SR * 4:SR * 4 + SR // 3] = music(1.0)[: SR // 3]
    with pytest.raises(PipelineError) as e:
        run(tmp_path, y)
    assert e.value.code == errors.NO_MUSIC


def test_speech_only_audio_is_classified_as_speech(tmp_path):
    r = run(tmp_path, speech())
    assert r.speech_fraction >= preprocess.SPEECH_ONLY_FRACTION
    assert r.metrics["regions"]["speech_like_seconds"] > r.metrics["regions"]["music_seconds"]


def test_noise_is_detected(tmp_path):
    rng = np.random.default_rng(0)
    r = run(tmp_path, music() * 0.5 + rng.standard_normal(SR * 12) * 0.08)
    assert r.metrics["noise"]["excessive"] and any("background noise" in w for w in r.warnings)


def test_edge_silence_is_trimmed_with_a_margin_and_inner_silence_kept(tmp_path):
    gap = np.zeros(SR * 2)  # an intentional 2 s rest inside the song
    y = np.concatenate([np.zeros(SR * 3), music(4), gap, music(4, seed=3), np.zeros(SR * 2)])
    r = run(tmp_path, y)
    m = r.metrics
    assert m["trimmed_start"] == pytest.approx(3.0 - preprocess.TRIM_MARGIN_SECONDS, abs=0.05)
    # Within one analysis frame (~93 ms) plus the last note's decay.
    assert m["trimmed_end"] == pytest.approx(2.0 - preprocess.TRIM_MARGIN_SECONDS, abs=0.15)
    assert r.offset == pytest.approx(m["trimmed_start"], abs=0.0005) and r.duration == pytest.approx(len(y) / SR - m["trimmed_start"] - m["trimmed_end"], abs=0.002)
    out, _ = sf.read(r.wav_path, dtype="float32", always_2d=True)
    original, _ = sf.read(str(tmp_path / "in.wav"), dtype="float32", always_2d=True)
    start = int(round(r.offset * SR))
    assert np.array_equal(out, original[start:start + len(out)])  # the kept audio is sample-identical
    inner = out[int((7.0 - r.offset) * SR) + SR // 4: int((9.0 - r.offset) * SR) - SR // 4]  # 7-9 s in the upload
    assert np.all(inner == 0)  # the inner rest is still there


def test_short_edge_silences_are_left_alone(tmp_path):
    y = np.concatenate([np.zeros(SR // 2), music(6)])
    assert run(tmp_path, y).metrics["trimmed_start"] == 0.0


def test_mono_low_rate_input_is_converted_to_44k_stereo(tmp_path):
    y = music(6, sr=22050)
    sf.write(str(tmp_path / "mono.wav"), y.astype(np.float32), 22050)
    r = preprocess_audio(str(tmp_path / "mono.wav"), str(tmp_path / "audio"), min_seconds=1.0)
    info = sf.info(r.wav_path)
    assert (info.samplerate, info.channels) == (44100, 2) and r.metrics["format_converted"]
    assert info.duration == pytest.approx(6.0, abs=0.01)


# ── stem checks ────────────────────────────────────────────────────────

def stems(tmp_path, mix, vocals_share=0.4, drums_share=0.3, length_change=0):
    paths = {}
    rest = 1.0 - vocals_share
    for name, share in (("vocals", vocals_share), ("no_vocals", rest), ("drums", drums_share * rest)):
        data = mix * share
        if length_change and name == "drums":
            data = np.concatenate([data, np.zeros((length_change, 2), dtype=np.float32)])
        paths[name] = str(tmp_path / f"{name}.wav")
        sf.write(paths[name], data, SR, subtype="FLOAT")
    return paths


def prep_for(path, speech_fraction=0.0):
    return Preprocessed(wav_path=path, offset=0.0, duration=12.0, original_duration=12.0,
                        speech_fraction=speech_fraction, metrics={})


@pytest.fixture
def mix(tmp_path):
    y = np.stack([music(), music()], 1).astype(np.float32)
    path = str(tmp_path / "mix.wav")
    sf.write(path, y, SR, subtype="FLOAT")
    return y, path


def test_healthy_stems_are_ok(tmp_path, mix):
    y, path = mix
    report, warnings = check_stems(stems(tmp_path, y), path, prep_for(path))
    assert warnings == [] and {r["status"] for r in report.values()} == {"ok"}
    assert report["no_vocals"]["relative_db"] == pytest.approx(db(0.6), abs=0.2)
    assert set(report["vocals"]) == {"rms_dbfs", "relative_db", "peak", "active_fraction", "clipped_fraction", "status"}
    assert report["no_vocals"]["musical"] and {"pulse", "pitch_hold"} <= set(report["no_vocals"])


def test_a_stem_of_the_wrong_length_is_a_separation_failure(tmp_path, mix):
    y, path = mix
    with pytest.raises(PipelineError) as e:
        check_stems(stems(tmp_path, y, length_change=SR), path, prep_for(path))
    assert e.value.code == errors.SEPARATION_FAILED


def test_speech_with_no_instruments_fails_as_no_music(tmp_path, mix):
    y, path = mix
    with pytest.raises(PipelineError) as e:
        check_stems(stems(tmp_path, y, vocals_share=1.0), path, prep_for(path, speech_fraction=0.9))
    assert e.value.code == errors.NO_MUSIC and e.value.message == NO_MUSIC_SPEECH


def test_singing_with_no_instruments_only_warns(tmp_path, mix):
    y, path = mix
    report, warnings = check_stems(stems(tmp_path, y, vocals_share=1.0), path, prep_for(path, speech_fraction=0.1))
    assert report["no_vocals"]["status"] == "silent"
    assert warnings == ["No instruments were found (voice only); chords may be missing."]


def test_speech_like_audio_with_real_instruments_never_fails(tmp_path, mix):
    """Rap or spoken word over a band: speech-like, but Demucs finds instruments."""
    y, path = mix
    report, warnings = check_stems(stems(tmp_path, y, vocals_share=0.7), path, prep_for(path, speech_fraction=0.9))
    assert report["no_vocals"]["status"] == "ok"


def leak_stems(tmp_path, voice, instruments=None, leak_db=-9.0):
    """Stems as real Demucs leaves speech: most of it in vocals, a leak of it in the instrument stems
    (optionally on top of real `instruments`)."""
    leak = voice * np.float32(10 ** (leak_db / 20))
    inst = leak if instruments is None else leak + instruments
    data = {"vocals": voice, "no_vocals": inst, "drums": inst * np.float32(0.4)}
    paths = {}
    for name, d in data.items():
        paths[name] = str(tmp_path / f"{name}.wav")
        sf.write(paths[name], d, SR, subtype="FLOAT")
    mix = voice + inst
    sf.write(str(tmp_path / "mix.wav"), mix, SR, subtype="FLOAT")
    return paths, str(tmp_path / "mix.wav")


def stereo32(y):
    return np.stack([y, y], 1).astype(np.float32)


def test_speech_leaking_into_the_instrument_stems_fails_as_no_music(tmp_path):
    """What real Demucs does with speech: the instrument stems are not empty, but they have
    neither a beat nor held notes."""
    paths, mix = leak_stems(tmp_path, stereo32(speech(12)))
    with pytest.raises(PipelineError) as e:
        check_stems(paths, mix, prep_for(mix, speech_fraction=0.5))
    assert e.value.code == errors.NO_MUSIC and e.value.message == NO_MUSIC_SPEECH


def test_unmusical_instruments_without_speech_only_warn(tmp_path):
    paths, mix = leak_stems(tmp_path, stereo32(speech(12)))
    report, warnings = check_stems(paths, mix, prep_for(mix, speech_fraction=0.1))
    assert report["no_vocals"]["musical"] is False and warnings == [NOT_MUSICAL]


def test_speech_over_a_beat_is_music(tmp_path):
    """Rap / spoken word over drums: speech-like, held notes absent, but a clear beat."""
    from drum_synth import drum_track
    drum_track(tmp_path / "beat.wav", bars=6, bpm=92)
    beat, _ = sf.read(str(tmp_path / "beat.wav"), dtype="float32", always_2d=True)
    voice = stereo32(speech(len(beat) / SR))[: len(beat)]
    paths, mix = leak_stems(tmp_path, voice, instruments=beat[: len(voice)])
    report, _ = check_stems(paths, mix, prep_for(mix, speech_fraction=0.9))
    assert report["no_vocals"]["musical"] and report["no_vocals"]["pulse"] >= preprocess.MIN_PULSE


def test_beatless_held_notes_are_music(tmp_path):
    """Solo piano without a beat: no pulse, but notes hold their pitch."""
    t = np.arange(int(1.2 * SR)) / SR
    notes = [np.sin(2 * np.pi * 440 * 2 ** ((m - 69) / 12) * t) * np.exp(-t * 2) for m in (60, 64, 67, 72, 65, 69) * 2]
    piano = stereo32(0.3 * np.concatenate(notes))
    paths, mix = leak_stems(tmp_path, piano * np.float32(0.01), instruments=piano)
    report, _ = check_stems(paths, mix, prep_for(mix, speech_fraction=0.5))
    assert report["no_vocals"]["musical"] and report["no_vocals"]["pitch_hold"] >= preprocess.MIN_PITCH_HOLD


def test_pulse_and_pitch_hold_measures():
    import librosa
    m = librosa.resample(music(), orig_sr=SR, target_sr=22050)
    sp = librosa.resample(speech(), orig_sr=SR, target_sr=22050)
    assert pulse_strength(m) > 0.6 and pitch_hold(m) > 0.8
    assert pulse_strength(sp) < preprocess.MIN_PULSE and pitch_hold(sp) < preprocess.MIN_PITCH_HOLD
    assert pulse_strength(np.zeros(22050 * 3)) == 0.0 and pitch_hold(np.zeros(22050 * 3)) == 0.0


def test_weak_instruments_warn(tmp_path, mix):
    y, path = mix
    report, warnings = check_stems(stems(tmp_path, y, vocals_share=0.95), path, prep_for(path))
    assert report["no_vocals"]["status"] == "weak"
    assert any("instruments are very quiet" in w for w in warnings)


def test_stems_over_full_scale_are_reported(tmp_path, mix):
    y, path = mix
    report, warnings = check_stems(stems(tmp_path, y * 4.0, vocals_share=0.2), path, prep_for(path))
    assert report["no_vocals"]["clipped_fraction"] > 0 and any("exceed full scale" in w for w in warnings)


# ── times back onto the original timeline ──────────────────────────────

def test_shift_times_moves_everything_and_pads_the_trimmed_edges():
    chords = [{"start": 0.0, "end": 4.0, "chord": "C:maj", "simple": "C", "type": "chord"},
              {"start": 4.0, "end": 8.0, "chord": "G:maj", "simple": "G", "type": "chord"}]
    out = shift_times(2.5, beats=[0.0, 0.5], downbeats=[0.0], sections=[{"start": 0.0, "end": 8.0, "label": "verse"}],
                      chords=chords, events=[{"time": 3.0, "type": "possible_fill"}], analysed=8.0, total=12.0)
    assert out["beats"] == [2.5, 3.0] and out["downbeats"] == [2.5]
    assert out["sections"] == [{"start": 2.5, "end": 10.5, "label": "verse"}]
    assert out["events"] == [{"time": 5.5, "type": "possible_fill"}]
    assert [(c["start"], c["end"], c["type"]) for c in out["chords"]] == [
        (0.0, 2.5, "no_chord"), (2.5, 6.5, "chord"), (6.5, 10.5, "chord"), (10.5, 12.0, "no_chord")]


def test_shift_times_extends_an_existing_no_chord_edge_and_is_a_no_op_without_trim():
    chords = [{"start": 0.0, "end": 1.0, "chord": "N", "simple": "N", "type": "no_chord"},
              {"start": 1.0, "end": 5.0, "chord": "C:maj", "simple": "C", "type": "chord"}]
    out = shift_times(1.0, beats=[], downbeats=[], sections=[], chords=chords, events=[], analysed=5.0, total=6.0)
    assert [(c["start"], c["end"]) for c in out["chords"]] == [(0.0, 2.0), (2.0, 6.0)]
    same = shift_times(0.0, beats=[1.0], downbeats=[], sections=[], chords=chords, events=[], analysed=5.0, total=5.0)
    assert same["beats"] == [1.0] and same["chords"] == chords


# ── through the job API ────────────────────────────────────────────────

def wav_file(tmp_path, y, name="song.wav"):
    return (tmp_path / name).read_bytes() if write(tmp_path / name, y) else b""


@needs_ffmpeg
def test_metrics_and_original_timestamps_reach_the_api(client, install_manager, tmp_path):
    install_manager()
    y = np.concatenate([np.zeros(SR * 3), music(8)])
    done = wait_done(client, post_file(client, wav_file(tmp_path, y)).json()["job_id"], timeout=60)
    assert done["status"] == "completed", done
    result = done["result"]
    pre = result["preprocessing"]
    assert result["pipeline_version"] == PIPELINE_VERSION
    assert pre["trimmed_start"] == pytest.approx(2.5, abs=0.05) and pre["trimmed_end"] == 0.0
    assert pre["integrated_lufs"] < 0 and pre["clipping"]["detected"] is False
    assert set(pre["stems"]) == {"vocals", "no_vocals", "drums"} and pre["stems"]["no_vocals"]["status"] == "ok"
    # Times are on the original upload's timeline: the conftest rhythm stub starts its beats at
    # 0.0 of the trimmed audio, which is 2.5 s into the upload; the trimmed start is a no-chord span.
    assert result["audio_duration"] == pytest.approx(11.0, abs=0.01)
    assert result["beats"][0] == pytest.approx(pre["trimmed_start"], abs=0.001)
    assert result["chords"][0]["type"] == "no_chord" and result["chords"][0]["start"] == 0.0
    assert result["chords"][1]["start"] == pytest.approx(pre["trimmed_start"], abs=0.001)
    assert result["chords"][-1]["end"] == result["audio_duration"]


@needs_ffmpeg
def test_a_silent_upload_fails_and_is_not_cached(client, install_manager, tmp_path):
    install_manager()
    data = wav_file(tmp_path, np.zeros(SR * 5))
    done = wait_done(client, post_file(client, data).json()["job_id"])
    assert done["status"] == "failed" and done["error"] == {"code": errors.NO_MUSIC, "message": NO_MUSIC_SILENT}
    assert post_file(client, data).json()["cached"] is False


@needs_ffmpeg
def test_speech_only_upload_fails_as_no_music(client, install_manager, tmp_path, monkeypatch):
    # Demucs puts speech in the vocals stem: nothing left for the instruments.
    monkeypatch.setattr(stem_separation, "separate", lambda wav, progress=None, model=None, device=None: {
        "vocals": wav, "drums": wav * 0.0, "bass": wav * 0.0, "other": wav * 0.0})
    install_manager()
    done = wait_done(client, post_file(client, wav_file(tmp_path, speech())).json()["job_id"], timeout=60)
    assert done["status"] == "failed" and done["error"]["code"] == errors.NO_MUSIC
    assert done["error"]["message"] == NO_MUSIC_SPEECH
