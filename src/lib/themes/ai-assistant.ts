import type { ThemeConfig } from './types';
import TypingDots from '@/components/chat/loading/TypingDots';
import { DefaultToolResult } from '@/components/chat/cards/ToolResultRenderer';

export const aiAssistantTheme: ThemeConfig = {
  id: 'ai-assistant',
  name: 'AI Assistant',
  description: 'Modern, spacious chat inspired by leading AI interfaces',
  tokens: {
    colors: {
      primary: '#6B7280', primaryHover: '#4B5563',
      surface: '#fafafa', surfaceRaised: '#fff', background: '#fafafa',
      text: { primary: '#111827', secondary: '#4B5563', muted: '#9CA3AF' },
      border: { default: '#E5E7EB', subtle: '#F3F4F6' },
      accent: '#6B7280', success: '#059669', error: '#DC2626',
      userBubble: { bg: 'transparent', text: '#111827', border: '#E5E7EB' },
      assistantBubble: { bg: 'transparent', text: '#111827' },
      code: { bg: '#1F2937', text: '#E5E7EB' },
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: { xs: '0.75rem', sm: '0.8125rem', base: '0.9375rem', lg: '1.0625rem', xl: '1.25rem' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
      lineHeight: { tight: '1.4', normal: '1.7', relaxed: '1.8' },
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
    radius: { sm: '4px', md: '8px', lg: '12px', full: '999px', userBubble: '1.25rem', assistantBubble: '0' },
    shadows: { sm: 'none', md: 'none', lg: 'none' },
    transitions: { fast: '0.1s', normal: '0.2s' },
  },
  layout: { contentMaxWidth: '720px', contentAlign: 'center', sidebarWidth: '300px', sidebarExpandable: false, sidebarStyle: 'drawer', toolResultPosition: 'inline' },
  components: { toolResultRenderer: DefaultToolResult, loadingIndicator: TypingDots },
};
