#!/usr/bin/env python3
"""
stem_pipeline.py — inspect a track, split it into the most detailed stem set
that open models can resolve *honestly*, validate every stem, and write a report.

  python stem_pipeline.py "song.mp4" --out stems_out --format wav
  python stem_pipeline.py "song.mp4" --out test_out --start 30 --seconds 25   # test on a short clip first

Stages (each is cached in <out>/_work, so a re-run resumes instead of recomputing):
  1. inspect   sample rate, channels, duration, loudness, clipping, bandwidth (lossy cutoff)
  2. 6-stem    BS-Roformer-SW  -> vocals, drums, bass, guitar, piano, other
  3. vocals    Mel-Roformer Karaoke -> lead vocal  +  backing vocals / harmonies
  4. drums     MDX23C DrumSep -> kick, snare, toms, hi-hat, ride, crash   (optional detail folder)
  5. validate  sum-of-stems vs original, per-stem level / bleed / artifact / presence checks
  6. report    separation_report.md + preview.html (A/B listening page)

Nothing is invented: a stem whose model output is (near) silent is reported "not present";
anything the models cannot isolate (strings, brass, synth, FX, pads) stays in
10_residual_other.wav and is labelled "mixed / unresolved".
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SIX_STEM_MODEL = "BS-Roformer-SW.ckpt"
KARAOKE_MODEL = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"
DRUMSEP_MODEL = "MDX23C-DrumSep-aufr33-jarredou.ckpt"

PRESENT_ABS_DB = -55.0      # a stem quieter than this (RMS dBFS) is treated as absent
PRESENT_REL_DB = -40.0      # ...or this far under the loudest stem
ACTIVE_FRAME_DB = -50.0     # a 0.5 s frame above this RMS counts as "playing"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def db(x: float) -> float:
    return float(20 * np.log10(max(x, 1e-12)))


# ───────────────────────── 1. inspect ─────────────────────────
def run(cmd: list[str]) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {r.stderr.strip()[:400]}")
    return r.stdout


def probe(path: Path) -> dict:
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        sys.exit("ffmpeg/ffprobe not found. Install FFmpeg and make sure it is on your PATH.")
    out = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)])
    info = json.loads(out)
    audio = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    if not audio:
        sys.exit(f"No audio stream found in {path}")
    a = audio[0]
    return {
        "container": info["format"].get("format_name"),
        "codec": a.get("codec_name"),
        "sample_rate": int(a["sample_rate"]),
        "channels": int(a["channels"]),
        "duration_s": float(a.get("duration") or info["format"]["duration"]),
        "bit_rate": int(a["bit_rate"]) if a.get("bit_rate") else None,
        "lossy": a.get("codec_name") not in {"flac", "alac", "wav", "pcm_s16le", "pcm_s24le", "pcm_f32le", "pcm_s32le"},
    }


def decode(path: Path, dst: Path, sr: int, start: float | None, seconds: float | None) -> None:
    """Decode to 32-bit float stereo WAV at the SOURCE sample rate (mono is duplicated, never resampled)."""
    cmd = ["ffmpeg", "-y", "-v", "error"]
    if start:
        cmd += ["-ss", str(start)]
    if seconds:
        cmd += ["-t", str(seconds)]
    cmd += ["-i", str(path), "-vn", "-ac", "2", "-ar", str(sr), "-c:a", "pcm_f32le", str(dst)]
    run(cmd)


def inspect_audio(y: np.ndarray, sr: int, meta: dict) -> dict:
    import pyloudnorm as pyln

    L, R = y[:, 0], y[:, 1]
    mid, side = (L + R) / 2, (L - R) / 2
    f, P = signal.welch(mid, sr, nperseg=8192)
    cum = np.cumsum(P) / P.sum()
    bw = float(f[np.searchsorted(cum, 0.9995)])
    bands = {}
    for name, lo, hi in [("sub 20-60", 20, 60), ("bass 60-250", 60, 250), ("low-mid 250-800", 250, 800), ("mid 0.8-2.5k", 800, 2500),
                         ("presence 2.5-6k", 2500, 6000), ("air 6-12k", 6000, 12000), ("ultra 12k+", 12000, sr / 2)]:
        bands[name] = float(10 * np.log10(P[(f >= lo) & (f < hi)].sum() / P.sum() + 1e-12))
    try:
        lufs = float(pyln.Meter(sr).integrated_loudness(y))
    except Exception:
        lufs = None
    return {
        **meta,
        "peak_dbfs": db(np.abs(y).max()),
        "rms_dbfs": db(np.sqrt((y ** 2).mean())),
        "integrated_lufs": lufs,
        "clipped_samples": int((np.abs(y) >= 0.999).sum()),
        "is_effectively_mono": bool(np.sqrt((side ** 2).mean()) < 1e-3 * np.sqrt((mid ** 2).mean() + 1e-12)),
        "side_to_mid_db": float(10 * np.log10((side ** 2).mean() / ((mid ** 2).mean() + 1e-12) + 1e-12)),
        "lr_correlation": float(np.corrcoef(L, R)[0, 1]) if L.std() > 0 and R.std() > 0 else 1.0,
        "bandwidth_hz": bw,
        "band_energy_db": bands,
    }


# ───────────────────────── 2-4. separation ─────────────────────────
def make_separator(model_dir: Path, out_dir: Path, sr: int):
    try:
        from audio_separator.separator import Separator
    except ImportError:
        sys.exit("Missing dependency. Run:  pip install \"audio-separator[gpu]\"   (NVIDIA GPU)   or   pip install \"audio-separator[cpu]\"")
    out_dir.mkdir(parents=True, exist_ok=True)
    # normalization_threshold=1.0: never rescale stems, so they still add back up to the mix.
    return Separator(model_file_dir=str(model_dir), output_dir=str(out_dir), output_format="WAV",
                     normalization_threshold=1.0, sample_rate=sr, log_level=30)


def separate(sep, model: str, wav: Path, names: dict[str, str], out_dir: Path) -> dict[str, Path]:
    """Runs one model; returns {stem: path}. Skips work that is already on disk."""
    paths = {k: out_dir / f"{v}.wav" for k, v in names.items()}
    if all(p.exists() for p in paths.values()):
        log(f"  cached: {model}")
        return paths
    log(f"  loading {model} (first run downloads the weights)")
    sep.load_model(model_filename=model)
    log("  separating … (CPU is slow: expect roughly 10x the track length; a GPU is ~20-50x faster)")
    t = time.time()
    sep.separate(str(wav), custom_output_names=names)
    log(f"  done in {time.time() - t:.0f}s")
    missing = [k for k, p in paths.items() if not p.exists()]
    if missing:
        raise RuntimeError(f"{model} did not write: {missing} (found {[p.name for p in out_dir.glob('*.wav')]})")
    return paths


# ───────────────────────── 5. validation ─────────────────────────
def frames_rms(x: np.ndarray, sr: int, win: float = 0.5) -> np.ndarray:
    h = int(sr * win)
    n = len(x) // h
    return np.sqrt((x[: n * h].reshape(n, h, -1).mean(-1) ** 2).mean(1) + 1e-20) if x.ndim == 2 else np.sqrt((x[: n * h].reshape(n, h) ** 2).mean(1) + 1e-20)


def band_share(x: np.ndarray, sr: int, lo: float, hi: float) -> float:
    m = x.mean(1) if x.ndim == 2 else x
    f, P = signal.welch(m, sr, nperseg=4096)
    return float(P[(f >= lo) & (f < hi)].sum() / (P.sum() + 1e-20))


def tonal_fraction(x: np.ndarray, sr: int) -> float:
    """Share of energy that is harmonic (median-filter HPSS). High in a drum stem = melodic bleed."""
    import librosa

    m = librosa.to_mono(x.T) if x.ndim == 2 else x
    m = m[: sr * 60]
    S = np.abs(librosa.stft(m, n_fft=2048, hop_length=512)) ** 2
    H, Pc = librosa.decompose.hpss(S)
    return float(H.sum() / (H.sum() + Pc.sum() + 1e-20))


def stem_stats(x: np.ndarray, sr: int) -> dict:
    fr = frames_rms(x, sr)
    return {
        "rms_db": db(np.sqrt((x ** 2).mean())),
        "peak_db": db(np.abs(x).max()),
        "active_pct": float(100 * (20 * np.log10(fr) > ACTIVE_FRAME_DB).mean()),
    }


def envelope_corr(a: np.ndarray, b: np.ndarray, sr: int) -> float:
    ea, eb = 20 * np.log10(frames_rms(a, sr, 0.25)), 20 * np.log10(frames_rms(b, sr, 0.25))
    if ea.std() < 1e-6 or eb.std() < 1e-6:
        return 0.0
    return float(np.corrcoef(ea, eb)[0, 1])


def confidence(level_db: float, ref_db: float, active_pct: float) -> str:
    if level_db < PRESENT_ABS_DB or level_db < ref_db + PRESENT_REL_DB or active_pct < 2:
        return "absent"
    if active_pct >= 40 and level_db > ref_db - 22:
        return "high"
    if active_pct >= 15 and level_db > ref_db - 30:
        return "medium"
    return "low"


def validate(mix: np.ndarray, sr: int, stems: dict[str, np.ndarray], six: list[str]) -> dict:
    n = min([len(mix)] + [len(v) for v in stems.values()])
    mixc = mix[:n].astype(np.float64)
    total = sum(stems[k][:n].astype(np.float64) for k in six)
    resid = mixc - total
    snr = float(10 * np.log10((mixc ** 2).sum() / ((resid ** 2).sum() + 1e-20)))
    # per-frequency-band residual so you can see WHERE the mismatch is
    res_bands = {}
    for name, lo, hi in [("<150 Hz", 20, 150), ("150-2k", 150, 2000), ("2k-8k", 2000, 8000), (">8k", 8000, sr / 2)]:
        sm, sr_ = band_share(mixc, sr, lo, hi) * (mixc ** 2).mean(), band_share(resid, sr, lo, hi) * (resid ** 2).mean()
        res_bands[name] = float(10 * np.log10((sm + 1e-20) / (sr_ + 1e-20)))
    # phase / alignment: lag of best cross-correlation between mix and the sum of stems (should be 0)
    seg = slice(0, min(n, sr * 20))
    xc = signal.correlate(mixc[seg].mean(1), total[seg].mean(1), mode="full", method="fft")
    lag = int(np.argmax(xc) - (len(mixc[seg]) - 1))
    stats = {k: stem_stats(v[:n], sr) for k, v in stems.items()}
    ref = max(s["rms_db"] for s in stats.values())
    out = {"sum_vs_mix_snr_db": snr, "snr_by_band_db": res_bands, "alignment_lag_samples": lag,
           "residual_rms_db": db(np.sqrt((resid ** 2).mean())), "stems": {}}
    for k, v in stems.items():
        s = stats[k]
        s["confidence"] = confidence(s["rms_db"], ref, s["active_pct"])
        s["sub_bass_share_pct"] = 100 * band_share(v[:n], sr, 20, 100)
        s["air_share_pct"] = 100 * band_share(v[:n], sr, 8000, sr / 2)
        out["stems"][k] = s
    # bleed / artefact heuristics (indicators, not perceptual proof)
    pres = {k for k, s in out["stems"].items() if s["confidence"] != "absent"}
    if "vocals" in pres:
        out["stems"]["vocals"]["bleed_note"] = f"{out['stems']['vocals']['sub_bass_share_pct']:.1f}% of vocal energy is below 100 Hz (bass/kick leakage if > ~3%)"
    if "drums" in pres:
        t = tonal_fraction(stems["drums"][:n], sr)
        out["stems"]["drums"]["tonal_pct"] = 100 * t
        out["stems"]["drums"]["bleed_note"] = (f"{100 * t:.0f}% harmonic energy. Weak indicator: kick/tom/808 tails also read as harmonic, "
                                                f"so a high value only means 'listen for pitched bleed' (check checks/ and the A/B page)")
    if "bass" in pres:
        hf = 100 * band_share(stems["bass"][:n], sr, 400, sr / 2)
        out["stems"]["bass"]["bleed_note"] = f"{hf:.1f}% of bass energy is above 400 Hz (guitar/vocal/drum leakage if > ~10%)"
    for a, b in [("guitar", "piano"), ("guitar", "other"), ("vocals", "guitar"), ("piano", "other")]:
        if a in pres and b in pres:
            c = envelope_corr(stems[a][:n], stems[b][:n], sr)
            out.setdefault("ghosting", {})[f"{a}~{b}"] = c
    return out


# ───────────────────────── 6. report + preview ─────────────────────────
def write_preview(out: Path, files: list[tuple[str, str]], orig: str) -> None:
    rows = "\n".join(f'<tr><td>{label}</td><td><audio controls preload="none" src="{src}"></audio></td></tr>' for label, src in files)
    html = f"""<!doctype html><meta charset="utf-8"><title>Stem preview</title>
<style>body{{font:15px system-ui;background:#0b1020;color:#e8ecff;margin:24px}}td{{padding:6px 14px 6px 0}}audio{{width:420px}}
button{{padding:6px 12px;border-radius:8px;border:0;background:#6c4dff;color:#fff;cursor:pointer}}</style>
<h2>A/B preview</h2>
<p>Pick a stem, then flip between the original and the stem at the same position (Space = toggle).</p>
<p><select id="sel">{''.join(f'<option value="{s}">{l}</option>' for l, s in files)}</select>
<button id="ab">A/B toggle</button> <span id="state">original</span></p>
<audio id="o" controls src="{orig}" style="width:560px"></audio><audio id="s" src="" style="display:none"></audio>
<h3>All stems</h3><table>{rows}</table>
<script>
const o=document.getElementById('o'),s=document.getElementById('s'),sel=document.getElementById('sel'),st=document.getElementById('state');let onStem=false;
function load(){{s.src=sel.value}};load();sel.onchange=()=>{{load();if(onStem){{s.currentTime=o.currentTime;s.play()}}}};
function toggle(){{const t=onStem?s.currentTime:o.currentTime,playing=!(onStem?s.paused:o.paused);onStem=!onStem;
 (onStem?o:s).pause();const n=onStem?s:o;n.currentTime=t;if(playing)n.play();st.textContent=onStem?'stem':'original'}}
document.getElementById('ab').onclick=toggle;document.addEventListener('keydown',e=>{{if(e.code==='Space'&&e.target.tagName!=='SELECT'){{e.preventDefault();toggle()}}}});
</script>"""
    (out / "preview.html").write_text(html, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--format", choices=["wav", "flac"], default="wav", help="lossless output (wav = 32-bit float, flac = 24-bit)")
    ap.add_argument("--start", type=float, default=None, help="clip start in seconds (for a quick test)")
    ap.add_argument("--seconds", type=float, default=None, help="clip length in seconds (for a quick test)")
    ap.add_argument("--no-split-vocals", action="store_true", help="skip lead/backing vocal split")
    ap.add_argument("--no-drum-kit", action="store_true", help="skip kick/snare/hat/cymbal detail")
    ap.add_argument("--models", type=Path, default=Path.home() / ".cache" / "stem_models")
    a = ap.parse_args()

    if not a.input.exists():
        sys.exit(f"Input not found: {a.input}")
    out = a.out or a.input.with_name(a.input.stem + "_stems")
    work = out / "_work"
    work.mkdir(parents=True, exist_ok=True)
    a.models.mkdir(parents=True, exist_ok=True)

    log("1/6 inspecting")
    meta = probe(a.input)
    sr = meta["sample_rate"]
    src_wav = work / "source.wav"
    if not src_wav.exists():
        decode(a.input, src_wav, sr, a.start, a.seconds)
    mix, _ = sf.read(src_wav, dtype="float32")
    info = inspect_audio(mix, sr, meta)
    (out / "inspection.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    if info["lossy"]:
        log(f"  NOTE: source is lossy ({meta['codec']}, {meta['bit_rate']} bps). Stems cannot be better than this; WAV/FLAC output is lossless of the decoded audio only.")

    log("2/6 six-stem separation")
    sep = make_separator(a.models, work / "six", sr)
    six_names = {k: k for k in ["vocals", "drums", "bass", "guitar", "piano", "other"]}
    six = separate(sep, SIX_STEM_MODEL, src_wav, six_names, work / "six")

    stems: dict[str, np.ndarray] = {k: sf.read(p, dtype="float32")[0] for k, p in six.items()}
    final: dict[str, np.ndarray] = {}
    labels: dict[str, str] = {}

    log("3/6 lead / backing vocals")
    if a.no_split_vocals:
        final["01_lead_vocal"] = stems["vocals"]
        labels["01_lead_vocal"] = "vocals (lead + backing together; split skipped)"
    else:
        ksep = make_separator(a.models, work / "kara", sr)
        kp = separate(ksep, KARAOKE_MODEL, six["vocals"], {"vocals": "lead", "instrumental": "backing"}, work / "kara")
        final["01_lead_vocal"] = sf.read(kp["vocals"], dtype="float32")[0]
        final["02_backing_vocals"] = sf.read(kp["instrumental"], dtype="float32")[0]
        labels["01_lead_vocal"], labels["02_backing_vocals"] = "lead vocal", "backing vocals / harmonies"
    final["03_drums"], final["04_bass"], final["05_guitar"], final["06_piano_keys"], final["10_residual_other"] = (
        stems["drums"], stems["bass"], stems["guitar"], stems["piano"], stems["other"])
    labels.update({"03_drums": "drums (full kit)", "04_bass": "bass", "05_guitar": "guitar (electric + acoustic, not split)",
                   "06_piano_keys": "piano / keys", "10_residual_other": "everything the models cannot isolate — MIXED / UNRESOLVED (synth, strings, brass, pads, FX, percussion)"})

    kit: dict[str, np.ndarray] = {}
    log("4/6 drum kit detail")
    if not a.no_drum_kit:
        try:
            dsep = make_separator(a.models, work / "kit", sr)
            kn = {k: k for k in ["kick", "snare", "toms", "hh", "ride", "crash"]}
            kp2 = separate(dsep, DRUMSEP_MODEL, six["drums"], kn, work / "kit")
            kit = {k: sf.read(p, dtype="float32")[0] for k, p in kp2.items()}
        except Exception as e:  # optional stage: never lose the main result
            log(f"  drum-kit split skipped: {e}")

    log("5/6 validating")
    # Validation uses the SIX-STEM split (they are designed to sum to the mix) plus extra checks on the finer splits.
    v = validate(mix, sr, {**stems}, list(stems))
    if "01_lead_vocal" in final and "02_backing_vocals" in final:
        n = min(len(final["01_lead_vocal"]), len(final["02_backing_vocals"]), len(stems["vocals"]))
        vs = stems["vocals"][:n].astype(np.float64)
        err = vs - final["01_lead_vocal"][:n] - final["02_backing_vocals"][:n]
        v["vocal_split_snr_db"] = float(10 * np.log10((vs ** 2).sum() / ((err ** 2).sum() + 1e-20)))
        v["lead_backing_envelope_corr"] = envelope_corr(final["01_lead_vocal"], final["02_backing_vocals"], sr)
        v["backing_stats"] = stem_stats(final["02_backing_vocals"], sr)
        v["lead_stats"] = stem_stats(final["01_lead_vocal"], sr)
    if kit:
        v["kit"] = {k: stem_stats(x, sr) for k, x in kit.items()}
    (out / "validation.json").write_text(json.dumps(v, indent=2), encoding="utf-8")

    log("6/6 writing files")
    ext = a.format
    ref = max(s["rms_db"] for s in v["stems"].values())

    def write(name: str, x: np.ndarray, folder: Path) -> str:
        folder.mkdir(parents=True, exist_ok=True)
        p = folder / f"{name}.{ext}"
        sf.write(p, x, sr, subtype="FLOAT" if ext == "wav" else "PCM_24")
        return str(p.relative_to(out)).replace("\\", "/")

    written: list[tuple[str, str]] = []
    order = sorted(final)
    for k in order:
        base = {"01_lead_vocal": "vocals", "02_backing_vocals": None, "03_drums": "drums", "04_bass": "bass", "05_guitar": "guitar",
                "06_piano_keys": "piano", "10_residual_other": "other"}[k]
        present = (v["stems"][base]["confidence"] != "absent") if base else True
        if not present:
            labels[k] += "  [NOT PRESENT in this track — file written but silent/near-silent]"
        written.append((labels[k], write(k, final[k], out)))
    for k, x in kit.items():
        written.append((f"drum kit · {k}", write(f"drums_{k}", x, out / "drum_kit")))
    n = min(len(mix), *(len(x) for x in stems.values()))
    recon = sum(stems[k][:n].astype(np.float64) for k in stems).astype(np.float32)
    written.insert(0, ("sum of stems (should sound identical to the original)", write("00_reconstruction_sum", recon, out / "checks")))
    written.insert(1, ("residual = original − sum of stems (what the split lost/added)", write("00_residual_difference", (mix[:n] - recon), out / "checks")))
    sf.write(out / f"original.{ext}", mix, sr, subtype="FLOAT" if ext == "wav" else "PCM_24")
    write_preview(out, written, f"original.{ext}")

    # ── report ──
    R = []
    R += [f"# Stem separation report — {a.input.name}", ""]
    if a.start or a.seconds:
        R += [f"> Test clip: start {a.start or 0}s, length {a.seconds or 'rest'}s.", ""]
    R += ["## 1. Input", "",
          f"- Format: {meta['container']} / {meta['codec']}" + (f" @ {meta['bit_rate']//1000} kbps (**lossy source**)" if meta["lossy"] and meta["bit_rate"] else ""),
          f"- {sr} Hz, {meta['channels']} channel(s) (processed as stereo), {len(mix)/sr:.1f} s",
          f"- Peak {info['peak_dbfs']:.1f} dBFS · RMS {info['rms_dbfs']:.1f} dBFS" + (f" · {info['integrated_lufs']:.1f} LUFS" if info["integrated_lufs"] is not None else ""),
          f"- Clipped samples: {info['clipped_samples']}",
          f"- Stereo: L/R correlation {info['lr_correlation']:.2f}, side/mid {info['side_to_mid_db']:.1f} dB" + (" (effectively mono)" if info["is_effectively_mono"] else ""),
          f"- Usable bandwidth ≈ {info['bandwidth_hz']/1000:.1f} kHz" + (" — consistent with an AAC/MP3 low-pass; no content above it can be recovered" if meta["lossy"] else ""), ""]
    R += ["## 2. Detected inventory and confidence", "",
          "Confidence is a heuristic from stem level and how much of the track it is active in; it is **not** a perceptual guarantee.", "",
          "| Layer | Model stem | Level (RMS dBFS) | Active % of time | Presence |", "|---|---|---:|---:|---|"]
    nice = {"vocals": "Vocals (lead + backing)", "drums": "Drums", "bass": "Bass", "guitar": "Guitar", "piano": "Piano / keys", "other": "Other (synth/strings/brass/FX…)"}
    for k, s in v["stems"].items():
        R.append(f"| {nice[k]} | {k} | {s['rms_db']:.1f} | {s['active_pct']:.0f} | **{s['confidence']}** |")
    if "lead_stats" in v:
        R.append(f"| ↳ Lead vocal | karaoke split | {v['lead_stats']['rms_db']:.1f} | {v['lead_stats']['active_pct']:.0f} | {confidence(v['lead_stats']['rms_db'], ref, v['lead_stats']['active_pct'])} |")
        R.append(f"| ↳ Backing vocals | karaoke split | {v['backing_stats']['rms_db']:.1f} | {v['backing_stats']['active_pct']:.0f} | {confidence(v['backing_stats']['rms_db'], ref, v['backing_stats']['active_pct'])} |")
    for k, s in v.get("kit", {}).items():
        R.append(f"| ↳ drum kit: {k} | DrumSep | {s['rms_db']:.1f} | {s['active_pct']:.0f} | {confidence(s['rms_db'], ref, s['active_pct'])} |")
    R += ["", "## 3. Reconstruction check (sum of stems vs original)", "",
          f"- **Sum-vs-mix SNR: {v['sum_vs_mix_snr_db']:.1f} dB** (residual RMS {v['residual_rms_db']:.1f} dBFS). Higher is better; > 30 dB means the stems add back to the mix almost exactly.",
          f"- Alignment lag between mix and sum: **{v['alignment_lag_samples']} samples** (0 = perfectly sample-aligned).",
          "- Where the residual is: " + ", ".join(f"{b}: {x:.0f} dB" for b, x in v["snr_by_band_db"].items()), ""]
    if "vocal_split_snr_db" in v:
        R += [f"- Lead + backing vs the vocal stem: {v['vocal_split_snr_db']:.1f} dB SNR (envelope correlation lead~backing {v['lead_backing_envelope_corr']:.2f}; high values suggest the lead is leaking into the backing).", ""]
    R += ["## 4. Per-stem quality", "", "| Stem | Peak dBFS | Bleed / artifact indicator | Recommended cleanup |", "|---|---:|---|---|"]
    cleanup = {"vocals": "Light de-bleed / gate below 100 Hz if kick leaks in.", "drums": "Listen for pitched bass/guitar notes under the kit; if present, high-pass at 40 Hz and gate.",
               "bass": "Low-pass around 5 kHz to remove hi-hat/guitar leakage.", "guitar": "Check against the 'other' stem; guitar models often also catch synth/keys.",
               "piano": "None needed if absent.", "other": "Contains everything unresolved. Do not treat as a single instrument."}
    for k, s in v["stems"].items():
        note = s.get("bleed_note", "—") if s["confidence"] != "absent" else "stem is empty — nothing to check"
        R.append(f"| {nice[k]} | {s['peak_db']:.1f} | {note} | {cleanup[k]} |")
    if v.get("ghosting"):
        R += ["", "**Cross-stem 'ghosting' (envelope correlation; > 0.8 means two stems rise and fall together, i.e. one source is probably split across both):**", ""]
        R += [f"- {k}: {c:.2f}" for k, c in v["ghosting"].items()]
    R += ["", "## 5. What could NOT be separated cleanly", "",
          "- **Synth, strings, brass, pads, FX and hand-percussion** have no open-source model of proven quality. They remain inside `10_residual_other` and are labelled *mixed / unresolved* — no fake stems were created.",
          "- **Electric vs acoustic guitar** are in one `05_guitar` stem. **Piano vs other keys/organ** are in one `06_piano_keys` stem.",
          "- **Backing vocals** come from a lead/backing model; doubled leads and harmonies sung in unison with the lead are usually kept in the *lead* stem.",
          "- Anything quieter than ~ −40 dB relative to the loudest stem is reported as absent rather than guessed.", ""]
    if meta["lossy"]:
        R += [f"- The source is **lossy {meta['codec']}**. Compression artifacts in the original are baked into every stem and may sound like 'watery' bleed.", ""]
    R += ["## 6. Files", ""] + [f"- `{p}` — {l}" for l, p in written] + ["", "Open `preview.html` to A/B each stem against the original.", "",
          "Models: BS-Roformer-SW (6-stem), Mel-Roformer Karaoke (lead/backing), MDX23C DrumSep (kit). Open-source weights, run locally."]
    (out / "separation_report.md").write_text("\n".join(R), encoding="utf-8")
    log(f"done → {out / 'separation_report.md'}")


if __name__ == "__main__":
    main()
