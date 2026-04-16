import createClient, { type Middleware } from "openapi-fetch";
import type { paths as ProductPaths } from "./products.d.ts";
import type { paths as CategoryPaths } from "./categories.d.ts";
import type { paths as BrandPaths } from "./brands.d.ts";
import type { paths as VariantPaths } from "./product-variants.d.ts";
import type { paths as CustomerPaths } from "./customers.d.ts";
import type { paths as OrdersV2Paths } from "./orders-v2.d.ts";
import type { paths as OrdersV3Paths } from "./orders-v3.d.ts";
import type { paths as InventoryPaths } from "./inventory.d.ts";
import type { paths as LocationPaths } from "./locations.d.ts";
import type { paths as PromotionPaths } from "./promotions.d.ts";
import type { paths as MarketingV2Paths } from "./marketing-v2.d.ts";
import type { paths as ChannelPaths } from "./channels.d.ts";

/**
 * Typed BigCommerce API clients. One per generated OpenAPI spec, grouped
 * by the API family the model thinks about (products, orders, customers, etc.).
 *
 * Credentials live in the host Worker's env. The sandbox sees `codemode.*`
 * RPC calls that resolve to tool `execute()` functions — those call into
 * these clients. Generated code never touches the BC access token.
 */

interface BcEnv {
  BC_API_BASE: string;
  BC_STORE_HASH: string;
  BC_ACCESS_TOKEN: string;
}

/**
 * BC V2 endpoints return HTTP 200 with an **empty body** for "no matches,"
 * instead of V3's `{data: []}`. Default `response.json()` throws
 * `Unexpected end of JSON input`. This middleware detects empty success
 * bodies and substitutes a harmless empty-array envelope so typed clients
 * don't explode on the common no-results case.
 */
const v2EmptyBodyMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) return;
    const cloned = response.clone();
    const text = await cloned.text();
    if (text.length > 0) return;
    return new Response("[]", {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "content-type": "application/json",
        "x-bc-empty-body-patched": "1",
      },
    });
  },
};

/**
 * Detects 401 Unauthorized responses from BC and throws a descriptive
 * error the agent can surface as an ErrorCard with re-auth guidance. [S-8]
 */
const authErrorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.status === 401) {
      throw new Error(
        "BC API returned 401 Unauthorized — the store's access token may have been revoked or expired. " +
        "The merchant needs to re-authorize the app from their BigCommerce control panel.",
      );
    }
    if (response.status === 403) {
      throw new Error(
        "BC API returned 403 Forbidden — the app may not have the required OAuth scope for this operation. " +
        "Check the API account's scope in Settings → API → Store-level API accounts.",
      );
    }
  },
};

function makeClient<Paths extends {}>(
  env: BcEnv,
  version: "v3" | "v2",
  opts: { middleware?: Middleware[] } = {},
) {
  const base = env.BC_API_BASE.replace(/\/$/, "");
  const client = createClient<Paths>({
    baseUrl: `${base}/stores/${env.BC_STORE_HASH}/${version}`,
    headers: {
      "X-Auth-Token": env.BC_ACCESS_TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  client.use(authErrorMiddleware);
  for (const mw of opts.middleware ?? []) client.use(mw);
  return client;
}

export function createBcClients(env: BcEnv) {
  const v2Opts = { middleware: [v2EmptyBodyMiddleware] };
  return {
    // V3 — modern endpoints, {data, meta} envelope
    products: makeClient<ProductPaths>(env, "v3"),
    categories: makeClient<CategoryPaths>(env, "v3"),
    brands: makeClient<BrandPaths>(env, "v3"),
    variants: makeClient<VariantPaths>(env, "v3"),
    customers: makeClient<CustomerPaths>(env, "v3"),
    ordersV3: makeClient<OrdersV3Paths>(env, "v3"),
    inventory: makeClient<InventoryPaths>(env, "v3"),
    locations: makeClient<LocationPaths>(env, "v3"),
    promotions: makeClient<PromotionPaths>(env, "v3"),
    channels: makeClient<ChannelPaths>(env, "v3"),

    // V2 — legacy but required for orders-by-line-item, coupons, store info
    orders: makeClient<OrdersV2Paths>(env, "v2", v2Opts),
    marketing: makeClient<MarketingV2Paths>(env, "v2", v2Opts),
  };
}

export type BcClients = ReturnType<typeof createBcClients>;
