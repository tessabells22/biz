import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
