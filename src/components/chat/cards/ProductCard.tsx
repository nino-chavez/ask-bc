'use client';

import { Box, Text } from '@bigcommerce/big-design';

export interface ProductData {
  id?: number | string;
  name?: string;
  price?: string | number;
  calculated_price?: string | number;
  sku?: string;
  inventory_level?: number;
  inventory_tracking?: string;
  is_visible?: boolean;
  availability?: string;
  images?: Array<{ url_thumbnail?: string; url_standard?: string; description?: string }>;
  primary_image?: { url_thumbnail?: string; url_standard?: string };
}

interface ProductCardProps {
  product: ProductData;
}

function formatPrice(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInventoryBadge(product: ProductData): { label: string; bg: string; text: string } | null {
  if (!product.inventory_tracking || product.inventory_tracking === 'none') return null;
  const level = product.inventory_level ?? 0;
  if (level <= 0) return { label: 'Out of stock', bg: '#FEE2E2', text: '#991B1B' };
  if (level <= 5) return { label: `Low stock (${level})`, bg: '#FEF3C7', text: '#92400E' };
  return { label: `In stock (${level})`, bg: '#D1FAE5', text: '#065F46' };
}

export default function ProductCard({ product }: ProductCardProps) {
  const thumbnailUrl =
    product.primary_image?.url_thumbnail ??
    product.images?.[0]?.url_thumbnail ??
    null;

  const price = product.calculated_price ?? product.price;
  const inventoryBadge = getInventoryBadge(product);

  return (
    <Box
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        padding: '12px',
        minWidth: '200px',
        fontSize: '0.8125rem',
      }}
    >
      <Box style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
        {thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbnailUrl}
            alt={product.name ?? 'Product'}
            width={48}
            height={48}
            style={{ borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <Box
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '6px',
              background: '#f3f4f6',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '1.25rem',
            }}
          >
            📦
          </Box>
        )}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Text
              as="span"
              style={{
                fontWeight: 600,
                color: '#111827',
                fontSize: '0.8125rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {product.name ?? 'Product'}
            </Text>
            {product.is_visible === false && (
              <Box
                style={{
                  background: '#F3F4F6',
                  color: '#6B7280',
                  borderRadius: '9999px',
                  padding: '1px 6px',
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                }}
              >
                Hidden
              </Box>
            )}
          </Box>
          {product.sku && (
            <Text as="span" style={{ color: '#6b7280', fontSize: '0.75rem' }}>
              SKU: {product.sku}
            </Text>
          )}
        </Box>
      </Box>

      <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {price !== undefined && (
          <Box style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <Text as="span" style={{ color: '#6b7280', fontSize: '0.8125rem' }}>Price</Text>
            <Text as="span" style={{ color: '#111827', fontSize: '0.8125rem', fontWeight: 600 }}>
              {formatPrice(price)}
            </Text>
          </Box>
        )}
        {inventoryBadge && (
          <Box style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
            <Text as="span" style={{ color: '#6b7280', fontSize: '0.8125rem' }}>Inventory</Text>
            <Box
              style={{
                background: inventoryBadge.bg,
                color: inventoryBadge.text,
                borderRadius: '9999px',
                padding: '1px 8px',
                fontSize: '0.75rem',
                fontWeight: 500,
              }}
            >
              {inventoryBadge.label}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
