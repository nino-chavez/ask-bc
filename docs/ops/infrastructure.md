# Infrastructure Topology

> Last updated: 2026-04-15

## Overview

Ask BC uses three infrastructure providers:

| Provider | Role | Resources |
|----------|------|-----------|
| Vercel | Next.js app hosting, Edge Middleware, Functions | 1 project, auto-deploy from GitHub |
| Cloudflare | Worker + Durable Objects | 1 Worker (`ask-bc-agent-runtime`), 1 DO namespace (`AskBC`) |
| Upstash | Redis (credentials store) | 1 database, shared between Vercel and Worker |

## Vercel

**Project:** `ask-bc` linked to `nino-chavez/ask-bc` on GitHub.

**Deploys:** Push to `main` triggers auto-deploy. No staging environment configured.

**Compute:**
- OAuth routes (`/api/auth`, `/api/load`, `/api/uninstall`, `/api/remove-user`) — Vercel Serverless Functions (Node.js runtime)
- JWT session middleware (`src/middleware.ts`) — Vercel Edge Runtime
- Static and RSC pages — Vercel CDN

**Environment variables (12):**

| Variable | Source | Purpose |
|----------|--------|---------|
| `ANTHROPIC_API_KEY` | Set manually | Legacy: used by Vercel-side chat route (fallback path) |
| `APP_ORIGIN` | Set manually | Public URL — used in OAuth callbacks and Worker CORS |
| `BIGCOMMERCE_CLIENT_ID` | Set manually | BC OAuth app credentials |
| `BIGCOMMERCE_CLIENT_SECRET` | Set manually | BC OAuth app credentials |
| `JWT_KEY` | Set manually | JWT signing secret — must match Worker |
| `CREDENTIAL_ENCRYPTION_KEY` | Set manually | AES-256-GCM key — must match Worker |
| `NEXT_PUBLIC_WORKER_HOST` | Set manually | Worker base URL for WebSocket connections |
| `KV_REST_API_URL` | Vercel KV integration | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Vercel KV integration | Upstash Redis token |
| `KV_REST_API_READ_ONLY_TOKEN` | Vercel KV integration | Read-only Redis token |
| `KV_URL` | Vercel KV integration | Upstash Redis URL (alternative format) |
| `REDIS_URL` | Vercel KV integration | Upstash Redis URL (alternative format) |

The four `KV_*` / `REDIS_URL` vars are automatically populated by the Vercel KV (Upstash) marketplace integration when connected to the project.

## Cloudflare Worker

**Worker name:** `ask-bc-agent-runtime`

**Workers.dev URL:** `https://ask-bc-agent-runtime.biq.workers.dev`

**Compatibility:** `compatibility_date: "2026-03-01"`, `nodejs_compat` flag enabled.

**Observability:** Enabled — error rates, invocation counts, and CPU time visible in Cloudflare dashboard.

### Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `AskBC` | Durable Object | One DO instance per store (`idFromName(storeHash)`). Holds session state and the SQLite write audit log. Uses `new_sqlite_classes` migration. |
| `LOADER` | Worker Loader | Provides the Codemode Dynamic Worker execution environment. Registered in `worker_loaders`. |
| `BC_API_BASE` | Var | `https://api.bigcommerce.com` — BC REST API base URL |
| `APP_ORIGIN` | Var | `https://askbc.ninochavez.co` — used for CORS |

### Secrets (5)

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API — Haiku 4.5 + Sonnet 4.6 |
| `UPSTASH_REDIS_REST_URL` | Same Upstash instance as Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | Same Upstash instance as Vercel |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key — must match Vercel |
| `JWT_KEY` | JWT verification — must match Vercel |

### Durable Object

One `AskBC` instance per store, identified by `storeHash`. Each instance:
- Maintains session state for the active chat connection (managed by the Think base class)
- Holds a SQLite `write_audit` table for all confirmed write operations
- Caches BC API client instances after first credential resolution in a turn
- Has a 30-second Codemode execution timeout per tool invocation

The DO is created on first connection and persists indefinitely. Storage (SQLite) is billed by Cloudflare Durable Objects storage rates.

### Codemode (Dynamic Workers)

Read tool scripts are executed in Codemode — isolated Dynamic Workers spawned per invocation. The host (AskBC DO) injects `codemode.*` proxy functions backed by the real BC API clients. The generated script has no outbound network access other than via these proxies. Execution timeout is 30 seconds.

## Upstash Redis

**Instance:** Single database shared between Vercel and Worker.

**Key pattern:** `ask-bc:store:{storeHash}` → JSON payload:
```json
{
  "storeHash": "abc123",
  "encryptedAccessToken": "<base64-encoded AES-256-GCM ciphertext>",
  "scope": "store_v2_orders read_only ...",
  "adminId": 123456
}
```

The `encryptedAccessToken` field holds the AES-256-GCM encrypted token. The `iv`, `ciphertext`, and `tag` are JSON-encoded within the field. The `CREDENTIAL_ENCRYPTION_KEY` decrypts it.

**Write path:** Vercel OAuth install callback (`/api/auth`) — encrypts and writes on every install.

**Read path:** Worker `resolveStoreCredentials()` — reads and decrypts on the first turn of each DO session.

**No TTL** on store keys — credentials persist until the merchant uninstalls (which calls the Vercel uninstall callback that deletes the key).

## Network Architecture

```
Browser (BC Admin iframe)
  |
  |-- HTTPS --> Vercel (Next.js)
  |              OAuth, session cookies, page SSR
  |
  |-- WSS --> Cloudflare Worker
               JWT auth gate → Durable Object → Codemode
               ↓
               BigCommerce REST API V2/V3
               ↓
               Upstash Redis (credential read)
```

The browser has two connections:
1. HTTPS to Vercel for page loads and OAuth
2. WebSocket to the Worker for all chat traffic (direct, not proxied through Vercel)

CORS on the Worker is restricted to `APP_ORIGIN` (the Vercel deployment URL). This is enforced in the `corsHeaders()` function using the `APP_ORIGIN` environment variable set in `wrangler.jsonc`.

## Shared Secrets Policy

Two secrets must be identical on both Vercel and the Worker:

| Secret | Consequence of mismatch |
|--------|------------------------|
| `JWT_KEY` | Worker rejects the browser's JWT with 401 — chat cannot connect |
| `CREDENTIAL_ENCRYPTION_KEY` | Worker cannot decrypt the stored BC token — all BC API calls fail |

When rotating either of these secrets, update both services in the same deployment window to avoid an outage. For `CREDENTIAL_ENCRYPTION_KEY`, re-encryption of all stored tokens is required (or merchants must reinstall). For `JWT_KEY`, existing sessions are invalidated and merchants are logged out (they re-auth on next BC admin page load).
