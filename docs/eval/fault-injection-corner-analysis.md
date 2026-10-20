# Planted driving faults: does the corner analysis find them?

**Date:** 2026-10-20
**Question:** given a lap with known driving mistakes, does the shipped corner analysis (which the coach reads) find the corner, name the cause, measure the size and cost the time right, without flagging corners that were not touched?

## Setup, fixed before measuring

- **Laps:** two real laps from public MoTeC files, neither part of this repository: Le Mans Ultimate, BMW GT3 at Spa (13 corners detected), and Assetto Corsa, Tatuus FA1 at Spa (8 corners), both from [snipem/ld-cli](https://github.com/snipem/ld-cli). Both have position channels. Spa has no corner table, so corners come from `detect_corners`, as in production.
- **Method:** each lap is resampled to 1 m and used as the reference. A copy gets faults planted with speed and inputs edited together, and its time is integrated again, so the cost of every fault is exact. The comparison runs unchanged on the pair. Code in `eval/fault_injection/`.
- **Faults:** early brake 10/20/40 m, early brake release 20/40 m, slower apex 3/6/10 km/h, late throttle 10/20/40 m, early apex 10/20/30 m, line 1/2/3 m wider or tighter, one gear low or high, 40 % brake held into the apex (costing 5 km/h), 15/30 % extra steering lock. Then five two-fault combinations in one corner, and 40 laps per sample with three random faults in three random corners. 647 laps in total.
- **Controls:** each lap against itself; on the Tatuus file, lap 0 against lap 1 (real against real, nothing planted; lap 0 is the race start).
- **Acceptance:** corner with the biggest loss is the planted one in at least 90 % of cases that cost at least 0.08 s (the analyzer's own significance line); cause named, by label or by diagnosis sentence, in at least 80 %; time within 0.03 s or 25 % of the true cost; at most one untouched corner flagged per lap.
- **Not changed:** no analyzer code. Two bugs in the harness itself were fixed before this result (early braking was clipped at the corner window, and multi-fault laps were ranked only among planted corners); the acceptance lines did not move.

## Result

| Check | LMU BMW GT3 | AC Tatuus | Line | Verdict |
|---|---|---|---|---|
| Where: top loss is the planted corner | 98 % (118/120) | 98 % (93/95) | 90 % | pass |
| Three faults per lap: all in the top 3 | 100 % (75/75) | 98 % (87/89) | 90 % | pass |
| Why: cause named, all faults | 75 % (216/289) | 74 % (143/194) | 80 % | |
| Why: cause named, early apex left out | 82 % (206/250) | 81 % (137/170) | 80 % | pass, barely |
| Time within tolerance of the true cost | 88 % (105/120) | 85 % (81/95) | | see finding 3 |
| Laps with a wrong extra cause in the labels | 24 % (69/289) | 29 % (57/194) | | see finding 2 |
| Untouched corners flagged | at most 1 per lap; 27 in 376 laps | at most 1 per lap; 9 in 271 laps | 1 per lap | pass |
| Lap against itself | nothing flagged | nothing flagged | | pass |

The cause verdict uses the reading without early apex: as planted, early apexing costs almost no time, so the analyzer calling those corners clean is the right answer, not a miss. The false-alarm line is read per lap; every one of the 36 flagged corners got a vague label (mostly "suboptimal line") and none got a specific cause. Either way, findings 1 to 3 below stand: the pass is narrow and hides faults that are never named.

`python -m eval.fault_injection.score` prints the full table per fault and per combination.

## Findings

1. **Some faults are never named.** Early brake release: 0 % (0/30); the `early_release` label requires the brake to start earlier, not to end earlier. Early braking by 10 m: 0 % (0/14), because the label and the sentence need 15 m and 12 m, while 10 m already costs about 0.14 s here. Late throttle by 10 m: 5 % (1/21), same cause (12 m line). Apex speed 3 km/h down: 62 %, because the line is at 3 km/h exactly.
2. **Wrong causes are added by rule.** Any apex speed loss of 4 km/h or more also gets "too much brake in the turn" (`over_braking`) and "tight line" (`missed_apex`), even when the brake trace and the measured position are identical to the reference: 100 % of the 6 and 10 km/h cases. With a position channel the line rule should trust the measured offset; today it falls through to the speed rule. Late throttle gets "pinched exit" in up to 75 % of cases, early braking gets "early release" in up to 71 %.
3. **Late throttle is under-costed.** The corner window ends before the straight, so the time a late throttle costs on the straight is not attributed to the corner: the analysis reports a median 62 to 77 % of the true cost, and as little as 37 %. The time inside the window is always right (215/215), which says the window, not the arithmetic, is the gap.
4. **Early braking is measured short.** The corner window starts at the speed peak before the corner, which on the BMW lap is 2 to 67 m before the reference brake onset. Braking earlier than that moves the onset outside the window, so a 40 m early brake was measured as 2 to 40 m (correct in 17 % and 57 % of cases).
5. **Two causes in one corner are often reduced to one.** Each axis (braking, balance, line) gives one label, so combinations survive only when the second cause shows up in the diagnosis sentence: early brake plus late throttle, both named in 43 % and 57 %.
6. **Real against real is unreadable.** With nothing planted, every corner from T2 to T8 of lap 0 against lap 1 got between one and four specific causes. T1 is left out: lap 0 is the race start and its trace begins at 260 m, so T1 is filled by extrapolation. There is no truth there, but the planted results above suggest many are the rule-added causes of finding 2.

Limits of this harness: early apexing as planted costs almost no time (median 0.002 to 0.026 s), so it tests the label only; line and gear faults leave speed unchanged, so they test labels only; overdriving scales steering with a bump centred on the corner window, not on the steering peak, so the extra lock where the analyzer measures it is below the nominal 15 or 30 %; late throttle stops being carried at the next brake onset, which leaves a small speed step there on short straights; the vehicle is not simulated, so a fault's cost comes from the edited speed trace, not from physics.

## Decision

The analysis is good at **where** and **how much inside the corner**, and weak on **why**. It clears the 80 % line on causes by one or two points, never names some faults that cost more than its own significance line, and adds wrong causes in about a quarter of laps, which then reach the coach as fact. Fixing findings 1, 2 and 3 is a separate change to `analysis/corners.py`, to be measured with this same harness, keeping one of the two laps aside to check that thresholds tuned on one car hold on the other.
