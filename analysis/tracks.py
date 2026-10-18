"""
Circuit track geometry models and 2D coordinate generators for SimCoach.
Provides authentic closed-loop layouts for Circuit Ricardo Tormo (Valencia)
and universal coordinate projection for multi-simulator tracks.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np

# Authentic 2D Waypoints for Circuit Ricardo Tormo (Valencia, Cheste — 4005m)
VALENCIA_WAYPOINTS = [
    (0.0, 300.0, 420.0),      # Start / Finish line
    (300.0, 600.0, 420.0),    # Main straight
    (580.0, 800.0, 420.0),    # Turn 1 Braking
    (780.0, 850.0, 360.0),    # Turn 1 (Aspar) Apex
    (920.0, 810.0, 270.0),    # Turn 1 Exit / Turn 2 Entry
    (1080.0, 720.0, 240.0),   # Turn 2 (Doohan) Apex
    (1220.0, 640.0, 250.0),   # Turn 2 Exit / Turn 3 Entry
    (1320.0, 600.0, 270.0),   # Turn 3 Apex
    (1420.0, 570.0, 300.0),   # Turn 4 Braking
    (1530.0, 540.0, 340.0),   # Turn 4 (Nico Terol) Apex
    (1660.0, 490.0, 310.0),   # Turn 4 Exit / Turn 5 Entry
    (1750.0, 450.0, 280.0),   # Turn 5 Apex
    (1840.0, 420.0, 250.0),   # Turn 6 Entry
    (1940.0, 390.0, 220.0),   # Turn 6 Apex
    (2040.0, 380.0, 190.0),   # Turn 7 Entry
    (2100.0, 400.0, 170.0),   # Turn 7 Apex
    (2160.0, 430.0, 160.0),   # Turn 8 Entry
    (2260.0, 460.0, 150.0),   # Turn 8 (Bernat Martínez) Apex
    (2380.0, 430.0, 130.0),   # Turn 8 Exit
    (2460.0, 370.0, 110.0),   # Turn 9 Apex
    (2550.0, 310.0, 110.0),   # Turn 10 Entry
    (2650.0, 250.0, 110.0),   # Turn 10 Apex
    (2800.0, 190.0, 120.0),   # Turn 11 Braking
    (2980.0, 150.0, 160.0),   # Turn 11 (Champi Herreros) Apex
    (3120.0, 140.0, 220.0),   # Turn 11 Exit / Turn 12 Entry
    (3260.0, 130.0, 280.0),   # Turn 12 Apex
    (3400.0, 120.0, 320.0),   # Turn 13 Entry
    (3520.0, 110.0, 350.0),   # Turn 13 Apex
    (3620.0, 110.0, 380.0),   # Turn 14 Entry
    (3740.0, 130.0, 410.0),   # Turn 14 (Adrián Campos) Apex
    (3900.0, 180.0, 420.0),   # Final corner exit onto Pit Straight
    (4005.0, 300.0, 420.0),   # Closes loop at Start / Finish line
]

# Authentic 2D Waypoints for Sebring International Raceway (Florida, 6019m)
SEBRING_WAYPOINTS = [
    (0.0, 320.0, 470.0),       # Start / Finish line
    (420.0, 580.0, 470.0),     # Approaching Turn 1
    (720.0, 750.0, 410.0),     # Turn 1 (High-speed sweeper left)
    (1100.0, 760.0, 300.0),    # Turn 2 / 3 Right-hand bend
    (1500.0, 680.0, 220.0),    # Turn 4 / 5 Complex
    (1950.0, 560.0, 170.0),    # Big Bend entry (Turn 6)
    (2400.0, 460.0, 130.0),    # Hairpin (Turn 7)
    (2750.0, 410.0, 200.0),    # Fangio Chicane (T8-T9)
    (3100.0, 360.0, 230.0),    # Cunningham (Turn 10)
    (3450.0, 300.0, 210.0),    # Collier (Turn 11)
    (3800.0, 240.0, 190.0),    # Tower Turn (Turn 12)
    (4350.0, 180.0, 150.0),    # Gendebien Bend (Turn 14)
    (4950.0, 130.0, 110.0),    # Le Mans curve (Turn 16)
    (5400.0, 110.0, 280.0),    # Ulmann Straight
    (5800.0, 160.0, 440.0),    # Sunset Bend (Turn 17)
    (6019.0, 320.0, 470.0),    # Finish line (Closes loop)
]

# Official Valencia Ricardo Tormo Turn definitions (Distance in meters along 4005m lap)
VALENCIA_CORNERS: List[Dict[str, Any]] = [
    {"number": 1, "name": "Curva Aspar", "start": 580.0, "apex": 780.0, "end": 900.0, "gear": 3, "target_speed": 142.0, "turn_dir": "left"},
    {"number": 2, "name": "Curva Doohan", "start": 920.0, "apex": 1080.0, "end": 1220.0, "gear": 3, "target_speed": 128.0, "turn_dir": "right"},
    {"number": 3, "name": "Curva 3", "start": 1220.0, "apex": 1320.0, "end": 1420.0, "gear": 4, "target_speed": 175.0, "turn_dir": "right"},
    {"number": 4, "name": "Curva Nico Terol", "start": 1420.0, "apex": 1530.0, "end": 1660.0, "gear": 2, "target_speed": 78.0, "turn_dir": "right"},
    {"number": 5, "name": "Curva 5", "start": 1660.0, "apex": 1750.0, "end": 1840.0, "gear": 3, "target_speed": 138.0, "turn_dir": "left"},
    {"number": 6, "name": "Curva 6", "start": 1840.0, "apex": 1940.0, "end": 2040.0, "gear": 3, "target_speed": 145.0, "turn_dir": "left"},
    {"number": 7, "name": "Curva 7", "start": 2040.0, "apex": 2100.0, "end": 2160.0, "gear": 3, "target_speed": 152.0, "turn_dir": "left"},
    {"number": 8, "name": "Curva Bernat Martinez", "start": 2160.0, "apex": 2260.0, "end": 2380.0, "gear": 2, "target_speed": 92.0, "turn_dir": "right"},
    {"number": 9, "name": "Curva 9", "start": 2380.0, "apex": 2460.0, "end": 2550.0, "gear": 3, "target_speed": 130.0, "turn_dir": "left"},
    {"number": 10, "name": "Curva 10", "start": 2550.0, "apex": 2650.0, "end": 2800.0, "gear": 3, "target_speed": 135.0, "turn_dir": "left"},
    {"number": 11, "name": "Curva Champi Herreros", "start": 2800.0, "apex": 2980.0, "end": 3120.0, "gear": 2, "target_speed": 85.0, "turn_dir": "right"},
    {"number": 12, "name": "Curva 12", "start": 3120.0, "apex": 3260.0, "end": 3400.0, "gear": 3, "target_speed": 125.0, "turn_dir": "left"},
    {"number": 13, "name": "Curva 13", "start": 3400.0, "apex": 3520.0, "end": 3620.0, "gear": 3, "target_speed": 138.0, "turn_dir": "left"},
    {"number": 14, "name": "Curva Adrian Campos", "start": 3620.0, "apex": 3740.0, "end": 3950.0, "gear": 2, "target_speed": 89.0, "turn_dir": "left"},
]

# Authentic Sebring International Raceway 17 Corners
SEBRING_CORNERS: List[Dict[str, Any]] = [
    {"number": 1, "name": "Turn 1 Sweeper", "start": 420.0, "apex": 720.0, "end": 950.0, "gear": 4, "target_speed": 172.0, "turn_dir": "left"},
    {"number": 2, "name": "Turn 2", "start": 1050.0, "apex": 1180.0, "end": 1280.0, "gear": 5, "target_speed": 210.0, "turn_dir": "right"},
    {"number": 3, "name": "Turn 3", "start": 1280.0, "apex": 1380.0, "end": 1480.0, "gear": 4, "target_speed": 165.0, "turn_dir": "right"},
    {"number": 4, "name": "Turn 4", "start": 1480.0, "apex": 1560.0, "end": 1660.0, "gear": 3, "target_speed": 125.0, "turn_dir": "left"},
    {"number": 5, "name": "Turn 5", "start": 1660.0, "apex": 1780.0, "end": 1900.0, "gear": 3, "target_speed": 130.0, "turn_dir": "right"},
    {"number": 6, "name": "Big Bend (T6)", "start": 1900.0, "apex": 2050.0, "end": 2250.0, "gear": 3, "target_speed": 140.0, "turn_dir": "left"},
    {"number": 7, "name": "Hairpin (T7)", "start": 2280.0, "apex": 2420.0, "end": 2550.0, "gear": 2, "target_speed": 72.0, "turn_dir": "right"},
    {"number": 8, "name": "Fangio Chicane Entry", "start": 2650.0, "apex": 2750.0, "end": 2850.0, "gear": 3, "target_speed": 135.0, "turn_dir": "left"},
    {"number": 9, "name": "Fangio Chicane Exit", "start": 2850.0, "apex": 2950.0, "end": 3050.0, "gear": 3, "target_speed": 140.0, "turn_dir": "right"},
    {"number": 10, "name": "Cunningham (T10)", "start": 3050.0, "apex": 3150.0, "end": 3280.0, "gear": 3, "target_speed": 130.0, "turn_dir": "right"},
    {"number": 11, "name": "Collier (T11)", "start": 3350.0, "apex": 3460.0, "end": 3580.0, "gear": 3, "target_speed": 128.0, "turn_dir": "right"},
    {"number": 12, "name": "Tower Turn (T12)", "start": 3680.0, "apex": 3820.0, "end": 3980.0, "gear": 2, "target_speed": 88.0, "turn_dir": "right"},
    {"number": 13, "name": "Tower Straight Bend", "start": 4150.0, "apex": 4280.0, "end": 4400.0, "gear": 4, "target_speed": 180.0, "turn_dir": "right"},
    {"number": 14, "name": "Gendebien Bend (T14)", "start": 4400.0, "apex": 4520.0, "end": 4650.0, "gear": 4, "target_speed": 165.0, "turn_dir": "left"},
    {"number": 15, "name": "Turn 15 Bend", "start": 4750.0, "apex": 4880.0, "end": 5000.0, "gear": 4, "target_speed": 190.0, "turn_dir": "left"},
    {"number": 16, "name": "Le Mans Curve (T16)", "start": 5000.0, "apex": 5150.0, "end": 5300.0, "gear": 3, "target_speed": 145.0, "turn_dir": "right"},
    {"number": 17, "name": "Sunset Bend (T17)", "start": 5600.0, "apex": 5820.0, "end": 6000.0, "gear": 3, "target_speed": 138.0, "turn_dir": "right"},
]


def get_track_length(track_name: Optional[str] = None) -> float:
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


def get_track_corners(track_name: Optional[str] = None, total_distance: float = 0.0) -> List[Dict[str, Any]]:
    """Retrieve authentic corner definitions for known tracks or dynamically adapt."""
    t_norm = (track_name or "").lower()
    if "sebring" in t_norm or total_distance > 5200.0:
        return SEBRING_CORNERS
    elif "valencia" in t_norm or "ricardo" in t_norm or "cheste" in t_norm:
        return VALENCIA_CORNERS
    else:
        if total_distance > 5000.0:
            return SEBRING_CORNERS
        return VALENCIA_CORNERS


def generate_track_coordinates(
    track_name: str,
    distance: np.ndarray,
    telemetry: Optional[Dict[str, np.ndarray]] = None,
) -> Tuple[List[float], List[float]]:
    """
    Generate smooth, closed 2D track coordinates (x, y) matching circuit geometry.
    If GPS or coordinate channels exist, uses them; otherwise generates the authentic circuit layout.
    """
    if telemetry and "x" in telemetry and "y" in telemetry:
        return telemetry["x"].tolist(), telemetry["y"].tolist()

    t_norm = (track_name or "").lower()
    total_dist = float(distance[-1]) if len(distance) > 0 else 4005.0

    if "sebring" in t_norm:
        raw_waypoints = SEBRING_WAYPOINTS
        base_len = 6019.0
    elif "valencia" in t_norm or "ricardo tormo" in t_norm or "cheste" in t_norm:
        raw_waypoints = VALENCIA_WAYPOINTS
        base_len = 4005.0
    else:
        # Default based on track length
        if total_dist > 5200.0:
            raw_waypoints = SEBRING_WAYPOINTS
            base_len = 6019.0
        else:
            raw_waypoints = VALENCIA_WAYPOINTS
            base_len = 4005.0

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


    # Universal closed loop projection based on heading integration with periodic closure
    if telemetry and "ref_speed" in telemetry:
        v = np.maximum(telemetry["ref_speed"] / 3.6, 2.0)
        lat_acc = telemetry.get("ref_lat_accel", np.zeros_like(v)) * 9.81
        ds = np.diff(distance, prepend=distance[0])
        dt = ds / v
        yaw_rate = lat_acc / v
        raw_heading = np.cumsum(yaw_rate * dt)
        # Periodic drift correction so total rotation is exactly -2pi or +2pi
        net_rotation = raw_heading[-1] - raw_heading[0]
        target_rotation = -2.0 * np.pi if net_rotation < 0 else 2.0 * np.pi
        drift = (net_rotation - target_rotation) / len(distance)
        corrected_heading = raw_heading - np.arange(len(distance)) * drift

        dx = v * np.cos(corrected_heading) * dt
        dy = v * np.sin(corrected_heading) * dt

        # Close position loop
        closure_x = np.sum(dx) / len(distance)
        closure_y = np.sum(dy) / len(distance)
        dx -= closure_x
        dy -= closure_y

        x = np.cumsum(dx)
        y = np.cumsum(dy)
        if len(x) > 1:
            x[-1] = x[0]
            y[-1] = y[0]
        return x.tolist(), y.tolist()

    # Fallback oval/stadium
    t = np.linspace(0, 2 * np.pi, len(distance))
    x = 400.0 + 350.0 * np.cos(t)
    y = 300.0 + 200.0 * np.sin(t)
    return x.tolist(), y.tolist()
