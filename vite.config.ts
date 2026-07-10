import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  oxc: false,
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(__dirname, 'tests/unit/setup.ts')],
    include: ['tests/unit/**/*.test.{js,jsx,ts,tsx}'],
    globals: true,
    pool: 'threads',
    transformMode: {
      web: [/.[jt]sx?$/],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'tests/unit/mocks/server-only.js'),
    },
  },
});
