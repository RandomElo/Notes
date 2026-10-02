import { defineConfig } from '@playwright/test';

// Tests de bout en bout : l'application construite (npm run build) est lancée par Playwright
// sur une copie de fixtures/vault-demo, avec un profil temporaire. Rien ne touche aux vrais réglages.
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 60_000,
  // Une seule fenêtre Electron à la fois : l'application n'accepte qu'une instance par profil, et le poste reste utilisable.
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
});
