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
