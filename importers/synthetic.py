"""
Synthetic telemetry generator for ACC Coach.
Provides realistic telemetry for Porsche 911 GT3 R (992) at Circuit Ricardo Tormo (Valencia, 4005m).
Enables instant out-of-the-box demo, validation, and reproducible automated tests without real game logs.
"""

from datetime import datetime
import os
from typing import Dict, List, Tuple
import numpy as np
from domain.session import Lap, Session
from importers.motec_binary import create_synthetic_ld_bytes

# Official Valencia Ricardo Tormo Turn definitions (Distance in meters along 4005m lap)
VALENCIA_CORNERS = [
    {"number": 1, "name": "Curva Jorge Martinez Aspar", "start": 600, "apex": 780, "end": 900, "gear": 3, "target_speed": 142.0},
    {"number": 2, "name": "Curva Mick Doohan", "start": 920, "apex": 1080, "end": 1220, "gear": 3, "target_speed": 128.0},
    {"number": 4, "name": "Curva Nico Terol", "start": 1420, "apex": 1530, "end": 1640, "gear": 2, "target_speed": 78.0},
    {"number": 8, "name": "Curva Bernat Martinez", "start": 2150, "apex": 2260, "end": 2380, "gear": 2, "target_speed": 92.0},
    {"number": 11, "name": "Curva Champi Herreros", "start": 2880, "apex": 2980, "end": 3100, "gear": 2, "target_speed": 85.0},
    {"number": 14, "name": "Curva Adrian Campos", "start": 3620, "apex": 3740, "end": 3880, "gear": 2, "target_speed": 89.0},
]

TRACK_LENGTH = 4005.0  # meters


def generate_lap_telemetry(is_reference: bool = True, step_dist: float = 2.0) -> Dict[str, np.ndarray]:
    """
    Generate realistic synthetic telemetry curves along the 4005m of Valencia track.
    
    If is_reference=True: Optimal lap (~1:31.40).
    If is_reference=False: Comparison lap (~1:32.90) with classic mistakes:
       - T1 (Aspar): Brakes 25m too early, apex speed 126 km/h vs 142 km/h.
       - T4 (Nico Terol): Hesitant throttle application on exit.
       - T11 (Champi Herreros): Downshifts to 1st instead of 2nd gear, losing mid-corner speed and exit drive.
    """
    distances = np.arange(0.0, TRACK_LENGTH, step_dist)
    n = len(distances)

    # Initialize channels
    speed = np.zeros(n, dtype=np.float32)
    throttle = np.zeros(n, dtype=np.float32)
    brake = np.zeros(n, dtype=np.float32)
    gear = np.zeros(n, dtype=np.int32)
    steer_angle = np.zeros(n, dtype=np.float32)
    lat_accel = np.zeros(n, dtype=np.float32)
    long_accel = np.zeros(n, dtype=np.float32)
    rpm = np.zeros(n, dtype=np.float32)

    # Base profile simulation based on Valencia layout
    for i, d in enumerate(distances):
        # Default straight speed (Porsche GT3 tops around 245-255 km/h on main straight)
        if d < 550:  # Main straight
            sp = 140.0 + (d / 550.0) * 110.0
            th = 1.0
            br = 0.0
            gr = 5 if sp > 200 else 4
            st = 0.0
        elif 550 <= d < 780:  # T1 Braking zone
            if is_reference:
                # Reference: brakes at 650m
                if d < 650:
                    sp = 250.0
                    th = 1.0
                    br = 0.0
                else:
                    ratio = (d - 650) / 130.0
                    sp = 250.0 - ratio * (250.0 - 142.0)
                    th = 0.0
                    br = 0.85 * (1.0 - ratio * 0.4)
            else:
                # Comparison: brakes 25m early (at 625m) and over-slows to 126 km/h
                if d < 625:
                    sp = 248.0
                    th = 1.0
                    br = 0.0
                else:
                    ratio = (d - 625) / 155.0
                    sp = 248.0 - ratio * (248.0 - 126.0)
                    th = 0.0
                    br = 0.90 * (1.0 - ratio * 0.3)
            gr = 3
            st = -5.0 if d > 720 else 0.0
        elif 780 <= d < 920:  # T1 Apex & exit
            target_apex = 142.0 if is_reference else 126.0
            ratio = (d - 780) / 140.0
            sp = target_apex + ratio * 35.0
            th = 0.2 + ratio * 0.8
            br = 0.0
            gr = 3
            st = -25.0 * (1.0 - ratio)
        elif 920 <= d < 1220:  # T2 Doohan
            ratio = (d - 920) / 300.0
            target_apex = 128.0 if is_reference else 120.0
            sp = target_apex + np.sin(ratio * np.pi) * -10.0 + ratio * 20.0
            th = 0.5 + ratio * 0.5
            br = 0.3 * (1.0 - ratio) if ratio < 0.2 else 0.0
            gr = 3
            st = -35.0 * np.sin(ratio * np.pi)
        elif 1220 <= d < 1440:  # Approach to T4
            sp = 140.0 + ((d - 1220) / 220.0) * 60.0
            th = 1.0
            br = 0.0
            gr = 4
            st = 0.0
        elif 1440 <= d < 1530:  # T4 Braking
            ratio = (d - 1440) / 90.0
            sp = 200.0 - ratio * (200.0 - 78.0)
            th = 0.0
            br = 0.95 * (1.0 - ratio * 0.5)
            gr = 2
            st = 10.0 * ratio
        elif 1530 <= d < 1660:  # T4 Apex & Exit
            ratio = (d - 1530) / 130.0
            if is_reference:
                sp = 78.0 + ratio * 55.0
                th = min(1.0, ratio * 1.3)  # Early assertive throttle
            else:
                sp = 77.0 + ratio * 42.0
                th = 0.0 if ratio < 0.35 else min(1.0, (ratio - 0.35) * 1.4)  # Hesitant delayed throttle
            br = 0.0
            gr = 2
            st = 45.0 * (1.0 - ratio)
        elif 1660 <= d < 2150:  # Infield flowing section T5-T7
            ratio = (d - 1660) / 490.0
            sp = 135.0 + np.sin(ratio * 3 * np.pi) * 25.0 + ratio * 30.0
            th = 0.7 + np.cos(ratio * 3 * np.pi) * 0.3
            br = 0.2 if np.sin(ratio * 3 * np.pi) < -0.6 else 0.0
            gr = 3 if sp < 150 else 4
            st = 20.0 * np.sin(ratio * 3 * np.pi)
        elif 2150 <= d < 2380:  # T8 Bernat Martinez
            ratio = (d - 2150) / 230.0
            target_min = 92.0 if is_reference else 88.0
            sp = target_min + (1.0 - np.sin(ratio * np.pi)) * 30.0
            th = 0.8 * ratio
            br = 0.7 * (1.0 - ratio) if ratio < 0.3 else 0.0
            gr = 2
            st = -38.0 * np.sin(ratio * np.pi)
        elif 2380 <= d < 2880:  # Back straight section
            sp = 120.0 + ((d - 2380) / 500.0) * 85.0
            th = 1.0
            br = 0.0
            gr = 4 if sp > 165 else 3
            st = 0.0
        elif 2880 <= d < 3100:  # T11 Champi Herreros
            ratio = (d - 2880) / 220.0
            if is_reference:
                sp = 85.0 + (1.0 - np.sin(ratio * np.pi)) * 40.0
                th = 0.85 * ratio
                br = 0.8 * (1.0 - ratio) if ratio < 0.3 else 0.0
                gr = 2
            else:
                # Comparison downshifts to 1st gear, loses corner speed and rev-outs
                sp = 79.0 + (1.0 - np.sin(ratio * np.pi)) * 35.0
                th = 0.65 * ratio
                br = 0.85 * (1.0 - ratio) if ratio < 0.3 else 0.0
                gr = 1 if ratio < 0.7 else 2
            st = 36.0 * np.sin(ratio * np.pi)
        elif 3100 <= d < 3620:  # T12-T13
            ratio = (d - 3100) / 520.0
            sp = 125.0 + np.sin(ratio * 2 * np.pi) * 20.0 + ratio * 35.0
            th = 0.8 + np.cos(ratio * 2 * np.pi) * 0.2
            br = 0.25 if np.sin(ratio * 2 * np.pi) < -0.5 else 0.0
            gr = 3
            st = -22.0 * np.sin(ratio * 2 * np.pi)
        else:  # T14 Adrian Campos & straight start
            ratio = (d - 3620) / (TRACK_LENGTH - 3620)
            target_min = 89.0 if is_reference else 85.0
            sp = target_min + (1.0 - np.sin(ratio * np.pi)) * 25.0 + ratio * 45.0
            th = 0.9 * ratio
            br = 0.8 * (1.0 - ratio) if ratio < 0.25 else 0.0
            gr = 2 if ratio < 0.7 else 3
            st = -42.0 * np.sin(ratio * np.pi)

        # Store calculated point
        speed[i] = float(np.clip(sp, 50.0, 260.0))
        throttle[i] = float(np.clip(th, 0.0, 1.0))
        brake[i] = float(np.clip(br, 0.0, 1.0))
        gear[i] = int(gr)
        steer_angle[i] = float(st)
        lat_accel[i] = float(np.clip((sp / 3.6) ** 2 * (st / 45.0) * 0.015 / 9.81, -2.5, 2.5))
        long_accel[i] = float(np.clip((th * 0.6 - br * 1.5), -1.8, 1.0))
        rpm[i] = float(4500.0 + (sp / 260.0) * 4500.0)

    # Compute continuous elapsed time along distance: dt = ds / (v / 3.6)
    time = np.zeros(n, dtype=np.float32)
    for i in range(1, n):
        ds = distances[i] - distances[i - 1]
        v_avg = max((speed[i] + speed[i - 1]) / 2.0, 10.0) / 3.6
        time[i] = time[i - 1] + ds / v_avg

    return {
        "distance": distances,
        "time": time,
        "speed": speed,
        "throttle": throttle,
        "brake": brake,
        "gear": gear.astype(np.float32),
        "lat_accel": lat_accel,
        "long_accel": long_accel,
        "steer_angle": steer_angle,
        "rpm": rpm,
    }


def create_synthetic_session() -> Session:
    """Create a fully populated Session with 3 realistic Valencia GT3 laps."""
    out_lap_raw = generate_lap_telemetry(is_reference=False)
    # Slow down out lap slightly
    out_lap_raw["time"] = out_lap_raw["time"] * 1.08
    out_lap_raw["speed"] = out_lap_raw["speed"] * 0.92

    ref_lap_raw = generate_lap_telemetry(is_reference=True)
    comp_lap_raw = generate_lap_telemetry(is_reference=False)

    ref_lap_time = float(ref_lap_raw["time"][-1])
    comp_lap_time = float(comp_lap_raw["time"][-1])
    out_lap_time = float(out_lap_raw["time"][-1])

    # Convert to standard dict of lists
    def to_lists(d: Dict[str, np.ndarray]) -> Dict[str, List[float]]:
        return {k: v.tolist() for k, v in d.items()}

    # Calculate realistic sectors (Valencia ~4005m split roughly into 3 sectors: ~1200m, ~2400m, ~4005m)
    def calc_sectors(data_dict: Dict[str, np.ndarray]) -> List[float]:
        dist = data_dict["distance"]
        t = data_dict["time"]
        idx_s1 = int(np.searchsorted(dist, 1220.0))
        idx_s2 = int(np.searchsorted(dist, 2400.0))
        s1 = float(t[idx_s1])
        s2 = float(t[idx_s2] - t[idx_s1])
        s3 = float(t[-1] - t[idx_s2])
        return [round(s1, 3), round(s2, 3), round(s3, 3)]

    laps = [
        Lap(
            lap_number=1,
            lap_time=round(out_lap_time, 3),
            sector_times=calc_sectors(out_lap_raw),
            is_valid=False,  # Out lap
            telemetry=to_lists(out_lap_raw),
        ),
        Lap(
            lap_number=2,
            lap_time=round(ref_lap_time, 3),
            sector_times=calc_sectors(ref_lap_raw),
            is_valid=True,
            telemetry=to_lists(ref_lap_raw),
        ),
        Lap(
            lap_number=3,
            lap_time=round(comp_lap_time, 3),
            sector_times=calc_sectors(comp_lap_raw),
            is_valid=True,
            telemetry=to_lists(comp_lap_raw),
        ),
    ]

    session = Session(
        session_id="synth_valencia_992_gt3",
        car="Porsche 911 GT3 R (992)",
        track="Ricardo Tormo de Valencia",
        date=datetime.now(),
        telemetry=to_lists(ref_lap_raw),
        laps=laps,
        source_file="synthetic_demo_session.ld",
    )
    return session


def save_synthetic_motec_files(output_dir: str) -> Tuple[str, str]:
    """Generate and write valid MoTeC .ld and .ldx files for testing and fixture usage."""
    os.makedirs(output_dir, exist_ok=True)
    ld_path = os.path.join(output_dir, "synthetic_valencia.ld")
    ldx_path = os.path.join(output_dir, "synthetic_valencia.ldx")

    session = create_synthetic_session()
    ref_lap = session.laps[1]
    channels = {k: np.array(v, dtype=np.float32) for k, v in ref_lap.telemetry.items()}

    ld_bytes = create_synthetic_ld_bytes(
        driver="ACC Driver",
        vehicle="Porsche 911 GT3 R (992)",
        venue="Ricardo Tormo de Valencia",
        date_time=session.date,
        channels_data=channels,
    )

    with open(ld_path, "wb") as f:
        f.write(ld_bytes)

    # Create matching .ldx file
    ldx_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<LDXFile Version="1.6" Creator="MoTeC i2 Pro">
  <Layers>
    <Layer Type="Lap Marker">
      <Markers>
        <Marker Time="0.000" Distance="0.0" Lap="0" Type="B" Name="Start" />
        <Marker Time="{session.laps[0].lap_time}" Distance="4005.0" Lap="1" Type="L" Name="Lap 1" />
        <Marker Time="{session.laps[0].lap_time + session.laps[1].lap_time}" Distance="8010.0" Lap="2" Type="L" Name="Lap 2" />
        <Marker Time="{session.laps[0].lap_time + session.laps[1].lap_time + session.laps[2].lap_time}" Distance="12015.0" Lap="3" Type="L" Name="Lap 3" />
      </Markers>
    </Layer>
  </Layers>
</LDXFile>
"""
    with open(ldx_path, "w", encoding="utf-8") as f:
        f.write(ldx_content)

    return ld_path, ldx_path
