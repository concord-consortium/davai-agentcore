# backend/ — AgentCore BYO container

The new backend: the existing **LangGraph-JS** agent re-hosted in an AgentCore bring-your-own container.

**Contract (P2/P3):** HTTP server on port **8080** exposing `POST /invocations` + `GET /ping`, plus a
`/ws` WebSocket endpoint. **ARM64** image ≤2 GB.

**Ported from** `reference/sam-server/src/` (agent logic in `utils/llm-utils.ts` + `utils/tool-utils.ts`),
with `PostgresSaver` swapped for an in-VM checkpointer and the async job/queue indirection removed.

_Empty scaffold — populated in P2 (agent + `/invocations`+`/ping`, local parity) and P3 (`/ws`)._
See [`../docs/design.md`](../docs/design.md) § backend.
