import { anthropic } from '@ai-sdk/anthropic';

const models = {
  /** Fast chat with tool use — optimized for speed and cost */
  chat: () => anthropic('claude-haiku-4-5-20251001'),
} as const;

export type ModelFeature = keyof typeof models;

export function getModel(feature: ModelFeature) {
  return models[feature]();
}
