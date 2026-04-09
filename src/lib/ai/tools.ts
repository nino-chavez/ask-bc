import { tool } from 'ai';
import { z } from 'zod';
import { createBcClient } from '@/lib/bigcommerce/client';
import { searchBcDocsWithContent } from './doc-search';

interface ToolContext {
  storeHash: string;
  accessToken: string;
}

/**
 * Build BigCommerce API tools bound to a specific store's credentials.
 * Each tool makes a real API call and returns the result.
 */
export function createBcTools(ctx: ToolContext) {
  const bc = createBcClient(ctx);

  return {
    get_store_info: tool({
      description: 'Get basic store information including name, domain, plan, status, and configuration.',
      inputSchema: z.object({}),
      execute: async () => bc.getV2('/store'),
    }),

    get_products: tool({
      description: 'Search or list products. Returns product name, SKU, price, inventory, availability, and category assignments.',
      inputSchema: z.object({
        keyword: z.string().optional().describe('Search by product name or SKU'),
        id: z.number().optional().describe('Get a specific product by ID'),
        category_id: z.number().optional().describe('Filter by category ID'),
        availability: z.enum(['available', 'disabled', 'preorder']).optional().describe('Filter by availability'),
        is_visible: z.boolean().optional().describe('Filter by storefront visibility'),
        page: z.number().optional().describe('Page number (default 1)'),
        limit: z.number().optional().describe('Results per page (default 50, max 250)'),
      }),
      execute: async (input) => {
        const params = new URLSearchParams();
        if (input.keyword) params.set('keyword', input.keyword);
        if (input.id) params.set('id', String(input.id));
        if (input.category_id) params.set('categories:in', String(input.category_id));
        if (input.availability) params.set('availability', input.availability);
        if (input.is_visible !== undefined) params.set('is_visible', String(input.is_visible));
        if (input.page) params.set('page', String(input.page));
        if (input.limit) params.set('limit', String(input.limit));
        const query = params.toString() ? `?${params}` : '';
        return bc.get(`/catalog/products${query}`);
      },
    }),

    get_orders: tool({
      description: 'List orders with optional filters. Returns order ID, status, total, customer info, and dates. Uses V2 API.',
      inputSchema: z.object({
        status_id: z.number().optional().describe('Filter by order status ID (0=Incomplete, 1=Pending, 2=Shipped, 5=Cancelled, 10=Completed, 11=Awaiting Payment, 12=Awaiting Shipment)'),
        min_date_created: z.string().optional().describe('Minimum creation date (RFC 2822 or ISO 8601)'),
        max_date_created: z.string().optional().describe('Maximum creation date'),
        customer_id: z.number().optional().describe('Filter by customer ID'),
        min_total: z.string().optional().describe('Minimum order total'),
        max_total: z.string().optional().describe('Maximum order total'),
        page: z.number().optional().describe('Page number (default 1)'),
        limit: z.number().optional().describe('Results per page (default 50, max 250)'),
      }),
      execute: async (input) => {
        const params = new URLSearchParams();
        if (input.status_id !== undefined) params.set('status_id', String(input.status_id));
        if (input.min_date_created) params.set('min_date_created', input.min_date_created);
        if (input.max_date_created) params.set('max_date_created', input.max_date_created);
        if (input.customer_id) params.set('customer_id', String(input.customer_id));
        if (input.min_total) params.set('min_total', input.min_total);
        if (input.max_total) params.set('max_total', input.max_total);
        if (input.page) params.set('page', String(input.page));
        if (input.limit) params.set('limit', String(input.limit));
        const query = params.toString() ? `?${params}` : '';
        return bc.getV2(`/orders${query}`);
      },
    }),

    get_customers: tool({
      description: 'Search or list customers. Returns name, email, company, order count, and date joined.',
      inputSchema: z.object({
        name_like: z.string().optional().describe('Search by name (partial match)'),
        email_in: z.string().optional().describe('Filter by exact email (comma-separated for multiple)'),
        company_like: z.string().optional().describe('Search by company name (partial match)'),
        id: z.number().optional().describe('Get a specific customer by ID'),
        page: z.number().optional().describe('Page number (default 1)'),
        limit: z.number().optional().describe('Results per page (default 50, max 250)'),
      }),
      execute: async (input) => {
        const params = new URLSearchParams();
        if (input.name_like) params.set('name:like', input.name_like);
        if (input.email_in) params.set('email:in', input.email_in);
        if (input.company_like) params.set('company:like', input.company_like);
        if (input.id) params.set('id:in', String(input.id));
        if (input.page) params.set('page', String(input.page));
        if (input.limit) params.set('limit', String(input.limit));
        const query = params.toString() ? `?${params}` : '';
        return bc.get(`/customers${query}`);
      },
    }),

    get_promotions: tool({
      description: 'List promotions (price list rules and cart-level discounts). Returns promotion name, rules, conditions, status, and date ranges.',
      inputSchema: z.object({
        page: z.number().optional().describe('Page number (default 1)'),
        limit: z.number().optional().describe('Results per page (default 50, max 250)'),
      }),
      execute: async (input) => {
        const params = new URLSearchParams();
        if (input.page) params.set('page', String(input.page));
        if (input.limit) params.set('limit', String(input.limit));
        const query = params.toString() ? `?${params}` : '';
        return bc.get(`/promotions${query}`);
      },
    }),

    get_coupons: tool({
      description: 'List coupons. Returns coupon code, type, amount, usage count, and expiration. Uses V2 API.',
      inputSchema: z.object({
        id: z.number().optional().describe('Get a specific coupon by ID'),
        code: z.string().optional().describe('Filter by coupon code'),
        page: z.number().optional().describe('Page number (default 1)'),
        limit: z.number().optional().describe('Results per page (default 50, max 250)'),
      }),
      execute: async (input) => {
        const params = new URLSearchParams();
        if (input.id) params.set('id', String(input.id));
        if (input.code) params.set('code', input.code);
        if (input.page) params.set('page', String(input.page));
        if (input.limit) params.set('limit', String(input.limit));
        const query = params.toString() ? `?${params}` : '';
        return bc.getV2(`/coupons${query}`);
      },
    }),

    get_categories: tool({
      description: 'Get the category tree for the store.',
      inputSchema: z.object({}),
      execute: async () => bc.get('/catalog/trees/categories'),
    }),

    get_channels: tool({
      description: 'List all sales channels/storefronts. Returns channel name, type, platform, status, and URLs.',
      inputSchema: z.object({}),
      execute: async () => bc.get('/channels'),
    }),

    get_order_products: tool({
      description: 'Get the line items (products) for a specific order. Uses V2 API.',
      inputSchema: z.object({
        order_id: z.number().describe('The order ID to get products for'),
      }),
      execute: async (input) => bc.getV2(`/orders/${input.order_id}/products`),
    }),

    get_product_variants: tool({
      description: 'Get variants (SKUs, prices, inventory, options) for a specific product.',
      inputSchema: z.object({
        product_id: z.number().describe('The product ID'),
        page: z.number().optional().describe('Page number (default 1)'),
        limit: z.number().optional().describe('Results per page (default 50, max 250)'),
      }),
      execute: async (input) => {
        const params = new URLSearchParams();
        if (input.page) params.set('page', String(input.page));
        if (input.limit) params.set('limit', String(input.limit));
        const query = params.toString() ? `?${params}` : '';
        return bc.get(`/catalog/products/${input.product_id}/variants${query}`);
      },
    }),

    get_order_shipping_addresses: tool({
      description: 'Get shipping address(es) for a specific order. Uses V2 API.',
      inputSchema: z.object({
        order_id: z.number().describe('The order ID'),
      }),
      execute: async (input) => bc.getV2(`/orders/${input.order_id}/shipping_addresses`),
    }),

    get_shipping_zones: tool({
      description: 'Get shipping zones and their configured shipping methods. Uses V2 API.',
      inputSchema: z.object({}),
      execute: async () => bc.getV2('/shipping/zones'),
    }),

    get_tax_settings: tool({
      description: 'Get the store\'s tax configuration including tax provider, document submission, and pricing settings.',
      inputSchema: z.object({}),
      execute: async () => bc.get('/tax/settings'),
    }),

    get_inventory: tool({
      description: 'Get inventory levels across locations for a specific product.',
      inputSchema: z.object({
        product_id: z.number().describe('The product ID to check inventory for'),
      }),
      execute: async (input) => bc.get(`/inventory/items?product_id:in=${input.product_id}`),
    }),

    search_documentation: tool({
      description: 'Search BigCommerce help documentation to answer "how do I..." questions about BigCommerce features, settings, and configuration. Use this when the merchant asks about how to do something in BigCommerce that you cannot answer from store data alone.',
      inputSchema: z.object({
        query: z.string().describe('The search query about BigCommerce features or configuration'),
      }),
      execute: async (input) => searchBcDocsWithContent(input.query),
    }),
  };
}
