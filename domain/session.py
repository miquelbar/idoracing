from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field, model_validator


class Lap(BaseModel):
    """Represents a single lap within a driving session."""
    lap_number: int
    lap_time: float
    sector_times: List[float] = Field(default_factory=list)
    is_valid: bool = True
    telemetry: Optional[Dict[str, List[float]]] = None
    synthetic: bool = Field(default=False, description="Telemetry was generated, not recorded by the simulator")
    start_time: Optional[float] = None
    end_time: Optional[float] = None


class Session(BaseModel):
    """Represents an imported driving session with metadata and telemetry."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique session identifier")
    session_id: str = Field(..., description="MoTeC session ID or imported identifier")
    car: str = Field(..., description="Car model used in the session")
    track: str = Field(..., description="Circuit name")
    date: datetime = Field(..., description="Session date and time")
    telemetry: Dict[str, List[float]] = Field(default_factory=dict, description="Session-wide telemetry channels")
    laps: List[Lap] = Field(default_factory=list, description="List of segmented laps")
    source_file: Optional[str] = Field(default=None, description="Original source filename or path")

    @model_validator(mode="after")
    def validate_telemetry_channels(self) -> "Session":
        if self.telemetry:
            # Map canonical channel names for case-insensitivity and standard aliases
            normalized_keys = {k.lower(): k for k in self.telemetry.keys()}
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
    id: Optional[str] = None


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
    ref_brake_point: Optional[float] = None
    comp_brake_point: Optional[float] = None
    brake_delta_dist: Optional[float] = None
    ref_throttle_point: Optional[float] = None
    comp_throttle_point: Optional[float] = None
    throttle_delta_dist: Optional[float] = None
    diagnosis: str = ""
    trail_eval: Optional[str] = "Óptimo"
    trail_advice: Optional[str] = None
    ref_gear: int = 0
    comp_gear: int = 0
    gear_eval: str = "Óptima"
    gear_advice: str = ""
    balance_eval: str = "Equilibrio Neutro"
    balance_advice: str = ""
    racing_line_eval: str = "Trazada Óptima"
    racing_line_advice: str = ""
    racing_line_svg: Optional[Dict[str, Any]] = None


class LapComparison(BaseModel):
    """Detailed comparison between a reference lap and a comparison lap."""
    reference_lap: str
    comparison_lap: str
    time_difference: float
    sector_differences: Dict[str, float] = Field(default_factory=dict)
    speed_differences: Dict[str, float] = Field(default_factory=dict)
    throttle_differences: Dict[str, float] = Field(default_factory=dict)
    brake_differences: Dict[str, float] = Field(default_factory=dict)
    gear_changes: Dict[str, int] = Field(default_factory=dict)
    corners: List[CornerAnalysis] = Field(default_factory=list)
    aligned_distance: Optional[List[float]] = None
    time_delta_profile: Optional[List[float]] = None
    speed_delta_profile: Optional[List[float]] = None


class CoachReport(BaseModel):
    """Structured report produced by the driving coach (numerical analysis + local AI)."""
    facts: List[str] = Field(default_factory=list, description="Hechos observados directamente en los datos")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Métricas calculadas numéricamente")
    hypotheses: List[str] = Field(default_factory=list, description="Hipótesis de conducción sobre por qué se pierde tiempo")
    exercises: List[str] = Field(default_factory=list, description="Ejercicios concretos y delimitados para la siguiente sesión")
    verification_indicator: str = Field(default="", description="Indicador numérico para comprobar si el ejercicio funcionó")
    confidence: str = Field(default="Alta", description="Nivel de confianza del análisis (Alta / Media / Baja)")
    raw_report: str = Field(default="", description="Texto completo del informe en formato Markdown")
    created_at: datetime = Field(default_factory=datetime.now)