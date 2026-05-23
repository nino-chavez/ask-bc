# Developer Guide

The agent runtime migrated from the Next.js tool loop to a Cloudflare Worker running Project Think + Codemode. Local development now requires running both servers. This guide covers both.

For architecture decisions behind the Worker, see [ADR-001](../architecture/decisions/001-codemode-agent-runtime.md). For Worker operational reference (gotchas, phase history, tool surface), see [agent-runtime.md](./agent-runtime.md).

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| npm | 10+ | Package manager |
| Wrangler | 3+ | Cloudflare Worker CLI — `npm install -g wrangler` |
| ngrok | Latest | Tunnel for BigCommerce OAuth testing (optional) |

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/nino-chavez/ask-bc.git
cd ask-bc

# 2. Install Next.js dependencies
npm install

# 3. Configure the Next.js app
cp .env.local.example .env.local
# Fill in your credentials (see Environment Variables below)

# 4. Install Worker dependencies
cd workers/agent-runtime
npm install

# 5. Configure the Worker
cp .dev.vars.example .dev.vars
# Fill in ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
# CREDENTIAL_ENCRYPTION_KEY, JWT_KEY

# 6. Start both servers (separate terminals)
# Terminal 1 — from repo root:
npm run dev

# Terminal 2 — from workers/agent-runtime/:
npx wrangler dev

# 7. Open the dev session
open http://localhost:3000/dev/session/dev-store
```

The Next.js app runs on port 3000. The Worker runs on port 8787. The chat UI connects directly to the Worker via WebSocket.

## Environment Variables

### Next.js (.env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| `BIGCOMMERCE_CLIENT_ID` | Yes | OAuth client ID from the [BC Developer Portal](https://devtools.bigcommerce.com/my/apps) |
| `BIGCOMMERCE_CLIENT_SECRET` | Yes | OAuth client secret |
| `APP_ORIGIN` | Yes | Public URL of the app. Use your ngrok URL for local BC testing. Defaults to `http://localhost:3000` |
| `JWT_KEY` | Yes | Secret for signing session JWTs. Minimum 32 characters. `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Yes | API key from the [Anthropic Console](https://console.anthropic.com/) |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | 32-byte hex key for AES-256-GCM token encryption. Must match Worker. `openssl rand -hex 32` |
| `NEXT_PUBLIC_WORKER_HOST` | Yes | Worker URL. Local: `http://localhost:8787`. Production: `https://ask-bc-agent-runtime.biq.workers.dev` |
| `KV_REST_API_URL` | No | Upstash Redis REST URL. Auto-populated by Vercel KV integration. Optional for local dev (falls back to `.credentials.json`) |
| `KV_REST_API_TOKEN` | No | Upstash Redis REST token |
| `KV_REST_API_READ_ONLY_TOKEN` | No | Read-only token — provided by Vercel KV integration |
| `KV_URL` | No | Provided by Vercel KV integration |
| `REDIS_URL` | No | Provided by Vercel KV integration |

### Worker (.dev.vars)

`.dev.vars` lives at `workers/agent-runtime/.dev.vars` and is gitignored. Use the same format as `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
CREDENTIAL_ENCRYPTION_KEY=<same 32-byte hex as NEXT.JS>
JWT_KEY=<same value as Next.js JWT_KEY>
```

For dev without Redis, add these instead:

```
BC_STORE_HASH=your-store-hash
BC_ACCESS_TOKEN=your-access-token
```

The Worker falls back to `BC_STORE_HASH` + `BC_ACCESS_TOKEN` when Redis env vars are absent. This only works for a single store — use Redis for multi-tenant dev.

**For production Worker secrets**, use `wrangler secret put` from `workers/agent-runtime/`:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put CREDENTIAL_ENCRYPTION_KEY
wrangler secret put JWT_KEY
```

## Dev Workflow Commands

### Next.js app (from repo root)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server on port 3000 with hot reload |
| `npm run type-check` | Run TypeScript compiler check |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |

### Worker (from workers/agent-runtime/)

| Command | Description |
|---------|-------------|
| `npx wrangler dev` | Start Worker dev server on port 8787 |
| `npx wrangler deploy` | Deploy to production |
| `wrangler secret put NAME` | Set a production secret |
| `wrangler secret list` | List secrets set in production |
| `npx tsc --noEmit` | Type check Worker code |

## Setting Up the Agent Runtime Worker

### Verifying the Worker starts

After `npx wrangler dev`, confirm the Worker and Durable Object bindings loaded:

```bash
curl http://localhost:8787/health
# {"ok":true,"service":"ask-bc-agent-runtime"}
```

### Smoke testing a turn end-to-end

The `/smoke` endpoint sends a single message through the full agent loop (credential resolution → Codemode → BC API) without a WebSocket client. This is the fastest way to verify the Worker is working with real BC data:

```bash
curl -X POST http://localhost:8787/smoke \
  -H "content-type: application/json" \
  -d '{"message":"How many products are in my store?"}'
```

Returns:
```json
{
  "text": "You have 119 products in your store...",
  "toolCalls": [...],
  "modelsUsed": ["haiku-4-5"],
  "timedOut": false
}
```

The smoke endpoint is blocked in production (returns 403). It is only active when `APP_ORIGIN` contains `localhost`.

### Testing block component rendering

The `/blocks-preview` route in the Next.js app renders all 7 block component types with example props. Use this to verify block rendering without running a real chat turn:

```
http://localhost:3000/blocks-preview
```

## Testing with a BigCommerce Store

### Option 1: Dev Session (no BC account needed)

Visit `http://localhost:3000/dev/session/dev-store` to get a mock session. This creates a session cookie for a dev store hash. BC API tool calls require real credentials in `.dev.vars` (the `BC_STORE_HASH` + `BC_ACCESS_TOKEN` fallback, or Redis).

### Option 2: Full OAuth with ngrok

For end-to-end testing against a real BigCommerce store:

1. Start ngrok: `ngrok http 3000`
2. Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok-free.dev`)
3. Set `APP_ORIGIN` in `.env.local` to the ngrok URL
4. In the [BC Developer Portal](https://devtools.bigcommerce.com/my/apps), update your app's callback URLs:
   - Auth Callback: `https://abc123.ngrok-free.dev/api/auth`
   - Load Callback: `https://abc123.ngrok-free.dev/api/load`
   - Uninstall Callback: `https://abc123.ngrok-free.dev/api/uninstall`
   - Remove User Callback: `https://abc123.ngrok-free.dev/api/remove-user`
5. Restart the dev server: `npm run dev`
6. Install or load the app from your BC store's control panel

## How to Add New BC Read Tools

Read tools live in `buildReadTools(env, bc)` in `workers/agent-runtime/src/index.ts`. They execute inside the Codemode sandbox — the model writes TypeScript that calls them as `codemode.*` functions. Credentials are injected by the host; the generated script never sees them.

```typescript
getCustomerGroups: tool({
  description: "Fetch customer groups. Returns group id, name, is_default, discount_rules.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(250).default(50),
    page: z.number().int().min(1).default(1),
  }),
  execute: async ({ limit, page }) => {
    const params = new URLSearchParams({ limit: String(limit), page: String(page) });
    return unwrap(
      await bc.customers.GET("/customers/groups", {
        params: { query: { limit, page }, header: { Accept: "application/json" } },
      }),
      "GET /customers/groups",
    );
  },
}),
```

The `bc` object contains typed openapi-fetch clients per API area: `bc.products`, `bc.orders`, `bc.customers`, `bc.categories`, `bc.brands`, `bc.variants`, `bc.locations`, `bc.promotions`, `bc.marketing`, `bc.channels`. Always `unwrap()` the result.

Write descriptions carefully — the model reads them to decide which tool to call and how. Vague descriptions produce wrong tool calls.

## How to Add New Generative UI Blocks

Block components have three parts:

1. **Schema entry in `workers/agent-runtime/src/blocks.ts`** — defines the description, whenToUse guidance, and a JSON example. The Worker includes this in the system prompt so the model knows to emit it.

2. **React component in `src/components/chat/blocks/`** — implement the visual component using BigDesign and Tailwind. Export it as a named component.

3. **Registry entry in `src/components/chat/blocks/index.tsx`** — add the component type name to the registry map so the parser can dispatch to it.

## Project Structure

```
ask-bc/
  src/                            # Next.js app (Vercel)
    app/
      api/auth/                   OAuth install callback
      api/load/                   Load callback (JWT + redirect)
      api/uninstall/              Uninstall callback
      api/remove-user/            Remove user callback
      blocks-preview/             Visual test route for block components
      dev/session/                Dev session route (bypass OAuth)
      stores/[storeHash]/
        extensions/               App Extension panel pages (orders, products)
        page.tsx                  Main chat page
    components/
      chat/
        WorkerChatPanel.tsx       Shared chat panel — used by main chat + extensions
        blocks/                   7 generative UI components + registry + parser
      BigCommerceSDK.tsx          BC iframe SDK integration
      StyledComponentsRegistry.tsx  SSR for styled-components
      ThemeProvider.tsx           BigDesign theme wrapper
    lib/
      ai/                         Legacy: Vercel-side tools, system prompt, model config
      bigcommerce/                BC OAuth, REST client, App Extensions GraphQL
      chat-storage.ts             IndexedDB persistence for chat history
      env.ts                      Environment variable validation (Zod + t3-env)
      redis.ts                    Upstash Redis client (lazy singleton)
      store-credentials.ts        AES-256-GCM credential storage (Redis + file fallback)
    middleware.ts                 JWT session handling for BC iframe loads
  workers/
    agent-runtime/                # Cloudflare Worker
      src/
        index.ts                  AskBC Think class, all tools, CORS, auth gate, system prompt
        bc/
          client.ts               Typed BC client factory (V2 middleware + auth error handling)
        blocks.ts                 Block schema catalog (shared source of truth)
        credentials.ts            Per-store credential resolution from Redis
        doc-search.ts             BC help docs keyword search
      wrangler.jsonc              Worker config, DO binding, worker_loaders
```

## Troubleshooting

### Worker can't connect to BC API (401 or credential errors)

Check `.dev.vars`. If using Redis, verify `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `CREDENTIAL_ENCRYPTION_KEY` are correct and match the values in `.env.local`. The encryption key must be identical on both sides — if the Vercel app encrypted the token with one key and the Worker decrypts with another, it will throw.

If using the single-store fallback, verify the `BC_STORE_HASH` in `.dev.vars` exactly matches the store hash you're using in the dev session URL.

### `__unsafe_ensureInitialized is not a function`

This means a version mismatch in `@cloudflare/think` or `partyserver`. Check `workers/agent-runtime/package.json` and ensure `@cloudflare/think` is pinned to the current version. Run `npm install` from `workers/agent-runtime/`.

### Type errors: `AnthropicProvider is not assignable to LanguageModel`

This is a type inference issue with `@ai-sdk/anthropic` overloads. Annotate the return type of `beforeTurn` explicitly:

```typescript
import { type LanguageModel } from "ai";

beforeTurn(ctx: { continuation: boolean }): Promise<{ model: LanguageModel } | void> { ... }
```

### styled-components hydration mismatch or missing styles

BigDesign uses styled-components v5. The SSR registry at `src/components/StyledComponentsRegistry.tsx` collects styles during server render. If you see hydration mismatches:
- Ensure `StyledComponentsRegistry` wraps the app in `src/app/layout.tsx`
- Check that `next.config.mjs` includes `transpilePackages` for BigDesign packages
- Clear `.next` cache: `rm -rf .next && npm run dev`

### OAuth errors (invalid redirect, 403, missing scope)

- Verify `APP_ORIGIN` matches the URL in your BC app's callback settings exactly (no trailing slash)
- Ensure ngrok URL is current (ngrok generates a new URL each session on the free plan)
- Check that your BC app has the required OAuth scopes

### Redis not configured (tokens lost on restart)

For local development, the Vercel app falls back to in-memory Map backed by `.credentials.json`. If tokens disappear on restart, check that `.credentials.json` is writable. The Worker requires Redis or the `BC_STORE_HASH` + `BC_ACCESS_TOKEN` env vars — it has no file fallback.
