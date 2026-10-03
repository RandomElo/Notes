import { assemblerVersions, comparerVersions } from '@notes/document';
import { describe, expect, it } from 'vitest';
import { blocsRetenus, choisirBloc, creerEtat, deplacerBloc, deplacerMorceau, garderTexte, recommencerTexte, restantes, retirerMorceau, toutPrendre } from './conflict-model';

const pageA = ['# Semaine', '', 'Sortie longue dimanche : 18 km, puis footing.', '', '- Jeudi : 3 × 3 km', '', 'Fin', ''].join('\n');
const pageB = ['# Semaine', '', 'Sortie longue dimanche : 20 km, puis footing.', '', '* Jeudi : 2 × 5 km', '', 'Fin', ''].join('\n');

function monter() {
  const etat = creerEtat(comparerVersions(pageA, pageB));
  const texte = etat.find((ligne) => ligne.genre === 'texte')!;
  const bloc = etat.find((ligne) => ligne.genre === 'bloc')!;
  return { etat, texte: texte.id, bloc: bloc.id };
}

describe('écran des conflits', () => {
  it('compte les différences à régler', () => {
    const { etat, bloc, texte } = monter();
    expect(restantes(etat)).toBe(2);
    expect(restantes(garderTexte(choisirBloc(etat, bloc, 'a'), texte, 'b'))).toBe(0);
  });

  it('rend une version entière, à l’octet près, quand on prend tout d’un côté', () => {
    const { etat } = monter();
    expect(assemblerVersions(blocsRetenus(toutPrendre(etat, 'a')), pageA, pageB)).toBe(pageA);
    expect(assemblerVersions(blocsRetenus(toutPrendre(etat, 'b')), pageA, pageB)).toBe(pageB);
  });

  it('garde les deux passages d’un paragraphe, B après A, ou placés à la main', () => {
    const { etat, texte } = monter();
    expect(blocsRetenus(garderTexte(etat, texte, 'affiche'))[1]).toBe('Sortie longue dimanche : 18 km, 20 km, puis footing.');
    // Le passage B (position 5) placé avant « dimanche » (position 2).
    const place = deplacerMorceau(etat, texte, 5, 2);
    expect(blocsRetenus(place)[1]).toBe('Sortie longue 20 km, dimanche : 18 km, puis footing.');
    expect(restantes(place)).toBe(1);
    expect(blocsRetenus(retirerMorceau(etat, texte, 4))[1]).toBe('Sortie longue dimanche : 20 km, puis footing.');
    expect(restantes(recommencerTexte(place, texte))).toBe(2);
  });

  it('garde un bloc des deux côtés, B après A', () => {
    const { etat, bloc } = monter();
    expect(blocsRetenus(choisirBloc(etat, bloc, 'ab')).slice(2, 4)).toEqual(['- Jeudi : 3 × 3 km', '* Jeudi : 2 × 5 km']);
    expect(blocsRetenus(choisirBloc(etat, bloc, 'aucun'))).not.toContain('- Jeudi : 3 × 3 km');
  });

  it('pose une version ailleurs par sa poignée, et garde d’office celle restée en place', () => {
    const { etat, bloc } = monter();
    const { etat: deplace, id } = deplacerBloc(etat, bloc, 'b', 0);
    expect(deplace[0]).toMatchObject({ id, genre: 'bloc', a: null, b: '* Jeudi : 2 × 5 km', choix: 'b', deplace: true });
    expect(deplace.find((ligne) => ligne.id === bloc)).toMatchObject({ a: '- Jeudi : 3 × 3 km', b: null, choix: 'a' });
    expect(blocsRetenus(deplace)[0]).toBe('* Jeudi : 2 × 5 km');
    expect(restantes(deplace)).toBe(1);
  });

  it('ne reprend pas une version restée en place qui avait été écartée', () => {
    const { etat, bloc } = monter();
    const { etat: deplace } = deplacerBloc(choisirBloc(etat, bloc, 'b'), bloc, 'b', 0);
    expect(deplace.find((ligne) => ligne.id === bloc)).toMatchObject({ choix: 'aucun' });
    expect(blocsRetenus(deplace)).not.toContain('- Jeudi : 3 × 3 km');
  });

  it('déplace un bloc seul plusieurs fois sans le dédoubler', () => {
    const { etat, bloc } = monter();
    const premier = deplacerBloc(etat, bloc, 'b', etat.length);
    const second = deplacerBloc(premier.etat, premier.id, 'b', 0);
    expect(second.etat.filter((ligne) => ligne.genre === 'bloc' && ligne.b !== null)).toHaveLength(1);
    expect(second.etat[0]?.id).toBe(second.id);
  });
});
