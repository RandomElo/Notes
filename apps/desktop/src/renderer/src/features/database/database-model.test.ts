import { describe, expect, it } from 'vitest';
import type { BaseConfig } from '@notes/core';
import { avecChamp, avecChoixDeplace, avecCouleurDeChoix, avecLargeur, avecNouveauChoix, avecType, champDeLaCase, couleurDeChoix, couleurDEtat, ligneCochee, sansChamp, triSuivant, valeurDeLaCase } from './database-model';

describe('modèle de la base', () => {
  it('fait tourner le tri au clic sur une colonne', () => {
    expect(triSuivant(null, 'État')).toEqual({ champ: 'État', sens: 'croissant' });
    expect(triSuivant({ champ: 'État', sens: 'croissant' }, 'État')).toEqual({ champ: 'État', sens: 'decroissant' });
    expect(triSuivant({ champ: 'État', sens: 'decroissant' }, 'État')).toBeNull();
    expect(triSuivant({ champ: 'État', sens: 'decroissant' }, 'Page')).toEqual({ champ: 'Page', sens: 'croissant' });
  });

  it('donne la couleur d’un état, grise s’il n’est pas dans le thème', () => {
    const etats = [{ name: 'Fait', color: 'success' }, { name: 'Bloqué', color: '#ff0000' }];
    expect(couleurDEtat(etats, 'Fait')).toBe('var(--color-succes)');
    expect(couleurDEtat(etats, 'Bloqué')).toBe('#ff0000');
    expect(couleurDEtat(etats, 'Inconnu')).toBe('var(--color-discret)');
  });

  it('change le type d’un champ sans toucher aux autres', () => {
    const config = { champs: [{ nom: 'A', type: 'texte' as const }, { nom: 'B', type: 'etat' as const }], tri: null, largeurs: {} };
    expect(avecType(config, 'A', 'nombre').champs).toEqual([{ nom: 'A', type: 'nombre' }, { nom: 'B', type: 'etat' }]);
  });

  it('ajoute et retire un champ, le tri tombant avec lui', () => {
    const config = avecChamp({ champs: [{ nom: 'État', type: 'etat' }], tri: { champ: 'État', sens: 'croissant' }, largeurs: { État: 120 } }, ' Note ', 'texte');
    expect(config.champs.map((champ) => champ.nom)).toEqual(['État', 'Note']);
    expect(sansChamp(config, 'État')).toEqual({ champs: [{ nom: 'Note', type: 'texte' }], tri: null, largeurs: {} });
  });

  it('borne la largeur d’une colonne', () => {
    const config = { champs: [], tri: null, largeurs: {} };
    expect(avecLargeur(config, 'Page', 20.4).largeurs).toEqual({ Page: 60 });
    expect(avecLargeur(config, 'Page', 250.6).largeurs).toEqual({ Page: 251 });
  });

  it('un champ devenu « choix » prend les valeurs déjà écrites pour liste', () => {
    const config = { champs: [{ nom: 'Type', type: 'texte' as const }], tri: null, largeurs: {} };
    const choix = avecType(config, 'Type', 'choix', ['Code', ' Autre', 'Code', 'a|b']);
    expect(choix.champs).toEqual([{ nom: 'Type', type: 'choix', choix: [{ nom: 'Code', couleur: null }, { nom: 'Autre', couleur: null }] }]);
    expect(avecType(choix, 'Type', 'texte').champs).toEqual([{ nom: 'Type', type: 'texte' }]);
  });

  it('ajoute, déplace et colore un choix', () => {
    let config = avecType({ champs: [{ nom: 'Type', type: 'texte' as const }], tri: null, largeurs: {} }, 'Type', 'choix');
    config = avecNouveauChoix(avecNouveauChoix(avecNouveauChoix(config, 'Type', 'Code'), 'Type', ' Autre '), 'Type', 'Code');
    expect(config.champs[0]?.choix?.map((choix) => choix.nom)).toEqual(['Code', 'Autre']);
    config = avecChoixDeplace(config, 'Type', 'Autre', -1);
    expect(config.champs[0]?.choix?.map((choix) => choix.nom)).toEqual(['Autre', 'Code']);
    expect(couleurDeChoix(config.champs[0]!, 'Code')).toBe('var(--color-succes)');
    config = avecCouleurDeChoix(config, 'Type', 'Code', 'error');
    expect(couleurDeChoix(config.champs[0]!, 'Code')).toBe('var(--color-erreur)');
    expect(couleurDeChoix(config.champs[0]!, 'Ailleurs')).toBe('var(--color-discret)');
  });

  it('garde les lignes repliées quand un champ est retiré', () => {
    const repliees = ['0199a0b0-0000-7000-8000-000000000004'];
    expect(sansChamp({ champs: [{ nom: 'A', type: 'texte' }], tri: null, largeurs: {}, repliees }, 'A').repliees).toEqual(repliees);
  });
});

describe('case d’une base en liste', () => {
  const etats = [{ name: 'À faire', color: 'muted' }, { name: 'Fait', color: 'success' }] as never[];
  const base = (champs: BaseConfig['champs']): BaseConfig => ({ champs, tri: null, largeurs: {} });

  it('prend le premier champ case, sinon le premier champ état', () => {
    expect(champDeLaCase(base([{ nom: 'État', type: 'etat' }, { nom: 'Fait', type: 'case' }]))?.nom).toBe('Fait');
    expect(champDeLaCase(base([{ nom: 'Nom', type: 'texte' }, { nom: 'État', type: 'etat' }]))?.nom).toBe('État');
    expect(champDeLaCase(base([{ nom: 'Nom', type: 'texte' }]))).toBeNull();
  });

  it('coche et décoche un état par le dernier et le premier de la liste', () => {
    const champ = { nom: 'État', type: 'etat' } as const;
    expect([ligneCochee(champ, 'Fait', etats), ligneCochee(champ, 'À faire', etats), ligneCochee(champ, '', etats)]).toEqual([true, false, false]);
    expect([valeurDeLaCase(champ, true, etats), valeurDeLaCase(champ, false, etats)]).toEqual(['Fait', 'À faire']);
    expect(valeurDeLaCase({ nom: 'Fait', type: 'case' }, true, etats)).toBe('true');
  });
});
