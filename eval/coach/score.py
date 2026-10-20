"""
Scores race-engineer replies to cases.jsonl with fixed text rules, so a run with any model scores the
same way. The rules are keyword heuristics in Spanish: they are checked by reading a sample of replies
by hand, and that check is recorded with each result.

    python -m eval.coach.score eval/coach/cases.jsonl responses.jsonl
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CAUSE_PATTERNS = {
    "early_brake": [
        r"fren\w* (un poco |algo |\d+ ?m )?m[aá]s tarde",
        r"retras\w* (el |tu )?(punto de )?frenada",
        r"frenada anticipada",
        r"fren\w* (demasiado )?(pronto|antes)",
        r"punto de frenada",
    ],
    "late_throttle": [
        r"(gas|acelerador) (m[aá]s )?(antes|pronto)",
        r"aceler\w* (m[aá]s )?(antes|pronto)",
        r"apertura (del? )?(gas|acelerador)",
        r"abr\w* (el )?(gas|acelerador)",
        r"gas abiert\w*",
    ],
    "early_release": [
        r"suelt\w* (el )?freno",
        r"solt\w*",
        r"trail.?braking",
        r"mant\w* (el |algo de |un poco de )?freno",
    ],
    "low_vmin": [
        r"velocidad (m[ií]nima|de paso|en (el )?v[eé]rtice)",
        r"paso por curva",
        r"m[aá]s velocidad",
        r"pierdes [\d.,]+ ?km/h en el (v[eé]rtice|[aá]pice)",
        r"v[eé]rtice\**:? \**[\d.,]+ ?km/h",
    ],
    "over_braking": [
        r"(exceso|demasiado) (de )?freno",
        r"menos freno",
        r"suelt\w* (el )?freno",
        r"liber\w* (el )?freno",
    ],
    "line_wide": [r"m[aá]s abiert", r"abierto", r"cierr\w*", r"v[eé]rtice"],
    "line_tight": [r"m[aá]s cerrad", r"cerrado", r"abr\w* (la |tu )?(trazada|entrada|l[ií]nea)"],
    "overdriving": [r"volante", r"sobreconduc\w*", r"[aá]ngulo de (giro|direcci[oó]n)"],
    "gear_low": [r"marcha"],
    "gear_high": [r"marcha"],
}
SETUP_TERMS = r"brake bias|reparto de frenada|\bARB\b|barra estabilizadora|presi[oó]n(es)? de (los )?neum[aá]ticos|presiones (en caliente|en fr[ií]o)|psi\b|control de tracci[oó]n|\bTC\d?\b|aler[oó]n|\brake\b|altura|diferencial|precarga|amortigu|\bABS\b|camber|ca[ií]da"
FAKE_SETUP = r"54[.,]0 ?%|26[.,][6-9] psi|\bTC1 ?= ?3|barra (estabilizadora )?delantera (en |a )?4\b|54 ?mm"
SECONDS = r"(\d+[.,]\d+) ?(?:s\b|seg|segundos)"
TENTHS = r"(\d+(?:[.,]\d+)?) d[eé]cimas?"
TIME_ABS_S = 0.03
TIME_REL = 0.25


def stated_seconds(text: str) -> list[float]:
    values = [float(v.replace(",", ".")) for v in re.findall(SECONDS, text)]
    values += [float(v.replace(",", ".")) / 10.0 for v in re.findall(TENTHS, text)]
    return values


def near(value: float, target: float) -> bool:
    return abs(value - target) <= max(TIME_ABS_S, TIME_REL * abs(target))


def score_case(case: dict, reply: str) -> dict:
    text = reply.lower()
    expected = case["expected"]
    reported = expected["reported_time_s"]
    given = set(stated_seconds(case["system"].lower()))
    seconds = [v for v in stated_seconds(text) if v not in given or near(v, reported)]
    causes = expected["causes"]
    named = [c for c in causes if any(re.search(p, text) for p in CAUSE_PATTERNS[c])]
    return {
        "id": case["id"],
        "clean": not causes,
        "causes_expected": causes,
        "causes_named": named,
        "all_causes_named": bool(causes) and len(named) == len(causes),
        "time_relayed": any(near(v, reported) for v in seconds) if causes else None,
        "time_inflated": any(v > reported * 1.5 + TIME_ABS_S for v in seconds) if causes else None,
        "invented_loss": any(v >= 0.05 for v in seconds) if not causes else None,
        "setup_suggested": bool(re.search(SETUP_TERMS, reply, re.IGNORECASE)),
        "fake_setup_quoted": bool(re.search(FAKE_SETUP, reply, re.IGNORECASE)),
    }


def rate(rows: list[dict], key: str) -> str:
    values = [r[key] for r in rows if r[key] is not None]
    return f"{100 * sum(values) / len(values):.0f}% ({sum(values)}/{len(values)})" if values else "n/a"


def main(cases_path: str, responses_path: str) -> None:
    cases = {c["id"]: c for c in map(json.loads, Path(cases_path).read_text().splitlines())}
    replies = [json.loads(line) for line in Path(responses_path).read_text().splitlines() if line.strip()]
    rows = [score_case(cases[r["id"]], r["response"]) for r in replies]
    faulty = [r for r in rows if not r["clean"]]
    clean = [r for r in rows if r["clean"]]
    print(f"Replies scored: {len(rows)} of {len(cases)} cases\n")
    print(f"- Every planted cause named: {rate(faulty, 'all_causes_named')}")
    print(f"- Reported time relayed: {rate(faulty, 'time_relayed')}")
    print(f"- A gain larger than reported stated: {rate(faulty, 'time_inflated')}")
    print(f"- Clean corner given an invented loss: {rate(clean, 'invented_loss')}")
    print(f"- Setup change suggested (same car, same setup on both laps): {rate(rows, 'setup_suggested')}")
    print(f"- Placeholder setup quoted as the car's real setup: {rate(rows, 'fake_setup_quoted')}")
    print("\n| Case | Causes named | Time relayed | Setup suggested |\n|---|---|---|---|")
    for r in rows:
        named = ", ".join(r["causes_named"]) or "-"
        print(
            f"| {r['id']} | {named} / {', '.join(r['causes_expected']) or 'clean'} | {r['time_relayed']} | {r['setup_suggested']} |"
        )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
