# Stem separation report — TEST_011.mp4

## 1. Input

- Format: mov,mp4,m4a,3gp,3g2,mj2 / aac @ 63 kbps (**lossy source**)
- 44100 Hz, 2 channel(s) (processed as stereo), 97.2 s
- Peak -2.6 dBFS · RMS -16.1 dBFS · -14.1 LUFS
- Clipped samples: 0
- Stereo: L/R correlation 0.85, side/mid -10.8 dB
- Usable bandwidth ≈ 14.1 kHz — consistent with an AAC/MP3 low-pass; no content above it can be recovered

## 2. Detected inventory and confidence

Confidence is a heuristic from stem level and how much of the track it is active in; it is **not** a perceptual guarantee.

| Layer | Model stem | Level (RMS dBFS) | Active % of time | Presence |
|---|---|---:|---:|---|
| Vocals (lead + backing) | vocals | -22.1 | 88 | **high** |
| Drums | drums | -20.0 | 97 | **high** |
| Bass | bass | -23.9 | 96 | **high** |
| Guitar | guitar | -28.8 | 95 | **high** |
| Piano / keys | piano | -111.6 | 0 | **absent** |
| Other (synth/strings/brass/FX…) | other | -28.0 | 93 | **high** |
| ↳ Lead vocal | karaoke split | -22.4 | 86 | high |
| ↳ Backing vocals | karaoke split | -41.9 | 21 | medium |
| ↳ drum kit: kick | DrumSep | -21.8 | 84 | high |
| ↳ drum kit: snare | DrumSep | -32.6 | 87 | high |
| ↳ drum kit: toms | DrumSep | -26.4 | 48 | high |
| ↳ drum kit: hh | DrumSep | -38.1 | 92 | high |
| ↳ drum kit: ride | DrumSep | -51.9 | 7 | low |
| ↳ drum kit: crash | DrumSep | -43.4 | 10 | low |

## 3. Reconstruction check (sum of stems vs original)

- **Sum-vs-mix SNR: 33.8 dB** (residual RMS -49.9 dBFS). Higher is better; > 30 dB means the stems add back to the mix almost exactly.
- Alignment lag between mix and sum: **0 samples** (0 = perfectly sample-aligned).
- Where the residual is: <150 Hz: 43 dB, 150-2k: 34 dB, 2k-8k: 25 dB, >8k: 23 dB

- Lead + backing vs the vocal stem: 68.9 dB SNR (envelope correlation lead~backing 0.53; high values suggest the lead is leaking into the backing).

## 4. Per-stem quality

| Stem | Peak dBFS | Bleed / artifact indicator | Recommended cleanup |
|---|---:|---|---|
| Vocals (lead + backing) | -7.5 | 0.0% of vocal energy is below 100 Hz (bass/kick leakage if > ~3%) | Light de-bleed / gate below 100 Hz if kick leaks in. |
| Drums | -2.9 | 76% harmonic energy. Weak indicator: kick/tom/808 tails also read as harmonic, so a high value only means 'listen for pitched bleed' (check checks/ and the A/B page) | Listen for pitched bass/guitar notes under the kit; if present, high-pass at 40 Hz and gate. |
| Bass | -11.6 | 0.1% of bass energy is above 400 Hz (guitar/vocal/drum leakage if > ~10%) | Low-pass around 5 kHz to remove hi-hat/guitar leakage. |
| Guitar | -7.7 | — | Check against the 'other' stem; guitar models often also catch synth/keys. |
| Piano / keys | -73.4 | stem is empty — nothing to check | None needed if absent. |
| Other (synth/strings/brass/FX…) | -7.0 | — | Contains everything unresolved. Do not treat as a single instrument. |

**Cross-stem 'ghosting' (envelope correlation; > 0.8 means two stems rise and fall together, i.e. one source is probably split across both):**

- guitar~other: 0.46
- vocals~guitar: 0.10

## 5. What could NOT be separated cleanly

- **Synth, strings, brass, pads, FX and hand-percussion** have no open-source model of proven quality. They remain inside `10_residual_other` and are labelled *mixed / unresolved* — no fake stems were created.
- **Electric vs acoustic guitar** are in one `05_guitar` stem. **Piano vs other keys/organ** are in one `06_piano_keys` stem.
- **Backing vocals** come from a lead/backing model; doubled leads and harmonies sung in unison with the lead are usually kept in the *lead* stem.
- Anything quieter than ~ −40 dB relative to the loudest stem is reported as absent rather than guessed.

- The source is **lossy aac**. Compression artifacts in the original are baked into every stem and may sound like 'watery' bleed.

## 6. Files

- `checks/00_reconstruction_sum.flac` — sum of stems (should sound identical to the original)
- `checks/00_residual_difference.flac` — residual = original − sum of stems (what the split lost/added)
- `01_lead_vocal.flac` — lead vocal
- `02_backing_vocals.flac` — backing vocals / harmonies
- `03_drums.flac` — drums (full kit)
- `04_bass.flac` — bass
- `05_guitar.flac` — guitar (electric + acoustic, not split)
- `06_piano_keys.flac` — piano / keys  [NOT PRESENT in this track — file written but silent/near-silent]
- `10_residual_other.flac` — everything the models cannot isolate — MIXED / UNRESOLVED (synth, strings, brass, pads, FX, percussion)
- `drum_kit/drums_kick.flac` — drum kit · kick
- `drum_kit/drums_snare.flac` — drum kit · snare
- `drum_kit/drums_toms.flac` — drum kit · toms
- `drum_kit/drums_hh.flac` — drum kit · hh
- `drum_kit/drums_ride.flac` — drum kit · ride
- `drum_kit/drums_crash.flac` — drum kit · crash

Open `preview.html` to A/B each stem against the original.

Models: BS-Roformer-SW (6-stem), Mel-Roformer Karaoke (lead/backing), MDX23C DrumSep (kit). Open-source weights, run locally.