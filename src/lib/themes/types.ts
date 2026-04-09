import type { ComponentType } from 'react';

export type ThemeId = 'bc-native' | 'ai-assistant' | 'dashboard';

export interface ThemeTokens {
  colors: {
    primary: string;
    primaryHover: string;
    surface: string;
    surfaceRaised: string;
    background: string;
    text: { primary: string; secondary: string; muted: string };
    border: { default: string; subtle: string };
    accent: string;
    success: string;
    error: string;
    userBubble: { bg: string; text: string; border?: string };
    assistantBubble: { bg: string; text: string; border?: string };
    code: { bg: string; text: string };
  };
  typography: {
    fontFamily: string;
    fontSize: { xs: string; sm: string; base: string; lg: string; xl: string };
    fontWeight: { normal: number; medium: number; semibold: number };
    lineHeight: { tight: string; normal: string; relaxed: string };
  };
  spacing: { xs: string; sm: string; md: string; lg: string; xl: string };
  radius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
    userBubble: string;
    assistantBubble: string;
  };
  shadows: { sm: string; md: string; lg: string };
  transitions: { fast: string; normal: string };
}

export interface ThemeLayout {
  contentMaxWidth: string;
  contentAlign: 'stretch' | 'center';
  sidebarWidth: string;
  sidebarExpandable: boolean;
  sidebarStyle: 'panel' | 'drawer' | 'rail';
  toolResultPosition: 'inline' | 'grid-below';
}

export interface ToolResultProps {
  toolName: string;
  output: unknown;
}

export interface ThemeComponents {
  toolResultRenderer: ComponentType<ToolResultProps>;
  loadingIndicator: ComponentType;
}

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  tokens: ThemeTokens;
  layout: ThemeLayout;
  components: ThemeComponents;
}
