"""
The job-based analysis pipeline (ANALYSIS_ENGINE=pipeline).

Upload -> FFmpeg WAV -> (later steps: Demucs stems -> rhythm -> chords ->
events) -> one merged JSON timeline. Runs as a background job so long CPU
work never hits an HTTP timeout; results are cached in SQLite by file hash.

The existing engine (services/analysis_engine.py, ANALYSIS_ENGINE=v2) is
untouched and stays the default.
"""
