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
import { Redis } from "@upstash/redis/cloudflare";

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

    // ─── Store info ──────────────────────────────────────────────────
    getStoreInfo: tool({
      description: "Fetch store metadata: name, domain, currency, timezone, plan, weight/dimension units, logo URL, admin email.",
      inputSchema: z.object({}),
      execute: async () =>
        u(
          await bc.storeInfo.GET("/store", {
            params: { header: { Accept: "application/json", "Content-Type": "application/json" } },
          }),
          "GET /v2/store",
        ),
    }),

    // ─── Shipping ───────────────────────────────────────────────────
    getShippingZones: tool({
      description: "List shipping zones. Each zone has a name, list of locations (countries/states), and enabled status. Use to answer 'how is my shipping configured?'",
      inputSchema: z.object({}),
      execute: async () =>
        u(
          await bc.shipping.GET("/shipping/zones", {
            params: { header: { Accept: "application/json", "Content-Type": "application/json" } },
          }),
          "GET /v2/shipping/zones",
        ),
    }),

    getShippingMethods: tool({
      description: "List shipping methods for a zone. Returns method name, type (flat rate, by weight, etc.), and settings. Use to answer 'what shipping options do customers see?'",
      inputSchema: z.object({
        zone_id: z.number().int().positive(),
      }),
      execute: async ({ zone_id }) =>
        u(
          await bc.shipping.GET("/shipping/zones/{zone_id}/methods", {
            params: {
              path: { zone_id },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
          }),
          `GET /v2/shipping/zones/${zone_id}/methods`,
        ),
    }),

    // ─── Tax ────────────────────────────────────────────────────────
    getTaxSettings: tool({
      description: "Fetch store tax settings: tax-inclusive pricing, fallback strategy, document submission. Use for 'how is my tax configured?' or 'am I collecting tax?'",
      inputSchema: z.object({}),
      execute: async () =>
        u(
          await bc.taxSettings.GET("/tax/settings", {
            params: { header: { Accept: "application/json" } },
          }),
          "GET /v3/tax/settings",
        ),
    }),

    // ─── Refunds (V3) ───────────────────────────────────────────────
    getOrderRefunds: tool({
      description: "List refunds for an order. Returns refund amounts, items refunded, payment methods, and timestamps. Use to answer 'was this order refunded?' or 'how much was refunded?'",
      inputSchema: z.object({
        order_id: z.number().int().positive(),
      }),
      execute: async ({ order_id }) =>
        u(
          await bc.ordersV3.GET("/orders/{order_id}/payment_actions/refunds", {
            params: {
              path: { order_id },
              header: { Accept: "application/json" },
            },
          }),
          `GET /v3/orders/${order_id}/payment_actions/refunds`,
        ),
    }),

    // ─── Customer addresses ─────────────────────────────────────────
    getCustomerAddresses: tool({
      description: "List addresses for customers. Filter by customer_id. Returns street, city, state, zip, country, phone. Use for 'where does this customer ship to?'",
      inputSchema: z.object({
        customer_id: z.number().int().positive().optional().describe("Filter by a specific customer"),
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
      }),
      execute: async ({ customer_id, limit, page }) => {
        const query: Record<string, unknown> = { limit, page };
        if (customer_id !== undefined) query["customer_id:in"] = customer_id;
        return u(
          await bc.customers.GET("/customers/addresses", {
            params: { query: query as never },
          }),
          "GET /v3/customers/addresses",
        );
      },
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

// ─── Write tools — TWO-TURN PATTERN [S-3] ─────────────────────────
//
// NOT inside the codemode sandbox. Each write tool has a `confirmed`
// boolean. On the first call (confirmed=false), the tool returns a
// preview without executing. On the second call after user confirmation
// (confirmed=true), the tool executes and logs to the audit table.
//
// The system prompt teaches the model: call with confirmed=false first,
// show the preview, then only call with confirmed=true after the
// merchant explicitly confirms in the chat.

function buildWriteTools(env: Env, bc: ReturnType<typeof createBcClients>, auditLog: (entry: AuditEntry) => void) {
  const u = unwrap;

  return {
    createCoupon: tool({
      description:
        "Create a new coupon code. FIRST call with confirmed=false to preview. Show the preview to the merchant. ONLY call with confirmed=true after the merchant explicitly confirms. Coupons are manual codes the shopper enters at checkout.",
      inputSchema: z.object({
        confirmed: z.boolean().default(false).describe("false = preview only, true = execute the write"),
        name: z.string(),
        code: z.string().describe("The code customers enter at checkout"),
        type: z.enum(["per_item_discount", "per_total_discount", "shipping_discount", "free_shipping", "promotion", "percentage_discount"]),
        amount: z.string().describe("Discount amount as a string"),
        min_purchase: z.string().optional(),
        expires: z.string().optional().describe("ISO 8601 expiry date"),
        enabled: z.boolean().default(true),
        max_uses: z.number().int().optional(),
        max_uses_per_customer: z.number().int().optional(),
        applies_to: z.object({ entity: z.enum(["products", "categories"]), ids: z.array(z.number().int()) }).optional(),
      }),
      execute: async (input) => {
        const { confirmed, ...args } = input;
        const body = { ...args, applies_to: args.applies_to ?? { entity: "categories" as const, ids: [0] } };

        if (!confirmed) {
          return { status: "preview", message: "This will create a coupon. Ask the merchant to confirm before calling with confirmed=true.", operation: "createCoupon", args: body };
        }

        const result = u(
          await bc.marketing.POST("/coupons", {
            params: { header: { Accept: "application/json", "Content-Type": "application/json" } },
            body: body as never,
          }),
          "POST /v2/coupons",
        );
        auditLog({ tool: "createCoupon", input: body, result, timestamp: new Date().toISOString() });
        return result;
      },
    }),

    updateProductInventory: tool({
      description:
        "Adjust inventory level. FIRST call with confirmed=false to preview, then confirmed=true after merchant confirms.",
      inputSchema: z.object({
        confirmed: z.boolean().default(false),
        product_id: z.number().int().positive(),
        inventory_level: z.number().int().min(0),
      }),
      execute: async ({ confirmed, product_id, inventory_level }) => {
        if (!confirmed) {
          return { status: "preview", message: `Will set product ${product_id} inventory to ${inventory_level}. Ask the merchant to confirm.`, operation: "updateProductInventory", args: { product_id, inventory_level } };
        }
        const result = u(
          await bc.products.PUT("/catalog/products/{product_id}", {
            params: { path: { product_id }, header: { Accept: "application/json", "Content-Type": "application/json" } },
            body: { inventory_level } as never,
          }),
          `PUT /catalog/products/${product_id} (inventory)`,
        );
        auditLog({ tool: "updateProductInventory", input: { product_id, inventory_level }, result, timestamp: new Date().toISOString() });
        return result;
      },
    }),

    setProductVisibility: tool({
      description:
        "Publish or unpublish a product. FIRST call with confirmed=false to preview, then confirmed=true after merchant confirms.",
      inputSchema: z.object({
        confirmed: z.boolean().default(false),
        product_id: z.number().int().positive(),
        is_visible: z.boolean(),
      }),
      execute: async ({ confirmed, product_id, is_visible }) => {
        if (!confirmed) {
          return { status: "preview", message: `Will ${is_visible ? "publish" : "unpublish"} product ${product_id}. Ask the merchant to confirm.`, operation: "setProductVisibility", args: { product_id, is_visible } };
        }
        const result = u(
          await bc.products.PUT("/catalog/products/{product_id}", {
            params: { path: { product_id }, header: { Accept: "application/json", "Content-Type": "application/json" } },
            body: { is_visible } as never,
          }),
          `PUT /catalog/products/${product_id} (visibility)`,
        );
        auditLog({ tool: "setProductVisibility", input: { product_id, is_visible }, result, timestamp: new Date().toISOString() });
        return result;
      },
    }),

    updateProductPrice: tool({
      description:
        "Update a product's price. FIRST call with confirmed=false to preview, then confirmed=true after merchant confirms.",
      inputSchema: z.object({
        confirmed: z.boolean().default(false),
        product_id: z.number().int().positive(),
        price: z.number().optional(),
        sale_price: z.number().optional(),
      }),
      execute: async ({ confirmed, product_id, price, sale_price }) => {
        if (!confirmed) {
          return { status: "preview", message: `Will update product ${product_id} price${price !== undefined ? ` to $${price}` : ""}${sale_price !== undefined ? `, sale price to $${sale_price}` : ""}. Ask the merchant to confirm.`, operation: "updateProductPrice", args: { product_id, price, sale_price } };
        }
        const body: Record<string, unknown> = {};
        if (price !== undefined) body.price = price;
        if (sale_price !== undefined) body.sale_price = sale_price;
        const result = u(
          await bc.products.PUT("/catalog/products/{product_id}", {
            params: { path: { product_id }, header: { Accept: "application/json", "Content-Type": "application/json" } },
            body: body as never,
          }),
          `PUT /catalog/products/${product_id} (price)`,
        );
        auditLog({ tool: "updateProductPrice", input: { product_id, ...body }, result, timestamp: new Date().toISOString() });
        return result;
      },
    }),

    deleteCoupon: tool({
      description:
        "Delete a coupon by ID. FIRST call with confirmed=false to preview, then confirmed=true after merchant confirms.",
      inputSchema: z.object({
        confirmed: z.boolean().default(false),
        coupon_id: z.number().int().positive(),
      }),
      execute: async ({ confirmed, coupon_id }) => {
        if (!confirmed) {
          return { status: "preview", message: `Will delete coupon ${coupon_id}. This cannot be undone. Ask the merchant to confirm.`, operation: "deleteCoupon", args: { coupon_id } };
        }
        const result = u(
          await bc.marketing.DELETE("/coupons/{id}", {
            params: { path: { id: coupon_id }, header: { Accept: "application/json", "Content-Type": "application/json" } },
          }),
          `DELETE /v2/coupons/${coupon_id}`,
        );
        auditLog({ tool: "deleteCoupon", input: { coupon_id }, result, timestamp: new Date().toISOString() });
        return result;
      },
    }),

    updateOrderStatus: tool({
      description:
        "Update an order's status. Common status_id values: 2=Shipped, 3=Partially Shipped, 5=Cancelled, 9=Awaiting Shipment, 10=Completed, 11=Awaiting Fulfillment. FIRST call with confirmed=false to preview, then confirmed=true after merchant confirms.",
      inputSchema: z.object({
        confirmed: z.boolean().default(false),
        order_id: z.number().int().positive(),
        status_id: z.number().int().describe("New status ID — see description for common values"),
      }),
      execute: async ({ confirmed, order_id, status_id }) => {
        const statusLabels: Record<number, string> = { 2: "Shipped", 3: "Partially Shipped", 5: "Cancelled", 9: "Awaiting Shipment", 10: "Completed", 11: "Awaiting Fulfillment" };
        const label = statusLabels[status_id] ?? `status ${status_id}`;
        if (!confirmed) {
          return { status: "preview", message: `Will change order #${order_id} to "${label}". Ask the merchant to confirm.`, operation: "updateOrderStatus", args: { order_id, status_id, label } };
        }
        const result = u(
          await bc.orders.PUT("/orders/{order_id}", {
            params: {
              path: { order_id },
              header: { Accept: "application/json", "Content-Type": "application/json" },
            },
            body: { status_id } as never,
          }),
          `PUT /v2/orders/${order_id}`,
        );
        auditLog({ tool: "updateOrderStatus", input: { order_id, status_id, label }, result, timestamp: new Date().toISOString() });
        return result;
      },
    }),

    createProduct: tool({
      description:
        "Create a new product in the catalog. Requires name, type, weight, and price at minimum. FIRST call with confirmed=false to preview, then confirmed=true after merchant confirms.",
      inputSchema: z.object({
        confirmed: z.boolean().default(false),
        name: z.string(),
        type: z.enum(["physical", "digital"]).default("physical"),
        weight: z.number().default(0).describe("Weight in store's weight unit"),
        price: z.number().describe("Base retail price"),
        sale_price: z.number().optional(),
        sku: z.string().optional(),
        description: z.string().optional(),
        categories: z.array(z.number().int()).optional().describe("Category IDs to assign"),
        inventory_level: z.number().int().optional(),
        is_visible: z.boolean().default(true),
      }),
      execute: async (input) => {
        const { confirmed, ...args } = input;
        if (!confirmed) {
          return { status: "preview", message: `Will create product "${args.name}" at $${args.price}. Ask the merchant to confirm.`, operation: "createProduct", args };
        }
        const result = u(
          await bc.products.POST("/catalog/products", {
            params: { header: { Accept: "application/json", "Content-Type": "application/json" } },
            body: args as never,
          }),
          "POST /v3/catalog/products",
        );
        auditLog({ tool: "createProduct", input: args, result, timestamp: new Date().toISOString() });
        return result;
      },
    }),
  };
}

interface AuditEntry {
  tool: string;
  input: unknown;
  result: unknown;
  timestamp: string;
}

// ─── System prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Ask BC, an AI assistant for BigCommerce merchants.

You have TWO kinds of tools:

1. **\`execute\`** — runs TypeScript you write in an isolated sandbox. Inside the sandbox you have typed \`codemode.*\` functions that proxy to real BC APIs. This is how you READ data: products, orders, customers, inventory, promotions, etc. Chain calls in ONE script with \`Promise.all\` and in-memory joins.

2. **Top-level write tools** — \`createCoupon\`, \`updateProductInventory\`, \`setProductVisibility\`, \`updateProductPrice\`, \`deleteCoupon\`, \`updateOrderStatus\`, \`createProduct\`. These mutate store state. They are NOT available inside the sandbox — you must call them directly as top-level tool calls.

## WRITES — TWO-TURN CONFIRMATION

Write tools have a \`confirmed\` parameter. You MUST call them TWICE:
1. **Preview turn:** Call with \`confirmed: false\`. The tool returns a preview without executing. Show the preview to the merchant and ask them to confirm.
2. **Execute turn:** After the merchant says "yes", "confirm", "go ahead", or similar, call the SAME tool with \`confirmed: true\` and the SAME arguments. This time it executes for real.

**Never call a write tool with \`confirmed: true\` on the first mention.** Always preview first. This is a security requirement — the merchant must explicitly confirm before the store is mutated.

**Rules for writes:**
- **Only call a write tool when the merchant explicitly asks for a change.** Phrases like "create", "update", "publish", "unpublish", "adjust inventory", "mark on sale". Never call a write tool for an informational question.
- **Always read before you write when you need a product's current state.** For example, to mark a product "out of stock", first call \`execute\` to get the product id by name, then preview the write.
- **One write per turn.** Don't chain multiple writes. Preview one, wait for confirmation, execute it, then handle the next.

## RULES

1. ALWAYS use codemode to fetch real store data. Never guess or fabricate.
2. For multi-step questions, write ONE script that chains calls — do not make multiple execute calls back-to-back. Use \`Promise.all\` for independent fetches.
3. Return a structured result via \`return\` at the end of your script. The return value will be shown to the merchant.
4. The sandbox has no outbound network access except via codemode.* — don't try fetch(), it will throw.
5. Keep scripts focused: fetch what you need, aggregate in memory, return a structured result.

## API RESPONSE SHAPES — READ THIS CAREFULLY

BigCommerce has TWO API versions (V2 and V3) with DIFFERENT response shapes. Getting this wrong is the #1 cause of script errors.

**V3 endpoints** (\`getProducts\`, \`getCategories\`, \`getBrands\`, \`getCustomers\`, \`getProductVariants\`, \`getPromotions\`, \`getChannels\`, \`getInventoryLocations\`, \`getTaxSettings\`, \`getOrderRefunds\`, \`getCustomerAddresses\`):
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

## PAGINATION — handling stores with >250 entities [P-4]

API endpoints return at most 250 items per page. For stores with more:

**V3 endpoints** — the response includes \`meta.pagination.total_pages\`. Paginate like:
\`\`\`ts
let allProducts = [];
let page = 1;
let totalPages = 1;
do {
  const resp = await codemode.getProducts({ limit: 250, page });
  allProducts = allProducts.concat(resp.data);
  totalPages = resp.meta?.pagination?.total_pages ?? 1;
  page++;
} while (page <= totalPages && page <= 5); // cap at 5 pages (1250 items)
\`\`\`

**V2 endpoints** — no pagination metadata. Page until the result is empty:
\`\`\`ts
let allOrders = [];
let page = 1;
while (true) {
  const batch = await codemode.getOrders({ limit: 250, page });
  if (!batch.length) break;
  allOrders = allOrders.concat(batch);
  if (batch.length < 250 || page >= 5) break; // cap at 5 pages
  page++;
}
\`\`\`

**Cap at 5 pages** to avoid timeouts. If the merchant needs ALL data, tell them the result is approximate and suggest narrowing the query with filters.

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
        // Credentials resolved in beforeTurn() before getTools() is called
        // by Think's inference loop. If we get here, beforeTurn hasn't run yet.
        throw new Error("Credentials not resolved — beforeTurn must run first");
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
  async beforeTurn(ctx: {
    continuation: boolean;
    body?: Record<string, unknown>;
    system: string;
  }): Promise<{ model: LanguageModel; system?: string } | void> {
    await this.ensureCredentials();

    // Inject entity context from the client's body param [F-4]
    const entityContext = ctx.body?.entityContext as
      | { type: string; id: string }
      | undefined;
    const contextAddendum = entityContext
      ? `\n\n## CURRENT CONTEXT\nThe merchant is viewing ${entityContext.type} #${entityContext.id}. Every question in this conversation is implicitly about this ${entityContext.type}. When fetching data, scope queries to this entity.`
      : "";

    if (ctx.continuation) {
      const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
      this._lastModelUsed.push("sonnet-4-6");
      return {
        model: anthropic("claude-sonnet-4-6"),
        ...(contextAddendum ? { system: ctx.system + contextAddendum } : {}),
      };
    }
    this._lastModelUsed.push("haiku-4-5");
    if (contextAddendum) {
      return { model: this.getModel(), system: ctx.system + contextAddendum };
    }
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  // Resolve per-store credentials eagerly during DO initialization.
  // getTools() is called synchronously by Think before beforeTurn(),
  // so credentials must be ready before the first turn.
  async onStart() {
    await this.ensureCredentials();
  }

  // ─── Audit log [F-7] ─────────────────────────────────────────────
  private _auditTableReady = false;

  private ensureAuditTable() {
    if (this._auditTableReady) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS write_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_hash TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this._auditTableReady = true;
  }

  logWrite(entry: AuditEntry) {
    this.ensureAuditTable();
    this.ctx.storage.sql.exec(
      `INSERT INTO write_audit (store_hash, tool_name, input_json, result_json, created_at) VALUES (?, ?, ?, ?, ?)`,
      this.name,
      entry.tool,
      JSON.stringify(entry.input),
      JSON.stringify(entry.result),
      entry.timestamp,
    );
  }

  getTools() {
    const bc = this.getBcClients();

    // Reads go inside codemode — the model can chain them in a single
    // script with Promise.all, pagination, joins, aggregation.
    const readTools = buildReadTools(this.env, bc);

    // Writes are top-level tools outside the sandbox with two-turn
    // confirmation pattern [S-3]. Audit log writes to DO SQLite [F-7].
    const writeTools = buildWriteTools(this.env, bc, (entry) => this.logWrite(entry));

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

    // Smoke test — dev-only [S-5]
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
      try {
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
      } catch (err) {
        return withCors(
          new Response(JSON.stringify({
            error: "Smoke failed",
            detail: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined,
          }, null, 2), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
          env,
        );
      }
    }

    // ─── Auth gate for agent routes [S-1] ────────────────────────────
    // Only enforce JWT on WebSocket upgrades — that's where the token
    // is passed as ?token=. HTTP GETs to /get-messages are read-only
    // (chat history for a specific DO) and don't carry the token.
    // Without the WebSocket, you can't send messages — so gating the
    // upgrade is sufficient.
    const isWebSocketUpgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
    if (url.pathname.startsWith("/agents/") && env.JWT_KEY && isWebSocketUpgrade) {
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
        const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

        // Extract room name from URL: /agents/{namespace}/{room}/...
        const pathParts = url.pathname.split("/").filter(Boolean);
        const urlRoom = pathParts[2]; // agents / ask-b-c / {room}
        const jwtStoreHash = (payload as { storeHash?: string }).storeHash;

        if (jwtStoreHash && urlRoom && jwtStoreHash !== urlRoom) {
          return withCors(
            new Response(
              JSON.stringify({
                error: "Store hash mismatch",
                detail: "Your session is for a different store than the one you're trying to access.",
              }),
              { status: 403, headers: { "content-type": "application/json" } },
            ),
            env,
          );
        }

        // Single-use enforcement: claim the jti in Redis with NX + 90s TTL
        // so a stolen 60s token can't be replayed from a second session.
        const jti = (payload as { jti?: string }).jti;
        if (jti && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
          const redis = new Redis({
            url: env.UPSTASH_REDIS_REST_URL,
            token: env.UPSTASH_REDIS_REST_TOKEN,
          });
          const claimed = await redis.set(`ask-bc:jti:${jti}`, "1", { nx: true, ex: 90 });
          if (!claimed) {
            return withCors(
              new Response(JSON.stringify({ error: "Token already used" }), {
                status: 401,
                headers: { "content-type": "application/json" },
              }),
              env,
            );
          }
        }
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
