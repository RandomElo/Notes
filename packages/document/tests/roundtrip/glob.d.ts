// Vitest (Vite) remplace cet appel par le contenu des fichiers : pas besoin de node:fs, interdit dans ce paquet.
interface ImportMeta {
  glob(motif: string, options: { query: '?raw'; import: 'default'; eager: true }): Record<string, string>;
}
