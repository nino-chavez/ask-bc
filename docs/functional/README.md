# Functional Specification

> Last updated: 2026-04-15

This document describes what Ask BC does from a functional perspective: the tool surface, generative UI components, model strategy, and write operation patterns. For how it works architecturally, see [docs/architecture/README.md](../architecture/README.md).

---

## Overview

Ask BC is an AI agent embedded in the BigCommerce admin control panel. Merchants type natural language questions and requests. The agent reads store data from BigCommerce REST APIs, renders answers as structured UI components inline in the chat, and can make a limited set of store mutations with explicit merchant confirmation.

---

## Tool Surface

The agent has two categories of tools: read tools and write tools. They differ fundamentally in how they execute and what safety controls apply.

### Read Tools (22)

Read tools execute inside a Codemode sandbox — the model writes a TypeScript script using `codemode.*` proxy functions, and the Worker executes it in an isolated Dynamic Worker. The model can chain multiple reads in a single script using `Promise.all`, join across APIs in memory, and return aggregated results. BC credentials are injected by the host and never appear in generated scripts.

**Product Catalog**

| Tool | BC API | Key Inputs | Returns |
|------|--------|-----------|---------|
| `getProducts` | V3 `/catalog/products` | `limit`, `page`, `sort`, `direction`, `name_like`, `sku`, `is_visible`, `categories` | `{data: Product[], meta: {pagination}}` |
| `getProduct` | V3 `/catalog/products/{id}` | `product_id`, `include` (variants, images, custom_fields, etc.) | Full product with optional includes |
| `getProductVariants` | V3 `/catalog/products/{id}/variants` | `product_id`, `limit` | Array of variants with sku, price, inventory_level, option_values |
| `getCategories` | V3 `/catalog/categories` | `limit`, `page`, `parent_id` | Category tree nodes; `parent_id: 0` = root |
| `getBrands` | V3 `/catalog/brands` | `limit`, `page` | Brand list |

**Orders**

| Tool | BC API | Key Inputs | Returns |
|------|--------|-----------|---------|
| `getOrders` | V2 `/orders` | `status_id`, `customer_id`, `min_date_created`, `max_date_created`, `sort` | Bare array of orders (V2 format — numeric fields are strings) |
| `getOrder` | V2 `/orders/{id}` | `order_id` | Single order detail |
| `getOrderProducts` | V2 `/orders/{id}/products` | `order_id`, `limit` | Line items — product_id, name, sku, quantity, price_ex_tax |
| `getOrderCount` | V2 `/orders/count` | `status_id`, date range | `{count: number}` plus per-status breakdown — use this for count questions |
| `getOrderShippingAddresses` | V2 `/orders/{id}/shipping_addresses` | `order_id` | Shipping address(es) including multi-address orders |
| `getOrderRefunds` | V3 `/orders/{id}/payment_actions/refunds` | `order_id` | Refund records — amount, reason, created_at |

Order status_id reference:

| ID | Status |
|----|--------|
| 0 | Incomplete |
| 1 | Pending |
| 2 | Shipped |
| 3 | Partially Shipped |
| 4 | Refunded |
| 5 | Cancelled |
| 6 | Declined |
| 7 | Awaiting Payment |
| 8 | Awaiting Pickup |
| 9 | Awaiting Shipment |
| 10 | Completed |
| 11 | Awaiting Fulfillment |
| 12 | Manual Verification Required |
| 13 | Disputed |
| 14 | Partially Refunded |

**Customers, Inventory, Marketing**

| Tool | BC API | Key Inputs | Returns |
|------|--------|-----------|---------|
| `getCustomers` | V3 `/customers` | `email`, `company`, `date_created_min`, `date_created_max` | `{data: Customer[]}` |
| `getCustomerAddresses` | V3 `/customers/addresses` | `customer_id`, `limit`, `page` | Saved shipping/billing addresses per customer |
| `getInventoryLocations` | V3 `/inventory/locations` | `limit`, `page` | Warehouses, retail stores — id, code, type |
| `getPromotions` | V3 `/promotions` | `status` (ENABLED/DISABLED) | Automatic discounts with rules and redemption counts |
| `getCoupons` | V2 `/coupons` | `code` (exact match) | Manual discount codes — code, type, amount, expires |
| `getChannels` | V3 `/channels` | `available` | Storefronts, marketplaces, POS channels |

**Store Configuration**

| Tool | BC API | Key Inputs | Returns |
|------|--------|-----------|---------|
| `getStoreInfo` | V2 `/store` | — | Store name, domain, default currency, timezone, plan |
| `getShippingZones` | V2 `/shipping/zones` | — | All configured shipping zones with id, name, type |
| `getShippingMethods` | V2 `/shipping/zones/{id}/methods` | `zone_id` | Carrier and rate methods for a specific zone |
| `getTaxSettings` | V3 `/tax/settings` | — | Tax configuration — enabled status, pricing display, class ids |

**Documentation Search**

| Tool | Purpose |
|------|---------|
| `searchDocumentation` | BC help docs keyword search. Used when the merchant asks "how do I..." questions that need setup or configuration guidance rather than store data. Returns matching articles with titles and URLs. |

### V2 vs V3 Response Shape Differences

This is the most common source of errors when extending the tool surface:

| Dimension | V3 Endpoints | V2 Endpoints |
|-----------|-------------|-------------|
| Response wrapper | `{data: T[], meta: {pagination: {total, count, per_page, current_page, total_pages}}}` | Bare array or object — no wrapper |
| Numeric fields | Actual numbers (`price: 29.99`) | Strings (`total_inc_tax: "1952.19"`) |
| Empty results | `{data: [], meta: {...}}` | Empty body (patched to `[]` by middleware) |
| Counting | `meta.pagination.total` with `limit: 1` | `getOrderCount()` — dedicated count endpoint |
| Pagination | `meta.pagination.total_pages` — known upfront | Page until empty — no metadata |

---

## Write Tools (7)

Write tools execute outside the Codemode sandbox as top-level AI SDK tool calls. They are structurally unavailable inside Codemode — the model cannot call them from generated scripts, only directly.

Every write tool requires a **two-turn confirmation pattern**:

1. Model calls tool with `confirmed: false` → tool returns a `{status: "preview", operation, args}` object without executing
2. Model presents the preview to the merchant and asks for confirmation
3. Merchant confirms ("yes", "go ahead", "confirm", etc.)
4. Model calls the same tool again with `confirmed: true` and the same arguments → tool executes, logs to audit

All confirmed writes are recorded in the Durable Object's SQLite `write_audit` table with `store_hash`, `tool_name`, `input_json`, `result_json`, and `created_at`.

| Tool | BC API | What It Does | Preview Returns |
|------|--------|-------------|----------------|
| `createCoupon` | V2 `POST /coupons` | Create a coupon code with type, amount, min_purchase, expiry, max_uses | Preview with all coupon parameters |
| `updateProductInventory` | V3 `PUT /catalog/products/{id}` | Set `inventory_level` on a product | `"Will set product {id} inventory to {n}"` |
| `setProductVisibility` | V3 `PUT /catalog/products/{id}` | Set `is_visible: true/false` (publish/unpublish) | `"Will publish/unpublish product {id}"` |
| `updateProductPrice` | V3 `PUT /catalog/products/{id}` | Update `price` and/or `sale_price` | Shows new price values |
| `deleteCoupon` | V2 `DELETE /coupons/{id}` | Delete a coupon permanently | Warns this cannot be undone |
| `updateOrderStatus` | V2 `PUT /orders/{id}` | Set `status_id` on an order | Shows order id and new status label |
| `createProduct` | V3 `POST /catalog/products` | Create a new product listing with name, type, price, and optional fields | Preview with all product parameters |

### Write Tool Business Rules

- The model must always **read before it writes** when the write depends on knowing the current state. For example, to unpublish a product by name, it first uses `execute` to get the product_id, then previews `setProductVisibility`.
- Only one write per turn. After previewing one write, the model waits for confirmation before proceeding. If the merchant asks for multiple changes, the model handles them sequentially.
- The model only calls write tools when the merchant **explicitly asks for a change** — words like "create", "update", "publish", "unpublish", "adjust", "set", "delete". Informational questions do not trigger writes.

---

## Generative UI Blocks

The model emits structured UI components as fenced code blocks with language `block` in its response text:

````
```block
{"type": "KPICard", "props": {"label": "Total Products", "value": "119"}}
```
````

The Next.js client's markdown renderer detects these fences, parses the JSON, looks up the component type in the block registry, and renders the React component inline where the fence appeared. Blocks and prose can be freely mixed — the model places blocks where the data would be most useful.

### Block Catalog

**KPICard** — a single headline metric with optional trend indicator.

Used for: single-number answers — revenue totals, product counts, order counts, percentages.

Props: `label` (string), `value` (string), `trend?: {direction: "up"|"down", label: string}`.

---

**DataTable** — tabular data with column headers, typed rows, and optional alignment.

Used for: product lists, order lists, customer lists, coupon tables, anything where multiple fields per row need to be compared.

Props: `caption` (string), `columns` (array of `{key, label, align?}`), `rows` (array of objects keyed by column keys).

---

**ProductCard** — a focused view of a single product with name, price, inventory, SKU, and optional image.

Used for: when the answer focuses on one specific product ("show me details for X", "what's my most expensive item").

Props: `id`, `name`, `price`, `original_price?`, `inventory`, `sku`, `image_url?`.

---

**OrderTimeline** — a visual timeline of order lifecycle events (created, paid, shipped, completed) showing current status.

Used for: order status questions ("why is order #123 stuck", "what's the status of my latest order").

Props: `order_id`, `customer`, `total`, `current_status_id`, `current_status_label`, `events` (array of `{label, date, done}`).

---

**InventoryBar** — a horizontal bar chart comparing inventory levels across SKUs or locations with threshold-based color coding (red = low, yellow = warning, green = healthy).

Used for: inventory breakdowns, low-stock alerts, warehouse distribution.

Props: `caption`, `items` (array of `{label, value, threshold_low, threshold_ok}`).

---

**SparklineChart** — a compact line chart for a single time series.

Used for: trends over time — revenue by day, daily order count, inventory movement over time.

Props: `label`, `points` (array of `{x, y}`), `total?`.

---

**ErrorCard** — an error state card for BC API failures, auth issues, or tool errors.

Used for: when a BC API call fails (403, 429, 500), when a tool throws, when the merchant needs to take a remediation action.

Props: `title`, `message`, `status_code?`, `endpoint?`, `suggestion?`.

---

## Two-Model Strategy

The agent uses two Claude models and selects between them per turn:

| Model | When | Why |
|-------|------|-----|
| Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | All first-response turns — default | ~2.6x faster and ~3x cheaper than Sonnet; handles the vast majority of merchant questions correctly on the first attempt |
| Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Continuation turns — after a tool error, on write execution turns, after DO restart recovery | Deeper reasoning and error-recovery instincts justify the cost at high-stakes moments |

A "continuation turn" (`ctx.continuation === true` in `beforeTurn`) fires when the AI SDK retries within a turn after a tool error, or when the agent receives a client tool result after the approval flow. Normal fresh messages always start with Haiku.

In practice Haiku handles approximately 95% of turns. Sonnet activates when Codemode scripts fail and the model needs to reason about why (wrong field name, wrong API version, bad sort parameter) and try a different approach.

---

## Context-Aware Responses

The chat panel passes an `entityContext` body parameter to `useAgentChat` when the merchant is viewing a specific entity in the BC admin:

```typescript
{ entityContext: { type: "order", id: "136" } }
```

`beforeTurn()` in the Worker detects this and appends a system prompt addendum:

```
## CURRENT CONTEXT
The merchant is viewing order #136. Every question in this conversation is implicitly
about this order. When fetching data, scope queries to this entity.
```

This allows the App Extension panels (Orders, Products) to answer questions like "What's in this order?" or "How is this product selling?" without the merchant specifying an ID.

---

## Chat Session Persistence

Active session state (conversation history for the current connection) is maintained by the Durable Object (managed by the Think base class). It is available as long as the DO is active.

Across page loads, chat history is stored in IndexedDB in the browser. Messages are serialized from the AI SDK `UIMessage` format before storage and deserialized on load. This provides per-browser persistence — not cross-device.

The write audit log in DO SQLite persists independently of chat history. It is not shown in the chat UI but is accessible by querying the DO's SQLite storage directly.

---

## BC OAuth Scopes Required

The BC app requires these OAuth scopes for full functionality:

| Scope | Tools That Need It |
|-------|-------------------|
| `store_v2_orders` (read/write) | `getOrders`, `getOrder`, `getOrderProducts`, `getOrderCount`, `getOrderShippingAddresses`, `getOrderRefunds`, `updateOrderStatus` |
| `store_v2_products` (read/write) | `getProducts`, `getProduct`, `getProductVariants`, `updateProductInventory`, `setProductVisibility`, `updateProductPrice`, `createProduct` |
| `store_v2_customers` (read) | `getCustomers`, `getCustomerAddresses` |
| `store_v2_marketing` (read/write) | `getPromotions`, `getCoupons`, `createCoupon`, `deleteCoupon` |
| `store_v2_information_read_only` | `getChannels`, `getStoreInfo` |
| `store_inventory` (read) | `getInventoryLocations` |
| `store_content` (read) | `getCategories`, `getBrands` |
| `store_v2_shipping` (read) | `getShippingZones`, `getShippingMethods` |
| `store_v2_tax` (read) | `getTaxSettings` |
| `store_app_extensions_manage` | App Extension registration during OAuth install |

Adding new BC API scopes to the app requires merchants to reinstall (the OAuth flow re-prompts for scope approval).
