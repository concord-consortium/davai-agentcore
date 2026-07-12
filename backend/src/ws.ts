// WebSocket transport (AgentCore mounts a container /ws endpoint).
//
// Replaces the client's 0.5-1s polling. Each inbound frame is one turn (a user
// message or a tool result); the server streams { type: "token" } frames as text
// accumulates and ends with { type: "result", output }. The KEY win: when a turn
// returns a requires_action tool call, the client runs the CODAP op and sends the
// tool result back over the SAME socket — no second queued job, no new poll cycle.
//
// Server -> client frames:
//   { type: "token",  text }            incremental accumulated user-facing text
//   { type: "result", output }          terminal; output is { response } or a
//                                        { status: "requires_action", ... } payload
//   { type: "error",  error }
// Client -> server frames:
//   a TurnInput ({ llmId, threadId, message, ... } or { kind: "tool", ... })
//   { type: "cancel" }                  abort the in-flight turn on this socket

import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import { runTurn } from "./runner.js";
import { validateTurn } from "./validate.js";
import type { TurnInput } from "./types.js";

const AUTH_SECRET = process.env.DAVAI_API_SECRET;

function authorizeSocket(req: IncomingMessage): boolean {
  if (!AUTH_SECRET) return true;
  const header = req.headers["authorization"];
  const token = header ?? new URL(req.url ?? "", "http://localhost").searchParams.get("token") ?? undefined;
  return token === AUTH_SECRET || token === `Bearer ${AUTH_SECRET}`;
}

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    if (!authorizeSocket(req)) {
      ws.close(4401, "unauthorized");
      return;
    }

    const send = (obj: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    // One in-flight turn per socket; a new turn or a cancel frame aborts the prior.
    let current: AbortController | null = null;

    ws.on("message", async (raw) => {
      let frame: any;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return send({ type: "error", error: "invalid JSON frame" });
      }

      if (frame?.type === "cancel") {
        current?.abort();
        return;
      }

      const invalid = validateTurn(frame);
      if (invalid) return send({ type: "error", error: invalid });

      current?.abort(); // supersede any prior in-flight turn on this socket
      const controller = new AbortController();
      current = controller;

      try {
        const output = await runTurn(frame as TurnInput, {
          signal: controller.signal,
          onToken: (text) => send({ type: "token", text }),
        });
        send({ type: "result", output });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (current === controller) current = null;
      }
    });

    ws.on("close", () => current?.abort());
  });

  return wss;
}
