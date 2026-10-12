import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * CSP stricte de la WebView (docs/spec/securite.md), posée à la construction seulement :
 * le serveur de développement a besoin de scripts en ligne. Rien de distant :
 * les images viennent du cache en adresses `blob:`.
 */
const csp: Plugin = {
  name: 'notes-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content:
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
      },
      injectTo: 'head-prepend',
    },
  ],
};

export default defineConfig({
  plugins: [react(), tailwindcss(), csp],
  // Chemins relatifs : la WebView sert l'application depuis l'APK.
  base: './',
  define: { __VERSION__: JSON.stringify(version) },
  server: {
    // Le vault d'exemple du mode démonstration (navigateur seulement) est hors du dossier de l'application.
    fs: { allow: ['../..'] },
  },
});
