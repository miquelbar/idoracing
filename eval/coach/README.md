# Race-engineer chat cases

Checks whether the chat model relays what the corner analysis measured: the cause, the time, and nothing it was not given. Built on the planted faults in `eval/fault_injection/`, so every case has a known answer.

Files:

- `cases.jsonl`: one case per line. `system` is the exact system prompt the chat sends in production (the frontend's corner fields passed through `_chat_context`, knowledge base included), `user` is the driver's question, `expected` is what a faithful answer contains. Both laps of every case are the same car with the same setup, so the time is lost driving.
- `prompts.jsonl`: the same cases with only `id`, `system` and `user`. Give a model this file, never `cases.jsonl`, so it cannot see the expected answers.
- `runs/`: replies from past runs, kept as a baseline to compare a smaller model against.
- `build_cases.py`: regenerates both files from the current code. Rerun it after changing the analysis or the prompt, or the cases go stale.
- `score.py`: fixed text rules (Spanish keywords and number parsing), so any model's replies score the same way.

To run a model, send each case as `system` + one `user` message, and write one line per reply:

```json
{"id": "<case id>", "response": "<reply>"}
```

Then:

```bash
python -m eval.coach.build_cases
python -m eval.coach.score eval/coach/cases.jsonl responses.jsonl
```

The keyword rules are a heuristic. Before trusting a run, read about ten replies by hand and note how often the rules agreed with you. The latest run and that check are in `docs/eval/coach-chat-relay.md`.
