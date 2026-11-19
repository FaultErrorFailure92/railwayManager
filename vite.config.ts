import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
  // die Welt ist doppelt so hoch (RM-FR-MAP-12): Tests mit Demobahnhof brauchen etwas länger
  test: { testTimeout: 20000 },
} as never);
