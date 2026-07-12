# Latency findings (metric #2) — in progress

Honest status of the old-vs-new latency comparison. Two measurements, both local (no AWS yet),
same LangGraph agent on both sides; new = WebSocket, old = a faithful reproduction of the pre-AgentCore
poll/queue transport (`DAVAI_OLD_MODE=1`: POST `/message` → poll `/status`, second job per tool call).

## 1. Pure transport overhead (LLM removed — the clean signal)
Both servers in `DAVAI_FAKE_AGENT=1` so the timing is ONLY the transport. N=20 (`done-loop/latency/transport-bench.mjs`):

| scenario | WS p50 | poll p50 | WS saves |
|---|---|---|---|
| plain turn | 19 ms | 506 ms | **487 ms (96%)** |
| tool round-trip | 39 ms | 1012 ms | **973 ms (96%)** |

Interpretation: WS removes the **poll-discovery gap** (~0.5 s/turn — the client learns the answer is ready up
to a poll-interval late) and, on a tool call, the **entire second queued job + its own poll cycle** (~0.5 s
more). Each additional tool call in an interaction compounds the ~0.5–1 s saving.

## 2. End-to-end with a real LLM (gpt-4o-mini, N=12)
Against the local old-mode reproduction, single-turn end-to-end is **within noise** (WS overall
mean-of-means 3679 ms vs poll 3035 ms): the 2–4 s LLM generation dominates, and the ~0.5 s transport
saving is a small fraction of it. The local reproduction also **understates** the old stack (see caveat),
so it cannot produce the infra-inclusive headline %.

## What this means for the ≥40% / ≥50% bar
- The transport win is **real and quantified** (~490 ms/turn, ~970 ms/tool-call), but as a *fraction* of a
  full turn it only reaches the ≥40% bar when the old stack's **infrastructure overhead** is included and/or
  interactions carry **multiple tool calls**.
- **Caveat (why the local proxy is conservative):** old-mode uses the in-VM checkpointer and starts the job
  instantly, so it EXCLUDES the real old stack's **SQS enqueue, Lambda cold start (~1–3 s), and Postgres
  serialization** per turn — exactly the components AgentCore also removes. The real deployed old stack is
  therefore **slower** than this proxy, so the true reduction is **≥** what we can show locally.
- **Conclusion:** metric #2's headline % must be measured against the **deployed** old stack (the charter's
  "current deployed stack"). The local benchmark proves the mechanism and bounds the transport saving from
  below; the deployed comparison adds the infra overhead that pushes the reduction toward/over the bar.
- **Open risk (possible escalate):** if the deployed old stack turns out to be LLM-dominated with fast infra,
  the **≥40% single-turn** bar could be hard while the **≥50% tool-calling** bar (compounding round-trips)
  remains reachable. We'll know once we measure the deployed baseline; may warrant revisiting the bar per
  interaction class.

## Repro
```bash
# pure transport (no LLM):
DAVAI_FAKE_AGENT=1 PORT=A node dist/server.cjs &            # new (WS)
DAVAI_FAKE_AGENT=1 DAVAI_OLD_MODE=1 PORT=B node dist/server.cjs &   # old (poll)
node done-loop/latency/transport-bench.mjs --ws-url ws://127.0.0.1:A/ws --poll-url http://127.0.0.1:B/ --runs 20

# with a real LLM (needs OPENAI_API_KEY), suite-driven:
node done-loop/latency/run.mjs --transport ws       --url ws://127.0.0.1:A/ws --runs 20
node done-loop/latency/run.mjs --transport sam-poll  --url http://127.0.0.1:B/ --runs 20
```
