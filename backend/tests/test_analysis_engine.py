import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import librosa
from services.analysis_engine import _decode_chords, ANALYSIS_SR, HOP, detect_beats

def test_synthetic_progression():
    # 100 BPM = 1.666 beats per second. 
    # 1 beat = 0.6 seconds.
    # 4 bars in 4/4 = 16 beats = 9.6 seconds.
    
    bpm = 100.0
    beat_length = 60.0 / bpm
    sr = ANALYSIS_SR
    
    # Generate audio
    # C major: C, E, G (MIDI 60, 64, 67)
    # G major: G, B, D (MIDI 55, 59, 62)
    # A minor: A, C, E (MIDI 57, 60, 64)
    # F major: F, A, C (MIDI 53, 57, 60)
    
    chords = [
        ([60, 64, 67], 9.6),
        ([55, 59, 62], 9.6),
        ([57, 60, 64], 9.6),
        ([53, 57, 60], 9.6)
    ]
    
    t_total = 0
    audio_parts = []
    
    for midi_notes, dur in chords:
        t = np.linspace(0, dur, int(dur * sr), endpoint=False)
        chord_audio = np.zeros_like(t)
        for note in midi_notes:
            freq = librosa.midi_to_hz(note)
            chord_audio += np.sin(2 * np.pi * freq * t)
            # Add harmonics
            chord_audio += 0.5 * np.sin(2 * np.pi * freq * 2 * t)
            chord_audio += 0.25 * np.sin(2 * np.pi * freq * 3 * t)
        
        # Add some percussive clicks on the beats
        for b in np.arange(0, dur, beat_length):
            idx = int(b * sr)
            click_len = min(int(0.05 * sr), len(chord_audio) - idx)
            chord_audio[idx:idx+click_len] += np.random.randn(click_len) * 2.0
            
        # apply envelope
        env = np.exp(-t / 4.0) + 0.2
        chord_audio *= env
        
        audio_parts.append(chord_audio)
        t_total += dur
        
    y = np.concatenate(audio_parts)
    y /= np.max(np.abs(y))
    
    # HPSS
    y_harm, y_perc = librosa.effects.hpss(y)
    
    # Beats
    beats = detect_beats(y_perc, y, sr)
    
    # Chroma
    from services.analysis_engine import _chroma_features, _voiced_frames
    chroma, bass, loudness = _chroma_features(y_harm, sr)
    voiced = _voiced_frames(loudness)
    
    # Decode
    timeline = _decode_chords(chroma, bass, voiced, t_total, beats["beat_times"], True)
    
    print("TIMELINE:")
    import pprint
    pprint.pprint(timeline)
    
    # Check boundaries and labels
    labels = [seg["chord"] for seg in timeline]
    assert "C" in labels
    assert "G" in labels
    assert "Am" in labels
    assert "F" in labels
    
    # Find segments
    def find_boundary(chord_name, expected_start, expected_end):
        for seg in timeline:
            if seg["chord"] == chord_name:
                if abs(seg["start"] - expected_start) < beat_length and abs(seg["end"] - expected_end) < beat_length:
                    return True
        return False
        
    assert find_boundary("C", 0.0, 9.6)
    assert find_boundary("G", 9.6, 19.2)
    assert find_boundary("Am", 19.2, 28.8)
    assert find_boundary("F", 28.8, 38.4)

