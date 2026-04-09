import type { ThemeConfig } from './types';
import SkeletonCards from '@/components/chat/loading/SkeletonCards';
import { DashboardToolResult } from '@/components/chat/cards/ToolResultRenderer';

export const dashboardTheme: ThemeConfig = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Data-forward command center with rich cards',
  tokens: {
    colors: {
      primary: '#2B4FD4', primaryHover: '#1E3FAF',
      surface: '#f5f6f8', surfaceRaised: '#fff', background: '#f5f6f8',
      text: { primary: '#111827', secondary: '#4B5563', muted: '#9CA3AF' },
      border: { default: '#E5E7EB', subtle: '#F3F4F6' },
      accent: '#2B4FD4', success: '#059669', error: '#DC2626',
      userBubble: { bg: '#EEF2FF', text: '#1E3A5F' },
      assistantBubble: { bg: 'transparent', text: '#111827' },
      code: { bg: '#1F2937', text: '#E5E7EB' },
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: { xs: '0.6875rem', sm: '0.75rem', base: '0.8125rem', lg: '0.9375rem', xl: '1.125rem' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
      lineHeight: { tight: '1.25', normal: '1.5', relaxed: '1.625' },
    },
    spacing: { xs: '0.25rem', sm: '0.375rem', md: '0.625rem', lg: '0.875rem', xl: '1.25rem' },
    radius: { sm: '4px', md: '6px', lg: '8px', full: '999px', userBubble: '0.75rem', assistantBubble: '0' },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.05)', md: '0 1px 3px rgba(0,0,0,0.1)', lg: '0 4px 6px rgba(0,0,0,0.1)' },
    transitions: { fast: '0.1s', normal: '0.2s' },
  },
  layout: { contentMaxWidth: '900px', contentAlign: 'center', sidebarWidth: '48px', sidebarExpandable: true, sidebarStyle: 'rail', toolResultPosition: 'grid-below' },
  components: { toolResultRenderer: DashboardToolResult, loadingIndicator: SkeletonCards },
};
