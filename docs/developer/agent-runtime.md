# Agent Runtime — Cloudflare Worker

The Cloudflare Worker at `workers/agent-runtime/` is the execution substrate for the Ask BC agent. The browser connects to it directly via WebSocket. It runs the agentic loop using Project Think as the base class, executes read tool scripts inside Codemode sandboxes (Dynamic Workers), and enforces a two-turn confirmation pattern for all write operations.

Architecture rationale lives in [ADR-001](../architecture/decisions/001-codemode-agent-runtime.md). This document covers operational details: how to run, test, extend, and deploy the Worker.

## Directory Layout

```
workers/agent-runtime/
├── package.json          # @cloudflare/think, @cloudflare/codemode, agents, @ai-sdk/anthropic, ai, zod, openapi-fetch, @upstash/redis
├── wrangler.jsonc        # DO binding, worker_loaders, BC_API_BASE var, secret docs
├── tsconfig.json
├── .dev.vars             # Local secrets (gitignored)
└── src/
    ├── index.ts          # AskBC class, buildReadTools, buildWriteTools, system prompt, Worker fetch handler
    ├── bc/
    │   └── client.ts     # createBcClients() factory — typed openapi-fetch clients + V2 middleware
    ├── blocks.ts         # BLOCK_SCHEMAS + renderBlockCatalog() — shared block protocol source of truth
    ├── credentials.ts    # resolveStoreCredentials() — Redis + AES-256-GCM decrypt + env fallback
    └── doc-search.ts     # searchBcDocs() — BC help docs keyword search
```

## Required Secrets

Set via `.dev.vars` for local dev or `wrangler secret put` for deployed environments.

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Powers both Haiku 4.5 (default) and Sonnet 4.6 (continuation turns) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis endpoint — same instance the Vercel app writes credentials to |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash auth token |
| `CREDENTIAL_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM — must be identical to the Vercel app's key |
| `JWT_KEY` | JWT signing secret — must be identical to the Vercel app's JWT_KEY |

For dev without Redis, `BC_STORE_HASH` and `BC_ACCESS_TOKEN` can substitute, but only for a single store.

`.dev.vars` format:
```
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
CREDENTIAL_ENCRYPTION_KEY=<32-byte hex>
JWT_KEY=<same as Next.js JWT_KEY>
```

## Running Locally

```bash
cd workers/agent-runtime
npm install
npx wrangler dev
```

The Worker boots on `http://localhost:8787`. First request to an agent route cold-starts the Durable Object; subsequent requests reuse it.

Verify the Worker loaded:

```bash
curl http://localhost:8787/health
# {"ok":true,"service":"ask-bc-agent-runtime"}
```

Run a smoke test (bypasses WebSocket, tests full Codemode loop against real BC data):

```bash
curl -X POST http://localhost:8787/smoke \
  -H "content-type: application/json" \
  -d '{"message":"How many products are in my store?"}'
```

Returns:
```json
{
  "text": "You have 119 products...",
  "toolCalls": [...],
  "modelsUsed": ["haiku-4-5"],
  "timedOut": false
}
```

The smoke endpoint is blocked in production. It returns 403 when `APP_ORIGIN` does not contain `localhost`.

## Two-Model Strategy

`getModel()` returns Haiku 4.5 (`claude-haiku-4-5-20251001`) for all first-response turns.

`beforeTurn({ continuation: true })` upgrades to Sonnet 4.6 (`claude-sonnet-4-6`).

**`continuation: true` fires when:**
- A tool error occurred and the turn retries (error recovery)
- The user confirms a write and the execution turn begins
- The Durable Object restarted and the session recovers

**`continuation: true` does NOT fire when:**
- Normal first-response turns (fresh user message)
- In-turn multi-step tool calls within the same `streamText` invocation

In practice Haiku handles ~95% of turns. Sonnet activates on retries and write executions where deeper reasoning matters.

## Tool Architecture

### Read Tools (22)

Defined in `buildReadTools(env, bc)`. Registered inside `createExecuteTool()` so they become `codemode.*` functions in the TypeScript sandbox. Credentials never appear in generated scripts.

| Tool | BC API | Primary Use |
|------|--------|-------------|
| `getProducts` | V3 `/catalog/products` | List/filter products with pagination |
| `getProduct` | V3 `/catalog/products/{id}` | Single product with variants, images, custom fields |
| `getProductVariants` | V3 `/catalog/products/{id}/variants` | SKU-level inventory and pricing |
| `getCategories` | V3 `/catalog/categories` | Category tree navigation |
| `getBrands` | V3 `/catalog/brands` | Manufacturer list |
| `getOrders` | V2 `/orders` | List orders with status/customer/date filters |
| `getOrder` | V2 `/orders/{id}` | Single order detail |
| `getOrderProducts` | V2 `/orders/{id}/products` | Line items — use for product×order joins |
| `getOrderCount` | V2 `/orders/count` | Count orders without fetching — use for "how many" questions |
| `getOrderShippingAddresses` | V2 `/orders/{id}/shipping_addresses` | Multi-address shipping info |
| `getOrderRefunds` | V3 `/orders/{id}/payment_actions/refunds` | Refund records for a specific order |
| `getCustomers` | V3 `/customers` | List/filter customers by email, company, date |
| `getCustomerAddresses` | V3 `/customers/addresses` | Saved addresses for customers |
| `getInventoryLocations` | V3 `/inventory/locations` | Warehouses and inventory sites |
| `getPromotions` | V3 `/promotions` | Automatic discounts (BOGO, % off) |
| `getCoupons` | V2 `/coupons` | Manual discount codes |
| `getChannels` | V3 `/channels` | Multi-storefront/marketplace topology |
| `getStoreInfo` | V2 `/store` | Store metadata — name, domain, currency, timezone |
| `getShippingZones` | V2 `/shipping/zones` | Configured shipping zones |
| `getShippingMethods` | V2 `/shipping/zones/{id}/methods` | Methods available within a shipping zone |
| `getTaxSettings` | V3 `/tax/settings` | Store tax configuration |
| `searchDocumentation` | Internal | BC help docs keyword search |

### Write Tools (7)

Defined in `buildWriteTools(env, bc, auditLog)`. Registered as top-level tools **outside** the Codemode sandbox — the model calls them directly as tool calls, not from inside a generated script. Write tools are structurally unavailable inside Codemode.

Each write tool has a `confirmed: boolean` parameter. The two-turn pattern is enforced at the prompt level:

1. First call with `confirmed: false` — returns a `{status: "preview", ...}` object, no mutation
2. Model shows the preview to the merchant and asks for confirmation
3. After merchant confirms, model calls again with `confirmed: true` — executes and logs to audit

| Tool | BC API | What It Does |
|------|--------|-------------|
| `createCoupon` | V2 `POST /coupons` | Create a coupon code with discount rules |
| `updateProductInventory` | V3 `PUT /catalog/products/{id}` | Set inventory_level on a product |
| `setProductVisibility` | V3 `PUT /catalog/products/{id}` | Publish or unpublish a product |
| `updateProductPrice` | V3 `PUT /catalog/products/{id}` | Update price and/or sale_price |
| `deleteCoupon` | V2 `DELETE /coupons/{id}` | Delete a coupon by ID |
| `updateOrderStatus` | V2 `PUT /orders/{id}` | Set status_id on an order |
| `createProduct` | V3 `POST /catalog/products` | Create a new product listing |

All confirmed writes are logged to the Durable Object's SQLite `write_audit` table via `logWrite()`.

## Adding a New Read Tool

```typescript
// In buildReadTools(env, bc):
getCustomerGroups: tool({
  description: "Fetch customer groups. Returns group id, name, is_default, discount_rules.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(250).default(50),
    page: z.number().int().min(1).default(1),
  }),
  execute: async ({ limit, page }) =>
    unwrap(
      await bc.customers.GET("/customers/groups", {
        params: { query: { limit, page }, header: { Accept: "application/json" } },
      }),
      "GET /customers/groups",
    ),
}),
```

Write specific descriptions — the model reads them to decide what to call and how. Vague descriptions cause wrong tool selection. Keep `inputSchema` strict: use `.int()`, `.min()`, `.max()`, and `.default()` to prevent the model from passing out-of-range values.

## Security Hardening Summary

| ID | Control | Implementation |
|----|---------|---------------|
| S-1 | JWT auth on agent routes | `jwtVerify()` on WebSocket upgrade; storeHash claim validated against DO room name |
| S-2 | CORS locked to APP_ORIGIN | `corsHeaders()` returns exact origin, not `*`; applied to all responses |
| S-3 | Two-turn write confirmation | Write tools structurally absent from Codemode; `confirmed` boolean enforced at prompt + tool level |
| S-4 | Per-store credentials from Redis | `resolveStoreCredentials()` looks up `ask-bc:store:{hash}` at turn start; no hardcoded tokens |
| S-5 | Smoke endpoint blocked in production | 403 when `APP_ORIGIN` is not localhost |
| S-7 | AES-256-GCM token encryption at rest | Vercel encrypts on write; Worker decrypts on read; 256-bit key in `CREDENTIAL_ENCRYPTION_KEY` |

## Known Gotchas

### 1. AI SDK v6 + Zod v4 peer dependencies

`@cloudflare/think` requires `ai@^6` and `zod@^4`. Installing `ai@4` or `zod@3` compiles but breaks type inference. Always pin to AI SDK v6 + Zod v4 in the Worker.

### 2. Native DO RPC bypasses `onStart()`

When calling a Durable Object method via native RPC (not through `routeAgentRequest`), partyserver's lazy initialization does not run. `this.session`, `this.workspace`, and anything set in `onStart` will be undefined.

Call `this.__unsafe_ensureInitialized()` at the top of any RPC method before touching session or workspace state. The smoke endpoint's `smokeAsk()` method does this.

Real chat traffic via `routeAgentRequest` uses the standard entry path and does not need this.

### 3. `.name` requires explicit set on RPC stubs

`partyserver`'s `.name` property is only auto-set when the request routes through `routePartyKitRequest` or the WebSocket protocol. Direct RPC stubs leave `.name` undefined, which causes session initialization to throw.

Fix: call `stub.setName(storeHash)` on the DO stub before any other method. The smoke endpoint does this.

### 4. BC V2 empty body for no-results (handled)

BigCommerce V2 endpoints return HTTP 200 with an empty body when a query matches no rows, instead of `{data: []}`. `response.json()` throws on empty body.

`src/bc/client.ts` installs `v2EmptyBodyMiddleware` on V2 clients that patches empty bodies to `[]`. This is transparent to tool code. The patched response carries `x-bc-empty-body-patched: 1` for debugging.

### 5. `beforeTurn` type requires explicit annotation

TypeScript cannot infer `model: LanguageModel` from `anthropic("model-id")` due to overload signatures. Annotate explicitly:

```typescript
import { type LanguageModel } from "ai";

async beforeTurn(ctx: { continuation: boolean; body?: Record<string, unknown>; system: string }): Promise<{ model: LanguageModel; system?: string } | void> {
  // ...
}
```

## Phase History

| Phase | Status | Description |
|-------|--------|-------------|
| 0 — De-risk Project Think | Complete | Worker + Think + Codemode + Dynamic Workers proven end-to-end on real BC data |
| 1 — Typed BC SDK + full tool surface | Complete | 14 OpenAPI specs → openapi-typescript → openapi-fetch clients. 22 read tools, 7 write tools. V2 empty-body middleware. Enriched system prompt with API shape rules, status_id table, counting patterns, pagination patterns. Verified: 3-way customer × orders × line-items join in 8.3s. Tool set validated against Shopify Sidekick feature parity. |
| 2 — Generative UI | Complete | 7 React block components, block protocol (fenced `block` JSON), Next.js inline renderer, WorkerChatPanel connecting directly to Worker via WebSocket |
| 3 — Writes with approval gate | Complete | 5 write tools, two-turn confirmation pattern, audit log in DO SQLite, AES-256-GCM credential encryption, JWT auth gate on WebSocket upgrade, CORS hardening |
| 4 — Demo reel recapture | Pending | Re-record the 12-scene reel against the new stack |

## Deployment

**Production URLs:**
- Worker: `https://ask-bc-agent-runtime.biq.workers.dev`
- Vercel: `https://ask-bc-signal-x-studio-labs.vercel.app`

**Deploy the Worker:**

```bash
cd workers/agent-runtime
npx wrangler deploy
```

**Set production secrets (one-time or on rotation):**

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put CREDENTIAL_ENCRYPTION_KEY
wrangler secret put JWT_KEY
```

**After deploying**, verify:

```bash
curl https://ask-bc-agent-runtime.biq.workers.dev/health
# {"ok":true,"service":"ask-bc-agent-runtime"}
```

The smoke endpoint returns 403 in production (correct behavior). Use the full chat UI to test production.

**Wiring the Vercel app to the Worker:** Set `NEXT_PUBLIC_WORKER_HOST=https://ask-bc-agent-runtime.biq.workers.dev` in Vercel project settings. The `WorkerChatPanel` reads this to construct the WebSocket URL.

See [docs/ops/deployment.md](../ops/deployment.md) for the full deployment checklist.
