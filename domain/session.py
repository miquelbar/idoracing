import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

CAR_ALIASES: dict[str, str] = {
    "porsche_992_gt3_r": "Porsche 911 GT3 R (992)",
    "porsche_911_gt3_r_992": "Porsche 911 GT3 R (992)",
    "992 gt3 r": "Porsche 911 GT3 R (992)",
    "porsche 992 gt3 r": "Porsche 911 GT3 R (992)",
    "porsche 911 gt3 r (992)": "Porsche 911 GT3 R (992)",
    "porsche 911 gt3 r": "Porsche 911 GT3 R (992)",
}

TRACK_ALIASES: dict[str, str] = {
    "valencia": "Ricardo Tormo de Valencia",
    "circuit ricardo tormo": "Ricardo Tormo de Valencia",
    "ricardo tormo": "Ricardo Tormo de Valencia",
    "ricardo tormo de valencia": "Ricardo Tormo de Valencia",
    "cheste": "Ricardo Tormo de Valencia",
}


def normalize_car_name(car: str | None) -> str:
    """Unify simulator vehicle identifiers under a single canonical model name."""
    if not car:
        return "Porsche 911 GT3 R (992)"
    cleaned = car.strip()
    return CAR_ALIASES.get(cleaned.lower(), cleaned)


def normalize_track_name(track: str | None) -> str:
    """Unify simulator circuit identifiers under a single canonical circuit name."""
    if not track:
        return "Ricardo Tormo de Valencia"
    cleaned = track.strip()
    return TRACK_ALIASES.get(cleaned.lower(), cleaned)


class Lap(BaseModel):
    """Represents a single lap within a driving session."""

    lap_number: int
    lap_time: float
    sector_times: list[float] = Field(default_factory=list)
    is_valid: bool = True
    is_incomplete: bool = Field(
        default=False, description="Whether this lap was truncated due to a garage teleport or reset"
    )
    telemetry: dict[str, list[float]] | None = None
    synthetic: bool = Field(default=False, description="Telemetry was generated, not recorded by the simulator")
    has_telemetry: bool = Field(default=False, description="Whether 50Hz telemetry channels were recorded for this lap")
    start_time: float | None = None
    end_time: float | None = None

    @model_validator(mode="after")
    def _infer_has_telemetry(self) -> "Lap":
        if not self.has_telemetry and self.telemetry and len(self.telemetry.get("speed", [])) >= 5:
            self.has_telemetry = True
        return self


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
    simulator: str | None = Field(default=None, description="Simulator that recorded the session, when it can be told")

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
    simulator: str | None = None
    has_telemetry: bool = True
    is_demo: bool = False


class CornerAnalysis(BaseModel):
    """Analysis of driving technique through a specific corner/segment."""

    corner_number: int
    corner_name: str
    start_dist: float
    end_dist: float
    apex_dist: float | None = None
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
    excess_steer_deg: float | None = Field(
        default=None, description="Excess steering angle in degrees beyond peak lateral grip"
    )
    steer_to_g: float | None = Field(
        default=None, description="Ackermann steer angle vs lateral acceleration ratio (deg/G)"
    )
    kerb_strike_detected: bool = Field(
        default=False, description="Whether a high-frequency kerb strike impact was detected"
    )
    damping_advice: str | None = Field(default=None, description="Fast vs slow damping recommendations")
    v_min_ideal: float = Field(default=0.0, description="Physical target apex speed from lateral grip envelope")
    v_exit_ideal: float = Field(default=0.0, description="Physical target exit speed")
    ideal_brake_point: float | None = Field(default=None, description="Ideal braking point distance in metres")
    ideal_throttle_point: float | None = Field(default=None, description="Ideal throttle pickup distance in metres")
    ideal_trail_pct: float = Field(default=55.0, description="Target trail braking percentage in turn-in window")
    ref_trail_pct: float = Field(default=0.0, description="Reference lap trail braking percentage in turn-in window")
    comp_trail_pct: float = Field(default=0.0, description="Comparison lap trail braking percentage in turn-in window")
    ideal_time_gain: float = Field(default=0.0, description="Potential time gain vs Ideal Ghost in this corner (s)")
    both_laps_fault: bool = Field(default=False, description="Whether both P1 and P2 share a technical fault vs Ideal")
    both_laps_fault_reason: str | None = Field(
        default=None, description="Explanation when both P1 and P2 underperform vs Ideal"
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


class SetupRecommendation(BaseModel):
    """A single structured setup recommendation derived from telemetry analysis."""

    category: str = Field(
        ...,
        description="Setup category: brake_bias, arb_front, arb_rear, tc, abs, wing, ride_height, camber, pressure, dampers, electronics",
    )
    parameter: str = Field(..., description="Human-readable parameter name, e.g. 'Brake Bias' or 'Front ARB'")
    suggested_change: str = Field(..., description="The change to apply, e.g. '+0.5% rearward' or '-1 click'")
    reason: str = Field(..., description="Why this change, grounded in the telemetry evidence")
    evidence: list[str] = Field(
        default_factory=list, description="Data points from telemetry supporting this recommendation"
    )
    affected_corners: list[str] = Field(default_factory=list, description="Corner names where this issue manifests")
    priority: str = Field(default="medium", description="Priority: high, medium, low")
    confidence: str = Field(default="medium", description="Confidence in this recommendation: high, medium, low")


class SetupAdviceReport(BaseModel):
    """Structured setup advice report generated from lap comparison telemetry."""

    summary: str = Field(default="", description="One-paragraph summary of the overall setup state")
    recommendations: list[SetupRecommendation] = Field(default_factory=list)
    overall_balance: str = Field(
        default="neutral", description="Overall car balance: understeer, oversteer, neutral, mixed"
    )
    primary_issue: str = Field(default="", description="The main issue costing the most time")
    confidence: str = Field(default="medium", description="Overall confidence: high, medium, low")
    created_at: datetime = Field(default_factory=datetime.now)


class SetupAdviceReview(BaseModel):
    """Structured setup advice enriched with Pep's natural-language review."""

    report: SetupAdviceReport
    pep_review: str = Field(default="", description="Pep's natural-language review of the structured advice")
    review_source: str = Field(default="rules", description="Source of the review: llm or rules")
    review_model: str | None = Field(default=None, description="Model that generated the review, if LLM")
    reviewed_at: datetime = Field(default_factory=datetime.now)
