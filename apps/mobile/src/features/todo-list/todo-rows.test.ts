import { documentDuCorps } from '@notes/document';
import { describe, expect, it } from 'vitest';
import { lignesDeTaches } from './todo-rows';

describe('lignes de la liste façon Keep', () => {
  it('suit l’ordre de lecture, avec sous-tâches, blocs dessous et section « Terminé »', () => {
    const corps = '- [ ] lait *bio*\n  - [ ] demi-écrémé\n- [ ] pain\n\n  ```\n  code\n  ```\n- [x] beurre\n';
    const { lignes, horsListe } = lignesDeTaches(documentDuCorps(corps));
    expect(lignes.map((ligne) => [ligne.texteBrut, ligne.profondeur, ligne.rang, ligne.coche, ligne.termine])).toEqual([
      ['lait bio', 0, 0, false, false],
      ['demi-écrémé', 1, 0, false, false],
      ['pain', 0, 1, false, false],
      ['beurre', 0, 2, true, true],
    ]);
    expect(lignes[0]!.texte).toBe('lait *bio*');
    expect(lignes[2]!.blocsSous).toContain('code');
    expect(horsListe).toBe('');
  });

  it('relie chaque tâche à sa liste, et marque ce qui est sous « Terminé »', () => {
    const { lignes } = lignesDeTaches(documentDuCorps('- [ ] a\n  - [ ] a1\n  - [ ] a2\n- [x] b\n  - [x] b1\n'));
    const [a, a1, a2, b, b1] = lignes;
    expect(a1!.liste).toBe(a2!.liste);
    expect(a1!.liste).not.toBe(a!.liste);
    expect(a!.liste).toBe(b!.liste);
    expect(lignes.map((ligne) => ligne.enTermine)).toEqual([false, false, false, true, true]);
    expect(b1!.termine).toBe(false);
  });

  it('montre à part ce qui n’est pas dans la liste', () => {
    const { lignes, horsListe } = lignesDeTaches(documentDuCorps('Un paragraphe.\n\n- [ ] a\n'));
    expect(lignes).toHaveLength(1);
    expect(horsListe).toBe('Un paragraphe.\n');
  });

  it('rend une liste vide pour une page vide', () => {
    expect(lignesDeTaches(documentDuCorps('')).lignes).toEqual([]);
  });
});
