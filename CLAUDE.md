# Project: Ask BC

## Identity
AI-powered store assistant for BigCommerce merchants, embedded as a single-click marketplace app in the BigCommerce control panel.

**Type:** Hybrid monorepo — Next.js app (Vercel) + Cloudflare Worker

## Tech Stack

### Vercel side (src/)
- **Language:** TypeScript 5 / Node.js
- **Framework:** Next.js 15 (App Router)
- **UI:** React 18, BigDesign UI, styled-components v5, Tailwind CSS (tw- prefix)
- **AI Client:** @ai-sdk/anthropic, @ai-sdk/react (useAgentChat hook for Worker chat)
- **Storage:** Upstash Redis (store credentials), IndexedDB (browser-side chat persistence)
- **Auth:** BigCommerce OAuth 2.0 → JWT sessions (jose)
- **Validation:** Zod, T3 env-nextjs
- **Infrastructure:** Vercel

### Worker side (workers/agent-runtime/)
- **Runtime:** Cloudflare Worker + Durable Objects (SQLite storage class)
- **Agent base:** @cloudflare/think (Project Think) — `AskBC extends Think<Env>`
- **Sandbox:** @cloudflare/codemode — sandboxed TypeScript execution in Dynamic Workers
- **Chat protocol:** agents/react (routeAgentRequest, useAgent, useAgentChat)
- **AI:** @ai-sdk/anthropic (Haiku 4.5 default, Sonnet 4.6 on continuation turns)
- **BC clients:** openapi-fetch typed against openapi-typescript generated types from BC OpenAPI specs
- **Infrastructure:** Cloudflare Workers

### Shared
- **Credentials:** Upstash Redis — `ask-bc:store:{hash}` key, AES-256-GCM encrypted tokens
- **CI/CD:** None configured

## Documentation Standards
- Format: GitHub-Flavored Markdown
- Diagrams: Mermaid.js (embedded in Markdown)
- Structure: Diataxis framework for user docs
- Location: `docs/` directory

## Key Directories

### Vercel side
- `src/app/` — Next.js App Router pages and API routes
- `src/app/api/` — BigCommerce OAuth callbacks (auth, load, uninstall, remove-user)
- `src/app/stores/[storeHash]/` — Store-scoped pages (main chat, extensions)
- `src/components/chat/` — Chat UI (WorkerChatPanel, MessageList, MessageBubble, ChatInput, ChatMarkdown)
- `src/components/chat/blocks/` — 7 generative UI block components + registry + parser
- `src/lib/bigcommerce/` — BC integration (OAuth auth, REST API client, App Extensions GraphQL)
- `src/lib/` — Shared utilities (Redis, store credentials with AES-256-GCM, chat storage, env validation)

### Worker side
- `workers/agent-runtime/src/index.ts` — AskBC Think class, read tools, write tools, CORS, auth gate, system prompt
- `workers/agent-runtime/src/bc/client.ts` — typed BC API client factory (V2 empty-body middleware + 401/403 detection)
- `workers/agent-runtime/src/credentials.ts` — per-store credential resolution from Upstash Redis with AES-256-GCM decrypt
- `workers/agent-runtime/src/blocks.ts` — block schema catalog for system prompt (shared source of truth)
- `workers/agent-runtime/src/doc-search.ts` — BC help docs keyword search
- `workers/agent-runtime/wrangler.jsonc` — DO binding, worker_loaders, vars, secret documentation

## Exclusions
Ignore these directories when analyzing code:
- node_modules/
- .git/
- .next/
- coverage/
- workers/agent-runtime/node_modules/

## Commands

### Next.js app
- **Install:** `npm install`
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Type Check:** `npm run type-check`
- **Lint:** `npm run lint`

### Worker
- **Install:** `cd workers/agent-runtime && npm install`
- **Dev:** `cd workers/agent-runtime && npx wrangler dev`
- **Deploy:** `cd workers/agent-runtime && npx wrangler deploy`
- **Set secret:** `cd workers/agent-runtime && wrangler secret put SECRET_NAME`
- **Type Check:** `cd workers/agent-runtime && npx tsc --noEmit`

## Architecture

### Auth Flow (Vercel)
1. Merchant installs from BC Marketplace → `GET /api/auth` (OAuth code → access token → Redis, AES-256-GCM encrypted)
2. Merchant opens app → `GET /api/load` (middleware: BC JWT → internal session JWT → cookie → redirect)
3. All `/stores/[storeHash]/**` routes protected by `authorize()` helper
4. Chat page calls `getAgentToken()` → mints a short-lived JWT with `{storeHash}` claim
5. Browser connects to Worker WebSocket with `?token=<jwt>` in the URL

### Chat Flow (Worker — primary path)
1. User types message → `useAgentChat` hook → Worker WebSocket at `wss://ask-bc-agent-runtime.biq.workers.dev/agents/AskBC/{storeHash}`
2. Worker verifies JWT on upgrade, validates storeHash claim matches the DO room
3. `AskBC.beforeTurn()` resolves per-store credentials from Redis, injects entity context if present
4. Default model: Haiku 4.5. Continuation turns: Sonnet 4.6
5. Read tools execute inside Codemode sandbox — model writes TypeScript, Codemode runs it in a Dynamic Worker
6. Write tools execute outside the sandbox with two-turn confirmation (confirmed=false preview, then confirmed=true execute)
7. Agent emits `block`-fenced JSON in the response text; client parser extracts and renders React components inline
8. Audit log for writes stored in DO SQLite (`write_audit` table)
9. Chat history visible across turns via Durable Object session state

### Fallback Chat Path (Vercel — legacy)
The original `/stores/[storeHash]/api/chat` route using `streamText()` + `useChat()` still exists and still works. It uses 15 hand-written BC API wrappers and streams via SSE. This path is no longer the primary path but is kept as a fallback.

### App Extensions
- Registered via GraphQL `createAppExtension` mutation during OAuth install
- "Ask BC" panels on Orders and Products pages in BC admin
- Extension pages at `/stores/[storeHash]/extensions/orders/[id]` and `/extensions/products/[id]`
- Each passes an `entityContext: {type, id}` body param to `useAgentChat`
- Worker injects entity context as a system prompt addendum in `beforeTurn()`

### Tool Architecture

**Read tools** (22 total) — run inside the Codemode sandbox:
`getProducts`, `getProduct`, `getProductVariants`, `getCategories`, `getBrands`, `getOrders`, `getOrder`, `getOrderProducts`, `getOrderCount`, `getOrderShippingAddresses`, `getOrderRefunds`, `getCustomers`, `getCustomerAddresses`, `getInventoryLocations`, `getPromotions`, `getCoupons`, `getChannels`, `getStoreInfo`, `getShippingZones`, `getShippingMethods`, `getTaxSettings`, `searchDocumentation`

Read tools are exposed as `codemode.*` functions. The model writes a TypeScript script using them, Codemode executes it, and the result comes back as a tool output. Credentials never appear in the generated script.

**Write tools** (7 total) — top-level tools outside the sandbox:
`createCoupon`, `updateProductInventory`, `setProductVisibility`, `updateProductPrice`, `deleteCoupon`, `updateOrderStatus`, `createProduct`

Each write tool has a `confirmed: boolean` parameter. The model must call with `confirmed: false` first (returns a preview), then call again with `confirmed: true` after the merchant confirms. This is enforced at the prompt level and structurally — write tools are never registered inside the Codemode sandbox.

### Two-Model Strategy
- `getModel()` returns Haiku 4.5 (`claude-haiku-4-5-20251001`) — default for all turns
- `beforeTurn({ continuation: true })` upgrades to Sonnet 4.6 (`claude-sonnet-4-6`)
- Continuation fires on: retries after tool errors, post-approval write execution, DO restart recovery
- Continuation does NOT fire on: fresh user messages, in-turn multi-step tool calls

### Security Architecture
- **S-1:** JWT auth on Worker agent routes — storeHash claim validated against DO room on WebSocket upgrade
- **S-2:** CORS restricted to `APP_ORIGIN` — no wildcard
- **S-3:** Two-turn write confirmation — write tools structurally excluded from Codemode sandbox
- **S-4:** Per-store credentials from Upstash Redis — resolved at runtime per Durable Object
- **S-5:** `/smoke` endpoint gated in production (403 when `APP_ORIGIN` is not localhost)
- **S-7:** AES-256-GCM token encryption at rest in Redis — shared `CREDENTIAL_ENCRYPTION_KEY` between Vercel and Worker

### Conventions

**Vercel side:**
- BigDesign components + icons for all UI inside BC admin iframe
- Tailwind classes prefixed with `tw-` to avoid BigDesign conflicts
- `authorize()` for all store-scoped Vercel API routes
- Partitioned cookies with `SameSite=none` for iframe context

**Worker side:**
- `createBcClients()` returns typed clients per API area (products, orders, marketing, etc.)
- Always `unwrap()` openapi-fetch `{data, error}` tuples — never access `.data` directly
- V2 endpoints return bare arrays, not envelopes — never destructure `.data` from V2 responses
- V2 numeric fields are strings — always `parseFloat()` before math
- V2 empty body responses are patched to `[]` by `v2EmptyBodyMiddleware` in `bc/client.ts`
- `@cloudflare/think` peer deps are AI SDK v6 + Zod v4 — do not install older versions

## Development
- Run both `npm run dev` (port 3000) and `npx wrangler dev` (port 8787) simultaneously
- Visit `http://localhost:3000/dev/session/dev-store` to create a dev session bypassing OAuth
- For Worker dev, `.dev.vars` replaces `.env.local` — must contain all 5 secrets
- Redis optional for Vercel local dev (falls back to `.credentials.json`); required for Worker multi-tenant mode
- Worker `/smoke` endpoint provides single-turn testing without WebSocket client
- `/blocks-preview` route in Next.js app provides visual testing for all 7 block components
- ngrok required for testing BC OAuth flow locally

## Documentation Skills
Available commands after initialization:
- `/doc-architecture` - Generate architecture documentation
- `/doc-developer` - Generate developer onboarding guide
- `/doc-ops` - Generate DevOps and infrastructure docs
- `/doc-testing` - Generate testing strategy docs
- `/doc-functional` - Extract business logic documentation
- `/doc-strategic` - Generate tech debt audit and roadmap
- `/doc-user [feature]` - Generate user-facing documentation
- `/doc-audit` - Run documentation coverage audit
