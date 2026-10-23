"""Shared test setup. Kept offline: no model is ever loaded or downloaded."""

import pytest


@pytest.fixture(autouse=True)
def fake_rhythm(monkeypatch):
    """
    Every pipeline job gets a fixed rhythm result instead of running allin1 /
    beat_this. test_pipeline_rhythm.py overrides this fixture to test the real stage.
    """
    from services.pipeline import jobs
    from services.pipeline.rhythm_stage import RhythmResult

    def analyze_rhythm(stem_path, workdir, *, duration, config, remaining, progress):
        progress(50)
        beats = [round(i * 0.5, 3) for i in range(int(duration / 0.5) + 1)]
        return RhythmResult(engine="beat_this@cpu", bpm=120.0, time_signature="4/4",
                            beats=beats, downbeats=beats[::4], sections=[], warnings=[])

    monkeypatch.setattr(jobs, "analyze_rhythm", analyze_rhythm)


@pytest.fixture(autouse=True)
def fake_chords(monkeypatch):
    """
    Every pipeline job gets a fixed chord timeline instead of running BTC /
    lv-chordia. test_pipeline_chords.py overrides this fixture to test the real stage.
    """
    from services.pipeline import jobs
    from services.pipeline.chord_stage import ChordResult

    def analyze_chords(stem_path, *, duration, config, remaining, progress):
        progress(50)
        return ChordResult(engine="btc@cpu", chords=[
            {"start": 0.0, "end": duration, "chord": "C:maj", "simple": "C", "type": "chord"}])

    monkeypatch.setattr(jobs, "analyze_chords", analyze_chords)


@pytest.fixture(autouse=True)
def fake_events(monkeypatch):
    """
    Every pipeline job keeps its chords and gets no events instead of running
    fill detection. test_pipeline_events.py overrides this fixture to test the real stage.
    """
    from services.pipeline import jobs
    from services.pipeline.events_stage import EventsResult

    def analyze_events(*, chords, beats, downbeats, sections, drums_path, duration):
        return EventsResult(chords=chords, events=[])

    monkeypatch.setattr(jobs, "analyze_events", analyze_events)
