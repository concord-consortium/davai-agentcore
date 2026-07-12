# DAVAI on AgentCore

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
      _Open item: AWS CLI / `gh` / AgentCore toolkit + dev-account credentials are **not yet installed/available** on this machine — see `docs/design.md` § Access._
- [~] **P1 — Baseline:** interaction suite **drafted** for review (`done-loop/suite/`, 12 interactions,
      modify+describe). _Baseline latency measurement pends AWS creds + the deployed old stack + a provider key._
- [~] **P2 — Backend container:** LangGraph-JS agent re-hosted (only checkpointer swapped: Postgres→in-VM
      `MemorySaver`); `/invocations`+`/ping` on 8080; ARM64 image builds (325 MB) + runs; `/ping` green;
      pipeline runs end-to-end to the LLM boundary. _Live parity turn pends a provider API key._
- [~] **P3 — WebSocket:** backend `/ws` (token streaming + mid-turn tool round-trip + `seed`/re-seed via
      `updateState`) — `npm run test:ws` PASS. Client `ws-transport.ts` (session-id≥33, socket reuse, tool
      round-trip, idle re-seed) — **8 unit tests PASS**. _Remaining: wire the transport into the client's
      `handleMessageSubmit` (small, default-off flag); best verified with a provider key + the harness._
- [ ] **P4 — Deploy + prove:** deploy to dev; run done-loop; hit the latency bar.
- [ ] **P5 — Report + reconcile** plan back to `davai-plugin`.

## Provenance

Forked/lifted at P0 from (public Concord Consortium repos):
- `concord-consortium/davai-plugin` → `client/` (minus `sam-server`) and `reference/sam-server/`
- `concord-consortium/codap-plugin-starter-project` → `done-loop/harness/`
- Scripting layer used by the harness: `@concord-consortium/codap-plugin-api` (npm v0.1.9)

This repo is a **fork for the rewrite**; reconciliation back to `davai-plugin` is P5 (not a production cutover).
