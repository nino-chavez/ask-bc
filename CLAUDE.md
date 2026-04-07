# Project: Ask BC

## Identity
AI-powered store assistant for BigCommerce merchants, embedded as a single-click marketplace app in the BigCommerce control panel.

**Type:** Monolith

## Tech Stack
- **Language:** TypeScript 5 / Node.js
- **Framework:** Next.js 15 (App Router)
- **UI:** React 18, BigDesign UI, styled-components v5, Tailwind CSS (tw- prefix)
- **AI:** Vercel AI SDK v6 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`), Claude Haiku 4.5
- **Storage:** Upstash Redis (store credentials), IndexedDB (browser-side chat persistence)
- **Auth:** BigCommerce OAuth 2.0 → JWT sessions (jose)
- **Validation:** Zod, T3 env-nextjs
- **Infrastructure:** Vercel
- **CI/CD:** None configured

## Documentation Standards
- Format: GitHub-Flavored Markdown
- Diagrams: Mermaid.js (embedded in Markdown)
- Structure: Diataxis framework for user docs
- Location: `docs/` directory

## Key Directories
- `src/app/` — Next.js App Router pages and API routes
- `src/app/api/` — BigCommerce OAuth callbacks (auth, uninstall, remove-user)
- `src/app/stores/[storeHash]/` — Store-scoped pages (main chat, extensions, chat API)
- `src/components/chat/` — Chat UI (ChatPage, ChatPanel, MessageList, MessageBubble, ChatInput, ChatMarkdown)
- `src/components/` — BigDesign infrastructure (ThemeProvider, StyledComponentsRegistry, BigCommerceSDK)
- `src/lib/ai/` — AI layer (system prompt, tools, models, doc search)
- `src/lib/bigcommerce/` — BC integration (OAuth auth, REST API client, App Extensions GraphQL)
- `src/lib/` — Shared utilities (Redis, store credentials, chat storage, env validation)

## Exclusions
Ignore these directories when analyzing code:
- node_modules/
- .git/
- .next/
- coverage/

## Commands
- **Install:** `npm install`
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Type Check:** `npm run type-check`
- **Lint:** `npm run lint`

## Architecture

### Auth Flow
1. Merchant installs from BC Marketplace → `GET /api/auth` (OAuth code → access token → Redis)
2. Merchant opens app → `GET /api/load` (middleware: BC JWT → session cookie → redirect)
3. All `/stores/[storeHash]/**` routes protected by `authorize()` helper

### Chat Flow
1. User types message → `useChat` hook → `POST /stores/[storeHash]/api/chat`
2. Server calls `streamText()` with Claude Haiku + 15 BC API tools + `stopWhen: stepCountIs(10)`
3. AI SDK handles tool loop automatically (call tools → feed results → repeat)
4. Response streams back via `toUIMessageStreamResponse()`
5. Messages auto-saved to IndexedDB for persistence across sessions

### App Extensions
- Registered via GraphQL `createAppExtension` mutation during OAuth install
- "Ask BC" panels on Orders and Products pages in BC admin
- Extension pages at `/stores/[storeHash]/extensions/orders/[id]` and `/extensions/products/[id]`
- Context-aware system prompt includes entity ID

### BC API Tools
`get_store_info`, `get_products`, `get_orders`, `get_customers`, `get_promotions`, `get_coupons`, `get_categories`, `get_channels`, `get_order_products`, `get_product_variants`, `get_order_shipping_addresses`, `get_shipping_zones`, `get_tax_settings`, `get_inventory`, `search_documentation`

### Conventions
- BigDesign components + icons for all UI inside BC admin iframe
- Tailwind classes prefixed with `tw-` to avoid BigDesign conflicts
- `authorize()` for all store-scoped API routes
- `createBcClient()` for BC API calls (`.get()` for V3, `.getV2()` for V2)
- Partitioned cookies with `SameSite=none` for iframe context
- Vercel AI SDK patterns: `streamText()`, `useChat()`, `tool()` with Zod schemas
- `buildSystemPrompt(context?)` for dynamic context-aware prompts

## Development
- Visit `http://localhost:3000/dev/session/dev-store` to create a dev session bypassing OAuth
- Redis optional for local dev (falls back to `.credentials.json` file)
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
