import type { ThemeConfig } from './types';
import PulseDot from '@/components/chat/loading/PulseDot';
import { DefaultToolResult } from '@/components/chat/cards/ToolResultRenderer';

export const bcNativeTheme: ThemeConfig = {
  id: 'bc-native',
  name: 'BigCommerce',
  description: 'Clean, professional look that matches BigCommerce admin',
  tokens: {
    colors: {
      primary: '#3C64F4', primaryHover: '#2B4FD4',
      surface: '#f0f1f5', surfaceRaised: '#fff', background: '#fff',
      text: { primary: '#313440', secondary: '#525566', muted: '#8b8fa3' },
      border: { default: '#d9dce9', subtle: '#e8e9ef' },
      accent: '#3C64F4', success: '#16a34a', error: '#dc2626',
      userBubble: { bg: '#3C64F4', text: '#fff' },
      assistantBubble: { bg: '#f0f1f5', text: '#313440' },
      code: { bg: '#1e1e2e', text: '#cdd6f4' },
    },
    typography: {
      fontFamily: 'inherit',
      fontSize: { xs: '0.6875rem', sm: '0.75rem', base: '0.875rem', lg: '1rem', xl: '1.25rem' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
      lineHeight: { tight: '1.25', normal: '1.5', relaxed: '1.625' },
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' },
    radius: { sm: '4px', md: '6px', lg: '8px', full: '999px', userBubble: '1rem 1rem 0.25rem 1rem', assistantBubble: '1rem 1rem 1rem 0.25rem' },
    shadows: { sm: 'none', md: 'none', lg: 'none' },
    transitions: { fast: '0.15s', normal: '0.2s' },
  },
  layout: { contentMaxWidth: '100%', contentAlign: 'stretch', sidebarWidth: '260px', sidebarExpandable: false, sidebarStyle: 'panel', toolResultPosition: 'inline' },
  components: { toolResultRenderer: DefaultToolResult, loadingIndicator: PulseDot },
};
