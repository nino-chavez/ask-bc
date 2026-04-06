import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  server: {
    BIGCOMMERCE_CLIENT_ID: z.string().min(1),
    BIGCOMMERCE_CLIENT_SECRET: z.string().min(1),
    APP_ORIGIN: z.string().url(),
    JWT_KEY: z.string().min(32),
    ANTHROPIC_API_KEY: z.string().min(1),
    BIGCOMMERCE_API_URL: z.string().url().default('https://api.bigcommerce.com'),
    BIGCOMMERCE_LOGIN_URL: z.string().url().default('https://login.bigcommerce.com'),
  },
  client: {},
  runtimeEnv: {
    BIGCOMMERCE_CLIENT_ID: process.env.BIGCOMMERCE_CLIENT_ID,
    BIGCOMMERCE_CLIENT_SECRET: process.env.BIGCOMMERCE_CLIENT_SECRET,
    APP_ORIGIN: process.env.APP_ORIGIN,
    JWT_KEY: process.env.JWT_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    BIGCOMMERCE_API_URL: process.env.BIGCOMMERCE_API_URL ?? 'https://api.bigcommerce.com',
    BIGCOMMERCE_LOGIN_URL: process.env.BIGCOMMERCE_LOGIN_URL ?? 'https://login.bigcommerce.com',
  },
});
