import { listerLangages } from '@notes/ui';
import { describe, expect, it } from 'vitest';
import { filtrerLangages } from './language-search';

describe('recherche d’un langage', () => {
  const langages = listerLangages();

  it('propose la liste courte choisie, sans « / » dans les noms', () => {
    expect(langages.map((langage) => langage.nom)).toEqual([
      'Arduino', 'Assembleur ARM', 'Assembleur x86', 'Bash', 'C', 'C#', 'C++', 'CSS', 'Diff', 'Dockerfile', 'Excel', 'Go',
      'HTML', 'INI', 'Java', 'JavaScript', 'JSON', 'JSX', 'Kotlin', 'Makefile', 'Markdown', 'Nginx', 'PHP', 'PowerShell',
      'Python', 'Rust', 'Shell', 'SQL', 'TOML', 'TSX', 'TypeScript', 'XML', 'YAML',
    ]);
  });

  it('trouve par nom, identifiant ou alias, sans casse', () => {
    expect(filtrerLangages(langages, 'TypeScript')[0]?.id).toBe('typescript');
    expect(filtrerLangages(langages, 'ts')[0]?.id).toBe('typescript');
    expect(filtrerLangages(langages, 'bash')[0]?.id).toBe('bash');
    expect(filtrerLangages(langages, 'yml')[0]?.id).toBe('yaml');
  });

  it('met le nom exact en premier', () => {
    expect(filtrerLangages(langages, 'c')[0]?.id).toBe('c');
    expect(filtrerLangages(langages, 'go')[0]?.id).toBe('go');
  });

  it('ne trouve rien pour un texte qui ne désigne aucun langage', () => {
    expect(filtrerLangages(langages, 'zzzz')).toEqual([]);
  });
});
