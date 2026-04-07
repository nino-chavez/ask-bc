# Ask BC

AI-powered store assistant for BigCommerce merchants.

## Features

- **Chat with your store data** — ask about orders, products, customers, promotions
- **15 BC API tools** — Claude queries your real store data via REST API
- **App Extension panels** — contextual "Ask BC" on Orders and Products pages
- **Markdown responses** — tables, code, lists, bold
- **Follow-up suggestions** — clickable chips after each response
- **Chat history** — persists across sessions via IndexedDB
- **BC help docs** — answers "how do I..." questions with links
- **Context-aware** — knows what order/product you're viewing

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| AI | Vercel AI SDK v6 + Claude Haiku 4.5 |
| UI | BigDesign UI + Tailwind CSS |
| Storage | Upstash Redis (credentials) + IndexedDB (chat history) |
| Auth | BigCommerce OAuth 2.0 |
| Deployment | Vercel |

## Quick Start

```bash
git clone https://github.com/nino-chavez/ask-bc.git
cd ask-bc
npm install
cp .env.local.example .env.local
# Fill in your credentials
npm run dev
# Visit http://localhost:3000/dev/session/dev-store
```

See the [Developer Guide](docs/developer/README.md) for full setup instructions, environment variables, and troubleshooting.

## Deploy to Vercel

1. Import the repo to [Vercel](https://vercel.com/new)
2. Add the [Vercel KV](https://vercel.com/integrations/upstash) integration (provides `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically)
3. Set the remaining environment variables in Vercel project settings:
   - `BIGCOMMERCE_CLIENT_ID`
   - `BIGCOMMERCE_CLIENT_SECRET`
   - `APP_ORIGIN` (your Vercel deployment URL, e.g., `https://ask-bc.vercel.app`)
   - `JWT_KEY` (generate with `openssl rand -hex 32`)
   - `ANTHROPIC_API_KEY`
4. Update your BigCommerce app's callback URLs to use the Vercel domain:
   - Auth Callback: `https://ask-bc.vercel.app/api/auth`
   - Load Callback: `https://ask-bc.vercel.app/api/load`
   - Uninstall Callback: `https://ask-bc.vercel.app/api/uninstall`
   - Remove User Callback: `https://ask-bc.vercel.app/api/remove-user`

## Architecture

Ask BC runs as a Next.js app on Vercel. The chat API route orchestrates Claude with 15 BigCommerce REST API tools — Claude decides which APIs to call based on the merchant's question, executes them server-side, and streams a formatted response back to the browser. Authentication uses BigCommerce OAuth for app installation and internal JWTs for session management within the BC admin iframe. App Extensions register contextual panels on Orders and Products pages so merchants can ask about specific entities.

For detailed architecture documentation, diagrams, and decision records, see [docs/architecture/README.md](docs/architecture/README.md).

## License

MIT
