# done-loop/ — parity + latency harness

Proves the two headline completion metrics (see [`../docs/GOAL.md`](../docs/GOAL.md)): behavioral
**parity** with the old backend and a measured **latency win**.

## Contents
- `harness/` — Playwright setup lifted from `codap-plugin-starter-project` (real CODAP via `di=`, HTTPS
  dev server + self-signed certs, `frameLocator(".codap-web-view-iframe")`). Adapt `harness/playwright/
  in-codap.spec.ts` to the forked DAVAI client.
- `suite/` _(P1)_ — the fixed **interaction suite**: ~8–12 interactions, tagged `modify` or `describe`.
- `latency/run.mjs` — **built.** Executes each interaction N× against a backend, timing the whole logical
  interaction (message + any tool round-trips → final), and reports mean/p50/p95 overall + tool-calling.
  Three drivers: `ws` (new WS), `invocations` (new HTTP), **`sam-poll`** (the OLD sam-server baseline:
  POST /message + poll /status). Node 22+ globals only, no deps. New-stack WS preview run against a local
  backend with real OpenAI. Old-vs-new comparison needs the deployed baseline URL + token:
  `node run.mjs --transport sam-poll --url https://<api-gw>/ --auth <token> --runs 20`.
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
