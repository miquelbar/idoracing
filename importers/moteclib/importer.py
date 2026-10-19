import logging
import os
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from domain.session import Lap, Session, SessionSummary
from importers.motec_binary import MoTeCLDParser, MoTeCLDXParser

logger = logging.getLogger(__name__)


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
        telemetry: Dict[str, List[float]] = {}

        # Canonical channel mapping for ACC/LMU MoTeC logs
        channel_map = {
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

        for canonical, names in channel_map.items():
            found = False
            for n in names:
                if n in ld_parser.channels:
                    telemetry[canonical] = ld_parser.channels[n].data.tolist()
                    found = True
                    break
            if not found:
                # Default placeholder if specific channel is absent
                if canonical in ["speed", "throttle", "brake", "gear", "lat_accel", "long_accel"]:
                    telemetry[canonical] = [0.0] * 10

        # Auto-detect GPS Latitude / Longitude or Local Cartesian Position
        x_coords, y_coords = self._extract_spatial_coordinates(ld_parser.channels)
        if x_coords is not None and y_coords is not None:
            telemetry["x"] = x_coords
            telemetry["y"] = y_coords
            logger.info(f"Extracted {len(x_coords)} native spatial coordinates from MoTeC telemetry")

        # Check for companion .ldx file
        ldx_path = os.path.splitext(self.file_path)[0] + ".ldx"
        laps: List[Lap] = []
        if os.path.exists(ldx_path):
            ldx_parser = MoTeCLDXParser(ldx_path).parse()
            for lap_info in ldx_parser.laps:
                laps.append(Lap(
                    lap_number=lap_info["lap_number"],
                    lap_time=lap_info["lap_time"],
                    start_time=lap_info.get("start_time"),
                    end_time=lap_info.get("end_time"),
                    is_valid=True,
                ))

        car_name = ld_parser.vehicle if ld_parser.vehicle else "Porsche 911 GT3 R (992)"
        track_name = ld_parser.venue if ld_parser.venue else "Ricardo Tormo de Valencia"
        filename = os.path.basename(self.file_path)
        session_id = os.path.splitext(filename)[0]

        return Session(
            session_id=session_id,
            car=car_name,
            track=track_name,
            date=ld_parser.date_time,
            telemetry=telemetry,
            laps=laps,
            source_file=self.file_path,
        )

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

    def _extract_spatial_coordinates(
        self, channels: Dict[str, Any]
    ) -> Tuple[Optional[List[float]], Optional[List[float]]]:
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
                # Check which axis represents the ground plane vs vertical elevation
                if float(np.var(z_data)) > float(np.var(y_data)) * 2.0:
                    # Z is horizontal ground axis (rFactor2 / LMU / Unity standard)
                    ground_y = z_data
                else:
                    ground_y = y_data
            elif y_chan is not None:
                ground_y = np.array(y_chan.data, dtype=np.float64)
            else:
                ground_y = np.array(z_chan.data, dtype=np.float64)

            x_centered = x_arr - float(np.mean(x_arr))
            y_centered = ground_y - float(np.mean(ground_y))
            return x_centered.tolist(), y_centered.tolist()

        return None, None