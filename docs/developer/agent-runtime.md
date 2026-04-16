# Agent Runtime — Cloudflare Worker

A Cloudflare Worker at `workers/agent-runtime/` that runs the Codemode-based agent for Ask BC. It is the execution substrate behind the chat experience — the Next.js UI on Vercel proxies chat messages to this Worker, which runs the agentic loop, generates TypeScript code, executes it in a sandbox, and streams structured responses back.

Architectural rationale lives in [ADR-001](../architecture/decisions/001-codemode-agent-runtime.md). This document is operational: how to run, test, and extend the Worker without getting bitten by the non-obvious parts.

## Directory layout

```
workers/agent-runtime/
├── package.json          # @cloudflare/think + codemode + AI SDK v6 + Anthropic
├── wrangler.jsonc        # DO binding, worker_loaders, experimental compat flag
├── tsconfig.json
├── .dev.vars             # Local secrets (gitignored)
├── .gitignore
└── src/
    └── index.ts          # AskBC class + Worker fetch handler + smoke endpoint
```

## Required secrets

All three must be set — via `.dev.vars` for local dev or `wrangler secret put` for deployed environments.

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Powers both Haiku 4.5 (default) and Sonnet 4.6 (continuation turns) via `@ai-sdk/anthropic` |
| `BC_STORE_HASH` | The BigCommerce store hash, e.g. `cdfqf9k6zf`. Identifies the store for the Durable Object per-agent namespace. |
| `BC_ACCESS_TOKEN` | Store-level API account access token from BC admin → Settings → API → Store-level API accounts. Needs `read-only` on Products, Orders, Customers, Marketing, Info & Settings, Channel settings, Channel listings, Store Inventory. |

For local dev, `.dev.vars` lives at `workers/agent-runtime/.dev.vars` in the format:
```
ANTHROPIC_API_KEY=sk-ant-...
BC_STORE_HASH=cdfqf9k6zf
BC_ACCESS_TOKEN=...
```

For deployed environments: `cd workers/agent-runtime && wrangler secret put ANTHROPIC_API_KEY` (and repeat for the others).

## Running locally

```bash
cd workers/agent-runtime
npm install
npx wrangler dev
```

The Worker boots on `http://localhost:8787` with all bindings wired (Durable Object, Worker Loader, secrets). First request cold-starts the DO; subsequent requests reuse it.

**Verify the bindings load:**
```bash
curl http://localhost:8787/health
# {"ok":true,"service":"ask-bc-agent-runtime","store":"cdfqf9k6zf"}
```

**Run a smoke test against the Codemode loop:**
```bash
curl -X POST http://localhost:8787/smoke \
  -H "content-type: application/json" \
  -d '{"message":"How many products are in my store?"}'
```

Returns a JSON document with:
- `text` — final assistant response
- `toolCalls` — every tool event in the turn (step-start, tool-execute with generated code, outputs, errors)
- `modelsUsed` — which model(s) handled the turn (typically `["haiku-4-5"]`, `["haiku-4-5","sonnet-4-6"]` for continuations)
- `timedOut` — true if the turn exceeded the 60s smoke budget

The smoke endpoint bypasses the WebSocket chat protocol and calls `saveMessages()` + `onChatResponse` directly. It is **only for testing** — real chat traffic from the Next.js UI uses `routeAgentRequest` with WebSockets (Phase 2).

## Two-model strategy

`getModel()` returns Haiku 4.5 (`claude-haiku-4-5-20251001`). `beforeTurn(ctx)` upgrades to Sonnet 4.6 (`claude-sonnet-4-6`) when `ctx.continuation === true`.

**`continuation: true` fires for:**
- Auto-continuation after a client tool result (the write-approval flow in Phase 3)
- Chat recovery after a Durable Object restart

**`continuation: true` does NOT fire for:**
- In-turn multi-step tool calls (same `streamText` invocation, same `beforeTurn` context)
- Fresh user messages (each message is a new turn, so `continuation: false`)

This means Haiku handles 100% of normal first-response turns including retries within the same turn when a tool errors. Empirically Haiku recovers from tool errors fine — the earlier smoke tests showed it pivoting strategies on its own. Sonnet only takes over at the high-stakes moments where deeper reasoning earns its 3× cost: post-approval write execution and chat recovery.

## Adding a new BC tool

Tools live in `buildBcTools(env)` in `src/index.ts`. Each is an AI SDK `tool()` with a Zod input schema and an `execute()` that calls `bcGet` (or the V2 variant) with real credentials from `env`. The sandbox sees them as `codemode.*` RPC calls — credentials never touch the generated code.

```ts
getCustomerGroups: tool({
  description: "Fetch customer groups. Returns group id, name, is_default, discount_rules.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(250).default(50),
    page: z.number().int().min(1).default(1),
  }),
  execute: async ({ limit, page }) => {
    const params = new URLSearchParams({ limit: String(limit), page: String(page) });
    return bcGet(env, `/customer_groups?${params}`);
  },
}),
```

**Keep descriptions specific.** The sandbox's TypeScript declaration for `codemode.*` is derived from these descriptions. The model uses them to decide what to call and how — vague descriptions produce vague code.

## Known gotchas

These are the non-obvious things that cost time during Phase 0. Document them here, not in the code, because the fixes are idiomatic to the Cloudflare stack, not to Ask BC.

### 1. AI SDK v6 + Zod v4 peer dependencies

`@cloudflare/think` declares `"ai": "^6.0.0"` and `"zod": "^4.0.0"` as peer dependencies. If you install `ai@4` or `zod@3` out of habit, the compile succeeds but type inference breaks in non-obvious places. Always pin to AI SDK v6 + Zod v4 in this worker.

### 2. Native DO RPC bypasses `onStart()`

When you call a method on a Durable Object stub via native RPC (`env.ASK_BC.get(id).someMethod()`), partyserver's lazy initialization — which normally fires on `fetch` / `alarm` / `webSocket` entry — does **not** run. That means `this.session`, `this.workspace`, and anything else Think's `onStart` sets up will be undefined.

The escape hatch is `this.__unsafe_ensureInitialized()`, documented in partyserver specifically for "frameworks that receive calls via native DO RPC, bypassing the standard entry points." Call it at the top of any custom RPC method before touching `this.session` or `this.workspace`.

This is why the smoke endpoint's `smokeAsk()` method starts with:
```ts
await (this as unknown as { __unsafe_ensureInitialized(): Promise<void> })
  .__unsafe_ensureInitialized();
```

Real chat traffic via `routeAgentRequest` goes through the standard entry path, so this hack is not needed there.

### 3. `.name` must be set explicitly when bypassing `routePartyKitRequest`

Related to #2 but distinct: partyserver's `.name` property (used for per-agent identity) is only auto-set when the request routes through `routePartyKitRequest` or the WebSocket protocol. Direct RPC calls leave `.name` undefined, and any code path that reads it (Session initialization, workspace naming) throws:

```
Error: Attempting to read .name on AskBC before it was set.
```

Fix: call `stub.setName(storeHash)` on the DO stub before any other method. Track at [workerd#2240](https://github.com/cloudflare/workerd/issues/2240).

### 4. BC V2 endpoints return an empty body for "no matching rows" (FIXED)

BigCommerce's V2 endpoints return HTTP 200 with a completely empty response body when a query matches no rows — instead of `{"data":[]}` like V3. Default `response.json()` throws `Unexpected end of JSON input`.

**Fix:** `src/bc/client.ts` installs an `openapi-fetch` middleware on V2 clients (`orders`, `marketing`) that clones the response, checks if the body is empty, and substitutes `"[]"` when it is. The substituted response carries an `x-bc-empty-body-patched: 1` header for debugging. V3 endpoints don't need this — they return `{data: []}` natively.

```ts
const v2EmptyBodyMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) return;
    const cloned = response.clone();
    const text = await cloned.text();
    if (text.length > 0) return;
    return new Response("[]", { status: response.status, headers: { "content-type": "application/json", "x-bc-empty-body-patched": "1" } });
  },
};
```

Phase 0 surfaced this during the "top-selling products this month" test (2 errors recovered mid-turn). Phase 1 fix verified during the "5 most recent completed orders" test — zero errors, single execute.

### 5. `beforeTurn` type inference requires explicit `LanguageModel` type

TypeScript cannot infer `model: LanguageModel` from `anthropic("model-id")` cleanly due to the overload signatures on `@ai-sdk/anthropic`. Annotate the return type of `beforeTurn` explicitly:

```ts
import { type LanguageModel } from "ai";

beforeTurn(ctx: { continuation: boolean }): { model: LanguageModel } | void {
  // ...
}
```

Not doing this produces a wall of "AnthropicProvider is not assignable to LanguageModel" errors that are actually a type-narrowing issue, not a real incompatibility.

## Phase plan

| Phase | Status | Description |
|---|---|---|
| **0 — De-risk Project Think** | ✅ Complete | Worker + Think + Codemode + Dynamic Workers proven end-to-end on real BC data |
| **1 — Typed BC SDK + full tool surface** | ✅ Complete | 11 OpenAPI specs → openapi-typescript → openapi-fetch clients. 15 typed tools covering products, product variants, categories, brands, orders (V2), order line items, order shipping, customers, inventory locations, promotions (V3), coupons (V2), channels. V2 empty-body middleware patches no-results responses. Enriched system prompt with V2 vs V3 shape rules, status_id table, and canonical example scripts. Verified end-to-end: 3-way customer × orders × line-items join in 8.3s, single execute, zero errors. |
| **2 — Generative UI** | Pending | Component registry (KPICard, SparklineChart, DataTable, ProductCard, OrderTimeline), structured block streaming, Next.js inline renderer |
| **3 — Writes with approval gate** | Pending | Re-scope BC API account to modify, AST walk to classify read vs write, approval card in chat, audit log in Durable Object |
| **4 — Demo reel recapture** | Pending | Re-record the 12-scene reel against the new stack |

## Phase 1 — Tool surface reference

All tools are defined in `src/index.ts` inside `buildBcTools(env)` and resolve into `codemode.*` functions for the sandbox. Tools are typed against OpenAPI-generated path types in `src/bc/*.d.ts`, with inputs validated by Zod. The host holds credentials; generated code never sees them.

| Tool | API | Primary use |
|---|---|---|
| `getProducts` | V3 `/catalog/products` | List + filter products (name/sku/category/visibility/sort) |
| `getProduct` | V3 `/catalog/products/{id}` | Single product with optional includes (variants, images, custom_fields) |
| `getProductVariants` | V3 `/catalog/products/{id}/variants` | SKU-level inventory and pricing |
| `getCategories` | V3 `/catalog/categories` | Category tree navigation |
| `getBrands` | V3 `/catalog/brands` | Manufacturer list |
| `getOrders` | V2 `/orders` | List orders with status/customer/date filters |
| `getOrder` | V2 `/orders/{id}` | Single order detail |
| `getOrderProducts` | V2 `/orders/{id}/products` | Line items — **use this for product×order joins** |
| `getOrderShippingAddresses` | V2 `/orders/{id}/shipping_addresses` | Multi-address order shipping |
| `getCustomers` | V3 `/customers` | List customers, filter by email/company/date |
| `getInventoryLocations` | V3 `/inventory/locations` | Warehouses, retail stores, inventory sites |
| `getPromotions` | V3 `/promotions` | Automatic discounts (BOGO, % off, rules) |
| `getCoupons` | V2 `/coupons` | Manual discount codes |
| `getChannels` | V3 `/channels` | Multi-storefront / marketplace topology |

Pending for later phases: write operations (Phase 3), doc search (port from Vercel side), tax settings, shipping zones, price lists, abandoned carts.

## Deployment

Deferred until Phase 2 at the earliest. Currently the Worker runs only in `wrangler dev`. When we deploy:

1. `wrangler deploy` from `workers/agent-runtime/`
2. Set secrets via `wrangler secret put`
3. Note the `*.workers.dev` URL — wire it into the Next.js `/api/chat` proxy as `ASK_BC_WORKER_URL`
4. Update Vercel project env vars on the Next.js side
5. Add a `/health` check to CI or an uptime monitor

The BC store hash is per-deployment (one Worker per merchant currently), so production will need per-store configuration. How we scope this — one Worker with a DO namespace per store, or one Worker instance per store — is a Phase 3 decision tied to the write approval flow and audit log.
