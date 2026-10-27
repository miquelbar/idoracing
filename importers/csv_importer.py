"""
CSV Telemetry Importer for IdoRacing Analytics.
Reads telemetry exported from MoTeC i2, third-party apps or the IdoRacing recorder. Leading
"# key: value" lines carry session metadata (simulator, track, car), as the recorder writes them.
"""

import os
import re
from datetime import datetime

import numpy as np
import pandas as pd

from domain.session import Lap, Session, normalize_track_name
from importers.acevo_importer import resolve_acevo_session_info
from importers.laps import distance_covered, truncate_teleport_jumps, without_boundary_wrap
from importers.lmu_importer import resolve_lmu_session_info


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
        "pressure_fl": ["pressure_fl", "press_fl", "wheel_pressure_fl", "tyre_pressure_fl", "pressures_fl"],
        "pressure_fr": ["pressure_fr", "press_fr", "wheel_pressure_fr", "tyre_pressure_fr", "pressures_fr"],
        "pressure_rl": ["pressure_rl", "press_rl", "wheel_pressure_rl", "tyre_pressure_rl", "pressures_rl"],
        "pressure_rr": ["pressure_rr", "press_rr", "wheel_pressure_rr", "tyre_pressure_rr", "pressures_rr"],
        "tc": ["tc", "setup_tc1", "tc1", "traction_control"],
        "abs": ["abs", "setup_abs", "anti_lock_braking"],
        "brake_bias": ["brake_bias", "setup_brake_bias", "bias", "brake_balance"],
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
        filename = os.path.basename(self.filepath)
        session_id = os.path.splitext(filename)[0]

        session_date = datetime.now()
        date_match = re.search(r"(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})", session_id)
        if date_match:
            y, mo, d, h, mi = (int(x) for x in date_match.groups())
            session_date = datetime(y, mo, d, h, mi)

        is_acevo = (
            metadata.get("simulator") == "Assetto Corsa EVO"
            or session_id.startswith("acevo")
            or "assettocorsaevo" in self.filepath.lower()
        )
        acevo_info = {}
        if is_acevo:
            acevo_info = resolve_acevo_session_info(self.filepath, session_date)
            if acevo_info:
                csv_track = metadata.get("track", "")
                if (
                    csv_track
                    and csv_track not in ("", "Unknown track", "Ricardo Tormo de Valencia")
                    and normalize_track_name(csv_track) != normalize_track_name(acevo_info.get("track", ""))
                ):
                    acevo_info = {}
            if acevo_info:
                if not metadata.get("track") or metadata.get("track") in (
                    "",
                    "Unknown track",
                    "Ricardo Tormo de Valencia",
                ):
                    metadata["track"] = acevo_info["track"]
                if not metadata.get("car") or metadata.get("car") in ("", "Unknown car", "Porsche 911 GT3 R (992)"):
                    metadata["car"] = acevo_info["car"]
                metadata["simulator"] = "Assetto Corsa EVO"

        is_lmu = (
            metadata.get("simulator") == "Le Mans Ultimate"
            or session_id.startswith("lmu")
            or "lemansultimate" in self.filepath.lower()
        )
        lmu_info = {}
        if is_lmu:
            lmu_info = resolve_lmu_session_info(self.filepath, session_date)
            if lmu_info:
                csv_track = metadata.get("track", "")
                if (
                    csv_track
                    and csv_track not in ("", "Unknown track")
                    and normalize_track_name(csv_track) != normalize_track_name(lmu_info.get("track", ""))
                ):
                    lmu_info = {}
            if lmu_info:
                if not metadata.get("track") or metadata.get("track") in ("", "Unknown track"):
                    metadata["track"] = lmu_info["track"]
                if lmu_info.get("car"):
                    metadata["car"] = lmu_info["car"]
                metadata["simulator"] = "Le Mans Ultimate"

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
        # Bogus distances (< 100m while driving) or AC EVO coordinates are ignored and integrated from speed instead.
        track_position = (
            "lap_distance" in telemetry and max(telemetry.get("lap_distance", [0.0])) > 100.0 and not is_acevo
        )
        if track_position:
            telemetry["distance"] = telemetry.pop("lap_distance")
        else:
            telemetry.pop("lap_distance", None)
            telemetry.pop("distance", None)
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
        corrupted_laps = False
        if "lap" in telemetry:
            lap_arr = np.array(telemetry["lap"])
            unique_laps = np.unique(lap_arr)
            dist_series = telemetry.get("distance", [])
            total_dist = dist_series[-1] if len(dist_series) > 0 else 0.0
            # In AC EVO Early Access, the shared memory offset for CompletedLaps contains NormalizedCarPosition (float32)
            # resulting in hundreds/thousands of pseudo-unique lap numbers, or remains stuck on 1 for the whole session.
            if is_acevo and (
                len(unique_laps) > 20
                or np.any(lap_arr < -100)
                or np.any(lap_arr > 10000)
                or (len(unique_laps) <= 1 and total_dist > 4500.0)
            ):
                corrupted_laps = True
            else:
                for l_num in unique_laps:
                    indices = np.where(lap_arr == l_num)[0]
                    if len(indices) < 5:
                        continue
                    lap_telemetry = {k: [telemetry[k][idx] for idx in indices] for k in telemetry}
                    t0 = lap_telemetry["time"][0]
                    lap_telemetry["time"] = [v - t0 for v in lap_telemetry["time"]]
                    if track_position:
                        lap_telemetry["distance"] = without_boundary_wrap(lap_telemetry["distance"])
                    else:
                        d0 = lap_telemetry["distance"][0]
                        lap_telemetry["distance"] = [v - d0 for v in lap_telemetry["distance"]]
                    lap_telemetry, is_incomplete = truncate_teleport_jumps(lap_telemetry)
                    assert lap_telemetry is not None
                    t_arr = lap_telemetry["time"]
                    lap_time = float(t_arr[-1] - t_arr[0]) if len(t_arr) > 1 else 0.0
                    # Hybrid lap_valid rule: the recorder's flag is unreliable when it
                    # marks most samples invalid (practice/qualifying), so only trust it
                    # when at least half the samples are valid — then a single invalid
                    # sample invalidates the whole lap. The distance filter below still
                    # runs as a final arbiter for partial laps.
                    is_valid = not is_incomplete
                    if is_valid and lap_valid is not None:
                        lap_valid_samples = [lap_valid[idx] for idx in indices[: len(t_arr)]]
                        valid_fraction = sum(1 for v in lap_valid_samples if v >= 1) / max(len(lap_valid_samples), 1)
                        if valid_fraction >= 0.5:
                            is_valid = all(v >= 1 for v in lap_valid_samples)
                    laps.append(
                        Lap(
                            lap_number=int(l_num),
                            lap_time=lap_time,
                            is_valid=is_valid,
                            is_incomplete=is_incomplete,
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

        if corrupted_laps:
            dist_series = telemetry.get("distance", [])
            total_dist = dist_series[-1] if len(dist_series) > 0 else 0.0

            # Determine circuit length generically without hardcoding track names:
            # 1. From CSV metadata header (if recorder recorded track_length_m)
            track_len = float(metadata.get("track_length_m", 0.0) or 0.0)

            # 2. From official session result lap time (best_lap_s) and telemetry flying speed
            if track_len < 100.0:
                best_lap_s = 0.0
                if is_acevo and acevo_info:
                    best_lap_s = float(acevo_info.get("best_lap") or acevo_info.get("best_lap_s") or 0.0)
                elif is_lmu and lmu_info:
                    best_lap_s = float(lmu_info.get("best_lap") or 0.0)

                if best_lap_s > 20.0 and "speed" in telemetry and "time" in telemetry:
                    flying_speeds = [
                        s for s, t in zip(telemetry["speed"], telemetry["time"], strict=False) if s > 60.0 and t > 60.0
                    ]
                    if flying_speeds:
                        avg_speed_ms = (sum(flying_speeds) / len(flying_speeds)) / 3.6
                        track_len = round(avg_speed_ms * best_lap_s, 1)

            # 3. Fallback generic default estimate if no session result lap time exists
            if track_len < 100.0:
                track_len = 4000.0

            if total_dist >= track_len * 0.7:
                lap_start_idx = 0
                current_target = track_len
                lap_idx = 1
                for i, d in enumerate(dist_series):
                    is_last_sample = i == len(dist_series) - 1
                    if d >= current_target or is_last_sample:
                        if i - lap_start_idx >= 30:
                            lap_tel = {k: telemetry[k][lap_start_idx:i] for k in telemetry}
                            t0 = lap_tel["time"][0]
                            lap_tel["time"] = [v - t0 for v in lap_tel["time"]]
                            d0 = lap_tel["distance"][0]
                            lap_tel["distance"] = [v - d0 for v in lap_tel["distance"]]
                            lap_time = float(lap_tel["time"][-1] - lap_tel["time"][0])

                            span = d - dist_series[lap_start_idx]
                            is_inc = span < 0.7 * track_len or (is_last_sample and d < current_target)
                            is_out = (lap_idx == 1 and lap_time > 120.0) or is_inc
                            is_val = not is_out and not is_inc and (0.7 * track_len <= span <= 1.3 * track_len)

                            splits = []
                            if is_val:
                                if is_acevo and acevo_info:
                                    splits = acevo_info.get("splits", [])
                                elif is_lmu and lmu_info:
                                    splits = lmu_info.get("splits", [])

                            laps.append(
                                Lap(
                                    lap_number=lap_idx,
                                    lap_time=round(lap_time, 3),
                                    sector_times=splits,
                                    is_valid=is_val,
                                    is_incomplete=is_inc,
                                    is_outlap=is_out,
                                    telemetry=lap_tel,
                                    has_telemetry=True,
                                )
                            )
                            lap_idx += 1
                        lap_start_idx = i
                        current_target += track_len

        # For AC EVO and LMU: calibrate flying lap if official session result best lap is available
        res_info = acevo_info if (is_acevo and acevo_info) else (lmu_info if (is_lmu and lmu_info) else {})
        if res_info:
            official_best = float(res_info.get("best_lap") or 0.0)
            splits = res_info.get("splits") or []
            if official_best > 20.0 and laps:
                valid_laps = [l for l in laps if l.is_valid and not l.is_outlap and not l.is_incomplete]
                if not valid_laps:
                    valid_laps = [l for l in laps if not l.is_outlap and not l.is_incomplete]
                if valid_laps:
                    flying_lap = min(valid_laps, key=lambda l: abs(l.lap_time - official_best))
                    if abs(flying_lap.lap_time - official_best) <= max(10.0, official_best * 0.10):
                        flying_lap.lap_time = round(official_best, 3)
                        flying_lap.is_valid = True
                        if splits:
                            flying_lap.sector_times = splits

        # If no explicit laps found, treat whole file as lap 1
        if not laps and n_samples > 0:
            lap_tel, is_inc = truncate_teleport_jumps(telemetry)
            assert lap_tel is not None
            total_time = float(lap_tel["time"][-1] - lap_tel["time"][0]) if len(lap_tel["time"]) > 1 else 0.0
            laps.append(
                Lap(
                    lap_number=1,
                    lap_time=total_time,
                    is_valid=not is_inc,
                    is_incomplete=is_inc,
                    telemetry=lap_tel,
                )
            )

        filename = os.path.basename(self.filepath)
        session_id = os.path.splitext(filename)[0]

        linked_file = None
        if is_acevo and acevo_info:
            linked_file = acevo_info.get("result_file")
        elif is_lmu and lmu_info:
            linked_file = lmu_info.get("result_file")

        return Session(
            session_id=session_id,
            car=metadata.get("car", self.car),
            track=metadata.get("track", self.track),
            date=session_date,
            telemetry=telemetry,
            laps=laps,
            source_file=self.filepath,
            simulator=metadata.get("simulator"),
            linked_result_file=linked_file,
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
