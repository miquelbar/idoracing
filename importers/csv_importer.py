"""
CSV Telemetry Importer for IdoRacing Analytics.
Allows importing telemetry data exported from MoTeC i2, third-party apps, or synthetic logs.
"""

import os
from datetime import datetime

import numpy as np
import pandas as pd

from domain.session import Lap, Session


class CSVImporter:
    """Importer for CSV-formatted driving telemetry sessions."""

    CANONICAL_COLUMNS = {
        "speed": ["speed", "corr speed", "velocity", "gps speed"],
        "throttle": ["throttle", "throttle pos", "gas", "accelerator"],
        "brake": ["brake", "brake pos", "braking"],
        "gear": ["gear", "gear pos"],
        "lat_accel": ["lat_accel", "g force lat", "g_lat", "glat", "lateral_acceleration"],
        "long_accel": ["long_accel", "g force long", "g_lon", "glong", "longitudinal_acceleration"],
        "time": ["time", "lap time", "elapsed time", "timestamp"],
        "distance": ["distance", "lap distance", "track distance", "dist"],
        "steer_angle": ["steer_angle", "steered angle", "steerangle", "steering"],
        "rpm": ["rpm", "rpms", "engine rpm", "engine_rpm"],
        "lap": ["lap", "lap number", "lap_number"],
    }

    def __init__(self, filepath: str, car: str = "Unknown car", track: str = "Unknown track"):
        self.filepath = filepath
        self.car = car
        self.track = track
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

    def parse(self) -> Session:
        """Parse CSV file and construct a Session object."""
        # Detect delimiter and potential unit row
        df = pd.read_csv(self.filepath)

        # Check if row 0 has units (e.g. non-numeric while row 1 is numeric)
        if len(df) > 1 and df.iloc[0].dtype == object:
            try:
                pd.to_numeric(df.iloc[0].dropna())
            except (ValueError, TypeError):
                # Row 0 likely contains units, skip it and reload
                df = pd.read_csv(self.filepath, skiprows=[1])

        # Normalize column names
        normalized_cols = {col: col.strip().lower() for col in df.columns}
        df.rename(columns=normalized_cols, inplace=True)

        telemetry: dict[str, list[float]] = {}
        for canonical, variants in self.CANONICAL_COLUMNS.items():
            matched_col = None
            for variant in variants:
                if variant in df.columns:
                    matched_col = variant
                    break
            if matched_col is not None:
                numeric_series = pd.to_numeric(df[matched_col], errors="coerce").fillna(0.0)
                telemetry[canonical] = numeric_series.tolist()

        # If required channels are missing, provide sane defaults
        n_samples = len(df)
        if "time" not in telemetry:
            telemetry["time"] = [i * 0.05 for i in range(n_samples)]
        if "distance" not in telemetry and "speed" in telemetry:
            # Approximate distance from speed in km/h: dist += (speed / 3.6) * dt
            times = telemetry["time"]
            speeds = telemetry["speed"]
            dist_acc = 0.0
            dist_list = [0.0]
            for i in range(1, len(times)):
                dt = max(times[i] - times[i - 1], 0.001)
                dist_acc += (speeds[i] / 3.6) * dt
                dist_list.append(dist_acc)
            telemetry["distance"] = dist_list

        for req in ["speed", "throttle", "brake", "gear", "lat_accel", "long_accel"]:
            if req not in telemetry:
                telemetry[req] = [0.0] * n_samples

        # Segment into laps if lap column is present
        laps: list[Lap] = []
        if "lap" in telemetry:
            lap_arr = np.array(telemetry["lap"])
            unique_laps = np.unique(lap_arr)
            for l_num in unique_laps:
                indices = np.where(lap_arr == l_num)[0]
                if len(indices) < 20:
                    continue
                lap_telemetry = {k: [telemetry[k][idx] for idx in indices] for k in telemetry}
                for channel in ("time", "distance"):
                    if channel in lap_telemetry:
                        origin = lap_telemetry[channel][0]
                        lap_telemetry[channel] = [v - origin for v in lap_telemetry[channel]]
                t_arr = lap_telemetry["time"]
                lap_time = float(t_arr[-1] - t_arr[0]) if len(t_arr) > 1 else 0.0
                laps.append(Lap(
                    lap_number=int(l_num),
                    lap_time=lap_time,
                    is_valid=True,
                    telemetry=lap_telemetry,
                ))

        # If no explicit laps found, treat whole file as lap 1
        if not laps and n_samples > 0:
            total_time = float(telemetry["time"][-1] - telemetry["time"][0]) if len(telemetry["time"]) > 1 else 0.0
            laps.append(Lap(
                lap_number=1,
                lap_time=total_time,
                is_valid=True,
                telemetry=telemetry,
            ))

        filename = os.path.basename(self.filepath)
        session_id = os.path.splitext(filename)[0]

        return Session(
            session_id=session_id,
            car=self.car,
            track=self.track,
            date=datetime.now(),
            telemetry=telemetry,
            laps=laps,
            source_file=self.filepath,
        )
