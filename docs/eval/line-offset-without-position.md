# Estimating line offset without position data: rejected

**Date:** 2026-10-19
**Question:** can the line offset versus the reference lap (metres wider or tighter) be estimated for laps that have no position channel, as ACC's MoTeC export appears to be, from speed plus lateral G or yaw?

## Setup, fixed before measuring

- **Ground truth:** offsets from recorded world position (`Car Coord X/Y`), computed with the shipped `analysis.line_offset.corner_line_offsets`.
- **Data:** an Assetto Corsa MoTeC export at Spa (Tatuus FA1, two complete laps), from the public test data of [snipem/ld-cli](https://github.com/snipem/ld-cli). The file is not part of this repository.
- **Corners:** T2 to T8 as detected from the speed trace. T1 was excluded up front because lap 0 is the race start, in traffic.
- **Measured quantity:** change in offset since corner entry, at the apex and at exit, because without position the offset at entry cannot be known. 7 corners x 2 points = 14 values.
- **Baseline:** always answer 0 m.
- **Acceptance:** median absolute error at most 0.5 m, 90th percentile at most 1.0 m, and at least 50 % below the baseline. Failure direction: showing no number is preferred to showing a wrong one.
- **Estimators:** no tuned parameters, so no held-out slice was needed.
  - (a) Heading integrated from lateral G: dθ = a_lat · g · ds / v².
  - (b) Recorded heading (`Car Heading`), standing in for an integrated yaw-rate channel such as ACC's `ROTY`. Both laps are assumed to enter the corner with the same heading.

## Result

| Estimator | Median error | p90 | Max |
|---|---|---|---|
| Baseline (0 m) | 0.95 m | 3.71 m | 4.90 m |
| (a) lateral G | 1.44 m | 7.38 m | 23.64 m |
| (b) heading | 2.72 m | 10.08 m | 11.33 m |

Both estimators are worse than saying nothing. The errors grow with distance from the entry, which fits small heading differences between the laps being integrated into metres.

## Decision

Rejected. Laps without position data show the qualitative line reading only. The idea is worth reopening only with an anchor that removes the unknown entry offset and heading, for example a channel that measures position across the track directly.
