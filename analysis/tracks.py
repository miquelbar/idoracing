"""
Circuit geometry for IdoRacing Analytics: corner tables for the mapped tracks (Valencia, Sebring)
and the 2D outline drawn on the track map.
"""

import json
import logging
import os
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Hand-placed outline of Circuit Ricardo Tormo (Valencia, 4005 m); approximate, not surveyed
VALENCIA_WAYPOINTS = [
    (0.0, 300.0, 420.0),  # Start / Finish line
    (300.0, 600.0, 420.0),  # Main straight
    (580.0, 800.0, 420.0),  # Turn 1 Braking
    (780.0, 850.0, 360.0),  # Turn 1 (Aspar) Apex
    (920.0, 810.0, 270.0),  # Turn 1 Exit / Turn 2 Entry
    (1080.0, 720.0, 240.0),  # Turn 2 (Doohan) Apex
    (1220.0, 640.0, 250.0),  # Turn 2 Exit / Turn 3 Entry
    (1320.0, 600.0, 270.0),  # Turn 3 Apex
    (1420.0, 570.0, 300.0),  # Turn 4 Braking
    (1530.0, 540.0, 340.0),  # Turn 4 (Nico Terol) Apex
    (1660.0, 490.0, 310.0),  # Turn 4 Exit / Turn 5 Entry
    (1750.0, 450.0, 280.0),  # Turn 5 Apex
    (1840.0, 420.0, 250.0),  # Turn 6 Entry
    (1940.0, 390.0, 220.0),  # Turn 6 Apex
    (2040.0, 380.0, 190.0),  # Turn 7 Entry
    (2100.0, 400.0, 170.0),  # Turn 7 Apex
    (2160.0, 430.0, 160.0),  # Turn 8 Entry
    (2260.0, 460.0, 150.0),  # Turn 8 (Bernat Martínez) Apex
    (2380.0, 430.0, 130.0),  # Turn 8 Exit
    (2460.0, 370.0, 110.0),  # Turn 9 Apex
    (2550.0, 310.0, 110.0),  # Turn 10 Entry
    (2650.0, 250.0, 110.0),  # Turn 10 Apex
    (2800.0, 190.0, 120.0),  # Turn 11 Braking
    (2980.0, 150.0, 160.0),  # Turn 11 (Champi Herreros) Apex
    (3120.0, 140.0, 220.0),  # Turn 11 Exit / Turn 12 Entry
    (3260.0, 130.0, 280.0),  # Turn 12 Apex
    (3400.0, 120.0, 320.0),  # Turn 13 Entry
    (3520.0, 110.0, 350.0),  # Turn 13 Apex
    (3620.0, 110.0, 380.0),  # Turn 14 Entry
    (3740.0, 130.0, 410.0),  # Turn 14 (Adrián Campos) Apex
    (3900.0, 180.0, 420.0),  # Final corner exit onto Pit Straight
    (4005.0, 300.0, 420.0),  # Closes loop at Start / Finish line
]

# Hand-placed outline of Sebring International Raceway (6019 m), used if data/circuits/sebring.json is missing
SEBRING_WAYPOINTS = [
    (0.0, 320.0, 470.0),  # Start / Finish line
    (420.0, 580.0, 470.0),  # Approaching Turn 1
    (720.0, 750.0, 410.0),  # Turn 1 (High-speed sweeper left)
    (1100.0, 760.0, 300.0),  # Turn 2 / 3 Right-hand bend
    (1500.0, 680.0, 220.0),  # Turn 4 / 5 Complex
    (1950.0, 560.0, 170.0),  # Big Bend entry (Turn 6)
    (2400.0, 460.0, 130.0),  # Hairpin (Turn 7)
    (2750.0, 410.0, 200.0),  # Fangio Chicane (T8-T9)
    (3100.0, 360.0, 230.0),  # Cunningham (Turn 10)
    (3450.0, 300.0, 210.0),  # Collier (Turn 11)
    (3800.0, 240.0, 190.0),  # Tower Turn (Turn 12)
    (4350.0, 180.0, 150.0),  # Gendebien Bend (Turn 14)
    (4950.0, 130.0, 110.0),  # Le Mans curve (Turn 16)
    (5400.0, 110.0, 280.0),  # Ulmann Straight
    (5800.0, 160.0, 440.0),  # Sunset Bend (Turn 17)
    (6019.0, 320.0, 470.0),  # Finish line (Closes loop)
]

# Valencia Ricardo Tormo corners (approximate distances along the 4005 m lap)
VALENCIA_CORNERS: list[dict[str, Any]] = [
    {
        "number": 1,
        "name": "Curva Aspar",
        "start": 580.0,
        "apex": 780.0,
        "end": 900.0,
        "gear": 3,
        "target_speed": 142.0,
        "turn_dir": "left",
    },
    {
        "number": 2,
        "name": "Curva Doohan",
        "start": 920.0,
        "apex": 1080.0,
        "end": 1220.0,
        "gear": 3,
        "target_speed": 128.0,
        "turn_dir": "right",
    },
    {
        "number": 3,
        "name": "Curva 3",
        "start": 1220.0,
        "apex": 1320.0,
        "end": 1420.0,
        "gear": 4,
        "target_speed": 175.0,
        "turn_dir": "right",
    },
    {
        "number": 4,
        "name": "Curva Nico Terol",
        "start": 1420.0,
        "apex": 1530.0,
        "end": 1660.0,
        "gear": 2,
        "target_speed": 78.0,
        "turn_dir": "right",
    },
    {
        "number": 5,
        "name": "Curva 5",
        "start": 1660.0,
        "apex": 1750.0,
        "end": 1840.0,
        "gear": 3,
        "target_speed": 138.0,
        "turn_dir": "left",
    },
    {
        "number": 6,
        "name": "Curva 6",
        "start": 1840.0,
        "apex": 1940.0,
        "end": 2040.0,
        "gear": 3,
        "target_speed": 145.0,
        "turn_dir": "left",
    },
    {
        "number": 7,
        "name": "Curva 7",
        "start": 2040.0,
        "apex": 2100.0,
        "end": 2160.0,
        "gear": 3,
        "target_speed": 152.0,
        "turn_dir": "left",
    },
    {
        "number": 8,
        "name": "Curva Bernat Martinez",
        "start": 2160.0,
        "apex": 2260.0,
        "end": 2380.0,
        "gear": 2,
        "target_speed": 92.0,
        "turn_dir": "right",
    },
    {
        "number": 9,
        "name": "Curva 9",
        "start": 2380.0,
        "apex": 2460.0,
        "end": 2550.0,
        "gear": 3,
        "target_speed": 130.0,
        "turn_dir": "left",
    },
    {
        "number": 10,
        "name": "Curva 10",
        "start": 2550.0,
        "apex": 2650.0,
        "end": 2800.0,
        "gear": 3,
        "target_speed": 135.0,
        "turn_dir": "left",
    },
    {
        "number": 11,
        "name": "Curva Champi Herreros",
        "start": 2800.0,
        "apex": 2980.0,
        "end": 3120.0,
        "gear": 2,
        "target_speed": 85.0,
        "turn_dir": "right",
    },
    {
        "number": 12,
        "name": "Curva 12",
        "start": 3120.0,
        "apex": 3260.0,
        "end": 3400.0,
        "gear": 3,
        "target_speed": 125.0,
        "turn_dir": "left",
    },
    {
        "number": 13,
        "name": "Curva 13",
        "start": 3400.0,
        "apex": 3520.0,
        "end": 3620.0,
        "gear": 3,
        "target_speed": 138.0,
        "turn_dir": "left",
    },
    {
        "number": 14,
        "name": "Curva Adrian Campos",
        "start": 3620.0,
        "apex": 3740.0,
        "end": 3950.0,
        "gear": 2,
        "target_speed": 89.0,
        "turn_dir": "left",
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


def load_verified_circuit_coordinates(circuit_slug: str) -> tuple[np.ndarray, np.ndarray] | None:
    """
    Load a circuit centreline from data/circuits/<slug>.json.
    Returns (coordinates_array_Nx2, cumulative_distances_N) or None if not available.
    """
    slug = circuit_slug.lower().strip()
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "data", "circuits", f"{slug}.json"),
        os.path.join(os.path.dirname(__file__), "circuits", f"{slug}.json"),
        os.path.join("data", "circuits", f"{slug}.json"),
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, encoding="utf-8") as f:
                    data = json.load(f)
                coords = np.array(data["coordinates"], dtype=np.float64)
                dists = np.array(data["distances"], dtype=np.float64)
                if len(coords) > 10 and len(coords) == len(dists):
                    return coords, dists
            except (OSError, ValueError, KeyError) as e:
                logger.warning("Ignoring unreadable circuit file %s: %s", p, e)
    return None


def generate_track_coordinates(
    track_name: str,
    distance: np.ndarray,
    telemetry: dict[str, np.ndarray] | None = None,
) -> tuple[list[float], list[float]]:
    """
    Closed 2D outline (x, y) for the track map, from the first source available:
    recorded position channels, the mapped track outline, the outline dead-reckoned
    from speed and lateral acceleration, or a plain circle.
    """
    if telemetry and "x" in telemetry and "y" in telemetry:
        raw_x = np.array(telemetry["x"], dtype=np.float64)
        raw_y = np.array(telemetry["y"], dtype=np.float64)
        if len(raw_x) > 10 and (float(np.var(raw_x)) > 1.0 or float(np.var(raw_y)) > 1.0):
            x_out = raw_x.tolist()
            y_out = raw_y.tolist()
            x_out[-1] = x_out[0]
            y_out[-1] = y_out[0]
            return x_out, y_out

    t_norm = (track_name or "").lower()
    total_dist = float(distance[-1]) if len(distance) > 0 else 0.0

    if "sebring" in t_norm:
        verified = load_verified_circuit_coordinates("sebring")
        if verified is not None:
            coords, dists = verified
            norm_dists = dists / dists[-1]
            norm_target = (distance - distance[0]) / max(1.0, distance[-1] - distance[0])

            x_interp = np.interp(norm_target, norm_dists, coords[:, 0])
            y_interp = np.interp(norm_target, norm_dists, coords[:, 1])

            if len(x_interp) > 1:
                x_interp[-1] = x_interp[0]
                y_interp[-1] = y_interp[0]

            return x_interp.tolist(), y_interp.tolist()
        raw_waypoints = SEBRING_WAYPOINTS
        base_len = 6019.0
    elif "valencia" in t_norm or "ricardo tormo" in t_norm or "cheste" in t_norm:
        raw_waypoints = VALENCIA_WAYPOINTS
        base_len = 4005.0
    elif (
        telemetry is not None
        and "ref_speed" in telemetry
        and "ref_lat_accel" in telemetry
        and float(np.max(np.abs(telemetry["ref_lat_accel"]))) > 0.05
    ):
        return reconstruct_track_from_dynamics(
            np.asarray(distance, dtype=np.float64),
            np.asarray(telemetry["ref_speed"], dtype=np.float64),
            np.asarray(telemetry["ref_lat_accel"], dtype=np.float64),
        )
    else:
        angle = 2.0 * np.pi * np.asarray(distance) / max(total_dist, 1.0)
        radius = max(total_dist, 1.0) / (2.0 * np.pi)
        return (radius * np.cos(angle)).tolist(), (radius * np.sin(angle)).tolist()

    wp_d = np.array([w[0] for w in raw_waypoints])
    wp_x = np.array([w[1] for w in raw_waypoints])
    wp_y = np.array([w[2] for w in raw_waypoints])

    # Scale distance domain to actual lap length
    scale_d = total_dist / base_len
    scaled_wp_d = wp_d * scale_d

    x_raw = np.interp(distance, scaled_wp_d, wp_x)
    y_raw = np.interp(distance, scaled_wp_d, wp_y)

    # Smooth curve with circular wrapping convolution to round apexes
    w = 15
    kernel = np.ones(w) / w
    x_smooth = np.convolve(np.pad(x_raw, w // 2, mode="wrap"), kernel, mode="valid")
    y_smooth = np.convolve(np.pad(y_raw, w // 2, mode="wrap"), kernel, mode="valid")

    # Guarantee exact closed loop
    if len(x_smooth) > 1:
        x_smooth[-1] = x_smooth[0]
        y_smooth[-1] = y_smooth[0]

    return x_smooth.tolist(), y_smooth.tolist()
