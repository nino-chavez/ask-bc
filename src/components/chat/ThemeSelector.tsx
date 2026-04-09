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
