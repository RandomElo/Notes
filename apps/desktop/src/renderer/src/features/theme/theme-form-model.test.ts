import { champsDuTheme } from '@notes/ui';
import { describe, expect, it } from 'vitest';
import { decouperTaille, prefixesMasques, sectionsDuFormulaire, surSixChiffres } from './theme-form-model';

describe('formulaire du thème', () => {
  it('montre chaque réglage du thème une fois, sauf ceux qui n’ont pas encore d’effet', () => {
    const montres = sectionsDuFormulaire.flatMap((section) => section.champs.map((champ) => champ.chemin));
    expect(new Set(montres).size).toBe(montres.length);
    const attendus = champsDuTheme.map((champ) => champ.chemin).filter((chemin) => !prefixesMasques.some((prefixe) => chemin.startsWith(prefixe)));
    expect([...montres].sort()).toEqual([...attendus].sort());
  });

  it('découpe une taille en nombre et unité', () => {
    expect(decouperTaille('1.3rem')).toEqual({ nombre: '1.3', unite: 'rem' });
    expect(decouperTaille('20px')).toEqual({ nombre: '20', unite: 'px' });
    expect(decouperTaille('.5em')).toEqual({ nombre: '.5', unite: 'em' });
    expect(decouperTaille('grand')).toBeNull();
  });

  it('ramène une couleur à six chiffres pour le sélecteur', () => {
    expect(surSixChiffres('#FFF')).toBe('#ffffff');
    expect(surSixChiffres('#7aa2f7')).toBe('#7aa2f7');
    expect(surSixChiffres('#7aa2f780')).toBe('#7aa2f7');
    expect(surSixChiffres('accent')).toBeNull();
  });
});
