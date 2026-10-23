"""
CSV Telemetry Importer for IdoRacing Analytics.
Reads telemetry exported from MoTeC i2, third-party apps or the IdoRacing recorder. Leading
"# key: value" lines carry session metadata (simulator, track, car), as the recorder writes them.
"""

import os
from datetime import datetime

import numpy as np
import pandas as pd

from domain.session import Lap, Session
from importers.laps import distance_covered, without_boundary_wrap


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
        "distance": ["distance", "track distance", "dist"],
        "lap_distance": ["lap_distance", "lap distance"],
        "x": ["x", "pos_x", "car coord x"],
        "y": ["y", "pos_y", "car coord y"],
        "lap_valid": ["lap_valid"],
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
        metadata = self._read_metadata()
        df = pd.read_csv(self.filepath, comment="#")

        # Check if row 0 has units (e.g. non-numeric while row 1 is numeric)
        if len(df) > 1 and df.iloc[0].dtype == object:
            try:
                pd.to_numeric(df.iloc[0].dropna())
            except (ValueError, TypeError):
                # Row 0 likely contains units, skip it and reload
                df = pd.read_csv(self.filepath, comment="#", skiprows=[1])

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

        # Lap distance is a position along the track, so laps keep it as recorded instead of starting at 0.
        track_position = "lap_distance" in telemetry and max(telemetry.get("lap_distance", [0.0])) > 0.0
        if track_position:
            telemetry["distance"] = telemetry.pop("lap_distance")
        else:
            telemetry.pop("lap_distance", None)
        lap_valid = telemetry.pop("lap_valid", None)

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
                t0 = lap_telemetry["time"][0]
                lap_telemetry["time"] = [v - t0 for v in lap_telemetry["time"]]
                if track_position:
                    lap_telemetry["distance"] = without_boundary_wrap(lap_telemetry["distance"])
                else:
                    d0 = lap_telemetry["distance"][0]
                    lap_telemetry["distance"] = [v - d0 for v in lap_telemetry["distance"]]
                t_arr = lap_telemetry["time"]
                lap_time = float(t_arr[-1] - t_arr[0]) if len(t_arr) > 1 else 0.0
                # Hybrid lap_valid rule: the recorder's flag is unreliable when it
                # marks most samples invalid (practice/qualifying), so only trust it
                # when at least half the samples are valid — then a single invalid
                # sample invalidates the whole lap. The distance filter below still
                # runs as a final arbiter for partial laps.
                is_valid = True
                if lap_valid is not None:
                    lap_valid_samples = [lap_valid[idx] for idx in indices]
                    valid_fraction = sum(1 for v in lap_valid_samples if v >= 1) / len(lap_valid_samples)
                    if valid_fraction >= 0.5:
                        is_valid = all(v >= 1 for v in lap_valid_samples)
                laps.append(
                    Lap(
                        lap_number=int(l_num),
                        lap_time=lap_time,
                        is_valid=is_valid,
                        telemetry=lap_telemetry,
                    )
                )
            # Always filter partial laps by distance covered, regardless of whether
            # we have a real track-position channel or a dead-reckoned distance.
            # A lap is invalid when it covers less than 70% or more than 130% of
            # the median span (out-laps, in-laps, and pit-inclusive laps).
            if len(laps) > 1:
                spans = [distance_covered(lap.telemetry or {}) for lap in laps]
                ref_span = float(np.median(spans))
                for lap, span in zip(laps, spans, strict=True):
                    if span < 0.7 * ref_span or span > 1.3 * ref_span:
                        lap.is_valid = False

        # If no explicit laps found, treat whole file as lap 1
        if not laps and n_samples > 0:
            total_time = float(telemetry["time"][-1] - telemetry["time"][0]) if len(telemetry["time"]) > 1 else 0.0
            laps.append(
                Lap(
                    lap_number=1,
                    lap_time=total_time,
                    is_valid=True,
                    telemetry=telemetry,
                )
            )

        filename = os.path.basename(self.filepath)
        session_id = os.path.splitext(filename)[0]

        return Session(
            session_id=session_id,
            car=metadata.get("car", self.car),
            track=metadata.get("track", self.track),
            date=datetime.now(),
            telemetry=telemetry,
            laps=laps,
            source_file=self.filepath,
            simulator=metadata.get("simulator"),
        )

    def _read_metadata(self) -> dict[str, str]:
        metadata: dict[str, str] = {}
        with open(self.filepath, encoding="utf-8") as f:
            for line in f:
                if not line.startswith("#"):
                    break
                key, sep, value = line[1:].partition(":")
                if sep:
                    metadata[key.strip()] = value.strip()
        return metadata
