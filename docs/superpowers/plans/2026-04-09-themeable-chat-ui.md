# Themeable Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three configurable visual themes (BC-Native, AI Assistant, Dashboard) to the Ask BC chat, with per-store defaults via Redis and per-merchant overrides via IndexedDB.

**Architecture:** Theme system uses a React context provider that serves typed theme config objects (tokens, layout, component map). Each component reads from the context hook. Rich card components render tool output for the Dashboard theme. A new API route manages the Redis-stored default.

**Tech Stack:** React 18, TypeScript, Next.js 15 App Router, BigDesign UI, Upstash Redis, IndexedDB, Vercel AI SDK UIMessage types.

**Spec:** `docs/superpowers/specs/2026-04-09-themeable-chat-ui-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/themes/types.ts` | ThemeConfig, ThemeTokens, ThemeLayout, ThemeComponents interfaces |
| `src/lib/themes/bc-native.ts` | BC-Native theme definition |
| `src/lib/themes/ai-assistant.ts` | AI Assistant theme definition |
| `src/lib/themes/dashboard.ts` | Dashboard theme definition |
| `src/lib/themes/index.ts` | Theme registry, lookup helpers |
| `src/components/chat/ThemeContext.tsx` | React context, provider, useTheme hook |
| `src/components/chat/ThemeSelector.tsx` | Gear icon dropdown for theme switching |
| `src/components/chat/cards/GenericCard.tsx` | Key-value card for any tool result |
| `src/components/chat/cards/OrderCard.tsx` | Rich order display card |
| `src/components/chat/cards/ProductCard.tsx` | Rich product display card with thumbnail |
| `src/components/chat/cards/CustomerCard.tsx` | Rich customer display card |
| `src/components/chat/cards/ToolResultRenderer.tsx` | Dispatches tool output to correct card |
| `src/components/chat/loading/PulseDot.tsx` | BC-Native loading indicator |
| `src/components/chat/loading/TypingDots.tsx` | AI Assistant loading indicator |
| `src/components/chat/loading/SkeletonCards.tsx` | Dashboard loading indicator |
| `src/app/stores/[storeHash]/api/theme/route.ts` | GET/PUT theme preference in Redis |
| `src/lib/theme-storage.ts` | IndexedDB helpers for merchant theme override |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/chat/ChatPage.tsx` | Wrap with ThemeProvider, sidebar variants (panel/drawer/rail), add ThemeSelector |
| `src/components/chat/ChatPanel.tsx` | Read tokens for styling, themed empty state |
| `src/components/chat/ChatInput.tsx` | All colors/borders from tokens |
| `src/components/chat/MessageList.tsx` | Themed loading indicator, background from tokens |
| `src/components/chat/MessageBubble.tsx` | Themed bubbles, delegate tool results to ToolResultRenderer |
| `src/components/chat/ChatMarkdown.tsx` | Colors from tokens |

---

## Task 1: Theme Type Definitions

**Files:**
- Create: `src/lib/themes/types.ts`

- [ ] **Step 1: Create the theme type definitions**

```typescript
// src/lib/themes/types.ts
import type { ComponentType } from 'react';

export type ThemeId = 'bc-native' | 'ai-assistant' | 'dashboard';

export interface ThemeTokens {
  colors: {
    primary: string;
    primaryHover: string;
    surface: string;
    surfaceRaised: string;
    background: string;
    text: { primary: string; secondary: string; muted: string };
    border: { default: string; subtle: string };
    accent: string;
    success: string;
    error: string;
    userBubble: { bg: string; text: string; border?: string };
    assistantBubble: { bg: string; text: string; border?: string };
    code: { bg: string; text: string };
  };
  typography: {
    fontFamily: string;
    fontSize: { xs: string; sm: string; base: string; lg: string; xl: string };
    fontWeight: { normal: number; medium: number; semibold: number };
    lineHeight: { tight: string; normal: string; relaxed: string };
  };
  spacing: { xs: string; sm: string; md: string; lg: string; xl: string };
  radius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
    userBubble: string;
    assistantBubble: string;
  };
  shadows: { sm: string; md: string; lg: string };
  transitions: { fast: string; normal: string };
}

export interface ThemeLayout {
  contentMaxWidth: string;
  contentAlign: 'stretch' | 'center';
  sidebarWidth: string;
  sidebarExpandable: boolean;
  sidebarStyle: 'panel' | 'drawer' | 'rail';
  toolResultPosition: 'inline' | 'grid-below';
}

export interface ToolResultProps {
  toolName: string;
  output: unknown;
}

export interface ThemeComponents {
  toolResultRenderer: ComponentType<ToolResultProps>;
  loadingIndicator: ComponentType;
}

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  tokens: ThemeTokens;
  layout: ThemeLayout;
  components: ThemeComponents;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/themes/types.ts
git commit -m "feat: add theme type definitions"
```

---

## Task 2: Loading Indicator Components

**Files:**
- Create: `src/components/chat/loading/PulseDot.tsx`
- Create: `src/components/chat/loading/TypingDots.tsx`
- Create: `src/components/chat/loading/SkeletonCards.tsx`

These are needed before the theme definitions (which reference them in their component maps).

- [ ] **Step 1: Create PulseDot (BC-Native loading)**

```tsx
// src/components/chat/loading/PulseDot.tsx
'use client';

import { Box } from '@bigcommerce/big-design';

export default function PulseDot() {
  return (
    <Box style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem' }}>
      <Box
        style={{
          padding: '0.75rem 1rem',
          borderRadius: '1rem 1rem 1rem 0.25rem',
          background: '#f0f1f5',
          fontSize: '0.875rem',
          color: '#6b6f82',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#3C64F4',
            animation: 'askbc-pulse 1.5s ease-in-out infinite',
          }}
        />
        Thinking...
        <style>{`@keyframes askbc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Create TypingDots (AI Assistant loading)**

```tsx
// src/components/chat/loading/TypingDots.tsx
'use client';

import { Box } from '@bigcommerce/big-design';

export default function TypingDots() {
  return (
    <Box style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem' }}>
      <Box
        style={{
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#9CA3AF',
              animation: `askbc-typing 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
        <style>{`@keyframes askbc-typing { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }`}</style>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Create SkeletonCards (Dashboard loading)**

```tsx
// src/components/chat/loading/SkeletonCards.tsx
'use client';

import { Box } from '@bigcommerce/big-design';

function SkeletonBlock({ width, height }: { width: string; height: string }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: '4px',
        background: '#e5e7eb',
        animation: 'askbc-shimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}

export default function SkeletonCards() {
  return (
    <Box style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      {[0, 1].map((i) => (
        <Box
          key={i}
          style={{
            flex: '1 1 200px',
            maxWidth: '300px',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <SkeletonBlock width="60%" height="12px" />
          <SkeletonBlock width="40%" height="10px" />
          <SkeletonBlock width="80%" height="10px" />
        </Box>
      ))}
      <style>{`@keyframes askbc-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </Box>
  );
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/loading/
git commit -m "feat: add themed loading indicator components"
```

---

## Task 3: Rich Card Components

**Files:**
- Create: `src/components/chat/cards/GenericCard.tsx`
- Create: `src/components/chat/cards/OrderCard.tsx`
- Create: `src/components/chat/cards/ProductCard.tsx`
- Create: `src/components/chat/cards/CustomerCard.tsx`
- Create: `src/components/chat/cards/ToolResultRenderer.tsx`

- [ ] **Step 1: Create GenericCard**

```tsx
// src/components/chat/cards/GenericCard.tsx
'use client';

import { Box, Text } from '@bigcommerce/big-design';

interface GenericCardProps {
  data: Record<string, unknown>;
  maxEntries?: number;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return `${val.length} items`;
  return JSON.stringify(val);
}

export default function GenericCard({ data, maxEntries = 8 }: GenericCardProps) {
  const entries = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, maxEntries);

  if (entries.length === 0) return null;

  return (
    <Box
      style={{
        padding: '0.625rem 0.75rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        fontSize: '0.8125rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      {entries.map(([key, val]) => (
        <Box key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <Text style={{ color: '#6b7280', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
            {key.replace(/_/g, ' ')}
          </Text>
          <Text style={{ color: '#111827', fontSize: '0.8125rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {formatValue(val)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Create OrderCard**

```tsx
// src/components/chat/cards/OrderCard.tsx
'use client';

import { Box, Text } from '@bigcommerce/big-design';

interface OrderData {
  id?: number;
  status?: string;
  date_created?: string;
  total_inc_tax?: string;
  total_ex_tax?: string;
  items_total?: number;
  billing_address?: { first_name?: string; last_name?: string; email?: string };
  status_id?: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  shipped: { bg: '#DBEAFE', text: '#1E40AF' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  refunded: { bg: '#F3E8FF', text: '#6B21A8' },
  disputed: { bg: '#FEE2E2', text: '#991B1B' },
  awaiting_fulfillment: { bg: '#FEF3C7', text: '#92400E' },
  awaiting_shipment: { bg: '#FEF3C7', text: '#92400E' },
  awaiting_payment: { bg: '#FEF3C7', text: '#92400E' },
  partially_shipped: { bg: '#DBEAFE', text: '#1E40AF' },
};

function getStatusColor(status: string): { bg: string; text: string } {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLORS[key] || { bg: '#F3F4F6', text: '#374151' };
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function formatCurrency(amount: string | undefined): string {
  if (!amount) return '—';
  const num = parseFloat(amount);
  return isNaN(num) ? amount : `$${num.toFixed(2)}`;
}

export default function OrderCard({ order }: { order: OrderData }) {
  const statusColor = getStatusColor(order.status || '');
  const customerName = order.billing_address
    ? `${order.billing_address.first_name || ''} ${order.billing_address.last_name || ''}`.trim()
    : undefined;

  return (
    <Box
      style={{
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        minWidth: '200px',
      }}
    >
      <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
          #{order.id}
        </Text>
        {order.status && (
          <span
            style={{
              padding: '0.125rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.6875rem',
              fontWeight: 500,
              background: statusColor.bg,
              color: statusColor.text,
              textTransform: 'capitalize',
            }}
          >
            {order.status.replace(/_/g, ' ')}
          </span>
        )}
      </Box>

      <Box style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
        <Text style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
          {order.date_created ? formatDate(order.date_created) : ''}
        </Text>
        <Text style={{ color: '#111827', fontWeight: 600, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(order.total_inc_tax || order.total_ex_tax)}
        </Text>
      </Box>

      {(customerName || order.items_total) && (
        <Box style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9CA3AF' }}>
          {customerName && <span>{customerName}</span>}
          {order.items_total && <span>{order.items_total} item{order.items_total !== 1 ? 's' : ''}</span>}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Create ProductCard**

```tsx
// src/components/chat/cards/ProductCard.tsx
'use client';

import { Box, Text } from '@bigcommerce/big-design';

interface ProductData {
  id?: number;
  name?: string;
  price?: number;
  calculated_price?: number;
  sku?: string;
  inventory_level?: number;
  inventory_tracking?: string;
  is_visible?: boolean;
  availability?: string;
  images?: Array<{ url_thumbnail?: string; url_standard?: string; description?: string }>;
  primary_image?: { url_thumbnail?: string; url_standard?: string };
}

function getInventoryBadge(product: ProductData): { label: string; bg: string; text: string } | null {
  if (product.inventory_tracking === 'none') return null;
  const level = product.inventory_level ?? 0;
  if (level === 0) return { label: 'Out of stock', bg: '#FEE2E2', text: '#991B1B' };
  if (level <= 5) return { label: `${level} left`, bg: '#FEF3C7', text: '#92400E' };
  return { label: `${level} in stock`, bg: '#D1FAE5', text: '#065F46' };
}

function getThumbnail(product: ProductData): string | undefined {
  if (product.primary_image?.url_thumbnail) return product.primary_image.url_thumbnail;
  if (product.images?.[0]?.url_thumbnail) return product.images[0].url_thumbnail;
  return undefined;
}

export default function ProductCard({ product }: { product: ProductData }) {
  const thumbnail = getThumbnail(product);
  const price = product.calculated_price ?? product.price;
  const inventoryBadge = getInventoryBadge(product);

  return (
    <Box
      style={{
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        display: 'flex',
        gap: '0.75rem',
        minWidth: '200px',
      }}
    >
      {thumbnail && (
        <img
          src={thumbnail}
          alt={product.name || 'Product'}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '6px',
            objectFit: 'cover',
            flexShrink: 0,
            background: '#f3f4f6',
          }}
        />
      )}

      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
        <Text
          style={{
            fontWeight: 600,
            fontSize: '0.8125rem',
            color: '#111827',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {product.name || `Product #${product.id}`}
        </Text>

        <Box style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {price !== undefined && (
            <Text style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
              ${price.toFixed(2)}
            </Text>
          )}
          {product.sku && (
            <Text style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              SKU: {product.sku}
            </Text>
          )}
        </Box>

        <Box style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
          {inventoryBadge && (
            <span
              style={{
                padding: '0.0625rem 0.375rem',
                borderRadius: '999px',
                fontSize: '0.6875rem',
                fontWeight: 500,
                background: inventoryBadge.bg,
                color: inventoryBadge.text,
              }}
            >
              {inventoryBadge.label}
            </span>
          )}
          {product.is_visible === false && (
            <span
              style={{
                padding: '0.0625rem 0.375rem',
                borderRadius: '999px',
                fontSize: '0.6875rem',
                fontWeight: 500,
                background: '#F3F4F6',
                color: '#6B7280',
              }}
            >
              Hidden
            </span>
          )}
        </Box>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Create CustomerCard**

```tsx
// src/components/chat/cards/CustomerCard.tsx
'use client';

import { Box, Text } from '@bigcommerce/big-design';

interface CustomerData {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  orders_count?: number;
  total_spent?: string;
  date_created?: string;
  phone?: string;
  company?: string;
}

function formatCurrency(amount: string | undefined): string {
  if (!amount) return '—';
  const num = parseFloat(amount);
  return isNaN(num) ? amount : `$${num.toFixed(2)}`;
}

export default function CustomerCard({ customer }: { customer: CustomerData }) {
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

  return (
    <Box
      style={{
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        minWidth: '200px',
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Box
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#DBEAFE',
            color: '#1E40AF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {(customer.first_name?.[0] || '?').toUpperCase()}
        </Box>
        <Box style={{ minWidth: 0 }}>
          <Text style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827' }}>
            {name || `Customer #${customer.id}`}
          </Text>
          {customer.email && (
            <Text style={{ fontSize: '0.75rem', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customer.email}
            </Text>
          )}
        </Box>
      </Box>

      <Box style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#6b7280' }}>
        {customer.orders_count !== undefined && (
          <span>{customer.orders_count} order{customer.orders_count !== 1 ? 's' : ''}</span>
        )}
        {customer.total_spent && (
          <span>{formatCurrency(customer.total_spent)} spent</span>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 5: Create ToolResultRenderer**

```tsx
// src/components/chat/cards/ToolResultRenderer.tsx
'use client';

import type { ToolResultProps } from '@/lib/themes/types';
import OrderCard from './OrderCard';
import ProductCard from './ProductCard';
import CustomerCard from './CustomerCard';
import GenericCard from './GenericCard';
import { Box } from '@bigcommerce/big-design';

/**
 * Extracts an array of items from a BC API tool response.
 * BC V3 responses use { data: [...] }, V2 returns arrays directly.
 */
function extractItems(output: unknown): unknown[] {
  if (Array.isArray(output)) return output;
  if (output && typeof output === 'object' && 'data' in output) {
    const data = (output as { data: unknown }).data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data];
  }
  if (output && typeof output === 'object') return [output];
  return [];
}

const CARD_MAP: Record<string, (item: unknown) => React.ReactNode> = {
  get_orders: (item) => <OrderCard order={item as Record<string, unknown>} />,
  get_products: (item) => <ProductCard product={item as Record<string, unknown>} />,
  get_customers: (item) => <CustomerCard customer={item as Record<string, unknown>} />,
};

export function DashboardToolResult({ toolName, output }: ToolResultProps) {
  const items = extractItems(output);
  if (items.length === 0) return null;

  const renderCard = CARD_MAP[toolName];
  if (!renderCard) {
    return (
      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {items.slice(0, 10).map((item, i) => (
          <GenericCard key={i} data={item as Record<string, unknown>} />
        ))}
      </Box>
    );
  }

  return (
    <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {items.slice(0, 10).map((item, i) => (
        <Box key={i} style={{ flex: '1 1 240px', maxWidth: '360px' }}>
          {renderCard(item)}
        </Box>
      ))}
    </Box>
  );
}

export function DefaultToolResult({ toolName, output }: ToolResultProps) {
  const items = extractItems(output);
  if (items.length === 0) return null;

  return (
    <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {items.slice(0, 5).map((item, i) => (
        <GenericCard key={i} data={item as Record<string, unknown>} />
      ))}
    </Box>
  );
}
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/cards/
git commit -m "feat: add rich card components for themed tool results"
```

---

## Task 4: Theme Definitions

**Files:**
- Create: `src/lib/themes/bc-native.ts`
- Create: `src/lib/themes/ai-assistant.ts`
- Create: `src/lib/themes/dashboard.ts`
- Create: `src/lib/themes/index.ts`

- [ ] **Step 1: Create BC-Native theme**

```typescript
// src/lib/themes/bc-native.ts
import type { ThemeConfig } from './types';
import PulseDot from '@/components/chat/loading/PulseDot';
import { DefaultToolResult } from '@/components/chat/cards/ToolResultRenderer';

export const bcNativeTheme: ThemeConfig = {
  id: 'bc-native',
  name: 'BigCommerce',
  description: 'Clean, professional look that matches BigCommerce admin',
  tokens: {
    colors: {
      primary: '#3C64F4',
      primaryHover: '#2B4FD4',
      surface: '#f0f1f5',
      surfaceRaised: '#fff',
      background: '#fff',
      text: { primary: '#313440', secondary: '#525566', muted: '#8b8fa3' },
      border: { default: '#d9dce9', subtle: '#e8e9ef' },
      accent: '#3C64F4',
      success: '#16a34a',
      error: '#dc2626',
      userBubble: { bg: '#3C64F4', text: '#fff' },
      assistantBubble: { bg: '#f0f1f5', text: '#313440' },
      code: { bg: '#1e1e2e', text: '#cdd6f4' },
    },
    typography: {
      fontFamily: 'inherit',
      fontSize: { xs: '0.6875rem', sm: '0.75rem', base: '0.875rem', lg: '1rem', xl: '1.25rem' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
      lineHeight: { tight: '1.25', normal: '1.5', relaxed: '1.625' },
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' },
    radius: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      full: '999px',
      userBubble: '1rem 1rem 0.25rem 1rem',
      assistantBubble: '1rem 1rem 1rem 0.25rem',
    },
    shadows: {
      sm: 'none',
      md: 'none',
      lg: 'none',
    },
    transitions: { fast: '0.15s', normal: '0.2s' },
  },
  layout: {
    contentMaxWidth: '100%',
    contentAlign: 'stretch',
    sidebarWidth: '260px',
    sidebarExpandable: false,
    sidebarStyle: 'panel',
    toolResultPosition: 'inline',
  },
  components: {
    toolResultRenderer: DefaultToolResult,
    loadingIndicator: PulseDot,
  },
};
```

- [ ] **Step 2: Create AI Assistant theme**

```typescript
// src/lib/themes/ai-assistant.ts
import type { ThemeConfig } from './types';
import TypingDots from '@/components/chat/loading/TypingDots';
import { DefaultToolResult } from '@/components/chat/cards/ToolResultRenderer';

export const aiAssistantTheme: ThemeConfig = {
  id: 'ai-assistant',
  name: 'AI Assistant',
  description: 'Modern, spacious chat inspired by leading AI interfaces',
  tokens: {
    colors: {
      primary: '#6B7280',
      primaryHover: '#4B5563',
      surface: '#fafafa',
      surfaceRaised: '#fff',
      background: '#fafafa',
      text: { primary: '#111827', secondary: '#4B5563', muted: '#9CA3AF' },
      border: { default: '#E5E7EB', subtle: '#F3F4F6' },
      accent: '#6B7280',
      success: '#059669',
      error: '#DC2626',
      userBubble: { bg: 'transparent', text: '#111827', border: '#E5E7EB' },
      assistantBubble: { bg: 'transparent', text: '#111827' },
      code: { bg: '#1F2937', text: '#E5E7EB' },
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: { xs: '0.75rem', sm: '0.8125rem', base: '0.9375rem', lg: '1.0625rem', xl: '1.25rem' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
      lineHeight: { tight: '1.4', normal: '1.7', relaxed: '1.8' },
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
    radius: {
      sm: '4px',
      md: '8px',
      lg: '12px',
      full: '999px',
      userBubble: '1.25rem',
      assistantBubble: '0',
    },
    shadows: {
      sm: 'none',
      md: 'none',
      lg: 'none',
    },
    transitions: { fast: '0.1s', normal: '0.2s' },
  },
  layout: {
    contentMaxWidth: '720px',
    contentAlign: 'center',
    sidebarWidth: '300px',
    sidebarExpandable: false,
    sidebarStyle: 'drawer',
    toolResultPosition: 'inline',
  },
  components: {
    toolResultRenderer: DefaultToolResult,
    loadingIndicator: TypingDots,
  },
};
```

- [ ] **Step 3: Create Dashboard theme**

```typescript
// src/lib/themes/dashboard.ts
import type { ThemeConfig } from './types';
import SkeletonCards from '@/components/chat/loading/SkeletonCards';
import { DashboardToolResult } from '@/components/chat/cards/ToolResultRenderer';

export const dashboardTheme: ThemeConfig = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Data-forward command center with rich cards',
  tokens: {
    colors: {
      primary: '#2B4FD4',
      primaryHover: '#1E3FAF',
      surface: '#f5f6f8',
      surfaceRaised: '#fff',
      background: '#f5f6f8',
      text: { primary: '#111827', secondary: '#4B5563', muted: '#9CA3AF' },
      border: { default: '#E5E7EB', subtle: '#F3F4F6' },
      accent: '#2B4FD4',
      success: '#059669',
      error: '#DC2626',
      userBubble: { bg: '#EEF2FF', text: '#1E3A5F' },
      assistantBubble: { bg: 'transparent', text: '#111827' },
      code: { bg: '#1F2937', text: '#E5E7EB' },
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: { xs: '0.6875rem', sm: '0.75rem', base: '0.8125rem', lg: '0.9375rem', xl: '1.125rem' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
      lineHeight: { tight: '1.25', normal: '1.5', relaxed: '1.625' },
    },
    spacing: { xs: '0.25rem', sm: '0.375rem', md: '0.625rem', lg: '0.875rem', xl: '1.25rem' },
    radius: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      full: '999px',
      userBubble: '0.75rem',
      assistantBubble: '0',
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.05)',
      md: '0 1px 3px rgba(0,0,0,0.1)',
      lg: '0 4px 6px rgba(0,0,0,0.1)',
    },
    transitions: { fast: '0.1s', normal: '0.2s' },
  },
  layout: {
    contentMaxWidth: '900px',
    contentAlign: 'center',
    sidebarWidth: '48px',
    sidebarExpandable: true,
    sidebarStyle: 'rail',
    toolResultPosition: 'grid-below',
  },
  components: {
    toolResultRenderer: DashboardToolResult,
    loadingIndicator: SkeletonCards,
  },
};
```

- [ ] **Step 4: Create theme registry**

```typescript
// src/lib/themes/index.ts
import type { ThemeConfig, ThemeId } from './types';
import { bcNativeTheme } from './bc-native';
import { aiAssistantTheme } from './ai-assistant';
import { dashboardTheme } from './dashboard';

export type { ThemeConfig, ThemeId, ThemeTokens, ThemeLayout, ThemeComponents, ToolResultProps } from './types';

export const themes: Record<ThemeId, ThemeConfig> = {
  'bc-native': bcNativeTheme,
  'ai-assistant': aiAssistantTheme,
  dashboard: dashboardTheme,
};

export const themeList: ThemeConfig[] = Object.values(themes);

export const DEFAULT_THEME_ID: ThemeId = 'bc-native';

export function getTheme(id: ThemeId): ThemeConfig {
  return themes[id] ?? themes[DEFAULT_THEME_ID];
}

export function isValidThemeId(id: string): id is ThemeId {
  return id in themes;
}
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/themes/
git commit -m "feat: add three theme definitions (bc-native, ai-assistant, dashboard)"
```

---

## Task 5: Theme Persistence (IndexedDB + API Route)

**Files:**
- Create: `src/lib/theme-storage.ts`
- Create: `src/app/stores/[storeHash]/api/theme/route.ts`

- [ ] **Step 1: Create IndexedDB theme storage**

```typescript
// src/lib/theme-storage.ts
import type { ThemeId } from './themes/types';
import { isValidThemeId } from './themes';

const DB_NAME = 'ask-bc-settings';
const DB_VERSION = 1;
const STORE_NAME = 'preferences';
const THEME_KEY = 'theme-preference';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getThemePreference(): Promise<ThemeId | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(THEME_KEY);
      request.onsuccess = () => {
        const val = request.result;
        resolve(typeof val === 'string' && isValidThemeId(val) ? val : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function setThemePreference(themeId: ThemeId): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(themeId, THEME_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 2: Create theme API route**

```typescript
// src/app/stores/[storeHash]/api/theme/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/bigcommerce/auth';
import { getRedis } from '@/lib/redis';
import { isValidThemeId, DEFAULT_THEME_ID } from '@/lib/themes';
import type { ThemeId } from '@/lib/themes';

const THEME_KEY_PREFIX = 'ask-bc:theme:';

function themeKey(storeHash: string) {
  return `${THEME_KEY_PREFIX}${storeHash}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  try {
    await authorize(storeHash);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  let theme: ThemeId = DEFAULT_THEME_ID;

  if (redis) {
    const stored = await redis.get<string>(themeKey(storeHash));
    if (stored && isValidThemeId(stored)) {
      theme = stored;
    }
  }

  return NextResponse.json({ theme });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeHash: string }> },
) {
  const { storeHash } = await params;

  try {
    await authorize(storeHash);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { theme?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.theme || !isValidThemeId(body.theme)) {
    return NextResponse.json({ error: 'Invalid theme. Valid: bc-native, ai-assistant, dashboard' }, { status: 400 });
  }

  const redis = getRedis();
  if (redis) {
    await redis.set(themeKey(storeHash), body.theme);
  }

  return NextResponse.json({ theme: body.theme });
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/theme-storage.ts src/app/stores/\[storeHash\]/api/theme/route.ts
git commit -m "feat: add theme persistence (IndexedDB + Redis API route)"
```

---

## Task 6: Theme Context Provider

**Files:**
- Create: `src/components/chat/ThemeContext.tsx`

- [ ] **Step 1: Create ThemeContext with provider and hook**

```tsx
// src/components/chat/ThemeContext.tsx
'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ThemeConfig, ThemeId } from '@/lib/themes/types';
import { getTheme, DEFAULT_THEME_ID } from '@/lib/themes';
import { getThemePreference, setThemePreference } from '@/lib/theme-storage';

interface ThemeContextValue {
  theme: ThemeConfig;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  storeHash: string;
  children: ReactNode;
}

export function ChatThemeProvider({ storeHash, children }: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);

  // Load theme on mount: fetch store default, then check for merchant override
  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      // 1. Fetch store default from API
      let storeDefault: ThemeId = DEFAULT_THEME_ID;
      try {
        const res = await fetch(`/stores/${storeHash}/api/theme`);
        if (res.ok) {
          const data = await res.json();
          if (data.theme) storeDefault = data.theme;
        }
      } catch { /* use default */ }

      // 2. Check IndexedDB for merchant override
      let merchantOverride: ThemeId | null = null;
      try {
        merchantOverride = await getThemePreference();
      } catch { /* no override */ }

      if (!cancelled) {
        setThemeIdState(merchantOverride ?? storeDefault);
      }
    }

    loadTheme();
    return () => { cancelled = true; };
  }, [storeHash]);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    setThemePreference(id).catch(() => {});
  }, []);

  const value: ThemeContextValue = {
    theme: getTheme(themeId),
    themeId,
    setThemeId,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for components rendered outside provider (shouldn't happen, but safe)
    return {
      theme: getTheme(DEFAULT_THEME_ID),
      themeId: DEFAULT_THEME_ID,
      setThemeId: () => {},
    };
  }
  return ctx;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ThemeContext.tsx
git commit -m "feat: add ChatThemeProvider and useTheme hook"
```

---

## Task 7: Theme Selector Component

**Files:**
- Create: `src/components/chat/ThemeSelector.tsx`

- [ ] **Step 1: Create ThemeSelector dropdown**

```tsx
// src/components/chat/ThemeSelector.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Box, Text } from '@bigcommerce/big-design';
import { SettingsIcon, CheckIcon } from '@bigcommerce/big-design-icons';
import { useTheme } from './ThemeContext';
import { themeList } from '@/lib/themes';
import type { ThemeId } from '@/lib/themes/types';

export default function ThemeSelector() {
  const { themeId, setThemeId } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <Box ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.375rem',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          color: '#8b8fa3',
        }}
        title="Change theme"
      >
        <SettingsIcon style={{ width: '20px', height: '20px' }} />
      </button>

      {open && (
        <Box
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.25rem',
            width: '220px',
            background: '#fff',
            border: '1px solid #d9dce9',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          <Box style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e8e9ef' }}>
            <Text style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
              Theme
            </Text>
          </Box>
          {themeList.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setThemeId(t.id as ThemeId);
                setOpen(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: t.id === themeId ? '#f3f4f6' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.8125rem',
              }}
            >
              <Box style={{ flex: 1 }}>
                <Text style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#111827' }}>
                  {t.name}
                </Text>
                <Text style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>
                  {t.description}
                </Text>
              </Box>
              {t.id === themeId && (
                <CheckIcon style={{ width: '16px', height: '16px', color: '#3C64F4', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ThemeSelector.tsx
git commit -m "feat: add ThemeSelector dropdown component"
```

---

## Task 8: Wire Theme into ChatPage

**Files:**
- Modify: `src/components/chat/ChatPage.tsx`

This is the main integration point. Wrap the page with `ChatThemeProvider`, add the `ThemeSelector` to the header, and implement the three sidebar variants (panel, drawer, rail).

- [ ] **Step 1: Update ChatPage imports and add ThemeProvider + ThemeSelector**

Replace the full `ChatPage.tsx` content with the themed version. Key changes:
- Wrap return in `ChatThemeProvider`
- Add `ThemeSelector` to header
- Use `useTheme` for layout decisions
- Three sidebar modes: panel (current), drawer (overlay), rail (icon strip)

```tsx
// src/components/chat/ChatPage.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { Box, H1, Button, Text, Flex, FlexItem } from '@bigcommerce/big-design';
import { AddIcon, RestoreIcon, DeleteIcon, CloseIcon } from '@bigcommerce/big-design-icons';
import ChatPanel from './ChatPanel';
import ThemeSelector from './ThemeSelector';
import { ChatThemeProvider, useTheme } from './ThemeContext';
import {
  getSession,
  listSessions,
  deleteSession,
  deserializeMessages,
  type ChatSession,
} from '@/lib/chat-storage';

export interface ChatContext {
  type: 'order' | 'product' | 'section';
  id: string;
}

interface ChatPageProps {
  storeHash: string;
  context?: ChatContext;
}

function getStarterPrompts(context?: ChatContext): string[] {
  if (context?.type === 'order') {
    return [
      `What's the status of order #${context.id}?`,
      `What products are in order #${context.id}?`,
      `Is there anything unusual about order #${context.id}?`,
    ];
  }
  if (context?.type === 'product') {
    return [
      `Give me a summary of product #${context.id}`,
      `Is product #${context.id} visible on the storefront?`,
      `What category is product #${context.id} in?`,
    ];
  }
  return [
    'Give me a summary of my store',
    'Show me recent orders',
    'Do I have any active promotions?',
  ];
}

function getTitle(context?: ChatContext): string {
  if (context?.type === 'order') return `Order #${context.id}`;
  if (context?.type === 'product') return `Product #${context.id}`;
  return 'Ask BC';
}

function generateSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ChatPageInner({ storeHash, context }: ChatPageProps) {
  const { theme } = useTheme();
  const { tokens, layout } = theme;

  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [restoredMessages, setRestoredMessages] = useState<UIMessage[] | undefined>();
  const [railHovered, setRailHovered] = useState(false);
  const isPanel = !!context;

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions(storeHash);
      setSessions(list);
    } catch { /* IndexedDB not available */ }
  }, [storeHash]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleNewConversation = () => {
    setSessionId(generateSessionId());
    setRestoredMessages(undefined);
  };

  const handleLoadSession = async (id: string) => {
    const session = await getSession(id);
    if (session) {
      setRestoredMessages(deserializeMessages(session.messages));
      setSessionId(session.id);
      setShowHistory(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (id === sessionId) {
      handleNewConversation();
    }
    refreshSessions();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Sidebar content shared across modes
  const sidebarContent = (
    <>
      <Box style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
        {sessions.length === 0 && (
          <Text color="secondary60" style={{ fontSize: '0.8125rem', padding: '0.5rem', textAlign: 'center' }}>
            No past conversations.
          </Text>
        )}
        {sessions.map((s) => (
          <Box
            key={s.id}
            style={{
              padding: '0.5rem 0.625rem',
              borderRadius: tokens.radius.md,
              cursor: 'pointer',
              background: s.id === sessionId ? tokens.colors.surface : 'transparent',
              marginBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.375rem',
            }}
            onClick={() => handleLoadSession(s.id)}
          >
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: '0.8125rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                }}
              >
                {s.title}
              </Text>
              <Text color="secondary60" style={{ fontSize: '0.6875rem' }}>
                {formatTime(s.updatedAt)}
              </Text>
            </Box>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSession(s.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem',
                borderRadius: '4px',
                color: tokens.colors.text.muted,
                display: 'flex',
                opacity: 0.5,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.5'; }}
              title="Delete conversation"
            >
              <DeleteIcon style={{ width: '14px', height: '14px' }} />
            </button>
          </Box>
        ))}
      </Box>
    </>
  );

  const sidebarHeader = (
    <Box
      padding="small"
      style={{
        borderBottom: `1px solid ${tokens.colors.border.default}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Chat History</Text>
      <Button
        variant="subtle"
        iconOnly={<CloseIcon />}
        onClick={() => setShowHistory(false)}
      />
    </Box>
  );

  // Render sidebar based on layout.sidebarStyle
  const renderSidebar = () => {
    if (isPanel || !showHistory) {
      // Rail mode: show collapsed icon strip even when history is "closed"
      if (!isPanel && layout.sidebarStyle === 'rail') {
        return (
          <FlexItem
            onMouseEnter={() => setRailHovered(true)}
            onMouseLeave={() => setRailHovered(false)}
            style={{
              width: railHovered ? '260px' : layout.sidebarWidth,
              borderRight: `1px solid ${tokens.colors.border.default}`,
              display: 'flex',
              flexDirection: 'column',
              background: tokens.colors.surface,
              transition: `width ${tokens.transitions.normal}`,
              overflow: 'hidden',
            }}
          >
            <Box padding="small" style={{ borderBottom: `1px solid ${tokens.colors.border.default}`, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="subtle"
                iconOnly={<RestoreIcon />}
                onClick={() => setShowHistory(true)}
                title="Chat history"
              />
            </Box>
            {railHovered && sidebarContent}
          </FlexItem>
        );
      }
      return null;
    }

    // Drawer mode: overlay
    if (layout.sidebarStyle === 'drawer') {
      return (
        <>
          {/* Backdrop */}
          <Box
            onClick={() => setShowHistory(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.2)',
              zIndex: 99,
            }}
          />
          <Box
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              bottom: 0,
              width: layout.sidebarWidth,
              background: tokens.colors.surfaceRaised,
              borderRight: `1px solid ${tokens.colors.border.default}`,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: tokens.shadows.lg || '0 4px 12px rgba(0,0,0,0.1)',
            }}
          >
            {sidebarHeader}
            {sidebarContent}
          </Box>
        </>
      );
    }

    // Panel mode (default): inline sidebar
    return (
      <FlexItem
        style={{
          width: layout.sidebarWidth,
          borderRight: `1px solid ${tokens.colors.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          background: tokens.colors.surface,
        }}
      >
        {sidebarHeader}
        {sidebarContent}
      </FlexItem>
    );
  };

  return (
    <Flex style={{ height: '100vh', overflow: 'hidden', background: tokens.colors.background }}>
      {renderSidebar()}

      {/* Main chat area */}
      <FlexItem
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          padding={isPanel ? 'small' : 'medium'}
          style={{
            borderBottom: `1px solid ${tokens.colors.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: tokens.colors.surfaceRaised,
          }}
        >
          <Flex alignItems="center" style={{ gap: '0.5rem' }}>
            {!isPanel && layout.sidebarStyle !== 'rail' && (
              <Button
                variant="subtle"
                iconOnly={<RestoreIcon />}
                onClick={() => setShowHistory(!showHistory)}
                title="Chat history"
              />
            )}
            <H1 style={{ margin: 0, fontSize: isPanel ? '1rem' : tokens.typography.fontSize.xl }}>
              {getTitle(context)}
            </H1>
          </Flex>
          <Flex alignItems="center" style={{ gap: '0.25rem' }}>
            {!isPanel && <ThemeSelector />}
            {!isPanel && (
              <Button
                variant="secondary"
                onClick={handleNewConversation}
                iconLeft={<AddIcon />}
              >
                New Chat
              </Button>
            )}
          </Flex>
        </Box>

        {/* ChatPanel remounts on sessionId change via key */}
        <ChatPanel
          key={sessionId}
          sessionId={sessionId}
          storeHash={storeHash}
          context={context}
          restoredMessages={restoredMessages}
          starterPrompts={getStarterPrompts(context)}
          onSessionSaved={refreshSessions}
        />
      </FlexItem>
    </Flex>
  );
}

export default function ChatPage({ storeHash, context }: ChatPageProps) {
  return (
    <ChatThemeProvider storeHash={storeHash}>
      <ChatPageInner storeHash={storeHash} context={context} />
    </ChatThemeProvider>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatPage.tsx
git commit -m "feat: wire ThemeProvider, ThemeSelector, and sidebar variants into ChatPage"
```

---

## Task 9: Theme ChatPanel

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Update ChatPanel to use theme tokens**

Replace the full `ChatPanel.tsx`. Key changes:
- Use `useTheme` for styling tokens and layout
- Content area respects `contentMaxWidth` and `contentAlign`
- Starter prompts styled with theme tokens

```tsx
// src/components/chat/ChatPanel.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { Box, Text } from '@bigcommerce/big-design';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useTheme } from './ThemeContext';
import {
  saveSession,
  serializeMessages,
  titleFromStoredMessages,
} from '@/lib/chat-storage';
import type { ChatContext } from './ChatPage';

interface ChatPanelProps {
  sessionId: string;
  storeHash: string;
  context?: ChatContext;
  restoredMessages?: UIMessage[];
  starterPrompts: string[];
  onSessionSaved: () => void;
}

export default function ChatPanel({
  sessionId,
  storeHash,
  context,
  restoredMessages,
  starterPrompts,
  onSessionSaved,
}: ChatPanelProps) {
  const { theme } = useTheme();
  const { tokens, layout } = theme;
  const prevCountRef = useRef(0);
  const hasRestored = useRef(false);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: `/stores/${storeHash}/api/chat`,
      body: context ? { context } : undefined,
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Restore messages on mount
  useEffect(() => {
    if (restoredMessages && restoredMessages.length > 0 && !hasRestored.current) {
      hasRestored.current = true;
      setMessages(restoredMessages);
      prevCountRef.current = restoredMessages.length;
    }
  }, [restoredMessages, setMessages]);

  // Auto-save when message count changes (not on every render)
  useEffect(() => {
    if (messages.length === 0 || messages.length === prevCountRef.current) return;
    if (isLoading) return;

    prevCountRef.current = messages.length;
    const stored = serializeMessages(messages);
    if (stored.length === 0) return;

    saveSession({
      id: sessionId,
      storeHash,
      title: titleFromStoredMessages(stored),
      messages: stored,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).then(() => onSessionSaved()).catch(() => {});
  }, [messages, isLoading, sessionId, storeHash, onSessionSaved]);

  const handleSend = (text: string) => {
    sendMessage({ text });
  };

  const contentStyle: React.CSSProperties = layout.contentAlign === 'center'
    ? { maxWidth: layout.contentMaxWidth, margin: '0 auto', width: '100%' }
    : {};

  return (
    <>
      {messages.length === 0 && !isLoading && (
        <Box
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: tokens.spacing.lg,
            background: tokens.colors.background,
          }}
        >
          <Box style={{ maxWidth: '400px', width: '100%', textAlign: 'center', ...contentStyle }}>
            <Text color="secondary60" style={{ marginBottom: tokens.spacing.lg }}>
              {context
                ? `Ask anything about this ${context.type}.`
                : 'Ask a question about your store to get started.'}
            </Text>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.sm }}>
              {starterPrompts.map((prompt) => (
                <Box
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: `1px solid ${tokens.colors.border.default}`,
                    borderRadius: tokens.radius.md,
                    cursor: 'pointer',
                    fontSize: tokens.typography.fontSize.base,
                    color: tokens.colors.text.secondary,
                    textAlign: 'left',
                    background: tokens.colors.surfaceRaised,
                    transition: `border-color ${tokens.transitions.fast}`,
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = tokens.colors.primary;
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = tokens.colors.border.default;
                  }}
                >
                  {prompt}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {(messages.length > 0 || isLoading) && (
        <MessageList messages={messages} isLoading={isLoading} onFollowUp={handleSend} />
      )}

      <Box style={contentStyle}>
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          placeholder={context ? `Ask about this ${context.type}...` : 'Ask about your store...'}
        />
      </Box>
    </>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatPanel.tsx
git commit -m "feat: theme ChatPanel with tokens and layout alignment"
```

---

## Task 10: Theme ChatInput

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Update ChatInput to use theme tokens**

```tsx
// src/components/chat/ChatInput.tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { Box, Button, Flex, FlexItem } from '@bigcommerce/big-design';
import { SendIcon } from '@bigcommerce/big-design-icons';
import { useTheme } from './ThemeContext';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const { theme } = useTheme();
  const { tokens } = theme;
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  return (
    <Box
      padding="small"
      style={{
        borderTop: `1px solid ${tokens.colors.border.default}`,
        background: tokens.colors.surfaceRaised,
      }}
    >
      <Flex alignItems="flex-end" style={{ gap: '0.5rem' }}>
        <FlexItem flexGrow={1}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder || 'Ask about your store...'}
            disabled={disabled}
            rows={1}
            style={{
              width: '100%',
              resize: 'none',
              border: `1px solid ${tokens.colors.border.default}`,
              borderRadius: tokens.radius.md,
              padding: '0.625rem 0.75rem',
              fontSize: tokens.typography.fontSize.base,
              lineHeight: tokens.typography.lineHeight.normal,
              fontFamily: tokens.typography.fontFamily,
              outline: 'none',
              maxHeight: '200px',
              overflow: 'auto',
              boxSizing: 'border-box',
              transition: `border-color ${tokens.transitions.fast}`,
              background: tokens.colors.surfaceRaised,
              color: tokens.colors.text.primary,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = tokens.colors.border.default; }}
          />
        </FlexItem>
        <FlexItem>
          <Button
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            iconOnly={<SendIcon />}
            variant="primary"
          />
        </FlexItem>
      </Flex>
    </Box>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "feat: theme ChatInput with tokens"
```

---

## Task 11: Theme MessageList

**Files:**
- Modify: `src/components/chat/MessageList.tsx`

- [ ] **Step 1: Update MessageList to use theme loading indicator and tokens**

```tsx
// src/components/chat/MessageList.tsx
'use client';

import { useEffect, useRef } from 'react';
import { Box, Text } from '@bigcommerce/big-design';
import type { UIMessage } from 'ai';
import MessageBubble from './MessageBubble';
import { useTheme } from './ThemeContext';

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
  onFollowUp?: (text: string) => void;
}

export default function MessageList({ messages, isLoading, onFollowUp }: MessageListProps) {
  const { theme } = useTheme();
  const { tokens, layout } = theme;
  const LoadingIndicator = theme.components.loadingIndicator;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const contentStyle: React.CSSProperties = layout.contentAlign === 'center'
    ? { maxWidth: layout.contentMaxWidth, margin: '0 auto', width: '100%' }
    : {};

  return (
    <Box
      style={{
        flex: 1,
        overflow: 'auto',
        padding: tokens.spacing.lg,
        background: tokens.colors.background,
      }}
    >
      <Box style={contentStyle}>
        {messages.length === 0 && !isLoading && (
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Text style={{ color: tokens.colors.text.muted }}>
              Ask a question about your store to get started.
            </Text>
          </Box>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLatest={i === messages.length - 1 && !isLoading}
            onFollowUp={onFollowUp}
          />
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <LoadingIndicator />
        )}
        <div ref={bottomRef} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/MessageList.tsx
git commit -m "feat: theme MessageList with tokens and dynamic loading indicator"
```

---

## Task 12: Theme MessageBubble

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx`

This is the most complex change. Key updates:
- All hardcoded colors replaced with theme tokens
- Tool results delegated to the theme's `toolResultRenderer` component
- Tool result position respects `layout.toolResultPosition`

- [ ] **Step 1: Update MessageBubble to use theme**

```tsx
// src/components/chat/MessageBubble.tsx
'use client';

import { useState, type ReactElement } from 'react';
import { Box, Text } from '@bigcommerce/big-design';
import {
  StoreIcon,
  ProductsIcon,
  ReceiptIcon,
  PublicIcon,
  FolderIcon,
  SearchIcon,
  SettingsIcon,
  LanguageIcon,
  AssignmentIcon,
  ContentCopyIcon,
  CheckCircleIcon,
  ThumbUpAltIcon,
  ThumbUpOffAltIcon,
  ThumbDownAltIcon,
  ThumbDownOffAltIcon,
  ExpandMoreIcon,
  AutoAwesomeIcon,
  InsertChartIcon,
  BaselineHelpIcon,
} from '@bigcommerce/big-design-icons';
import type { UIMessage } from 'ai';
import ChatMarkdown from './ChatMarkdown';
import { useTheme } from './ThemeContext';

interface MessageBubbleProps {
  message: UIMessage;
  onFollowUp?: (text: string) => void;
  isLatest?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  get_store_info: 'store info',
  get_products: 'products',
  get_orders: 'orders',
  get_customers: 'customers',
  get_promotions: 'promotions',
  get_coupons: 'coupons',
  get_categories: 'categories',
  get_channels: 'channels',
  get_order_products: 'order items',
  get_product_variants: 'product variants',
  get_order_shipping_addresses: 'shipping addresses',
  get_shipping_zones: 'shipping zones',
  get_tax_settings: 'tax settings',
  get_inventory: 'inventory levels',
  search_documentation: 'help docs',
};

const iconStyle = { fontSize: '1rem', width: '16px', height: '16px' };

const TOOL_ICONS: Record<string, ReactElement> = {
  get_store_info: <StoreIcon style={iconStyle} />,
  get_products: <ProductsIcon style={iconStyle} />,
  get_orders: <ReceiptIcon style={iconStyle} />,
  get_customers: <PublicIcon style={iconStyle} />,
  get_promotions: <AutoAwesomeIcon style={iconStyle} />,
  get_coupons: <AutoAwesomeIcon style={iconStyle} />,
  get_categories: <FolderIcon style={iconStyle} />,
  get_channels: <LanguageIcon style={iconStyle} />,
  get_order_products: <AssignmentIcon style={iconStyle} />,
  get_product_variants: <ProductsIcon style={iconStyle} />,
  get_order_shipping_addresses: <PublicIcon style={iconStyle} />,
  get_shipping_zones: <PublicIcon style={iconStyle} />,
  get_tax_settings: <SettingsIcon style={iconStyle} />,
  get_inventory: <InsertChartIcon style={iconStyle} />,
  search_documentation: <BaselineHelpIcon style={iconStyle} />,
};

interface ToolCallInfo {
  name: string;
  state: string;
  output?: unknown;
}

function generateFollowUps(text: string): string[] {
  const lower = text.toLowerCase();
  const suggestions: string[] = [];

  if (lower.includes('order') && text.match(/#(\d+)/)) {
    const orderMatch = text.match(/#(\d+)/);
    suggestions.push(`What products are in order #${orderMatch![1]}?`);
    suggestions.push(`Where is order #${orderMatch![1]} being shipped?`);
  }
  if (lower.includes('product') && (lower.includes('$') || lower.includes('price') || lower.includes('catalog'))) {
    suggestions.push('Which products are low on inventory?');
    suggestions.push('Show me products not visible on the storefront');
  }
  if (lower.includes('promotion') || lower.includes('coupon') || lower.includes('discount')) {
    suggestions.push('Are any of these expired or inactive?');
    suggestions.push('How do I create a new promotion?');
  }
  if (lower.includes('shipping') || lower.includes('delivery')) {
    suggestions.push('How do I set up free shipping?');
  }
  if (lower.includes('customer')) {
    suggestions.push('Who are my most recent customers?');
  }

  if (suggestions.length === 0) {
    if (lower.includes('store') || lower.includes('domain') || lower.includes('plan')) {
      suggestions.push('Show me recent orders');
      suggestions.push('Do I have any active promotions?');
      suggestions.push('How is my shipping configured?');
    } else {
      suggestions.push('Tell me more');
      suggestions.push('Show me recent orders');
      suggestions.push('Do I have any active promotions?');
    }
  }

  return suggestions.slice(0, 3);
}

export default function MessageBubble({ message, onFollowUp, isLatest }: MessageBubbleProps) {
  const { theme } = useTheme();
  const { tokens, layout } = theme;
  const ToolResultRenderer = theme.components.toolResultRenderer;

  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showTools, setShowTools] = useState(false);

  const toolCalls: ToolCallInfo[] = [];
  const textParts: string[] = [];

  for (const part of message.parts || []) {
    if (part.type === 'text' && part.text.trim()) {
      textParts.push(part.text);
    } else if (part.type.startsWith('tool-')) {
      const toolName = part.type.replace(/^tool-/, '');
      const toolPart = part as { type: string; state: string; output?: unknown };
      toolCalls.push({ name: toolName, state: toolPart.state, output: toolPart.output });
    }
  }

  const text = textParts.join('');
  if (!text && toolCalls.length === 0) return null;

  const completedTools = toolCalls.filter((t) => t.state === 'output-available');
  const pendingTools = toolCalls.filter((t) => t.state !== 'output-available');
  const followUps = isLatest && !isUser && text ? generateFollowUps(text) : [];

  // Tools that have output data for rich rendering
  const toolsWithOutput = completedTools.filter((t) => t.output);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine bubble styles based on theme
  const bubbleStyle: React.CSSProperties = isUser
    ? {
        maxWidth: '85%',
        padding: '0.75rem 1rem',
        borderRadius: tokens.radius.userBubble,
        background: tokens.colors.userBubble.bg,
        color: tokens.colors.userBubble.text,
        fontSize: tokens.typography.fontSize.base,
        lineHeight: tokens.typography.lineHeight.normal,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        ...(tokens.colors.userBubble.border ? { border: `1px solid ${tokens.colors.userBubble.border}` } : {}),
      }
    : {
        maxWidth: '85%',
        padding: tokens.colors.assistantBubble.bg === 'transparent' ? '0.25rem 0' : '0.75rem 1rem',
        borderRadius: tokens.radius.assistantBubble,
        background: tokens.colors.assistantBubble.bg,
        color: tokens.colors.assistantBubble.text,
        fontSize: tokens.typography.fontSize.base,
        lineHeight: tokens.typography.lineHeight.normal,
        wordBreak: 'break-word',
        ...(tokens.colors.assistantBubble.border ? { border: `1px solid ${tokens.colors.assistantBubble.border}` } : {}),
      };

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: tokens.spacing.lg,
      }}
    >
      {/* Pending tool calls */}
      {pendingTools.length > 0 && (
        <Box style={{ marginBottom: tokens.spacing.sm, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {pendingTools.map((tc, i) => (
            <Box
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: tokens.typography.fontSize.sm,
                color: tokens.colors.text.muted,
              }}
            >
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: tokens.colors.primary,
                animation: 'askbc-pulse 1.5s ease-in-out infinite',
              }} />
              <span style={{ display: 'flex', alignItems: 'center', color: tokens.colors.text.muted }}>
                {TOOL_ICONS[tc.name] || <SearchIcon style={iconStyle} />}
              </span>
              Looking up {TOOL_LABELS[tc.name] || tc.name}...
              <style>{`@keyframes askbc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            </Box>
          ))}
        </Box>
      )}

      {/* Completed tool calls — collapsible summary */}
      {completedTools.length > 0 && layout.toolResultPosition === 'inline' && (
        <Box
          onClick={() => setShowTools(!showTools)}
          style={{
            marginBottom: tokens.spacing.sm,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: tokens.typography.fontSize.sm,
            color: tokens.colors.text.muted,
            userSelect: 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', transition: `transform ${tokens.transitions.fast}`, transform: showTools ? 'rotate(0)' : 'rotate(-90deg)' }}>
            <ExpandMoreIcon style={{ width: '14px', height: '14px' }} />
          </span>
          Used {completedTools.length} tool{completedTools.length > 1 ? 's' : ''}
        </Box>
      )}
      {showTools && completedTools.length > 0 && layout.toolResultPosition === 'inline' && (
        <Box style={{
          marginBottom: tokens.spacing.sm,
          padding: '0.375rem 0.5rem',
          background: tokens.colors.surface,
          borderRadius: tokens.radius.md,
          border: `1px solid ${tokens.colors.border.subtle}`,
          fontSize: tokens.typography.fontSize.sm,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
        }}>
          {completedTools.map((tc, i) => (
            <Box key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: tokens.colors.text.muted }}>
              <span style={{ display: 'flex', alignItems: 'center', color: tokens.colors.text.muted }}>
                {TOOL_ICONS[tc.name] || <SearchIcon style={iconStyle} />}
              </span>
              {TOOL_LABELS[tc.name] || tc.name}
            </Box>
          ))}
        </Box>
      )}

      {/* Message content */}
      {text && (
        <Box style={bubbleStyle}>
          {isUser ? text : <ChatMarkdown content={text} />}
        </Box>
      )}

      {/* Rich tool result cards — grid-below mode (Dashboard theme) */}
      {layout.toolResultPosition === 'grid-below' && toolsWithOutput.length > 0 && (
        <Box style={{ marginTop: tokens.spacing.sm, width: '100%', maxWidth: '85%' }}>
          {toolsWithOutput.map((tc, i) => (
            <Box key={i} style={{ marginBottom: tokens.spacing.sm }}>
              <ToolResultRenderer toolName={tc.name} output={tc.output} />
            </Box>
          ))}
        </Box>
      )}

      {/* Actions row */}
      {!isUser && text && (
        <Box style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.125rem',
          marginTop: '0.375rem',
          opacity: 0.5,
          transition: `opacity ${tokens.transitions.fast}`,
        }}
          onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
          onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLDivElement).style.opacity = '0.5'; }}
        >
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: tokens.typography.fontSize.xs,
              color: copied ? tokens.colors.success : tokens.colors.text.muted,
            }}
            title="Copy response"
          >
            {copied
              ? <><CheckCircleIcon style={{ width: '14px', height: '14px' }} /> Copied</>
              : <><ContentCopyIcon style={{ width: '14px', height: '14px' }} /> Copy</>
            }
          </button>

          <span style={{ color: tokens.colors.border.subtle, margin: '0 0.125rem' }}>|</span>

          <button
            onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              color: feedback === 'up' ? tokens.colors.primary : tokens.colors.text.muted,
            }}
            title="Good response"
          >
            {feedback === 'up'
              ? <ThumbUpAltIcon style={{ width: '14px', height: '14px' }} />
              : <ThumbUpOffAltIcon style={{ width: '14px', height: '14px' }} />
            }
          </button>

          <button
            onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              color: feedback === 'down' ? tokens.colors.error : tokens.colors.text.muted,
            }}
            title="Bad response"
          >
            {feedback === 'down'
              ? <ThumbDownAltIcon style={{ width: '14px', height: '14px' }} />
              : <ThumbDownOffAltIcon style={{ width: '14px', height: '14px' }} />
            }
          </button>
        </Box>
      )}

      {/* Follow-up suggestions */}
      {followUps.length > 0 && onFollowUp && (
        <Box style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.375rem',
          marginTop: tokens.spacing.sm,
          maxWidth: '85%',
        }}>
          {followUps.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onFollowUp(suggestion)}
              style={{
                background: tokens.colors.surfaceRaised,
                border: `1px solid ${tokens.colors.border.default}`,
                borderRadius: tokens.radius.full,
                padding: '0.375rem 0.75rem',
                fontSize: tokens.typography.fontSize.sm,
                color: tokens.colors.text.secondary,
                cursor: 'pointer',
                transition: `border-color ${tokens.transitions.fast}, color ${tokens.transitions.fast}`,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.colors.primary;
                (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.primary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.colors.border.default;
                (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.text.secondary;
              }}
            >
              {suggestion}
            </button>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat: theme MessageBubble with tokens and rich tool result rendering"
```

---

## Task 13: Theme ChatMarkdown

**Files:**
- Modify: `src/components/chat/ChatMarkdown.tsx`

- [ ] **Step 1: Update ChatMarkdown to use theme tokens**

Replace the full `ChatMarkdown.tsx`. All hardcoded colors replaced with tokens from `useTheme()`.

```tsx
// src/components/chat/ChatMarkdown.tsx
'use client';

import type { ReactNode } from 'react';
import { useTheme } from './ThemeContext';

interface ChatMarkdownProps {
  content: string;
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'bullet'; lines: string[] }
  | { type: 'numbered'; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'paragraph'; text: string };

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') });
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const parseRow = (row: string) =>
        row.split('|').map((c) => c.trim()).filter(Boolean);
      const headers = parseRow(tableLines[0]);
      const dataStart = tableLines[1]?.match(/^[\s|:-]+$/) ? 2 : 1;
      const rows = tableLines.slice(dataStart).map(parseRow);
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s/, ''));
        i++;
      }
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'bullet') {
        prev.lines.push(...items);
      } else {
        blocks.push({ type: 'bullet', lines: items });
      }
      continue;
    }

    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'numbered') {
        prev.lines.push(...items);
      } else {
        blocks.push({ type: 'numbered', lines: items });
      }
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^#{1,4}\s/) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !(lines[i].includes('|') && lines[i].trim().startsWith('|'))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
  }

  return blocks;
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const { theme } = useTheme();
  const { tokens } = theme;

  function processInline(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={key++} style={{ fontWeight: 600, color: tokens.colors.text.primary }}>{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(<em key={key++}>{match[3]}</em>);
      } else if (match[4]) {
        parts.push(
          <code key={key++} style={{
            background: tokens.colors.border.subtle,
            borderRadius: '3px',
            padding: '0.125rem 0.3rem',
            fontSize: tokens.typography.fontSize.sm,
            fontFamily: 'monospace',
          }}>{match[4]}</code>
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length > 0 ? parts : [text];
  }

  const blocks = parseBlocks(content);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const fontSize = block.level <= 2 ? tokens.typography.fontSize.lg : tokens.typography.fontSize.base;
          return (
            <div key={i} style={{ fontWeight: 600, fontSize, color: tokens.colors.text.primary, marginTop: '0.25rem' }}>
              {processInline(block.text)}
            </div>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={i} style={{
              background: tokens.colors.code.bg,
              color: tokens.colors.code.text,
              borderRadius: tokens.radius.md,
              padding: '0.75rem',
              fontSize: tokens.typography.fontSize.sm,
              fontFamily: 'monospace',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {block.text}
            </pre>
          );
        }

        if (block.type === 'bullet') {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc' }}>
              {block.lines.map((line, j) => (
                <li key={j} style={{ marginBottom: '0.25rem' }}>{processInline(line)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'numbered') {
          return (
            <ol key={i} style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {block.lines.map((line, j) => (
                <li key={j} style={{ marginBottom: '0.25rem' }}>{processInline(line)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={i} style={{ overflow: 'auto' }}>
              <table style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: tokens.typography.fontSize.sm,
              }}>
                <thead>
                  <tr>
                    {block.headers.map((h, j) => (
                      <th key={j} style={{
                        borderBottom: `2px solid ${tokens.colors.border.default}`,
                        padding: '0.375rem 0.5rem',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: tokens.colors.text.primary,
                      }}>{processInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k} style={{
                          borderBottom: `1px solid ${tokens.colors.border.subtle}`,
                          padding: '0.375rem 0.5rem',
                        }}>{processInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={i} style={{ margin: 0 }}>
            {block.text.split('\n').map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {processInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatMarkdown.tsx
git commit -m "feat: theme ChatMarkdown with tokens"
```

---

## Task 14: Final Integration Test

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: PASS with no errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Successful build

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Test each theme by:
1. Visit `http://localhost:3000/dev/session/dev-store`
2. Click gear icon in header
3. Switch to each theme and verify:
   - **BC-Native:** Looks like current UI with blue user bubbles, gray assistant bubbles, panel sidebar
   - **AI Assistant:** Centered narrow column, no bubble backgrounds, drawer sidebar, typing dots loading
   - **Dashboard:** Compact text, icon rail sidebar, skeleton loading, rich cards when tool results have data
4. Send a message in each theme and verify streaming works
5. Switch themes mid-conversation — messages should re-render with new theme
6. Reload page — theme preference should persist

- [ ] **Step 5: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix: address issues found during theme smoke testing"
```

(Skip this step if no fixes are needed.)
