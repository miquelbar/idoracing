"""Lap helpers shared by the importers whose files carry a track-position (lap distance) channel."""

import numpy as np

from domain.session import Lap

# A lap-distance channel drops back to ~0 at the line; anything smaller is GPS noise.
LAP_RESET_DROP_M = 500.0
COMPLETE_LAP_FRACTION = 0.95


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
    return d.tolist()


def mark_partial_laps_invalid(laps: list[Lap]) -> None:
    """Out laps, in laps and cut-short laps cover less than COMPLETE_LAP_FRACTION of the longest lap."""
    spans = [distance_covered(lap.telemetry or {}) for lap in laps]
    longest = max(spans, default=0.0)
    for lap, span in zip(laps, spans, strict=True):
        if span < COMPLETE_LAP_FRACTION * longest:
            lap.is_valid = False
