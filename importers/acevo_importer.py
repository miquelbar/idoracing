"""
Assetto Corsa EVO (ACE) session results importer for IdoRacing Analytics.
Parses *.sessionresults.json from Saved Games/ACE/Results: lap times and sectors only,
no telemetry channels. Laps without a trace are filled with generated telemetry
downstream, exactly like LMU lap-times-only sessions.
"""

import json
import os
import re
from datetime import datetime

from domain.session import Lap, Session

# ACE names result files YYMMDD-HHMM_<mode>.sessionresults.json.
_FILENAME_DATE = re.compile(r"^(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})")


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
