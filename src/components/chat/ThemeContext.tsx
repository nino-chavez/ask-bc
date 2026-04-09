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

    // Lazy-register any missing App Extensions (fire-and-forget)
    fetch(`/stores/${storeHash}/api/extensions`, { method: 'POST' }).catch(() => {});

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
