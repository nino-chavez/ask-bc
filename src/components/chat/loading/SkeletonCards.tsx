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
