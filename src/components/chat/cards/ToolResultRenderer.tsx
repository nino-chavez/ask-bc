'use client';

import GenericCard from './GenericCard';
import OrderCard, { type OrderData } from './OrderCard';
import ProductCard, { type ProductData } from './ProductCard';
import CustomerCard, { type CustomerData } from './CustomerCard';
import type { ToolResultProps } from '@/lib/themes/types';

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

export function DashboardToolResult({ toolName, output }: ToolResultProps) {
  const items = extractItems(output).slice(0, 10);

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {items.map((item, i) => {
        const key = (item && typeof item === 'object' && 'id' in item)
          ? String((item as { id: unknown }).id)
          : String(i);

        if (toolName === 'get_orders') {
          return <OrderCard key={key} order={item as OrderData} />;
        }
        if (toolName === 'get_products') {
          return <ProductCard key={key} product={item as ProductData} />;
        }
        if (toolName === 'get_customers') {
          return <CustomerCard key={key} customer={item as CustomerData} />;
        }
        return (
          <GenericCard
            key={key}
            data={item as Record<string, unknown>}
          />
        );
      })}
    </div>
  );
}

export function DefaultToolResult({ toolName: _toolName, output }: ToolResultProps) {
  const items = extractItems(output).slice(0, 5);

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {items.map((item, i) => {
        const key = (item && typeof item === 'object' && 'id' in item)
          ? String((item as { id: unknown }).id)
          : String(i);
        return (
          <GenericCard
            key={key}
            data={item as Record<string, unknown>}
          />
        );
      })}
    </div>
  );
}
