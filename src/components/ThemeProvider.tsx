'use client';

import { GlobalStyles } from '@bigcommerce/big-design';
import { theme as defaultTheme } from '@bigcommerce/big-design-theme';
import { ThemeProvider as SCThemeProvider } from 'styled-components';

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SCThemeProvider theme={defaultTheme}>
      <GlobalStyles />
      {children}
    </SCThemeProvider>
  );
}
