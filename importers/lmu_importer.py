"""
Le Mans Ultimate (LMU) and rFactor 2 session and results importer for IdoRacing Analytics.
Parses XML results from UserData/Log/Results with laps, sectors, and car metadata.
"""

import contextlib
import os
import xml.etree.ElementTree as ET
from datetime import datetime

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
                lap_text = elem.text.strip() if elem.text else ""
                et_str = elem.attrib.get("et", "")

                lap_time = 0.0
                try:
                    lap_time = float(lap_text)
                except ValueError:
                    # In some sessions, lap duration is delta between et timestamps
                    try:
                        curr_et = float(et_str)
                        if prev_et > 0 and curr_et > prev_et:
                            lap_time = curr_et - prev_et
                        prev_et = curr_et
                    except ValueError:
                        pass

                s1 = float(elem.attrib.get("s1", 0.0)) if "s1" in elem.attrib else 0.0
                s2 = float(elem.attrib.get("s2", 0.0)) if "s2" in elem.attrib else 0.0
                s3 = float(elem.attrib.get("s3", 0.0)) if "s3" in elem.attrib else 0.0
                sectors = [s1, s2, s3] if (s1 > 0 and s2 > 0) else []

                if lap_time > 15.0:  # valid lap threshold
                    laps.append(
                        Lap(
                            lap_number=lap_num,
                            lap_time=round(lap_time, 3),
                            sector_times=sectors,
                            is_valid=True,
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
