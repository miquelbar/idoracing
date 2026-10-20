"""
Plants known driving faults into real laps, runs the shipped lap comparison on each one, and scores
whether it finds the corner, names the cause, measures the size and costs the time right.

    python -m eval.fault_injection.run [--out results.json]
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

from analysis.lap_comparison import compare_laps
from domain.session import CornerAnalysis, Lap
from eval.fault_injection import faults as F
from eval.fault_injection.samples import SAMPLES, load

# The analyzer's own significance line: below it a corner is not expected to be called out.
SIGNIFICANT_S = 0.08
# A corner whose planted fault costs less than this is "clean" for false-alarm counting.
CLEAN_S = 0.02
RANDOM_LAPS = 40
FAULTS_PER_RANDOM_LAP = 3
SEED = 7

TOLERANCE = {"brake_m": 5.0, "throttle_m": 5.0, "vmin_kmh": 1.5, "line_m": 0.5}

CAUSE_BY_CODE = {
    ("trail_code", "over_braking"): "over_braking",
    ("trail_code", "early_release"): "early_release",
    ("balance_code", "understeer"): "low_vmin",
    ("balance_code", "traction"): "late_throttle",
    ("balance_code", "early_braking"): "early_brake",
    ("racing_line_code", "late_apex"): "line_wide",
    ("racing_line_code", "missed_apex"): "line_tight",
    ("racing_line_code", "early_apex"): "early_apex",
    ("racing_line_code", "pinched_exit"): "pinched_exit",
    ("gear_code", "too_low"): "gear_low",
    ("gear_code", "too_high"): "gear_high",
}
# The diagnosis sentence reaches the coach too, so a cause it states counts as named.
CAUSE_BY_DIAGNOSIS = {
    "Frenada anticipada": "early_brake",
    "Aceleración retrasada": "late_throttle",
    "Pérdida de velocidad en vértice": "low_vmin",
    "Subviraje por sobreconducción": "overdriving",
    "más abierto que la referencia": "line_wide",
    "más cerrado que la referencia": "line_tight",
}
VAGUE_CODES = {("trail_code", "inconsistent"), ("balance_code", "momentum_loss"), ("racing_line_code", "suboptimal")}


def claimed_causes(ca: CornerAnalysis) -> set[str]:
    causes = {cause for (attr, code), cause in CAUSE_BY_CODE.items() if getattr(ca, attr) == code}
    if ca.excess_steer_deg is not None and ca.excess_steer_deg > 3.0:
        causes.add("overdriving")
    return causes


def named_causes(ca: CornerAnalysis) -> set[str]:
    stated = {cause for phrase, cause in CAUSE_BY_DIAGNOSIS.items() if phrase in ca.diagnosis}
    return claimed_causes(ca) | stated


def vague(ca: CornerAnalysis) -> bool:
    return any(getattr(ca, attr) == code for attr, code in VAGUE_CODES)


def as_lap(number: int, lap: dict[str, np.ndarray]) -> Lap:
    return Lap(
        lap_number=number,
        lap_time=float(lap["time"][-1]),
        telemetry={k: v.tolist() for k, v in lap.items()},
    )


def window_seconds(lap: dict[str, np.ndarray], c: F.CornerContext) -> float:
    return float(lap["time"][c.end] - lap["time"][c.start])


def measured_ok(fault: F.Fault, ca: CornerAnalysis) -> bool | None:
    """Whether the analyzer's raw measurement matches the planted size; None where it has no such number."""
    k, s = fault.kind, fault.size
    if k == "early_brake":
        return ca.brake_delta_dist is not None and abs(ca.brake_delta_dist + s) <= TOLERANCE["brake_m"]
    if k == "late_throttle":
        return ca.throttle_delta_dist is not None and abs(ca.throttle_delta_dist - s) <= TOLERANCE["throttle_m"]
    if k in ("low_vmin", "over_braking"):
        return abs(ca.delta_v_min + s) <= TOLERANCE["vmin_kmh"]
    if k in ("line_wide", "line_tight"):
        sign = 1.0 if k == "line_wide" else -1.0
        return ca.line_offset_apex_m is not None and abs(ca.line_offset_apex_m - sign * s) <= TOLERANCE["line_m"]
    if k == "gear_low":
        return ca.comp_gear == ca.ref_gear - 1
    if k == "gear_high":
        return ca.comp_gear == ca.ref_gear + 1
    if k == "overdriving":
        return ca.excess_steer_deg is not None and ca.excess_steer_deg > 0
    return None


@dataclass
class Case:
    sample: str
    kind: str
    corners: list[int]
    faults: list[str]
    true_total_s: list[float]
    true_window_s: list[float]
    found_time_s: list[float]
    top_corner: int
    ranking: list[int]
    expected: list[list[str]]
    claimed: list[list[str]]
    named: list[list[str]]
    measured_ok: list[bool | None]
    vague: list[bool]
    false_alarms: list[dict] = field(default_factory=list)


def run_case(sample, ref, ref_lap, contexts, plan, kind) -> Case:
    """`plan` is a list of (corner context, [faults]) applied in order to one copy of the reference."""
    comp = ref
    totals, windows = [], []
    for c, fs in plan:
        before = comp
        for f in fs:
            comp = f.apply(comp, c)
        totals.append(float(comp["time"][-1] - before["time"][-1]))
        windows.append(window_seconds(comp, c) - window_seconds(ref, c))
    result = compare_laps(ref_lap, as_lap(2, comp))
    by_number = {ca.corner_number: ca for ca in result.corners}
    planted = {c.number for c, _ in plan}
    ranking = [ca.corner_number for ca in sorted(result.corners, key=lambda ca: -ca.time_delta_corner)]

    false_alarms = []
    for c in contexts:
        if c.number in planted:
            continue
        ca = by_number[c.number]
        true_window = window_seconds(comp, c) - window_seconds(ref, c)
        if abs(true_window) >= CLEAN_S:
            continue
        causes = claimed_causes(ca)
        if causes or ca.time_delta_corner > SIGNIFICANT_S or vague(ca):
            false_alarms.append(
                {"corner": c.number, "causes": sorted(causes), "vague": vague(ca), "time_s": ca.time_delta_corner}
            )

    cas = [by_number[c.number] for c, _ in plan]
    return Case(
        sample=sample,
        kind=kind,
        corners=[c.number for c, _ in plan],
        faults=[" + ".join(f.label for f in fs) for _, fs in plan],
        true_total_s=totals,
        true_window_s=windows,
        found_time_s=[ca.time_delta_corner for ca in cas],
        top_corner=ranking[0],
        ranking=ranking,
        expected=[sorted(set().union(*(f.causes for f in fs))) for _, fs in plan],
        claimed=[sorted(claimed_causes(ca)) for ca in cas],
        named=[sorted(named_causes(ca)) for ca in cas],
        measured_ok=[measured_ok(fs[0], ca) if len(fs) == 1 else None for (_, fs), ca in zip(plan, cas, strict=True)],
        vague=[vague(ca) for ca in cas],
        false_alarms=false_alarms,
    )


def fault_by(kind: str, size: float) -> F.Fault:
    return next(f for f in F.catalogue() if f.kind == kind and f.size == size)


def cases_for(sample) -> tuple[list[Case], dict]:
    session, laps = load(sample)
    ref = F.resample(laps[sample.base_lap].telemetry)
    ref_lap = as_lap(1, ref)
    has_position = "x" in ref and bool(np.any(ref["x"] != 0))
    self_check = compare_laps(ref_lap, ref_lap)
    corner_defs = [
        {"number": ca.corner_number, "start": ca.start_dist, "end": ca.end_dist} for ca in self_check.corners
    ]
    contexts = F.corner_contexts(ref, corner_defs)

    controls = {
        "corners": len(contexts),
        "self_vs_self_flagged": [
            ca.corner_number
            for ca in self_check.corners
            if claimed_causes(ca) or vague(ca) or abs(ca.time_delta_corner) > 0.0
        ],
    }
    if sample.noise_lap is not None:
        noise = compare_laps(ref_lap, as_lap(2, F.resample(laps[sample.noise_lap].telemetry)))
        controls["real_vs_real"] = [
            {
                "corner": ca.corner_number,
                "time_s": ca.time_delta_corner,
                "causes": sorted(claimed_causes(ca)),
                "vague": vague(ca),
            }
            for ca in noise.corners
        ]

    out = []
    catalogue = F.catalogue()
    for c in contexts:
        for f in catalogue:
            if F.applicable(f, c, has_position):
                out.append(run_case(sample.key, ref, ref_lap, contexts, [(c, [f])], "single"))
        for k1, s1, k2, s2 in F.COMBOS:
            pair = [fault_by(k1, s1), fault_by(k2, s2)]
            if all(F.applicable(f, c, has_position) for f in pair):
                out.append(run_case(sample.key, ref, ref_lap, contexts, [(c, pair)], "combo"))

    rng = random.Random(SEED)
    for _ in range(RANDOM_LAPS):
        picked = sorted(rng.sample(contexts, FAULTS_PER_RANDOM_LAP), key=lambda c: c.number)
        plan = []
        for c in picked:
            options = [f for f in catalogue if f.has_time_truth and F.applicable(f, c, has_position)]
            plan.append((c, [rng.choice(options)]))
        out.append(run_case(sample.key, ref, ref_lap, contexts, plan, "multi"))
    return out, controls


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("fault_injection_results.json"))
    args = parser.parse_args()
    results = {}
    for sample in SAMPLES:
        cases, controls = cases_for(sample)
        results[sample.key] = {"controls": controls, "cases": [asdict(c) for c in cases]}
    args.out.write_text(json.dumps(results, indent=1))
    print(f"{sum(len(r['cases']) for r in results.values())} cases written to {args.out}")


if __name__ == "__main__":
    main()
