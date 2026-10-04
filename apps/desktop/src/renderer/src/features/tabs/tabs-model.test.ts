import { describe, expect, it } from 'vitest';
import { activer, ajouter, estEtatDOnglets, etatInitial, fermer, ongletActif, ouvrir, parNumero, remplacer, voisin } from './tabs-model';
import type { TabsState } from './tabs-model';

const cles = (etat: TabsState) => etat.onglets.map((onglet) => onglet.cle);
const trois: TabsState = {
  onglets: [
    { id: 'o1', cle: 'a' },
    { id: 'o2', cle: 'b' },
    { id: 'o3', cle: 'c' },
  ],
  actif: 'o2',
};

describe('ouvrir', () => {
  it('remplace la page de l’onglet affiché', () => {
    const etat = ouvrir(trois, 'd');
    expect(cles(etat)).toEqual(['a', 'd', 'c']);
    expect(etat.actif).toBe('o2');
  });

  it('ramène à l’onglet qui montre déjà la page', () => {
    expect(ouvrir(trois, 'c')).toEqual({ ...trois, actif: 'o3' });
    expect(ouvrir(trois, 'c', true)).toEqual({ ...trois, actif: 'o3' });
    expect(ouvrir(trois, 'b')).toBe(trois);
  });

  it('ouvre un nouvel onglet juste après l’onglet affiché si on le demande', () => {
    const etat = ouvrir(trois, 'd', true);
    expect(cles(etat)).toEqual(['a', 'b', 'd', 'c']);
    expect(ongletActif(etat)).toEqual({ id: 'o4', cle: 'd' });
  });
});

describe('remplacer', () => {
  it('ferme l’autre onglet qui montrait la même page', () => {
    const etat = remplacer(trois, 'a');
    expect(cles(etat)).toEqual(['a', 'c']);
    expect(ongletActif(etat).id).toBe('o2');
  });

  it('vide l’onglet affiché', () => {
    expect(cles(remplacer(trois, null))).toEqual(['a', null, 'c']);
  });
});

describe('ajouter et fermer', () => {
  it('Ctrl+T ajoute un onglet vide après l’onglet affiché', () => {
    const etat = ajouter(trois);
    expect(cles(etat)).toEqual(['a', 'b', null, 'c']);
    expect(etat.actif).toBe('o4');
  });

  it('fermer l’onglet affiché passe à son voisin de droite, ou de gauche en bout de liste', () => {
    expect(fermer(trois, 'o2')).toEqual({ onglets: [trois.onglets[0], trois.onglets[2]], actif: 'o3' });
    expect(fermer({ ...trois, actif: 'o3' }, 'o3').actif).toBe('o2');
  });

  it('fermer un autre onglet ne change pas l’onglet affiché', () => {
    expect(fermer(trois, 'o1')).toEqual({ onglets: [trois.onglets[1], trois.onglets[2]], actif: 'o2' });
  });

  it('le dernier onglet devient vide au lieu de se fermer', () => {
    expect(fermer(etatInitial('a'), 'o1')).toEqual(etatInitial(null));
    const vide = etatInitial(null);
    expect(fermer(vide, 'o1')).toBe(vide);
  });

  it('un onglet inconnu ne change rien', () => {
    expect(fermer(trois, 'o9')).toBe(trois);
    expect(activer(trois, 'o9')).toBe(trois);
  });
});

describe('parcours', () => {
  it('Ctrl+Tab et Ctrl+Maj+Tab tournent en boucle', () => {
    expect(voisin(trois, 1).actif).toBe('o3');
    expect(voisin({ ...trois, actif: 'o3' }, 1).actif).toBe('o1');
    expect(voisin({ ...trois, actif: 'o1' }, -1).actif).toBe('o3');
  });

  it('Ctrl+n va à l’onglet n s’il existe', () => {
    expect(parNumero(trois, 1).actif).toBe('o1');
    expect(parNumero(trois, 9)).toBe(trois);
  });

  it('les numéros d’onglet restent uniques', () => {
    const etat = ajouter(fermer(ajouter(trois), 'o1'));
    expect(new Set(etat.onglets.map((onglet) => onglet.id)).size).toBe(etat.onglets.length);
  });
});

describe('estEtatDOnglets', () => {
  it('accepte un état valide et refuse le reste', () => {
    expect(estEtatDOnglets(trois)).toBe(true);
    expect(estEtatDOnglets(null)).toBe(false);
    expect(estEtatDOnglets({ onglets: [], actif: 'o1' })).toBe(false);
    expect(estEtatDOnglets({ ...trois, actif: 'o9' })).toBe(false);
    expect(estEtatDOnglets({ onglets: [{ id: 'o1', cle: 3 }], actif: 'o1' })).toBe(false);
    expect(estEtatDOnglets({ onglets: [{ id: 'o1', cle: 'a' }, { id: 'o1', cle: 'b' }], actif: 'o1' })).toBe(false);
  });
});
