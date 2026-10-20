"""
Placeholder telemetry for sessions that only carry lap and sector times (LMU/rFactor 2 XML results).
The traces are shaped from the track's corner table and scaled to each lap time. They are not
measurements, and every lap they fill is marked synthetic.
"""

import numpy as np

from analysis.tracks import get_track_corners, get_track_length
from domain.session import Session


def _steer_sign(corner: dict) -> float:
    """Positive lateral acceleration means turning left, matching the analyzer's convention."""
    return 1.0 if corner.get("turn_dir") == "left" else -1.0


def generate_lap_telemetry_for_track(
    track_name: str,
    target_lap_time: float | None = None,
    is_reference: bool = True,
    step_dist: float = 2.0,
) -> dict[str, np.ndarray]:
    """
    Generate distance-aligned telemetry for a track from its corner table.
    If target_lap_time is given, velocities are scaled so the lap takes exactly that long.
    is_reference=False plants mistakes at fixed corners; only tests use it.
    """
    total_dist = get_track_length(track_name)
    corners = get_track_corners(track_name, total_dist)

    distances = np.arange(0.0, total_dist, step_dist, dtype=np.float32)
    n = len(distances)

    speed = np.zeros(n, dtype=np.float32)
    throttle = np.zeros(n, dtype=np.float32)
    brake = np.zeros(n, dtype=np.float32)
    gear = np.zeros(n, dtype=np.float32)
    steer_angle = np.zeros(n, dtype=np.float32)
    lat_accel = np.zeros(n, dtype=np.float32)
    long_accel = np.zeros(n, dtype=np.float32)
    rpm = np.zeros(n, dtype=np.float32)

    # Pre-calculate segment assignments for each distance
    # Baseline top speed for GT3 / LMGT3
    max_straight_speed = 265.0

    for i, d in enumerate(distances):
        # Find which corner or straight we are in
        in_corner = None
        for c in corners:
            if c["start"] <= d <= c["end"]:
                in_corner = c
                break

        if in_corner is not None:
            c = in_corner
            c_num = c["number"]
            c_apex = c["apex"]
            c_target = float(c.get("target_speed", 120.0))
            c_gear = int(c.get("gear", 3))

            # Introduce driver mistakes on comparison lap
            apex_speed = c_target
            delayed_th = False
            early_brk = False
            wrong_gear = False

            if not is_reference:
                if c_num in [1, 7]:  # Braking too early & over-slowing
                    apex_speed = max(50.0, c_target - 12.0)
                    early_brk = True
                elif c_num in [4, 11]:  # Hesitant delayed throttle
                    delayed_th = True
                elif c_num in [2, 10]:  # Suboptimal gear
                    wrong_gear = True

            if d < c_apex:
                # Braking / Turn-in phase
                span = max(1.0, c_apex - c["start"])
                ratio = (d - c["start"]) / span
                brk_onset = 0.25 if early_brk else 0.40

                if ratio < brk_onset:
                    # Straight into braking
                    sp = max_straight_speed * 0.90
                    th = 1.0
                    br = 0.0
                    gr = min(6, c_gear + 2)
                    st = 0.0
                else:
                    # Braking zone
                    brk_ratio = (ratio - brk_onset) / (1.0 - brk_onset)
                    entry_sp = max_straight_speed * 0.90
                    sp = entry_sp - brk_ratio * (entry_sp - apex_speed)
                    th = 0.0
                    br = 0.90 * (1.0 - brk_ratio * 0.4)
                    gr = c_gear
                    st = _steer_sign(c) * 15.0 * brk_ratio
            else:
                # Apex & Exit phase
                span = max(1.0, c["end"] - c_apex)
                ratio = (d - c_apex) / span
                exit_target = min(max_straight_speed, apex_speed + 60.0)
                sp = apex_speed + ratio * (exit_target - apex_speed)

                th = 0.0 if delayed_th and ratio < 0.35 else min(1.0, float(0.2 + ratio * 0.85))

                br = 0.0
                gr = max(1, c_gear - 1) if (wrong_gear and ratio < 0.6) else c_gear
                st = _steer_sign(c) * (25.0 * (1.0 - ratio))

        else:
            # Straightaway section
            sp = max_straight_speed * 0.88 + 25.0 * np.sin(d / 400.0)
            th = 1.0
            br = 0.0
            gr = 5 if sp > 200.0 else 4
            st = 0.0

        speed[i] = float(np.clip(sp, 50.0, 280.0))
        throttle[i] = float(np.clip(th, 0.0, 1.0))
        brake[i] = float(np.clip(br, 0.0, 1.0))
        gear[i] = float(np.clip(gr, 1, 6))
        steer_angle[i] = float(st)
        lat_accel[i] = float(np.clip((sp / 3.6) ** 2 * (st / 40.0) * 0.012 / 9.81, -2.5, 2.5))
        long_accel[i] = float(np.clip((th * 0.6 - br * 1.5), -1.8, 1.0))
        rpm[i] = float(4500.0 + (sp / 280.0) * 4400.0)

    # Initial time calculation: dt = ds / (v / 3.6)
    time = np.zeros(n, dtype=np.float32)
    for i in range(1, n):
        ds = distances[i] - distances[i - 1]
        v_avg = max((speed[i] + speed[i - 1]) / 2.0, 10.0) / 3.6
        time[i] = time[i - 1] + ds / v_avg

    # If target lap time is specified, scale velocities so total time matches target exactly
    if target_lap_time and target_lap_time > 10.0 and time[-1] > 0:
        time_factor = float(target_lap_time / time[-1])
        # Speed scales inversely with time factor: v_new = v_old / time_factor
        speed = np.clip(speed / time_factor, 45.0, 310.0).astype(np.float32)
        # Recalculate exact time array
        time[0] = 0.0
        for i in range(1, n):
            ds = distances[i] - distances[i - 1]
            v_avg = max((speed[i] + speed[i - 1]) / 2.0, 10.0) / 3.6
            time[i] = time[i - 1] + ds / v_avg
        time[-1] = target_lap_time

    return {
        "distance": distances,
        "time": time,
        "speed": speed,
        "throttle": throttle,
        "brake": brake,
        "gear": gear,
        "lat_accel": lat_accel,
        "long_accel": long_accel,
        "steer_angle": steer_angle,
        "rpm": rpm,
    }


def ensure_session_telemetry(session: Session) -> Session:
    """
    Fill laps that have no trace with placeholder telemetry scaled to their lap time.
    Every lap filled here is marked synthetic so callers can say so.
    """
    for lap in session.laps:
        if not lap.telemetry or not lap.telemetry.get("speed"):
            t_dict = generate_lap_telemetry_for_track(
                track_name=session.track,
                target_lap_time=lap.lap_time,
            )
            lap.telemetry = {k: v.tolist() for k, v in t_dict.items()}
            lap.synthetic = True

    if not session.telemetry.get("speed") and session.laps:
        session.telemetry = session.laps[0].telemetry or {}

    return session
