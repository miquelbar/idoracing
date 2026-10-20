"""
Driving faults planted into a copy of a real lap. Every fault edits speed and the driver inputs
together, and the lap time is integrated again from the edited speed, so the time each fault costs
is known exactly. Laps are dicts of numpy arrays on a 1 m distance grid.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from analysis.line_offset import turn_direction

GRID_M = 1.0
# Same thresholds the analyzer uses for brake onset and throttle pickup.
BRAKE_ON = 0.08
THROTTLE_ON = 0.10
# Coasting into an apex bleeds a little speed, so the speed minimum stays a single point.
COAST_BLEED_KMH = 0.3
# A lower apex speed is carried this far down the following straight before it fades out.
VMIN_CARRY_M = 150.0

CHANNELS = ("speed", "throttle", "brake", "gear", "steer_angle", "lat_accel", "long_accel", "rpm", "x", "y")


@dataclass(frozen=True)
class CornerContext:
    """Where the reference lap brakes, turns and accelerates in one corner, as grid indices."""

    number: int
    start: int
    end: int
    apex: int
    brake_on: int | None
    throttle_on: int | None
    next_brake_on: int
    previous_end: int
    apex_gear: int


def resample(telemetry: dict[str, list[float]]) -> dict[str, np.ndarray]:
    """A recorded lap on a 1 m grid, starting at 0 m, with time integrated from speed."""
    dist = np.asarray(telemetry["distance"], dtype=np.float64)
    keep = dist >= 0.0
    grid = np.arange(0.0, float(dist[keep][-1]), GRID_M)
    lap = {"distance": grid}
    for ch in CHANNELS:
        if ch in telemetry and len(telemetry[ch]) == len(dist):
            lap[ch] = np.interp(grid, dist[keep], np.asarray(telemetry[ch], dtype=np.float64)[keep])
    lap["gear"] = np.round(lap["gear"])
    lap["time"] = integrate_time(lap["speed"])
    return lap


def integrate_time(speed_kmh: np.ndarray) -> np.ndarray:
    v = np.maximum(speed_kmh / 3.6, 1.0)
    dt = GRID_M / ((v[1:] + v[:-1]) / 2.0)
    return np.concatenate([[0.0], np.cumsum(dt)])


def corner_contexts(lap: dict[str, np.ndarray], corners: list[dict]) -> list[CornerContext]:
    """Brake onset, apex and throttle pickup of the reference lap inside each analyzer corner window."""
    dist = lap["distance"]
    brake_onsets = []
    contexts = []
    for c in corners:
        s = int(np.searchsorted(dist, c["start"]))
        e = min(int(np.searchsorted(dist, c["end"])), len(dist) - 1)
        apex = s + int(np.argmin(lap["speed"][s : e + 1]))
        braking = np.where(lap["brake"][s:apex] > BRAKE_ON)[0]
        pickup = np.where(lap["throttle"][apex : e + 1] > THROTTLE_ON)[0]
        brake_on = s + int(braking[0]) if len(braking) else None
        brake_onsets.append(brake_on)
        contexts.append((c["number"], s, e, apex, brake_on, apex + int(pickup[0]) if len(pickup) else None))
    previous_end = 0
    for i, (number, s, e, apex, brake_on, throttle_on) in enumerate(contexts):
        later = [b for b in brake_onsets[i + 1 :] if b is not None]
        yield_to = later[0] if later else len(dist) - 1
        gear = int(lap["gear"][apex])
        contexts[i] = CornerContext(number, s, e, apex, brake_on, throttle_on, yield_to, previous_end, gear)
        previous_end = e
    return contexts


def _finish(base: dict[str, np.ndarray], lap: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Lateral G follows speed at the same radius; time and longitudinal G are integrated again."""
    ratio = (lap["speed"] / np.maximum(base["speed"], 1.0)) ** 2
    lap["lat_accel"] = lap["lat_accel"] * ratio
    v = np.maximum(lap["speed"], 1.0) / 3.6
    v0 = np.maximum(base["speed"], 1.0) / 3.6
    extra = (v * np.gradient(v, GRID_M) - v0 * np.gradient(v0, GRID_M)) / 9.81
    lap["long_accel"] = lap["long_accel"] + extra
    lap["time"] = integrate_time(lap["speed"])
    return lap


def _copy(lap: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    return {k: v.copy() for k, v in lap.items()}


def _shift_inputs(out, src, rows: np.ndarray, offset: int, channels=("brake", "throttle", "gear", "rpm")) -> None:
    rows = rows[(rows + offset >= 0) & (rows + offset < len(src["distance"]))]
    for ch in channels:
        out[ch][rows] = src[ch][rows + offset]


def early_brake(lap, c: CornerContext, metres: int):
    """Brakes `metres` earlier with the same deceleration, then coasts to the apex at apex speed."""
    out = _copy(lap)
    b, a = c.brake_on, c.apex
    lo = b - metres
    shifted = np.arange(lo, a - metres)
    out["speed"][shifted] = np.minimum(lap["speed"][shifted], lap["speed"][shifted + metres])
    _shift_inputs(out, lap, shifted, metres)
    coast = np.arange(max(lo, a - metres), a)
    bleed = np.linspace(COAST_BLEED_KMH, 0.0, len(coast), endpoint=False)
    out["speed"][coast] = np.minimum(lap["speed"][coast], lap["speed"][a] + bleed)
    out["brake"][coast] = 0.0
    out["throttle"][coast] = 0.03
    out["gear"][coast] = lap["gear"][a]
    return _finish(lap, out)


def early_release(lap, c: CornerContext, metres: int):
    """Same brake onset, but the stop is done `metres` before the apex and the car coasts the rest."""
    out = _copy(lap)
    b, a = c.brake_on, c.apex
    release = a - metres
    span = np.arange(b, release)
    src = b + np.round((span - b) * (a - b) / max(release - b, 1)).astype(int)
    out["speed"][span] = np.minimum(lap["speed"][span], lap["speed"][src])
    for ch in ("brake", "gear", "rpm"):
        out[ch][span] = lap[ch][src]
    coast = np.arange(release, a)
    bleed = np.linspace(COAST_BLEED_KMH, 0.0, len(coast), endpoint=False)
    out["speed"][coast] = np.minimum(lap["speed"][coast], lap["speed"][a] + bleed)
    out["brake"][coast] = 0.0
    out["throttle"][coast] = 0.03
    return _finish(lap, out)


def low_vmin(lap, c: CornerContext, kmh: float):
    """Apex `kmh` slower: kinetic energy removed from brake onset to apex and carried onto the straight."""
    out = _copy(lap)
    a = c.apex
    v = lap["speed"]
    loss = v[a] ** 2 - max(v[a] - kmh, 5.0) ** 2
    w = np.zeros_like(v)
    entry = c.brake_on if c.brake_on is not None else c.start
    w[entry : a + 1] = 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, a + 1 - entry))
    hold_to = c.throttle_on if c.throttle_on is not None else a
    w[a : hold_to + 1] = 1.0
    fade_end = min(c.end + int(VMIN_CARRY_M), c.next_brake_on, len(v) - 1)
    if fade_end > hold_to:
        w[hold_to : fade_end + 1] = 0.5 + 0.5 * np.cos(np.linspace(0.0, np.pi, fade_end + 1 - hold_to))
    out["speed"] = np.sqrt(np.maximum(v**2 - loss * w, 25.0))
    return _finish(lap, out)


def late_throttle(lap, c: CornerContext, metres: int):
    """Waits `metres` at pickup speed before accelerating; the delay is carried to the next braking zone."""
    out = _copy(lap)
    t = c.throttle_on
    wait = np.arange(t, min(t + metres, len(lap["speed"])))
    out["speed"][wait] = np.minimum(lap["speed"][wait], lap["speed"][t])
    out["throttle"][wait] = 0.03
    out["gear"][wait] = lap["gear"][t]
    after = np.arange(t + metres, c.next_brake_on)
    slower = lap["speed"][after - metres] < lap["speed"][after]
    rows = after[slower]
    out["speed"][rows] = lap["speed"][rows - metres]
    _shift_inputs(out, lap, rows, -metres)
    return _finish(lap, out)


def early_apex(lap, c: CornerContext, metres: int):
    """The speed minimum and every input around it happen `metres` earlier; the exit is stretched."""
    out = _copy(lap)
    s, a, e = c.start, c.apex, c.end
    new_apex = max(s + 1, a - metres)
    rows = np.arange(s, e + 1)
    src = np.where(
        rows <= new_apex,
        s + (rows - s) * (a - s) / (new_apex - s),
        a + (rows - new_apex) * (e - a) / max(e - new_apex, 1),
    )
    src = np.clip(np.round(src).astype(int), s, e)
    for ch in ("speed", "brake", "throttle", "gear", "rpm", "steer_angle", "lat_accel"):
        out[ch][rows] = lap[ch][src]
    return _finish(lap, out)


def line_offset(lap, c: CornerContext, metres: float):
    """Line moved `metres` outward (positive) or inward (negative) at the apex, fading to zero at the window edges."""
    out = _copy(lap)
    s, a, e = c.start, c.apex, c.end
    x, y = lap["x"], lap["y"]
    turn = turn_direction(x[s : e + 1], y[s : e + 1])
    hx, hy = np.gradient(x), np.gradient(y)
    norm = np.maximum(np.hypot(hx, hy), 1e-9)
    left_x, left_y = -hy / norm, hx / norm
    bump = np.zeros_like(x)
    bump[s : a + 1] = 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, a + 1 - s))
    bump[a : e + 1] = 0.5 + 0.5 * np.cos(np.linspace(0.0, np.pi, e + 1 - a))
    shift = -turn * metres * bump
    out["x"] = x + left_x * shift
    out["y"] = y + left_y * shift
    return _finish(lap, out)


def wrong_gear(lap, c: CornerContext, step: int):
    """One gear lower (step -1) or higher (step +1) through the apex. Speed is unchanged: no time truth."""
    out = _copy(lap)
    rows = np.arange(max(c.start, c.apex - 20), min(c.end, c.apex + 40) + 1)
    out["gear"][rows] = np.clip(lap["gear"][rows] + step, 1, 7)
    return _finish(lap, out)


def over_braking(lap, c: CornerContext, kmh: float):
    """Holds at least 40 % brake for the last 40 m to the apex, which costs `kmh` of apex speed."""
    out = low_vmin(lap, c, kmh)
    rows = np.arange(max(c.brake_on, c.apex - 40), c.apex)
    out["brake"][rows] = np.maximum(out["brake"][rows], 0.40)
    out["throttle"][rows] = 0.0
    return out


def overdriving(lap, c: CornerContext, pct: float):
    """`pct` more steering lock than the reference for no extra grip, scrubbing 3 km/h of apex speed."""
    out = low_vmin(lap, c, 3.0)
    s, e = c.start, c.end
    bump = np.zeros_like(out["steer_angle"])
    bump[s : e + 1] = np.sin(np.linspace(0.0, np.pi, e + 1 - s))
    out["steer_angle"] = out["steer_angle"] * (1.0 + pct / 100.0 * bump)
    return out


@dataclass(frozen=True)
class Fault:
    """One planted fault: what it is, how big, and the analyzer causes that count as naming it."""

    kind: str
    size: float
    causes: frozenset[str]
    needs_brake: bool = False
    needs_throttle: bool = False
    needs_position: bool = False
    has_time_truth: bool = True

    def apply(self, lap, c: CornerContext):
        return APPLY[self.kind](lap, c, self.size)

    @property
    def label(self) -> str:
        return f"{self.kind}({self.size:g})"


APPLY = {
    "early_brake": early_brake,
    "early_release": early_release,
    "low_vmin": low_vmin,
    "late_throttle": late_throttle,
    "early_apex": early_apex,
    "line_wide": line_offset,
    "line_tight": lambda lap, c, m: line_offset(lap, c, -m),
    "gear_low": lambda lap, c, _: wrong_gear(lap, c, -1),
    "gear_high": lambda lap, c, _: wrong_gear(lap, c, +1),
    "over_braking": over_braking,
    "overdriving": overdriving,
}


def catalogue() -> list[Fault]:
    """Every single fault and size, frozen before the first run."""
    faults = []
    for m in (10, 20, 40):
        faults.append(Fault("early_brake", m, frozenset({"early_brake"}), needs_brake=True))
        faults.append(Fault("late_throttle", m, frozenset({"late_throttle"}), needs_throttle=True))
    for m in (20, 40):
        faults.append(Fault("early_release", m, frozenset({"early_release"}), needs_brake=True))
    for k in (3, 6, 10):
        faults.append(Fault("low_vmin", k, frozenset({"low_vmin"})))
    for m in (10, 20, 30):
        faults.append(Fault("early_apex", m, frozenset({"early_apex"})))
    for m in (1, 2, 3):
        faults.append(Fault("line_wide", m, frozenset({"line_wide"}), needs_position=True, has_time_truth=False))
        faults.append(Fault("line_tight", m, frozenset({"line_tight"}), needs_position=True, has_time_truth=False))
    faults.append(Fault("gear_low", 1, frozenset({"gear_low"}), has_time_truth=False))
    faults.append(Fault("gear_high", 1, frozenset({"gear_high"}), has_time_truth=False))
    faults.append(Fault("over_braking", 5, frozenset({"over_braking", "low_vmin"}), needs_brake=True))
    for p in (15, 30):
        faults.append(Fault("overdriving", p, frozenset({"overdriving", "low_vmin"})))
    return faults


# Two faults in the same corner, the usual way a slow corner goes wrong in more than one place.
COMBOS = [
    ("early_brake", 20, "late_throttle", 20),
    ("low_vmin", 6, "late_throttle", 20),
    ("line_wide", 2, "late_throttle", 20),
    ("over_braking", 5, "late_throttle", 20),
    ("early_brake", 20, "gear_low", 1),
]


def applicable(fault: Fault, c: CornerContext, has_position: bool) -> bool:
    if fault.needs_brake and c.brake_on is None:
        return False
    if fault.needs_throttle and c.throttle_on is None:
        return False
    if fault.needs_position and not has_position:
        return False
    if fault.kind == "gear_low" and c.apex_gear <= 1:
        return False
    if fault.kind == "early_brake" and c.brake_on is not None:
        return c.apex - c.brake_on > fault.size and c.brake_on - fault.size > c.previous_end
    return not (fault.kind == "early_release" and c.brake_on is not None and c.apex - c.brake_on <= fault.size + 5)
