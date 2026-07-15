# Path B — Goal statement (ready to fire)

Full technical spec: [`PATH-B-serverless-ws-proxy.md`](./PATH-B-serverless-ws-proxy.md). The charter below
is self-contained and sized to drop into `/goal` (< 4000 chars).

---

**GOAL:** Stand up a browser-reachable `wss://` front door to the already-deployed DAVAI AgentCore
runtime using a **serverless API Gateway WebSocket + Lambda SigV4 proxy** — no always-on server, idle cost
≈ $0 — and prove the GitHub Pages-hosted plugin runs end-to-end in real CODAP against it, at parity with
the local WebSocket path, with per-session in-VM memory preserved. Deliver it deployed to the davai QA
account, namespaced and one-command tear-down-able. This closes the one production gap from the migration
(the browser can't SigV4-sign the runtime's invoke API; the Lambda can), so it is reusable, not throwaway.

**COMPLETION METRICS (all must hold):**
1. **Reachable:** a browser WS client and `wscat` connect to
   `wss://{apiId}.execute-api.{region}.amazonaws.com/{stage}` and receive a valid `{type:"result"}` frame
   for a describe turn.
2. **Parity:** the hosted plugin (`?davaiWs=<proxy>`), driven in real CODAP via the done-loop, passes both
   tiers — describe (correct answer) and modify (document-state delta) — **≥90% over ≥20 runs each**.
3. **Session memory:** multi-turn in-VM memory proven through the proxy (turn 2 recalls turn 1 via a stable
   **≥33-char `runtimeSessionId`**); no SQS/RDS/job table required (at most one stateless-mapping table).
4. **Idle-free architecture:** the resource inventory contains only API Gateway (WS) + Lambda + IAM (+ an
   optional single DynamoDB); **NO EC2/Fargate/RDS/always-on compute**; idle cost ≈ $0 and per-turn cost in
   cents.
5. **No latency regression + deployed & green:** proxy p50 end-to-end within **+30%** of the local WS
   baseline for describe and modify (the extra API GW+Lambda hop must not erase the transport win); the
   done-loop passes against the deployed `wss`; one-command teardown verified.

**BOUNDARY CONDITIONS:**
- Shared QA account (`816253370536`, `us-east-1`): every resource **namespaced `davai-ws-proxy*` + tagged**;
  change or delete **nothing** outside that set (standing security constraint).
- **Reuse** the deployed runtime `davai_agentcore-0c9quSDd49` — do not redeploy or modify it, nor its
  execution role. The proxy Lambda gets its **own** role
  (`bedrock-agentcore:InvokeAgentRuntime` + `execute-api:ManageConnections` + Logs).
- **OpenAI-only** (as currently wired); multi-provider is out of scope.
- Client changes limited to **at most the one-line "session-in-body" edit**; no other plugin behavior
  change; the poll path stays intact and default.
- **Auth:** open-with-spend-cap is acceptable for a demo; a `$connect` Lambda authorizer is a stretch, not
  a gate.
- **Live token streaming is a stretch goal;** a non-streaming v1 (single `result` frame per turn) satisfies
  metrics 1–4.

**BAIL-OUT / EXIT CRITERIA (stop, write up findings, reconsider EC2 or defer):**
- If `InvokeAgentRuntime` from Lambda can't reliably return a turn within Lambda/API-GW limits (timeouts,
  or accumulated frames exceed the 128 KB WS limit and can't be chunked) → fall back to non-streaming v1;
  if that still fails → **bail**.
- If reaching green would require touching shared QA resources **beyond** the namespaced set → **stop and
  ask** the owner.
- If model/API spend exceeds **$20** during build/test → **stop**.
- **Time-box:** not green within ~1 focused day → stop, document, decide EC2-vs-defer.
- If metric #5 (latency) fails and can't be recovered → keep it as a **documented, escalated** result (as
  with the original charter's tool-calling bar), never a silent miss.

---

## What "done" produces
- `infra/pathb/` — SAM template + Lambda handler, deployed; `WssUrl` recorded in `DEPLOYED.md`.
- A one-line `sam delete` teardown, verified.
- A short results note: reachability, parity numbers, memory proof, latency vs local WS, idle-cost check.
- The shareable CODAP link (`…/?di=…/plugin/?davaiWs=wss://…`) for demos.
