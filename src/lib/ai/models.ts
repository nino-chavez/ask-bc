import { anthropic } from '@ai-sdk/anthropic';

const models = {
  /** Fast chat with tool use — simple lookups, data retrieval */
  fast: () => anthropic('claude-haiku-4-5-20251001'),
  /** Capable chat — complex diagnosis, analysis, multi-step reasoning */
  smart: () => anthropic('claude-sonnet-4-6'),
} as const;

export type ModelTier = keyof typeof models;

export function getModel(tier: ModelTier) {
  return models[tier]();
}

/**
 * Route to the appropriate model based on the user's latest message.
 * Uses keyword heuristics — "why", "analyze", "diagnose", "compare", etc.
 * trigger the smart model. Simple lookups stay on fast.
 */
const COMPLEX_PATTERNS = [
  /\bwhy\b/i,
  /\banalyze\b/i,
  /\bdiagnos/i,
  /\bcompare\b/i,
  /\bexplain\b/i,
  /\bwhat('s|\s+is)\s+(wrong|happening|going on)/i,
  /\bhow\s+(can|do|should)\s+i\s+(fix|improve|optimize|increase|reduce|boost)/i,
  /\btroubl/i,
  /\binvestigat/i,
  /\bsuggest/i,
  /\brecommend/i,
  /\bstrateg/i,
  /\binsight/i,
  /\btrend/i,
  /\bperformanc/i,
];

export function routeModel(latestUserMessage: string): ModelTier {
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(latestUserMessage)) {
      return 'smart';
    }
  }
  return 'fast';
}
