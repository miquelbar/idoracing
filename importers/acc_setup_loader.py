"""
Assetto Corsa Competizione setup loader.
Reads user setup JSON files from Steam Proton compatdata or native Documents directory.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def find_acc_setups_dir() -> Path | None:
    """Locate the ACC Setups directory in Steam Proton prefixes or local Documents."""
    env_dir = os.environ.get("ACC_SETUPS_DIR")
    if env_dir and Path(env_dir).is_dir():
        return Path(env_dir)

    candidates = [
        # Linux / Steam Proton default prefix
        Path.home()
        / ".local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/Assetto Corsa Competizione/Setups",
        # Windows / Native Documents
        Path.home() / "Documents/Assetto Corsa Competizione/Setups",
        # Alternative Steam libraries
        Path.home()
        / ".steam/steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/Assetto Corsa Competizione/Setups",
    ]
    for c in candidates:
        if c.is_dir():
            return c
    return None


def _match_dir(parent: Path, query: str) -> Path | None:
    """Fuzzy match directory name by stripped alphanumeric tokens."""
    if not parent.is_dir() or not query:
        return None
    q = query.lower().replace(" ", "").replace("_", "").replace("-", "")
    for d in parent.iterdir():
        if not d.is_dir():
            continue
        name_clean = d.name.lower().replace(" ", "").replace("_", "").replace("-", "")
        if name_clean in q or q in name_clean:
            return d
    tokens = [t for t in query.lower().replace("_", " ").replace("-", " ").split() if len(t) > 2]
    for d in parent.iterdir():
        if not d.is_dir():
            continue
        name_lower = d.name.lower()
        if any(tok in name_lower for tok in tokens):
            return d
    return None


def load_acc_setup(car_name: str, track_name: str) -> dict[str, Any] | None:
    """
    Find and parse the active ACC setup file for a given car and track.
    Returns normalized dictionary with electronics, aero, chassis, tyres, and metadata.
    """
    root = find_acc_setups_dir()
    if not root:
        return None

    car_dir = _match_dir(root, car_name)
    if not car_dir:
        return None

    track_dir = _match_dir(car_dir, track_name)
    if not track_dir:
        return None

    setup_files = sorted(track_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not setup_files:
        return None

    active_file = setup_files[0]
    try:
        with open(active_file, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
        logger.warning("Failed to parse ACC setup file %s: %s", active_file, exc)
        return None

    basic = data.get("basicSetup", {})
    adv = data.get("advancedSetup", {})
    elec = basic.get("electronics", {})
    aero = adv.get("aeroBalance", {})
    mech = adv.get("mechanicalBalance", {})
    drivetrain = adv.get("drivetrain", {})
    alignment = basic.get("alignment", {})

    # Calculate real brake bias from clicks:
    # In ACC GT3, base is usually 48.0% + (clicks * 0.2%)
    bb_clicks = mech.get("brakeBias", 30)
    brake_bias_pct = round(48.0 + (bb_clicks * 0.2), 1)

    # Ride heights in ACC are in mm offset from baseline
    rh = aero.get("rideHeight", [5, 11, 13, 18])
    rh_front = 50.0 + (rh[0] if len(rh) > 0 else 5) * 1.0
    rh_rear = 65.0 + (rh[2] if len(rh) > 2 else 13) * 1.0

    camber = alignment.get("staticCamber", [-4.0, -4.0, -3.0, -3.0])
    camber_f = round(float(camber[0]), 2) if len(camber) > 0 else -3.8
    camber_r = round(float(camber[2]), 2) if len(camber) > 2 else -3.0

    return {
        "setup_file_name": active_file.name,
        "setup_source": "actual_file",
        "has_garage_setup": True,
        "electronics": {
            "tc1": int(elec.get("tC1", 1)),
            "tc2": int(elec.get("tC2", 1)) if "tC2" in elec else None,
            "abs": int(elec.get("abs", 1)),
            "brake_bias": brake_bias_pct,
            "ecu_map": int(elec.get("eCUMap", 1)),
        },
        "aero": {
            "front_splitter": int(aero.get("splitter", 0)),
            "rear_wing": int(aero.get("rearWing", 0)),
            "ride_height_front_mm": rh_front,
            "ride_height_rear_mm": rh_rear,
            "rake_mm": round(rh_rear - rh_front, 1),
        },
        "chassis": {
            "arb_front": int(mech.get("aRBFront", 0)),
            "arb_rear": int(mech.get("aRBRear", 0)),
            "camber_front_deg": camber_f,
            "camber_rear_deg": camber_r,
            "toe_front_deg": -0.10,
            "toe_rear_deg": 0.15,
            "preload_diff_nm": int(drivetrain.get("preload", 0) * 10) or 90,
        },
    }
