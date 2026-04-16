import { Think } from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { routeAgentRequest } from "agents";
import { createAnthropic } from "@ai-sdk/anthropic";
import { tool, type LanguageModel } from "ai";
import { z } from "zod";
import { createBcClients, type BcClients } from "./bc/client.js";
import { renderBlockCatalog } from "./blocks.js";
import { searchBcDocs } from "./doc-search.js";
import { resolveStoreCredentials, type StoreCredentials } from "./credentials.js";
import { Session } from "agents/experimental/memory/session";
import { jwtVerify } from "jose";

interface Env {
  AskBC: DurableObjectNamespace;
  LOADER: WorkerLoader;
  ANTHROPIC_API_KEY: string;
  BC_API_BASE: string;
  APP_ORIGIN: string;
  // Per-store credentials — resolved from Redis or env fallback [S-4]
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  CREDENTIAL_ENCRYPTION_KEY?: string;
  // Auth — same JWT_KEY the Next.js app uses to sign session tokens [S-1]
  JWT_KEY?: string;
  // Dev fallback — single-store env vars
  BC_STORE_HASH?: string;
  BC_ACCESS_TOKEN?: string;
}

// ─── BC tool surface ───────────────────────────────────────────────
// Typed tools backed by openapi-fetch clients generated from the
// BigCommerce OpenAPI specs.
//
// Architecture: READ TOOLS go inside the codemode sandbox so the model
// can chain them in a single generated script with Promise.all, joins,
// and in-memory aggregation. WRITE TOOLS are TOP-LEVEL tools the model
// calls directly, each with `needsApproval: true` so the AI SDK's
// approval protocol pauses execution until the user clicks Execute in
// the chat UI. The sandbox never sees write tools, so the model
// literally cannot write from inside codemode — all mutations flow
// through the explicit approval gate.

// Tiny helper: unwrap openapi-fetch's {data, error} tuple into either
// the data or a thrown error with the spec path for debuggability.
function unwrap<T>(r: { data?: T; error?: unknown }, ctx: string): T {
  if (r.error) throw new Error(`BC ${ctx} failed: ${JSON.stringify(r.error)}`);
  if (r.data === undefined) throw new Error(`BC ${ctx} returned no data`);
  return r.data;
}

function buildReadTools(env: Env, bc: ReturnType<typeof createBcClients>) {
  const u = unwrap;

  return {
    // ─── Catalog: Products ──────────────────────────────────────────
    getProducts: tool({
      description:
        "List products. Supports filter by name/sku, sort by inventory_level/name/date_modified, pagination. Returns {data: Product[], meta: {pagination}}.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
        sort: z
          .enum(["name", "sku", "date_modified", "date_last_imported", "inventory_level", "is_visible"])
          .optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        include_fields: z.string().optional().describe("Comma-separated fields to include (e.g. 'name,price,inventory_level')"),
        name_like: z.string().optional().describe("Case-insensitive name substring match"),
        sku: z.string().optional(),
        is_visible: z.boolean().optional(),
        categories: z.array(z.number().int()).optional().describe("Filter by category ids"),
      }),
      execute: async ({ limit, page, sort, direction, include_fields, name_like, sku, is_visible, categories }) => {
        const query: Record<string, unknown> = { limit, page };
        if (sort) query.sort = sort;
        if (direction) query.direction = direction;
        if (include_fields) query.include_fields = include_fields;
        if (name_like) query["name:like"] = name_like;
        if (sku) query.sku = sku;
        if (is_visible !== undefined) query.is_visible = is_visible;
        if (categories?.length) query["categories:in"] = categories.join(",");
        return u(
          await bc.products.GET("/catalog/products", {
            params: { query: query as never, header: { Accept: "application/json" } },
          }),
          "GET /catalog/products",
        );
      },
    }),

    getProduct: tool({
      description: "Fetch a single product by id with full details including variants, images, custom fields.",
      inputSchema: z.object({
        product_id: z.number().int().positive(),
        include: z
          .array(z.enum(["variants", "images", "custom_fields", "bulk_pricing_rules", "primary_image", "modifiers", "options", "videos"]))
          .optional(),
      }),
      execute: async ({ product_id, include }) =>
        u(
          await bc.products.GET("/catalog/products/{product_id}", {
            params: {
              path: { product_id },
              query: include?.length ? ({ include: include.join(",") } as never) : undefined,
              header: { Accept: "application/json" },
            },
          }),
          `GET /catalog/products/${product_id}`,
        ),
    }),

    getProductVariants: tool({
      description: "List variants for a product. Returns sku, price, inventory_level, option_values per variant.",
      inputSchema: z.object({
        product_id: z.number().int().positive(),
        limit: z.number().int().min(1).max(250).default(50),
      }),
      execute: async ({ product_id, limit }) =>
        u(
          await bc.variants.GET("/catalog/products/{product_id}/variants", {
            params: {
              path: { product_id },
              query: { limit },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
          }),
          `GET /catalog/products/${product_id}/variants`,
        ),
    }),

    // ─── Catalog: Categories & Brands ───────────────────────────────
    getCategories: tool({
      description: "List product categories. Categories form a tree — parent_id=0 is a root category.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
        parent_id: z.number().int().optional(),
      }),
      execute: async ({ limit, page, parent_id }) => {
        const query: Record<string, unknown> = { limit, page };
        if (parent_id !== undefined) query.parent_id = parent_id;
        return u(
          await bc.categories.GET("/catalog/categories", {
            params: { query: query as never, header: { Accept: "application/json" } },
          }),
          "GET /catalog/categories",
        );
      },
    }),

    getBrands: tool({
      description: "List brands (manufacturers).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
      }),
      execute: async ({ limit, page }) =>
        u(
          await bc.brands.GET("/catalog/brands", {
            params: { query: { limit, page }, header: { Accept: "application/json" } },
          }),
          "GET /catalog/brands",
        ),
    }),

    // ─── Orders (V2 — the canonical orders API) ─────────────────────
    getOrders: tool({
      description:
        "List orders. Use status_id to filter (5=Completed, 11=Awaiting Fulfillment, 7=Awaiting Payment, 10=Disputed). Use min_date_created/max_date_created for time windows. Returns orders with total_inc_tax, customer_id, date_created, status.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
        status_id: z.number().int().optional(),
        customer_id: z.number().int().optional(),
        min_date_created: z.string().optional().describe("RFC 2822 or ISO 8601"),
        max_date_created: z.string().optional(),
        sort: z.enum(["id:asc", "id:desc", "date_created:asc", "date_created:desc", "total_inc_tax:asc", "total_inc_tax:desc"]).optional(),
      }),
      execute: async ({ limit, page, status_id, customer_id, min_date_created, max_date_created, sort }) => {
        const query: Record<string, unknown> = { limit, page };
        if (status_id !== undefined) query.status_id = status_id;
        if (customer_id !== undefined) query.customer_id = customer_id;
        if (min_date_created) query.min_date_created = min_date_created;
        if (max_date_created) query.max_date_created = max_date_created;
        if (sort) query.sort = sort;
        return u(
          await bc.orders.GET("/orders", {
            params: {
              query: query as never,
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
          }),
          "GET /v2/orders",
        );
      },
    }),

    getOrder: tool({
      description: "Fetch a single order by id with full details.",
      inputSchema: z.object({ order_id: z.number().int().positive() }),
      execute: async ({ order_id }) =>
        u(
          await bc.orders.GET("/orders/{order_id}", {
            params: {
              path: { order_id },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
          }),
          `GET /v2/orders/${order_id}`,
        ),
    }),

    getOrderProducts: tool({
      description: "Line items for an order — product_id, name, sku, quantity, price_ex_tax, base_total. Use this to join orders back to the product catalog.",
      inputSchema: z.object({
        order_id: z.number().int().positive(),
        limit: z.number().int().min(1).max(250).default(50),
      }),
      execute: async ({ order_id, limit }) =>
        u(
          await bc.orders.GET("/orders/{order_id}/products", {
            params: {
              path: { order_id },
              query: { limit },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
          }),
          `GET /v2/orders/${order_id}/products`,
        ),
    }),

    getOrderCount: tool({
      description:
        "Count orders matching filters WITHOUT fetching them. Returns {count: number} plus per-status breakdowns. Use this for 'how many orders' questions instead of fetching and counting.",
      inputSchema: z.object({
        min_date_created: z.string().optional(),
        max_date_created: z.string().optional(),
        status_id: z.number().int().optional(),
      }),
      execute: async ({ min_date_created, max_date_created, status_id }) => {
        const query: Record<string, unknown> = {};
        if (min_date_created) query.min_date_created = min_date_created;
        if (max_date_created) query.max_date_created = max_date_created;
        if (status_id !== undefined) query.status_id = status_id;
        return u(
          await bc.orders.GET("/orders/count", {
            params: {
              query: query as never,
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
          }),
          "GET /v2/orders/count",
        );
      },
    }),

    getOrderShippingAddresses: tool({
      description: "Shipping addresses for an order (supports multi-address orders).",
      inputSchema: z.object({ order_id: z.number().int().positive() }),
      execute: async ({ order_id }) =>
        u(
          await bc.orders.GET("/orders/{order_id}/shipping_addresses", {
            params: { path: { order_id }, header: { Accept: "application/json" } },
          }),
          `GET /v2/orders/${order_id}/shipping_addresses`,
        ),
    }),

    // ─── Customers ──────────────────────────────────────────────────
    getCustomers: tool({
      description:
        "List customers. Supports filter by email, company, date_created window. Returns id, email, first_name, last_name, phone, date_created.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
        email: z.string().optional().describe("Exact match on email"),
        company: z.string().optional(),
        date_created_min: z.string().optional().describe("ISO 8601 lower bound"),
        date_created_max: z.string().optional(),
      }),
      execute: async ({ limit, page, email, company, date_created_min, date_created_max }) => {
        const query: Record<string, unknown> = { limit, page };
        if (email) query["email:in"] = email;
        if (company) query["company:in"] = company;
        if (date_created_min) query["date_created:min"] = date_created_min;
        if (date_created_max) query["date_created:max"] = date_created_max;
        return u(
          await bc.customers.GET("/customers", {
            params: { query: query as never },
          }),
          "GET /customers",
        );
      },
    }),

    // ─── Inventory ──────────────────────────────────────────────────
    getInventoryLocations: tool({
      description: "List inventory locations (warehouses, retail stores). Returns location_id, code, type, managed_by_external_source.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
      }),
      execute: async ({ limit, page }) =>
        u(
          await bc.locations.GET("/inventory/locations", {
            params: { query: { limit, page }, header: { Accept: "application/json" } },
          }),
          "GET /inventory/locations",
        ),
    }),

    // ─── Promotions (V3) ────────────────────────────────────────────
    getPromotions: tool({
      description: "List promotions (automatic discounts like BOGO, percentage off). Returns id, name, status, rules, redemption_count.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
        status: z.enum(["ENABLED", "DISABLED"]).optional(),
      }),
      execute: async ({ limit, page, status }) => {
        const query: Record<string, unknown> = { limit, page };
        if (status) query.status = status;
        return u(
          await bc.promotions.GET("/promotions", {
            params: { query: query as never, header: { Accept: "application/json" } },
          }),
          "GET /promotions",
        );
      },
    }),

    // ─── Marketing V2 — Coupons ─────────────────────────────────────
    getCoupons: tool({
      description: "List coupon codes (manual discount codes, not automatic promotions). Returns code, type, amount, min_purchase, expires, enabled.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
        code: z.string().optional().describe("Exact match on coupon code"),
      }),
      execute: async ({ limit, page, code }) => {
        const query: Record<string, unknown> = { limit, page };
        if (code) query.code = code;
        return u(
          await bc.marketing.GET("/coupons", {
            params: { query: query as never, header: { Accept: "application/json" } },
          }),
          "GET /v2/coupons",
        );
      },
    }),

    // ─── Channels ───────────────────────────────────────────────────
    getChannels: tool({
      description:
        "List sales channels (storefronts, marketplaces, point of sale). Returns id, name, type, platform, status. Use this to understand the store's multi-channel topology.",
      inputSchema: z.object({
        available: z.boolean().optional().describe("Only return active channels"),
      }),
      execute: async ({ available }) =>
        u(
          await bc.channels.GET("/channels", {
            params: {
              query: available !== undefined ? { available } : undefined,
              header: { Accept: "application/json" },
            },
          }),
          "GET /channels",
        ),
    }),

    // ─── Documentation search ───────────────────────────────────────
    searchDocumentation: tool({
      description:
        "Search BigCommerce help docs for how-to questions. Returns matching articles with titles, URLs, and relevance scores. Use when the merchant asks 'how do I...' or needs setup/configuration guidance rather than store data.",
      inputSchema: z.object({
        query: z.string().describe("The merchant's question or keywords to search for"),
      }),
      execute: async ({ query }) => searchBcDocs(query),
    }),
  };
}

// ─── Write tools — TOP-LEVEL, execute on call ─────────────────────
//
// NOT inside the codemode sandbox. The model calls them directly.
// Gated by system prompt rules (only write when merchant explicitly
// asks). Pre-execution approval via needsApproval is not yet functional
// in the AI SDK + Think stack — see ADR-001 and security audit.
// TODO: implement two-turn write pattern (S-3) for production.

function buildWriteTools(env: Env, bc: ReturnType<typeof createBcClients>) {
  const u = unwrap;

  return {
    createCoupon: tool({
      description:
        "Create a new coupon code in the BigCommerce store. The merchant MUST explicitly ask for a coupon creation — do not create coupons proactively. Coupons are manual codes (e.g. 'SUMMER25') the shopper enters at checkout, distinct from automatic promotions. By default the coupon applies to the whole store; pass applies_to to restrict to specific products or categories.",
      inputSchema: z.object({
        name: z.string().describe("Internal name for the coupon"),
        code: z.string().describe("The code customers enter at checkout (e.g. 'SUMMER25')"),
        type: z.enum([
          "per_item_discount",
          "per_total_discount",
          "shipping_discount",
          "free_shipping",
          "promotion",
          "percentage_discount",
        ]),
        amount: z.string().describe("Discount amount as a string (e.g. '25' for 25% or $25)"),
        min_purchase: z.string().optional().describe("Minimum cart subtotal to apply"),
        expires: z.string().optional().describe("ISO 8601 expiry date"),
        enabled: z.boolean().default(true),
        max_uses: z.number().int().optional(),
        max_uses_per_customer: z.number().int().optional(),
        applies_to: z
          .object({
            entity: z.enum(["products", "categories"]),
            ids: z.array(z.number().int()),
          })
          .optional()
          .describe("Restrict coupon to specific products or categories. Omit for store-wide."),
      }),
      // Write tools execute immediately. The system prompt is the gate —
      // the model only calls writes when the merchant explicitly asks.
      // A pre-execution approval gate via needsApproval is not yet
      // functional in the AI SDK + Think stack (see ADR-001 notes).
      // needsApproval: true,  // TODO: re-enable when SDK supports it
      execute: async (input) => {
        // BC V2 requires applies_to. Default to "whole store" via
        // categories: [0] when the caller omits it.
        const body = {
          ...input,
          applies_to: input.applies_to ?? { entity: "categories" as const, ids: [0] },
        };
        console.log("[createCoupon] body:", JSON.stringify(body));
        const result = await bc.marketing.POST("/coupons", {
          params: { header: { Accept: "application/json", "Content-Type": "application/json" } },
          body: body as never,
        });
        console.log("[createCoupon] result data:", JSON.stringify(result.data));
        console.log("[createCoupon] result error:", JSON.stringify(result.error));
        return u(result, "POST /v2/coupons");
      },
    }),

    updateProductInventory: tool({
      description:
        "Adjust the inventory level for a single product. Use for restocks, corrections, or recounts. This sets the absolute inventory — to ADD units, read the current level first and pass current + delta.",
      inputSchema: z.object({
        product_id: z.number().int().positive(),
        inventory_level: z.number().int().min(0).describe("New absolute inventory level"),
      }),
      // Write tools execute immediately. The system prompt is the gate —
      // the model only calls writes when the merchant explicitly asks.
      // A pre-execution approval gate via needsApproval is not yet
      // functional in the AI SDK + Think stack (see ADR-001 notes).
      // needsApproval: true,  // TODO: re-enable when SDK supports it
      execute: async ({ product_id, inventory_level }) =>
        u(
          await bc.products.PUT("/catalog/products/{product_id}", {
            params: {
              path: { product_id },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
            body: { inventory_level } as never,
          }),
          `PUT /catalog/products/${product_id} (inventory)`,
        ),
    }),

    setProductVisibility: tool({
      description:
        "Publish or unpublish a product on the storefront by toggling is_visible. Use for seasonal removes, out-of-stock hiding, or soft-deletes. The product is preserved in the catalog either way.",
      inputSchema: z.object({
        product_id: z.number().int().positive(),
        is_visible: z.boolean(),
      }),
      // Write tools execute immediately. The system prompt is the gate —
      // the model only calls writes when the merchant explicitly asks.
      // A pre-execution approval gate via needsApproval is not yet
      // functional in the AI SDK + Think stack (see ADR-001 notes).
      // needsApproval: true,  // TODO: re-enable when SDK supports it
      execute: async ({ product_id, is_visible }) =>
        u(
          await bc.products.PUT("/catalog/products/{product_id}", {
            params: {
              path: { product_id },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
            body: { is_visible } as never,
          }),
          `PUT /catalog/products/${product_id} (visibility)`,
        ),
    }),

    updateProductPrice: tool({
      description:
        "Update a product's base price and/or sale_price. Use for markdowns, promotional pricing, or cost-driven increases. Both fields are optional — pass only what changes.",
      inputSchema: z.object({
        product_id: z.number().int().positive(),
        price: z.number().optional().describe("Base retail price"),
        sale_price: z.number().optional().describe("Sale/promotional price. Set to 0 to clear."),
      }),
      // Write tools execute immediately. The system prompt is the gate —
      // the model only calls writes when the merchant explicitly asks.
      // A pre-execution approval gate via needsApproval is not yet
      // functional in the AI SDK + Think stack (see ADR-001 notes).
      // needsApproval: true,  // TODO: re-enable when SDK supports it
      execute: async ({ product_id, price, sale_price }) => {
        const body: Record<string, unknown> = {};
        if (price !== undefined) body.price = price;
        if (sale_price !== undefined) body.sale_price = sale_price;
        return u(
          await bc.products.PUT("/catalog/products/{product_id}", {
            params: {
              path: { product_id },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
            body: body as never,
          }),
          `PUT /catalog/products/${product_id} (price)`,
        );
      },
    }),
  };
}

// ─── System prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Ask BC, an AI assistant for BigCommerce merchants.

You have TWO kinds of tools:

1. **\`execute\`** — runs TypeScript you write in an isolated sandbox. Inside the sandbox you have typed \`codemode.*\` functions that proxy to real BC APIs. This is how you READ data: products, orders, customers, inventory, promotions, etc. Chain calls in ONE script with \`Promise.all\` and in-memory joins.

2. **Top-level write tools** — \`createCoupon\`, \`updateProductInventory\`, \`setProductVisibility\`, \`updateProductPrice\`. These mutate store state. They are NOT available inside the sandbox — you must call them directly as top-level tool calls.

## WRITES REQUIRE APPROVAL

Every write tool has \`needsApproval: true\`. When you call one, the AI SDK pauses the turn and surfaces an approval card to the merchant. The merchant clicks Execute or Cancel; only on Execute does the write run. This is architectural, not advisory — you cannot bypass it.

**Rules for writes:**
- **Only call a write tool when the merchant explicitly asks for a change.** Phrases like "create", "update", "publish", "unpublish", "adjust inventory", "mark on sale", "set the price". Never call a write tool for an informational/analytical question.
- **Always read before you write when you need a product's current state.** For example, to mark a product "out of stock", first call \`execute\` to get the product id by name, then call \`setProductVisibility({product_id, is_visible: false})\`.
- **Be explicit about what will change.** Before calling a write tool, emit a short sentence describing the change in plain English. The approval card will show the raw arguments — your sentence helps the merchant understand them quickly.
- **One write per turn.** Don't chain multiple writes in a single response. If the merchant asks for multiple changes, make one write call, let them approve, then the continuation turn will handle the next.

## RULES

1. ALWAYS use codemode to fetch real store data. Never guess or fabricate.
2. For multi-step questions, write ONE script that chains calls — do not make multiple execute calls back-to-back. Use \`Promise.all\` for independent fetches.
3. Return a structured result via \`return\` at the end of your script. The return value will be shown to the merchant.
4. The sandbox has no outbound network access except via codemode.* — don't try fetch(), it will throw.
5. Keep scripts focused: fetch what you need, aggregate in memory, return a structured result.

## API RESPONSE SHAPES — READ THIS CAREFULLY

BigCommerce has TWO API versions (V2 and V3) with DIFFERENT response shapes. Getting this wrong is the #1 cause of script errors.

**V3 endpoints** (\`getProducts\`, \`getCategories\`, \`getBrands\`, \`getCustomers\`, \`getProductVariants\`, \`getPromotions\`, \`getChannels\`, \`getInventoryLocations\`):
- Return an **envelope**: \`{ data: T[], meta: { pagination: {...} } }\`
- Destructure like: \`const { data: products } = await codemode.getProducts(...)\`
- Numeric fields are **numbers** (\`price\`, \`inventory_level\`, etc.)

**V2 endpoints** (\`getOrders\`, \`getOrder\`, \`getOrderProducts\`, \`getOrderShippingAddresses\`, \`getCoupons\`):
- Return a **bare array** or object — NO envelope. Do NOT destructure \`data\` from V2 responses.
- Use like: \`const orders = await codemode.getOrders(...)\`
- **Numeric fields are STRINGS** — \`total_inc_tax\`, \`subtotal_inc_tax\`, \`total_ex_tax\` all come back as strings like \`"1952.19"\`. Always parseFloat before doing math or .toFixed.
- Guest checkouts have \`customer_id: 0\` — filter these out when analyzing customer-order relationships.
- Empty results return an empty body that the client patches to \`[]\` — so \`orders.length === 0\` is the correct empty check.

## COUNTING — don't fetch everything just to count

**For V3 endpoints** (products, customers, categories, etc.) — call with \`limit: 1\` and read the count from \`meta.pagination.total\`:
\`\`\`ts
const { meta } = await codemode.getProducts({ limit: 1 });
const totalProducts = meta.pagination.total;  // correct total count
\`\`\`

**For V2 orders** — call the dedicated count endpoint (NOT \`getOrders({limit:1})\`, which returns 1 order, not a count):
\`\`\`ts
const { count } = await codemode.getOrderCount();  // all orders
const { count: pending } = await codemode.getOrderCount({ status_id: 11 });  // filtered
\`\`\`

**Never** do \`(await codemode.getOrders({limit: 1})).length\` to count orders — that returns 1 regardless of how many orders exist.

## SORT FIELDS — strict enums

Sort parameters are strict enums per endpoint. Only use the values listed in each tool's description. If you're not sure, omit sort entirely and handle ordering in memory after the fetch. Common mistakes:
- \`getProducts\` does NOT accept \`total_sold\` as a sort — that field doesn't exist in the V3 products API
- \`getOrders\` uses colon-separated sort values like \`"date_created:desc"\`, not dot notation

## ORDER STATUS IDS (V2)

Common values for \`getOrders({ status_id })\`:
- 0 = Incomplete, 1 = Pending, 2 = Shipped, 3 = Partially Shipped
- 4 = Refunded, 5 = Cancelled, 6 = Declined, 7 = Awaiting Payment
- 8 = Awaiting Pickup, 9 = Awaiting Shipment, 10 = Completed
- 11 = Awaiting Fulfillment, 12 = Manual Verification Required, 13 = Disputed, 14 = Partially Refunded

Note: status_id=5 is **Cancelled**, not Completed. For "completed orders" use status_id=10.

## EXAMPLES

**"Top products by inventory"**:
\`\`\`ts
const { data: products } = await codemode.getProducts({ limit: 100, sort: "inventory_level", direction: "desc" });
return products.slice(0, 10).map(p => ({ name: p.name, inventory: p.inventory_level, price: p.price }));
\`\`\`

**"5 most recent orders with customer info"** (note: V2 bare array, string totals):
\`\`\`ts
const orders = await codemode.getOrders({ limit: 5, sort: "date_created:desc" });
const customerIds = [...new Set(orders.map(o => o.customer_id).filter(id => id > 0))];
const customerPromises = customerIds.map(id => codemode.getCustomers({ email: undefined })); // or fetch all + filter
return orders.map(o => ({
  id: o.id,
  total: parseFloat(o.total_inc_tax).toFixed(2),  // parseFloat first!
  customer_id: o.customer_id,
  date: o.date_created,
  is_guest: o.customer_id === 0,
}));
\`\`\`

**"Customer order frequency breakdown"** (join V3 customers with V2 orders):
\`\`\`ts
const [{ data: customers }, orders] = await Promise.all([
  codemode.getCustomers({ limit: 250 }),
  codemode.getOrders({ limit: 250 }),
]);
const countByCustomer = {};
for (const o of orders) {
  if (o.customer_id === 0) continue;  // skip guest checkouts
  countByCustomer[o.customer_id] = (countByCustomer[o.customer_id] || 0) + 1;
}
// ... aggregate as needed
\`\`\`

${renderBlockCatalog()}

Be concise. Merchants want answers, not explanations of your process. Prefer blocks over markdown tables — they render as real UI components in the merchant's chat.`;

// ─── The Agent ─────────────────────────────────────────────────────

export class AskBC extends Think<Env> {
  // Per-store credentials resolved from Redis or env fallback [S-4/F-1]
  private _credentials: StoreCredentials | null = null;
  // Cached BC API clients — created once after credentials resolve [P-5]
  private _bcClients: BcClients | null = null;

  private async ensureCredentials(): Promise<StoreCredentials> {
    if (!this._credentials) {
      this._credentials = await resolveStoreCredentials(this.name, this.env);
    }
    return this._credentials;
  }

  private getBcClients(): BcClients {
    if (!this._bcClients) {
      if (!this._credentials) {
        throw new Error("Credentials not resolved yet — call ensureCredentials() first");
      }
      this._bcClients = createBcClients({
        BC_API_BASE: this.env.BC_API_BASE,
        BC_STORE_HASH: this._credentials.storeHash,
        BC_ACCESS_TOKEN: this._credentials.accessToken,
      });
    }
    return this._bcClients;
  }

  // Smoke test state
  _lastSmokeResult: { text: string; toolCalls: unknown[] } | null = null;
  _lastSmokeResolver: (() => void) | null = null;
  _lastModelUsed: string[] = [];

  /**
   * Default model: Haiku 4.5 — ~2.6× faster and ~3× cheaper than Sonnet 4.6,
   * handles 95% of real merchant questions on the first try. See beforeTurn()
   * for the auto-upgrade to Sonnet on continuation turns.
   */
  getModel() {
    const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
    return anthropic("claude-haiku-4-5-20251001");
  }

  /**
   * Two-model strategy: Haiku by default, Sonnet 4.6 on continuation turns.
   * A "continuation" is anything after the first step in a turn — most
   * importantly, retries after a tool error. That's exactly where Sonnet's
   * deeper reasoning and error-recovery instincts earn their extra cost.
   */
  async beforeTurn(ctx: { continuation: boolean }): Promise<{ model: LanguageModel } | void> {
    // Ensure credentials are resolved before the turn runs any tools
    await this.ensureCredentials();

    if (ctx.continuation) {
      const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
      this._lastModelUsed.push("sonnet-4-6");
      return { model: anthropic("claude-sonnet-4-6") };
    }
    this._lastModelUsed.push("haiku-4-5");
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  // Enable Anthropic prompt caching — the system prompt (~3KB with block
  // catalog + API shape rules) is cached across turns within the same
  // session, reducing input token costs on follow-up messages. [P-3]
  configureSession(session: Session) {
    return session.withCachedPrompt();
  }

  getTools() {
    const bc = this.getBcClients();

    // Reads go inside codemode — the model can chain them in a single
    // script with Promise.all, pagination, joins, aggregation.
    const readTools = buildReadTools(this.env, bc);

    // Writes are top-level tools outside the sandbox. The model calls
    // them directly; the sandbox can't access them.
    const writeTools = buildWriteTools(this.env, bc);

    return {
      execute: createExecuteTool({
        tools: readTools,
        loader: this.env.LOADER,
        timeout: 30_000,
      }),
      ...writeTools,
    };
  }

  // Capture final assistant text when saveMessages() finishes a turn.
  onChatResponse(result: {
    message: { parts?: Array<{ type: string; text?: string }> };
    status: string;
    error?: string;
  }) {
    const textParts =
      result.message.parts?.filter((p) => p.type === "text").map((p) => p.text ?? "") ?? [];
    this._lastSmokeResult = {
      text: result.status === "error" ? `ERROR: ${result.error}` : textParts.join(""),
      toolCalls: result.message.parts?.filter((p) => p.type !== "text") ?? [],
    };
    this._lastSmokeResolver?.();
    this._lastSmokeResolver = null;
  }

  onChatError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    this._lastSmokeResult = { text: `ERROR: ${msg}`, toolCalls: [] };
    this._lastSmokeResolver?.();
    this._lastSmokeResolver = null;
    return error;
  }

  /**
   * Phase 0 smoke-test helper. Clears history, injects a user message, waits
   * for the turn to complete via onChatResponse, returns the final text.
   */
  async smokeAsk(message: string, timeoutMs = 60_000): Promise<{
    text: string;
    toolCalls: unknown[];
    modelsUsed: string[];
    timedOut: boolean;
  }> {
    // Native DO RPC bypasses the standard entry paths (fetch/alarm/ws)
    // where partyserver lazy-runs onStart(), so session / workspace are
    // still undefined. This escape hatch exists for exactly this case.
    await (this as unknown as { __unsafe_ensureInitialized(): Promise<void> })
      .__unsafe_ensureInitialized();

    this.clearMessages();
    this._lastSmokeResult = null;
    this._lastModelUsed = [];

    const done = new Promise<void>((resolve) => {
      this._lastSmokeResolver = resolve;
    });

    await this.saveMessages([
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: message }],
      } as never,
    ]);

    let timedOut = false;
    await Promise.race([
      done,
      new Promise<void>((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs),
      ),
    ]);

    const captured = this._lastSmokeResult as
      | { text: string; toolCalls: unknown[] }
      | null;
    return {
      text: captured?.text ?? "",
      toolCalls: captured?.toolCalls ?? [],
      modelsUsed: [...this._lastModelUsed],
      timedOut,
    };
  }
}

// ─── Worker entry ──────────────────────────────────────────────────

// ─── CORS ──────────────────────────────────────────────────────────
// Restricted to APP_ORIGIN — no wildcard. The browser connection to
// the Worker is cross-origin (Vercel → Cloudflare), so CORS is
// required, but only the exact app origin is allowed.

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.APP_ORIGIN || "http://localhost:3000",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Partykit-Namespace, X-Partykit-Room",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight — restricted to APP_ORIGIN [S-2]
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Health check — no store hash leak [M-1]
    if (url.pathname === "/health") {
      return withCors(
        new Response(
          JSON.stringify({ ok: true, service: "ask-bc-agent-runtime" }),
          { headers: { "content-type": "application/json" } },
        ),
        env,
      );
    }

    // Smoke test — dev-only, gated [S-5]
    if (url.pathname === "/smoke" && request.method === "POST") {
      if (env.APP_ORIGIN && !env.APP_ORIGIN.includes("localhost")) {
        return withCors(
          new Response(JSON.stringify({ error: "smoke endpoint disabled in production" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
          env,
        );
      }

      const body = (await request.json()) as { message?: string };
      if (!body.message) {
        return new Response(JSON.stringify({ error: "message required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const storeHash = env.BC_STORE_HASH ?? "dev-store";
      const id = env.AskBC.idFromName(storeHash);
      const stub = env.AskBC.get(id) as unknown as AskBC & {
        setName(name: string): Promise<void>;
      };
      await stub.setName(storeHash);
      const result = await stub.smokeAsk(body.message);

      return withCors(
        new Response(JSON.stringify(result, null, 2), {
          headers: { "content-type": "application/json" },
        }),
        env,
      );
    }

    // ─── Auth gate for agent routes [S-1] ────────────────────────────
    // If JWT_KEY is configured, verify the session token before routing
    // to the agent. The token comes from a ?token= query param (easiest
    // for WebSocket upgrade, which can't send custom headers in browsers).
    // In dev without JWT_KEY, skip auth (allows direct WS connections).
    if (url.pathname.startsWith("/agents/") && env.JWT_KEY) {
      const token = url.searchParams.get("token");
      if (!token) {
        return withCors(
          new Response(JSON.stringify({ error: "Missing auth token" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
          env,
        );
      }
      try {
        const secret = new TextEncoder().encode(env.JWT_KEY);
        await jwtVerify(token, secret, { algorithms: ["HS256"] });
      } catch {
        return withCors(
          new Response(JSON.stringify({ error: "Invalid or expired token" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
          env,
        );
      }
    }

    // Delegate to the agents framework (handles WS upgrade + chat protocol).
    const response = await routeAgentRequest(request, env);
    if (response) {
      if (response.status === 101) return response;
      return withCors(response, env);
    }

    return withCors(new Response("Not found", { status: 404 }), env);
  },
};
