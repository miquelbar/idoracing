"""
IdoRacing Analytics — High-Performance Motorsport Telemetry Suite FastAPI Backend.
Exposes REST APIs for sessions, lap comparison, corner segmentation, Ollama AI (qwen3.8:27b-32k),
OpenAI/OpenRouter integration, and closed-loop circuit track maps.
"""

from contextlib import asynccontextmanager
import glob
import logging
import os
import struct
import tempfile
from typing import Any, Dict, List, Literal, Optional
import xml.etree.ElementTree as ET
import numpy as np

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from analysis.alignment import align_laps_by_distance
from analysis.corners import extract_corners_analysis
from analysis.lap_comparison import compare_laps
from analysis.telemetry_generator import ensure_session_telemetry
from analysis.tracks import generate_track_coordinates
from coach.advisor import CoachAdvisor, generate_race_engineer_response
from coach.prompt import PEP_SYSTEM_PROMPT_EN, PEP_SYSTEM_PROMPT_ES
from coach.llm_client import LLMClient
from domain.session import CoachReport, Lap, LapComparison, Session
from importers.csv_importer import CSVImporter
from importers.lmu_importer import LMUImporter
from importers.moteclib.importer import MoTeCImporter
from importers.synthetic import create_synthetic_session
from storage.database import Storage

ACC_MOTEC_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/Assetto Corsa Competizione/MoTeC"
)
LMU_RESULTS_DIR = os.path.expanduser("~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results")
MAX_UPLOAD_BYTES = 512 * 1024 * 1024


load_dotenv()
logger = logging.getLogger(__name__)
storage = Storage()

llm_client = LLMClient(
    provider=os.environ.get("LLM_PROVIDER", "ollama"),
    ollama_base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    ollama_model=os.environ.get("OLLAMA_MODEL", "qwen3.8:27b-32k"),
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
    ollama_models: List[str]
    session_count: int


class SettingsDTO(BaseModel):
    provider: str = "ollama"
    ollama_model: str = "qwen3.8:27b-32k"
    ollama_base_url: str = "http://localhost:11434"
    openai_api_key: Optional[str] = ""
    openai_base_url: Optional[str] = "https://api.openai.com/v1"
    openai_model: Optional[str] = "gpt-4o-mini"


class CornerDTO(BaseModel):
    corner_number: int
    name: str
    start_distance: float
    end_distance: float
    apex_distance: float
    v_min_ref: float
    v_min_comp: float
    delta_v_min: float
    v_entry_ref: Optional[float] = None
    v_entry_comp: Optional[float] = None
    delta_v_entry: Optional[float] = None
    v_exit_ref: Optional[float] = None
    v_exit_comp: Optional[float] = None
    delta_v_exit: Optional[float] = None
    delta_time: float
    braking_point_delta: float
    throttle_pickup_delta: float
    diagnosis: str
    severity: str
    trail_braking_eval: Optional[str]
    trail_braking_code: str
    trail_braking_advice: Optional[str] = None
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
    racing_line_svg: Optional[Dict[str, Any]] = None


class ComparisonResponse(BaseModel):
    session_id: str
    ref_lap_id: str
    comp_lap_id: str
    ref_lap_time: float
    comp_lap_time: float
    delta_time_total: float
    track_name: str
    car_name: str
    game_name: Optional[str] = "Assetto Corsa Competizione"
    distance: List[float]
    ref_speed: List[float]
    comp_speed: List[float]
    delta_speed: List[float]
    delta_time: List[float]
    ref_throttle: List[float]
    comp_throttle: List[float]
    ref_brake: List[float]
    comp_brake: List[float]
    ref_gear: List[int]
    comp_gear: List[int]
    track_x: List[float]
    track_y: List[float]
    ref_sectors: Dict[str, float]
    comp_sectors: Dict[str, float]
    corners: List[CornerDTO]
    telemetry_source: Literal["recorded", "synthetic"]


class AIAdviceRequest(BaseModel):
    ref_lap_id: str
    comp_lap_id: str
    session_id: Optional[str] = None
    force_refresh: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    ref_lap_id: Optional[str] = None
    comp_lap_id: Optional[str] = None
    track_name: Optional[str] = None
    car_name: Optional[str] = None
    selected_corner: Optional[Dict[str, Any]] = None
    lang: Optional[str] = "es"


class LocalImportRequest(BaseModel):
    filepath: str


class LapRecordDTO(BaseModel):
    lap_number: int
    lap_time: float
    lap_time_str: str
    sector_times: List[float]
    gap_to_pb: float
    is_pb: bool
    v_max: Optional[float] = None
    date: str
    session_id: str


class LapHistoryResponse(BaseModel):
    pb_lap: LapRecordDTO
    comparison_lap: Optional[LapRecordDTO] = None
    laps: List[LapRecordDTO]
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
    )


@app.post("/api/settings")
def update_settings(cfg: SettingsDTO):
    llm_client.provider = cfg.provider.lower()
    llm_client.ollama_model = cfg.ollama_model
    llm_client.ollama.model = cfg.ollama_model
    llm_client.ollama_base_url = cfg.ollama_base_url
    llm_client.ollama.base_url = cfg.ollama_base_url.rstrip("/")

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


def _load_session(session_id: Optional[str]) -> Session:
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


def _find_lap(session: Session, lap_id: str) -> Optional[Lap]:
    return next((l for l in session.laps if lap_id in (f"Lap {l.lap_number}", str(l.lap_number))), None)


@app.get("/api/comparison", response_model=ComparisonResponse)
def get_lap_comparison(
    ref_lap_id: Optional[str] = Query(None),
    comp_lap_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
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

    corners_dto: List[CornerDTO] = []
    for c in comparison.corners:
        severity = "info"
        if c.time_delta_corner > 0.15:
            severity = "warning"
        if c.time_delta_corner > 0.30:
            severity = "critical"
        if c.time_delta_corner < -0.05:
            severity = "success"

        corners_dto.append(
            CornerDTO(
                corner_number=c.corner_number,
                name=c.corner_name or f"Curva {c.corner_number}",
                start_distance=c.start_dist,
                end_distance=c.end_dist,
                apex_distance=(c.start_dist + c.end_dist) / 2.0,
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
                severity=severity,
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
            )
        )

    ref_sectors = {f"S{i+1}": t for i, t in enumerate(ref_lap.sector_times)}
    comp_sectors = {f"S{i+1}": t for i, t in enumerate(comp_lap.sector_times)}

    detected_game = "Assetto Corsa Competizione"
    sid = matched_session.session_id.lower()
    sf = (matched_session.source_file or "").lower()
    car = matched_session.car.lower()
    if "lmu" in sid or "le mans" in sf or "lmgt3" in car or "hypercar" in car or "lmp2" in car:
        detected_game = "Le Mans Ultimate"
    elif "iracing" in sid or "iracing" in sf:
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
    session_id: Optional[str] = Query(None),
    ref_lap_number: Optional[int] = Query(None),
    comp_lap_number: Optional[int] = Query(None),
):
    matched_session = _load_session(session_id)
    valid_laps = [l for l in matched_session.laps if l.lap_time > 0 and l.is_valid] or matched_session.laps
    timed_laps = [l for l in valid_laps if l.lap_time > 0]
    if not timed_laps:
        raise HTTPException(status_code=404, detail="Session has no timed laps")
    pb_time = min(l.lap_time for l in timed_laps)

    lap_records: List[LapRecordDTO] = []
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


@app.post("/api/coach/chat")
def chat_with_engineer(req: ChatRequest):
    """Interactive conversational chat with Race Engineer with full telemetry context."""
    lang = (req.lang or "es").lower()
    user_query = req.messages[-1].content if req.messages else ""

    # Build telemetry briefing for the LLM
    # Build telemetry briefing for the LLM
    if lang == "en":
        context_prefix = (
            PEP_SYSTEM_PROMPT_EN + "\n\n"
            f"Current track: {req.track_name or 'Active Track'}. Vehicle: {req.car_name or 'Active Car'}.\n"
        )
        if req.selected_corner:
            c = req.selected_corner
            c_num = c.get("corner_number", "")
            c_name = c.get("name", f"Turn {c_num}")
            delta_t = c.get("delta_time", 0.0)
            delta_sign = "+" if delta_t > 0 else ""
            vmin_c = float(c.get("v_min_comp") or 0.0)
            vmin_r = float(c.get("v_min_ref") or 0.0)
            delta_vmin = round(vmin_c - vmin_r, 1)
            v_entry_c = c.get("v_entry_comp")
            v_entry_r = c.get("v_entry_ref")
            delta_ventry = round(float(v_entry_c) - float(v_entry_r), 1) if (v_entry_c is not None and v_entry_r is not None) else None
            v_exit_c = c.get("v_exit_comp")
            v_exit_r = c.get("v_exit_ref")
            delta_vexit = round(float(v_exit_c) - float(v_exit_r), 1) if (v_exit_c is not None and v_exit_r is not None) else None

            context_prefix += (
                f"Selected corner in telemetry: T{c_num} ({c_name}).\n"
                f"- Time delta: {delta_sign}{delta_t:.3f}s.\n"
                f"- Apex minimum speed: {vmin_c:.1f} km/h (Ref: {vmin_r:.1f} km/h, ΔV: {delta_vmin:+.1f} km/h).\n"
            )
            if delta_ventry is not None:
                context_prefix += f"- Entry speed: {float(v_entry_c):.1f} km/h (Ref: {float(v_entry_r):.1f} km/h, ΔV: {delta_ventry:+.1f} km/h).\n"
            if delta_vexit is not None:
                context_prefix += f"- Exit speed: {float(v_exit_c):.1f} km/h (Ref: {float(v_exit_r):.1f} km/h, ΔV: {delta_vexit:+.1f} km/h).\n"
            context_prefix += (
                f"- Comp gear: {c.get('comp_gear', 3)} ({c.get('gear_eval', '')}).\n"
                f"- Balance: {c.get('balance_eval', 'Neutral')}.\n"
                f"- Trail braking: {c.get('trail_braking_eval', 'Optimal')}.\n"
                f"- Racing line: {c.get('racing_line_eval', 'Optimal')} — {c.get('racing_line_advice', '')}.\n"
            )
        context_prefix += (
            "Format your answers with structured Markdown: use bold for key terms, "
            "short bulleted lists for actionable driving points, and clear line breaks. Do not write unformatted dense blocks.\n"
        )
    else:
        context_prefix = (
            PEP_SYSTEM_PROMPT_ES + "\n\n"
            f"Circuito actual: {req.track_name or 'Circuito activo'}. Vehículo: {req.car_name or 'Coche activo'}.\n"
        )
        if req.selected_corner:
            c = req.selected_corner
            c_num = c.get("corner_number", "")
            c_name = c.get("name", f"Curva {c_num}")
            delta_t = c.get("delta_time", 0.0)
            delta_sign = "+" if delta_t > 0 else ""
            vmin_c = float(c.get("v_min_comp") or 0.0)
            vmin_r = float(c.get("v_min_ref") or 0.0)
            delta_vmin = round(vmin_c - vmin_r, 1)
            v_entry_c = c.get("v_entry_comp")
            v_entry_r = c.get("v_entry_ref")
            delta_ventry = round(float(v_entry_c) - float(v_entry_r), 1) if (v_entry_c is not None and v_entry_r is not None) else None
            v_exit_c = c.get("v_exit_comp")
            v_exit_r = c.get("v_exit_ref")
            delta_vexit = round(float(v_exit_c) - float(v_exit_r), 1) if (v_exit_c is not None and v_exit_r is not None) else None

            context_prefix += (
                f"Curva seleccionada en telemetría: T{c_num} ({c_name}).\n"
                f"- Diferencia de tiempo: {delta_sign}{delta_t:.3f}s.\n"
                f"- Velocidad mínima comp: {vmin_c:.1f} km/h (Ref: {vmin_r:.1f} km/h, ΔV: {delta_vmin:+.1f} km/h).\n"
            )
            if delta_ventry is not None:
                context_prefix += f"- Velocidad de entrada: {float(v_entry_c):.1f} km/h (Ref: {float(v_entry_r):.1f} km/h, ΔV: {delta_ventry:+.1f} km/h).\n"
            if delta_vexit is not None:
                context_prefix += f"- Velocidad de salida: {float(v_exit_c):.1f} km/h (Ref: {float(v_exit_r):.1f} km/h, ΔV: {delta_vexit:+.1f} km/h).\n"
            context_prefix += (
                f"- Marcha comp: {c.get('comp_gear', 3)}ª ({c.get('gear_eval', '')}).\n"
                f"- Balance: {c.get('balance_eval', 'Neutro')}.\n"
                f"- Trail braking: {c.get('trail_braking_eval', 'Óptimo')}.\n"
                f"- Trazada: {c.get('racing_line_eval', 'Óptima')} — {c.get('racing_line_advice', '')}.\n"
            )
        context_prefix += (
            "Formatea tus respuestas con Markdown estructurado: usa negritas para términos clave, "
            "listas cortas con viñetas para pasos accionables y saltos de línea claros. No escribas bloques apelmazados sin formato.\n"
        )

    messages = [{"role": "system", "content": context_prefix}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    chat_timeout = float(os.environ.get("RADIO_CHAT_TIMEOUT", "12.0"))
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

    acc_files = []
    if os.path.exists(acc_path):
        acc_files = glob.glob(os.path.join(acc_path, "*.ld"))

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
    allowed_dirs = [os.path.realpath(d) for d in (ACC_MOTEC_DIR, LMU_RESULTS_DIR)]
    if not any(os.path.commonpath([filepath, d]) == d for d in allowed_dirs):
        raise HTTPException(status_code=403, detail="Only files from the simulator telemetry folders can be imported by path")
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
    return {"status": "ok", "session_id": session.session_id, "laps": len(session.laps)}


# Serve built frontend static files if available
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
