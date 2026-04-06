import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  prefix: 'tw-',
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
