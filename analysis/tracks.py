"""
Circuit geometry for IdoRacing Analytics: corner tables for the mapped demo tracks
(Valencia, Sebring) and the telemetry-inferred 2D outline drawn on the track map.
"""

from typing import Any

import numpy as np

# Valencia Ricardo Tormo corners (approximate distances along the 4005 m lap)
VALENCIA_CORNERS: list[dict[str, Any]] = [
    {
        "number": 1,
        "name": "Curva Aspar",
        "start": 360.0,
        "apex": 490.0,
        "end": 640.0,
        "gear": 4,
        "target_speed": 153.0,
        "turn_dir": "left",
        "turn_deg": 78,
    },
    {
        "number": 2,
        "name": "Curva Doohan",
        "start": 780.0,
        "apex": 935.0,
        "end": 1040.0,
        "gear": 2,
        "target_speed": 76.0,
        "turn_dir": "left",
        "turn_deg": 158,
    },
    {
        "number": 3,
        "name": "Curva 3",
        "start": 1040.0,
        "apex": 1090.0,
        "end": 1160.0,
        "gear": 4,
        "target_speed": 150.0,
        "turn_dir": "left",
        "turn_deg": 46,
    },
    {
        "number": 4,
        "name": "Curva Nico Terol",
        "start": 1160.0,
        "apex": 1255.0,
        "end": 1330.0,
        "gear": 2,
        "target_speed": 101.0,
        "turn_dir": "right",
        "turn_deg": -102,
    },
    {
        "number": 5,
        "name": "Curva 5",
        "start": 1330.0,
        "apex": 1425.0,
        "end": 1520.0,
        "gear": 3,
        "target_speed": 110.0,
        "turn_dir": "right",
        "turn_deg": -129,
    },
    {
        "number": 6,
        "name": "Curva 6",
        "start": 1580.0,
        "apex": 1705.0,
        "end": 1820.0,
        "gear": 3,
        "target_speed": 90.0,
        "turn_dir": "left",
        "turn_deg": 130,
    },
    {
        "number": 7,
        "name": "Curva 7",
        "start": 1820.0,
        "apex": 1940.0,
        "end": 2080.0,
        "gear": 4,
        "target_speed": 165.0,
        "turn_dir": "left",
        "turn_deg": 20,
    },
    {
        "number": 8,
        "name": "Curva Bernat Martinez",
        "start": 2120.0,
        "apex": 2235.0,
        "end": 2340.0,
        "gear": 3,
        "target_speed": 93.0,
        "turn_dir": "left",
        "turn_deg": 144,
    },
    {
        "number": 9,
        "name": "Curva 9",
        "start": 2340.0,
        "apex": 2435.0,
        "end": 2540.0,
        "gear": 4,
        "target_speed": 150.0,
        "turn_dir": "left",
        "turn_deg": 47,
    },
    {
        "number": 10,
        "name": "Curva 10",
        "start": 2560.0,
        "apex": 2688.0,
        "end": 2800.0,
        "gear": 2,
        "target_speed": 74.0,
        "turn_dir": "right",
        "turn_deg": -184,
    },
    {
        "number": 11,
        "name": "Curva Champi Herreros",
        "start": 2900.0,
        "apex": 3035.0,
        "end": 3120.0,
        "gear": 3,
        "target_speed": 127.0,
        "turn_dir": "right",
        "turn_deg": -56,
    },
    {
        "number": 12,
        "name": "Curva 12",
        "start": 3120.0,
        "apex": 3160.0,
        "end": 3220.0,
        "gear": 4,
        "target_speed": 155.0,
        "turn_dir": "left",
        "turn_deg": 27,
    },
    {
        "number": 13,
        "name": "Curva 13",
        "start": 3220.0,
        "apex": 3270.0,
        "end": 3380.0,
        "gear": 5,
        "target_speed": 172.0,
        "turn_dir": "left",
        "turn_deg": 41,
    },
    {
        "number": 14,
        "name": "Curva Adrian Campos",
        "start": 3400.0,
        "apex": 3535.0,
        "end": 3660.0,
        "gear": 2,
        "target_speed": 78.0,
        "turn_dir": "left",
        "turn_deg": 142,
    },
]

# Sebring International Raceway corners: windows measured from the surveyed centreline in
# data/circuits/sebring.json, turn directions per the real circuit (clockwise), and turn
# angles that sum to exactly -360 degrees so an inferred outline closes like the real lap.
SEBRING_CORNERS: list[dict[str, Any]] = [
    {
        "number": 1,
        "name": "Turn 1",
        "start": 340.0,
        "apex": 480.0,
        "end": 620.0,
        "gear": 3,
        "target_speed": 110.0,
        "turn_dir": "left",
        "turn_deg": 60,
    },
    {
        "number": 2,
        "name": "Turn 2",
        "start": 620.0,
        "apex": 710.0,
        "end": 800.0,
        "gear": 5,
        "target_speed": 215.0,
        "turn_dir": "right",
        "turn_deg": -15,
    },
    {
        "number": 3,
        "name": "Turn 3",
        "start": 800.0,
        "apex": 930.0,
        "end": 1060.0,
        "gear": 2,
        "target_speed": 95.0,
        "turn_dir": "left",
        "turn_deg": 85,
    },
    {
        "number": 4,
        "name": "Turn 4",
        "start": 1060.0,
        "apex": 1110.0,
        "end": 1160.0,
        "gear": 3,
        "target_speed": 130.0,
        "turn_dir": "right",
        "turn_deg": -25,
    },
    {
        "number": 5,
        "name": "Turn 5",
        "start": 1160.0,
        "apex": 1250.0,
        "end": 1400.0,
        "gear": 2,
        "target_speed": 105.0,
        "turn_dir": "left",
        "turn_deg": 40,
    },
    {
        "number": 6,
        "name": "Big Bend (T6)",
        "start": 1400.0,
        "apex": 1650.0,
        "end": 1950.0,
        "gear": 4,
        "target_speed": 175.0,
        "turn_dir": "right",
        "turn_deg": -70,
    },
    {
        "number": 7,
        "name": "Hairpin (T7)",
        "start": 1950.0,
        "apex": 2090.0,
        "end": 2220.0,
        "gear": 1,
        "target_speed": 65.0,
        "turn_dir": "right",
        "turn_deg": -160,
    },
    {
        "number": 8,
        "name": "Fangio Chicane Entry (T8)",
        "start": 2220.0,
        "apex": 2320.0,
        "end": 2420.0,
        "gear": 3,
        "target_speed": 135.0,
        "turn_dir": "right",
        "turn_deg": -20,
    },
    {
        "number": 9,
        "name": "Fangio Chicane Exit (T9)",
        "start": 2420.0,
        "apex": 2560.0,
        "end": 2700.0,
        "gear": 3,
        "target_speed": 140.0,
        "turn_dir": "left",
        "turn_deg": 15,
    },
    {
        "number": 10,
        "name": "Cunningham (T10)",
        "start": 2700.0,
        "apex": 2830.0,
        "end": 2950.0,
        "gear": 2,
        "target_speed": 90.0,
        "turn_dir": "right",
        "turn_deg": -90,
    },
    {
        "number": 11,
        "name": "Collier (T11)",
        "start": 2950.0,
        "apex": 3120.0,
        "end": 3300.0,
        "gear": 4,
        "target_speed": 165.0,
        "turn_dir": "left",
        "turn_deg": 45,
    },
    {
        "number": 12,
        "name": "Turn 12",
        "start": 3300.0,
        "apex": 3370.0,
        "end": 3450.0,
        "gear": 4,
        "target_speed": 180.0,
        "turn_dir": "right",
        "turn_deg": -15,
    },
    {
        "number": 13,
        "name": "Tower Turn (T13)",
        "start": 3450.0,
        "apex": 3580.0,
        "end": 3720.0,
        "gear": 2,
        "target_speed": 85.0,
        "turn_dir": "right",
        "turn_deg": -85,
    },
    {
        "number": 14,
        "name": "Bishop (T14)",
        "start": 3720.0,
        "apex": 3850.0,
        "end": 3980.0,
        "gear": 5,
        "target_speed": 215.0,
        "turn_dir": "left",
        "turn_deg": 15,
    },
    {
        "number": 15,
        "name": "Turn 15 Bend",
        "start": 3980.0,
        "apex": 4150.0,
        "end": 4320.0,
        "gear": 3,
        "target_speed": 125.0,
        "turn_dir": "left",
        "turn_deg": 25,
    },
    {
        "number": 16,
        "name": "Le Mans Curve (T16)",
        "start": 4320.0,
        "apex": 4500.0,
        "end": 4700.0,
        "gear": 3,
        "target_speed": 120.0,
        "turn_dir": "right",
        "turn_deg": -45,
    },
    {
        "number": 17,
        "name": "Sunset Bend (T17)",
        "start": 5450.0,
        "apex": 5700.0,
        "end": 5900.0,
        "gear": 2,
        "target_speed": 80.0,
        "turn_dir": "right",
        "turn_deg": -120,
    },
]

# Red Bull Ring corners: windows measured from the ACC fastlane.ai centreline in
# data/circuits/red_bull_ring.json (game frame mirrored to real-world orientation),
# turn directions per the real circuit (clockwise), and turn angles that sum to
# exactly -360 degrees so an inferred outline closes like the real lap.
RED_BULL_RING_CORNERS: list[dict[str, Any]] = [
    {
        "number": 1,
        "name": "Niki Lauda",
        "start": 402.6,
        "apex": 458.0,
        "end": 508.3,
        "gear": 4,
        "target_speed": 150.0,
        "turn_dir": "right",
        "turn_deg": -72,
    },
    {
        "number": 2,
        "name": "Munzer",
        "start": 1026.7,
        "apex": 1066.9,
        "end": 1177.6,
        "gear": 5,
        "target_speed": 190.0,
        "turn_dir": "left",
        "turn_deg": 17,
    },
    {
        "number": 3,
        "name": "Schlossgold",
        "start": 1358.8,
        "apex": 1399.1,
        "end": 1469.5,
        "gear": 3,
        "target_speed": 95.0,
        "turn_dir": "right",
        "turn_deg": -136,
    },
    {
        "number": 4,
        "name": "Rauch",
        "start": 2133.8,
        "apex": 2224.4,
        "end": 2259.7,
        "gear": 3,
        "target_speed": 120.0,
        "turn_dir": "right",
        "turn_deg": -115,
    },
    {
        "number": 5,
        "name": "Turn 5",
        "start": 2259.7,
        "apex": 2395.5,
        "end": 2531.4,
        "gear": 5,
        "target_speed": 190.0,
        "turn_dir": "right",
        "turn_deg": -81,
    },
    {
        "number": 6,
        "name": "Turn 6",
        "start": 2586.8,
        "apex": 2808.2,
        "end": 2868.6,
        "gear": 4,
        "target_speed": 140.0,
        "turn_dir": "left",
        "turn_deg": 134,
    },
    {
        "number": 7,
        "name": "Graz",
        "start": 2924.0,
        "apex": 3064.9,
        "end": 3150.4,
        "gear": 4,
        "target_speed": 160.0,
        "turn_dir": "left",
        "turn_deg": 108,
    },
    {
        "number": 8,
        "name": "Turn 8",
        "start": 3155.5,
        "apex": 3258.6,
        "end": 3361.8,
        "gear": 5,
        "target_speed": 180.0,
        "turn_dir": "right",
        "turn_deg": -47,
    },
    {
        "number": 9,
        "name": "Rindt",
        "start": 3699.0,
        "apex": 3819.8,
        "end": 3885.2,
        "gear": 5,
        "target_speed": 190.0,
        "turn_dir": "right",
        "turn_deg": -75,
    },
    {
        "number": 10,
        "name": "Turn 10",
        "start": 3925.5,
        "apex": 4038.7,
        "end": 4151.9,
        "gear": 4,
        "target_speed": 130.0,
        "turn_dir": "right",
        "turn_deg": -93,
    },
]


def get_track_length(track_name: str | None = None) -> float:
    t = (track_name or "").lower()
    if "sebring" in t:
        return 6019.0
    if "valencia" in t or "ricardo" in t or "cheste" in t:
        return 4005.0
    if "spa" in t or "francorchamps" in t:
        return 7004.0
    if "monza" in t:
        return 5793.0
    if "nurburgring" in t or "nürburgring" in t:
        return 5148.0
    if (
        "red bull ring" in t
        or "spielberg" in t
        or "österreichring" in t
        or "osterreichring" in t
        or "a1-ring" in t
        or "a1 ring" in t
    ):
        return 4318.0
    if "zandvoort" in t:
        return 4259.0
    return 4500.0


def known_track_corners(track_name: str | None) -> list[dict[str, Any]] | None:
    """Corner table for tracks we have mapped, None for any other track."""
    t_norm = (track_name or "").lower()
    if "sebring" in t_norm:
        return SEBRING_CORNERS
    if "valencia" in t_norm or "ricardo" in t_norm or "cheste" in t_norm:
        return VALENCIA_CORNERS
    if (
        "red bull ring" in t_norm
        or "spielberg" in t_norm
        or "österreichring" in t_norm
        or "osterreichring" in t_norm
        or "a1-ring" in t_norm
        or "a1 ring" in t_norm
    ):
        return RED_BULL_RING_CORNERS
    return None


def get_track_corners(track_name: str | None = None, total_distance: float = 0.0) -> list[dict[str, Any]]:
    """Corner table used to shape placeholder telemetry; unmapped tracks borrow the closest-length layout."""
    known = known_track_corners(track_name)
    if known is not None:
        return known
    return SEBRING_CORNERS if total_distance > 5000.0 else VALENCIA_CORNERS


def reconstruct_track_from_dynamics(
    distance: np.ndarray, speed_kmh: np.ndarray, lat_accel_g: np.ndarray
) -> tuple[list[float], list[float]]:
    """
    Dead-reckon the driven line: heading changes by a_lat * ds / v^2. The heading and position
    drift left at the line are spread evenly over the lap so the outline closes.
    """
    v = np.maximum(speed_kmh / 3.6, 5.0)
    ds = np.diff(distance, prepend=distance[0])
    heading = np.cumsum(lat_accel_g * 9.81 * ds / v**2)
    if len(heading) > 1:
        turned = heading[-1] - heading[0]
        closing_turn = np.sign(turned) * 2.0 * np.pi if abs(turned) > np.pi else 0.0
        heading -= np.linspace(0.0, turned - closing_turn, len(heading))
    x = np.cumsum(ds * np.cos(heading))
    y = np.cumsum(ds * np.sin(heading))
    x -= np.linspace(0.0, x[-1] - x[0], len(x))
    y -= np.linspace(0.0, y[-1] - y[0], len(y))
    return x.tolist(), y.tolist()


def _lateral_accel_channel(telemetry: dict[str, np.ndarray], length: int) -> tuple[np.ndarray, np.ndarray] | None:
    """Speed and lateral-acceleration pair that matches the distance grid, if telemetry has one."""
    for prefix in ("ref_", "comp_", ""):
        speed = telemetry.get(f"{prefix}speed")
        lat = telemetry.get(f"{prefix}lat_accel")
        if speed is None or lat is None:
            continue
        lat = np.asarray(lat, dtype=np.float64)
        if len(lat) == length and len(np.asarray(speed)) == length and float(np.max(np.abs(lat))) > 0.05:
            return np.asarray(speed, dtype=np.float64), lat
    return None


MAX_TELEPORT_STEP_M = 25.0
MAX_CLOSURE_GAP_M = 30.0
MAX_COMPLETE_LAP_DRIFT_M = 80.0


def apply_loop_closure_drift_correction(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Distribute the final loop-closure drift (x[-1] - x[0], y[-1] - y[0]) linearly
    across all N points so a complete lap connects smoothly back to (x[0], y[0])
    with zero step jump and hypot(x[-1] - x[0], y[-1] - y[0]) == 0.0.
    """
    x_arr = np.asarray(x, dtype=np.float64).copy()
    y_arr = np.asarray(y, dtype=np.float64).copy()
    if len(x_arr) < 2:
        return x_arr, y_arr
    dx_err = float(x_arr[-1] - x_arr[0])
    dy_err = float(y_arr[-1] - y_arr[0])
    ratios = np.linspace(0.0, 1.0, len(x_arr))
    return x_arr - ratios * dx_err, y_arr - ratios * dy_err


def is_complete_track_lap(telemetry: dict[str, Any] | None, track_name: str | None = None) -> bool:
    """
    True when a lap telemetry dict represents a 100% complete circuit lap suitable for
    building the base circuit silhouette:
    - covers >= 98% of the official track length
    - does not enter the pit lane in the final 300m (speed > 60 km/h)
    - has no intermediate spatial teleport jump (step_dist > 25m)
    """
    if not telemetry:
        return False
    dist = np.asarray(telemetry.get("distance", []), dtype=np.float64)
    if len(dist) < 20:
        return False
    track_len = get_track_length(track_name)
    if float(dist[-1] - dist[0]) < 0.98 * track_len:
        return False
    if np.any(np.diff(dist) < -25.0):
        return False
    for skey in ("speed", "ref_speed", "comp_speed"):
        sp = telemetry.get(skey)
        if sp is not None and len(sp) == len(dist):
            sp_arr = np.asarray(sp, dtype=np.float64)
            tail_mask = dist >= (dist[-1] - 300.0)
            if np.any(tail_mask) and float(np.min(sp_arr[tail_mask])) < 60.0:
                return False
            break
    if "x" in telemetry and "y" in telemetry:
        x_arr = np.asarray(telemetry["x"], dtype=np.float64)
        y_arr = np.asarray(telemetry["y"], dtype=np.float64)
        if len(x_arr) >= 2 and len(x_arr) == len(y_arr):
            _, _, is_inc = sanitize_xy_teleport(x_arr, y_arr, MAX_TELEPORT_STEP_M)
            if is_inc:
                return False
            gap = float(np.hypot(x_arr[-1] - x_arr[0], y_arr[-1] - y_arr[0]))
            if gap > MAX_COMPLETE_LAP_DRIFT_M:
                return False
    return True


def sanitize_xy_teleport(
    x: np.ndarray,
    y: np.ndarray,
    max_step_m: float = MAX_TELEPORT_STEP_M,
) -> tuple[np.ndarray, np.ndarray, bool]:
    """
    Truncate (x, y) series at index i-1 when step_dist = hypot(x[i]-x[i-1], y[i]-y[i-1]) > max_step_m.
    Returns (truncated_x, truncated_y, is_incomplete).
    """
    x_arr = np.asarray(x, dtype=np.float64)
    y_arr = np.asarray(y, dtype=np.float64)
    if len(x_arr) < 2 or len(y_arr) < 2:
        return x_arr, y_arr, False
    step_dist = np.hypot(np.diff(x_arr), np.diff(y_arr))
    jumps = np.where(step_dist > max_step_m)[0]
    if len(jumps) > 0:
        cut = int(jumps[0]) + 1
        return x_arr[:cut], y_arr[:cut], True
    return x_arr, y_arr, False


def _is_mirrored_frame(x: np.ndarray, y: np.ndarray, lat_accel: np.ndarray | None) -> bool:
    """True when recorded (x, y) lives in a left-handed frame that disagrees with lateral acceleration."""
    if lat_accel is None or len(lat_accel) != len(x) or len(x) < 4:
        return False
    heading = np.unwrap(np.arctan2(np.gradient(y), np.gradient(x)))
    geometric_turn = np.gradient(heading)
    turning = np.abs(lat_accel) > 0.05
    if int(np.sum(turning)) < 20:
        return False
    agreement = float(np.mean(np.sign(geometric_turn[turning]) == np.sign(lat_accel[turning])))
    return agreement < 0.5


def _auto_orient(x: np.ndarray, y: np.ndarray, lat_accel: np.ndarray | None) -> tuple[np.ndarray, np.ndarray]:
    """
    Recorded positions can live in a mirrored frame (left-handed game coordinates). The
    lateral acceleration channel says which way the car really turned, so flip the frame
    whenever the drawn geometry disagrees with it on most lateral samples.
    """
    if _is_mirrored_frame(x, y, lat_accel):
        return x, -y
    return x, y


def _canonical_transform(x: np.ndarray, y: np.ndarray) -> tuple[float, float, np.ndarray, float]:
    """
    Compute the rigid canonical frame parameters (cx, cy, rot_matrix, sign_180) so multiple
    traces (track_x/y, ref_x/y, comp_x/y) can be placed in the exact same right-handed frame.
    """
    n = len(x)
    cx, cy = float(np.mean(x)), float(np.mean(y))
    if n < 4:
        return cx, cy, np.eye(2), 1.0
    pts = np.vstack([x - cx, y - cy]).T
    cov = (pts.T @ pts) / n
    evals, evecs = np.linalg.eigh(cov)
    major = evecs[:, int(np.argmax(evals))]
    angle = float(np.arctan2(major[1], major[0]))
    cos_a, sin_a = np.cos(-angle), np.sin(-angle)
    rot = np.array([[cos_a, -sin_a], [sin_a, cos_a]])
    can = pts @ rot.T
    sign = -1.0 if float(np.mean(can[: max(3, n // 20), 0])) > 0.0 else 1.0
    return cx, cy, rot, sign


def _apply_canonical_transform(
    x: np.ndarray,
    y: np.ndarray,
    cx: float,
    cy: float,
    rot: np.ndarray,
    sign: float,
) -> tuple[np.ndarray, np.ndarray]:
    pts = np.vstack([x - cx, y - cy]).T
    can = sign * (pts @ rot.T)
    return can[:, 0], can[:, 1]


def _canonical_frame(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Draw the lap the same way whichever frame it was recorded in: recentre on the
    centroid, lay the loop's principal axis horizontally and, between the two possible
    180-degree choices, keep the lap start on the left half of the map.
    """
    if len(x) < 4:
        return x, y
    cx, cy, rot, sign = _canonical_transform(x, y)
    return _apply_canonical_transform(x, y, cx, cy, rot, sign)


def orient_aligned_positions(aligned: dict[str, np.ndarray]) -> None:
    """
    Orient aligned['x']/['y'], aligned['ref_x']/['ref_y'], and aligned['comp_x']/['comp_y']
    into the same right-handed canonical frame so recorded world positions never render mirrored.
    """
    if "x" not in aligned or "y" not in aligned:
        return
    base_x = np.asarray(aligned["x"], dtype=np.float64).copy()
    base_y = np.asarray(aligned["y"], dtype=np.float64).copy()
    if len(base_x) <= 10 or (float(np.var(base_x)) <= 1.0 and float(np.var(base_y)) <= 1.0):
        return

    lat = None
    for key in ("ref_lat_accel", "comp_lat_accel", "lat_accel"):
        channel = aligned.get(key)
        if channel is not None and len(channel) == len(base_x) and float(np.max(np.abs(channel))) > 0.05:
            lat = np.asarray(channel, dtype=np.float64)
            break

    mirrored = _is_mirrored_frame(base_x, base_y, lat)
    if mirrored:
        base_y = -base_y

    _, _, is_inc = sanitize_xy_teleport(base_x, base_y, MAX_TELEPORT_STEP_M)
    is_incomplete = bool(is_inc or aligned.get("is_incomplete", False))
    closure_gap = float(np.hypot(base_x[-1] - base_x[0], base_y[-1] - base_y[0])) if len(base_x) > 1 else 0.0
    if not is_incomplete and closure_gap <= MAX_CLOSURE_GAP_M:
        base_x, base_y = apply_loop_closure_drift_correction(base_x, base_y)

    cx, cy, rot, sign = _canonical_transform(base_x, base_y)
    aligned["x"], aligned["y"] = _apply_canonical_transform(base_x, base_y, cx, cy, rot, sign)

    for prefix in ("ref_", "comp_"):
        kx, ky = f"{prefix}x", f"{prefix}y"
        if kx in aligned and ky in aligned:
            px = np.asarray(aligned[kx], dtype=np.float64).copy()
            py = np.asarray(aligned[ky], dtype=np.float64).copy()
            if np.any(px != 0.0) or np.any(py != 0.0):
                if mirrored:
                    py = -py
                px_gap = float(np.hypot(px[-1] - px[0], py[-1] - py[0])) if len(px) > 1 else 0.0
                if not is_incomplete and px_gap <= MAX_CLOSURE_GAP_M:
                    px, py = apply_loop_closure_drift_correction(px, py)
                aligned[kx], aligned[ky] = _apply_canonical_transform(px, py, cx, cy, rot, sign)


def generate_track_coordinates(
    track_name: str,
    distance: np.ndarray,
    telemetry: dict[str, np.ndarray] | None = None,
) -> tuple[list[float], list[float]]:
    """
    Closed 2D outline (x, y) for the track map, inferred from the telemetry itself,
    whatever track it is, from the first source available:
    1. recorded position channels, auto-oriented against the lateral acceleration so a
       mirrored coordinate frame can never paint corners the wrong way round;
    2. the outline dead-reckoned from speed and lateral acceleration;
    3. a plain circle scaled to the lap length.
    Every path is returned in a canonical frame: centred, upright and start-on-the-left.
    Never closes the polygon if the lap is incomplete (teleport jump > 25m) or start-to-end gap > 30m.
    """
    distance = np.asarray(distance, dtype=np.float64)
    track_len = get_track_length(track_name)
    covered_len = float(distance[-1] - distance[0]) if len(distance) > 1 else 0.0

    if telemetry and "x" in telemetry and "y" in telemetry:
        raw_x = np.array(telemetry["x"], dtype=np.float64)
        raw_y = np.array(telemetry["y"], dtype=np.float64)
        if len(raw_x) > 10 and (float(np.var(raw_x)) > 1.0 or float(np.var(raw_y)) > 1.0):
            raw_x, raw_y, is_inc = sanitize_xy_teleport(raw_x, raw_y, MAX_TELEPORT_STEP_M)
            is_incomplete = bool(is_inc or telemetry.get("is_incomplete", False))
            lat = None
            for key in ("ref_lat_accel", "comp_lat_accel", "lat_accel"):
                channel = telemetry.get(key)
                if (
                    channel is not None
                    and len(channel) >= len(raw_x)
                    and float(np.max(np.abs(channel[: len(raw_x)]))) > 0.05
                ):
                    lat = np.asarray(channel[: len(raw_x)], dtype=np.float64)
                    break
            raw_x, raw_y = _auto_orient(raw_x, raw_y, lat)
            closure_gap = float(np.hypot(raw_x[-1] - raw_x[0], raw_y[-1] - raw_y[0])) if len(raw_x) > 1 else 0.0
            max_drift = MAX_COMPLETE_LAP_DRIFT_M if covered_len >= 0.98 * track_len else MAX_CLOSURE_GAP_M
            if not is_incomplete and closure_gap <= max_drift:
                raw_x, raw_y = apply_loop_closure_drift_correction(raw_x, raw_y)
            raw_x, raw_y = _canonical_frame(raw_x, raw_y)
            return raw_x.tolist(), raw_y.tolist()

    if telemetry:
        pair = _lateral_accel_channel(telemetry, len(distance))
        if pair is not None:
            speed, lat = pair
            recon_x, recon_y = reconstruct_track_from_dynamics(distance, speed, lat)
            recon_x, recon_y = _canonical_frame(np.asarray(recon_x), np.asarray(recon_y))
            return recon_x.tolist(), recon_y.tolist()

    total_dist = float(distance[-1]) if len(distance) > 0 else 0.0
    angle = 2.0 * np.pi * distance / max(total_dist, 1.0)
    radius = max(total_dist, 1.0) / (2.0 * np.pi)
    return (radius * np.cos(angle)).tolist(), (radius * np.sin(angle)).tolist()
