# Path B — Serverless WebSocket proxy to the deployed AgentCore runtime

**Status:** fire-and-execute runbook (not yet built). This stands up a **browser-reachable `wss://`**
endpoint that forwards to the **already-deployed AgentCore runtime**, with **no always-on server** —
idle cost ≈ $0, nothing to remember to shut down. It is the production "SigV4/OAuth inbound" shim from
`P5-final-report.md`, so building it is not throwaway.

**Estimated effort:** ~half a day. **Ongoing cost:** per-message (~cents); ~$0 when idle.

---

## Why this design
- **Idle-free:** API Gateway + Lambda bill per request/connection-minute. Nobody using it ⇒ ~$0. There is
  no instance to stop (the whole reason to prefer this over EC2/Fargate).
- **Browser-reachable `wss://` with no domain:** API Gateway serves
  `wss://{apiId}.execute-api.{region}.amazonaws.com/{stage}` with TLS included — the EC2 domain/cert
  problem disappears.
- **Exercises the REAL runtime:** the Lambda calls `bedrock-agentcore InvokeAgentRuntime` on the live
  runtime (`davai_agentcore-0c9quSDd49`), which holds per-session in-VM memory. The browser can't sign
  SigV4; the Lambda can. That's the entire gap this closes.

## Architecture
```
CODAP plugin (hosted)          API Gateway              Lambda proxy            AgentCore runtime
  WsTransport  ── wss ─▶  WebSocket API ($default) ─▶  invoke-frame  ── SigV4 ─▶  InvokeAgentRuntime
     ▲                    postToConnection  ◀────────  token/result  ◀─────────  streamed response
     └──────────────── { type:"token" } / { type:"result" } frames ─────────────┘
```
One WebSocket connection ↔ one `runtimeSessionId` (sticky routing → same microVM → memory persists).

## Contract this must preserve (from `client/src/utils/ws-transport.ts` + `backend/src/ws.ts`)
The hosted plugin already speaks this exact protocol, so the proxy must match it verbatim:

- **Socket URL:** the client appends `?session={sid}&token={authToken}`.
  `sid = deriveSessionId(threadId)` — the threadId padded to **≥33 chars** (AgentCore's
  `runtimeSessionId` minimum). Use this `sid` as the `runtimeSessionId` for sticky routing.
- **Client → server frames** (JSON, one per turn):
  - a turn: `{ kind?: "message"|"tool", llmId, threadId, message, dataContexts, graphs }`
  - `{ type: "seed", threadId, llmId, messages }` — replay transcript after a reconnect (no LLM call)
  - `{ type: "cancel" }` — abort the in-flight turn
- **Server → client frames:**
  - `{ type: "token", text }` — incremental **accumulated** user-facing text (not deltas)
  - `{ type: "result", output }` — terminal; `output` is `{ response }` **or**
    `{ status: "requires_action", tool_call_id, ... }`
  - `{ type: "error", error }`
  - `{ type: "seeded", count }` — ack for a `seed` frame

> The runtime's contract is **`POST /invocations`** (+ `/ping`). The proxy sends the turn frame as the
> invoke **payload** and maps the runtime's response back to `token`/`result` frames. Token streaming
> requires `/invocations` to stream (SSE) — see **Streaming** below; a non-streaming v1 (result frame
> only, no live tokens) is a valid first cut and still collapses the poll/tool round-trip.

---

## Components to build
1. **API Gateway WebSocket API** — routes `$connect`, `$disconnect`, `$default`.
   `RouteSelectionExpression: "$request.body.action"` won't match (client frames have no `action`), so all
   turns fall through to **`$default`** — which is what we want.
2. **Lambda: `davai-ws-proxy`** (Node 20, ARM64) — handles all three routes (below).
3. **(Optional) Lambda authorizer on `$connect`** — validates `?token=` against a secret; or leave open
   with a spend cap (see Security).
4. **IAM role for the Lambda** — `bedrock-agentcore:InvokeAgentRuntime` on the runtime ARN,
   `execute-api:ManageConnections` on the API, and CloudWatch Logs.
5. **(Optional) DynamoDB table** — only if you want server-side connection state. **Not required:** the
   proxy is stateless because `runtimeSessionId` is derived from the client's `?session=` on every frame.

## Lambda handler (sketch — `handler.mjs`)
```js
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const RUNTIME_ARN = process.env.RUNTIME_ARN;            // arn:aws:bedrock-agentcore:...:runtime/davai_agentcore-0c9quSDd49
const REGION = process.env.AWS_REGION;
const core = new BedrockAgentCoreClient({ region: REGION });

export const handler = async (event) => {
  const { routeKey, connectionId, domainName, stage } = event.requestContext;
  if (routeKey === "$connect")    return { statusCode: 200 }; // (authorizer handles auth if enabled)
  if (routeKey === "$disconnect") return { statusCode: 200 };

  // $default: one turn frame from the client
  const mgmt = new ApiGatewayManagementApiClient({ region: REGION, endpoint: `https://${domainName}/${stage}` });
  const send = (obj) => mgmt.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: JSON.stringify(obj) }));

  try {
    const frame = JSON.parse(event.body || "{}");
    if (frame.type === "seed") {                         // replay transcript, no LLM
      await core.send(new InvokeAgentRuntimeCommand({
        agentRuntimeArn: RUNTIME_ARN,
        runtimeSessionId: sessionFromConnect(event),     // see note
        payload: Buffer.from(JSON.stringify({ __seed: frame })),
      }));
      return await send({ type: "seeded", count: frame.messages?.length ?? 0 }), { statusCode: 200 };
    }

    const resp = await core.send(new InvokeAgentRuntimeCommand({
      agentRuntimeArn: RUNTIME_ARN,
      runtimeSessionId: sessionFromConnect(event),       // ≥33 chars, stable per thread
      payload: Buffer.from(event.body),                  // forward the turn frame verbatim
    }));
    // Non-streaming v1: single JSON body -> one result frame.
    const text = await resp.response.transformToString();
    await send({ type: "result", output: JSON.parse(text) });
    return { statusCode: 200 };
  } catch (e) {
    await send({ type: "error", error: String(e?.message ?? e) });
    return { statusCode: 200 };
  }
};
```
**`sessionFromConnect`**: the `?session=` query arrives on `$connect`. Either (a) enable
`$connect` → stash `connectionId → session` in DynamoDB and look it up here, or (b) simplest: have the
client also include `session` (the derived sid) **in each turn frame** so the proxy reads it straight
from the body. Option (b) keeps the proxy fully stateless — add `session` to the turn frame in
`ws-transport.ts` (one line) when wiring this path.

## Streaming (optional, for live tokens)
To reproduce `{ type: "token" }` streaming, `/invocations` must emit SSE and the Lambda must relay chunks:
- Make `backend/src/server.ts` `/invocations` stream (it already streams over `/ws`; reuse
  `withAccumulatedResponse` to emit `data: {token}` SSE lines).
- In the Lambda, iterate `resp.response` (async chunks) and `send({type:"token", text})` per chunk, then a
  final `send({type:"result", output})`. Watch the 15-min Lambda cap (fine for chat turns) and API GW's
  128 KB frame limit (accumulated text can exceed it on long replies — send deltas or chunk it).

---

## Deploy (AWS SAM — `infra/pathb/template.yaml`)
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Parameters:
  RuntimeArn: { Type: String }   # arn:aws:bedrock-agentcore:us-east-1:816253370536:runtime/davai_agentcore-0c9quSDd49
Resources:
  WsApi:
    Type: AWS::ApiGatewayV2::Api
    Properties: { Name: davai-ws-proxy, ProtocolType: WEBSOCKET, RouteSelectionExpression: "$request.body.action" }
  ProxyFn:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs20.x
      Architectures: [arm64]
      Handler: handler.handler
      CodeUri: ./src
      Timeout: 120
      MemorySize: 256
      Environment: { Variables: { RUNTIME_ARN: !Ref RuntimeArn } }
      Policies:
        - Statement:
            - Effect: Allow
              Action: [ "bedrock-agentcore:InvokeAgentRuntime" ]
              Resource: !Ref RuntimeArn
            - Effect: Allow
              Action: [ "execute-api:ManageConnections" ]
              Resource: !Sub "arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${WsApi}/*"
  # $default, $connect, $disconnect routes + integrations + a deploy/stage.
  # (Full route/integration/permission blocks: see the SAM WebSocket example — 3 AWS::ApiGatewayV2::Route
  #  + 3 Integration + Lambda::Permission + one Stage "demo" with AutoDeploy.)
Outputs:
  WssUrl: { Value: !Sub "wss://${WsApi}.execute-api.${AWS::Region}.amazonaws.com/demo" }
```
```bash
cd infra/pathb
sam build
sam deploy --guided \
  --stack-name davai-ws-proxy \
  --parameter-overrides RuntimeArn=arn:aws:bedrock-agentcore:us-east-1:816253370536:runtime/davai_agentcore-0c9quSDd49 \
  --capabilities CAPABILITY_IAM --region us-east-1
# note the WssUrl output, e.g. wss://abc123.execute-api.us-east-1.amazonaws.com/demo
```

## Wire the hosted plugin
No rebuild needed — the hosted plugin reads the backend from the URL param:
```
https://codap3.concord.org/?di=<urlencoded>( https://concord-consortium.github.io/davai-agentcore/plugin/?davaiWs=wss://abc123.execute-api.us-east-1.amazonaws.com/demo )
```
(If you enable the stateless `session`-in-body option, that one-line `ws-transport.ts` change is the only
client edit; otherwise nothing changes.)

## Test before the plugin
```bash
npm i -g wscat
wscat -c "wss://abc123.execute-api.us-east-1.amazonaws.com/demo?session=$(printf 't-%033d' 1)"
> {"llmId":"{\"id\":\"gpt-4o-mini\",\"provider\":\"OpenAI\"}","threadId":"t1","message":"How many attributes?","dataContexts":[],"graphs":[]}
# expect a { "type":"result", "output":{...} } frame back
```

## Security / cost
- **Open** (no authorizer): anyone with the wss URL drives the runtime (your model spend). Fine for a
  gated demo; **set a spend cap** and delete the stack after.
- **Gated:** add a `$connect` **Lambda authorizer** that checks `?token=` against a secret you also bake
  into the plugin build. (Still soft — the token ships in JS — but stops casual use.)
- **Idle cost ≈ $0.** Charges: API GW WS ~$1.00/million messages + ~$0.25/million connection-minutes;
  Lambda per-invoke; plus the underlying model spend per turn. A demo session is cents.

## Teardown (one command)
```bash
sam delete --stack-name davai-ws-proxy --region us-east-1
```
The AgentCore runtime, ECR image, and execution role are untouched (their teardown is in `DEPLOYED.md`).

## Gotchas
- **`runtimeSessionId` must be ≥33 chars** and stable per thread, or memory won't stick — reuse
  `deriveSessionId`.
- **API GW WS idle timeout** is 10 min; the client's reconnect + `seed` re-pin already handles it.
- **128 KB frame limit** on API GW WS — chunk long streamed replies (send deltas, not the full accumulator).
- **Lambda needs `bedrock-agentcore:InvokeAgentRuntime`**, which the current execution role does **not**
  have (by design the runtime's own role has no `bedrock:InvokeModel`); this is a *separate* role for the
  proxy Lambda.
- **Region/account**: runtime lives in `816253370536` / `us-east-1`; deploy the proxy there too.
