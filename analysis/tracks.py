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

# Sebring International Raceway corners (approximate distances along the 6019 m lap)
SEBRING_CORNERS: list[dict[str, Any]] = [
    {
        "number": 1,
        "name": "Turn 1 Sweeper",
        "start": 420.0,
        "apex": 720.0,
        "end": 950.0,
        "gear": 4,
        "target_speed": 172.0,
        "turn_dir": "left",
    },
    {
        "number": 2,
        "name": "Turn 2",
        "start": 1050.0,
        "apex": 1180.0,
        "end": 1280.0,
        "gear": 5,
        "target_speed": 210.0,
        "turn_dir": "right",
    },
    {
        "number": 3,
        "name": "Turn 3",
        "start": 1280.0,
        "apex": 1380.0,
        "end": 1480.0,
        "gear": 4,
        "target_speed": 165.0,
        "turn_dir": "right",
    },
    {
        "number": 4,
        "name": "Turn 4",
        "start": 1480.0,
        "apex": 1560.0,
        "end": 1660.0,
        "gear": 3,
        "target_speed": 125.0,
        "turn_dir": "left",
    },
    {
        "number": 5,
        "name": "Turn 5",
        "start": 1660.0,
        "apex": 1780.0,
        "end": 1900.0,
        "gear": 3,
        "target_speed": 130.0,
        "turn_dir": "right",
    },
    {
        "number": 6,
        "name": "Big Bend (T6)",
        "start": 1900.0,
        "apex": 2050.0,
        "end": 2250.0,
        "gear": 3,
        "target_speed": 140.0,
        "turn_dir": "left",
    },
    {
        "number": 7,
        "name": "Hairpin (T7)",
        "start": 2280.0,
        "apex": 2420.0,
        "end": 2550.0,
        "gear": 2,
        "target_speed": 72.0,
        "turn_dir": "right",
    },
    {
        "number": 8,
        "name": "Fangio Chicane Entry",
        "start": 2650.0,
        "apex": 2750.0,
        "end": 2850.0,
        "gear": 3,
        "target_speed": 135.0,
        "turn_dir": "left",
    },
    {
        "number": 9,
        "name": "Fangio Chicane Exit",
        "start": 2850.0,
        "apex": 2950.0,
        "end": 3050.0,
        "gear": 3,
        "target_speed": 140.0,
        "turn_dir": "right",
    },
    {
        "number": 10,
        "name": "Cunningham (T10)",
        "start": 3050.0,
        "apex": 3150.0,
        "end": 3280.0,
        "gear": 3,
        "target_speed": 130.0,
        "turn_dir": "right",
    },
    {
        "number": 11,
        "name": "Collier (T11)",
        "start": 3350.0,
        "apex": 3460.0,
        "end": 3580.0,
        "gear": 3,
        "target_speed": 128.0,
        "turn_dir": "right",
    },
    {
        "number": 12,
        "name": "Tower Turn (T12)",
        "start": 3680.0,
        "apex": 3820.0,
        "end": 3980.0,
        "gear": 2,
        "target_speed": 88.0,
        "turn_dir": "right",
    },
    {
        "number": 13,
        "name": "Tower Straight Bend",
        "start": 4150.0,
        "apex": 4280.0,
        "end": 4400.0,
        "gear": 4,
        "target_speed": 180.0,
        "turn_dir": "right",
    },
    {
        "number": 14,
        "name": "Gendebien Bend (T14)",
        "start": 4400.0,
        "apex": 4520.0,
        "end": 4650.0,
        "gear": 4,
        "target_speed": 165.0,
        "turn_dir": "left",
    },
    {
        "number": 15,
        "name": "Turn 15 Bend",
        "start": 4750.0,
        "apex": 4880.0,
        "end": 5000.0,
        "gear": 4,
        "target_speed": 190.0,
        "turn_dir": "left",
    },
    {
        "number": 16,
        "name": "Le Mans Curve (T16)",
        "start": 5000.0,
        "apex": 5150.0,
        "end": 5300.0,
        "gear": 3,
        "target_speed": 145.0,
        "turn_dir": "right",
    },
    {
        "number": 17,
        "name": "Sunset Bend (T17)",
        "start": 5600.0,
        "apex": 5820.0,
        "end": 6000.0,
        "gear": 3,
        "target_speed": 138.0,
        "turn_dir": "right",
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
    return 4500.0


def known_track_corners(track_name: str | None) -> list[dict[str, Any]] | None:
    """Corner table for tracks we have mapped, None for any other track."""
    t_norm = (track_name or "").lower()
    if "sebring" in t_norm:
        return SEBRING_CORNERS
    if "valencia" in t_norm or "ricardo" in t_norm or "cheste" in t_norm:
        return VALENCIA_CORNERS
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


def _lateral_accel_channel(
    telemetry: dict[str, np.ndarray], length: int
) -> tuple[np.ndarray, np.ndarray] | None:
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


def _auto_orient(
    x: np.ndarray, y: np.ndarray, lat_accel: np.ndarray | None
) -> tuple[np.ndarray, np.ndarray]:
    """
    Recorded positions can live in a mirrored frame (left-handed game coordinates). The
    lateral acceleration channel says which way the car really turned, so flip the frame
    whenever the drawn geometry disagrees with it on most lateral samples.
    """
    if lat_accel is None or len(lat_accel) != len(x):
        return x, y
    heading = np.unwrap(np.arctan2(np.gradient(y), np.gradient(x)))
    geometric_turn = np.gradient(heading)
    turning = np.abs(lat_accel) > 0.05
    if int(np.sum(turning)) < 20:
        return x, y
    agreement = float(np.mean(np.sign(geometric_turn[turning]) == np.sign(lat_accel[turning])))
    if agreement < 0.5:
        return x, -y
    return x, y


def _canonical_frame(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Draw the lap the same way whichever frame it was recorded in: recentre on the
    centroid, lay the loop's principal axis horizontally and, between the two possible
    180-degree choices, keep the lap start on the left half of the map.
    """
    n = len(x)
    if n < 4:
        return x, y
    pts = np.vstack([x - float(np.mean(x)), y - float(np.mean(y))]).T
    cov = (pts.T @ pts) / n
    evals, evecs = np.linalg.eigh(cov)
    major = evecs[:, int(np.argmax(evals))]
    angle = float(np.arctan2(major[1], major[0]))
    cos_a, sin_a = np.cos(-angle), np.sin(-angle)
    rot = np.array([[cos_a, -sin_a], [sin_a, cos_a]])
    can = pts @ rot.T
    if float(np.mean(can[: max(3, n // 20), 0])) > 0.0:
        can = -can
    return can[:, 0], can[:, 1]


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
    """
    distance = np.asarray(distance, dtype=np.float64)

    if telemetry and "x" in telemetry and "y" in telemetry:
        raw_x = np.array(telemetry["x"], dtype=np.float64)
        raw_y = np.array(telemetry["y"], dtype=np.float64)
        if len(raw_x) > 10 and (float(np.var(raw_x)) > 1.0 or float(np.var(raw_y)) > 1.0):
            lat = None
            for key in ("ref_lat_accel", "comp_lat_accel", "lat_accel"):
                channel = telemetry.get(key)
                if channel is not None and len(channel) == len(raw_x) and float(np.max(np.abs(channel))) > 0.05:
                    lat = np.asarray(channel, dtype=np.float64)
                    break
            raw_x, raw_y = _auto_orient(raw_x, raw_y, lat)
            raw_x[-1], raw_y[-1] = raw_x[0], raw_y[0]
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
