# Runnable demo — stand up the backend, point the hosted plugin at it

The plugin is already **built and hosted** on GitHub Pages and **reads its backend from a URL param**,
so you don't rebuild anything — you stand up one public WebSocket endpoint and hand testers a link.

- **Hosted plugin:** <https://concord-consortium.github.io/davai-agentcore/plugin/>
- **How it picks the backend:** `?davaiWs=wss://<host>/ws` in the plugin URL turns on the WebSocket
  transport and points it at that backend (verified: CODAP forwards the query into the plugin iframe).
  With no param, the plugin uses its default poll path — nothing to break.

## The one requirement: a **`wss://`** (TLS WebSocket) endpoint
The transport is a WebSocket, and the plugin is served over HTTPS, so the backend must be reachable over
**`wss://`** (secure WebSocket). Two things this rules out:
- **AWS App Runner — does NOT support WebSockets** (HTTP-only ingress). Don't use it.
- **The deployed AgentCore runtime** — its invoke API is SigV4-signed, not browser-reachable (that's the
  separate "SigV4 proxy / OAuth inbound" production piece).

The backend container is the same one that runs on AgentCore. Run it anywhere with TLS + WebSocket support.

## The container
Image (ARM64, already in ECR): `816253370536.dkr.ecr.us-east-1.amazonaws.com/davai-agentcore-backend:latest`
- Listens on **:8080** — serves `/ping`, `/invocations`, and **`/ws`**.
- Env: **`OPENAI_API_KEY`** (required). Optional: `OPENAI_BASE_URL`, and `DAVAI_API_SECRET` (a shared
  bearer — leave unset for an open demo; see Security).
```bash
docker run -d --name davai-demo -p 8080:8080 -e OPENAI_API_KEY=sk-... \
  816253370536.dkr.ecr.us-east-1.amazonaws.com/davai-agentcore-backend:latest
# (aws ecr get-login-password | docker login --username AWS --password-stdin 816253370536.dkr.ecr.us-east-1.amazonaws.com  first)
```
Or from source: `cd backend && npm i && npm run build && OPENAI_API_KEY=sk-... node dist/server.cjs`

---

## Recipe A — Cloudflare Tunnel (fastest, ~5 min, WS-capable)
Best if you just want a link today. Public `wss://` with zero load-balancer setup.
1. Run the container (above) on any machine with Docker.
2. `cloudflared tunnel --url http://localhost:8080`
   → prints a public URL like `https://<random>.trycloudflare.com` (WebSockets pass through).
3. Backend WS host = that host. (`trycloudflare` URLs are ephemeral; use a **named tunnel** + a DNS
   record for a durable demo.)

## Recipe B — EC2 + Caddy (durable, in AWS, ~15 min)
1. Launch a small ARM instance (e.g. `t4g.small`), security group inbound **443** (and 22).
2. Install Docker, run the container (above).
3. Install **Caddy** (auto-TLS) with a one-line Caddyfile — Caddy proxies WebSockets transparently:
   ```
   davai-demo.<your-domain> {
       reverse_proxy localhost:8080
   }
   ```
   Point a DNS A record at the instance; Caddy fetches a cert automatically.
4. Backend WS host = `davai-demo.<your-domain>`.

## Recipe C — ECS Fargate + ALB (most AWS-native durable)
An **Application Load Balancer supports WebSockets**. Run the image as a Fargate service, ALB listener on
443 (ACM cert) → target group → container :8080, health check `/ping`. More moving parts than A/B; pick
this if you want it fully managed in the QA account.

---

## Point the plugin at your backend
Once you have `wss://<BACKEND-HOST>/ws`, the CODAP link is (URL-encode the plugin URL after `di=`):

```
https://codap3.concord.org/?di=https%3A%2F%2Fconcord-consortium.github.io%2Fdavai-agentcore%2Fplugin%2F%3FdavaiWs%3Dwss%3A%2F%2F<BACKEND-HOST>%2Fws
```

That decodes to `…/?di=https://concord-consortium.github.io/davai-agentcore/plugin/?davaiWs=wss://<BACKEND-HOST>/ws`.
Open it, add a dataset in CODAP, and ask DAVAI a question — it runs over the WebSocket to your backend.

**Quick health check:** `curl https://<BACKEND-HOST>/ping` should return ok before loading the plugin.

## Security / cost (read before sharing widely)
- An **open** endpoint uses **your OpenAI key** for anyone with the link. For a team demo that's usually
  fine — but **set a low spend cap** on the key, and tear the endpoint down after.
- To gate it: set `DAVAI_API_SECRET` on the backend. The hosted build already sends its baked `AUTH_TOKEN`
  as the WS bearer, but that token is visible in the built JS, so it's a soft gate, not a real secret.
  A real gate = a private backend + a rebuilt plugin with a fresh token, or IP allow-listing at the proxy.

## Teardown
- Recipe A: `Ctrl-C` the tunnel, `docker rm -f davai-demo`.
- Recipe B: terminate the EC2 instance (and the DNS record).
- Recipe C: delete the ECS service + ALB.
- The ECR image and the AgentCore runtime are unaffected — teardown for those is in `DEPLOYED.md`.
