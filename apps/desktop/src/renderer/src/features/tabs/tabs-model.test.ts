import { describe, expect, it } from 'vitest';
import { activer, ajouter, deplacer, estEtatDOnglets, etatInitial, fermer, fermerLesPages, ongletActif, ouvrir, remplacer, sansOnglet } from './tabs-model';
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

  it('un onglet affiché vide reçoit la page au lieu d’en ouvrir un autre', () => {
    const etat = ouvrir(ajouter(trois), 'd', true);
    expect(cles(etat)).toEqual(['a', 'b', 'd', 'c']);
  });
});

describe('deplacer et fermerLesPages', () => {
  it('déplace un onglet vers la place visée, sans changer l’onglet affiché', () => {
    expect(cles(deplacer(trois, 'o1', 3))).toEqual(['b', 'c', 'a']);
    expect(cles(deplacer(trois, 'o3', 0))).toEqual(['c', 'a', 'b']);
    expect(deplacer(trois, 'o2', 2)).toBe(trois);
    expect(deplacer(trois, 'o1', 3).actif).toBe('o2');
  });

  it('ferme les onglets des pages retirées', () => {
    const etat = fermerLesPages(trois, new Set(['b', 'c']));
    expect(cles(etat)).toEqual(['a']);
    expect(etat.actif).toBe('o1');
    expect(cles(fermerLesPages(trois, new Set(['a', 'b', 'c'])))).toEqual([]);
  });
});

describe('remplacer', () => {
  it('ferme l’autre onglet qui montrait la même page', () => {
    const etat = remplacer(trois, 'a');
    expect(cles(etat)).toEqual(['a', 'c']);
    expect(ongletActif(etat)?.id).toBe('o2');
  });

  it('vide l’onglet affiché', () => {
    expect(cles(remplacer(trois, null))).toEqual(['a', null, 'c']);
  });
});

describe('ajouter et fermer', () => {
  it('le « + » ajoute un onglet vide après l’onglet affiché', () => {
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

  it('le dernier onglet se ferme, même vide', () => {
    expect(fermer(etatInitial('a'), 'o1')).toEqual(sansOnglet);
    expect(fermer(etatInitial(null), 'o1')).toEqual(sansOnglet);
  });

  it('sans onglet, ouvrir une page en ouvre un', () => {
    expect(ongletActif(sansOnglet)).toBeNull();
    expect(ouvrir(sansOnglet, 'a')).toEqual(etatInitial('a'));
    expect(ouvrir(sansOnglet, 'a', true)).toEqual(etatInitial('a'));
    expect(remplacer(sansOnglet, 'a')).toEqual(etatInitial('a'));
    expect(remplacer(sansOnglet, null)).toBe(sansOnglet);
    expect(ajouter(sansOnglet)).toEqual(etatInitial(null));
  });

  it('l’état sans onglet est gardé d’un lancement à l’autre', () => {
    expect(estEtatDOnglets(sansOnglet)).toBe(true);
    expect(estEtatDOnglets({ onglets: [], actif: 'o1' })).toBe(false);
  });

  it('un onglet inconnu ne change rien', () => {
    expect(fermer(trois, 'o9')).toBe(trois);
    expect(activer(trois, 'o9')).toBe(trois);
  });
});

describe('parcours', () => {
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
