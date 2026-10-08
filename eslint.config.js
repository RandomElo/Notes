import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Ce qu'un paquet partagé n'a pas le droit d'importer : il doit tourner tel
// quel dans un processus Node et dans une WebView (règle 1 du projet).
const plateformes = [
  { group: ['node:*'], message: 'Pas de module Node dans un paquet partagé.' },
  { regex: '^(fs|fs/promises|path|os|child_process|crypto|stream|events|url|util)$', message: 'Pas de module Node dans un paquet partagé.' },
  { group: ['electron', 'electron/*'], message: "Pas d'Electron dans un paquet partagé." },
  { group: ['@capacitor/*'], message: 'Pas de Capacitor dans un paquet partagé.' },
];
const interface_ = [{ group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: "Pas d'interface dans ce paquet." }];
const interdire = (...motifs) => ({ 'no-restricted-imports': ['error', { patterns: motifs.flat() }] });

export default tseslint.config(
  {
    ignores: ['**/node_modules/', '**/out/', '**/dist/', '**/release/', '**/resources/', '.cache/', 'apps/smb-companion/', 'apps/mobile/android/', 'poc/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.es2023 } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**', '*.config.{js,ts}', 'apps/*/*.config.{js,ts}', 'apps/desktop/e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Sens des dépendances (voir .claude/CARTE.md).
  {
    files: ['packages/core/**'],
    rules: interdire(plateformes, interface_, [{ group: ['@notes/document', '@notes/ui'], message: 'core ne dépend d\'aucun autre paquet.' }]),
  },
  {
    files: ['packages/document/**'],
    rules: interdire(plateformes, interface_, [{ group: ['@notes/core', '@notes/ui'], message: 'document ne dépend d\'aucun autre paquet.' }]),
  },
  {
    files: ['packages/ui/**'],
    rules: interdire(plateformes),
  },
  {
    files: ['apps/desktop/src/renderer/**'],
    languageOptions: { globals: { ...globals.browser } },
    rules: interdire(plateformes.slice(0, 3), [
      { group: ['**/main/**', '**/preload/**'], message: 'Le renderer ne voit le main que par le contrat IPC (src/shared).' },
    ]),
  },
  {
    files: ['apps/desktop/src/{main,preload}/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: interdire([{ group: ['**/renderer/**', 'react', 'react-dom'], message: "Pas d'interface dans le main ni le preload." }]),
  },
  {
    files: ['apps/desktop/src/shared/**'],
    rules: interdire(plateformes, interface_),
  },
);
