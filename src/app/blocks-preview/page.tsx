'use client';

import { BlockRenderer } from '@/components/chat/blocks';

/**
 * Dev-only preview page for the generative UI block registry. Visit
 * `/blocks-preview` to see every component rendered with example props.
 * Use this to iterate on visuals without running the Worker.
 *
 * This page is not linked from anywhere and has no auth — keep it out
 * of the production nav. Remove before shipping.
 */

const DEMO = `# Ask BC — Generative UI preview

This page renders the block registry with the exact JSON shapes the agent emits via fenced \`block\` code fences. Use it to iterate on visuals without running the Worker.

## KPI cards (inline row)

\`\`\`block
{"type": "KPICard", "props": {"label": "Total Revenue", "value": "$5,344.68", "trend": {"direction": "up", "label": "+12% vs last week"}}}
\`\`\`
\`\`\`block
{"type": "KPICard", "props": {"label": "Total Orders", "value": 47, "trend": {"direction": "flat", "label": "no change"}}}
\`\`\`
\`\`\`block
{"type": "KPICard", "props": {"label": "Total Products", "value": 119, "hint": "Across 8 categories"}}
\`\`\`

## Data table

\`\`\`block
{
  "type": "DataTable",
  "props": {
    "caption": "Top 5 products by price",
    "columns": [
      {"key": "name", "label": "Product"},
      {"key": "sku", "label": "SKU"},
      {"key": "price", "label": "Price", "align": "right"},
      {"key": "inventory", "label": "Stock", "align": "right"}
    ],
    "rows": [
      {"name": "Modular Bouclé Sofa System", "sku": "HVN-LR-005", "price": "$3,299.00", "inventory": 0},
      {"name": "Carmel Leather Sectional", "sku": "HVN-LR-001", "price": "$2,499.00", "inventory": 0},
      {"name": "Rustic Kub Console Table", "sku": "SKU-NQQVQJ71", "price": "$2,440.38", "inventory": 29},
      {"name": "Rustic Orn Headboard", "sku": "SKU-JHNZOXKA", "price": "$2,395.89", "inventory": 191},
      {"name": "Minimalist Spinka Bench", "sku": "SKU-CKMKIOND", "price": "$2,278.35", "inventory": 57}
    ]
  }
}
\`\`\`

## Product card

The **most expensive product** in the catalog:

\`\`\`block
{
  "type": "ProductCard",
  "props": {
    "id": 379,
    "name": "Modular Bouclé Sofa System",
    "price": "$3,299.00",
    "original_price": "$4,199.00",
    "inventory": 12,
    "sku": "HVN-LR-005"
  }
}
\`\`\`

## Order timeline

\`\`\`block
{
  "type": "OrderTimeline",
  "props": {
    "order_id": 136,
    "customer": "Luella Kshlerin",
    "total": "$779.18",
    "current_status_id": 10,
    "current_status_label": "Completed",
    "events": [
      {"label": "Created", "date": "2026-02-18T13:48:00Z", "done": true},
      {"label": "Payment received", "date": "2026-02-18T13:49:00Z", "done": true},
      {"label": "Fulfilled", "date": "2026-02-19T10:00:00Z", "done": true},
      {"label": "Completed", "date": "2026-02-20T14:22:00Z", "done": true}
    ]
  }
}
\`\`\`

## Inventory bar — low-stock alert

\`\`\`block
{
  "type": "InventoryBar",
  "props": {
    "caption": "Low-stock alert — items below reorder threshold",
    "items": [
      {"label": "Mid-Century Heidenreich Credenza", "value": 7, "threshold_low": 10, "threshold_ok": 25},
      {"label": "Industrial Marks Lounge Chair", "value": 18, "threshold_low": 10, "threshold_ok": 25},
      {"label": "Scandinavian Tromp Side Table", "value": 176, "threshold_low": 10, "threshold_ok": 25},
      {"label": "Modern Tillman Study Desk", "value": 196, "threshold_low": 10, "threshold_ok": 25}
    ]
  }
}
\`\`\`

## Sparkline

\`\`\`block
{
  "type": "SparklineChart",
  "props": {
    "label": "Daily orders — last 7 days",
    "total": 45,
    "points": [
      {"x": "Mon", "y": 3},
      {"x": "Tue", "y": 5},
      {"x": "Wed", "y": 4},
      {"x": "Thu", "y": 8},
      {"x": "Fri", "y": 12},
      {"x": "Sat", "y": 7},
      {"x": "Sun", "y": 6}
    ]
  }
}
\`\`\`

## Error handling

A malformed block below should render as a friendly error, not crash the page:

\`\`\`block
{"type": "Nonexistent", "props": {}}
\`\`\`

And here's one with broken JSON:

\`\`\`block
{not valid json at all}
\`\`\`

---

Everything above rendered from a single markdown string with fenced \`block\` code blocks — the exact format the agent emits.
`;

export default function BlocksPreviewPage() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '2rem 1.5rem 6rem',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        color: '#313440',
        background: '#fafbfc',
        minHeight: '100vh',
      }}
    >
      <BlockRenderer content={DEMO} />
    </div>
  );
}
