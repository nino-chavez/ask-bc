'use client';

import { Box, Text } from '@bigcommerce/big-design';

export interface OrderData {
  id?: number | string;
  status?: string;
  date_created?: string;
  total_inc_tax?: string | number;
  total_ex_tax?: string | number;
  items_total?: number;
  billing_address?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  status_id?: number;
}

interface OrderCardProps {
  order: OrderData;
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

function formatCurrency(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

export default function OrderCard({ order }: OrderCardProps) {
  const statusKey = order.status?.toLowerCase().replace(/\s+/g, '_') ?? '';
  const statusColors = STATUS_COLORS[statusKey] ?? { bg: '#F3F4F6', text: '#374151' };
  const customerName =
    order.billing_address
      ? [order.billing_address.first_name, order.billing_address.last_name]
          .filter(Boolean)
          .join(' ') || order.billing_address.email || '—'
      : '—';

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
      <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <Text as="span" style={{ fontWeight: 600, color: '#111827', fontSize: '0.8125rem' }}>
          {order.id ? `Order #${order.id}` : 'Order'}
        </Text>
        {order.status && (
          <Box
            style={{
              background: statusColors.bg,
              color: statusColors.text,
              borderRadius: '9999px',
              padding: '2px 8px',
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            {order.status}
          </Box>
        )}
      </Box>

      <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {customerName !== '—' && (
          <Row label="Customer" value={customerName} />
        )}
        {order.date_created && (
          <Row label="Date" value={formatDate(order.date_created)} />
        )}
        {(order.total_inc_tax !== undefined) && (
          <Row label="Total" value={formatCurrency(order.total_inc_tax)} />
        )}
        {order.items_total !== undefined && (
          <Row label="Items" value={String(order.items_total)} />
        )}
      </Box>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
      <Text as="span" style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{label}</Text>
      <Text as="span" style={{ color: '#111827', fontSize: '0.8125rem', textAlign: 'right' }}>{value}</Text>
    </Box>
  );
}
