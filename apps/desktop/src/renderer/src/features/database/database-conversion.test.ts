import type { BaseRow } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { analyserVersTableau, avecDescription, champDeDescription, compterLignes } from './database-conversion';

const ligne = (chemin: string, titre: string, valeurs: Record<string, string> = {}, enfants: BaseRow[] = []): BaseRow => ({ id: chemin, chemin, titre, icone: null, valeurs, enfants });

describe('conversion vers une base sans pages', () => {
  it('passe les pages dont le texte tient dans une cellule, avec leurs sous-lignes ; les autres restent', async () => {
    const corps: Record<string, string | null> = {
      'B/Notes': 'Finir la sync.\n',
      'B/Notes/Version': '',
      'B/Garmin': 'Un.\n\nDeux.\n',
      'B/Bitw': '',
      'B/Bitw/Sauvegarde': '- liste\n',
      'B/Perdue': null,
    };
    const lignes = [
      ligne('B/Notes', 'Notes', { Type: 'Code' }, [ligne('B/Notes/Version', 'Version')]),
      ligne('B/Garmin', 'Garmin'),
      ligne('B/Bitw', 'Bitw', {}, [ligne('B/Bitw/Sauvegarde', 'Sauvegarde')]),
      ligne('B/Perdue', 'Perdue'),
    ];
    const resultat = await analyserVersTableau(lignes, 'Description', (chemin) => Promise.resolve(corps[chemin] ?? null));
    expect(resultat.converties).toEqual([
      { chemin: 'B/Notes', ligne: { titre: 'Notes', valeurs: { Type: 'Code', Description: 'Finir la sync.' }, enfants: [{ titre: 'Version', valeurs: {}, enfants: [] }] } },
    ]);
    expect(resultat.restent).toEqual(['Garmin', 'Bitw', 'Perdue']);
    expect(compterLignes(resultat.converties.map((convertie) => convertie.ligne))).toBe(2);
  });

  it('prend le champ Description existant s’il est en texte, sinon un autre nom', () => {
    const config = { champs: [{ nom: 'Description', type: 'texte' as const }], tri: null, largeurs: {} };
    expect(champDeDescription(config)).toBe('Description');
    expect(avecDescription(config, 'Description')).toBe(config);
    const autre = { champs: [{ nom: 'Description', type: 'nombre' as const }], tri: null, largeurs: {} };
    expect(champDeDescription(autre)).toBe('Description 2');
    expect(avecDescription(autre, 'Description 2').champs.map((champ) => champ.nom)).toEqual(['Description', 'Description 2']);
  });
});
