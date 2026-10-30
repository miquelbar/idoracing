"""Lap helpers shared by the importers whose files carry a track-position (lap distance) channel."""

import numpy as np

from domain.session import Lap

# A lap-distance channel drops back to ~0 at the line; anything smaller is GPS noise.
LAP_RESET_DROP_M = 500.0
COMPLETE_LAP_FRACTION = 0.95
# Segments shorter than this are cooldown or a cut-short lap, not a lap.
MIN_LAP_DURATION_S = 10.0
# Physical step threshold between consecutive 50Hz samples above which a garage teleport/reset occurred.
MAX_TELEPORT_STEP_M = 25.0


def truncate_teleport_jumps(
    telemetry: dict[str, list[float]] | None,
    max_step_m: float = MAX_TELEPORT_STEP_M,
) -> tuple[dict[str, list[float]] | None, bool]:
    """
    Detect "Return to Garage / Escape" teleports where step_dist = hypot(x[i]-x[i-1], y[i]-y[i-1]) > 25m
    or where distance jumps backward abruptly. Truncates the lap at index i-1 (slice [:i]) and returns
    is_incomplete=True so it is never used to close a circuit polygon.
    """
    if not telemetry:
        return telemetry, False

    cut_idx: int | None = None
    if "x" in telemetry and "y" in telemetry and len(telemetry["x"]) > 1 and len(telemetry["x"]) == len(telemetry["y"]):
        x = np.asarray(telemetry["x"], dtype=np.float64)
        y = np.asarray(telemetry["y"], dtype=np.float64)
        if np.any(x != 0.0) or np.any(y != 0.0):
            step_dist = np.hypot(np.diff(x), np.diff(y))
            t = np.asarray(telemetry.get("time", []), dtype=np.float64)
            if len(t) == len(x):
                dt = np.maximum(np.diff(t), 0.001)
                # Max plausible car speed ~110 m/s (400 km/h)
                allowed_step = np.maximum(max_step_m, 110.0 * dt)
                jumps = np.where(step_dist > allowed_step)[0]
            else:
                jumps = np.where(step_dist > max_step_m)[0]
            if len(jumps) > 0:
                cut_idx = int(jumps[0]) + 1

    if "distance" in telemetry and len(telemetry["distance"]) > 1:
        d = np.asarray(telemetry["distance"], dtype=np.float64)
        back_jumps = np.where(np.diff(d) < -5.0)[0]
        if len(back_jumps) > 0:
            d_cut = int(back_jumps[0]) + 1
            cut_idx = d_cut if cut_idx is None else min(cut_idx, d_cut)

    if cut_idx is not None and cut_idx >= 1:
        n_orig = max((len(v) for v in telemetry.values() if isinstance(v, (list, np.ndarray))), default=0)
        truncated: dict[str, list[float]] = {}
        for k, v in telemetry.items():
            if isinstance(v, list) and len(v) == n_orig:
                truncated[k] = v[:cut_idx]
            elif isinstance(v, np.ndarray) and len(v) == n_orig:
                truncated[k] = v[:cut_idx].tolist()
            else:
                truncated[k] = v
        return truncated, True

    return telemetry, False


def distance_covered(telemetry: dict[str, list[float]]) -> float:
    if "distance" in telemetry:
        return float(np.ptp(telemetry["distance"]))
    speed_ms = np.asarray(telemetry["speed"]) / 3.6
    return float(np.sum(speed_ms[1:] * np.diff(telemetry["time"])))


def without_boundary_wrap(distance: list[float]) -> list[float]:
    """
    Lap distance is the car's position along the track, so it is kept as recorded: a lap that starts
    from the grid or the pit exit starts mid-track. The lap-number and lap-distance channels can be
    logged at different rates, so the reset at the line can land a few samples inside the neighbouring
    lap; those samples are moved back next to their lap.
    """
    d = np.asarray(distance, dtype=np.float64)
    for i in np.where(np.diff(d) < -LAP_RESET_DROP_M)[0]:
        jump = d[i] - d[i + 1]
        if i < len(d) / 2:
            d[: i + 1] -= jump
        else:
            d[i + 1 :] += jump
    if len(d) > 0 and d[0] < 0:
        d = d - d[0]
    return d.tolist()


def mark_partial_laps_invalid(laps: list[Lap]) -> None:
    """Out laps, in laps and cut-short laps cover less than COMPLETE_LAP_FRACTION of the longest lap."""
    spans = [distance_covered(lap.telemetry or {}) for lap in laps]
    longest = max(spans, default=0.0)
    for lap, span in zip(laps, spans, strict=True):
        if span < COMPLETE_LAP_FRACTION * longest:
            lap.is_valid = False
