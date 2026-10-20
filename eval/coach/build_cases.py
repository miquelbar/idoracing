"""
Builds the race-engineer chat cases from planted faults: for each one, the exact system prompt the
chat sends in production (frontend corner fields, then `_chat_context`), a driver question, and what
a faithful answer has to contain. Any model can then be run on `cases.jsonl` and scored with score.py.

    python -m eval.coach.build_cases [--out eval/coach/cases.jsonl]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from analysis.lap_comparison import compare_laps
from api.server import ChatMessage, ChatRequest, _chat_context, _corner_dto
from eval.fault_injection import faults as F
from eval.fault_injection.run import as_lap, fault_by
from eval.fault_injection.samples import SAMPLES, load

QUESTION = "¿Qué estoy haciendo mal en esta curva, cómo lo mejoro y cuánto tiempo puedo ganar?"

# Exactly the fields frontend/src/views/TelemetryView.tsx sends with a chat message.
FRONTEND_FIELDS = (
    "corner_number",
    "name",
    "delta_time",
    "v_min_ref",
    "v_min_comp",
    "delta_v_min",
    "v_entry_ref",
    "v_entry_comp",
    "delta_v_entry",
    "v_exit_ref",
    "v_exit_comp",
    "delta_v_exit",
    "comp_gear",
    "gear_eval",
    "balance_eval",
    "trail_braking_eval",
    "racing_line_eval",
    "racing_line_advice",
    "braking_point_delta",
    "throttle_pickup_delta",
    "diagnosis",
    "excess_steer_deg",
    "steer_to_g",
    "kerb_strike_detected",
    "damping_advice",
)

PLAN = [
    [("early_brake", 20)],
    [("early_release", 40)],
    [("low_vmin", 6)],
    [("late_throttle", 20)],
    [("line_wide", 2)],
    [("line_tight", 2)],
    [("over_braking", 5)],
    [("overdriving", 30)],
    [("early_brake", 20), ("late_throttle", 20)],
    [("low_vmin", 6), ("late_throttle", 20)],
    [],
]
CORNERS_PER_PLAN = 2


def selected_corner(dto) -> dict:
    data = dto.model_dump()
    return {k: data[k] for k in FRONTEND_FIELDS}


def build(sample) -> list[dict]:
    session, laps = load(sample)
    ref = F.resample(laps[sample.base_lap].telemetry)
    ref_lap = as_lap(1, ref)
    base = compare_laps(ref_lap, ref_lap)
    contexts = F.corner_contexts(
        ref, [{"number": c.corner_number, "start": c.start_dist, "end": c.end_dist} for c in base.corners]
    )
    cases = []
    for planned in PLAN:
        picked = [f for f in (fault_by(k, s) for k, s in planned)]
        usable = [c for c in contexts if all(F.applicable(f, c, True) for f in picked)]
        for c in usable[:: max(1, len(usable) // CORNERS_PER_PLAN)][:CORNERS_PER_PLAN]:
            comp = ref
            for f in picked:
                comp = f.apply(comp, c)
            result = compare_laps(ref_lap, as_lap(2, comp))
            corner = next(ca for ca in result.corners if ca.corner_number == c.number)
            req = ChatRequest(
                messages=[ChatMessage(role="user", content=QUESTION)],
                track_name=session.track,
                car_name=session.car,
                selected_corner=selected_corner(_corner_dto(corner)),
                lang="es",
            )
            cases.append(
                {
                    "id": f"{sample.key}-T{c.number}-{'+'.join(f.label for f in picked) or 'clean'}",
                    "system": _chat_context(req, "es"),
                    "user": QUESTION,
                    "expected": {
                        "causes": sorted(set().union(*(f.causes for f in picked))) if picked else [],
                        "reported_time_s": corner.time_delta_corner,
                        "true_time_s": float(comp["time"][-1] - ref["time"][-1]),
                        "same_car_same_setup": True,
                    },
                }
            )
    return cases


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "cases.jsonl")
    args = parser.parse_args()
    cases = [case for sample in SAMPLES for case in build(sample)]
    args.out.write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in cases))
    prompts = args.out.with_name("prompts.jsonl")
    prompts.write_text(
        "".join(json.dumps({k: c[k] for k in ("id", "system", "user")}, ensure_ascii=False) + "\n" for c in cases)
    )
    print(f"{len(cases)} cases written to {args.out}, and without the expected answers to {prompts}")


if __name__ == "__main__":
    main()
