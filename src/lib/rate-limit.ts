import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './redis';

let rateLimiter: Ratelimit | null = null;

/**
 * Get a rate limiter instance (20 requests per 60s sliding window per store).
 * Returns null if Redis is not configured (dev mode).
 */
export function getRateLimiter(): Ratelimit | null {
  if (rateLimiter) return rateLimiter;

  const redis = getRedis();
  if (!redis) return null;

  rateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '60 s'),
    prefix: 'ask-bc:rl',
  });

  return rateLimiter;
}
