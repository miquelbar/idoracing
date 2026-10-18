"""
SimCoach — High-Performance Motorsport Telemetry & F1 Suite FastAPI Backend.
Exposes REST APIs for sessions, lap comparison, corner segmentation, Ollama AI (qwen3.8:27b-32k),
OpenAI/OpenRouter integration, and closed-loop circuit track maps.
"""

from contextlib import asynccontextmanager
import glob
import os
import shutil
import tempfile
from typing import Any, Dict, List, Optional
import numpy as np

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from analysis.alignment import align_laps_by_distance
from analysis.corners import extract_corners_analysis
from analysis.lap_comparison import compare_laps
from analysis.tracks import generate_track_coordinates
from coach.advisor import CoachAdvisor
from coach.llm_client import LLMClient
from domain.session import CoachReport, Lap, LapComparison, Session
from importers.csv_importer import CSVImporter
from importers.lmu_importer import LMUImporter
from importers.moteclib.importer import MoTeCImporter
from importers.synthetic import create_synthetic_session
from storage.database import Storage

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
        lmu_path = os.path.expanduser("~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results")
        if os.path.exists(lmu_path):
            xmls = sorted(glob.glob(os.path.join(lmu_path, "*.xml")), key=os.path.getmtime, reverse=True)
            for xf in xmls[:2]:
                try:
                    imp = LMUImporter(xf)
                    sess = imp.parse()
                    if sess.laps:
                        storage.save_session(sess)
                except Exception:
                    pass
    yield


app = FastAPI(
    title="SimCoach API",
    version="2026.2",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    delta_time: float
    braking_point_delta: float
    throttle_pickup_delta: float
    diagnosis: str
    severity: str
    trail_braking_eval: Optional[str] = "Óptimo"
    trail_braking_advice: Optional[str] = None


class ComparisonResponse(BaseModel):
    ref_lap_id: str
    comp_lap_id: str
    ref_lap_time: float
    comp_lap_time: float
    delta_time_total: float
    track_name: str
    car_name: str
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


class AIAdviceRequest(BaseModel):
    ref_lap_id: str
    comp_lap_id: str
    force_refresh: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    ref_lap_id: Optional[str] = None
    comp_lap_id: Optional[str] = None


class LocalImportRequest(BaseModel):
    filepath: str


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

    if cfg.openai_api_key and cfg.openai_api_key != "***":
        llm_client.openai_api_key = cfg.openai_api_key.strip()
    if cfg.openai_base_url:
        llm_client.openai_base_url = cfg.openai_base_url.strip().rstrip("/")
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


@app.get("/api/comparison", response_model=ComparisonResponse)
def get_lap_comparison(
    ref_lap_id: Optional[str] = Query(None),
    comp_lap_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
):
    sessions = storage.list_sessions()
    if not sessions:
        raise HTTPException(status_code=404, detail="No telemetry sessions found")

    ref_lap: Optional[Lap] = None
    comp_lap: Optional[Lap] = None
    matched_session: Optional[Session] = None

    target_sessions = [storage.get_session(session_id)] if session_id else [storage.get_session(s.session_id) for s in sessions]
    target_sessions = [s for s in target_sessions if s is not None]

    if ref_lap_id and comp_lap_id:
        for full_s in target_sessions:
            for lap in full_s.laps:
                lap_label = f"Lap {lap.lap_number}"
                if lap_label == ref_lap_id or str(lap.lap_number) == ref_lap_id:
                    ref_lap = lap
                if lap_label == comp_lap_id or str(lap.lap_number) == comp_lap_id:
                    comp_lap = lap
                if ref_lap and comp_lap:
                    matched_session = full_s
                    break
            if ref_lap and comp_lap:
                break
    else:
        # Default: pick first session with valid laps
        for full_s in target_sessions:
            valid_laps = sorted([l for l in full_s.laps if l.lap_time > 0 and l.is_valid and l.telemetry], key=lambda x: x.lap_time)
            if len(valid_laps) >= 2:
                ref_lap = valid_laps[0]
                comp_lap = valid_laps[1]
                matched_session = full_s
                break
            elif len(valid_laps) == 1 and len(full_s.laps) >= 2:
                ref_lap = valid_laps[0]
                comp_lap = full_s.laps[1]
                matched_session = full_s
                break

    if not ref_lap or not comp_lap:
        # Fallback to demo
        synth = create_synthetic_session()
        ref_lap = synth.laps[1]
        comp_lap = synth.laps[2]
        matched_session = synth

    comparison = compare_laps(ref_lap, comp_lap)
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

    # Generate authentic, closed-loop 2D track coordinates
    track_name = matched_session.track if matched_session else "Valencia"
    track_x, track_y = generate_track_coordinates(track_name, aligned["distance"], aligned)

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
                delta_v_min=round(c.comp_min_speed - c.ref_min_speed, 1),
                delta_time=round(c.time_delta_corner, 3),
                braking_point_delta=round(c.brake_delta_dist or 0.0, 1),
                throttle_pickup_delta=round(c.throttle_delta_dist or 0.0, 1),
                diagnosis=c.diagnosis or "Trazada óptima en el segmento.",
                severity=severity,
                trail_braking_eval=getattr(c, "trail_eval", "Óptimo"),
                trail_braking_advice=getattr(c, "trail_advice", None),
            )
        )

    ref_sectors = {f"S{i+1}": t for i, t in enumerate(ref_lap.sector_times)}
    comp_sectors = {f"S{i+1}": t for i, t in enumerate(comp_lap.sector_times)}

    return ComparisonResponse(
        ref_lap_id=f"Lap {ref_lap.lap_number}",
        comp_lap_id=f"Lap {comp_lap.lap_number}",
        ref_lap_time=ref_lap.lap_time,
        comp_lap_time=comp_lap.lap_time,
        delta_time_total=round(comp_lap.lap_time - ref_lap.lap_time, 3),
        track_name=matched_session.track if matched_session else "Circuito",
        car_name=matched_session.car if matched_session else "GT3",
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
    )


@app.post("/api/coach/report", response_model=CoachReport)
def generate_coach_report(req: AIAdviceRequest):
    sessions = storage.list_sessions()
    ref_lap: Optional[Lap] = None
    comp_lap: Optional[Lap] = None
    matched_session: Optional[Session] = None

    for s in sessions:
        full_s = storage.get_session(s.session_id)
        if full_s:
            for lap in full_s.laps:
                lap_label = f"Lap {lap.lap_number}"
                if lap_label == req.ref_lap_id or str(lap.lap_number) == req.ref_lap_id:
                    ref_lap = lap
                if lap_label == req.comp_lap_id or str(lap.lap_number) == req.comp_lap_id:
                    comp_lap = lap
                if ref_lap and comp_lap:
                    matched_session = full_s
                    break
        if ref_lap and comp_lap:
            break

    if not ref_lap or not comp_lap:
        if sessions:
            full_s = storage.get_session(sessions[0].session_id)
            if full_s and len(full_s.laps) >= 2:
                valid_laps = sorted([l for l in full_s.laps if l.lap_time > 0 and l.is_valid], key=lambda x: x.lap_time)
                if len(valid_laps) >= 2:
                    ref_lap = valid_laps[0]
                    comp_lap = valid_laps[1]
                    matched_session = full_s

    if not ref_lap or not comp_lap:
        raise HTTPException(status_code=404, detail="Laps not found for coach report")

    # Check cache if not forcing refresh
    if not req.force_refresh and matched_session:
        cached = storage.get_coach_report(matched_session.session_id, ref_lap.lap_number, comp_lap.lap_number)
        if cached:
            return cached

    comparison = compare_laps(ref_lap, comp_lap)
    report = advisor.generate_report(
        comparison,
        car=matched_session.car if matched_session else "Porsche 911 GT3 R (992)",
        track=matched_session.track if matched_session else "Ricardo Tormo de Valencia",
    )
    if matched_session:
        storage.save_coach_report(matched_session.session_id, ref_lap.lap_number, comp_lap.lap_number, report)
    return report


@app.post("/api/coach/chat")
def chat_with_engineer(req: ChatRequest):
    """Interactive conversational chat with Race Engineer with full telemetry context."""
    # Build telemetry briefing for the LLM
    context_prefix = (
        "Eres el ingeniero de pista senior del equipo. Sé técnico, conciso y directo como en la radio de F1. "
        "Ayuda al piloto respondiendo sus preguntas técnicas de trazada, frenada, marchas y setup basándote en los datos.\n"
    )

    messages = [{"role": "system", "content": context_prefix}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    reply = llm_client.chat(messages)
    if not reply:
        reply = (
            "No se ha recibido respuesta del modelo de IA. Verifica que Ollama esté ejecutándose con el modelo "
            f"'{llm_client.active_model}' o configura una clave compatible con OpenAI en Ajustes."
        )

    return {"role": "assistant", "content": reply, "model": llm_client.active_model}


@app.get("/api/autodiscover")
def autodiscover_files():
    acc_path = os.path.expanduser(
        "~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/Assetto Corsa Competizione/MoTeC"
    )
    lmu_res_path = os.path.expanduser(
        "~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results"
    )

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


@app.post("/api/import/local-file")
def import_local_file(req: LocalImportRequest):
    filepath = req.filepath
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on system")

    ext = os.path.splitext(filepath)[1].lower()
    session = None
    if ext == ".xml":
        imp = LMUImporter(filepath)
        session = imp.parse()
    elif ext == ".ld":
        imp = MoTeCImporter()
        session = imp.import_session(filepath)
    elif ext == ".csv":
        imp = CSVImporter()
        session = imp.import_session(filepath)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    if session:
        storage.save_session(session)
        return {
            "status": "ok",
            "session_id": session.session_id,
            "track": session.track,
            "car": session.car,
            "laps": len(session.laps),
        }
    raise HTTPException(status_code=500, detail="Failed to import local file")


@app.post("/api/import/upload")
async def upload_telemetry_file(file: UploadFile = File(...)):
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        session: Optional[Session] = None
        if ext == ".ld":
            importer = MoTeCImporter()
            session = importer.import_session(tmp_path)
        elif ext == ".xml":
            lmu_imp = LMUImporter(tmp_path)
            session = lmu_imp.parse()
        elif ext == ".csv":
            csv_imp = CSVImporter()
            session = csv_imp.import_session(tmp_path)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

        if session:
            storage.save_session(session)
            return {"status": "ok", "session_id": session.session_id, "laps": len(session.laps)}
        else:
            raise HTTPException(status_code=500, detail="Failed to parse session")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


# Serve built frontend static files if available
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
