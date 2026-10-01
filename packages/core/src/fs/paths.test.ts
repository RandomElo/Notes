import { describe, expect, it } from 'vitest';
import { joindreChemins, verifierCheminRelatif } from './paths';

describe('verifierCheminRelatif', () => {
  it.each(['page.md', 'Projets/page.md', 'Projets/Refonte du NAS', '.notes/theme.toml', 'Été/ça.md'])(
    'accepte %s',
    (chemin) => {
      expect(verifierCheminRelatif(chemin)).toBeNull();
    },
  );

  // Même liste que le test Go du compagnon : les deux côtés refusent la même chose.
  it.each([
    '', '..', 'a/../b', '../secret', '/absolu', 'a/', 'a//b', './a',
    'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\u0000b',
    'fin.', 'fin ', 'a/fin./b',
  ])('refuse %j', (chemin) => {
    expect(verifierCheminRelatif(chemin)).not.toBeNull();
  });
});

describe('joindreChemins', () => {
  it('ignore les morceaux vides', () => {
    expect(joindreChemins('', 'Notes', '', 'page.md')).toBe('Notes/page.md');
    expect(joindreChemins('', 'page.md')).toBe('page.md');
    expect(joindreChemins()).toBe('');
  });
});
