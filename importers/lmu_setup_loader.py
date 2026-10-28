"""
Le Mans Ultimate setup loader.
Reads user setup .svm files from Steam common directory or Proton prefixes.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

TRACK_ALIASES: dict[str, str] = {
    "algarve": "Portimao",
    "portimao": "Portimao",
    "portimão": "Portimao",
    "cota": "Circuit Of The Americas",
    "circuit of the americas": "Circuit Of The Americas",
    "americas": "Circuit Of The Americas",
    "austin": "Circuit Of The Americas",
    "barcelona": "Circuit De Barcelona",
    "circuit de barcelona": "Circuit De Barcelona",
    "catalunya": "Circuit De Barcelona",
    "montmelo": "Circuit De Barcelona",
    "le mans": "Lemans",
    "lemans": "Lemans",
    "sarthe": "Lemans",
    "daytona": "Daytonarc",
    "daytonarc": "Daytonarc",
    "road atlanta": "Road Atlanta",
    "paul ricard": "Paulricard",
    "paulricard": "Paulricard",
    "laguna seca": "Lagunaseca",
    "lagunaseca": "Lagunaseca",
    "monza": "Monza",
    "sebring": "Sebring",
    "spa": "Spa",
    "fuji": "Fuji",
    "imola": "Imola",
    "interlagos": "Interlagos",
    "bahrain": "Bahrain",
    "qatar": "Qatar",
    "silverstone": "Silverstone",
}


def find_lmu_setups_dir() -> Path | None:
    """Locate the LMU Settings directory in Steam common directory or Proton prefixes."""
    env_dir = os.environ.get("LMU_SETUPS_DIR")
    if env_dir and Path(env_dir).is_dir():
        return Path(env_dir)

    candidates = [
        # Linux Steam standard path
        Path.home() / ".local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/player/Settings",
        Path.home() / ".steam/steam/steamapps/common/Le Mans Ultimate/UserData/player/Settings",
        # Windows / Wine prefix path if mapped
        Path.home()
        / ".local/share/Steam/steamapps/compatdata/2399420/pfx/drive_c/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/player/Settings",
    ]
    for c in candidates:
        if c.is_dir():
            return c
    return None


def find_lmu_log_dir() -> Path | None:
    """Locate the LMU UserData/Log directory."""
    env_dir = os.environ.get("LMU_LOG_DIR")
    if env_dir and Path(env_dir).is_dir():
        return Path(env_dir)

    candidates = [
        Path.home() / ".local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log",
        Path.home() / ".steam/steam/steamapps/common/Le Mans Ultimate/UserData/Log",
        Path.home()
        / ".local/share/Steam/steamapps/compatdata/2399420/pfx/drive_c/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Log",
    ]
    for c in candidates:
        if c.is_dir():
            return c
    return None


def find_setup_from_lmu_trace(
    log_dir: Path,
    session_date: datetime,
    car_name: str = "",
    track_name: str = "",
) -> str | None:
    """
    Search LMU trace_*.txt logs for the active setup loaded for the player vehicle in the session.
    Matches lines like:
    garageLoad.c 1608: Requested Setup: ... for Vehicle <car> & Track <track>. Found setup: <filename>.svm
    """
    if not log_dir.is_dir():
        return None

    target_ts = session_date.timestamp()
    candidates: list[tuple[float, Path]] = []
    for tf in log_dir.glob("trace*.txt"):
        try:
            mtime = tf.stat().st_mtime
            diff = abs(mtime - target_ts)
            if diff <= 2700:  # within 45 minutes
                candidates.append((diff, tf))
        except OSError:
            continue

    candidates.sort(key=lambda x: x[0])
    car_tokens = [t.lower() for t in car_name.replace("_", " ").replace("-", " ").split() if len(t) > 2]

    for _, tf in candidates[:4]:
        try:
            with open(tf, encoding="utf-8", errors="ignore") as f:
                content = f.read()

            matches = re.findall(
                r"garageLoad\.c\s+\d+:\s+Requested Setup:.*?Vehicle\s+([^&]+)&\s+Track\s+([^\.]+)\.\s+Found setup:\s*([^\r\n]+)",
                content,
            )
            for v_name, _t_name, s_name in reversed(matches):
                v_clean = v_name.strip().lower()
                if car_tokens and not any(tok in v_clean for tok in car_tokens):
                    continue
                setup_file = s_name.strip()
                if setup_file:
                    return setup_file
        except OSError:
            continue
    return None


def list_lmu_track_setups(track_name: str) -> list[str]:
    """Return sorted list of setup file names available on disk for a given track."""
    root = find_lmu_setups_dir()
    if not root:
        return []
    track_dir = _match_lmu_track_dir(root, track_name)
    if not track_dir:
        return []
    return sorted([p.name for p in track_dir.glob("*.svm") if p.is_file()])


def _match_lmu_track_dir(parent: Path, track_name: str) -> Path | None:
    """Match LMU track directory using aliases or fuzzy token matching."""
    if not parent.is_dir() or not track_name:
        return None

    cleaned = track_name.lower().strip()
    for key, folder_name in TRACK_ALIASES.items():
        if key in cleaned:
            target = parent / folder_name
            if target.is_dir():
                return target

    # Fallback: fuzzy match against directory names
    q = re.sub(r"[^a-z0-9]+", "", cleaned)
    for d in parent.iterdir():
        if not d.is_dir():
            continue
        d_clean = re.sub(r"[^a-z0-9]+", "", d.name.lower())
        if d_clean and (d_clean in q or q in d_clean):
            return d
    return None


def parse_svm_file(file_path: Path) -> dict[str, dict[str, tuple[str, str]]]:
    """
    Parse an LMU .svm INI file into sections and key -> (raw_val, comment) mappings.
    Example line: RWSetting=6//12.3 deg -> {"RWSetting": ("6", "12.3 deg")}
    """
    sections: dict[str, dict[str, tuple[str, str]]] = {}
    current_sec = "ROOT"
    sections[current_sec] = {}

    with open(file_path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("//"):
                continue
            if line.startswith("[") and line.endswith("]"):
                current_sec = line[1:-1].upper()
                sections[current_sec] = {}
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip()
                comment = ""
                if "//" in v:
                    raw, comment = v.split("//", 1)
                    raw = raw.strip()
                    comment = comment.strip()
                else:
                    raw = v
                sections[current_sec][k] = (raw, comment)
    return sections


def load_lmu_setup(
    car_name: str,
    track_name: str,
    session_date: datetime | None = None,
    session_telemetry: dict[str, Any] | None = None,
    explicit_file_name: str | None = None,
) -> dict[str, Any] | None:
    """
    Find and parse the Le Mans Ultimate .svm setup file for a given car and track.
    Enforces Rule 2 (Technical Honesty & Fidelity):
    1. Explicit file: if requested by user or session link, loads that exact file.
    2. Trace Log Match: parses LMU trace_*.txt logs around session_date to find what the game loaded.
    3. Temporal Causality & Telemetry Match: filters out setups modified after the session ended,
       and correlates telemetry channels (brake bias, TC, ABS) to match the setup used in that session.
    4. If no setup existed at the session time or matches the telemetry, returns None (honest N/D).
    """
    root = find_lmu_setups_dir()
    if not root:
        return None

    track_dir = _match_lmu_track_dir(root, track_name)
    if not track_dir:
        return None

    all_svm_files = sorted(
        [p for p in track_dir.glob("*.svm") if p.is_file()], key=lambda p: p.stat().st_mtime, reverse=True
    )
    if not all_svm_files:
        return None

    available_setups = [p.name for p in all_svm_files]
    active_file: Path | None = None
    match_method = "session_timestamp"

    # 1. Explicit file requested
    if explicit_file_name:
        cand = track_dir / explicit_file_name
        if cand.is_file():
            active_file = cand
            match_method = "user_selected"
        else:
            for p in all_svm_files:
                if p.name.lower() == explicit_file_name.lower():
                    active_file = p
                    match_method = "user_selected"
                    break

    # 2. Simulator Trace Log Resolution (deterministic record from LMU)
    if not active_file and session_date:
        log_dir = find_lmu_log_dir()
        if log_dir:
            trace_setup = find_setup_from_lmu_trace(log_dir, session_date, car_name, track_name)
            if trace_setup:
                cand = track_dir / trace_setup
                if cand.is_file():
                    active_file = cand
                    match_method = "trace_log"
                else:
                    for p in all_svm_files:
                        if p.name.lower() == trace_setup.lower():
                            active_file = p
                            match_method = "trace_log"
                            break

    # 3. Temporal Causality & Telemetry Correlation
    if not active_file:
        if session_date:
            session_ts = session_date.timestamp()
            # A setup file modified > 180s after session ended cannot have been used in it
            valid_candidates = [p for p in all_svm_files if p.stat().st_mtime <= session_ts + 180]
        else:
            valid_candidates = all_svm_files

        if not valid_candidates:
            # Rule 2: Honest representation. The setup was created at a later date.
            logger.info("No LMU setup existed on disk prior to session date %s", session_date)
            return None

        # Telemetry correlation (brake bias, TC, ABS)
        tel_bb: float | None = None
        if session_telemetry:
            for k in ("brake_bias", "setup_brake_bias"):
                v = session_telemetry.get(k)
                if isinstance(v, list) and v:
                    tel_bb = float(v[0])
                    break
                elif isinstance(v, (int, float)):
                    tel_bb = float(v)
                    break

        car_tokens = [t.lower() for t in car_name.replace("_", " ").replace("-", " ").split() if len(t) > 2]
        best_file: Path | None = None
        best_score = -999.0

        for p in valid_candidates:
            score = 0.0
            p_name_lower = p.name.lower()
            if any(tok in p_name_lower for tok in car_tokens):
                score += 3.0

            try:
                parsed_sec = parse_svm_file(p)
                ctrls = parsed_sec.get("CONTROLS", {})
                if tel_bb is not None:
                    bb_comm = ctrls.get("RearBrakeSetting", ("", ""))[1]
                    bb_m = re.search(r"([\d\.]+):", bb_comm)
                    if bb_m:
                        file_bb = float(bb_m.group(1))
                        if abs(file_bb - tel_bb) < 0.25:
                            score += 15.0
                        else:
                            score -= 10.0
            except OSError:
                continue

            if session_date:
                # Proximity bonus (closer to session start is preferred)
                diff_hours = abs(p.stat().st_mtime - session_date.timestamp()) / 3600.0
                score += max(0.0, 5.0 - diff_hours)

            if score > best_score:
                best_score = score
                best_file = p

        if best_file:
            active_file = best_file
            match_method = "telemetry_matched" if (tel_bb is not None and best_score >= 10.0) else "session_timestamp"
        else:
            active_file = valid_candidates[0]
            match_method = "session_timestamp"

    if not active_file:
        return None

    sections = parse_svm_file(active_file)

    controls = sections.get("CONTROLS", {})
    suspension = sections.get("SUSPENSION", {})
    rear_wing = sections.get("REARWING", {})
    front_wing = sections.get("FRONTWING", {})
    engine = sections.get("ENGINE", {})
    driveline = sections.get("DRIVELINE", {})
    fl = sections.get("FRONTLEFT", {})
    fr = sections.get("FRONTRIGHT", {})
    rl = sections.get("REARLEFT", {})
    rr = sections.get("REARRIGHT", {})

    def _val(sec: dict[str, tuple[str, str]], key: str, default: str = "") -> str:
        return sec.get(key, (default, ""))[0]

    def _comment(sec: dict[str, tuple[str, str]], key: str, default: str = "") -> str:
        return sec.get(key, ("", default))[1]

    def _float_from_str(s: str, default: float = 0.0) -> float:
        m = re.search(r"[-+]?[0-9]*\.?[0-9]+", s)
        return float(m.group(0)) if m else default

    # Brake Bias: e.g. RearBrakeSetting=37//47.8:52.2
    bb_comment = _comment(controls, "RearBrakeSetting")
    bb_match = re.search(r"([\d\.]+):", bb_comment)
    brake_bias_pct = float(bb_match.group(1)) if bb_match else 50.0

    # TC and ABS
    tc_dial = int(_val(controls, "TractionControlMapSetting", "6") or 6)
    tc2_dial = int(_val(controls, "TCPowerCutMapSetting", str(tc_dial)) or tc_dial)
    abs_dial = int(_val(controls, "AntilockBrakeSystemMapSetting", "9") or 9)

    # Engine mixture / ECU map
    ecu_map = int(_val(engine, "EngineMixtureSetting", "1") or 1)

    # Wings
    fw = int(_val(front_wing, "FWSetting", "0") or 0)
    rw_raw = _val(rear_wing, "RWSetting", "6")
    rw = int(rw_raw) if rw_raw.isdigit() else 6

    # Ride Heights: e.g. RideHeightSetting=1//5.1 cm -> 51.0 mm
    rh_fl_cm = _float_from_str(_comment(fl, "RideHeightSetting"), 5.1)
    rh_rl_cm = _float_from_str(_comment(rl, "RideHeightSetting"), 6.7)
    rh_front_mm = round(rh_fl_cm * 10.0, 1)
    rh_rear_mm = round(rh_rl_cm * 10.0, 1)
    rake_mm = round(rh_rear_mm - rh_front_mm, 1)

    # ARB
    arb_f_raw = _val(suspension, "FrontAntiSwaySetting", "6")
    arb_r_raw = _val(suspension, "RearAntiSwaySetting", "2")
    arb_f = int(arb_f_raw) if arb_f_raw.isdigit() else 6
    arb_r = int(arb_r_raw) if arb_r_raw.isdigit() else 2

    # Camber: e.g. CamberSetting=24//-2.0 deg
    camber_f = round(_float_from_str(_comment(fl, "CamberSetting"), -2.0), 2)
    camber_r = round(_float_from_str(_comment(rl, "CamberSetting"), -1.5), 2)

    # Toe: e.g. FrontToeInSetting=13//-0.188 deg, RearToeInSetting=17//0.063 deg
    toe_f = round(_float_from_str(_comment(suspension, "FrontToeInSetting"), -0.19), 2)
    toe_r = round(_float_from_str(_comment(suspension, "RearToeInSetting"), 0.06), 2)

    # Diff preload: e.g. DiffPreloadSetting=100//150 Nm
    preload_comment = _comment(driveline, "DiffPreloadSetting")
    preload_nm = int(_float_from_str(preload_comment, 150.0))

    # Cold tyre pressures: e.g. PressureSetting=0//136 kPa
    # 136 kPa * 0.14503774 = 19.72 psi
    kpa_to_psi = 0.14503774

    def _parse_pressure_psi(corner_sec: dict[str, tuple[str, str]]) -> float:
        comm = _comment(corner_sec, "PressureSetting")
        kpa = _float_from_str(comm, 136.0)
        return round(kpa * kpa_to_psi, 1)

    cold_pressures = {
        "FL": _parse_pressure_psi(fl),
        "FR": _parse_pressure_psi(fr),
        "RL": _parse_pressure_psi(rl),
        "RR": _parse_pressure_psi(rr),
    }

    return {
        "setup_file_name": active_file.name,
        "setup_source": "actual_file",
        "has_garage_setup": True,
        "match_method": match_method,
        "available_setups": available_setups,
        "electronics": {
            "tc1": tc_dial,
            "tc2": tc2_dial,
            "abs": abs_dial,
            "brake_bias": brake_bias_pct,
            "ecu_map": ecu_map,
        },
        "aero": {
            "front_splitter": fw,
            "rear_wing": rw,
            "ride_height_front_mm": rh_front_mm,
            "ride_height_rear_mm": rh_rear_mm,
            "rake_mm": rake_mm,
        },
        "chassis": {
            "arb_front": arb_f,
            "arb_rear": arb_r,
            "camber_front_deg": camber_f,
            "camber_rear_deg": camber_r,
            "toe_front_deg": toe_f,
            "toe_rear_deg": toe_r,
            "preload_diff_nm": preload_nm,
        },
        "tyres": {
            "pressures_cold": cold_pressures,
        },
    }
