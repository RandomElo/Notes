import { defineConfig } from 'vitest/config';

// Un projet par paquet ou application. Les tests Go du compagnon se lancent à part (npm run test:companion).
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', environment: 'node', include: ['packages/core/src/**/*.test.ts'] } },
      { test: { name: 'desktop-main', environment: 'node', include: ['apps/desktop/src/{main,shared}/**/*.test.ts'] } },
      // Logique pure du renderer (modèles, calculs). Les composants se vérifient dans l'application lancée.
      { test: { name: 'desktop-renderer', environment: 'node', include: ['apps/desktop/src/renderer/**/*.test.ts'] } },
    ],
  },
});
