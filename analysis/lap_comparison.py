"""
Lap comparison engine for IdoRacing Analytics.
Computes numerical time, speed, sector, and corner differences between two laps.
"""

import numpy as np

from analysis.alignment import align_laps_by_distance
from analysis.corners import extract_corners_analysis
from domain.session import CornerAnalysis, Lap, LapComparison


def compare_laps(
    ref_lap: Lap,
    comp_lap: Lap,
    step_m: float = 2.0,
    track_name: str | None = None,
) -> LapComparison:
    """
    Compare a reference lap and a comparison lap with distance alignment
    and corner-by-corner performance breakdown.
    """
    time_diff = float(comp_lap.lap_time - ref_lap.lap_time)

    # Sector differences
    sector_diffs: dict[str, float] = {}
    if ref_lap.sector_times and comp_lap.sector_times:
        for i, (rs, cs) in enumerate(zip(ref_lap.sector_times, comp_lap.sector_times, strict=False)):
            sector_diffs[f"sector{i + 1}"] = round(float(cs - rs), 3)

    # Telemetry alignment
    aligned_data = None
    corners: list[CornerAnalysis] = []
    speed_diffs: dict[str, float] = {}
    throttle_diffs: dict[str, float] = {}
    brake_diffs: dict[str, float] = {}
    gear_changes: dict[str, int] = {}

    if ref_lap.has_telemetry and comp_lap.has_telemetry:
        aligned_data = align_laps_by_distance(
            ref_lap.telemetry,
            comp_lap.telemetry,
            step_m=step_m,
        )

        ref_label = f"P1 (V{ref_lap.lap_number})"
        comp_label = f"P2 (V{comp_lap.lap_number})"
        corners = extract_corners_analysis(
            aligned_data,
            track_name=track_name,
            ref_label=ref_label,
            comp_label=comp_label,
        )

        # Average channel differences per sector/track third
        n_pts = len(aligned_data["distance"])
        if n_pts > 0:
            split1 = n_pts // 3
            split2 = 2 * n_pts // 3
            splits = [
                ("sector1", 0, split1),
                ("sector2", split1, split2),
                ("sector3", split2, n_pts),
            ]

            for s_name, s_start, s_end in splits:
                if s_end > s_start:
                    ref_sp = aligned_data["ref_speed"][s_start:s_end]
                    comp_sp = aligned_data["comp_speed"][s_start:s_end]
                    speed_diffs[s_name] = round(float(np.mean(comp_sp) - np.mean(ref_sp)), 1)

                    ref_th = aligned_data["ref_throttle"][s_start:s_end]
                    comp_th = aligned_data["comp_throttle"][s_start:s_end]
                    throttle_diffs[s_name] = round(float(np.mean(comp_th) - np.mean(ref_th)), 2)

                    ref_br = aligned_data["ref_brake"][s_start:s_end]
                    comp_br = aligned_data["comp_brake"][s_start:s_end]
                    brake_diffs[s_name] = round(float(np.mean(comp_br) - np.mean(ref_br)), 2)

                    # Count gear shifts in segment
                    ref_gears = aligned_data["ref_gear"][s_start:s_end]
                    comp_gears = aligned_data["comp_gear"][s_start:s_end]
                    shifts_ref = int(np.sum(np.diff(ref_gears) != 0)) if len(ref_gears) > 1 else 0
                    shifts_comp = int(np.sum(np.diff(comp_gears) != 0)) if len(comp_gears) > 1 else 0
                    gear_changes[s_name] = shifts_comp - shifts_ref

    return LapComparison(
        reference_lap=str(ref_lap.lap_number),
        comparison_lap=str(comp_lap.lap_number),
        time_difference=round(time_diff, 3),
        sector_differences=sector_diffs,
        speed_differences=speed_diffs,
        throttle_differences=throttle_diffs,
        brake_differences=brake_diffs,
        gear_changes=gear_changes,
        corners=corners,
        aligned_distance=aligned_data["distance"].tolist() if aligned_data is not None else None,
        time_delta_profile=aligned_data["time_delta"].tolist() if aligned_data is not None else None,
        speed_delta_profile=aligned_data["speed_delta"].tolist() if aligned_data is not None else None,
    )
