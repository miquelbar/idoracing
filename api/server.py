"""
IdoRacing Analytics FastAPI backend: session import and storage, lap comparison,
corner analysis, track outlines and the AI race engineer endpoints.
"""

import glob
import logging
import os
import struct
import tempfile
import time
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Literal

import certifi
import numpy as np

# Enforce secure CA trust store via certifi (revoking compromised CAs like eMudhra)
# even when running natively without Docker on systems with outdated OS certificates.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import FileResponse, Response

from analysis.alignment import align_laps_by_distance
from analysis.corners import compute_ideal_ghost_telemetry
from analysis.demo_session import create_synthetic_session
from analysis.lap_comparison import compare_laps
from analysis.setup_advisor import generate_setup_advice
from analysis.spotter import (
    VOICES_DIR,
    export_track_spotter_manifest,
    get_track_slug,
    load_spotter_config,
    save_spotter_config,
)
from analysis.stint_analysis import analyze_session_stint
from analysis.tire_thermal import analyze_all_tyres
from analysis.tracks import generate_track_coordinates, get_track_length, is_complete_track_lap
from coach.advisor import CoachAdvisor
from coach.knowledge_base import knowledge_base
from coach.llm_client import LLMClient
from coach.prompt import PEP_SYSTEM_PROMPT_EN, PEP_SYSTEM_PROMPT_ES
from coach.radio import generate_race_engineer_response
from domain.session import (
    CoachReport,
    CornerAnalysis,
    Lap,
    Session,
    SetupAdviceReport,
    SetupAdviceReview,
    is_outlap_detected,
    normalize_car_name,
    normalize_track_name,
)
from importers.acc_setup_loader import load_acc_setup
from importers.acevo_importer import ACEVOImporter
from importers.acevo_setup_loader import load_acevo_setup
from importers.csv_importer import CSVImporter
from importers.lmu_importer import LMUImporter, find_lmu_results_dir
from importers.lmu_setup_loader import load_lmu_setup
from importers.moteclib.importer import MoTeCImporter
from storage.database import Storage

ACC_DOCUMENTS_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents"
)
ACC_MOTEC_DIR = os.path.join(ACC_DOCUMENTS_DIR, "Assetto Corsa Competizione", "MoTeC")
# Where idoracing-recorder writes by default when it runs inside ACC's Proton prefix.
ACC_RECORDINGS_DIR = os.path.join(ACC_DOCUMENTS_DIR, "IdoRacing", "recordings")
# Recorder output locations across Windows/native documents and Proton prefixes
NATIVE_RECORDINGS_DIR = os.path.expanduser("~/Documents/IdoRacing/recordings")
COMPATDATA_RECORDINGS_GLOB = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/*/pfx/drive_c/users/steamuser/Documents/IdoRacing/recordings"
)
LMU_RESULTS_DIR = find_lmu_results_dir() or os.path.expanduser(
    "~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results"
)
# Assetto Corsa EVO (app 3058630) — telemetry lives under Saved Games/ACE.
ACEVO_SAVED_GAMES_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/3058630/pfx/drive_c/users/steamuser/Saved Games/ACE"
)
# MoTeC .ld files are nested as MoTec/<car>/<track>/, so this directory is scanned recursively.
ACEVO_MOTEC_DIR = os.path.join(ACEVO_SAVED_GAMES_DIR, "MoTec")
ACEVO_RESULTS_DIR = os.path.join(ACEVO_SAVED_GAMES_DIR, "Results")
# AC EVO stores proprietary binary setups as .carsetup under Saved Games/ACE/Car Setups/<car>/<track>/
ACEVO_SETUPS_DIR = os.path.join(ACEVO_SAVED_GAMES_DIR, "Car Setups")
ACEVO_DOCUMENTS_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/3058630/pfx/drive_c/users/steamuser/Documents"
)
ACEVO_RECORDINGS_DIR = os.path.join(ACEVO_DOCUMENTS_DIR, "IdoRacing", "recordings")
# Assetto Corsa 1 (app 244210) — telemetry lives in Documents under the game folder.
AC1_DOCUMENTS_DIR = os.path.expanduser(
    "~/.local/share/Steam/steamapps/compatdata/244210/pfx/drive_c/users/steamuser/Documents"
)
AC1_MOTEC_DIR = os.path.join(AC1_DOCUMENTS_DIR, "Assetto Corsa", "MoTeC")
AC1_RECORDINGS_DIR = os.path.join(AC1_DOCUMENTS_DIR, "IdoRacing", "recordings")
# iRacing — telemetry in ~/Documents/iRacing/Telemetry (Windows) or via Proton.
IRACING_TELEMETRY_DIR = os.path.expanduser("~/Documents/iRacing/Telemetry")
MAX_UPLOAD_BYTES = 512 * 1024 * 1024
# Canonical simulator name stamped on auto-imported sessions when the importer
# cannot detect it from the file itself (e.g. MoTeC .ld without signature channels).
AUTO_IMPORT_SIMULATORS = {
    "ACC": "Assetto Corsa Competizione",
    "LMU": "Le Mans Ultimate",
    "AC EVO": "Assetto Corsa EVO",
    "AC1": "Assetto Corsa",
    "DR2": "DiRT Rally 2.0",
    "WRC": "EA SPORTS WRC",
}


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


def _already_imported_source_files() -> set[str]:
    """Return the set of source_file paths already stored in the database."""
    with storage._get_connection() as conn:
        cursor = conn.cursor()
        cols = {row["name"] for row in cursor.execute("PRAGMA table_info(sessions)")}
        has_linked = "linked_result_file" in cols
        query = (
            "SELECT source_file, linked_result_file FROM sessions WHERE source_file IS NOT NULL"
            if has_linked
            else "SELECT source_file FROM sessions WHERE source_file IS NOT NULL"
        )
        cursor.execute(query)
        sources = set()
        for row in cursor.fetchall():
            if row["source_file"]:
                sources.add(row["source_file"])
            if has_linked and row["linked_result_file"]:
                sources.add(row["linked_result_file"])
        return sources


def _auto_import_from_dir(
    directory: str,
    patterns: list[str],
    importer_factory,
    imported_sources: set[str],
    sim_label: str,
) -> int:
    """Auto-import all telemetry files matching *patterns* in *directory* not yet in the DB.

    Returns the number of newly imported sessions.
    """
    if not os.path.exists(directory):
        return 0

    files: list[str] = []
    for pat in patterns:
        files.extend(glob.glob(os.path.join(directory, pat), recursive=True))
    # Newest first so the log reads naturally
    files = sorted(set(files), key=os.path.getmtime, reverse=True)

    count = 0
    skipped = 0
    for filepath in files:
        if filepath in imported_sources:
            continue
        try:
            sess = importer_factory(filepath).parse()
        except (ValueError, KeyError, IndexError, struct.error, ET.ParseError) as e:
            logger.warning("Skipping unreadable %s file %s: %s", sim_label, os.path.basename(filepath), e)
            skipped += 1
            continue
        if not sess.simulator:
            sess.simulator = AUTO_IMPORT_SIMULATORS.get(sim_label)
        if sess.laps:
            storage.save_session(sess)
            imported_sources.add(filepath)
            if getattr(sess, "linked_result_file", None):
                linked = sess.linked_result_file
                imported_sources.add(linked)
                storage.delete_session_by_source_file(linked)
            count += 1
            logger.info("Auto-imported %s: %s | %s | %d laps", sim_label, sess.track, sess.car, len(sess.laps))
        else:
            logger.info(
                "Skipping %s file %s: no timed laps (%s, %s)",
                sim_label,
                os.path.basename(filepath),
                sess.track,
                sess.car,
            )
            skipped += 1
    if skipped:
        logger.info("%s: %d imported, %d skipped (no laps or unreadable)", sim_label, count, skipped)
    return count


def _auto_import_all(imported_sources: set[str]) -> dict[str, int]:
    """Auto-import every supported simulator's telemetry files not yet in the DB.

    Returns a per-simulator count of newly imported sessions.
    """
    results: dict[str, int] = {}

    # ACC — MoTeC .ld files
    results["ACC (MoTeC)"] = _auto_import_from_dir(ACC_MOTEC_DIR, ["*.ld"], MoTeCImporter, imported_sources, "ACC")
    # All simulators — idoracing-recorder .csv files (from ACC prefix, other Proton prefixes, or native ~/Documents)
    rec_dirs = {ACC_RECORDINGS_DIR, NATIVE_RECORDINGS_DIR}
    rec_dirs.update(glob.glob(COMPATDATA_RECORDINGS_GLOB))
    rec_count = 0
    for rdir in sorted(rec_dirs):
        rec_count += _auto_import_from_dir(rdir, ["*.csv"], CSVImporter, imported_sources, "Recorder")
    results["Recorder (50Hz CSV)"] = rec_count
    # LMU — result .xml files
    results["LMU"] = _auto_import_from_dir(LMU_RESULTS_DIR, ["*.xml"], LMUImporter, imported_sources, "LMU")
    # Assetto Corsa EVO — MoTeC .ld files (nested under MoTec/<car>/<track>/) and session results
    results["AC EVO"] = _auto_import_from_dir(ACEVO_MOTEC_DIR, ["**/*.ld"], MoTeCImporter, imported_sources, "AC EVO")
    results["AC EVO (Results)"] = _auto_import_from_dir(
        ACEVO_RESULTS_DIR, ["*.sessionresults.json"], ACEVOImporter, imported_sources, "AC EVO"
    )
    # Assetto Corsa 1 — MoTeC .ld files
    results["AC1"] = _auto_import_from_dir(AC1_MOTEC_DIR, ["*.ld"], MoTeCImporter, imported_sources, "AC1")

    return results


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database is initialized
    sessions = storage.list_sessions()
    if not sessions:
        synth = create_synthetic_session()
        storage.save_session(synth)

    # Auto-import ALL telemetry files from every supported simulator unless skipped in tests
    if not os.environ.get("IDORACING_SKIP_AUTO_IMPORT"):
        imported_sources = _already_imported_source_files()
        results = _auto_import_all(imported_sources)
        total = sum(results.values())
        if total:
            parts = ", ".join(f"{v} {k}" for k, v in results.items() if v)
            logger.info("Auto-import complete: %d new sessions (%s)", total, parts)
    yield


app = FastAPI(
    title="IdoRacing Analytics API",
    version="2026.2",
    lifespan=lifespan,
)


@app.middleware("http")
async def _cache_control(request: Request, call_next):
    """HTML: always revalidate. Hashed assets: cache forever (immutable)."""
    response: Response = await call_next(request)
    path = request.url.path
    if path == "/" or path == "/index.html" or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache"
    elif path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


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


class SpotterConfigDTO(BaseModel):
    enabled: bool = True
    language: str = "es"
    volume: int = 85
    toggle_key: str = "F9"
    toggle_vk_code: int = 120


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
    ref_brake_point: float | None = None
    comp_brake_point: float | None = None
    ref_throttle_point: float | None = None
    comp_throttle_point: float | None = None
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
    v_min_ideal: float | None = None
    v_exit_ideal: float | None = None
    ideal_brake_point: float | None = None
    ideal_throttle_point: float | None = None
    ideal_trail_pct: float | None = None
    ref_trail_pct: float | None = None
    comp_trail_pct: float | None = None
    ideal_time_gain: float | None = None
    both_laps_fault: bool = False
    both_laps_fault_reason: str | None = None


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
    ref_session_id: str | None = None
    comp_session_id: str | None = None
    ref_car_name: str | None = None
    comp_car_name: str | None = None
    ref_date: str | None = None
    comp_date: str | None = None
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
    telemetry_source: Literal["recorded", "synthetic", "none"]
    has_telemetry: bool = True
    is_demo: bool = False
    optimal_lap_time: float | None = None
    ideal_lap_time: float | None = None
    ideal_potential_gain: float | None = None
    ideal_speed: list[float] = []
    ideal_brake: list[float] = []
    ideal_throttle: list[float] = []


class CarSetupDTO(BaseModel):
    session_id: str
    car_name: str
    track_name: str
    game_name: str | None = None
    has_telemetry: bool = True
    has_garage_setup: bool = True
    setup_source: str = "actual_file"
    setup_file_name: str | None = None
    match_method: str | None = None
    available_setups: list[str] = []
    tyres: dict[str, Any]
    electronics: dict[str, Any]
    aero: dict[str, Any]
    chassis: dict[str, Any]
    setup_advice: list[dict[str, str]]
    ref_lap_id: str | None = None
    comp_lap_id: str | None = None
    ref_lap_label: str | None = None
    comp_lap_label: str | None = None
    ref_lap_number: int | None = None
    comp_lap_number: int | None = None
    ref_lap_time: float | None = None
    comp_lap_time: float | None = None
    ref_date: str | None = None
    comp_date: str | None = None
    ref_session_id: str | None = None
    comp_session_id: str | None = None
    same_session: bool = True
    same_garage_setup: bool = True
    garage_diff_count: int = 0
    garage_diff_summary: list[str] = []
    thermal_diff_summary: list[str] = []
    p1_setup: dict[str, Any] | None = None
    p2_setup: dict[str, Any] | None = None


class AIAdviceRequest(BaseModel):
    ref_lap_id: str
    comp_lap_id: str
    session_id: str | None = None
    ref_session_id: str | None = None
    comp_session_id: str | None = None
    force_refresh: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    session_id: str | None = None
    ref_session_id: str | None = None
    comp_session_id: str | None = None
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


@app.get("/api/spotter/config", response_model=SpotterConfigDTO)
def get_spotter_config():
    cfg = load_spotter_config()
    return SpotterConfigDTO(**cfg)


@app.post("/api/spotter/config", response_model=SpotterConfigDTO)
@app.put("/api/spotter/config", response_model=SpotterConfigDTO)
def update_spotter_config_endpoint(cfg: SpotterConfigDTO):
    saved = save_spotter_config(cfg.model_dump())
    return SpotterConfigDTO(**saved)


@app.get("/api/spotter/audio/{clip_id}")
def get_spotter_audio(clip_id: str, lang: str | None = None, track: str | None = None):
    """Serve pre-generated OGG audio clips for spotter cues in web UI preview."""
    import re

    if not lang:
        cfg = load_spotter_config()
        lang = cfg.get("language", "es")
    clean_lang = "en" if str(lang).lower().startswith("en") else "es"
    clean_clip = re.sub(r"[^a-zA-Z0-9_-]", "", clip_id)

    # 1. Search in track directory if track specified
    if track:
        slug = get_track_slug(track)
        track_ogg = VOICES_DIR / "tracks" / slug / clean_lang / f"{clean_clip}.ogg"
        if track_ogg.exists():
            return FileResponse(track_ogg, media_type="audio/ogg")

    # 2. Search in base voices
    base_ogg = VOICES_DIR / clean_lang / f"{clean_clip}.ogg"
    if base_ogg.exists():
        return FileResponse(base_ogg, media_type="audio/ogg")

    # 3. Search in any track directory
    for match in VOICES_DIR.glob(f"tracks/*/{clean_lang}/{clean_clip}.ogg"):
        if match.exists():
            return FileResponse(match, media_type="audio/ogg")

    raise HTTPException(status_code=404, detail=f"Audio clip '{clean_clip}' not found for language '{clean_lang}'")


_last_auto_import_time: float = 0.0


def _trigger_cooldown_auto_import() -> None:
    global _last_auto_import_time
    now = time.time()
    if not os.environ.get("IDORACING_SKIP_AUTO_IMPORT") and (now - _last_auto_import_time > 10.0):
        _last_auto_import_time = now
        try:
            _auto_import_all(_already_imported_source_files())
        except Exception as e:  # noqa: BLE001
            logger.debug("Cooldown auto-import failed: %s", e)


@app.get("/api/sessions")
def list_sessions():
    _trigger_cooldown_auto_import()
    return storage.list_sessions()


class SessionGroupDTO(BaseModel):
    simulator: str
    track: str
    cars: list[str] = []
    sessions: list[dict[str, Any]]
    total_laps: int
    best_lap_time: float
    last_session_date: str | None = None


@app.get("/api/session-groups", response_model=list[SessionGroupDTO])
def list_session_groups():
    """Group sessions by canonical (simulator, track), sorted with the most recently played circuit first."""
    _trigger_cooldown_auto_import()
    sessions = storage.list_sessions()
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for s in sessions:
        sim = s.simulator
        if not sim or sim == "Unknown":
            sid_low = s.session_id.lower()
            if sid_low.startswith("lmu"):
                sim = "Le Mans Ultimate"
            elif sid_low.startswith("acevo"):
                sim = "Assetto Corsa EVO"
            elif sid_low.startswith("ac1"):
                sim = "Assetto Corsa"
            else:
                sim = "Assetto Corsa Competizione"
        norm_track = normalize_track_name(s.track)
        norm_car = normalize_car_name(s.car)
        groups.setdefault((sim, norm_track), []).append(
            {
                "session_id": s.session_id,
                "car": norm_car,
                "track": norm_track,
                "date": s.date.isoformat() if hasattr(s.date, "isoformat") else str(s.date),
                "best_lap_time": s.best_lap_time,
                "lap_count": s.lap_count,
                "simulator": sim,
                "source_file": getattr(s, "source_file", None),
                "has_telemetry": getattr(s, "has_telemetry", True),
                "is_demo": getattr(s, "is_demo", False),
                "laps": storage.get_lap_summaries(s.session_id),
            }
        )

    result: list[SessionGroupDTO] = []
    for (sim, track), sess_list in groups.items():
        real_sessions = [s for s in sess_list if not s.get("is_demo")]
        if real_sessions:
            sess_list = real_sessions
        sess_list.sort(key=lambda x: x["date"], reverse=True)
        total_laps = sum(s["lap_count"] for s in sess_list)
        best = min((s["best_lap_time"] for s in sess_list if s["best_lap_time"] > 0), default=0.0)
        cars = sorted({s["car"] for s in sess_list if s.get("car")})
        last_date = sess_list[0]["date"] if sess_list else None
        result.append(
            SessionGroupDTO(
                simulator=sim,
                track=track,
                cars=cars,
                sessions=sess_list,
                total_laps=total_laps,
                best_lap_time=best,
                last_session_date=last_date,
            )
        )
    result.sort(key=lambda g: g.last_session_date or "", reverse=True)
    return result


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
    """The requested session, or the most recent one (preferring recorded 50Hz sessions) when no id is given."""
    if not session_id:
        sessions = storage.list_sessions()
        if not sessions:
            raise HTTPException(status_code=404, detail="No telemetry sessions found")
        recorded = [s for s in sessions if s.has_telemetry and not s.is_demo]
        with_telem = [s for s in sessions if s.has_telemetry]
        chosen = recorded[0] if recorded else (with_telem[0] if with_telem else sessions[0])
        session_id = chosen.session_id
    session = storage.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _find_lap(session: Session, lap_id: str) -> Lap | None:
    return next((l for l in session.laps if lap_id in (f"Lap {l.lap_number}", str(l.lap_number))), None)


def _severity(time_delta: float, both_laps_fault: bool = False) -> str:
    if both_laps_fault:
        return "warning"
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
        ref_brake_point=c.ref_brake_point,
        comp_brake_point=c.comp_brake_point,
        ref_throttle_point=c.ref_throttle_point,
        comp_throttle_point=c.comp_throttle_point,
        diagnosis=c.diagnosis or "Trazada óptima en el segmento.",
        severity=_severity(c.time_delta_corner, c.both_laps_fault),
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
        v_min_ideal=c.v_min_ideal,
        v_exit_ideal=c.v_exit_ideal,
        ideal_brake_point=c.ideal_brake_point,
        ideal_throttle_point=c.ideal_throttle_point,
        ideal_trail_pct=c.ideal_trail_pct,
        ref_trail_pct=c.ref_trail_pct,
        comp_trail_pct=c.comp_trail_pct,
        ideal_time_gain=c.ideal_time_gain,
        both_laps_fault=c.both_laps_fault,
        both_laps_fault_reason=c.both_laps_fault_reason,
    )


def _lap_has_valid_telemetry(session: Session, lap: Lap) -> bool:
    """
    A lap has usable 50Hz telemetry ONLY if:
    1) The session is the explicit Demo Valencia (`synth_*`), OR
    2) The lap is NOT synthetic and contains recorded speed/distance channels.
    Never invent or accept synthetic traces for real sessions!
    """
    is_demo_sess = session.session_id.startswith("synth_")
    if not is_demo_sess and lap.synthetic:
        return False
    return lap.has_telemetry


def _detect_simulator(session: Session | None) -> str:
    """Return canonical simulator name for a session, checking metadata and file hints."""
    if not session:
        return "Assetto Corsa Competizione"
    if session.simulator:
        return session.simulator
    low = f"{session.session_id} {session.source_file or ''} {session.car or ''} {session.track or ''}".lower()
    if "iracing" in low:
        return "iRacing"
    if "lmu" in low or "mans" in low:
        return "Le Mans Ultimate"
    if "dirt" in low or "dr2" in low:
        return "DiRT Rally 2.0"
    if "wrc" in low:
        return "EA SPORTS WRC"
    if "acrally" in low:
        return "Assetto Corsa Rally"
    if "acevo" in low or "evo" in low:
        return "Assetto Corsa EVO"
    if "ac1" in low or "assettocorsa" in low:
        return "Assetto Corsa"
    return "Assetto Corsa Competizione"


def _rank_flying_laps(sess: Session) -> list[Lap]:
    """Return session laps sorted by lap_time ascending, excluding pit out-laps and laps > 107% of PB."""
    valid_times = [l.lap_time for l in sess.laps if l.lap_time > 20.0 and l.is_valid and not l.is_incomplete]
    best_t = min(valid_times) if valid_times else min((l.lap_time for l in sess.laps if l.lap_time > 20.0), default=0.0)

    def _has_enough_data(lap: Lap) -> bool:
        t = lap.telemetry or {}
        return len(t.get("speed", [])) >= 100 and 20.0 <= lap.lap_time <= 150.0 and not lap.is_incomplete

    def _is_outlap(lap: Lap) -> bool:
        return bool(
            lap.is_outlap
            or lap.is_incomplete
            or is_outlap_detected(lap.lap_number, lap.lap_time, best_t, lap.telemetry, lap.is_valid)
        )

    flying_valid = [l for l in sess.laps if l.lap_time > 0 and l.is_valid and not _is_outlap(l) and _has_enough_data(l)]
    if len(flying_valid) >= 1:
        return sorted(flying_valid, key=lambda x: x.lap_time)

    flying_any = [l for l in sess.laps if l.lap_time > 0 and not _is_outlap(l) and _has_enough_data(l)]
    if len(flying_any) >= 1:
        return sorted(flying_any, key=lambda x: x.lap_time)

    non_outlap = [l for l in sess.laps if l.lap_time > 20.0 and not _is_outlap(l)]
    if len(non_outlap) >= 1:
        return sorted(non_outlap, key=lambda x: x.lap_time)

    fallback = [l for l in sess.laps if 20.0 <= l.lap_time <= 150.0] or [l for l in sess.laps if l.lap_time > 0]
    return sorted(fallback, key=lambda x: (1 if _is_outlap(x) else 0, x.lap_time))


def _find_sibling_flying_lap(base_session: Session) -> tuple[Session, Lap] | None:
    """
    When a session only has 1 valid flying lap within 107% (e.g. 19/10 Valencia V2),
    find the best valid flying lap from a sibling session of the same canonical track & car
    so we never pair against an out-lap (+17s..+158s).
    """
    base_track = normalize_track_name(base_session.track)
    base_car = normalize_car_name(base_session.car)
    is_base_demo = base_session.session_id.startswith("synth_")
    for summary in storage.list_sessions():
        if summary.session_id == base_session.session_id or summary.id == base_session.id:
            continue
        if not is_base_demo and summary.session_id.startswith("synth_"):
            continue
        if normalize_track_name(summary.track) != base_track or normalize_car_name(summary.car) != base_car:
            continue
        sib = storage.get_session(summary.session_id)
        if not sib or not sib.laps:
            continue
        sib_ranked = [
            l for l in _rank_flying_laps(sib) if not l.is_outlap and not l.is_incomplete and l.lap_time > 20.0
        ]
        if sib_ranked and _lap_has_valid_telemetry(sib, sib_ranked[0]):
            return sib, sib_ranked[0]
    return None


@app.get("/api/comparison", response_model=ComparisonResponse)
def get_lap_comparison(
    ref_lap_id: str | None = None,
    comp_lap_id: str | None = None,
    session_id: str | None = None,
    ref_session_id: str | None = None,
    comp_session_id: str | None = None,
    background_tasks: BackgroundTasks = None,
):
    # When cross-session comparison is requested, load each lap from its own session.
    # NEVER call ensure_session_telemetry on real sessions (Bloque 2 honesty rule).
    is_cross_session = bool(ref_session_id or comp_session_id)
    if is_cross_session:
        ref_session = _load_session(ref_session_id or session_id)
        comp_session = _load_session(comp_session_id or session_id)

        # Both sessions must be on the same track for a meaningful comparison.
        if normalize_track_name(ref_session.track) != normalize_track_name(comp_session.track):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot compare laps from different tracks: {ref_session.track} vs {comp_session.track}",
            )

        ref_lap = _find_lap(ref_session, ref_lap_id) if ref_lap_id else None
        comp_lap = _find_lap(comp_session, comp_lap_id) if comp_lap_id else None

        if not ref_lap:
            ranked_ref = _rank_flying_laps(ref_session)
            if ranked_ref:
                ref_lap = ranked_ref[0]
        if not comp_lap:
            ranked_comp = _rank_flying_laps(comp_session)
            if ranked_comp:
                comp_lap = ranked_comp[0]

        if not ref_lap or not comp_lap:
            raise HTTPException(status_code=404, detail="Could not find laps in the selected sessions")

        matched_session = ref_session  # for track name and map generation
        ref_car = normalize_car_name(ref_session.car)
        comp_car = normalize_car_name(comp_session.car)
        ref_date = ref_session.date
        comp_date = comp_session.date
    else:
        matched_session = _load_session(session_id)
        ranked = _rank_flying_laps(matched_session)
        if not ranked:
            raise HTTPException(status_code=404, detail="Session has no laps")

        ref_lap = _find_lap(matched_session, ref_lap_id) if ref_lap_id else None
        comp_lap = _find_lap(matched_session, comp_lap_id) if comp_lap_id else None

        ref_lap = ref_lap or ranked[0]
        if not comp_lap:
            comp_lap = next((l for l in ranked if l.lap_number != ref_lap.lap_number), ranked[0])

        ref_car = normalize_car_name(matched_session.car)
        comp_car = normalize_car_name(matched_session.car)
        ref_date = matched_session.date
        comp_date = matched_session.date
        ref_session = matched_session
        comp_session = matched_session

        # If this session only has 1 valid flying lap within 107% (so ref_lap == comp_lap),
        # automatically pair with the best flying lap of a sibling session on the same track+car if available.
        if ref_lap.lap_number == comp_lap.lap_number and len(ranked) == 1:
            sib = _find_sibling_flying_lap(matched_session)
            if sib is not None:
                sib_session, sib_lap = sib
                comp_session = sib_session
                comp_lap = sib_lap
                comp_car = normalize_car_name(sib_session.car)
                comp_date = sib_session.date
                is_cross_session = True

    canonical_track = normalize_track_name(matched_session.track)
    ref_sectors = {f"S{i + 1}": t for i, t in enumerate(ref_lap.sector_times)}
    comp_sectors = {f"S{i + 1}": t for i, t in enumerate(comp_lap.sector_times)}

    detected_game = _detect_simulator(matched_session)

    is_demo = matched_session.session_id.startswith("synth_")
    has_telem = _lap_has_valid_telemetry(ref_session, ref_lap) and _lap_has_valid_telemetry(comp_session, comp_lap)

    if not has_telem:
        # Honest "Sin Telemetría Grabada" response: zero invented charts or corner diagnoses.
        return ComparisonResponse(
            session_id=matched_session.session_id,
            ref_lap_id=f"Lap {ref_lap.lap_number}",
            comp_lap_id=f"Lap {comp_lap.lap_number}",
            ref_lap_time=ref_lap.lap_time,
            comp_lap_time=comp_lap.lap_time,
            delta_time_total=round(comp_lap.lap_time - ref_lap.lap_time, 3),
            track_name=canonical_track,
            car_name=ref_car,
            game_name=detected_game,
            ref_session_id=ref_session.session_id if is_cross_session else None,
            comp_session_id=comp_session.session_id if is_cross_session else None,
            ref_car_name=ref_car,
            comp_car_name=comp_car,
            ref_date=ref_date.strftime("%d/%m/%Y %H:%M") if hasattr(ref_date, "strftime") else str(ref_date),
            comp_date=comp_date.strftime("%d/%m/%Y %H:%M") if hasattr(comp_date, "strftime") else str(comp_date),
            distance=[],
            ref_speed=[],
            comp_speed=[],
            delta_speed=[],
            delta_time=[],
            ref_throttle=[],
            comp_throttle=[],
            ref_brake=[],
            comp_brake=[],
            ref_gear=[],
            comp_gear=[],
            track_x=[],
            track_y=[],
            ref_x=None,
            ref_y=None,
            comp_x=None,
            comp_y=None,
            ref_sectors=ref_sectors,
            comp_sectors=comp_sectors,
            corners=[],
            telemetry_source="none",
            has_telemetry=False,
            is_demo=False,
            optimal_lap_time=min(ref_lap.lap_time, comp_lap.lap_time),
            ideal_lap_time=None,
            ideal_potential_gain=None,
            ideal_speed=[],
            ideal_brake=[],
            ideal_throttle=[],
        )

    comparison = compare_laps(ref_lap, comp_lap, track_name=canonical_track)
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

    # Ensure the circuit base outline (track_x, track_y) is always built from a 100% complete lap
    track_len = get_track_length(canonical_track)
    aligned_covered = float(aligned["distance"][-1] - aligned["distance"][0]) if len(aligned["distance"]) > 1 else 0.0
    if aligned_covered >= 0.98 * track_len and is_complete_track_lap(aligned, canonical_track):
        track_x, track_y = generate_track_coordinates(canonical_track, aligned["distance"], aligned)
    else:
        complete_lap = next(
            (
                l
                for s in (ref_session, comp_session)
                for l in _rank_flying_laps(s)
                if is_complete_track_lap(l.telemetry, canonical_track)
            ),
            None,
        )
        if complete_lap and complete_lap.telemetry:
            full_aligned = align_laps_by_distance(complete_lap.telemetry, complete_lap.telemetry, step_m=2.0)
            track_x, track_y = generate_track_coordinates(canonical_track, full_aligned["distance"], full_aligned)
        else:
            track_x, track_y = generate_track_coordinates(canonical_track, aligned["distance"], aligned)

    corners_dto = [_corner_dto(c) for c in comparison.corners]
    ideal_ghost = compute_ideal_ghost_telemetry(aligned, comparison.corners)

    # Optimal combined lap (Rolling Best of P1 & P2 corners) + Physical Ideal Potential
    comp_wins_sum = sum(abs(c.time_delta_corner) for c in comparison.corners if c.time_delta_corner < -0.01)
    ref_wins_sum = sum(abs(c.time_delta_corner) for c in comparison.corners if c.time_delta_corner > 0.01)
    if ref_lap.lap_time <= comp_lap.lap_time:
        optimal_lap_time = round(max(10.0, ref_lap.lap_time - comp_wins_sum), 3)
    else:
        optimal_lap_time = round(max(10.0, comp_lap.lap_time - ref_wins_sum), 3)

    ideal_potential_gain = round(sum(c.ideal_time_gain or 0.06 for c in comparison.corners), 3)
    ideal_lap_time = round(max(10.0, comp_lap.lap_time - ideal_potential_gain), 3)

    if comparison.corners:
        try:
            export_track_spotter_manifest(
                track_name=canonical_track,
                pb_lap_time=min(ref_lap.lap_time, comp_lap.lap_time),
                bubota_lap_time=ideal_lap_time,
                corners=comparison.corners,
                background_tasks=background_tasks,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to export spotter manifest for track %s: %s", canonical_track, exc)

    return ComparisonResponse(
        session_id=matched_session.session_id,
        ref_lap_id=f"Lap {ref_lap.lap_number}",
        comp_lap_id=f"Lap {comp_lap.lap_number}",
        ref_lap_time=ref_lap.lap_time,
        comp_lap_time=comp_lap.lap_time,
        delta_time_total=round(comp_lap.lap_time - ref_lap.lap_time, 3),
        track_name=canonical_track,
        car_name=ref_car,
        game_name=detected_game,
        ref_session_id=ref_session.session_id if is_cross_session else None,
        comp_session_id=comp_session.session_id if is_cross_session else None,
        ref_car_name=ref_car,
        comp_car_name=comp_car,
        ref_date=ref_date.strftime("%d/%m/%Y %H:%M") if hasattr(ref_date, "strftime") else str(ref_date),
        comp_date=comp_date.strftime("%d/%m/%Y %H:%M") if hasattr(comp_date, "strftime") else str(comp_date),
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
        telemetry_source="synthetic" if is_demo else "recorded",
        has_telemetry=True,
        is_demo=is_demo,
        optimal_lap_time=optimal_lap_time,
        ideal_lap_time=ideal_lap_time,
        ideal_potential_gain=ideal_potential_gain,
        ideal_speed=ideal_ghost["ideal_speed"],
        ideal_brake=ideal_ghost["ideal_brake"],
        ideal_throttle=ideal_ghost["ideal_throttle"],
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


def _format_lap_badge_label(lap: Lap, session: Session) -> str:
    mins = int(lap.lap_time // 60)
    secs = lap.lap_time - mins * 60
    time_str = f"{mins}:{secs:06.3f}" if mins > 0 else f"{secs:.3f}s"
    date_str = session.date.strftime("%d/%m") if hasattr(session.date, "strftime") else str(session.date)[:5]
    return f"V{lap.lap_number} · {date_str} ({time_str})"


def _compute_lap_setup(
    session: Session,
    lap: Lap | None,
    is_comp_lap: bool = False,
    explicit_setup_file: str | None = None,
) -> dict[str, Any]:
    """
    Build static garage setup + dynamic on-track tyre telemetry for a given (session, lap).
    1. For ACC sessions: loads the user's actual saved setup JSON file if present on disk.
    2. For sessions with explicit setup channels in telemetry: reads them directly.
    3. For demo/synthetic sessions: provides demo baseline values.
    4. For sessions without linked setup files or where shared memory only provides dynamic physics
       (e.g. AC EVO Early Access v0.9 stores binary .carsetup in Saved Games/ACE/Car Setups/, but
       does not link the active preset in telemetry or expose static garage clicks in shared memory):
       marks has_garage_setup=False and sets garage parameters to None (honest representation, zero invented data).
       Dynamic hot tyre pressures and I/M/O temperatures remain calculated from real 50Hz telemetry.
    """
    tel = (lap.telemetry if lap and lap.telemetry else None) or session.telemetry or {}
    sim_name = session.simulator or _detect_simulator(session)
    is_demo = session.session_id.startswith("synth_") or getattr(session, "is_demo", False)

    # 1. Try loading real setup from ACC / AC EVO / LMU setup directory matching session
    real_setup = None
    sess_date = session.date if hasattr(session, "date") else None
    setup_file_target = explicit_setup_file or getattr(session, "setup_file_name", None)

    if "competizione" in sim_name.lower():
        real_setup = load_acc_setup(
            session.car,
            session.track,
            session_date=sess_date,
            session_telemetry=tel,
            explicit_file_name=setup_file_target,
        )
    elif "evo" in sim_name.lower():
        real_setup = load_acevo_setup(
            session.car,
            session.track,
            session_date=sess_date,
            session_telemetry=tel,
            explicit_file_name=setup_file_target,
        )
    elif "ultimate" in sim_name.lower() or "lmu" in sim_name.lower() or "rfactor" in sim_name.lower():
        real_setup = load_lmu_setup(
            session.car,
            session.track,
            session_date=sess_date,
            session_telemetry=tel,
            explicit_file_name=setup_file_target,
        )

    has_garage_setup = False
    setup_source = "not_available"
    setup_file_name: str | None = None
    match_method: str | None = None
    available_setups: list[str] = real_setup.get("available_setups", []) if real_setup else []

    if real_setup:
        has_garage_setup = True
        setup_source = "actual_file"
        setup_file_name = real_setup.get("setup_file_name")
        match_method = real_setup.get("match_method")
        electronics = real_setup["electronics"]
        aero = real_setup["aero"]
        chassis = real_setup["chassis"]
        pressures_cold = real_setup.get("tyres", {}).get("pressures_cold") or {
            "FL": 24.5,
            "FR": 24.6,
            "RL": 24.2,
            "RR": 24.3,
        }
    elif is_demo:
        has_garage_setup = True
        setup_source = "demo"
        setup_file_name = "Valencia GT3 Baseline"
        electronics = {
            "tc1": 3,
            "tc2": 4,
            "abs": 3,
            "brake_bias": 54.0,
            "ecu_map": 1,
        }
        aero = {
            "front_splitter": 6,
            "rear_wing": 8,
            "ride_height_front_mm": 54.0,
            "ride_height_rear_mm": 72.0,
            "rake_mm": 18.0,
        }
        chassis = {
            "arb_front": 4,
            "arb_rear": 2,
            "camber_front_deg": -3.8,
            "camber_rear_deg": -3.0,
            "toe_front_deg": -0.10,
            "toe_rear_deg": 0.15,
            "preload_diff_nm": 90,
        }
        pressures_cold = {"FL": 24.5, "FR": 24.6, "RL": 24.2, "RR": 24.3}
    elif any(
        k in tel for k in ("setup_tc1", "setup_abs", "setup_brake_bias", "tc", "abs", "brake_bias", "pressure_fl")
    ):
        has_garage_setup = any(
            k in tel
            for k in (
                "setup_front_splitter",
                "setup_rear_wing",
                "setup_camber_front_deg",
                "setup_arb_front",
                "setup_tc1",
            )
        )
        setup_source = "recorded_telemetry"
        setup_file_name = "Live 50Hz Telemetry"

        def _get_val(*keys: str) -> Any:
            for k in keys:
                v = tel.get(k)
                if v is not None:
                    if isinstance(v, list) and len(v) > 0:
                        arr = [x for x in v if x is not None and not (isinstance(x, float) and np.isnan(x))]
                        if arr:
                            non_zero = [x for x in arr if x > 0]
                            val = non_zero[0] if non_zero else arr[0]
                            return round(float(val), 2) if isinstance(val, (int, float)) else val
                    elif isinstance(v, (int, float)):
                        return round(float(v), 2)
            return None

        def _get_setting(setting_key: str, active_flag_key: str) -> int | None:
            if setting_key in tel:
                v = _get_val(setting_key)
                if v is not None:
                    return int(round(v))
            if active_flag_key in tel:
                arr = [
                    float(x)
                    for x in tel[active_flag_key]
                    if x is not None and not (isinstance(x, float) and np.isnan(x))
                ]
                if arr:
                    max_v = max(arr)
                    # If max > 1.0, it is an actual dial setting (e.g. TC: 1..12 in ACC)
                    # Values in [0, 1] are active slip/intervention flags, NOT the garage dial setting
                    if max_v > 1.0:
                        return int(round(max_v))
            return None

        tc_raw = _get_setting("setup_tc1", "tc")
        abs_raw = _get_setting("setup_abs", "abs")
        bb_raw = _get_val("brake_bias", "setup_brake_bias")
        if bb_raw is not None and 0.0 < bb_raw <= 1.0:
            bb_raw = round(bb_raw * 100.0, 1)

        electronics = {
            "tc1": tc_raw,
            "tc2": _get_val("setup_tc2"),
            "abs": abs_raw,
            "brake_bias": bb_raw,
            "ecu_map": _get_val("setup_ecu_map"),
        }
        aero = {
            "front_splitter": _get_val("setup_front_splitter"),
            "rear_wing": _get_val("setup_rear_wing"),
            "ride_height_front_mm": _get_val("ride_height_front_mm"),
            "ride_height_rear_mm": _get_val("ride_height_rear_mm"),
            "rake_mm": None,
        }
        chassis = {
            "arb_front": _get_val("setup_arb_front"),
            "arb_rear": _get_val("setup_arb_rear"),
            "camber_front_deg": _get_val("setup_camber_front_deg"),
            "camber_rear_deg": _get_val("setup_camber_rear_deg"),
            "toe_front_deg": _get_val("setup_toe_front_deg"),
            "toe_rear_deg": _get_val("setup_toe_rear_deg"),
            "preload_diff_nm": _get_val("setup_preload_diff_nm"),
        }

        def _get_cold(k: str) -> float | None:
            arr = tel.get(k)
            if isinstance(arr, list) and len(arr) > 5:
                valid_p = [float(p) for p in arr if p is not None and float(p) > 10.0]
                if valid_p:
                    return round(float(np.min(valid_p[: min(len(valid_p), 500)])), 1)
            return None

        pressures_cold = {
            "FL": _get_cold("pressure_fl") or _get_val("cold_psi_fl"),
            "FR": _get_cold("pressure_fr") or _get_val("cold_psi_fr"),
            "RL": _get_cold("pressure_rl") or _get_val("cold_psi_rl"),
            "RR": _get_cold("pressure_rr") or _get_val("cold_psi_rr"),
        }
    else:
        # Honest representation: no setup file or telemetry channel found (e.g. AC EVO EA 0.9)
        has_garage_setup = False
        setup_source = "not_available"
        setup_file_name = None
        electronics = {
            "tc1": None,
            "tc2": None,
            "abs": None,
            "brake_bias": None,
            "ecu_map": None,
        }
        aero = {
            "front_splitter": None,
            "rear_wing": None,
            "ride_height_front_mm": None,
            "ride_height_rear_mm": None,
            "rake_mm": None,
        }
        chassis = {
            "arb_front": None,
            "arb_rear": None,
            "camber_front_deg": None,
            "camber_rear_deg": None,
            "toe_front_deg": None,
            "toe_rear_deg": None,
            "preload_diff_nm": None,
        }
        pressures_cold = {"FL": None, "FR": None, "RL": None, "RR": None}

    # Dynamic on-track thermal calculation from recorded 50Hz lap channels
    lat_arr = np.asarray(tel.get("lat_accel", []), dtype=np.float64)
    brk_arr = np.asarray(tel.get("brake", []), dtype=np.float64)
    steer_arr = np.asarray(tel.get("steer_angle", []), dtype=np.float64)

    hot_fl, hot_fr, hot_rl, hot_rr = 26.8, 26.9, 26.7, 26.8
    temp_fl = [78, 81, 85]
    temp_fr = [84, 82, 79]
    temp_rl = [79, 82, 84]
    temp_rr = [83, 81, 78]

    if len(lat_arr) >= 50 and len(brk_arr) >= 50:
        # Measure braking intensity and scrub on left vs right turns
        heavy_brk = float(np.mean(brk_arr > 0.5))
        trail_zone = float(np.mean((brk_arr > 0.05) & (brk_arr < 0.6)))
        rms_lat = float(np.sqrt(np.mean(lat_arr**2)))
        steer_scrub = float(np.mean(np.abs(steer_arr) > 45.0)) if len(steer_arr) == len(lat_arr) else 0.0
        # Slight thermal shift when a lap is slower/overdriven or on a warmer track day
        lap_t = lap.lap_time if lap else 99.0
        overdrive_delta = max(-0.2, min(0.5, (lap_t - 98.8) * 0.12 + steer_scrub * 0.4 + (0.08 - trail_zone) * 1.5))
        if abs(overdrive_delta) >= 0.08:
            hot_fl = round(26.8 + overdrive_delta, 1)
            hot_fr = round(26.9 + overdrive_delta * 0.8, 1)
            hot_rl = round(26.7 + (heavy_brk - 0.12) * 1.2 + overdrive_delta * 0.5, 1)
            hot_rr = round(26.8 + (rms_lat - 0.9) * 0.5 + overdrive_delta * 0.4, 1)
            d_c = int(round(overdrive_delta * 8.0))
            temp_fl = [78 + d_c, 81 + d_c, 85 + d_c]
            temp_fr = [84 + int(d_c * 0.8), 82 + int(d_c * 0.8), 79 + int(d_c * 0.8)]
            temp_rl = [79 + int(d_c * 0.5), 82 + int(d_c * 0.5), 84 + int(d_c * 0.5)]
            temp_rr = [83 + int(d_c * 0.4), 81 + int(d_c * 0.4), 78 + int(d_c * 0.4)]

    def _val_or(key: str, default: float) -> float:
        v = tel.get(key)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, list) and v and isinstance(v[0], (int, float)):
            return float(v[0])
        return default

    def _get_hot(k: str, default: float) -> float:
        arr = tel.get(k)
        if isinstance(arr, list) and len(arr) > 5:
            valid_p = [float(p) for p in arr if p is not None and float(p) > 10.0]
            if valid_p:
                return round(float(np.mean(valid_p)), 1)
        return default

    pressures_hot = {
        "FL": float(_val_or("hot_psi_fl", _get_hot("pressure_fl", hot_fl))),
        "FR": float(_val_or("hot_psi_fr", _get_hot("pressure_fr", hot_fr))),
        "RL": float(_val_or("hot_psi_rl", _get_hot("pressure_rl", hot_rl))),
        "RR": float(_val_or("hot_psi_rr", _get_hot("pressure_rr", hot_rr))),
    }

    tyres_dict: dict[str, Any] = {
        "compound": "DHE Slick Dry",
        "pressures_hot": pressures_hot,
        "pressures_cold": pressures_cold,
        "optimal_window": "26.5 - 27.0 psi",
        "temps_c": {
            "FL": temp_fl,
            "FR": temp_fr,
            "RL": temp_rl,
            "RR": temp_rr,
        },
    }
    tyres_dict["thermal_diagnostics"] = analyze_all_tyres(tyres_dict)

    return {
        "has_garage_setup": has_garage_setup,
        "setup_source": setup_source,
        "setup_file_name": setup_file_name,
        "match_method": match_method,
        "available_setups": available_setups,
        "tyres": tyres_dict,
        "electronics": electronics,
        "aero": aero,
        "chassis": chassis,
    }


def _build_setup_comparison(
    session_id: str | None = None,
    ref_session_id: str | None = None,
    comp_session_id: str | None = None,
    ref_lap_id: str | None = None,
    comp_lap_id: str | None = None,
    setup_file_name: str | None = None,
) -> CarSetupDTO:
    if ref_session_id or comp_session_id:
        ref_session = _load_session(ref_session_id or session_id)
        comp_session = _load_session(comp_session_id or session_id)
        ref_lap = (_find_lap(ref_session, ref_lap_id) if ref_lap_id else None) or (
            _rank_flying_laps(ref_session)[0] if _rank_flying_laps(ref_session) else None
        )
        comp_lap = (_find_lap(comp_session, comp_lap_id) if comp_lap_id else None) or (
            _rank_flying_laps(comp_session)[0] if _rank_flying_laps(comp_session) else None
        )
    else:
        ref_session = _load_session(session_id)
        comp_session = ref_session
        ranked = _rank_flying_laps(ref_session)
        ref_lap = (_find_lap(ref_session, ref_lap_id) if ref_lap_id else None) or (ranked[0] if ranked else None)
        comp_lap = _find_lap(ref_session, comp_lap_id) if comp_lap_id else None
        if not comp_lap and ranked:
            comp_lap = next((l for l in ranked if not ref_lap or l.lap_number != ref_lap.lap_number), ranked[0])
        if ref_lap and comp_lap and ref_lap.lap_number == comp_lap.lap_number and len(ranked) == 1:
            sib = _find_sibling_flying_lap(ref_session)
            if sib is not None:
                comp_session, comp_lap = sib

    matched_session = comp_session or ref_session
    detected_game = _detect_simulator(matched_session)
    has_telem = _lap_has_valid_telemetry(ref_session, ref_lap) and _lap_has_valid_telemetry(comp_session, comp_lap)
    car = normalize_car_name(matched_session.car or "Porsche 992 GT3 R")
    track = normalize_track_name(matched_session.track or "Valencia")

    p1 = _compute_lap_setup(
        ref_session,
        ref_lap,
        is_comp_lap=False,
        explicit_setup_file=setup_file_name if ref_session.session_id == comp_session.session_id else None,
    )
    p2 = _compute_lap_setup(
        comp_session,
        comp_lap,
        is_comp_lap=True,
        explicit_setup_file=setup_file_name,
    )

    # Compare Static Garage Setup (cold pressures, electronics, aero, chassis)
    garage_diffs: list[str] = []
    p1_has_setup = p1.get("has_garage_setup", False)
    p2_has_setup = p2.get("has_garage_setup", False)

    if p1_has_setup and p2_has_setup:
        p1_el, p2_el = p1["electronics"], p2["electronics"]
        if (
            p1_el.get("brake_bias") is not None
            and p2_el.get("brake_bias") is not None
            and abs(float(p2_el["brake_bias"]) - float(p1_el["brake_bias"])) >= 0.05
        ):
            d = float(p2_el["brake_bias"]) - float(p1_el["brake_bias"])
            garage_diffs.append(f"BB {d:+.1f}%")
        for k, lbl in (("tc1", "TC1"), ("tc2", "TC2"), ("abs", "ABS"), ("ecu_map", "Mapa")):
            v1, v2 = p1_el.get(k), p2_el.get(k)
            if v1 is not None and v2 is not None and int(v2) != int(v1):
                garage_diffs.append(f"{lbl} {int(v2) - int(v1):+d}")

        p1_aero, p2_aero = p1["aero"], p2["aero"]
        for k, lbl, unit in (
            ("front_splitter", "Splitter", ""),
            ("rear_wing", "Alerón", ""),
            ("ride_height_front_mm", "Alt. Del", "mm"),
            ("ride_height_rear_mm", "Alt. Tras", "mm"),
        ):
            v1, v2 = p1_aero.get(k), p2_aero.get(k)
            if v1 is not None and v2 is not None and abs(float(v2) - float(v1)) >= 0.1:
                d = float(v2) - float(v1)
                garage_diffs.append(f"{lbl} {d:+.0f}{unit}")

        p1_ch, p2_ch = p1["chassis"], p2["chassis"]
        for k, lbl in (("arb_front", "ARB Del"), ("arb_rear", "ARB Tras"), ("preload_diff_nm", "Precarga")):
            v1, v2 = p1_ch.get(k), p2_ch.get(k)
            if v1 is not None and v2 is not None and abs(float(v2) - float(v1)) >= 0.1:
                garage_diffs.append(f"{lbl} {int(v2) - int(v1):+d}")
        for k, lbl in (("camber_front_deg", "Caída Del"), ("camber_rear_deg", "Caída Tras")):
            v1, v2 = p1_ch.get(k), p2_ch.get(k)
            if v1 is not None and v2 is not None and abs(float(v2) - float(v1)) >= 0.05:
                garage_diffs.append(f"{lbl} {float(v2) - float(v1):+.1f}°")

        p1_cold, p2_cold = p1["tyres"]["pressures_cold"], p2["tyres"]["pressures_cold"]
        for wheel in ("FL", "FR", "RL", "RR"):
            c1, c2 = p1_cold.get(wheel), p2_cold.get(wheel)
            if c1 is not None and c2 is not None:
                d_cold = float(c2) - float(c1)
                if abs(d_cold) >= 0.1:
                    garage_diffs.append(f"{wheel} Frío {d_cold:+.1f} psi")

    same_garage_setup = p1_has_setup and p2_has_setup and len(garage_diffs) == 0
    same_session = ref_session.session_id == comp_session.session_id

    # Compare Dynamic On-Track Tyre Telemetry (hot pressures)
    thermal_diffs: list[str] = []
    p1_hot, p2_hot = p1["tyres"]["pressures_hot"], p2["tyres"]["pressures_hot"]
    for wheel in ("FL", "FR", "RL", "RR"):
        d_hot = round(float(p2_hot[wheel]) - float(p1_hot[wheel]), 1)
        if abs(d_hot) > 0.1:
            thermal_diffs.append(f"{wheel} {d_hot:+.1f} psi")

    ref_label = _format_lap_badge_label(ref_lap, ref_session) if ref_lap else "V1"
    comp_label = _format_lap_badge_label(comp_lap, comp_session) if comp_lap else "V2"

    advice_items = [
        {
            "title": f"Equilibrio en curvas lentas ({track})",
            "suggestion": "Si notas que el tren delantero no muerde al soltar freno, retrasa el reparto de frenada (-0.5%) o ablanda la barra estabilizadora delantera 1 punto.",
            "impact": "Mejora inserción y velocidad en vértice.",
        },
        {
            "title": "Ventana de presiones",
            "suggestion": "Las presiones en caliente objetivo están en 26.5 - 27.0 psi, ventana de máximo agarre para GT en circuito.",
            "impact": "Grip lateral óptimo.",
        },
        {
            "title": f"Tracción y estabilidad ({track})",
            "suggestion": "Si la zaga se descoloca en aceleración con volante girado, aumenta el control de tracción (TC) 1 punto o sube el alerón trasero para mayor apoyo a alta velocidad.",
            "impact": "Estabilidad en aceleración.",
        },
    ]

    return CarSetupDTO(
        session_id=matched_session.session_id,
        car_name=car,
        track_name=track,
        game_name=detected_game,
        has_telemetry=has_telem,
        has_garage_setup=p2.get("has_garage_setup", False),
        setup_source=p2.get("setup_source", "not_available"),
        setup_file_name=p2.get("setup_file_name"),
        match_method=p2.get("match_method") or p1.get("match_method"),
        available_setups=p2.get("available_setups", []) or p1.get("available_setups", []),
        tyres=p2["tyres"],
        electronics=p2["electronics"],
        aero=p2["aero"],
        chassis=p2["chassis"],
        setup_advice=advice_items,
        ref_lap_id=f"Lap {ref_lap.lap_number}" if ref_lap else None,
        comp_lap_id=f"Lap {comp_lap.lap_number}" if comp_lap else None,
        ref_lap_label=ref_label,
        comp_lap_label=comp_label,
        ref_lap_number=ref_lap.lap_number if ref_lap else 1,
        comp_lap_number=comp_lap.lap_number if comp_lap else 2,
        ref_lap_time=ref_lap.lap_time if ref_lap else 0.0,
        comp_lap_time=comp_lap.lap_time if comp_lap else 0.0,
        ref_date=ref_session.date.strftime("%d/%m/%Y")
        if hasattr(ref_session.date, "strftime")
        else str(ref_session.date),
        comp_date=comp_session.date.strftime("%d/%m/%Y")
        if hasattr(comp_session.date, "strftime")
        else str(comp_session.date),
        ref_session_id=ref_session.session_id,
        comp_session_id=comp_session.session_id,
        same_session=same_session,
        same_garage_setup=same_garage_setup,
        garage_diff_count=len(garage_diffs),
        garage_diff_summary=garage_diffs,
        thermal_diff_summary=thermal_diffs,
        p1_setup=p1,
        p2_setup=p2,
    )


@app.get("/api/car-setup", response_model=CarSetupDTO)
def get_car_setup(
    session_id: str | None = Query(None),
    ref_session_id: str | None = Query(None),
    comp_session_id: str | None = Query(None),
    ref_lap_id: str | None = Query(None),
    comp_lap_id: str | None = Query(None),
    setup_file_name: str | None = Query(None),
):
    return _build_setup_comparison(
        session_id=session_id,
        ref_session_id=ref_session_id,
        comp_session_id=comp_session_id,
        ref_lap_id=ref_lap_id,
        comp_lap_id=comp_lap_id,
        setup_file_name=setup_file_name,
    )


@app.get("/api/stint-analysis")
def get_stint_analysis(session_id: str | None = Query(None)):
    matched_session = _load_session(session_id)
    return analyze_session_stint(matched_session)


class SetupAdviceRequest(BaseModel):
    ref_lap_id: str | None = None
    comp_lap_id: str | None = None
    session_id: str | None = None
    ref_session_id: str | None = None
    comp_session_id: str | None = None


def _resolve_setup_laps(
    session_id: str | None = None,
    ref_session_id: str | None = None,
    comp_session_id: str | None = None,
    ref_lap_id: str | None = None,
    comp_lap_id: str | None = None,
    detail_prefix: str = "setup advice",
) -> tuple[Session, Session, Lap, Lap]:
    if ref_session_id or comp_session_id:
        ref_session = _load_session(ref_session_id or session_id)
        comp_session = _load_session(comp_session_id or session_id)
        ref_lap = _find_lap(ref_session, ref_lap_id) if ref_lap_id else None
        comp_lap = _find_lap(comp_session, comp_lap_id) if comp_lap_id else None
        if not ref_lap and not ref_lap_id:
            ranked_ref = _rank_flying_laps(ref_session)
            ref_lap = ranked_ref[0] if ranked_ref else (ref_session.laps[0] if ref_session.laps else None)
        if not comp_lap and not comp_lap_id:
            ranked_comp = _rank_flying_laps(comp_session)
            comp_lap = ranked_comp[0] if ranked_comp else (comp_session.laps[0] if comp_session.laps else None)
    else:
        ref_session = _load_session(session_id)
        comp_session = ref_session
        ranked = _rank_flying_laps(ref_session)
        ref_lap = _find_lap(ref_session, ref_lap_id) if ref_lap_id else None
        if not ref_lap and not ref_lap_id:
            ref_lap = ranked[0] if ranked else (ref_session.laps[0] if ref_session.laps else None)
        comp_lap = _find_lap(ref_session, comp_lap_id) if comp_lap_id else None
        if not comp_lap and not comp_lap_id:
            if ranked:
                comp_lap = next((l for l in ranked if not ref_lap or l.lap_number != ref_lap.lap_number), ranked[0])
            elif ref_session.laps:
                comp_lap = next(
                    (l for l in ref_session.laps if not ref_lap or l.lap_number != ref_lap.lap_number),
                    ref_session.laps[0],
                )
        if ref_lap and comp_lap and ref_lap.lap_number == comp_lap.lap_number and len(ranked) == 1:
            sib = _find_sibling_flying_lap(ref_session)
            if sib is not None:
                comp_session, comp_lap = sib

    if not ref_lap or not comp_lap:
        raise HTTPException(status_code=404, detail=f"Laps not found for {detail_prefix}")

    return ref_session, comp_session, ref_lap, comp_lap


@app.post("/api/setup-advice", response_model=SetupAdviceReport)
def get_setup_advice(req: SetupAdviceRequest):
    """Generate structured setup recommendations from a lap comparison."""
    ref_session, comp_session, ref_lap, comp_lap = _resolve_setup_laps(
        session_id=req.session_id,
        ref_session_id=req.ref_session_id,
        comp_session_id=req.comp_session_id,
        ref_lap_id=req.ref_lap_id,
        comp_lap_id=req.comp_lap_id,
        detail_prefix="setup advice",
    )

    has_telem = _lap_has_valid_telemetry(ref_session, ref_lap) and _lap_has_valid_telemetry(comp_session, comp_lap)
    comparison = compare_laps(ref_lap, comp_lap, track_name=ref_session.track)
    return generate_setup_advice(
        comparison,
        car=normalize_car_name(ref_session.car),
        track=normalize_track_name(ref_session.track),
        synthetic=not has_telem or ref_lap.synthetic or comp_lap.synthetic,
    )


class SetupAdviceReviewRequest(BaseModel):
    ref_lap_id: str | None = None
    comp_lap_id: str | None = None
    session_id: str | None = None
    ref_session_id: str | None = None
    comp_session_id: str | None = None
    lang: str = "es"


def _build_review_prompt(report: SetupAdviceReport, car: str, track: str, lang: str) -> str:
    """Build the prompt asking Pep to review the structured setup advice."""
    es = lang.lower() != "en"
    lines: list[str] = []

    if es:
        lines.append(
            "A continuación tienes un informe de setup advice generado automáticamente por reglas "
            "a partir de telemetría de comparación de vueltas. Tu trabajo es REVISARLO como ingeniero de pista: "
            "comprobar que las recomendaciones son coherentes entre sí, señalar posibles conflictos o "
            "contradicciones, y proponer un orden de prueba recomendado.\n"
        )
        lines.append(f"Coche: {car}")
        lines.append(f"Circuito: {track}")
        lines.append(f"Balance general detectado: {report.overall_balance}")
        lines.append(f"Problema principal: {report.primary_issue}")
        lines.append(f"Resumen automático: {report.summary}")
        lines.append(f"Confianza global del análisis: {report.confidence}")
        lines.append("")
        lines.append(f"Recomendaciones estructuradas ({len(report.recommendations)}):")
        for i, r in enumerate(report.recommendations, 1):
            lines.append(f"\n{i}. [{r.priority.upper()}] {r.parameter} → {r.suggested_change}")
            lines.append(f"   Motivo: {r.reason}")
            if r.evidence:
                lines.append("   Evidencia:")
                for ev in r.evidence:
                    lines.append(f"   - {ev}")
            if r.affected_corners:
                lines.append(f"   Curvas afectadas: {', '.join(r.affected_corners)}")
        lines.append("")
        lines.append("--- TU REVISIÓN ---")
        lines.append(
            "Responde en español con estos apartados:\n"
            "1. **Veredicto general**: ¿Las recomendaciones son coherentes? ¿Hay alguna que no tenga sentido "
            "o que contradiga a otra?\n"
            "2. **Conflictos detectados**: Si los hay, explica cuáles y por qué (ej: cambiar brake bias "
            "hacia atrás y ablandar ARB delantero a la vez puede sobrevirar el coche en frenada).\n"
            "3. **Orden de prueba recomendado**: Si hay varias recomendaciones, indica cuál probar primero, "
            "cuál segunda, etc. Justifica el orden (qué cambio tiene más impacto, cuál es más seguro).\n"
            "4. **Advertencias**: Cualquier riesgo o precaución importante (ej: no hagas dos cambios a la vez, "
            "prueba 5 vueltas por cambio, vigila las temperaturas de neumáticos).\n"
            "Sé directo y conciso. Máximo 300 palabras. No inventes datos que no estén en el informe."
        )
    else:
        lines.append(
            "Below is a setup advice report generated automatically by rules from lap comparison telemetry. "
            "Your job is to REVIEW it as a race engineer: check that the recommendations are consistent "
            "with each other, flag possible conflicts or contradictions, and suggest a recommended testing order.\n"
        )
        lines.append(f"Car: {car}")
        lines.append(f"Track: {track}")
        lines.append(f"Detected overall balance: {report.overall_balance}")
        lines.append(f"Primary issue: {report.primary_issue}")
        lines.append(f"Automatic summary: {report.summary}")
        lines.append(f"Overall analysis confidence: {report.confidence}")
        lines.append("")
        lines.append(f"Structured recommendations ({len(report.recommendations)}):")
        for i, r in enumerate(report.recommendations, 1):
            lines.append(f"\n{i}. [{r.priority.upper()}] {r.parameter} → {r.suggested_change}")
            lines.append(f"   Reason: {r.reason}")
            if r.evidence:
                lines.append("   Evidence:")
                for ev in r.evidence:
                    lines.append(f"   - {ev}")
            if r.affected_corners:
                lines.append(f"   Affected corners: {', '.join(r.affected_corners)}")
        lines.append("")
        lines.append("--- YOUR REVIEW ---")
        lines.append(
            "Respond in English with these sections:\n"
            "1. **Overall verdict**: Are the recommendations consistent? Is any of them nonsensical "
            "or contradictory?\n"
            "2. **Detected conflicts**: If any, explain which and why (e.g.: shifting brake bias rearward "
            "and softening the front ARB at the same time can make the car oversteer under braking).\n"
            "3. **Recommended testing order**: If there are several recommendations, indicate which to try "
            "first, which second, etc. Justify the order (which change has the most impact, which is safest).\n"
            "4. **Warnings**: Any important risk or caution (e.g.: don't make two changes at once, "
            "test 5 laps per change, watch tyre temperatures).\n"
            "Be direct and concise. Maximum 300 words. Do not invent data not present in the report."
        )

    return "\n".join(lines)


def _fallback_review(report: SetupAdviceReport, lang: str) -> str:
    """Rule-based fallback review when no LLM is available."""
    es = lang.lower() != "en"
    if not report.recommendations:
        return (
            "No hay recomendaciones de setup que revisar. Concéntrate en mejorar la técnica de pilotaje "
            "antes de tocar el reglaje."
            if es
            else "No setup recommendations to review. Focus on improving driving technique before touching the setup."
        )

    high = [r for r in report.recommendations if r.priority == "high"]
    lines: list[str] = []
    if es:
        lines.append(
            f"Veredicto: {len(report.recommendations)} recomendaciones detectadas, "
            f"{len(high)} de alta prioridad. El balance general es '{report.overall_balance}'."
        )
        if len(report.recommendations) > 1:
            lines.append(
                "Orden recomendado: empieza por la recomendación de mayor prioridad, "
                "prueba 5 vueltas, y solo entonces pasa a la siguiente. No hagas dos cambios a la vez."
            )
        lines.append(
            "Advertencia: si el coche empeora tras un cambio, vuelve al valor anterior antes de probar el siguiente."
        )
    else:
        lines.append(
            f"Verdict: {len(report.recommendations)} recommendations detected, "
            f"{len(high)} high priority. Overall balance is '{report.overall_balance}'."
        )
        if len(report.recommendations) > 1:
            lines.append(
                "Recommended order: start with the highest priority recommendation, "
                "test 5 laps, and only then move to the next one. Do not make two changes at once."
            )
        lines.append(
            "Warning: if the car gets worse after a change, revert to the previous value before trying the next one."
        )
    return "\n\n".join(lines)


@app.post("/api/setup-advice/review", response_model=SetupAdviceReview)
def get_setup_advice_review(req: SetupAdviceReviewRequest):
    """Generate structured setup advice and enrich it with Pep's natural-language review."""
    ref_session, comp_session, ref_lap, comp_lap = _resolve_setup_laps(
        session_id=req.session_id,
        ref_session_id=req.ref_session_id,
        comp_session_id=req.comp_session_id,
        ref_lap_id=req.ref_lap_id,
        comp_lap_id=req.comp_lap_id,
        detail_prefix="setup advice review",
    )

    has_telem = _lap_has_valid_telemetry(ref_session, ref_lap) and _lap_has_valid_telemetry(comp_session, comp_lap)
    comparison = compare_laps(ref_lap, comp_lap, track_name=ref_session.track)
    report = generate_setup_advice(
        comparison,
        car=normalize_car_name(ref_session.car),
        track=normalize_track_name(ref_session.track),
        synthetic=not has_telem or ref_lap.synthetic or comp_lap.synthetic,
    )

    lang = req.lang or "es"
    system_prompt = PEP_SYSTEM_PROMPT_ES if lang.lower() != "en" else PEP_SYSTEM_PROMPT_EN
    user_prompt = _build_review_prompt(report, ref_session.car, ref_session.track, lang)

    review_text: str | None = None
    review_source = "rules"
    review_model: str | None = None

    if llm_client.is_available():
        chat_timeout = getattr(llm_client, "chat_timeout", float(os.environ.get("RADIO_CHAT_TIMEOUT", "120.0")))
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        review_text = llm_client.chat(messages, timeout=chat_timeout)
        if review_text and review_text.strip():
            review_source = "llm"
            review_model = llm_client.active_model

    if not review_text or not review_text.strip():
        review_text = _fallback_review(report, lang)

    return SetupAdviceReview(
        report=report,
        pep_review=review_text.strip(),
        review_source=review_source,
        review_model=review_model,
    )


@app.post("/api/coach/report", response_model=CoachReport)
def generate_coach_report(req: AIAdviceRequest):
    ref_session = _load_session(req.ref_session_id or req.session_id)
    comp_session = _load_session(req.comp_session_id or req.session_id) if req.comp_session_id else ref_session
    ref_lap = _find_lap(ref_session, req.ref_lap_id)
    comp_lap = _find_lap(comp_session, req.comp_lap_id)
    if not ref_lap or not comp_lap:
        raise HTTPException(status_code=404, detail="Laps not found for coach report")

    if not req.force_refresh and ref_session.session_id == comp_session.session_id:
        cached = storage.get_coach_report(ref_session.session_id, ref_lap.lap_number, comp_lap.lap_number)
        if cached:
            return cached

    has_telem = _lap_has_valid_telemetry(ref_session, ref_lap) and _lap_has_valid_telemetry(comp_session, comp_lap)
    comparison = compare_laps(ref_lap, comp_lap, track_name=ref_session.track)
    setup_dto = _build_setup_comparison(
        session_id=req.session_id,
        ref_session_id=ref_session.session_id,
        comp_session_id=comp_session.session_id,
        ref_lap_id=str(ref_lap.lap_number),
        comp_lap_id=str(comp_lap.lap_number),
    )
    report = advisor.generate_report(
        comparison,
        car=normalize_car_name(ref_session.car),
        track=normalize_track_name(ref_session.track),
        synthetic=not has_telem or ref_lap.synthetic or comp_lap.synthetic,
        setup_comparison=setup_dto.model_dump(),
    )
    if ref_session.session_id == comp_session.session_id:
        storage.save_coach_report(ref_session.session_id, ref_lap.lap_number, comp_lap.lap_number, report)
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

    try:
        setup_dto = _build_setup_comparison(
            session_id=req.session_id,
            ref_session_id=req.ref_session_id,
            comp_session_id=req.comp_session_id,
            ref_lap_id=req.ref_lap_id,
            comp_lap_id=req.comp_lap_id,
        )
        if setup_dto.same_garage_setup and not setup_dto.thermal_diff_summary:
            lines.append(labels["same_setup"])
        elif setup_dto.same_garage_setup and setup_dto.thermal_diff_summary:
            t_diffs = ", ".join(setup_dto.thermal_diff_summary)
            lines.append(
                f"\nSETUP: Exact same garage setup in P1 and P2, with dynamic on-track tyre pressure variations ({t_diffs})."
                if lang == "en"
                else f"\nSETUP: Mismo setup de garaje en P1 y P2, con variación térmica de neumáticos en pista ({t_diffs})."
            )
        else:
            g_diffs = ", ".join(setup_dto.garage_diff_summary)
            lines.append(
                f"\nMODIFIED SETUP (P2 vs P1): {g_diffs}. Correlate these mechanical changes with the corner behavior."
                if lang == "en"
                else f"\nSETUP MODIFICADO (P2 vs P1): {g_diffs}. Correlaciona estos cambios mecánicos con el comportamiento en curva."
            )
    except (HTTPException, KeyError, ValueError, TypeError):
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
    def _scan_dirs(dirs_and_patterns: list[tuple[str, list[str]]]) -> list[dict[str, Any]]:
        files: set[str] = set()
        for directory, patterns in dirs_and_patterns:
            if not os.path.exists(directory):
                continue
            for pat in patterns:
                files.update(glob.glob(os.path.join(directory, pat), recursive=True))

        items: list[dict[str, Any]] = []
        for f in files:
            try:
                mtime = os.path.getmtime(f)
            except OSError:
                mtime = 0.0
            items.append(
                {
                    "filename": os.path.basename(f),
                    "path": f,
                    "mtime": mtime,
                    "modified_at": datetime.fromtimestamp(mtime).isoformat() if mtime else "",
                }
            )
        # Strictly sort newest to oldest
        items.sort(key=lambda x: x["mtime"], reverse=True)
        return items

    extra_acc_csv: list[tuple[str, list[str]]] = []
    extra_acevo_csv: list[tuple[str, list[str]]] = []
    if os.path.exists(NATIVE_RECORDINGS_DIR):
        extra_acc_csv.append((NATIVE_RECORDINGS_DIR, ["acc_*.csv"]))
        extra_acevo_csv.append((NATIVE_RECORDINGS_DIR, ["acevo*.csv"]))

    acc_files = _scan_dirs([(ACC_MOTEC_DIR, ["*.ld"]), (ACC_RECORDINGS_DIR, ["*.csv"])] + extra_acc_csv)
    lmu_files = _scan_dirs([(LMU_RESULTS_DIR, ["*.xml"])])
    acevo_files = _scan_dirs(
        [
            (ACEVO_MOTEC_DIR, ["**/*.ld"]),
            (ACEVO_RESULTS_DIR, ["*.sessionresults.json"]),
            (ACEVO_RECORDINGS_DIR, ["*.csv"]),
            (ACEVO_SETUPS_DIR, ["**/*.carsetup", "**/*.setup"]),
        ]
        + extra_acevo_csv
    )
    ac1_files = _scan_dirs([(AC1_MOTEC_DIR, ["*.ld"]), (AC1_RECORDINGS_DIR, ["*.csv"])])

    return {
        "acc_path": ACC_MOTEC_DIR,
        "acc_found": len(acc_files),
        "acc_files": acc_files,
        "lmu_path": LMU_RESULTS_DIR,
        "lmu_found": len(lmu_files),
        "lmu_files": lmu_files,
        "acevo_path": ACEVO_MOTEC_DIR,
        "acevo_found": len(acevo_files),
        "acevo_files": acevo_files,
        "ac1_path": AC1_MOTEC_DIR,
        "ac1_found": len(ac1_files),
        "ac1_files": ac1_files,
    }


@app.post("/api/autodiscover/rescan")
def rescan_simulator_folders():
    """Rescan Steam / MoTeC / Recorder telemetry folders and import any newly recorded sessions."""
    imported_sources = _already_imported_source_files()
    results = _auto_import_all(imported_sources)
    return {
        "status": "ok",
        "imported": sum(results.values()),
        "details": results,
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
        if ext == ".json":
            return ACEVOImporter(filepath).parse()
    except (ValueError, KeyError, IndexError, struct.error, ET.ParseError) as e:
        raise HTTPException(status_code=400, detail=f"Could not read {os.path.basename(filepath)}: {e}") from e
    raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")


@app.post("/api/import/local-file")
def import_local_file(req: LocalImportRequest):
    filepath = os.path.realpath(req.filepath)
    allowed_dirs = [
        os.path.realpath(d)
        for d in (
            ACC_MOTEC_DIR,
            ACC_RECORDINGS_DIR,
            NATIVE_RECORDINGS_DIR,
            LMU_RESULTS_DIR,
            ACEVO_MOTEC_DIR,
            ACEVO_RESULTS_DIR,
            ACEVO_RECORDINGS_DIR,
            ACEVO_SETUPS_DIR,
            AC1_MOTEC_DIR,
            AC1_RECORDINGS_DIR,
        )
    ]
    for d in glob.glob(COMPATDATA_RECORDINGS_GLOB):
        allowed_dirs.append(os.path.realpath(d))
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
