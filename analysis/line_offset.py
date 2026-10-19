"""
How far the comparison lap's line sits from the reference lap's line, in metres, from recorded
position channels (GPS or world coordinates). Only meaningful when both laps were recorded with
position; placeholder telemetry never has it.
"""

import numpy as np

# Both laps are aligned by lap distance, so the nearest reference point is close in index; this window
# (in samples of the aligned grid) bounds the search.
SEARCH_WINDOW = 30
# Samples averaged either side of entry, apex and exit to smooth position noise.
SMOOTHING_HALF_WIDTH = 2


def signed_offsets(ref_x: np.ndarray, ref_y: np.ndarray, comp_x: np.ndarray, comp_y: np.ndarray) -> np.ndarray:
    """
    Perpendicular distance from each comparison point to the reference path, positive to the left of
    the reference direction of travel.
    """
    n = len(ref_x)
    seg_x, seg_y = np.diff(ref_x), np.diff(ref_y)
    seg_len2 = np.maximum(seg_x**2 + seg_y**2, 1e-9)
    out = np.zeros(len(comp_x))
    for i, (px, py) in enumerate(zip(comp_x, comp_y, strict=True)):
        lo, hi = max(0, i - SEARCH_WINDOW), min(n - 1, i + SEARCH_WINDOW)
        sx, sy, l2 = seg_x[lo:hi], seg_y[lo:hi], seg_len2[lo:hi]
        if len(sx) == 0:
            continue
        t = np.clip(((px - ref_x[lo:hi]) * sx + (py - ref_y[lo:hi]) * sy) / l2, 0.0, 1.0)
        dx = px - (ref_x[lo:hi] + t * sx)
        dy = py - (ref_y[lo:hi] + t * sy)
        k = int(np.argmin(dx**2 + dy**2))
        cross = sx[k] * dy[k] - sy[k] * dx[k]
        out[i] = np.copysign(np.hypot(dx[k], dy[k]), cross)
    return out


def turn_direction(x: np.ndarray, y: np.ndarray) -> int:
    """+1 for a left-hand corner, -1 for a right-hand one, from the heading change along the path."""
    heading = np.unwrap(np.arctan2(np.diff(y), np.diff(x)))
    return 1 if heading[-1] - heading[0] > 0 else -1


def corner_line_offsets(
    ref_x: np.ndarray,
    ref_y: np.ndarray,
    comp_x: np.ndarray,
    comp_y: np.ndarray,
    apex_idx: int,
) -> tuple[float, float, float] | None:
    """
    Offset of the comparison line at corner entry, apex and exit, in metres. Positive means wider
    (towards the outside of the corner) than the reference line, negative means tighter.
    """
    if len(ref_x) < 5:
        return None
    outward = -turn_direction(ref_x, ref_y) * signed_offsets(ref_x, ref_y, comp_x, comp_y)

    def around(idx: int) -> float:
        lo, hi = max(0, idx - SMOOTHING_HALF_WIDTH), min(len(outward), idx + SMOOTHING_HALF_WIDTH + 1)
        return round(float(np.mean(outward[lo:hi])), 1)

    return around(0), around(apex_idx), around(len(outward) - 1)


def has_recorded_position(aligned: dict[str, np.ndarray]) -> bool:
    return all(key in aligned and float(np.ptp(aligned[key])) > 1.0 for key in ("ref_x", "ref_y", "comp_x", "comp_y"))
