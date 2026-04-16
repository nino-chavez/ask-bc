/**
 * Generative UI block protocol.
 *
 * The agent emits components as fenced code blocks with language `block`
 * containing a JSON object: { type: ComponentName, props: {...} }. The
 * Next.js client parses these during markdown rendering and mounts real
 * React components inline.
 *
 * This module is the single source of truth for which components exist
 * and what props they accept. Both sides import from it:
 *   - Worker: references the type names + prop shapes in the system prompt
 *   - Next.js: validates + dispatches blocks to React components
 *
 * Adding a new component: add a new entry to `BLOCK_SCHEMAS`, add a matching
 * React component in the Next.js `src/components/chat/blocks/` directory,
 * and extend the registry in the renderer.
 */

export interface BlockSchema {
  /** Short description of what the component is for. Goes in the system prompt. */
  description: string;
  /** Human-readable example of when the model should use this block. */
  whenToUse: string;
  /** JSON example of the props object. Model copies this pattern. */
  example: string;
}

export const BLOCK_SCHEMAS: Record<string, BlockSchema> = {
  KPICard: {
    description:
      "A single headline metric: big value, short label, optional trend indicator. Use for totals, counts, percentages.",
    whenToUse:
      "Single-number answers. 'Total revenue', 'Products in stock', 'Orders this week'.",
    example: `{
  "type": "KPICard",
  "props": {
    "label": "Total Revenue (5 orders)",
    "value": "$5,344.68",
    "trend": { "direction": "up", "label": "+12% vs last week" }
  }
}`,
  },

  DataTable: {
    description:
      "A tabular display with column headers and typed rows. Use for structured lists where the merchant needs to scan multiple fields per row.",
    whenToUse:
      "Product lists, order lists, customer lists, inventory breakdowns. Anything where columns help readability.",
    example: `{
  "type": "DataTable",
  "props": {
    "caption": "Top 5 products by price",
    "columns": [
      { "key": "name", "label": "Product" },
      { "key": "price", "label": "Price", "align": "right" },
      { "key": "inventory", "label": "Stock", "align": "right" }
    ],
    "rows": [
      { "name": "Modular Bouclé Sofa", "price": "$3,299.00", "inventory": 12 },
      { "name": "Carmel Leather Sectional", "price": "$2,499.00", "inventory": 8 }
    ]
  }
}`,
  },

  ProductCard: {
    description:
      "A single product highlight with name, price, image_url (optional), inventory, and a link to the product in the BC admin.",
    whenToUse:
      "When the answer focuses on a single specific product — 'show me details for product X', 'what's my most expensive item', 'how many do I have in stock of Y'.",
    example: `{
  "type": "ProductCard",
  "props": {
    "id": 418,
    "name": "Contemporary Daniel Sofa",
    "price": "$1,522.79",
    "original_price": "$2,160.25",
    "inventory": 12,
    "sku": "CDS-001",
    "image_url": null
  }
}`,
  },

  OrderTimeline: {
    description:
      "A visual timeline of order events: created → paid → fulfilled → delivered → completed. Shows current status prominently.",
    whenToUse:
      "When the question is about the lifecycle of a single order — 'why is order #123 stuck', 'what's the status of my latest order'.",
    example: `{
  "type": "OrderTimeline",
  "props": {
    "order_id": 136,
    "customer": "Luella Kshlerin",
    "total": "$779.18",
    "current_status_id": 10,
    "current_status_label": "Completed",
    "events": [
      { "label": "Created", "date": "2026-02-18T13:48:00Z", "done": true },
      { "label": "Paid", "date": "2026-02-18T13:49:00Z", "done": true },
      { "label": "Shipped", "date": "2026-02-19T10:00:00Z", "done": true },
      { "label": "Completed", "date": "2026-02-20T14:22:00Z", "done": true }
    ]
  }
}`,
  },

  InventoryBar: {
    description:
      "A horizontal bar chart showing inventory levels across multiple SKUs or locations, with color thresholds (red = low, yellow = warning, green = healthy).",
    whenToUse:
      "Inventory breakdowns: 'which products are low on stock', 'how is inventory distributed across my warehouses'.",
    example: `{
  "type": "InventoryBar",
  "props": {
    "caption": "Inventory — low stock alert",
    "items": [
      { "label": "Mid-Century Heidenreich Credenza", "value": 7, "threshold_low": 10, "threshold_ok": 25 },
      { "label": "Industrial Marks Lounge Chair", "value": 153, "threshold_low": 10, "threshold_ok": 25 }
    ]
  }
}`,
  },

  SparklineChart: {
    description:
      "A tiny inline line chart for a single series over time. Use for trends and time-series overviews.",
    whenToUse:
      "Trends over time: 'revenue over the last 7 days', 'daily order count', 'inventory movement'.",
    example: `{
  "type": "SparklineChart",
  "props": {
    "label": "Daily orders — last 7 days",
    "points": [
      { "x": "Mon", "y": 3 },
      { "x": "Tue", "y": 5 },
      { "x": "Wed", "y": 4 },
      { "x": "Thu", "y": 8 },
      { "x": "Fri", "y": 12 },
      { "x": "Sat", "y": 7 },
      { "x": "Sun", "y": 6 }
    ],
    "total": 45
  }
}`,
  },
};

/**
 * Render the component catalog as a markdown section for the system prompt.
 * The agent reads this to know what components exist, when to use them,
 * and what props they take.
 */
export function renderBlockCatalog(): string {
  const lines: string[] = [
    "## GENERATIVE UI — emit components as fenced `block` code blocks",
    "",
    "When your answer has structured data, **emit a `block` fenced code block** containing a JSON object `{type, props}`. The merchant's chat UI will replace the fence with a real React component. You can mix blocks freely with markdown prose — the blocks render inline where you place them.",
    "",
    "### Syntax",
    "",
    "```block",
    `{"type": "KPICard", "props": {"label": "Total Products", "value": 119}}`,
    "```",
    "",
    "Always:",
    "- Use language `block` on the fence, not `json`.",
    "- Valid JSON (double quotes, no trailing commas).",
    "- Only the component types listed below. Unknown types render as raw code.",
    "- Prefer blocks over markdown tables when the merchant will scan/compare values. Keep prose brief — the blocks carry the data.",
    "",
    "### Component catalog",
    "",
  ];

  for (const [name, schema] of Object.entries(BLOCK_SCHEMAS)) {
    lines.push(`#### \`${name}\``);
    lines.push(schema.description);
    lines.push("");
    lines.push(`**When to use:** ${schema.whenToUse}`);
    lines.push("");
    lines.push("```block");
    lines.push(schema.example);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
