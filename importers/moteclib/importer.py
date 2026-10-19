import logging
import os
from typing import Any

import numpy as np

from domain.session import Lap, Session, SessionSummary
from importers.motec_binary import MoTeCLDParser, MoTeCLDXParser

logger = logging.getLogger(__name__)

CHANNEL_MAP = {
    "speed": ["SPEED", "Corr Speed", "speed", "Ground Speed"],
    "throttle": ["Throttle Pos", "THROTTLE", "throttle", "Accel Pedal Pos"],
    "brake": ["Brake Pos", "BRAKE", "brake", "Brake Pedal Pos"],
    "gear": ["GEAR", "gear", "Current Gear"],
    "lat_accel": ["G Force Lat", "G_LAT", "glat", "lat_accel", "Lateral Accel"],
    "long_accel": ["G Force Long", "G_LON", "glong", "long_accel", "Longitudinal Accel"],
    "steer_angle": ["Steered Angle", "STEERANGLE", "steer_angle", "Steering Angle"],
    "rpm": ["Engine RPM", "RPMS", "rpm"],
    "distance": ["Distance", "Lap Distance", "LAP_DIST", "distance"],
}
REQUIRED_CHANNELS = ("speed", "throttle", "brake", "gear", "lat_accel", "long_accel")

# A lap-distance channel drops back to ~0 at the line; anything smaller is GPS noise.
LAP_RESET_DROP_M = 500.0


def _resample(values: np.ndarray, n: int) -> np.ndarray:
    if len(values) == n:
        return values
    return np.interp(np.linspace(0.0, 1.0, n), np.linspace(0.0, 1.0, len(values)), values)


class MoTeCImporter:
    """
    Importer for MoTeC .ld/.ldx files from Assetto Corsa Competizione (ACC).
    """

    def __init__(self, file_path: str):
        self.file_path = file_path
        self._validate_file()

    def _validate_file(self):
        """
        Validate that the file exists and has a valid MoTeC format or supported extension.
        """
        valid_exts = (".ld", ".ldx", ".csv")
        if not self.file_path.lower().endswith(valid_exts):
            raise ValueError(f"Invalid file extension: {self.file_path}. Expected .ld, .ldx, or .csv")

        if not os.path.exists(self.file_path):
            raise FileNotFoundError(f"File not found: {self.file_path}")

    def parse(self) -> Session:
        """
        Parse the MoTeC file and return a Session object.
        """
        if self.file_path.lower().endswith(".csv"):
            from importers.csv_importer import CSVImporter

            return CSVImporter(self.file_path).parse()

        if not self.file_path.lower().endswith(".ld"):
            raise ValueError(f"Unsupported format: {self.file_path}")

        ld_parser = MoTeCLDParser(self.file_path).parse()
        telemetry = self._canonical_telemetry(ld_parser.channels)

        x_coords, y_coords = self._extract_spatial_coordinates(ld_parser.channels)
        if x_coords is not None and y_coords is not None:
            n = len(telemetry["time"])
            telemetry["x"] = _resample(np.asarray(x_coords), n).tolist()
            telemetry["y"] = _resample(np.asarray(y_coords), n).tolist()

        ldx_path = os.path.splitext(self.file_path)[0] + ".ldx"
        ldx_laps = MoTeCLDXParser(ldx_path).parse().laps if os.path.exists(ldx_path) else []
        laps = self._split_laps(telemetry, ldx_laps)

        filename = os.path.basename(self.file_path)
        return Session(
            session_id=os.path.splitext(filename)[0],
            car=ld_parser.vehicle or "Unknown car",
            track=ld_parser.venue or "Unknown track",
            date=ld_parser.date_time,
            telemetry=telemetry,
            laps=laps,
            source_file=self.file_path,
        )

    def _canonical_telemetry(self, channels: dict[str, Any]) -> dict[str, list[float]]:
        """Map MoTeC channel names to canonical ones, resampled to the speed channel's rate.

        ACC logs pedals in percent, so they are rescaled to 0-1 when they exceed 1.5.
        """
        base = next((channels[n] for n in CHANNEL_MAP["speed"] if n in channels), None)
        if base is None or len(base.data) == 0:
            raise ValueError("MoTeC file has no speed channel")
        n = len(base.data)

        telemetry: dict[str, list[float]] = {"time": (np.arange(n) / float(base.freq)).tolist()}
        for canonical, names in CHANNEL_MAP.items():
            chan = next((channels[name] for name in names if name in channels), None)
            if chan is None or len(chan.data) == 0:
                if canonical in REQUIRED_CHANNELS:
                    # The domain model requires these channels; an absent one reads as zero.
                    telemetry[canonical] = [0.0] * n
                continue
            values = _resample(np.asarray(chan.data, dtype=np.float64), n)
            if canonical in ("throttle", "brake") and float(np.max(values)) > 1.5:
                values = values / 100.0
            telemetry[canonical] = values.tolist()
        return telemetry

    def _split_laps(self, telemetry: dict[str, list[float]], ldx_laps: list[dict[str, Any]]) -> list[Lap]:
        """Cut session channels into laps using .ldx markers, else lap-distance resets."""
        time = np.asarray(telemetry["time"])
        bounds: list[tuple[int, int, int]] = []

        if ldx_laps:
            for info in ldx_laps:
                start = int(np.searchsorted(time, info["start_time"]))
                end = int(np.searchsorted(time, info["end_time"]))
                bounds.append((info["lap_number"], start, end))
        elif "distance" in telemetry:
            dist = np.asarray(telemetry["distance"])
            resets = (np.where(np.diff(dist) < -LAP_RESET_DROP_M)[0] + 1).tolist()
            edges = [0] + resets + [len(dist)]
            bounds = [(i + 1, edges[i], edges[i + 1]) for i in range(len(edges) - 1)]
        else:
            bounds = [(1, 0, len(time))]

        laps: list[Lap] = []
        for lap_number, start, end in bounds:
            if end - start < 2:
                continue
            lap_telemetry = {k: v[start:end] for k, v in telemetry.items()}
            t0 = lap_telemetry["time"][0]
            lap_telemetry["time"] = [t - t0 for t in lap_telemetry["time"]]
            if "distance" in lap_telemetry:
                d0 = lap_telemetry["distance"][0]
                lap_telemetry["distance"] = [d - d0 for d in lap_telemetry["distance"]]
            laps.append(
                Lap(
                    lap_number=lap_number,
                    lap_time=round(float(time[end - 1] - time[start]), 3),
                    is_valid=True,
                    telemetry=lap_telemetry,
                    start_time=float(time[start]),
                    end_time=float(time[end - 1]),
                )
            )
        return laps

    def get_session_summary(self) -> SessionSummary:
        """
        Get a summary of the session data
        """
        session = self.parse()

        # Calculate basic summary metrics
        speeds = session.telemetry.get("speed", [0.0])
        duration = float(len(speeds))
        average_speed = float(sum(speeds) / len(speeds)) if speeds else 0.0

        best_lap = 0.0
        if session.laps:
            valid_times = [l.lap_time for l in session.laps if l.is_valid and l.lap_time > 0]
            if valid_times:
                best_lap = min(valid_times)

        return SessionSummary(
            session_id=session.session_id,
            car=session.car,
            track=session.track,
            date=session.date,
            duration=duration,
            best_lap_time=best_lap,
            average_speed=average_speed,
            lap_count=len(session.laps),
            id=session.id,
        )

    def _extract_spatial_coordinates(self, channels: dict[str, Any]) -> tuple[list[float] | None, list[float] | None]:
        """
        Auto-detect GPS latitude/longitude or local world position (X, Y, Z) channels from MoTeC logs.
        Converts GPS spherical coordinates into local planar Cartesian (x, y) in meters.
        Disambiguates ground plane (X, Z) vs (X, Y) for engines where Y is vertical elevation (rFactor2/LMU).
        """
        lat_names = ["GPS_Lat", "GPS Latitude", "Gps_Lat", "GPS_Latitude", "Latitude", "LATITUDE", "lat"]
        lon_names = ["GPS_Long", "GPS Longitude", "GPS_Lon", "Gps_Long", "Gps_Lon", "Longitude", "LONGITUDE", "lon"]
        x_names = ["CarCoordX", "Car Coord X", "Position X", "PositionX", "Pos X", "PosX", "World Pos X", "Car X", "x"]
        y_names = ["CarCoordY", "Car Coord Y", "Position Y", "PositionY", "Pos Y", "PosY", "World Pos Y", "Car Y", "y"]
        z_names = ["CarCoordZ", "Car Coord Z", "Position Z", "PositionZ", "Pos Z", "PosZ", "World Pos Z", "Car Z", "z"]

        # 1. Check for GPS Latitude and Longitude
        lat_chan = next((channels[n] for n in lat_names if n in channels), None)
        lon_chan = next((channels[n] for n in lon_names if n in channels), None)

        if lat_chan is not None and lon_chan is not None:
            lat_arr = np.array(lat_chan.data, dtype=np.float64)
            lon_arr = np.array(lon_chan.data, dtype=np.float64)
            valid = (np.abs(lat_arr) > 0.001) & (np.abs(lon_arr) > 0.001)
            if np.any(valid):
                lat_0 = float(np.median(lat_arr[valid]))
                lon_0 = float(np.median(lon_arr[valid]))
                r = 6371000.0  # Earth radius in meters
                lat_rad = np.radians(lat_arr)
                lon_rad = np.radians(lon_arr)
                lat_0_rad = np.radians(lat_0)
                lon_0_rad = np.radians(lon_0)
                x = r * (lon_rad - lon_0_rad) * np.cos(lat_0_rad)
                y = r * (lat_rad - lat_0_rad)
                return x.tolist(), y.tolist()

        # 2. Check for Cartesian World Coordinates (X, Y, Z)
        x_chan = next((channels[n] for n in x_names if n in channels), None)
        y_chan = next((channels[n] for n in y_names if n in channels), None)
        z_chan = next((channels[n] for n in z_names if n in channels), None)

        if x_chan is not None and (y_chan is not None or z_chan is not None):
            x_arr = np.array(x_chan.data, dtype=np.float64)
            if y_chan is not None and z_chan is not None:
                y_data = np.array(y_chan.data, dtype=np.float64)
                z_data = np.array(z_chan.data, dtype=np.float64)
                # rFactor 2 / LMU use Y for elevation, so the axis that varies more is the ground plane.
                ground_y = z_data if float(np.var(z_data)) > float(np.var(y_data)) * 2.0 else y_data
            elif y_chan is not None:
                ground_y = np.array(y_chan.data, dtype=np.float64)
            else:
                ground_y = np.array(z_chan.data, dtype=np.float64)

            x_centered = x_arr - float(np.mean(x_arr))
            y_centered = ground_y - float(np.mean(ground_y))
            return x_centered.tolist(), y_centered.tolist()

        return None, None
