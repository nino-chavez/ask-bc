'use client';

import { Box, Text } from '@bigcommerce/big-design';

interface GenericCardProps {
  data: Record<string, unknown>;
  maxEntries?: number;
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (Array.isArray(value)) return `${value.length} items`;
  return String(value);
}

function isPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') return false;
  if (Array.isArray(value)) return false;
  return true;
}

export default function GenericCard({ data, maxEntries = 8 }: GenericCardProps) {
  const entries = Object.entries(data)
    .filter(([, v]) => isPrimitive(v) || Array.isArray(v))
    .filter(([, v]) => v !== null && v !== undefined)
    .slice(0, maxEntries);

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
      {entries.map(([key, value]) => (
        <Box
          key={key}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '3px 0',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          <Text
            as="span"
            style={{
              color: '#6b7280',
              fontSize: '0.8125rem',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
            }}
          >
            {key.replace(/_/g, ' ')}
          </Text>
          <Text
            as="span"
            style={{
              color: '#111827',
              fontSize: '0.8125rem',
              textAlign: 'right',
              wordBreak: 'break-word',
            }}
          >
            {formatValue(value)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
