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
