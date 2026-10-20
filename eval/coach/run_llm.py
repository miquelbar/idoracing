"""
Runs prompts.jsonl through the chat's own LLM client (provider, model, timeout and Ollama options from
the same environment and .env the server reads), the way `/api/coach/chat` calls it, and writes one
reply per line for score.py. A case the model did not answer in time is written with an empty reply
and source "rules": in the app that driver would have got the rule-based template instead.

    python -m eval.coach.run_llm --out eval/coach/runs/<date>-<model>.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from pathlib import Path

from api.server import llm_client

PROMPTS = Path(__file__).parent / "prompts.jsonl"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--prompts", type=Path, default=PROMPTS)
    args = parser.parse_args()

    timeout = float(os.environ.get("RADIO_CHAT_TIMEOUT", "12.0"))
    cases = [json.loads(line) for line in args.prompts.read_text().splitlines() if line.strip()]
    print(f"{len(cases)} cases, provider {llm_client.provider}, model {llm_client.active_model}, timeout {timeout:g} s")

    rows = []
    for i, case in enumerate(cases, start=1):
        messages = [{"role": "system", "content": case["system"]}, {"role": "user", "content": case["user"]}]
        started = time.monotonic()
        reply = llm_client.chat(messages, timeout=timeout)
        seconds = round(time.monotonic() - started, 1)
        answered = bool(reply and reply.strip())
        rows.append(
            {
                "id": case["id"],
                "response": reply if answered else "",
                "source": "llm" if answered else "rules",
                "seconds": seconds,
                "model": llm_client.active_model,
            }
        )
        print(f"[{i}/{len(cases)}] {case['id']}: {rows[-1]['source']} in {seconds} s")
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))

    answered = [r for r in rows if r["source"] == "llm"]
    print(
        f"\nAnswered by the model: {len(answered)}/{len(rows)}; fell back to the template: {len(rows) - len(answered)}"
    )
    print(
        f"Seconds per case, median {statistics.median(r['seconds'] for r in rows):g}, max {max(r['seconds'] for r in rows):g}"
    )
    print(f"Replies written to {args.out}")


if __name__ == "__main__":
    main()
