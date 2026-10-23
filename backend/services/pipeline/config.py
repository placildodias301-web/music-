"""Pipeline settings, read from the environment (backend/.env)."""

import os
from dataclasses import dataclass

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Bump when a stage's output changes, so cached results from older code are
# not served as if they were current.
PIPELINE_VERSION = 5  # 2: Demucs stage, 3: rhythm stage, 4: chord stage, 5: events stage

ENGINES = ("v2", "pipeline")
RHYTHM_ENGINES = ("auto", "allin1", "beat_this")
CHORD_ENGINES = ("auto", "btc", "lv_chordia")


def _bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name, "").strip().lower()
    return default if not value else value in ("1", "true", "yes")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class PipelineConfig:
    data_dir: str
    analysis_engine: str
    job_timeout_seconds: int
    ffmpeg_timeout_seconds: int
    max_audio_seconds: int
    demucs_device: str = "cpu"
    # Keep jobs/<id>/stems/*.wav after a successful job (for listening/debugging).
    keep_stems: bool = False
    # auto = allin1 through WSL2 when it works, else beat_this; or force one engine.
    rhythm_engine: str = "auto"
    wsl_enabled: bool = True
    # Command that starts the Python which has allin1 installed (split like a shell line).
    # When its first word is wsl/wsl.exe, Windows paths are passed as /mnt/<drive>/... paths.
    wsl_command: str = "wsl.exe -d Ubuntu -- python3"
    rhythm_timeout_seconds: int = 900
    # auto = BTC, else lv-chordia when it is installed with its weights; or force one engine.
    chord_engine: str = "auto"
    chord_device: str = "cpu"
    chord_timeout_seconds: int = 600
    min_audio_seconds: float = 1.0
    sample_rate: int = 44100  # what htdemucs was trained on; later stages resample as they need

    @property
    def db_path(self) -> str:
        return os.path.join(self.data_dir, "pipeline.sqlite3")

    @property
    def jobs_dir(self) -> str:
        return os.path.join(self.data_dir, "jobs")


def load_config(data_dir: str | None = None) -> PipelineConfig:
    engine = os.environ.get("ANALYSIS_ENGINE", "v2").strip().lower()
    rhythm = os.environ.get("PIPELINE_RHYTHM_ENGINE", "auto").strip().lower()
    chords = os.environ.get("PIPELINE_CHORD_ENGINE", "auto").strip().lower()
    return PipelineConfig(
        data_dir=data_dir or os.environ.get("PIPELINE_DATA_DIR") or os.path.join(BACKEND_DIR, "pipeline_data"),
        analysis_engine=engine if engine in ENGINES else "v2",
        job_timeout_seconds=_int_env("PIPELINE_JOB_TIMEOUT_SECONDS", 1800),
        ffmpeg_timeout_seconds=_int_env("PIPELINE_FFMPEG_TIMEOUT_SECONDS", 180),
        max_audio_seconds=_int_env("PIPELINE_MAX_AUDIO_SECONDS", 900),
        demucs_device=os.environ.get("DEMUCS_DEVICE", "cpu").strip().lower() or "cpu",
        keep_stems=_bool_env("PIPELINE_KEEP_STEMS", False),
        rhythm_engine=rhythm if rhythm in RHYTHM_ENGINES else "auto",
        wsl_enabled=_bool_env("PIPELINE_WSL_ENABLED", True),
        wsl_command=os.environ.get("PIPELINE_WSL_COMMAND", "").strip() or "wsl.exe -d Ubuntu -- python3",
        rhythm_timeout_seconds=_int_env("PIPELINE_RHYTHM_TIMEOUT_SECONDS", 900),
        chord_engine=chords if chords in CHORD_ENGINES else "auto",
        chord_device=os.environ.get("PIPELINE_CHORD_DEVICE", "cpu").strip().lower() or "cpu",
        chord_timeout_seconds=_int_env("PIPELINE_CHORD_TIMEOUT_SECONDS", 600),
    )
