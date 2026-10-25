"""
Assetto Corsa EVO (ACE) session results importer for IdoRacing Analytics.
Parses *.sessionresults.json from Saved Games/ACE/Results: lap times and sectors only,
no telemetry channels. Laps without a trace are filled with generated telemetry
downstream, exactly like LMU lap-times-only sessions.
"""

import glob
import json
import os
import re
from datetime import datetime
from typing import Any

from domain.session import Lap, Session

# ACE names result files YYMMDD-HHMM_<mode>.sessionresults.json.
_FILENAME_DATE = re.compile(r"^(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})")


def find_acevo_saved_games_dir(reference_filepath: str | None = None) -> str | None:
    """Locate the Saved Games/ACE folder from a given reference path, Steam prefix, or host paths."""
    candidates = []
    if reference_filepath:
        norm = os.path.normpath(reference_filepath)
        if "/drive_c/" in norm:
            prefix_root = norm.split("/drive_c/")[0]
            candidates.append(os.path.join(prefix_root, "drive_c", "users", "steamuser", "Saved Games", "ACE"))
        elif "\\drive_c\\" in norm:
            prefix_root = norm.split("\\drive_c\\")[0]
            candidates.append(os.path.join(prefix_root, "drive_c", "users", "steamuser", "Saved Games", "ACE"))

    candidates.append(
        os.path.expanduser(
            "~/.local/share/Steam/steamapps/compatdata/3058630/pfx/drive_c/users/steamuser/Saved Games/ACE"
        )
    )
    candidates.append(os.path.expanduser("~/Saved Games/ACE"))

    for c in candidates:
        if os.path.isdir(c):
            return c
    return None


def resolve_acevo_session_info(csv_filepath: str | None = None, date_hint: datetime | None = None) -> dict[str, Any]:
    """Extract circuit and car metadata for AC EVO from session results or replays."""
    ace_dir = find_acevo_saved_games_dir(csv_filepath)
    if not ace_dir:
        return {}

    results_dir = os.path.join(ace_dir, "Results")
    if os.path.isdir(results_dir):
        json_files = glob.glob(os.path.join(results_dir, "*.sessionresults.json"))
        if json_files:
            if date_hint:

                def _time_diff(f: str) -> float:
                    try:
                        stem = os.path.basename(f)
                        m = _FILENAME_DATE.match(stem)
                        if m:
                            yy, mo, dd, hh, mi = (int(g) for g in m.groups())
                            f_date = datetime(2000 + yy, mo, dd, hh, mi)
                            return abs((f_date - date_hint).total_seconds())
                    except (ValueError, TypeError, OSError):
                        pass
                    return abs(os.path.getmtime(f) - date_hint.timestamp())

                json_files.sort(key=_time_diff)
            else:
                json_files.sort(key=os.path.getmtime, reverse=True)

            for jf in json_files:
                try:
                    with open(jf, encoding="utf-8") as f:
                        data = json.load(f)
                    track = data.get("track")
                    drivers = data.get("drivers", [])
                    driver = next((d for d in drivers if d.get("is_current_driver")), None) or (
                        drivers[0] if drivers else {}
                    )
                    car = driver.get("car_name")
                    best_lap = _parse_time_str(str(driver.get("best_lap") or ""))
                    splits = [_parse_time_str(str(s)) for s in (driver.get("splits") or [])]
                    splits = [s for s in splits if s > 0.0]
                    if track and car:
                        return {
                            "track": track,
                            "layout": data.get("layout", ""),
                            "car": car,
                            "best_lap": best_lap,
                            "splits": splits,
                            "result_file": jf,
                        }
                except (json.JSONDecodeError, OSError, UnicodeDecodeError, KeyError, TypeError):
                    continue

    # 2. Check Replay folder: Replay/Temp/ACEVO_<timestamp>_*_<car>_<track>.rpy
    replay_dir = os.path.join(ace_dir, "Replay", "Temp")
    if os.path.isdir(replay_dir):
        rpys = sorted(glob.glob(os.path.join(replay_dir, "*.rpy")), key=os.path.getmtime, reverse=True)
        for rpy in rpys:
            base = os.path.basename(rpy)
            if base.endswith(".rpy"):
                base = base[:-4]
            parts = base.split("_")
            if len(parts) >= 4 and parts[0] == "ACEVO":
                rest = "_".join(parts[3:])
                for t_candidate in ["Red Bull Ring", "Monza", "Imola", "Spa", "Nurburgring", "Brands Hatch"]:
                    if t_candidate.lower() in rest.lower():
                        car_part = rest[: rest.lower().rfind(t_candidate.lower())].rstrip("_")
                        return {"track": t_candidate, "car": car_part}

    return {}


def _parse_time_str(value: str) -> float:
    """Parse 'MM:SS.mmm' or 'H:MM:SS.mmm' into seconds; empty or invalid reads as 0."""
    parts = value.strip().split(":")
    if not parts or any(not p for p in parts):
        return 0.0
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return 0.0
    seconds = 0.0
    for n in nums:
        seconds = seconds * 60.0 + n
    return seconds


class ACEVOImporter:
    """Importer for Assetto Corsa EVO session result files (*.sessionresults.json)."""

    def __init__(self, filepath: str):
        self.filepath = filepath
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

    def parse(self) -> Session:
        """Parse an AC EVO session results JSON into a Session domain entity."""
        with open(self.filepath, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or not isinstance(data.get("drivers"), list):
            raise ValueError(f"{os.path.basename(self.filepath)} is not an AC EVO session results file")

        track = str(data.get("track") or "Unknown track")
        drivers = data["drivers"]
        driver = next((d for d in drivers if d.get("is_current_driver")), None) or (drivers[0] if drivers else {})

        car = str(driver.get("car_name") or "Unknown car")
        best_lap = _parse_time_str(str(driver.get("best_lap") or ""))
        sectors = [_parse_time_str(str(s)) for s in (driver.get("splits") or [])]
        sectors = [s for s in sectors if s > 0.0]

        # The results file only keeps the best lap's time and its sector splits.
        laps: list[Lap] = []
        if best_lap > 15.0:  # valid lap threshold, same as the LMU importer
            laps.append(
                Lap(
                    lap_number=1,
                    lap_time=round(best_lap, 3),
                    sector_times=sectors,
                    is_valid=True,
                )
            )

        filename = os.path.basename(self.filepath)
        stem = os.path.splitext(filename)[0]
        if stem.endswith(".sessionresults"):
            stem = stem[: -len(".sessionresults")]
        return Session(
            session_id=f"acevo_{stem}",
            car=car,
            track=track,
            date=self._session_date(stem),
            telemetry={},
            laps=laps,
            source_file=self.filepath,
            simulator="Assetto Corsa EVO",
        )

    def _session_date(self, stem: str) -> datetime:
        """Read the timestamp from the YYMMDD-HHMM filename; fall back to the file's mtime."""
        m = _FILENAME_DATE.match(stem)
        if m:
            yy, mo, dd, hh, mi = (int(g) for g in m.groups())
            return datetime(2000 + yy, mo, dd, hh, mi)
        return datetime.fromtimestamp(os.path.getmtime(self.filepath))
