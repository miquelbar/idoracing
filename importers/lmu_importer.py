"""
Le Mans Ultimate (LMU) and rFactor 2 session and results importer for IdoRacing Analytics.
Parses XML results from UserData/Log/Results with laps, sectors, and car metadata.
"""

import contextlib
import glob
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

from domain.session import Lap, Session


class LMUImporter:
    """Importer for Le Mans Ultimate (LMU) session result files."""

    def __init__(self, filepath: str):
        self.filepath = filepath
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

    def parse(self) -> Session:
        """Parse LMU session XML into a Session domain entity."""
        tree = ET.parse(self.filepath)
        root = tree.getroot()

        track = root.findtext(".//TrackVenue") or root.findtext(".//TrackCourse") or "Unknown track"
        time_str = root.findtext(".//TimeString") or ""

        date_val = datetime.now()
        if time_str:
            with contextlib.suppress(ValueError):
                date_val = datetime.strptime(time_str, "%Y/%m/%d %H:%M:%S")

        # Locate player driver (<isPlayer>1</isPlayer>) or fallback to first driver
        player_driver = None
        for d in root.findall(".//Driver"):
            is_player = d.findtext("isPlayer")
            if is_player == "1":
                player_driver = d
                break
        if player_driver is None:
            player_driver = root.find(".//Driver")

        car = "Unknown car"
        laps: list[Lap] = []

        if player_driver is not None:
            car = player_driver.findtext("CarType") or player_driver.findtext("VehName") or car

            prev_et = 0.0
            lap_elements = player_driver.findall("Lap")
            for elem in lap_elements:
                lap_num = int(elem.attrib.get("num", 1))
                lap_text = (elem.text or "").strip()
                et_str = elem.attrib.get("et", "")

                curr_et = 0.0
                if et_str and et_str != "--.---":
                    with contextlib.suppress(ValueError):
                        curr_et = float(et_str)

                lap_time = 0.0
                is_valid = False
                if lap_text:
                    try:
                        lap_time = float(lap_text)
                        # On official circuit racing (WEC / LMU), completed flying laps are >= 45s
                        if lap_time >= 45.0:
                            is_valid = True
                    except ValueError:
                        # rFactor writes "--.----" for laps it voided itself: skip in primary pass
                        lap_time = 0.0
                elif curr_et > 0 and prev_et > 0 and curr_et > prev_et:
                    # Files without lap text still give the crossing time; a lap is the
                    # delta between two consecutive numeric crossings (e.g. pit exit / outlap).
                    lap_time = curr_et - prev_et
                    is_valid = False

                if curr_et > 0:
                    prev_et = curr_et

                s1 = float(elem.attrib.get("s1", 0.0)) if "s1" in elem.attrib else 0.0
                s2 = float(elem.attrib.get("s2", 0.0)) if "s2" in elem.attrib else 0.0
                s3 = float(elem.attrib.get("s3", 0.0)) if "s3" in elem.attrib else 0.0
                sectors = [s1, s2, s3] if (s1 > 0 and s2 > 0) else []

                if lap_time > 15.0:
                    laps.append(
                        Lap(
                            lap_number=lap_num,
                            lap_time=round(lap_time, 3),
                            sector_times=sectors,
                            is_valid=is_valid,
                            is_outlap=not is_valid,
                        )
                    )

            # Fallback for practice/stint sessions where all laps were outlaps or voided by rFactor/LMU ("--.----")
            if not laps and lap_elements:
                prev_et = 0.0
                for elem in lap_elements:
                    lap_num = int(elem.attrib.get("num", 1))
                    et_str = elem.attrib.get("et", "")
                    s1 = float(elem.attrib.get("s1", 0.0)) if "s1" in elem.attrib else 0.0
                    s2 = float(elem.attrib.get("s2", 0.0)) if "s2" in elem.attrib else 0.0
                    s3 = float(elem.attrib.get("s3", 0.0)) if "s3" in elem.attrib else 0.0
                    sectors = [s1, s2, s3] if (s1 > 0 and s2 > 0) else []

                    lap_time = 0.0
                    if s1 > 0 and s2 > 0 and s3 > 0:
                        lap_time = s1 + s2 + s3
                    elif et_str and et_str != "--.---":
                        try:
                            curr_et = float(et_str)
                            if prev_et > 0 and curr_et > prev_et:
                                lap_time = curr_et - prev_et
                            elif curr_et > 15.0:
                                lap_time = curr_et
                            prev_et = curr_et
                        except ValueError:
                            pass

                    if lap_time > 15.0:
                        laps.append(
                            Lap(
                                lap_number=lap_num,
                                lap_time=round(lap_time, 3),
                                sector_times=sectors,
                                is_valid=False,
                                is_outlap=True,
                            )
                        )
                # If still no lap met >15.0s, keep at least one placeholder lap so the session is recognized
                if not laps:
                    laps.append(
                        Lap(
                            lap_number=1,
                            lap_time=60.0,
                            sector_times=[],
                            is_valid=False,
                            is_outlap=True,
                            is_incomplete=True,
                        )
                    )

        filename = os.path.basename(self.filepath)
        session_id = f"lmu_{os.path.splitext(filename)[0]}"

        return Session(
            session_id=session_id,
            car=car,
            track=track,
            date=date_val,
            telemetry={},
            laps=laps,
            source_file=self.filepath,
            simulator="Le Mans Ultimate",
        )


def find_lmu_results_dir(csv_filepath: str | None = None) -> str | None:
    """Find Le Mans Ultimate UserData/Log/Results directory across Linux and Windows."""
    env_dir = os.environ.get("LMU_RESULTS_DIR")
    if env_dir and os.path.isdir(env_dir):
        return env_dir

    candidates: list[str] = [
        os.path.expanduser("~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results"),
        os.path.expanduser("~/.steam/steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results"),
        os.path.expanduser("~/.steam/root/steamapps/common/Le Mans Ultimate/UserData/Log/Results"),
        r"C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Log\Results",
        r"C:\Steam\steamapps\common\Le Mans Ultimate\UserData\Log\Results",
    ]

    # If csv_filepath is inside Proton prefix (compatdata/2399420/...)
    if csv_filepath:
        norm = os.path.normpath(csv_filepath)
        parts = norm.split(os.sep)
        for i, part in enumerate(parts):
            if part == "compatdata" and i > 0:
                steamapps = os.sep.join(parts[:i])
                candidate = os.path.join(steamapps, "common", "Le Mans Ultimate", "UserData", "Log", "Results")
                candidates.insert(0, candidate)
                break

    for cand in candidates:
        if os.path.isdir(cand):
            return cand
    return None


def resolve_lmu_session_info(
    csv_filepath: str | None = None,
    date_hint: datetime | None = None,
) -> dict[str, Any]:
    """Resolve car, track, and official best lap from LMU XML session results."""
    results_dir = find_lmu_results_dir(csv_filepath)
    if not results_dir or not os.path.isdir(results_dir):
        return {}

    xml_files = glob.glob(os.path.join(results_dir, "*.xml"))
    if not xml_files:
        return {}

    if date_hint:

        def _time_diff(f: str) -> float:
            try:
                stem = os.path.basename(f)
                m = re.match(r"(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})", stem)
                if m:
                    y, mo, d, h, mi, s = (int(x) for x in m.groups())
                    f_date = datetime(y, mo, d, h, mi, s)
                    return abs((f_date - date_hint).total_seconds())
            except (ValueError, TypeError, OSError):
                pass
            try:
                return abs(os.path.getmtime(f) - date_hint.timestamp())
            except OSError:
                return float("inf")

        xml_files.sort(key=_time_diff)
        if _time_diff(xml_files[0]) > 7200:
            return {}
    else:
        xml_files.sort(key=os.path.getmtime, reverse=True)

    for xf in xml_files:
        try:
            importer = LMUImporter(xf)
            session = importer.parse()
            if session.track and session.car and session.car != "Unknown car":
                valid_laps = [l for l in session.laps if l.is_valid and l.lap_time >= 45.0]
                best_lap = min((l.lap_time for l in valid_laps), default=0.0)
                best_lap_obj = next((l for l in valid_laps if l.lap_time == best_lap), None)
                splits = best_lap_obj.sector_times if best_lap_obj else []
                return {
                    "track": session.track,
                    "car": session.car,
                    "best_lap": best_lap,
                    "splits": splits,
                    "result_file": xf,
                }
        except (ET.ParseError, OSError, ValueError, KeyError, AttributeError):
            continue

    return {}
