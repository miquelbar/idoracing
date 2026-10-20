# Fault injection for the corner analysis

Measures whether the lap comparison (`analysis.lap_comparison.compare_laps`, which feeds the coach) finds the corner where time is lost, names the cause, measures its size and costs it right. No expert labels are needed: the faults are planted, so the right answer is known.

How it works:

1. A real lap from a public MoTeC file is resampled to a 1 m grid and used as the reference.
2. A copy of it gets one or more driving faults (`faults.py`): braking earlier, releasing the brake early, a slower apex, throttle later, apexing early, a wider or tighter line, a wrong gear, braking into the apex, overdriving. Speed and inputs are edited together and the lap time is integrated again, so the time each fault costs is exact.
3. The shipped comparison runs on the pair, unchanged.
4. `score.py` checks the output against the planted faults.

The telemetry files are downloaded on first run into `~/.cache/idoracing-eval` (or `$IDORACING_EVAL_CACHE`) and are never committed.

```bash
python -m eval.fault_injection.run --out results.json
python -m eval.fault_injection.score results.json
```

What it does not measure: whether the coach's LLM repeats these findings faithfully, and whether a setup change would help. The latest result and its reading are in `docs/eval/fault-injection-corner-analysis.md`.
