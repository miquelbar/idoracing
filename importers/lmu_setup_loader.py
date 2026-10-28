"""
Le Mans Ultimate setup loader.
Reads user setup .svm files from Steam common directory or Proton prefixes.
"""

from __future__ import annotations

import logging
import os
import re
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


def load_lmu_setup(car_name: str, track_name: str) -> dict[str, Any] | None:
    """
    Find and parse the active Le Mans Ultimate .svm setup file for a given car and track.
    Returns normalized dictionary with electronics, aero, chassis, tyres, and metadata.
    """
    root = find_lmu_setups_dir()
    if not root:
        return None

    track_dir = _match_lmu_track_dir(root, track_name)
    if not track_dir:
        return None

    svm_files = sorted(track_dir.glob("*.svm"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not svm_files:
        return None

    active_file = svm_files[0]
    car_tokens = [t for t in car_name.lower().replace("_", " ").replace("-", " ").split() if len(t) > 2]

    if car_tokens:
        for p in svm_files:
            try:
                with open(p, encoding="utf-8", errors="ignore") as f:
                    head = f.read(512).lower()
                    if any(tok in head for tok in car_tokens):
                        active_file = p
                        break
            except OSError:
                continue

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
