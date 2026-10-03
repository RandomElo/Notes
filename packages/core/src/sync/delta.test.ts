import { describe, expect, it } from 'vitest';
import { calculerDelta } from './delta';
import { chargerIndex, enregistrerIndex, indexVide } from './index-store';
import type { SyncIndex } from './index-store';
import { nomDeSauvegarde, estSauvegardeDeConflit } from './conflict';
import type { Releve } from './scan';
import { MemoryIndexStore } from '../testing/memory-fs';

const fichier = (modifieLe: number, taille = 1) => ({ estDossier: false, modifieLe, taille });
const dossier = { estDossier: true, modifieLe: 0, taille: 0 };
const hash = 'a'.repeat(64);

function index(fichiers: Record<string, [number, number]>, dossiers: string[] = []): SyncIndex {
  return {
    ...indexVide('cle'),
    fichiers: Object.fromEntries(Object.entries(fichiers).map(([chemin, [l, d]]) => [chemin, { local: { modifieLe: l, taille: 1 }, distant: { modifieLe: d, taille: 1 }, hash }])),
    dossiers,
  };
}

describe('calculerDelta', () => {
  it('décide d’après les dates et tailles connues', () => {
    const local: Releve = new Map([
      ['inchange', fichier(1)],
      ['modifie-ici', fichier(5)],
      ['modifie-la-bas', fichier(1)],
      ['les-deux', fichier(5)],
      ['efface-la-bas', fichier(1)],
      ['nouveau-ici', fichier(1)],
      ['efface-la-bas-modifie-ici', fichier(5)],
    ]);
    const distant: Releve = new Map([
      ['inchange', fichier(2)],
      ['modifie-ici', fichier(2)],
      ['modifie-la-bas', fichier(9)],
      ['les-deux', fichier(9)],
      ['efface-ici', fichier(2)],
      ['nouveau-la-bas', fichier(2)],
      ['efface-ici-modifie-la-bas', fichier(9)],
    ]);
    const connu = index({
      inchange: [1, 2],
      'modifie-ici': [1, 2],
      'modifie-la-bas': [1, 2],
      'les-deux': [1, 2],
      'efface-la-bas': [1, 2],
      'efface-ici': [1, 2],
      'efface-la-bas-modifie-ici': [1, 2],
      'efface-ici-modifie-la-bas': [1, 2],
      'efface-partout': [1, 2],
    });
    const { actions } = calculerDelta(local, distant, connu);
    const parChemin = Object.fromEntries(actions.map((action) => [action.chemin, action.type]));
    expect(parChemin).toEqual({
      'modifie-ici': 'pousser',
      'modifie-la-bas': 'tirer',
      'les-deux': 'comparer',
      'efface-la-bas': 'supprimerLocal',
      'efface-ici': 'supprimerDistant',
      'nouveau-ici': 'pousser',
      'nouveau-la-bas': 'tirer',
      'efface-la-bas-modifie-ici': 'pousser',
      'efface-ici-modifie-la-bas': 'tirer',
      'efface-partout': 'oublier',
    });
  });

  it('ordonne les dossiers : parents créés d’abord, enfants supprimés d’abord', () => {
    const local: Releve = new Map([
      ['N', dossier],
      ['N/O', dossier],
      ['V', dossier],
      ['V/W', dossier],
      ['V/W/f', fichier(1)],
    ]);
    const distant: Releve = new Map([['V/W/f', fichier(2)]]);
    const { actions } = calculerDelta(local, distant, index({ 'V/W/f': [1, 2] }, ['V', 'V/W']));
    expect(actions.map((action) => `${action.type} ${action.chemin}`)).toEqual([
      'creerDossierDistant N',
      'creerDossierDistant N/O',
      'supprimerDossierLocal V/W',
      'supprimerDossierLocal V',
    ]);
  });

  it('signale un fichier d’un côté et un dossier de l’autre', () => {
    const { actions } = calculerDelta(new Map([['x', fichier(1)]]), new Map([['x', dossier]]), indexVide('cle'));
    expect(actions).toEqual([{ type: 'incompatible', chemin: 'x' }]);
  });

  it('ignore l’index quand un côté n’a plus aucun fichier', () => {
    const delta = calculerDelta(new Map([['A', dossier]]), new Map([['A', dossier], ['A/page.md', fichier(2)]]), index({ 'A/page.md': [1, 2] }, ['A']));
    expect(delta.indexIgnore).toBe(true);
    expect(delta.actions).toEqual([{ type: 'tirer', chemin: 'A/page.md' }]);
  });
});

describe('index de sync', () => {
  it('se relit, et repart à vide sur une autre clé ou un contenu abîmé', async () => {
    const magasin = new MemoryIndexStore();
    const ecrit = index({ 'A/page.md': [1, 2] }, ['A']);
    await enregistrerIndex(magasin, ecrit);
    expect(await chargerIndex(magasin, 'cle')).toEqual(ecrit);
    expect(await chargerIndex(magasin, 'autre')).toEqual(indexVide('autre'));
    magasin.texte = '{ abîmé';
    expect(await chargerIndex(magasin, 'cle')).toEqual(indexVide('cle'));
  });
});

describe('sauvegardes de conflit', () => {
  const date = new Date(2026, 9, 3, 14, 15, 3);

  it('gardent le nom et l’extension du fichier', () => {
    expect(nomDeSauvegarde('page.md', date, [])).toBe('page.conflit-2026-10-03-141503.md');
    expect(nomDeSauvegarde('theme.toml', date, [])).toBe('theme.conflit-2026-10-03-141503.toml');
    expect(nomDeSauvegarde('.order', date, [])).toBe('.order.conflit-2026-10-03-141503');
    expect(nomDeSauvegarde('page.md', date, ['page.conflit-2026-10-03-141503.md'])).toBe('page.conflit-2026-10-03-141503-2.md');
  });

  it('se reconnaissent', () => {
    expect(estSauvegardeDeConflit('A/page.conflit-2026-10-03-141503.md')).toBe(true);
    expect(estSauvegardeDeConflit('.notes/theme.conflit-2026-10-03-141503-2.toml')).toBe(true);
    expect(estSauvegardeDeConflit('.order.conflit-2026-10-03-141503')).toBe(true);
    expect(estSauvegardeDeConflit('A/page.md')).toBe(false);
  });
});
