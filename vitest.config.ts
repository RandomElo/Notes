import { defineConfig } from 'vitest/config';

// Un projet par paquet ou application. Les tests Go du compagnon se lancent à part (npm run test:companion).
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', environment: 'node', include: ['packages/core/src/**/*.test.ts'] } },
      // Les cas d'aller-retour Markdown sont dans tests/roundtrip, le reste à côté des fichiers testés.
      { test: { name: 'document', environment: 'node', include: ['packages/document/{src,tests}/**/*.test.ts'] } },
      // `css` : sans lui, Vitest rend une feuille de style importée vide, même avec `?raw` (export HTML).
      { test: { name: 'ui', environment: 'node', include: ['packages/ui/src/**/*.test.ts'], css: true } },
      { test: { name: 'desktop-main', environment: 'node', include: ['apps/desktop/src/{main,shared}/**/*.test.ts'] } },
      // Logique pure du renderer (modèles, calculs). Les composants se vérifient dans l'application lancée.
      { test: { name: 'desktop-renderer', environment: 'node', include: ['apps/desktop/src/renderer/**/*.test.ts'] } },
      // Logique pure de l'application Android. Les écrans se vérifient en démonstration dans un navigateur et sur le téléphone.
      { test: { name: 'mobile', environment: 'node', include: ['apps/mobile/src/**/*.test.ts'] } },
    ],
  },
});
