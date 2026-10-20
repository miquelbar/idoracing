"""
Scores a results file written by run.py against the acceptance lines fixed before the first run.

    python -m eval.fault_injection.score results.json
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from eval.fault_injection.run import FAULTS_PER_RANDOM_LAP, SIGNIFICANT_S

ACCEPT = {"where": 0.90, "why": 0.80}
TIME_ABS_S = 0.03
TIME_REL = 0.25


def pct(hits: int, n: int) -> str:
    return f"{100 * hits / n:.0f}% ({hits}/{n})" if n else "n/a"


def time_ok(found: float, truth: float) -> bool:
    return abs(found - truth) <= max(TIME_ABS_S, TIME_REL * abs(truth))


def singles_table(cases: list[dict]) -> list[str]:
    rows = [
        "| Fault | n | Where (top corner) | Why (cause named) | Size measured | Time vs total | Wrong causes in labels |",
        "|---|---|---|---|---|---|---|",
    ]
    by_fault = defaultdict(list)
    for c in cases:
        by_fault[c["faults"][0]].append(c)
    for fault, xs in by_fault.items():
        sig = [x for x in xs if x["true_total_s"][0] >= SIGNIFICANT_S]
        where = sum(x["top_corner"] == x["corners"][0] for x in sig)
        why = sum(bool(set(x["expected"][0]) & set(x["named"][0])) for x in xs)
        measured = [x["measured_ok"][0] for x in xs if x["measured_ok"][0] is not None]
        timed = sum(time_ok(x["found_time_s"][0], x["true_total_s"][0]) for x in sig)
        other = Counter(cause for x in xs for cause in set(x["claimed"][0]) - set(x["expected"][0]))
        other_txt = ", ".join(f"{k} {v}" for k, v in other.most_common(4)) or "none"
        rows.append(
            f"| {fault} | {len(xs)} | {pct(where, len(sig))} | {pct(why, len(xs))} | "
            f"{pct(sum(measured), len(measured))} | {pct(timed, len(sig))} | {other_txt} |"
        )
    return rows


def combos_table(cases: list[dict]) -> list[str]:
    rows = ["| Combo | n | Where | Both causes named | One named | Time vs total |", "|---|---|---|---|---|---|"]
    by_fault = defaultdict(list)
    for c in cases:
        by_fault[c["faults"][0]].append(c)
    for fault, xs in by_fault.items():
        parts = [p.split("(")[0] for p in fault.split(" + ")]
        both = sum(all(p in x["named"][0] for p in parts) for x in xs)
        one = sum(any(p in x["named"][0] for p in parts) for x in xs)
        sig = [x for x in xs if x["true_total_s"][0] >= SIGNIFICANT_S]
        where = sum(x["top_corner"] == x["corners"][0] for x in sig)
        timed = sum(time_ok(x["found_time_s"][0], x["true_total_s"][0]) for x in sig)
        rows.append(
            f"| {fault} | {len(xs)} | {pct(where, len(sig))} | {pct(both, len(xs))} | {pct(one, len(xs))} | "
            f"{pct(timed, len(sig))} |"
        )
    return rows


def multi_lines(cases: list[dict]) -> list[str]:
    planted = recalled = named = 0
    for x in cases:
        top = set(x["ranking"][:FAULTS_PER_RANDOM_LAP])
        for i, corner in enumerate(x["corners"]):
            if x["true_total_s"][i] < SIGNIFICANT_S:
                continue
            planted += 1
            recalled += corner in top
            named += bool(set(x["expected"][i]) & set(x["named"][i]))
    return [
        f"- Planted corners costing at least {SIGNIFICANT_S} s: {planted}",
        f"- Ranked among the lap's top {FAULTS_PER_RANDOM_LAP} losses: {pct(recalled, planted)}",
        f"- Cause named: {pct(named, planted)}",
    ]


def false_alarm_lines(cases: list[dict]) -> list[str]:
    clean_seen = sum(1 for _ in cases)
    alarms = [a for x in cases for a in x["false_alarms"]]
    causes = Counter(c for a in alarms for c in a["causes"])
    return [
        f"- Laps checked: {clean_seen}; untouched corners flagged: {len(alarms)}",
        "- Causes claimed on untouched corners: " + (", ".join(f"{k} {v}" for k, v in causes.most_common()) or "none"),
    ]


def main(path: str) -> None:
    results = json.loads(Path(path).read_text())
    for sample, r in results.items():
        cases = r["cases"]
        print(f"\n## {sample}\n")
        print(
            f"Corners detected: {r['controls']['corners']}. Lap against itself flags: {r['controls']['self_vs_self_flagged'] or 'nothing'}.\n"
        )
        print("### Single faults\n")
        print("\n".join(singles_table([c for c in cases if c["kind"] == "single"])))
        print("\n### Two faults in one corner\n")
        print("\n".join(combos_table([c for c in cases if c["kind"] == "combo"])))
        print("\n### Three faults per lap, random corners\n")
        print("\n".join(multi_lines([c for c in cases if c["kind"] == "multi"])))
        print("\n### False alarms on untouched corners (all cases)\n")
        print("\n".join(false_alarm_lines(cases)))
        if "real_vs_real" in r["controls"]:
            print("\n### Real lap against another real lap, nothing planted\n")
            for x in r["controls"]["real_vs_real"]:
                print(f"- T{x['corner']}: {x['time_s']:+.3f} s, causes {', '.join(x['causes']) or 'none'}")


if __name__ == "__main__":
    main(sys.argv[1])
