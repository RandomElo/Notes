import { describe, expect, it } from 'vitest';
import { dateCourte, versionsDeLaFrise } from './version-history';

describe('versionsDeLaFrise', () => {
  it('rend une entrée par version, la plus récente en premier, étapes réunies', () => {
    const readme = [
      '# Notes',
      '| Date | Version | Étape |',
      '|---|---|---|',
      '| 2026-10-01 | | Spécification réécrite |',
      '| 2026-10-01 | 0.1.0 | J0 : socle |',
      '| 2026-10-02 | 0.1.0 | Connexion validée |',
      '| 2026-10-03 | 0.2.0 | Éditeur |',
    ].join('\n');
    expect(versionsDeLaFrise(readme)).toEqual([
      { version: '0.2.0', date: '2026-10-03', etapes: ['Éditeur'] },
      { version: '0.1.0', date: '2026-10-02', etapes: ['J0 : socle', 'Connexion validée'] },
    ]);
  });
});

describe('dateCourte', () => {
  it('écrit la date en français, en court', () => {
    expect(dateCourte('2026-10-12')).toBe('12 oct. 2026');
  });
});
