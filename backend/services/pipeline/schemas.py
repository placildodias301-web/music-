"""
The pipeline's JSON contract. All times are seconds from the start of the
original upload's audio, clamped to [0, audio_duration].
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

JobStatus = Literal["queued", "running", "completed", "failed"]
ChordType = Literal["chord", "no_chord", "passing", "transition", "embellishment"]


class Section(BaseModel):
    start: float
    end: float
    label: str


class ChordSpan(BaseModel):
    start: float
    end: float
    # Harte notation from the chord model ("C:maj", "A:min7", "N").
    chord: str
    # The app's simple label for the existing chord timeline ("C", "Am7", "G/B", "N").
    # None when the app has no symbol for the chord's quality.
    simple: Optional[str] = None
    type: ChordType = "chord"
    confidence: Optional[float] = None


class Event(BaseModel):
    time: float
    type: str  # chord_change | downbeat | section_start | possible_fill
    value: Optional[str] = None
    # chord_change: "passing" for a passing/transition chord. Optional, so older results still validate.
    subtype: Optional[str] = None
    confidence: Optional[float] = None


class KeyAlternative(BaseModel):
    key: str
    score: float


class DifficultyFactors(BaseModel):
    chordComplexity: float
    chordChangeRate: float
    tempo: float
    modulation: float


class Difficulty(BaseModel):
    # Same shape (and camelCase) as v2's services/difficulty.py, so the frontend reads one type.
    difficultyLabel: Literal["Beginner", "Intermediate", "Advanced"]
    difficultyScore: float
    factors: DifficultyFactors


class PipelineResult(BaseModel):
    status: Literal["completed"] = "completed"
    pipeline_version: int
    audio_duration: float
    sample_rate: int
    # None until the rhythm step exists / when no engine could estimate it.
    bpm: Optional[float] = None
    time_signature: Optional[str] = None
    beats: list[float] = Field(default_factory=list)
    downbeats: list[float] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)
    chords: list[ChordSpan] = Field(default_factory=list)
    events: list[Event] = Field(default_factory=list)
    # Key and difficulty, from the v2 engine's own algorithms (pipeline v6). None when no
    # chords or pitched sound were found; absent on results cached by older versions.
    key: Optional[str] = None  # "A Minor"
    mode: Optional[str] = None  # "major" | "minor"
    scale: Optional[str] = None
    key_confidence: Optional[float] = None
    key_alternatives: list[KeyAlternative] = Field(default_factory=list)
    difficulty: Optional[Difficulty] = None
    # Audio checks (pipeline v7): loudness, trimmed silence, clipping, noise, activity regions,
    # and per-stem quality. See services/pipeline/preprocess.py for every field.
    preprocessing: Optional[dict[str, Any]] = None
    # Which backend produced each part, e.g. {"rhythm": "allin1"} — so a
    # fallback is visible instead of silent.
    engines: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class JobError(BaseModel):
    code: str
    message: str


class JobView(BaseModel):
    job_id: str
    status: JobStatus
    stage: str
    progress: float
    file_name: str
    cached: bool
    created_at: float
    updated_at: float
    elapsed_seconds: float
    error: Optional[JobError] = None
    result: Optional[PipelineResult] = None
