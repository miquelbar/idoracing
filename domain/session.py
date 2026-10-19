import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class Lap(BaseModel):
    """Represents a single lap within a driving session."""

    lap_number: int
    lap_time: float
    sector_times: list[float] = Field(default_factory=list)
    is_valid: bool = True
    telemetry: dict[str, list[float]] | None = None
    synthetic: bool = Field(default=False, description="Telemetry was generated, not recorded by the simulator")
    start_time: float | None = None
    end_time: float | None = None


class Session(BaseModel):
    """Represents an imported driving session with metadata and telemetry."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique session identifier")
    session_id: str = Field(..., description="MoTeC session ID or imported identifier")
    car: str = Field(..., description="Car model used in the session")
    track: str = Field(..., description="Circuit name")
    date: datetime = Field(..., description="Session date and time")
    telemetry: dict[str, list[float]] = Field(default_factory=dict, description="Session-wide telemetry channels")
    laps: list[Lap] = Field(default_factory=list, description="List of segmented laps")
    source_file: str | None = Field(default=None, description="Original source filename or path")

    @model_validator(mode="after")
    def validate_telemetry_channels(self) -> "Session":
        if self.telemetry:
            # Map canonical channel names for case-insensitivity and standard aliases
            normalized_keys = {k.lower(): k for k in self.telemetry}
            aliases = {
                "speed": ["speed", "corr speed"],
                "throttle": ["throttle", "throttle pos"],
                "brake": ["brake", "brake pos"],
                "gear": ["gear"],
                "lat_accel": ["lat_accel", "g force lat", "g_lat", "glat"],
                "long_accel": ["long_accel", "g force long", "g_lon", "glong"],
            }
            required_channels = ["speed", "throttle", "brake", "gear", "lat_accel", "long_accel"]
            for req in required_channels:
                matching = [alias for alias in aliases[req] if alias in normalized_keys]
                if not matching and req not in self.telemetry:
                    raise ValueError(f"Missing required telemetry channel: {req}")
        return self


class SessionSummary(BaseModel):
    """Compact summary of a driving session."""

    session_id: str
    car: str
    track: str
    date: datetime
    duration: float
    best_lap_time: float
    average_speed: float
    lap_count: int = 0
    id: str | None = None


class CornerAnalysis(BaseModel):
    """Analysis of driving technique through a specific corner/segment."""

    corner_number: int
    corner_name: str
    start_dist: float
    end_dist: float
    ref_entry_speed: float = 0.0
    comp_entry_speed: float = 0.0
    delta_v_entry: float = 0.0
    ref_min_speed: float
    comp_min_speed: float
    delta_v_min: float = 0.0
    speed_delta_min: float = 0.0
    ref_exit_speed: float = 0.0
    comp_exit_speed: float = 0.0
    delta_v_exit: float = 0.0
    time_delta_corner: float
    ref_brake_point: float | None = None
    comp_brake_point: float | None = None
    brake_delta_dist: float | None = None
    ref_throttle_point: float | None = None
    comp_throttle_point: float | None = None
    throttle_delta_dist: float | None = None
    diagnosis: str = ""
    trail_eval: str | None = "Óptimo"
    trail_code: str = "neutral"
    trail_advice: str | None = None
    ref_gear: int = 0
    comp_gear: int = 0
    gear_eval: str = "Óptima"
    gear_code: str = "match"
    gear_advice: str = ""
    balance_eval: str = "Equilibrio Neutro"
    balance_code: str = "neutral"
    balance_advice: str = ""
    racing_line_eval: str = "Trazada Óptima"
    racing_line_code: str = "optimal"
    racing_line_advice: str = ""
    racing_line_svg: dict[str, Any] | None = None
    line_offset_entry_m: float | None = Field(
        default=None, description="Metres wider (+) or tighter (-) than the reference at entry"
    )
    line_offset_apex_m: float | None = Field(
        default=None, description="Metres wider (+) or tighter (-) than the reference at the apex"
    )
    line_offset_exit_m: float | None = Field(
        default=None, description="Metres wider (+) or tighter (-) than the reference at exit"
    )


class LapComparison(BaseModel):
    """Detailed comparison between a reference lap and a comparison lap."""

    reference_lap: str
    comparison_lap: str
    time_difference: float
    sector_differences: dict[str, float] = Field(default_factory=dict)
    speed_differences: dict[str, float] = Field(default_factory=dict)
    throttle_differences: dict[str, float] = Field(default_factory=dict)
    brake_differences: dict[str, float] = Field(default_factory=dict)
    gear_changes: dict[str, int] = Field(default_factory=dict)
    corners: list[CornerAnalysis] = Field(default_factory=list)
    aligned_distance: list[float] | None = None
    time_delta_profile: list[float] | None = None
    speed_delta_profile: list[float] | None = None


class CoachReport(BaseModel):
    """Structured report produced by the driving coach (numerical analysis + local AI)."""

    facts: list[str] = Field(default_factory=list, description="Hechos observados directamente en los datos")
    metrics: dict[str, Any] = Field(default_factory=dict, description="Métricas calculadas numéricamente")
    hypotheses: list[str] = Field(
        default_factory=list, description="Hipótesis de conducción sobre por qué se pierde tiempo"
    )
    exercises: list[str] = Field(
        default_factory=list, description="Ejercicios concretos y delimitados para la siguiente sesión"
    )
    verification_indicator: str = Field(
        default="", description="Indicador numérico para comprobar si el ejercicio funcionó"
    )
    confidence: str = Field(default="Alta", description="Nivel de confianza del análisis (Alta / Media / Baja)")
    raw_report: str = Field(default="", description="Texto completo del informe en formato Markdown")
    created_at: datetime = Field(default_factory=datetime.now)
