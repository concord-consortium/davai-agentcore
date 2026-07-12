// AgentCore bring-your-own-container HTTP server.
//
// Implements the AgentCore Runtime service contract:
//   GET  /ping         -> health check (200)
//   POST /invocations  -> run one turn, return the client-facing output JSON
// on port 8080. The WebSocket endpoint (/ws) and SSE streaming are added in P3;
// for P2 this returns the final turn result synchronously (agent parity first).

import "dotenv/config";
import http from "node:http";
import { runTurn } from "./runner.js";
import { validateTurn } from "./validate.js";
import { attachWebSocket } from "./ws.js";
import type { TurnInput } from "./types.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = "0.0.0.0";
const MAX_BODY_BYTES = 100 * 1024 * 1024; // AgentCore payload cap is 100 MB
const AUTH_SECRET = process.env.DAVAI_API_SECRET; // optional shared bearer (parity with old server)

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function authorized(req: http.IncomingMessage): boolean {
  if (!AUTH_SECRET) return true; // no secret configured => open (local dev)
  const header = req.headers["authorization"];
  // The DAVAI client sends the token verbatim (no "Bearer " prefix).
  return header === AUTH_SECRET || header === `Bearer ${AUTH_SECRET}`;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/ping") {
      return send(res, 200, { status: "Healthy" });
    }

    if (req.method === "POST" && req.url === "/invocations") {
      if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

      let body: any;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { error: (e as Error).message });
      }

      const invalid = validateTurn(body);
      if (invalid) return send(res, 400, { error: invalid });

      try {
        const output = await runTurn(body as TurnInput);
        return send(res, 200, output);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("Turn failed:", message);
        return send(res, 500, { error: message });
      }
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: (e as Error).message });
  }
});

// WebSocket transport (P3): streams tokens + collapses the client tool round-trip.
attachWebSocket(server);

server.listen(PORT, HOST, () => {
  console.log(`davai-agentcore backend listening on http://${HOST}:${PORT}  (/ping, /invocations, ws://.../ws)`);
});
