"""
Distance-based telemetry alignment and delta calculation.
Interpolates telemetry from two laps onto a common distance grid to compute
speed deltas and cumulative time delta profiles.
"""

import numpy as np


def align_laps_by_distance(
    ref_telemetry: dict[str, list[float]],
    comp_telemetry: dict[str, list[float]],
    step_m: float = 2.0,
) -> dict[str, np.ndarray]:
    """
    Interpolate reference and comparison telemetry onto a uniform distance axis.
    Returns aligned distance, channels for both laps, and calculated deltas.
    """
    ref_dist = np.array(ref_telemetry.get("distance", []), dtype=np.float64)
    comp_dist = np.array(comp_telemetry.get("distance", []), dtype=np.float64)

    # Fallback if distance is missing: generate from speed & time
    if len(ref_dist) == 0 and "speed" in ref_telemetry and "time" in ref_telemetry:
        t = np.array(ref_telemetry["time"])
        v = np.array(ref_telemetry["speed"]) / 3.6
        ref_dist = np.zeros(len(t))
        for i in range(1, len(t)):
            ref_dist[i] = ref_dist[i - 1] + v[i] * max(t[i] - t[i - 1], 0.0)

    if len(comp_dist) == 0 and "speed" in comp_telemetry and "time" in comp_telemetry:
        t = np.array(comp_telemetry["time"])
        v = np.array(comp_telemetry["speed"]) / 3.6
        comp_dist = np.zeros(len(t))
        for i in range(1, len(t)):
            comp_dist[i] = comp_dist[i - 1] + v[i] * max(t[i] - t[i - 1], 0.0)

    max_dist = min(ref_dist[-1], comp_dist[-1]) if len(ref_dist) > 0 and len(comp_dist) > 0 else 4000.0
    common_dist = np.arange(0.0, max_dist, step_m)

    aligned: dict[str, np.ndarray] = {"distance": common_dist}

    channels_to_align = [
        "speed",
        "throttle",
        "brake",
        "gear",
        "steer_angle",
        "lat_accel",
        "long_accel",
        "rpm",
        "x",
        "y",
    ]
    for ch in channels_to_align:
        if ch in ref_telemetry and len(ref_telemetry[ch]) == len(ref_dist):
            aligned[f"ref_{ch}"] = np.interp(common_dist, ref_dist, ref_telemetry[ch])
        else:
            aligned[f"ref_{ch}"] = np.zeros_like(common_dist)

        if ch in comp_telemetry and len(comp_telemetry[ch]) == len(comp_dist):
            aligned[f"comp_{ch}"] = np.interp(common_dist, comp_dist, comp_telemetry[ch])
        else:
            aligned[f"comp_{ch}"] = np.zeros_like(common_dist)

    # Expose primary spatial coordinates if available
    if np.any(aligned.get("ref_x", 0) != 0) or np.any(aligned.get("ref_y", 0) != 0):
        aligned["x"] = aligned["ref_x"]
        aligned["y"] = aligned["ref_y"]
    elif np.any(aligned.get("comp_x", 0) != 0) or np.any(aligned.get("comp_y", 0) != 0):
        aligned["x"] = aligned["comp_x"]
        aligned["y"] = aligned["comp_y"]

    # Speed Delta (km/h): Positive means reference is faster
    aligned["speed_delta"] = aligned["ref_speed"] - aligned["comp_speed"]

    # Time Delta (seconds) along distance:
    # dt = ds * (1/v_comp - 1/v_ref) where v is in m/s
    ref_v_ms = np.maximum(aligned["ref_speed"] / 3.6, 1.0)
    comp_v_ms = np.maximum(aligned["comp_speed"] / 3.6, 1.0)

    ds = step_m
    delta_t_increments = ds * ((1.0 / comp_v_ms) - (1.0 / ref_v_ms))
    time_delta = np.cumsum(delta_t_increments)
    # Start at 0.0 delta
    if len(time_delta) > 0:
        time_delta = np.insert(time_delta[:-1], 0, 0.0)
    aligned["time_delta"] = time_delta

    return aligned
