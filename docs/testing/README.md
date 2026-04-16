# Testing Strategy

> Last updated: 2026-04-15

Ask BC has no automated test suite. Testing is manual and divided across three layers: Worker smoke tests, block component visual tests, and end-to-end BC API verification.

---

## Worker Smoke Testing

The `/smoke` endpoint on the Worker accepts a single message and runs it through the full agent loop — credential resolution, Codemode execution, BC API calls — and returns the result as JSON. No WebSocket client or browser needed.

**Availability:** Local dev only. Returns 403 in production (enforced when `APP_ORIGIN` does not contain `localhost`).

### Basic smoke test

```bash
curl -X POST http://localhost:8787/smoke \
  -H "content-type: application/json" \
  -d '{"message":"How many products are in my store?"}'
```

Expected response shape:

```json
{
  "text": "You have 119 products in your store...",
  "toolCalls": [
    { "type": "tool-call", "toolName": "execute", ... },
    { "type": "tool-result", ... }
  ],
  "modelsUsed": ["haiku-4-5"],
  "timedOut": false
}
```

**What to verify:**
- `timedOut: false` — turn completed within 60 seconds
- `modelsUsed` — should be `["haiku-4-5"]` for a clean first turn; `["haiku-4-5", "sonnet-4-6"]` on a retry
- `text` — non-empty, plausible answer (a real number for "how many" questions)
- `toolCalls` — contains at least one `tool-call` event with `toolName: "execute"`, followed by a `tool-result`

### Testing data reads

| Prompt | What it exercises |
|--------|-------------------|
| `"How many products are in my store?"` | V3 count via `meta.pagination.total` |
| `"Show me the 5 most recent orders"` | V2 orders, bare array, string totals |
| `"Which products are low on stock?"` | V3 products with `sort: inventory_level, direction: asc` |
| `"Who are my most recent customers?"` | V3 customers with date filter |
| `"What promotions do I have active?"` | V3 promotions with status filter |
| `"List my coupon codes"` | V2 coupons, V2 empty-body patch |
| `"Tell me about order 136"` | V2 single order + order products join |

### Testing the two-model strategy

Craft a question that is likely to cause a tool error on first attempt (unusual sort field, ambiguous filter). Verify `modelsUsed` becomes `["haiku-4-5", "sonnet-4-6"]` on retry.

### Testing the write preview pattern

Write tools are NOT accessible via the `/smoke` endpoint — `smokeAsk()` goes through the real chat loop which uses `getTools()` including write tools, but you'd need to craft a message that triggers a write. Easier to test via the full chat UI.

Alternatively, hit the Worker WebSocket directly from a WebSocket client (e.g., `wscat`) to test the full write flow manually:

```bash
# Install wscat globally
npm install -g wscat

# Get a JWT (from your Vercel app's /api/agent-token endpoint)
TOKEN=<jwt>

wscat -c "ws://localhost:8787/agents/AskBC/your-store-hash?token=$TOKEN"
# Then type a message in the interactive prompt
```

---

## Block Component Visual Testing

The `/blocks-preview` route in the Next.js app renders all 7 block component types with representative example props from `BLOCK_SCHEMAS` in `workers/agent-runtime/src/blocks.ts`.

```
http://localhost:3000/blocks-preview
```

**What to verify:**
- All 7 components render without errors: `KPICard`, `DataTable`, `ProductCard`, `OrderTimeline`, `InventoryBar`, `SparklineChart`, `ErrorCard`
- Trend indicators on `KPICard` render correctly for `up`, `down`, and absent states
- `DataTable` column alignment (right-aligned price/number columns)
- `InventoryBar` threshold coloring: red below `threshold_low`, yellow below `threshold_ok`, green otherwise
- `SparklineChart` renders a visible line with `x` labels
- `OrderTimeline` correctly marks completed vs. pending events

When adding a new block component:
1. Add the schema to `BLOCK_SCHEMAS` in `workers/agent-runtime/src/blocks.ts`
2. Implement the React component in `src/components/chat/blocks/`
3. Add the component to the registry in `src/components/chat/blocks/index.tsx`
4. Add a visual test case to `/blocks-preview`
5. Verify the component renders correctly in `/blocks-preview`
6. Run a smoke test where the model is likely to use the new block (e.g., after adding a `SparklineChart`, ask "show me daily orders over the last 7 days")

---

## End-to-End BC API Verification

### Manual chat testing against a real store

Load the chat interface via the dev session (or real BC OAuth flow) and verify these scenarios end-to-end through the full browser WebSocket → Worker → Codemode → BC API path:

**Read operations:**

| Scenario | What to check |
|----------|---------------|
| "Show me my top 10 products by inventory" | `DataTable` or `InventoryBar` block renders, data matches BC admin |
| "Tell me about my most recent order" | `OrderTimeline` block renders with correct status and events |
| "How many customers signed up this month?" | `KPICard` block with a plausible number |
| "What coupon codes do I have?" | `DataTable` with code, type, amount columns |
| "How do I add a new storefront?" | `searchDocumentation` used, BC help links returned |

**Write operations** (requires a test store — do not test against production):

| Scenario | What to check |
|----------|---------------|
| "Create a 10% off coupon called TEST10" | Preview card shown first; confirm with "yes"; verify coupon appears in BC admin; check audit log in DO SQLite |
| "Set product 123 inventory to 50" | Preview shown with product_id and new level; confirm; verify in BC admin |
| "Unpublish product 456" | Preview shown; confirm; product marked not visible in BC admin |
| "Delete coupon TEST10" | Preview warns this cannot be undone; confirm; coupon gone from BC admin |

**App Extension context:**

Load the Orders App Extension panel on a specific order. Verify:
- The system prompt includes context: `The merchant is viewing order #123`
- Questions like "What's in this order?" answer about the specific order without requiring the user to specify the ID

**Cross-device persistence:** Chat history is IndexedDB (browser-only) — verify that clearing the browser or switching devices shows no history. Within the same browser, verify messages persist across page reloads.

---

## Verification After Deployment

After deploying the Worker, run these checks:

1. Health endpoint returns 200:
   ```bash
   curl https://ask-bc-agent-runtime.biq.workers.dev/health
   ```

2. Smoke endpoint returns 403 in production (correct — it should be blocked):
   ```bash
   curl -X POST https://ask-bc-agent-runtime.biq.workers.dev/smoke \
     -H "content-type: application/json" \
     -d '{"message":"test"}'
   # Expected: {"error":"smoke endpoint disabled in production"}
   ```

3. Load the BC admin app and complete one full chat turn. Verify a block component renders.

---

## Known Testing Gaps

- No automated unit tests for tool functions
- No automated integration tests for the Codemode execution path
- No contract tests for BC API response shapes (only validated against real API responses during development)
- No load testing — Worker and Durable Object limits under concurrent store connections are unknown
- Block parser edge cases (malformed JSON inside a block fence, unknown block type) are untested automatically

These are acceptable for the current scale. As merchant count grows, the Codemode execution path and concurrent DO handling are the highest-risk areas to instrument first.
