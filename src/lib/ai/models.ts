import { anthropic } from '@ai-sdk/anthropic';

const models = {
  /** Agentic chat with tool use — balanced quality/speed/cost */
  chat: () => anthropic('claude-sonnet-4-20250514'),
} as const;

export type ModelFeature = keyof typeof models;

export function getModel(feature: ModelFeature) {
  return models[feature]();
}
