'use client';

import { Box, Text } from '@bigcommerce/big-design';

export interface CustomerData {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  orders_count?: number;
  total_spent?: string | number;
  date_created?: string;
  phone?: string;
  company?: string;
}

interface CustomerCardProps {
  customer: CustomerData;
}

function formatCurrency(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomerCard({ customer }: CustomerCardProps) {
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  const initial = (customer.first_name?.[0] ?? customer.email?.[0] ?? '?').toUpperCase();

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
      <Box style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
        <Box
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#6366f1',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.9375rem',
            flexShrink: 0,
          }}
        >
          {initial}
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          {fullName && (
            <Text
              as="p"
              style={{
                fontWeight: 600,
                color: '#111827',
                fontSize: '0.8125rem',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {fullName}
            </Text>
          )}
          {customer.email && (
            <Text
              as="p"
              style={{
                color: '#6b7280',
                fontSize: '0.75rem',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {customer.email}
            </Text>
          )}
        </Box>
      </Box>

      <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {customer.company && (
          <Row label="Company" value={customer.company} />
        )}
        {customer.orders_count !== undefined && (
          <Row label="Orders" value={String(customer.orders_count)} />
        )}
        {customer.total_spent !== undefined && (
          <Row label="Total Spent" value={formatCurrency(customer.total_spent)} />
        )}
        {customer.phone && (
          <Row label="Phone" value={customer.phone} />
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
