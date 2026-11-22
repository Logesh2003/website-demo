import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || './',
  root: 'client',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5174' },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // Server code uses node:sqlite, which Vite cannot transform: let Node load it directly.
    server: { deps: { external: [/\/server\//] } },
  },
});
