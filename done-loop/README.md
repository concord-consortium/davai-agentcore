# done-loop/ — parity + latency harness

Proves the two headline completion metrics (see [`../docs/GOAL.md`](../docs/GOAL.md)): behavioral
**parity** with the old backend and a measured **latency win**.

## Contents
- `harness/` — Playwright setup lifted from `codap-plugin-starter-project` (real CODAP via `di=`, HTTPS
  dev server + self-signed certs, `frameLocator(".codap-web-view-iframe")`). Adapt `harness/playwright/
  in-codap.spec.ts` to the forked DAVAI client.
- `suite/` _(P1)_ — the fixed **interaction suite**: ~8–12 interactions, tagged `modify` or `describe`.
- `latency/` _(P1)_ — runner that executes each interaction ≥20× against old (deployed, polling) and new
  (AgentCore, WS) stacks, using the client's `performance.now()` hooks; reports mean/p50/p95 +
  removed-component breakdown.
- `judge/` _(P1)_ — LLM-judge for `describe` semantic-equivalence scoring vs the old backend.

## Rubric (tiered)
- **modify** → assert on CODAP **document-state deltas** via `@concord-consortium/codap-plugin-api`
  `get*` helpers (or the CODAP API Tester). Deterministic.
- **describe** → LLM-judge semantic equivalence vs old-backend answer.

## Run (once built)
```bash
cd done-loop/harness && npm i && npx playwright test      # parity
cd done-loop/latency && npm run compare                    # latency old-vs-new (needs both stacks reachable)
```

_Harness lifted in P0; suite/latency/judge built in P1._
