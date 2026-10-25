"""
Assetto Corsa EVO setup loader.
Decodes proprietary binary .carsetup files (Protobuf serialized) from
Saved Games/ACE/Car Setups/<Car>/<Track>/ or uploaded by the user.
"""

from __future__ import annotations

import logging
import os
import struct
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def find_acevo_setups_dir() -> Path | None:
    """Locate the AC EVO Car Setups directory in Steam Proton prefixes or local Saved Games."""
    env_dir = os.environ.get("ACEVO_SETUPS_DIR")
    if env_dir and Path(env_dir).is_dir():
        return Path(env_dir)

    candidates = [
        # Linux / Steam Proton default prefix (v0.7.1+)
        Path.home()
        / ".local/share/Steam/steamapps/compatdata/3058630/pfx/drive_c/users/steamuser/Saved Games/ACE/Car Setups",
        # Windows / Native Saved Games
        Path.home() / "Saved Games/ACE/Car Setups",
        # Legacy pre-0.7.1 path under Documents
        Path.home()
        / ".local/share/Steam/steamapps/compatdata/3058630/pfx/drive_c/users/steamuser/Documents/ACE/Car Setups",
        Path.home() / "Documents/ACE/Car Setups",
    ]
    for c in candidates:
        if c.is_dir():
            return c
    return None


def _evo_parse(data: bytes) -> list[dict[str, Any]]:
    """Decode raw Protobuf-encoded bytes into structured AST nodes."""
    out: list[dict[str, Any]] = []
    o = 0
    length = len(data)

    def rv() -> int | None:
        nonlocal o
        r = 0
        s = 0
        while o < length:
            x = data[o]
            o += 1
            r += (x & 0x7F) << s
            if not (x & 0x80):
                return r
            s += 7
            if s > 49:
                return None
        return None

    while o < length:
        tag = rv()
        if tag is None:
            break
        f = tag >> 3
        wt = tag & 0x07
        if f == 0 or f > 100000:
            break
        if wt == 0:  # Varint
            v = rv()
            if v is None:
                break
            out.append({"f": f, "t": "varint", "v": v})
        elif wt == 5:  # 32-bit float
            if o + 4 > length:
                break
            v = struct.unpack("<f", data[o : o + 4])[0]
            out.append({"f": f, "t": "f32", "v": v})
            o += 4
        elif wt == 1:  # 64-bit float / double
            if o + 8 > length:
                break
            v = struct.unpack("<d", data[o : o + 8])[0]
            out.append({"f": f, "t": "f64", "v": v})
            o += 8
        elif wt == 2:  # Length-delimited (nested message, packed floats, or string)
            ln = rv()
            if ln is None or o + ln > length:
                break
            chunk = data[o : o + ln]
            o += ln
            sub = _evo_parse(chunk) if ln > 0 else []
            sub_bad = not sub or any(n["t"] == "f64" for n in sub)
            done = False
            if sub_bad and ln > 0 and ln % 4 == 0:
                fl = []
                ok = True
                for i in range(0, ln, 4):
                    x = struct.unpack("<f", chunk[i : i + 4])[0]
                    if abs(x) > 1e8:
                        ok = False
                        break
                    fl.append(x)
                if ok:
                    out.append({"f": f, "t": "packed", "v": fl})
                    done = True
            if not done:
                if sub and not sub_bad and ln > 0:
                    out.append({"f": f, "t": "msg", "v": sub})
                else:
                    try:
                        s = chunk.decode("utf-8")
                        if all(32 <= ord(c) < 127 for c in s):
                            out.append({"f": f, "t": "str", "v": s})
                        else:
                            out.append({"f": f, "t": "bytes", "v": chunk})
                    except (UnicodeDecodeError, ValueError):
                        out.append({"f": f, "t": "bytes", "v": chunk})
        else:
            break
    return out


def _evo_flatten(nodes: list[dict[str, Any]], prefix: str = "", out: dict[str, Any] | None = None) -> dict[str, Any]:
    """Flatten hierarchical Protobuf nodes into dotted path keys with repeated indices."""
    if out is None:
        out = {}
    counts: dict[int, int] = {}
    for n in nodes:
        counts[n["f"]] = counts.get(n["f"], 0) + 1
    seen: dict[int, int] = {}
    for n in nodes:
        idx = ""
        if counts[n["f"]] > 1:
            k = seen.get(n["f"], 0)
            seen[n["f"]] = k + 1
            idx = f"[{k}]"
        path = f"{prefix}.{n['f']}{idx}" if prefix else f"{n['f']}{idx}"
        if n["t"] == "msg":
            _evo_flatten(n["v"], path, out)
        elif n["t"] == "packed":
            for i, x in enumerate(n["v"]):
                out[f"{path}[{i}]"] = x
        else:
            out[path] = n["v"]
    return out


def parse_carsetup_bytes(data: bytes, filename: str = "setup.carsetup") -> dict[str, Any] | None:
    """
    Parse raw .carsetup binary bytes and map into normalized setup dictionary.
    Maps verified engineering units: psi, degrees, N/m, mm, and percentages.
    """
    nodes = _evo_parse(data)
    if not nodes:
        return None
    flat = _evo_flatten(nodes)

    def _get_f(key: str, round_digits: int = 1) -> float | None:
        val = flat.get(key)
        if val is None or not isinstance(val, (int, float)):
            return None
        return round(float(val), round_digits)

    def _get_i(key: str) -> int | None:
        val = flat.get(key)
        if val is None or not isinstance(val, (int, float)):
            return None
        return int(round(val))

    car_id = flat.get("9")
    if isinstance(car_id, str):
        car_name = car_id.split("_preset")[0].replace("ks_", "").replace("_", " ").title()
    else:
        car_name = "Assetto Corsa EVO Car"

    rh_f = _get_f("6.2", 1)
    rh_r = _get_f("6.3", 1)
    rake = round(rh_r - rh_f, 1) if (rh_f is not None and rh_r is not None) else None

    return {
        "setup_file_name": filename,
        "car": car_name,
        "track": "",
        "electronics": {
            "tc1": _get_i("5.1"),
            "tc2": _get_i("5.2"),
            "abs": _get_i("5.3"),
            "brake_bias": _get_f("1.3.1", 1),
            "ecu_map": None,
        },
        "aero": {
            "front_splitter": None,
            "rear_wing": _get_f("6.5", 1),
            "ride_height_front_mm": rh_f,
            "ride_height_rear_mm": rh_r,
            "rake_mm": rake,
        },
        "chassis": {
            "arb_front": _get_f("1.1[0]", 1),
            "arb_rear": _get_f("1.1[1]", 1),
            "camber_front_deg": _get_f("4[0].2", 2),
            "camber_rear_deg": _get_f("4[2].2", 2),
            "toe_front_deg": _get_f("4[0].3", 2),
            "toe_rear_deg": _get_f("4[2].3", 2),
            "preload_diff_nm": _get_f("1.4.3", 1),
        },
        "tyres": {
            "pressures_cold": {
                "FL": _get_f("4[0].1", 1),
                "FR": _get_f("4[1].1", 1),
                "RL": _get_f("4[2].1", 1),
                "RR": _get_f("4[3].1", 1),
            }
        },
        "fuel_load_l": _get_f("7.1", 1),
    }


def parse_carsetup_file(file_path: str | Path) -> dict[str, Any] | None:
    """Read and parse a .carsetup file from disk."""
    p = Path(file_path)
    if not p.is_file():
        return None
    try:
        data = p.read_bytes()
        return parse_carsetup_bytes(data, filename=p.name)
    except (OSError, ValueError, TypeError) as exc:
        logger.warning("Failed to decode AC EVO carsetup %s: %s", p, exc)
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


def load_acevo_setup(car_name: str, track_name: str) -> dict[str, Any] | None:
    """
    Search and parse the most recent .carsetup file for a given car and track in AC EVO.
    """
    root = find_acevo_setups_dir()
    if not root:
        return None

    # Try Car/Track hierarchy
    car_dir = _match_dir(root, car_name)
    setup_files: list[Path] = []
    if car_dir:
        track_dir = _match_dir(car_dir, track_name)
        if track_dir:
            setup_files = sorted(
                list(track_dir.glob("*.carsetup")) + list(track_dir.glob("*.setup")),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
        if not setup_files:
            # Fallback to any setup inside car folder
            setup_files = sorted(
                list(car_dir.glob("**/*.carsetup")) + list(car_dir.glob("**/*.setup")),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )

    # General fallback: check any .carsetup files in root matching car
    if not setup_files:
        setup_files = sorted(
            list(root.glob("**/*.carsetup")) + list(root.glob("**/*.setup")),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )

    if not setup_files:
        return None

    active_file = setup_files[0]
    res = parse_carsetup_file(active_file)
    if res:
        res["track"] = track_name
    return res
