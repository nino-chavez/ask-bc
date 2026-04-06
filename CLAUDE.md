# App AI — BigCommerce Store Assistant

AI-powered chatbot for BigCommerce merchants, embedded in the control panel as a single-click marketplace app.

## Stack

- **Frontend:** Next.js 15, React 18, TypeScript, BigDesign UI, styled-components v5, Tailwind (tw- prefix)
- **Backend:** Next.js API routes
- **AI:** Vercel AI SDK (`ai` v6 + `@ai-sdk/anthropic`) with tool use
- **Storage:** Upstash Redis (store credentials only)
- **Auth:** BigCommerce OAuth 2.0 → JWT sessions
- **Deploy:** Vercel

## Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run type-check   # TypeScript check
npm run lint         # ESLint
```

## Architecture

### Auth Flow
1. Merchant installs from BC Marketplace → `/api/auth` (OAuth code exchange)
2. Merchant opens app in BC admin → `/api/load` (middleware: JWT verification → session cookie)
3. All `/stores/[storeHash]/**` routes protected by `authorize()` helper

### Chat Flow
1. User types message → `useChat` hook sends to `POST /stores/[storeHash]/api/chat`
2. Server calls `streamText()` with Claude + BC API tools + `maxSteps: 10`
3. AI SDK handles the tool loop automatically (call tools → feed results → repeat)
4. Response streams back via `toUIMessageStreamResponse()`
5. Chat state is in-memory (browser session via `useChat` hook, not persisted)

### Key Directories
- `src/lib/ai/` — System prompt, tool definitions (Zod + AI SDK `tool()`), model config
- `src/lib/bigcommerce/` — OAuth auth, API client (V2 + V3)
- `src/lib/` — Redis client, store credential helpers
- `src/components/chat/` — Chat UI components
- `src/app/stores/[storeHash]/` — Store-scoped pages and API routes

### BC API Tools
The agent has access to: `get_store_info`, `get_products`, `get_orders`, `get_customers`, `get_promotions`, `get_coupons`, `get_categories`, `get_channels`, `get_order_products`

### Conventions
- BigDesign components for UI inside BC admin iframe
- Tailwind classes prefixed with `tw-` to avoid BigDesign conflicts
- `authorize()` for all store-scoped API routes
- `createBcClient()` for BC API calls (`.get()` for V3, `.getV2()` for V2)
- Partitioned cookies with `SameSite=none` for iframe context
- Vercel AI SDK patterns: `streamText()`, `useChat()`, `tool()` with Zod schemas

## Development

Visit `http://localhost:3000/dev/session/dev-store` to create a dev session bypassing OAuth.
Redis is optional for local dev — store credentials won't persist across restarts without it.
