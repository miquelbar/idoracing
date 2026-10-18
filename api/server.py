"""
SimCoach — High-Performance Motorsport Telemetry & F1 Suite FastAPI Backend.
Exposes REST APIs for sessions, lap comparison, corner segmentation, and Ollama AI Coach.
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
from coach.advisor import CoachAdvisor
from coach.ollama_client import OllamaClient
from domain.session import CoachReport, Lap, LapComparison, Session
from importers.csv_importer import CSVImporter
from importers.lmu_importer import LMUImporter
from importers.moteclib.importer import MoTeCImporter
from importers.synthetic import create_synthetic_session
from storage.database import Storage

storage = Storage()
ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
ollama_model = os.environ.get("OLLAMA_MODEL", "qwen3:14b")
ollama_timeout = float(os.environ.get("OLLAMA_TIMEOUT", "45.0"))
ai_enabled = os.environ.get("AI_ENABLED", "true").lower() in ("true", "1", "yes")

ollama_client = OllamaClient(
    base_url=ollama_url,
    model=ollama_model,
    timeout=ollama_timeout,
    enabled=ai_enabled,
)
advisor = CoachAdvisor(ollama_client)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database is initialized
    # If database is empty, seed with synthetic demo session
    sessions = storage.list_sessions()
    if not sessions:
        synth = create_synthetic_session()
        storage.save_session(synth)
    yield


app = FastAPI(
    title="SimCoach F1 Telemetry API",
    version="2026.1",
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
    ollama_available: bool
    ollama_model: str
    ai_enabled: bool
    session_count: int


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


# --- API Endpoints ---
@app.get("/api/health", response_model=SystemStatus)
def get_health():
    sessions = storage.list_sessions()
    return SystemStatus(
        status="operational",
        version="2026.1.0",
        ollama_available=ollama_client.is_available(),
        ollama_model=ollama_client.model,
        ai_enabled=ollama_client.enabled,
        session_count=len(sessions),
    )


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
):
    sessions = storage.list_sessions()
    if not sessions:
        raise HTTPException(status_code=404, detail="No telemetry sessions found")

    ref_lap: Optional[Lap] = None
    comp_lap: Optional[Lap] = None
    matched_session: Optional[Session] = None

    if ref_lap_id and comp_lap_id:
        for s in sessions:
            full_s = storage.get_session(s.session_id)
            if full_s:
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
        # Default: best lap as ref, second lap or another valid lap as comp
        full_s = storage.get_session(sessions[0].session_id)
        if full_s and len(full_s.laps) >= 2:
            valid_laps = sorted([l for l in full_s.laps if l.lap_time > 0 and l.is_valid], key=lambda x: x.lap_time)
            if len(valid_laps) >= 2:
                ref_lap = valid_laps[0]
                comp_lap = valid_laps[1]
                matched_session = full_s

    if not ref_lap or not comp_lap:
        raise HTTPException(status_code=400, detail="Could not resolve reference and comparison laps")

    comparison = compare_laps(ref_lap, comp_lap)
    aligned = align_laps_by_distance(ref_lap.telemetry or {}, comp_lap.telemetry or {}, step_m=2.0)

    # Build telemetry arrays for high-performance frontend visualization
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

    # Integrate lateral acceleration & speed to produce smooth 2D track coordinates
    v = np.maximum(aligned["ref_speed"] / 3.6, 2.0)
    lat_acc = aligned.get("ref_lat_accel", np.zeros_like(v)) * 9.81
    dist = aligned["distance"]
    ds = np.diff(dist, prepend=dist[0])
    dt = ds / v
    yaw_rate = lat_acc / v
    heading = np.cumsum(yaw_rate * dt)
    dx = v * np.cos(heading) * dt
    dy = v * np.sin(heading) * dt
    track_x = np.cumsum(dx).tolist()
    track_y = np.cumsum(dy).tolist()

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
        # Fallback to first session best laps
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
        lmu_files = glob.glob(os.path.join(lmu_res_path, "*.xml"))

    return {
        "acc_path": acc_path,
        "acc_found": len(acc_files),
        "acc_files": [os.path.basename(f) for f in acc_files[:10]],
        "lmu_path": lmu_res_path,
        "lmu_found": len(lmu_files),
        "lmu_files": [os.path.basename(f) for f in lmu_files[:10]],
    }


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
            lmu_imp = LMUImporter()
            session = lmu_imp.import_session_xml(tmp_path)
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
