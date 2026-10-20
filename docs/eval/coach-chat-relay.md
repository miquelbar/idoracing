# Race-engineer chat: does it relay what was measured?

**Date:** 2026-10-20
**Question:** when the driver asks about a corner, does the chat model name the cause the analysis measured, give the time it was given, and add nothing that was not measured?

## Setup

- **Cases:** 44, built by `eval/coach/build_cases.py` from the planted faults of `eval/fault_injection/` (after the rule changes in `fault-injection-corner-analysis.md`): 8 single faults, 2 two-fault combinations and 1 clean corner, in 2 corners of each of the 2 laps. Each case carries the exact production system prompt: the corner fields the frontend sends, passed through `_chat_context`, knowledge base included.
- **Question:** "¿Qué estoy haciendo mal en esta curva, cómo lo mejoro y cuánto tiempo puedo ganar?"
- **Model:** Claude Haiku, run as four subagents of 11 cases each, each case answered with its system prompt in role. Not the production call path (no API system role), and one subagent reported it saw the expected answers while reading its file; it said it did not use them. Later runs get `prompts.jsonl`, which leaves them out.
- **Scoring:** `eval/coach/score.py`, fixed Spanish keyword and number rules. Checked by hand on 10 replies: cause verdict agreed in 9 of 10 (one miss, a phrasing since added to the rules); the first version flagged 4 inflated times that were the 0.08 s threshold quoted from the prompt, so numbers already in the prompt are no longer counted.

## Result

| Check | Result |
|---|---|
| Every planted cause named | 98 % (39/40) |
| Reported time relayed | 100 % (40/40) |
| A larger gain than reported stated | 0 % (0/40) |
| Clean corner given an invented loss | 0 % (0/4) |
| Setup change suggested, although both laps are the same car with the same setup | 82 % (36/44) |
| Placeholder setup quoted as the car's real setup | 52 % (23/44) |

Replies of this run are in `eval/coach/runs/2026-10-20-haiku.jsonl`.

## Findings

1. **Relay is good.** With the braking point, throttle pickup and diagnosis now in the prompt, Haiku names the cause and the time almost every time, and does not invent a loss on a clean corner.
2. **Setup advice where none is warranted.** Both laps of every case share car and setup, so the time is lost driving, yet 36 of 44 replies suggest a setup change. The prompt asks for it: rule 8 of the persona and the "relate the corner to a setup change whenever it makes sense" line in `_chat_context`.
3. **The setup in the prompt is invented.** `_chat_context` writes a fixed setup (54.0 % brake bias, ARB 4/2, TC1 3, 26.8 psi) for every car. Half the replies quote it as the driver's setup and build advice on it, for example "move the bias from 54.0 % to 53.5 %" on a Tatuus FA1.
4. **Vague labels invite invented detail.** Where the analysis still gives "inconsistent braking", the model explained it with "higher initial brake pressure", which was not measured (2 of the 10 replies read).

## Decision

The chat relays measurements faithfully; what it adds on its own is setup advice resting on a setup it was never given. The next change is to the prompt, not the model: give it the real setup when one is loaded and none otherwise, and suggest setup only when the loss repeats with consistent driving. Measure it on this same case set, and on a smaller model with `prompts.jsonl`.
