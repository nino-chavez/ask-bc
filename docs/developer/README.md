# Developer Guide

> **New:** The agent runtime is migrating from the Next.js tool loop to a dedicated Cloudflare Worker running Project Think + Codemode. The migration is active — this guide still reflects the Vercel-side development workflow (OAuth, iframe UI, App Extensions), which is unchanged. For the new Worker:
>
> - Architecture decision: [ADR-001](../architecture/decisions/001-codemode-agent-runtime.md)
> - Operational reference: [Agent Runtime guide](./agent-runtime.md)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/nino-chavez/ask-bc.git
cd ask-bc

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.local.example .env.local
# Fill in your credentials (see Environment Variables below)

# 4. Start the dev server
npm run dev

# 5. Open the dev session (no BigCommerce account needed)
open http://localhost:3000/dev/session/dev-store

# 6. (Optional) For full BigCommerce OAuth testing with ngrok:
ngrok http 3000
# Update APP_ORIGIN in .env.local with the ngrok URL
# Update your BC app's callback URLs to use the ngrok URL
```

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| npm | 10+ | Package manager (ships with Node 20) |
| ngrok | Latest | Tunnel for BigCommerce OAuth testing (optional for basic dev) |

## Environment Variables

Create `.env.local` from the example file. All variables are documented below:

| Variable | Required | Description |
|----------|----------|-------------|
| `BIGCOMMERCE_CLIENT_ID` | Yes | OAuth client ID from the [BC Developer Portal](https://devtools.bigcommerce.com/my/apps) |
| `BIGCOMMERCE_CLIENT_SECRET` | Yes | OAuth client secret from the BC Developer Portal |
| `APP_ORIGIN` | Yes | Public URL of the app. Use your ngrok URL for local BC testing, or Vercel URL in production. Defaults to `http://localhost:3000` |
| `JWT_KEY` | Yes | Secret for signing session JWTs. Minimum 32 characters. Generate with: `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Yes | API key from the [Anthropic Console](https://console.anthropic.com/) |
| `KV_REST_API_URL` | No | Upstash Redis REST URL. On Vercel, auto-populated by the Vercel KV integration. Optional for local dev (falls back to `.credentials.json` file) |
| `KV_REST_API_TOKEN` | No | Upstash Redis REST token. Same as above |

## Dev Workflow Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server on port 3000 with hot reload |
| `npm run type-check` | Run TypeScript compiler check (`tsc --noEmit`) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |

## Testing with a BigCommerce Store

### Option 1: Dev Session (no BC account needed)

Visit `http://localhost:3000/dev/session/dev-store` to get a mock session. This creates a session cookie for a dev store hash so you can interact with the chat UI. Note: BC API tool calls will fail without real store credentials, but you can test the UI, AI responses, and non-API features.

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

## How to Add New BigCommerce API Tools

All AI tools are defined in `src/lib/ai/tools.ts`. To add a new tool:

1. Import `tool` from `ai` and define a Zod schema for the parameters
2. Add a new entry to the `tools` object following the existing pattern:

```typescript
get_something: tool({
  description: 'Describe what this tool does — Claude reads this to decide when to call it',
  parameters: z.object({
    limit: z.number().optional().describe('Max results to return'),
    // Add parameters as needed
  }),
  execute: async ({ limit }) => {
    const response = await client.get(`/v3/catalog/something?limit=${limit ?? 10}`);
    return response;
  },
}),
```

3. The `client` object (from `src/lib/bigcommerce/client.ts`) provides `.get()` for V3 endpoints and `.getV2()` for V2 endpoints
4. Return the API response directly — Claude will interpret the data and format it for the merchant
5. For error handling, throw an error or return an error object — the AI SDK marks it as a tool error and Claude explains the failure

## Project Structure

```
src/
  app/
    api/auth/           OAuth install callback
    api/uninstall/      Uninstall callback
    api/remove-user/    Remove user callback
    dev/session/        Dev session route (local testing)
    stores/[storeHash]/
      api/chat/         Streaming chat endpoint
      extensions/       App Extension panel pages (orders, products)
      page.tsx          Main chat page
  components/
    chat/               Chat UI components (ChatPage, ChatPanel, MessageBubble, etc.)
    BigCommerceSDK.tsx  BC iframe SDK integration
    StyledComponentsRegistry.tsx  SSR for styled-components
    ThemeProvider.tsx    BigDesign theme wrapper
  lib/
    ai/                 AI tools, system prompt, model config, doc search
    bigcommerce/        BC OAuth, REST client, App Extensions
    chat-storage.ts     IndexedDB persistence for chat history
    env.ts              Environment variable validation (Zod + t3-env)
    redis.ts            Upstash Redis client (lazy singleton)
    store-credentials.ts  Credential storage (Redis + file fallback)
  middleware.ts         JWT session handling for BC iframe loads
```

## Troubleshooting

### styled-components errors (hydration mismatch or missing styles)

BigDesign uses styled-components v5. The SSR registry at `src/components/StyledComponentsRegistry.tsx` collects styles during server render. If you see hydration mismatches:
- Ensure `StyledComponentsRegistry` wraps the app in `src/app/layout.tsx`
- Check that `next.config.mjs` includes `transpilePackages` for BigDesign packages
- Clear `.next` cache: `rm -rf .next && npm run dev`

### OAuth errors (invalid redirect, 403, missing scope)

- Verify `APP_ORIGIN` matches the URL in your BC app's callback settings exactly (no trailing slash)
- Ensure ngrok URL is current (ngrok generates a new URL each session on the free plan)
- Check that your BC app has the required OAuth scopes (store info, orders, products, customers, content, etc.)
- Look at the server console for detailed error messages

### Redis not configured (tokens lost on restart)

For local development, Redis is optional. The app falls back to an in-memory Map backed by `.credentials.json`. If tokens disappear on restart:
- Check that `.credentials.json` exists and is writable
- For production or persistent local dev, configure `KV_REST_API_URL` and `KV_REST_API_TOKEN` with Upstash Redis credentials
