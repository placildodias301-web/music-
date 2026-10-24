# Evaluation harness

Scores the **v2 engine** (`services/analysis_engine.py`) and the **pipeline engine**
(`services/pipeline`) on the reference clips and compares them, and compares the run
with the previous one so regressions show up. It measures only: it changes no model,
threshold or prompt.

## Where the clips are

The reference clips (`TEST_001` ... `TEST_020`) live in **`backend/evaluation/clips/`**, copied from
`C:\Users\wilbu\OneDrive\Desktop\Analysis_demo folder` with their original file names. That folder and
`reports/` are git-ignored (root `.gitignore`), so audio, video and reports are never committed.

**`clip_manifest.json`** (committed; names, paths and checksums only, no audio) maps each stable evaluation ID
to its file:

```json
"TEST_001": {
  "original_filename": "TEST_001.mp4",
  "source_path": "C:/Users/wilbu/OneDrive/Desktop/Analysis_demo folder/TEST_001.mp4",
  "copied_path": "backend/evaluation/clips/TEST_001.mp4",
  "sha256": "...", "size_bytes": 23323874
}
```

The evaluator looks for `original_filename` inside the clips folder, so a clip can be renamed later by
changing the manifest only. `reference_clips.json`, `clip_manifest.json` and `ground_truth.csv` all use the
same IDs (a test checks it).

Copy (or re-copy) the clips and rebuild the manifest. The source folder is only read, never moved or changed:

```powershell
cd backend
python -m evaluation.clip_manifest --source "C:\Users\wilbu\OneDrive\Desktop\Analysis_demo folder"
```

It matches files by their `TEST_NNN` prefix, ignores the spreadsheets and scripts next to them, writes
nothing if a clip is missing or ambiguous, leaves identical copies alone, and refuses to replace a copy that
differs from its source unless you pass `--overwrite`.

## Run it

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m evaluation.run_evaluation
```

With no arguments it uses the clips in `evaluation/clips/`. To use another folder (precedence: `--clips-dir`,
then `$WILSIFY_CLIPS_DIR`, then `evaluation/clips`):

```powershell
python -m evaluation.run_evaluation --clips-dir "C:\Users\wilbu\OneDrive\Desktop\Analysis_demo folder"
```

Both engines run on every clip, and the reports go to `evaluation/reports/<run_id>.json` and `.md`
(plus `latest.json` / `latest.md`). A clip whose file is missing is listed as skipped, not failed.

Useful options

| Option | Effect |
| --- | --- |
| `--clips TEST_001,TEST_004` | only these clips |
| `--engines v2` / `pipeline` | one engine only (the v2-vs-pipeline comparison needs both) |
| `--baseline path.json` | compare with this report instead of `reports/latest.json` |
| `--fail-on-regression` | exit 1 if a regression is found (for CI or a pre-merge check) |
| `--from-predictions reports/<run_id>_predictions` | re-score a finished run's saved predictions without running any engine (seconds, not hours) |
| `--out-dir` | where reports go |

Every run saves each engine's normalised output to `reports/<run_id>_predictions/`, so
after adding ground truth to the manifest you can re-score old runs instantly.

## Offline, private, read-only

* Audio is never uploaded: only the backend's own services run, locally.
* Input clips are only read. The v2 engine decodes into a temporary folder; the pipeline gets a
  *copy* in a temporary data folder (the job manager takes ownership of what it is given), and
  both are deleted afterwards.
* Model downloads are switched off (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`) unless you pass
  `--allow-model-downloads`. **Caveat:** `beat_this` fetches its checkpoint through `torch.hub`, which
  those flags do not cover, so on a machine where it is not cached it will try to download it (a
  download only, no audio leaves). Cache Demucs, the rhythm model (allin1 in WSL2, or `beat_this`) and
  the chord model (BTC / lv-chordia) once by running a normal analysis, then the harness works offline.

## Adding ground truth by ear

1. Open **`evaluation/ground_truth.csv`** in Excel (save as CSV when done). It lists the 20 clips and is
   pre-filled with the keys that already exist. (A fresh pre-filled copy, also as `.xlsx`, comes from
   `python -m evaluation.import_ground_truth --write-template my_truth.xlsx`.)
2. Fill in only what you are sure of; leave the rest blank. Fill `verified_by` (and `verified_at`,
   `YYYY-MM-DD`) on every row where you entered something - values without `verified_by` are rejected.
3. Check, then import: `python -m evaluation.import_ground_truth --dry-run`, then without `--dry-run`
   (with no file given it reads `evaluation/ground_truth.csv`; pass another `.csv` or `.xlsx` to use that).
   Every cell is validated and **nothing is written unless the whole file is valid**; errors name the row and column.
4. Re-run the evaluation (or `--from-predictions` an earlier run).

| Column | Format |
| --- | --- |
| `bpm` | 30-300 |
| `time_signature` | `2/4 3/4 4/4 5/4 6/8 9/8 12/8` |
| `key` + `mode` | `A` + `minor`, or `A minor` / `F#m` in `key`; alternatives: `G major; E major` |
| `sections` | `0-12 intro; 12-40 verse` (seconds or `m:ss`, ascending, no overlap, inside the clip) |
| `main_chord_progression` | the repeating loop: `Am F C G`, `Am - F - C/E - G`, `Am -> F` (app chord symbols) |
| `passing_chords` | start times: `12.5; 0:31`; `none` = you checked and there are none |
| `fills` | times or ranges: `10.2-11; 0:45`; `none` = none |
| `notes` | free text (stored as `truth_notes`) |

A blank cell is "no ground truth": it keeps whatever the manifest already holds and the evaluation skips
the metric. `none` is different - it is a verified answer ("no passing chords"), so a detected passing
chord then counts against precision. Timed chords, beats, downbeats and expected warnings are not in the
template (too long for a cell); put them straight into `reference_clips.json` (formats below).

`main_chord_progression` is scored with `progression_chord_recall` (share of its distinct chords the engine
uses) and `progression_found` (the engine plays the loop in order, starting anywhere in it, as consecutive chords).

**Not ground truth:** `Wilsify_Analysis_Truth_Table.xlsx` (Analysis_demo folder) and the BPM / meter / chord
columns of `Wilsify_demo_truth.xlsx` are automatic estimates (every "Verified" column is empty). Nothing here
imports them.

## Ground truth: `reference_clips.json`

One entry per clip, with a `truth` block. **`null` means "no ground truth": the metric is skipped
for that clip - never scored as wrong.** Fields (formats are repeated in the file's `truth_format`):

| Field | Format |
| --- | --- |
| `bpm` | number |
| `time_signature` | `"4/4"` / `"3/4"` |
| `key` | `"A minor"`, or a list of acceptable keys |
| `beats`, `downbeats` | seconds |
| `chords` | `[{"start", "end", "chord"}]`, app symbols (`C`, `Am7`, `G/B`, `N`) |
| `main_chord_progression` | `["Am", "F", "C", "G"]` |
| `sections` | `[{"start", "end", "label"}]` |
| `passing_chords` | start time of each passing chord |
| `fills` | times, or `{"start", "end"}` |
| `expected_warnings` | preprocessing categories that should fire (`clipping`, `low_volume`, `noise`, `speech`, `no_instruments`, `not_musical`, `quiet_instruments`, `stem_clipping`); `[]` = none should |

What is filled in today comes from `docs/benchmark/Wilsify_demo_truth.xlsx`: **key only**
(19 clips; TEST_010 is unclear and left null) and the capo. That workbook's BPM / meter / chord
columns are engine outputs ("Wilsify said", "Measured BPM") and its own BPM and time-signature
ground-truth columns are empty, so they are deliberately **not** used as truth.

## Metrics (`metrics.py`)

All higher-is-better except the BPM errors. Each is the mean over the clips that have ground truth
for it; the report shows that count (n) next to every number.

| Metric | Definition |
| --- | --- |
| `bpm_abs_error`, `bpm_pct_error` | &#124;est − truth&#124; in BPM, and as % of truth |
| `bpm_within_1` | share of clips within ±1 BPM |
| `bpm_octave_error` | (info) share off by ×½, ×2, ×3/2 or ×2/3 only |
| `beat_f`, `downbeat_f` | F-measure, ±70 ms, one-to-one matching |
| `time_signature_correct` | exact match |
| `key_correct` | exact tonic + mode (enharmonics equal; a truth list accepts any) |
| `key_related` | `key_correct`, or the relative major/minor (capo / modal ambiguity), reported separately |
| `progression_chord_recall`, `progression_found` | untimed main chord loop, see above |
| `chord_root_acc` | share of reference seconds where the estimated root matches |
| `chord_symbol_acc` | same, for the full symbol (root + quality + bass) |
| `section_f_0.5s`, `section_f_3s` | boundary F-measure on section starts (time 0 excluded) |
| `section_label_acc` | share of reference seconds with the right label (case, spaces, numbers ignored) |
| `passing_precision`, `passing_recall` | passing-chord start times, ±0.25 s |
| `fill_precision`, `fill_recall` | a detected fill is right if inside a reference fill ±0.5 s; a reference fill is found if any detection is |
| `warnings_exact` | the set of preprocessing warning categories equals `expected_warnings` (messages matched by text; other pipeline warnings are ignored). The report also lists missed and spurious categories |
| `cache_correct` | pipeline only: first run not cached; a second submit and a submit through a *fresh* job manager on the same data folder (a restart) are both served from the cache with a result identical to the computed one |

An engine that does not produce an output (v2 has no sections, passing chords, fills,
preprocessing warnings or cache) is **not scored** on it, shown as `–`, never as 0.

## Reports

* **Overall**: per engine, per metric, with n.
* **pipeline vs v2**: per metric over only the clips scored by both, with the delta and which is better.
* **Per-song results**, **Skipped clips** (audio missing), **Missing ground truth** (which clips lack which field).
* **Regression vs previous run**: the previous `latest.json` (or `--baseline`). Per clip and overall
  (recomputed over the clips present in both runs, so adding clips or truth is not a "change"), a metric
  regresses when it gets worse by more than its tolerance: 0.02 for 0-1 metrics, 0.5 BPM / 0.5 % for
  the BPM errors (`report.DEFAULT_TOLERANCE`). An engine run going from ok to failed also counts. The first
  run has nothing to compare with and becomes the baseline.

## Tests

`python -m pytest tests/test_evaluation.py tests/test_ground_truth_import.py -q` covers the metric maths, report generation, regression
detection, missing-ground-truth handling and the cache/reload check (through the real job manager with a
fake pipeline). They need no audio or models.
