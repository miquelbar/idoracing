"""
Demo session for IdoRacing Analytics: three generated laps at Valencia, so the app has something
to show before any real file is imported. Every lap is marked synthetic.
"""

import os
from datetime import datetime

import numpy as np

from analysis.telemetry_generator import generate_lap_telemetry_for_track
from domain.session import Lap, Session
from importers.motec_binary import create_synthetic_ld_bytes

DEMO_TRACK = "Ricardo Tormo de Valencia"


def generate_lap_telemetry(is_reference: bool = True) -> dict[str, np.ndarray]:
    """Demo lap at Valencia; the comparison lap carries the generator's planted mistakes."""
    return generate_lap_telemetry_for_track(DEMO_TRACK, is_reference=is_reference)


def create_synthetic_session() -> Session:
    """Create the demo session: an out lap, a reference lap and a slower comparison lap."""
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
    def to_lists(d: dict[str, np.ndarray]) -> dict[str, list[float]]:
        return {k: v.tolist() for k, v in d.items()}

    # Calculate realistic sectors (Valencia ~4005m split roughly into 3 sectors: ~1200m, ~2400m, ~4005m)
    def calc_sectors(data_dict: dict[str, np.ndarray]) -> list[float]:
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
            synthetic=True,
        ),
        Lap(
            lap_number=2,
            lap_time=round(ref_lap_time, 3),
            sector_times=calc_sectors(ref_lap_raw),
            is_valid=True,
            telemetry=to_lists(ref_lap_raw),
            synthetic=True,
        ),
        Lap(
            lap_number=3,
            lap_time=round(comp_lap_time, 3),
            sector_times=calc_sectors(comp_lap_raw),
            is_valid=True,
            telemetry=to_lists(comp_lap_raw),
            synthetic=True,
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


def save_synthetic_motec_files(output_dir: str) -> tuple[str, str]:
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
