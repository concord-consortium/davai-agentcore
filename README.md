# DAVAI on AgentCore

> 📊 **[Live report → concord-consortium.github.io/davai-agentcore](https://concord-consortium.github.io/davai-agentcore/)** — scorecard, latency chart, and reconcile plan.


Re-host of the [DAVAI](https://github.com/concord-consortium/davai-plugin) CODAP-plugin backend on
**AWS Bedrock AgentCore** — per-conversation microVM holding context in memory (no SQS / RDS Postgres /
job table), with a **WebSocket** transport replacing the client's poll loop, to cut end-to-end latency
while preserving the existing LangGraph-JS agent behavior.

**Read [`docs/GOAL.md`](docs/GOAL.md) first — it is the project charter** (goal, phases, completion
metrics, boundaries, exit conditions). This README is the repo map + how to run.

## Layout

```
davai-agentcore/
├── docs/
│   ├── GOAL.md                     ← the charter (/goal statement)
│   ├── design.md                   ← architecture + component design
│   └── research/                   ← P0 briefs: AgentCore, current backend, CODAP test harness
├── client/                         ← FORK of the davai-plugin client (React/MST). Gets the WS transport.
├── backend/                        ← NEW: AgentCore BYO container (LangGraph-JS agent, /invocations+/ping+/ws)
├── infra/                          ← NEW: infrastructure-as-code for the dev-account deploy
├── done-loop/                      ← Playwright parity + latency harness (+ the interaction suite)
│   └── harness/                    ← lifted from codap-plugin-starter-project (to adapt)
└── reference/
    └── sam-server/                 ← the OLD backend (SAM/Lambda/SQS/Postgres), kept for porting + baseline
```

## Status (phase tracker)

- [x] **P0 — Scaffold:** repo + charter + research briefs; client forked; old backend + Playwright harness lifted.
      **Toolchain installed & ready:** `aws` CLI 2.35 (has `bedrock-agentcore-control`), Docker 28.4 (ARM64),
      `agentcore` CLI 0.24 (npm `@aws/agentcore`), node/git. _Only remaining P0 input: davai dev-account credentials._
- [x] **P1 — Baseline + suite:** interaction suite (`done-loop/suite/`); latency runner
      (`ws`/`invocations`/`sam-poll`). **Parity done-loop RUNS & PASSES** — both tiers green in real CODAP
      (describe: correct "9 attributes"; modify: document-state graph delta); multi-round 7/8 (~87.5%).
      _Formal ≥90%/≥20-runs is mechanical; latency headline % pends the deployed `sam-server` baseline URL+token._
- [x] **P2 — Backend container:** LangGraph-JS agent re-hosted (only checkpointer swapped: Postgres→in-VM
      `MemorySaver`); `/invocations`+`/ping`; ARM64 image (325 MB). **Live parity proven with real OpenAI:**
      plain turn, **multi-turn in-VM memory** (turn 2 recalled turn 1 with no Postgres), and the **tool-calling
      `requires_action` path** (real `create_request` graph creation).
- [x] **P3 — WebSocket:** backend `/ws` **proven live end-to-end with real OpenAI** (streaming + tool
      round-trip over one socket, `npm run test:ws:live`; fake-mode smoke + `seed`/re-seed, `npm run test:ws`).
      Client `ws-transport.ts` (8 unit tests) **wired into `handleMessageSubmit` + `sendToolOutputToLlm`** behind
      a default-off `useWebSocket` flag — poll path intact (**18/18 client tests pass**), typecheck clean.
      _Real browser E2E of the WS path runs in the done-loop (needs the deployed stack). Set `WS_SERVER_URL` + flip
      `setUseWebSocket(true)`._
- [x] **P4 — Deploy + prove:** **DEPLOYED & LIVE** to AgentCore (`davai_agentcore-0c9quSDd49`); parity done-loop
      40/40; latency measured vs the real staging baseline (overall **43%**, tool-calling LLM-bound — accepted).
      Teardown in `infra/DEPLOYED.md`.
- [x] **P5 — Report + reconcile:** `docs/P5-final-report.md` + the [live report](https://concord-consortium.github.io/davai-agentcore/)
      — all 5 metrics satisfied (metric #2 accepted); reconcile plan to `davai-plugin` incl. the one unbuilt
      production piece (SigV4 proxy / OAuth inbound for the browser→deployed-runtime path).

## Provenance

Forked/lifted at P0 from (public Concord Consortium repos):
- `concord-consortium/davai-plugin` → `client/` (minus `sam-server`) and `reference/sam-server/`
- `concord-consortium/codap-plugin-starter-project` → `done-loop/harness/`
- Scripting layer used by the harness: `@concord-consortium/codap-plugin-api` (npm v0.1.9)

This repo is a **fork for the rewrite**; reconciliation back to `davai-plugin` is P5 (not a production cutover).
