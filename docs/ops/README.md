# Operations Overview

> Last updated: 2026-04-15

Ask BC runs as a hybrid: a Next.js app on Vercel and a Cloudflare Worker. Both targets must be operational for chat to work. Vercel handles OAuth, the BC admin iframe, and App Extensions. The Worker handles all agent execution, tool calls, and BC API mutations.

## Contents

- [Infrastructure Topology](./infrastructure.md) — Vercel + Cloudflare + Upstash Redis topology, bindings, and data flow
- [Deployment Procedures](./deployment.md) — Step-by-step deploy for both targets, env vars, secret management, post-deploy verification

## Service Map

| Service | Provider | URL | Deploys via |
|---------|----------|-----|-------------|
| Next.js app | Vercel | https://ask-bc-signal-x-studio-labs.vercel.app | GitHub push to `main` |
| Agent Worker | Cloudflare | https://ask-bc-agent-runtime.biq.workers.dev | `wrangler deploy` (manual) |
| Credentials store | Upstash Redis | Shared between both | Vercel KV integration |

## Health Checks

| Check | Command |
|-------|---------|
| Worker health | `curl https://ask-bc-agent-runtime.biq.workers.dev/health` |
| Vercel app | Load `https://ask-bc-signal-x-studio-labs.vercel.app` — expect 302 redirect to BC auth |

## On-Call Reference

**Chat not working for a merchant:**
1. Check `NEXT_PUBLIC_WORKER_HOST` on Vercel — must be the production Worker URL
2. Check Worker health endpoint
3. Check if `JWT_KEY` is identical on both services (mismatch causes 401 on WebSocket upgrade)
4. Check if `CREDENTIAL_ENCRYPTION_KEY` is identical on both services (mismatch causes decrypt error on first turn)
5. Verify the merchant's store credentials exist in Redis: key pattern `ask-bc:store:{storeHash}`

**Worker returning 403 on agent routes:**
- Merchant's session JWT is expired (24h TTL) — ask them to reload the BC admin page
- `JWT_KEY` mismatch between Vercel and Worker

**Worker returning 401 on agent routes:**
- Missing `?token=` parameter on WebSocket URL — Next.js bug or `NEXT_PUBLIC_WORKER_HOST` misconfigured

**BC API 401 inside a chat turn:**
- Store access token revoked or expired — merchant needs to reinstall the app
- `CREDENTIAL_ENCRYPTION_KEY` mismatch — Worker can't decrypt the stored token

## Runbooks

Detailed runbooks are in [ops/runbooks/](./runbooks/). Currently documented:
- Worker deployment
- Secret rotation

## No Automated Alerting

There is no uptime monitor or alerting configured. The Cloudflare dashboard provides Worker error rates and invocation counts via the `observability: {enabled: true}` setting in `wrangler.jsonc`. Vercel provides function logs via the Vercel dashboard.
