"""
IdoRacing Analytics FastAPI backend: session import and storage, lap comparison,
corner analysis, track outlines and the AI race engineer endpoints.
"""

import glob
import logging
import os
import struct
import tempfile
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from typing import Any, Literal

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from analysis.alignment import align_laps_by_distance
from analysis.demo_session import create_synthetic_session
from analysis.lap_comparison import compare_laps
from analysis.stint_analysis import analyze_session_stint
from analysis.telemetry_generator import ensure_session_telemetry
from analysis.tire_thermal import analyze_all_tyres
from analysis.tracks import generate_track_coordinates
from coach.advisor import CoachAdvisor
from coach.knowledge_base import knowledge_base
from coach.llm_client import LLMClient
from coach.prompt import PEP_SYSTEM_PROMPT_EN, PEP_SYSTEM_PROMPT_ES
from coach.radio import generate_race_engineer_response
from domain.session import CoachReport, CornerAnalysis, Lap, Session
from importers.csv_importer import CSVImporter
from importers.lmu_importer import LMUImporter
from importers.moteclib.importer import MoTeCImporter
from storage.database import Storage

ACC_DOCUMENTS_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents"
)
ACC_MOTEC_DIR = os.path.join(ACC_DOCUMENTS_DIR, "Assetto Corsa Competizione", "MoTeC")
# Where idoracing-recorder writes by default when it runs inside ACC's Proton prefix.
ACC_RECORDINGS_DIR = os.path.join(ACC_DOCUMENTS_DIR, "IdoRacing", "recordings")
LMU_RESULTS_DIR = os.path.expanduser("~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results")
MAX_UPLOAD_BYTES = 512 * 1024 * 1024


load_dotenv()
logger = logging.getLogger(__name__)
storage = Storage()

llm_client = LLMClient(
    provider=os.environ.get("LLM_PROVIDER", "ollama"),
    ollama_base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    ollama_model=os.environ.get("OLLAMA_MODEL", "qwen3.8:27b"),
    openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
    openai_base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    openai_model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
    timeout=float(os.environ.get("OLLAMA_TIMEOUT", "90.0")),
    enabled=os.environ.get("AI_ENABLED", "true").lower() in ("true", "1", "yes"),
)
advisor = CoachAdvisor(llm_client)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database is initialized
    sessions = storage.list_sessions()
    if not sessions:
        synth = create_synthetic_session()
        storage.save_session(synth)

        # Auto-import newest detected LMU session if available
        if os.path.exists(LMU_RESULTS_DIR):
            xmls = sorted(glob.glob(os.path.join(LMU_RESULTS_DIR, "*.xml")), key=os.path.getmtime, reverse=True)
            for xf in xmls[:2]:
                try:
                    sess = LMUImporter(xf).parse()
                except (ValueError, ET.ParseError) as e:
                    logger.warning("Skipping unreadable LMU results %s: %s", xf, e)
                    continue
                if sess.laps:
                    storage.save_session(sess)
    yield


app = FastAPI(
    title="IdoRacing Analytics API",
    version="2026.2",
    lifespan=lifespan,
)


# --- DTO Models ---
class SystemStatus(BaseModel):
    status: str
    version: str
    provider: str
    ai_available: bool
    active_model: str
    ollama_models: list[str]
    session_count: int


class SettingsDTO(BaseModel):
    provider: str = "ollama"
    ollama_model: str = "qwen3.8:27b"
    ollama_base_url: str = "http://localhost:11434"
    openai_api_key: str | None = ""
    openai_base_url: str | None = "https://api.openai.com/v1"
    openai_model: str | None = "gpt-4o-mini"
    chat_timeout: float = 120.0


class CornerDTO(BaseModel):
    corner_number: int
    name: str
    start_distance: float
    end_distance: float
    apex_distance: float
    v_min_ref: float
    v_min_comp: float
    delta_v_min: float
    v_entry_ref: float | None = None
    v_entry_comp: float | None = None
    delta_v_entry: float | None = None
    v_exit_ref: float | None = None
    v_exit_comp: float | None = None
    delta_v_exit: float | None = None
    delta_time: float
    braking_point_delta: float
    throttle_pickup_delta: float
    diagnosis: str
    severity: str
    trail_braking_eval: str | None
    trail_braking_code: str
    trail_braking_advice: str | None = None
    ref_gear: int
    comp_gear: int
    gear_eval: str
    gear_code: str
    gear_advice: str
    balance_eval: str
    balance_code: str
    balance_advice: str
    racing_line_eval: str
    racing_line_code: str
    racing_line_advice: str
    racing_line_svg: dict[str, Any] | None = None
    line_offset_entry_m: float | None = None
    line_offset_apex_m: float | None = None
    line_offset_exit_m: float | None = None
    excess_steer_deg: float | None = None
    steer_to_g: float | None = None
    kerb_strike_detected: bool = False
    damping_advice: str | None = None


class ComparisonResponse(BaseModel):
    session_id: str
    ref_lap_id: str
    comp_lap_id: str
    ref_lap_time: float
    comp_lap_time: float
    delta_time_total: float
    track_name: str
    car_name: str
    game_name: str | None = None
    distance: list[float]
    ref_speed: list[float]
    comp_speed: list[float]
    delta_speed: list[float]
    delta_time: list[float]
    ref_throttle: list[float]
    comp_throttle: list[float]
    ref_brake: list[float]
    comp_brake: list[float]
    ref_gear: list[int]
    comp_gear: list[int]
    track_x: list[float]
    track_y: list[float]
    ref_x: list[float] | None = None
    ref_y: list[float] | None = None
    comp_x: list[float] | None = None
    comp_y: list[float] | None = None
    ref_sectors: dict[str, float]
    comp_sectors: dict[str, float]
    corners: list[CornerDTO]
    telemetry_source: Literal["recorded", "synthetic"]


class CarSetupDTO(BaseModel):
    session_id: str
    car_name: str
    track_name: str
    game_name: str | None = None
    tyres: dict[str, Any]
    electronics: dict[str, Any]
    aero: dict[str, Any]
    chassis: dict[str, Any]
    setup_advice: list[dict[str, str]]


class AIAdviceRequest(BaseModel):
    ref_lap_id: str
    comp_lap_id: str
    session_id: str | None = None
    force_refresh: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    ref_lap_id: str | None = None
    comp_lap_id: str | None = None
    track_name: str | None = None
    car_name: str | None = None
    selected_corner: dict[str, Any] | None = None
    lang: str | None = "es"


class LocalImportRequest(BaseModel):
    filepath: str


class LapRecordDTO(BaseModel):
    lap_number: int
    lap_time: float
    lap_time_str: str
    sector_times: list[float]
    gap_to_pb: float
    is_pb: bool
    v_max: float | None = None
    date: str
    session_id: str


class LapHistoryResponse(BaseModel):
    pb_lap: LapRecordDTO
    comparison_lap: LapRecordDTO | None = None
    laps: list[LapRecordDTO]
    track_name: str
    car_name: str
    delta_s1: float
    delta_s2: float
    delta_s3: float
    delta_total: float


# --- API Endpoints ---
@app.get("/api/health", response_model=SystemStatus)
def get_health():
    sessions = storage.list_sessions()
    ollama_models = llm_client.ollama.list_models()
    return SystemStatus(
        status="operational",
        version="2026.2.0",
        provider=llm_client.provider,
        ai_available=llm_client.is_available(),
        active_model=llm_client.active_model,
        ollama_models=ollama_models,
        session_count=len(sessions),
    )


@app.get("/api/settings", response_model=SettingsDTO)
def get_settings():
    return SettingsDTO(
        provider=llm_client.provider,
        ollama_model=llm_client.ollama_model,
        ollama_base_url=llm_client.ollama_base_url,
        openai_api_key="***" if llm_client.openai_api_key else "",
        openai_base_url=llm_client.openai_base_url,
        openai_model=llm_client.openai_model,
        chat_timeout=getattr(llm_client, "chat_timeout", 120.0),
    )


@app.post("/api/settings")
def update_settings(cfg: SettingsDTO):
    llm_client.provider = cfg.provider.lower()
    llm_client.ollama_model = cfg.ollama_model
    llm_client.ollama.model = cfg.ollama_model
    llm_client.ollama_base_url = cfg.ollama_base_url
    llm_client.ollama.base_url = cfg.ollama_base_url.rstrip("/")
    if cfg.chat_timeout is not None:
        llm_client.chat_timeout = float(cfg.chat_timeout)

    new_key = cfg.openai_api_key.strip() if cfg.openai_api_key and cfg.openai_api_key != "***" else None
    new_base_url = cfg.openai_base_url.strip().rstrip("/") if cfg.openai_base_url else None
    if new_base_url and new_base_url != llm_client.openai_base_url:
        # The stored key must never travel to a host it was not entered for.
        llm_client.openai_api_key = ""
        llm_client.openai_base_url = new_base_url
    if new_key:
        llm_client.openai_api_key = new_key
    if cfg.openai_model:
        llm_client.openai_model = cfg.openai_model.strip()

    return {"status": "ok", "provider": llm_client.provider, "active_model": llm_client.active_model}


@app.get("/api/sessions")
def list_sessions():
    return storage.list_sessions()


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    sess = storage.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return sess


@app.post("/api/sessions/demo")
def generate_demo_session():
    synth = create_synthetic_session()
    storage.save_session(synth)
    return {"status": "ok", "session_id": synth.session_id, "track": synth.track, "car": synth.car}


def _load_session(session_id: str | None) -> Session:
    """The requested session, or the most recent one when no id is given."""
    if not session_id:
        sessions = storage.list_sessions()
        if not sessions:
            raise HTTPException(status_code=404, detail="No telemetry sessions found")
        session_id = sessions[0].session_id
    session = storage.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _find_lap(session: Session, lap_id: str) -> Lap | None:
    return next((l for l in session.laps if lap_id in (f"Lap {l.lap_number}", str(l.lap_number))), None)


def _severity(time_delta: float) -> str:
    if time_delta < -0.05:
        return "success"
    if time_delta > 0.30:
        return "critical"
    if time_delta > 0.15:
        return "warning"
    return "info"


def _corner_dto(c: CornerAnalysis) -> CornerDTO:
    return CornerDTO(
        corner_number=c.corner_number,
        name=c.corner_name or f"Curva {c.corner_number}",
        start_distance=c.start_dist,
        end_distance=c.end_dist,
        apex_distance=c.apex_dist if c.apex_dist is not None else (c.start_dist + c.end_dist) / 2.0,
        v_min_ref=round(c.ref_min_speed, 1),
        v_min_comp=round(c.comp_min_speed, 1),
        delta_v_min=round(c.delta_v_min, 1),
        v_entry_ref=round(c.ref_entry_speed, 1),
        v_entry_comp=round(c.comp_entry_speed, 1),
        delta_v_entry=round(c.delta_v_entry, 1),
        v_exit_ref=round(c.ref_exit_speed, 1),
        v_exit_comp=round(c.comp_exit_speed, 1),
        delta_v_exit=round(c.delta_v_exit, 1),
        delta_time=round(c.time_delta_corner, 3),
        braking_point_delta=round(c.brake_delta_dist or 0.0, 1),
        throttle_pickup_delta=round(c.throttle_delta_dist or 0.0, 1),
        diagnosis=c.diagnosis or "Trazada óptima en el segmento.",
        severity=_severity(c.time_delta_corner),
        trail_braking_eval=c.trail_eval,
        trail_braking_code=c.trail_code,
        trail_braking_advice=c.trail_advice,
        ref_gear=c.ref_gear,
        comp_gear=c.comp_gear,
        gear_eval=c.gear_eval,
        gear_code=c.gear_code,
        gear_advice=c.gear_advice,
        balance_eval=c.balance_eval,
        balance_code=c.balance_code,
        balance_advice=c.balance_advice,
        racing_line_eval=c.racing_line_eval,
        racing_line_code=c.racing_line_code,
        racing_line_advice=c.racing_line_advice,
        racing_line_svg=c.racing_line_svg,
        line_offset_entry_m=c.line_offset_entry_m,
        line_offset_apex_m=c.line_offset_apex_m,
        line_offset_exit_m=c.line_offset_exit_m,
        excess_steer_deg=c.excess_steer_deg,
        steer_to_g=c.steer_to_g,
        kerb_strike_detected=c.kerb_strike_detected,
        damping_advice=c.damping_advice,
    )


@app.get("/api/comparison", response_model=ComparisonResponse)
def get_lap_comparison(
    ref_lap_id: str | None = Query(None),
    comp_lap_id: str | None = Query(None),
    session_id: str | None = Query(None),
):
    matched_session = ensure_session_telemetry(_load_session(session_id))
    ref_lap = _find_lap(matched_session, ref_lap_id) if ref_lap_id else None
    comp_lap = _find_lap(matched_session, comp_lap_id) if comp_lap_id else None

    if not ref_lap or not comp_lap:
        ranked = sorted(
            [l for l in matched_session.laps if l.lap_time > 0 and l.is_valid] or matched_session.laps,
            key=lambda x: x.lap_time,
        )
        if not ranked:
            raise HTTPException(status_code=404, detail="Session has no laps")
        ref_lap = ranked[0]
        comp_lap = ranked[1] if len(ranked) > 1 else ranked[0]

    comparison = compare_laps(ref_lap, comp_lap, track_name=matched_session.track)
    aligned = align_laps_by_distance(ref_lap.telemetry or {}, comp_lap.telemetry or {}, step_m=2.0)

    # Build telemetry arrays
    distance_grid = aligned["distance"].tolist()
    ref_speed = aligned["ref_speed"].tolist()
    comp_speed = aligned["comp_speed"].tolist()
    delta_speed = (aligned["comp_speed"] - aligned["ref_speed"]).tolist()
    delta_time = aligned["time_delta"].tolist()
    ref_thr = aligned["ref_throttle"].tolist()
    comp_thr = aligned["comp_throttle"].tolist()
    ref_brk = aligned["ref_brake"].tolist()
    comp_brk = aligned["comp_brake"].tolist()
    ref_gr = [int(g) for g in aligned["ref_gear"].tolist()]
    comp_gr = [int(g) for g in aligned["comp_gear"].tolist()]

    track_x, track_y = generate_track_coordinates(matched_session.track, aligned["distance"], aligned)

    corners_dto = [_corner_dto(c) for c in comparison.corners]

    ref_sectors = {f"S{i + 1}": t for i, t in enumerate(ref_lap.sector_times)}
    comp_sectors = {f"S{i + 1}": t for i, t in enumerate(comp_lap.sector_times)}

    detected_game = matched_session.simulator
    if detected_game is None and "iracing" in f"{matched_session.session_id} {matched_session.source_file}".lower():
        detected_game = "iRacing"

    return ComparisonResponse(
        session_id=matched_session.session_id,
        ref_lap_id=f"Lap {ref_lap.lap_number}",
        comp_lap_id=f"Lap {comp_lap.lap_number}",
        ref_lap_time=ref_lap.lap_time,
        comp_lap_time=comp_lap.lap_time,
        delta_time_total=round(comp_lap.lap_time - ref_lap.lap_time, 3),
        track_name=matched_session.track,
        car_name=matched_session.car,
        game_name=detected_game,
        distance=distance_grid,
        ref_speed=ref_speed,
        comp_speed=comp_speed,
        delta_speed=delta_speed,
        delta_time=delta_time,
        ref_throttle=ref_thr,
        comp_throttle=comp_thr,
        ref_brake=ref_brk,
        comp_brake=comp_brk,
        ref_gear=ref_gr,
        comp_gear=comp_gr,
        track_x=track_x,
        track_y=track_y,
        ref_x=aligned["ref_x"].tolist() if "ref_x" in aligned and np.any(aligned["ref_x"] != 0) else None,
        ref_y=aligned["ref_y"].tolist() if "ref_y" in aligned and np.any(aligned["ref_y"] != 0) else None,
        comp_x=aligned["comp_x"].tolist() if "comp_x" in aligned and np.any(aligned["comp_x"] != 0) else None,
        comp_y=aligned["comp_y"].tolist() if "comp_y" in aligned and np.any(aligned["comp_y"] != 0) else None,
        ref_sectors=ref_sectors,
        comp_sectors=comp_sectors,
        corners=corners_dto,
        telemetry_source="synthetic" if (ref_lap.synthetic or comp_lap.synthetic) else "recorded",
    )


def format_seconds_to_lap(seconds: float) -> str:
    if seconds <= 0 or np.isnan(seconds):
        return "--:--.---"
    m = int(seconds // 60)
    s = seconds % 60
    return f"{m}:{s:06.3f}"


@app.get("/api/lap-history", response_model=LapHistoryResponse)
def get_lap_history(
    session_id: str | None = Query(None),
    ref_lap_number: int | None = Query(None),
    comp_lap_number: int | None = Query(None),
):
    matched_session = _load_session(session_id)
    valid_laps = [l for l in matched_session.laps if l.lap_time > 0 and l.is_valid] or matched_session.laps
    timed_laps = [l for l in valid_laps if l.lap_time > 0]
    if not timed_laps:
        raise HTTPException(status_code=404, detail="Session has no timed laps")
    pb_time = min(l.lap_time for l in timed_laps)

    lap_records: list[LapRecordDTO] = []
    for l in valid_laps:
        gap = round(l.lap_time - pb_time, 3)
        recorded_speed = l.telemetry.get("speed") if (l.telemetry and not l.synthetic) else None
        lap_records.append(
            LapRecordDTO(
                lap_number=l.lap_number,
                lap_time=l.lap_time,
                lap_time_str=format_seconds_to_lap(l.lap_time),
                sector_times=[round(s, 3) for s in l.sector_times] if l.sector_times else [],
                gap_to_pb=gap,
                is_pb=(l.lap_time == pb_time),
                v_max=round(float(max(recorded_speed)), 1) if recorded_speed else None,
                date=matched_session.date.strftime("%d/%m/%Y %H:%M"),
                session_id=matched_session.session_id,
            )
        )

    pb_record = next(r for r in lap_records if r.is_pb)

    comp_record = None
    if comp_lap_number is not None:
        comp_record = next((r for r in lap_records if r.lap_number == comp_lap_number), None)
    elif len(lap_records) > 1:
        # Pick the second lap or another lap
        comp_record = lap_records[0] if lap_records[0] != pb_record else lap_records[1]

    delta_s1 = 0.0
    delta_s2 = 0.0
    delta_s3 = 0.0
    delta_total = 0.0

    if comp_record:
        delta_total = round(comp_record.lap_time - pb_record.lap_time, 3)
        if len(pb_record.sector_times) >= 3 and len(comp_record.sector_times) >= 3:
            delta_s1 = round(comp_record.sector_times[0] - pb_record.sector_times[0], 3)
            delta_s2 = round(comp_record.sector_times[1] - pb_record.sector_times[1], 3)
            delta_s3 = round(comp_record.sector_times[2] - pb_record.sector_times[2], 3)

    return LapHistoryResponse(
        pb_lap=pb_record,
        comparison_lap=comp_record,
        laps=lap_records,
        track_name=matched_session.track,
        car_name=matched_session.car,
        delta_s1=delta_s1,
        delta_s2=delta_s2,
        delta_s3=delta_s3,
        delta_total=delta_total,
    )


@app.get("/api/car-setup", response_model=CarSetupDTO)
def get_car_setup(session_id: str | None = Query(None)):
    matched_session = _load_session(session_id)
    detected_game = matched_session.simulator or (
        "iRacing"
        if "iracing" in f"{matched_session.session_id} {matched_session.source_file}".lower()
        else "Assetto Corsa Competizione"
    )

    car = matched_session.car or "Porsche 992 GT3 R"
    track = matched_session.track or "Valencia"

    tyres_dict = {
        "compound": "DHE Slick Dry",
        "pressures_hot": {"FL": 26.8, "FR": 26.9, "RL": 26.7, "RR": 26.8},
        "pressures_cold": {"FL": 24.5, "FR": 24.6, "RL": 24.2, "RR": 24.3},
        "optimal_window": "26.5 - 27.0 psi",
        "temps_c": {"FL": [78, 81, 85], "FR": [84, 82, 79], "RL": [79, 82, 84], "RR": [83, 81, 78]},
    }
    tyres_dict["thermal_diagnostics"] = analyze_all_tyres(tyres_dict)

    return CarSetupDTO(
        session_id=matched_session.session_id,
        car_name=car,
        track_name=track,
        game_name=detected_game,
        tyres=tyres_dict,
        electronics={
            "tc1": 3,
            "tc2": 4,
            "abs": 3,
            "brake_bias": 54.0,
            "ecu_map": 1,
        },
        aero={
            "front_splitter": 6,
            "rear_wing": 8,
            "ride_height_front_mm": 54.0,
            "ride_height_rear_mm": 72.0,
            "rake_mm": 18.0,
        },
        chassis={
            "arb_front": 4,
            "arb_rear": 2,
            "camber_front_deg": -3.8,
            "camber_rear_deg": -3.0,
            "toe_front_deg": -0.10,
            "toe_rear_deg": 0.15,
            "preload_diff_nm": 90,
        },
        setup_advice=[
            {
                "title": "Subviraje en curvas lentas (T2 Doohan / T10)",
                "suggestion": "Si notas que el tren delantero no muerde al soltar freno, retrasa el reparto de frenada a 53.5% (-0.5%) o ablanda la barra estabilizadora delantera 1 punto (ARB 3).",
                "impact": "Mejora inserción y velocidad en vértice.",
            },
            {
                "title": "Ventana de presiones",
                "suggestion": "Las presiones en caliente ruedan en 26.7 - 26.9 psi, perfectamente dentro de la ventana de máximo agarre para GT3 en ACC.",
                "impact": "Grip lateral óptimo.",
            },
            {
                "title": "Tracción en salida a meta (T14 Adrián Campos)",
                "suggestion": "Si la zaga se descoloca en aceleración con volante girado, aumenta TC1 de 3 a 4 o sube el alerón trasero a 9 para dar mayor apoyo a alta velocidad en la recta.",
                "impact": "Estabilidad en aceleración.",
            },
        ],
    )


@app.get("/api/stint-analysis")
def get_stint_analysis(session_id: str | None = Query(None)):
    matched_session = _load_session(session_id)
    return analyze_session_stint(matched_session)


@app.post("/api/coach/report", response_model=CoachReport)
def generate_coach_report(req: AIAdviceRequest):
    matched_session = ensure_session_telemetry(_load_session(req.session_id))
    ref_lap = _find_lap(matched_session, req.ref_lap_id)
    comp_lap = _find_lap(matched_session, req.comp_lap_id)
    if not ref_lap or not comp_lap:
        raise HTTPException(status_code=404, detail="Laps not found for coach report")

    if not req.force_refresh:
        cached = storage.get_coach_report(matched_session.session_id, ref_lap.lap_number, comp_lap.lap_number)
        if cached:
            return cached

    comparison = compare_laps(ref_lap, comp_lap, track_name=matched_session.track)
    report = advisor.generate_report(
        comparison,
        car=matched_session.car,
        track=matched_session.track,
        synthetic=ref_lap.synthetic or comp_lap.synthetic,
    )
    storage.save_coach_report(matched_session.session_id, ref_lap.lap_number, comp_lap.lap_number, report)
    return report


CHAT_LABELS = {
    "en": {
        "prompt": PEP_SYSTEM_PROMPT_EN,
        "session": "Current track: {track}. Vehicle: {car}.",
        "unknown_track": "unknown track",
        "unknown_car": "unknown car",
        "corner": "Selected corner in telemetry: T{num} ({name}).",
        "time": "- Time delta: {delta:+.3f}s.",
        "apex": "- Apex minimum speed",
        "entry": "- Entry speed",
        "exit": "- Exit speed",
        "gear": "- Gear at apex: {gear} ({eval}).",
        "balance": "- Balance: {eval}.",
        "trail": "- Trail braking: {eval}.",
        "line": "- Racing line: {eval}. {advice}",
        "brake_point": "- Braking point: {metres:+.0f} m against the reference (negative is earlier).",
        "throttle_point": "- Throttle pickup: {metres:+.0f} m against the reference (positive is later).",
        "diagnosis": "- Measured diagnosis: {text}",
        "same_setup": (
            "\nSETUP: both laps are the same car with the same setup, and the current setup values are not known. "
            "Do not quote setup values or suggest mechanical setup changes; focus 100% on driving technique."
        ),
        "format": (
            "Format your answers with structured Markdown: use bold for key terms, short bulleted lists for "
            "actionable driving points, and clear line breaks. Do not write unformatted dense blocks."
        ),
    },
    "es": {
        "prompt": PEP_SYSTEM_PROMPT_ES,
        "session": "Circuito actual: {track}. Vehículo: {car}.",
        "unknown_track": "circuito desconocido",
        "unknown_car": "coche desconocido",
        "corner": "Curva seleccionada en telemetría: T{num} ({name}).",
        "time": "- Diferencia de tiempo: {delta:+.3f}s.",
        "apex": "- Velocidad mínima",
        "entry": "- Velocidad de entrada",
        "exit": "- Velocidad de salida",
        "gear": "- Marcha en vértice: {gear} ({eval}).",
        "balance": "- Balance: {eval}.",
        "trail": "- Trail braking: {eval}.",
        "line": "- Trazada: {eval}. {advice}",
        "brake_point": "- Punto de frenada: {metres:+.0f} m respecto a la referencia (negativo es antes).",
        "throttle_point": "- Apertura de gas: {metres:+.0f} m respecto a la referencia (positivo es más tarde).",
        "diagnosis": "- Diagnóstico medido: {text}",
        "same_setup": (
            "\nSETUP: las dos vueltas son del mismo coche con el mismo setup, y no se conocen los valores actuales "
            "de reglaje. No cites valores de setup ni sugieras cambios de reglaje mecánico; céntrate 100% en el pilotaje."
        ),
        "format": (
            "Formatea tus respuestas con Markdown estructurado: usa negritas para términos clave, listas cortas "
            "con viñetas para pasos accionables y saltos de línea claros. No escribas bloques apelmazados sin formato."
        ),
    },
}


def _speed_line(label: str, comp: Any, ref: Any) -> str | None:
    if comp is None or ref is None:
        return None
    comp, ref = float(comp), float(ref)
    return f"{label}: {comp:.1f} km/h (Ref: {ref:.1f} km/h, ΔV: {comp - ref:+.1f} km/h)."


def _chat_context(req: ChatRequest, lang: str) -> str:
    """System prompt for the radio chat: the engineer persona, knowledge base, then the selected corner's numbers."""
    labels = CHAT_LABELS["en" if lang == "en" else "es"]
    lines = [
        labels["prompt"],
        "",
        labels["session"].format(
            track=req.track_name or labels["unknown_track"], car=req.car_name or labels["unknown_car"]
        ),
    ]

    c = req.selected_corner
    symptoms = []
    if c:
        for f in ("balance_eval", "balance_code", "trail_braking_eval", "racing_line_code", "diagnosis"):
            val = c.get(f)
            if val:
                symptoms.append(str(val))

    user_query = req.messages[-1].content if req.messages else ""
    include_setup = any(k in user_query.lower() for k in ("setup", "reglaj", "barras", "bias", "reparto"))
    expert_kb = knowledge_base.retrieve_context(
        car_name=req.car_name, query=user_query, symptoms=symptoms, include_setup=include_setup
    )
    if expert_kb:
        lines.append(f"\n--- MANUAL DE INGENIERÍA DE PISTA Y DINÁMICA VEHICULAR (LITERATURA CANÓNICA) ---\n{expert_kb}")

    if c:
        lines.append("")
        lines.append(labels["corner"].format(num=c.get("corner_number", ""), name=c.get("name", "")))
        lines.append(labels["time"].format(delta=float(c.get("delta_time") or 0.0)))
        lines += [
            line
            for line in (
                _speed_line(labels["apex"], c.get("v_min_comp"), c.get("v_min_ref")),
                _speed_line(labels["entry"], c.get("v_entry_comp"), c.get("v_entry_ref")),
                _speed_line(labels["exit"], c.get("v_exit_comp"), c.get("v_exit_ref")),
            )
            if line
        ]
        if c.get("comp_gear") is not None:
            lines.append(labels["gear"].format(gear=c["comp_gear"], eval=c.get("gear_eval", "")))
        for key, field in (("balance", "balance_eval"), ("trail", "trail_braking_eval")):
            if c.get(field):
                lines.append(labels[key].format(eval=c[field]))
        if c.get("racing_line_eval"):
            lines.append(labels["line"].format(eval=c["racing_line_eval"], advice=c.get("racing_line_advice", "")))
        if c.get("braking_point_delta"):
            lines.append(labels["brake_point"].format(metres=float(c["braking_point_delta"])))
        if c.get("throttle_pickup_delta"):
            lines.append(labels["throttle_point"].format(metres=float(c["throttle_pickup_delta"])))
        if c.get("diagnosis"):
            lines.append(labels["diagnosis"].format(text=c["diagnosis"]))
        if c.get("excess_steer_deg"):
            lines.append(
                f"- Exceso de volante medido (Ackermann): {c['excess_steer_deg']:.1f}° por encima del agarre pico (Ratio: {c.get('steer_to_g')} deg/G)."
            )
        if c.get("kerb_strike_detected"):
            lines.append(
                f"- Dinámica de amortiguación sobre piano: {c.get('damping_advice') or 'Rebote brusco sobre piano.'}"
            )

    lines.append(labels["same_setup"])
    lines.append(labels["format"])
    return "\n".join(lines) + "\n"


@app.post("/api/coach/chat")
def chat_with_engineer(req: ChatRequest):
    """Interactive conversational chat with Race Engineer with full telemetry context."""
    lang = (req.lang or "es").lower()
    user_query = req.messages[-1].content if req.messages else ""

    context_prefix = _chat_context(req, lang)

    messages = [{"role": "system", "content": context_prefix}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    chat_timeout = getattr(llm_client, "chat_timeout", float(os.environ.get("RADIO_CHAT_TIMEOUT", "120.0")))
    reply = llm_client.chat(messages, timeout=chat_timeout)
    if reply and reply.strip():
        return {"role": "assistant", "content": reply, "source": "llm", "model": llm_client.active_model}

    reply = generate_race_engineer_response(
        query=user_query,
        car=req.car_name or ("this car" if lang == "en" else "este coche"),
        track=req.track_name or ("this track" if lang == "en" else "este circuito"),
        corner=req.selected_corner,
        lang=lang,
    )
    return {"role": "assistant", "content": reply, "source": "rules", "model": None}


@app.get("/api/autodiscover")
def autodiscover_files():
    acc_path = ACC_MOTEC_DIR
    lmu_res_path = LMU_RESULTS_DIR

    acc_files = sorted(
        glob.glob(os.path.join(acc_path, "*.ld")) + glob.glob(os.path.join(ACC_RECORDINGS_DIR, "*.csv")),
        key=os.path.getmtime,
        reverse=True,
    )

    lmu_files = []
    if os.path.exists(lmu_res_path):
        lmu_files = sorted(glob.glob(os.path.join(lmu_res_path, "*.xml")), key=os.path.getmtime, reverse=True)

    return {
        "acc_path": acc_path,
        "acc_found": len(acc_files),
        "acc_files": [{"filename": os.path.basename(f), "path": f} for f in acc_files[:15]],
        "lmu_path": lmu_res_path,
        "lmu_found": len(lmu_files),
        "lmu_files": [{"filename": os.path.basename(f), "path": f} for f in lmu_files[:15]],
    }


def _parse_telemetry_file(filepath: str) -> Session:
    ext = os.path.splitext(filepath)[1].lower()
    try:
        if ext == ".xml":
            return LMUImporter(filepath).parse()
        if ext == ".ld":
            return MoTeCImporter(filepath).parse()
        if ext == ".csv":
            return CSVImporter(filepath).parse()
    except (ValueError, KeyError, IndexError, struct.error, ET.ParseError) as e:
        raise HTTPException(status_code=400, detail=f"Could not read {os.path.basename(filepath)}: {e}") from e
    raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")


@app.post("/api/import/local-file")
def import_local_file(req: LocalImportRequest):
    filepath = os.path.realpath(req.filepath)
    allowed_dirs = [os.path.realpath(d) for d in (ACC_MOTEC_DIR, ACC_RECORDINGS_DIR, LMU_RESULTS_DIR)]
    if not any(os.path.commonpath([filepath, d]) == d for d in allowed_dirs):
        raise HTTPException(
            status_code=403, detail="Only files from the simulator telemetry folders can be imported by path"
        )
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on system")

    session = _parse_telemetry_file(filepath)
    storage.save_session(session)
    return {
        "status": "ok",
        "session_id": session.session_id,
        "track": session.track,
        "car": session.car,
        "laps": len(session.laps),
    }


@app.post("/api/import/upload")
async def upload_telemetry_file(file: UploadFile = File(...)):
    filename = os.path.basename(file.filename or "upload")
    stem, ext = os.path.splitext(filename)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = os.path.join(tmpdir, f"{stem}{ext.lower()}")
        with open(tmp_path, "wb") as tmp:
            written = 0
            while chunk := file.file.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File is larger than 512 MB")
                tmp.write(chunk)
        session = _parse_telemetry_file(tmp_path)

    storage.save_session(session)
    return {
        "status": "ok",
        "session_id": session.session_id,
        "track": session.track,
        "car": session.car,
        "laps": len(session.laps),
    }


# Serve built frontend static files if available
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
