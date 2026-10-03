import { champsDuTheme, themeParDefaut } from '@notes/ui';
import { describe, expect, it } from 'vitest';
import { decouperTaille, policeDeValeur, prefixesMasques, sectionsDuFormulaire, surSixChiffres, valeurDePolice } from './theme-form-model';

describe('formulaire du thème', () => {
  it('montre chaque réglage du thème une fois, sauf ceux qui n’ont pas encore d’effet', () => {
    const montres = sectionsDuFormulaire.flatMap((section) => section.champs.map((champ) => champ.chemin));
    expect(new Set(montres).size).toBe(montres.length);
    const attendus = champsDuTheme.map((champ) => champ.chemin).filter((chemin) => !prefixesMasques.some((prefixe) => chemin.startsWith(prefixe)));
    expect([...montres].sort()).toEqual([...attendus].sort());
  });

  it('met les titres en premier, puis le texte, puis la palette', () => {
    expect(sectionsDuFormulaire.slice(0, 7).map((section) => section.titre)).toEqual(['Titre 1', 'Titre 2', 'Titre 3', 'Titre 4', 'Titre 5', 'Texte', 'Palette']);
    expect(sectionsDuFormulaire[0]?.champs[0]?.chemin).toBe('heading.h1.color');
  });

  it('écrit une police choisie avec son repli, et la retrouve', () => {
    expect(valeurDePolice('Noto Sans', 'texte')).toBe("'Noto Sans', sans-serif");
    expect(valeurDePolice('Fira Code', 'code')).toBe("'Fira Code', monospace");
    expect(policeDeValeur("'Noto Sans', sans-serif", 'texte')).toBe('Noto Sans');
    // La police du système, ou une valeur écrite à la main, n'est pas une police de la liste.
    expect(policeDeValeur(themeParDefaut.typography.font, 'texte')).toBeNull();
    expect(policeDeValeur("'Comic Sans', sans-serif", 'texte')).toBeNull();
    expect(policeDeValeur("'Fira Code', monospace", 'texte')).toBeNull();
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
