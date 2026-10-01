import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Les paquets du monorepo sont du TypeScript source : ils sont compilés avec l'application, pas laissés en import externe.
const paquetsInternes = ['@notes/core'];

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: paquetsInternes } },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: paquetsInternes },
      // Un preload en bac à sable doit être en CommonJS et tenir en un seul fichier.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
