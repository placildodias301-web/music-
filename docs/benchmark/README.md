# Analysis benchmark (20 test videos)

- `Wilsify_demo_truth.xlsx` compares Ground Truth / By Ear, Wilsify AI, Chord AI, Other Repo and Claude.
- `file_rename_mapping.csv` maps original video names to `TEST_001`..`TEST_020` (videos are not stored in git).
- `claude_baseline_analysis.py` produces the "Claude" key/BPM estimates (numpy + ffmpeg only).

Notes: the Claude columns are a rough audio-feature baseline, not ground truth. Ground-truth BPM, time signature and chord timelines are still to be entered by hand; "Other Repo" is empty.

## Validation (see VALIDATION sheet)
Key detection: untuned majority vote of 16 key engines (Essentia profiles + librosa) = 17/19 correct. Train/test: 6/7 on held-out; leave-one-out 15/19. 100% not reached; BPM ground truth still unknown. Scripts: `extract_features.py`, `evaluate_keys.py`, `ensemble.py`.

## BPM / time-signature ground truth process
Sheets `BPM_TRUTH`, `METER_TRUTH`, `CONTROLLED_TESTS`, `TEMPO_METER_VALIDATION`. Known metronome settings are authoritative (method KNOWN_METRONOME); detector output (`tempo_meter.py`) is stored as MEASURED only and never copied into ground truth. Ground truth for the 20 existing videos is still UNKNOWN until a metronome setting or manual tap is entered.
