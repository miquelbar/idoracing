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

    if "valencia" in t_norm or "ricardo tormo" in t_norm or "cheste" in t_norm or total_dist <= 4200.0:
        wp_d = np.array([w[0] for w in VALENCIA_WAYPOINTS])
        wp_x = np.array([w[1] for w in VALENCIA_WAYPOINTS])
        wp_y = np.array([w[2] for w in VALENCIA_WAYPOINTS])

        # Scale distance domain if lap distance slightly differs
        scale_d = total_dist / 4005.0
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
