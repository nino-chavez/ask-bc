import type { ThemeConfig, ThemeId } from './types';
import { bcNativeTheme } from './bc-native';
import { aiAssistantTheme } from './ai-assistant';
import { dashboardTheme } from './dashboard';

export type { ThemeConfig, ThemeId, ThemeTokens, ThemeLayout, ThemeComponents, ToolResultProps } from './types';

export const themes: Record<ThemeId, ThemeConfig> = {
  'bc-native': bcNativeTheme,
  'ai-assistant': aiAssistantTheme,
  dashboard: dashboardTheme,
};

export const themeList: ThemeConfig[] = Object.values(themes);

export const DEFAULT_THEME_ID: ThemeId = 'bc-native';

export function getTheme(id: ThemeId): ThemeConfig {
  return themes[id] ?? themes[DEFAULT_THEME_ID];
}

export function isValidThemeId(id: string): id is ThemeId {
  return id in themes;
}
