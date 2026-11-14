import { describe, expect, it } from 'vitest';
import { couleurDuChoix, lireConfigDeBase, lireValeurs, valeurPourLeChamp } from './database';
import { modifierEnTete } from './front-matter';

describe('configuration d’une base dans l’en-tête', () => {
  it('note une base sans pages, dont les lignes repliées sont des chemins de titres', () => {
    const enTete = modifierEnTete('id: x', { base: { champs: [], tri: null, largeurs: {}, repliees: ['Claude / Notes'], lignes: 'tableau' } });
    expect(enTete).toContain('  collapsed:\n    - Claude / Notes\n  rows: table');
    expect(lireConfigDeBase(enTete)).toEqual({ champs: [], tri: null, largeurs: {}, repliees: ['Claude / Notes'], lignes: 'tableau' });
    // Une base à pages n'accepte que des identifiants.
    expect(lireConfigDeBase('base:\n  fields: []\n  collapsed: [Claude / Notes]')?.repliees).toEqual([]);
  });

  it('lit un champ « choix » et ses valeurs, sans doublon ni couleur inconnue', () => {
    const enTete = 'base:\n  fields:\n    - {name: Type, type: select, options: [{name: Code, color: success}, {name: Autre}, {name: Code}, {name: Cours, color: rose}, {name: "a|b"}]}';
    const config = lireConfigDeBase(enTete)!;
    expect(config.champs).toEqual([{ nom: 'Type', type: 'choix', choix: [{ nom: 'Code', couleur: 'success' }, { nom: 'Autre', couleur: null }, { nom: 'Cours', couleur: null }] }]);
    // Sans couleur réglée, celle de la place dans la liste ; hors de la liste, aucune.
    expect([couleurDuChoix(config.champs[0]!, 'Code'), couleurDuChoix(config.champs[0]!, 'Autre'), couleurDuChoix(config.champs[0]!, 'Cours'), couleurDuChoix(config.champs[0]!, 'Ailleurs')]).toEqual(['success', 'success', 'warning', null]);
    expect(modifierEnTete('id: x', { base: config })).toContain('    - {name: Type, type: select, options: [{name: Code, color: success}, {name: Autre}, {name: Cours}]}');
  });

  it('s’écrit lisiblement et se relit', () => {
    const enTete = modifierEnTete('id: x\ntitle: Projets', {
      base: { champs: [{ nom: 'État', type: 'etat' }, { nom: 'Priorité', type: 'nombre' }, { nom: 'Contact', type: 'courriel' }], tri: { champ: 'Priorité', sens: 'decroissant' }, largeurs: {} },
    });
    expect(enTete).toBe('id: x\ntitle: Projets\nbase:\n  fields:\n    - {name: État, type: state}\n    - {name: Priorité, type: number}\n    - {name: Contact, type: email}\n  sort:\n    field: Priorité\n    order: desc');
    expect(lireConfigDeBase(enTete)).toEqual({
      champs: [{ nom: 'État', type: 'etat' }, { nom: 'Priorité', type: 'nombre' }, { nom: 'Contact', type: 'courriel' }],
      tri: { champ: 'Priorité', sens: 'decroissant' },
      largeurs: {},
      repliees: [],
    });
  });

  it('garde les lignes repliées par identifiant, et ignore ce qui n\'en est pas un', () => {
    const id = '0199a0b0-0000-7000-8000-000000000004';
    const enTete = modifierEnTete('id: x', { base: { champs: [], tri: null, largeurs: {}, repliees: [id] } });
    expect(enTete).toContain(`  collapsed:\n    - ${id}`);
    expect(lireConfigDeBase(enTete)?.repliees).toEqual([id]);
    expect(lireConfigDeBase(`base:\n  fields: []\n  collapsed: [${id}, ${id}, Projets/Site, 12]`)?.repliees).toEqual([id]);
    // Rien de replié : la clé ne s'écrit pas.
    expect(modifierEnTete('id: x', { base: { champs: [], tri: null, largeurs: {}, repliees: [] } })).not.toContain('collapsed');
  });

  it('garde la largeur des colonnes connues, dans les bornes', () => {
    const enTete = modifierEnTete('id: x', { base: { champs: [{ nom: 'État', type: 'etat' }], tri: null, largeurs: { Page: 240, État: 120 } } });
    expect(enTete).toContain('  widths:\n    Page: 240\n    État: 120');
    expect(lireConfigDeBase(enTete)?.largeurs).toEqual({ Page: 240, État: 120 });
    expect(lireConfigDeBase('base:\n  fields: []\n  widths: { Page: 20, Autre: 200 }')?.largeurs).toEqual({});
  });

  it('écarte un champ mal formé, en double ou nommé « Page », et un tri sur un champ absent', () => {
    const enTete = 'base:\n  fields:\n    - { name: A, type: text }\n    - { name: A, type: number }\n    - { name: Page, type: text }\n    - { name: B, type: inconnu }\n  sort: { field: B, order: asc }';
    expect(lireConfigDeBase(enTete)).toEqual({ champs: [{ nom: 'A', type: 'texte' }], tri: null, largeurs: {}, repliees: [] });
    expect(lireConfigDeBase('title: x')).toBeNull();
  });
});

describe('valeurs d’une ligne', () => {
  it('s’écrivent dans props et se relisent en texte, une liste vide retire la clé', () => {
    const enTete = modifierEnTete('id: x', { valeurs: { État: 'Fait', Priorité: '2', Fait: 'true' } });
    expect(lireValeurs(enTete)).toEqual({ État: 'Fait', Priorité: '2', Fait: 'true' });
    expect(modifierEnTete(enTete, { valeurs: {} })).toBe('id: x');
  });

  it('sont ramenées à la forme du champ', () => {
    expect(valeurPourLeChamp('nombre', ' 3,5 ')).toEqual({ ok: true, valeur: '3.5' });
    expect(valeurPourLeChamp('nombre', 'trois').ok).toBe(false);
    expect(valeurPourLeChamp('case', 'false')).toEqual({ ok: true, valeur: null });
    expect(valeurPourLeChamp('courriel', 'eloi@exemple.fr')).toEqual({ ok: true, valeur: 'eloi@exemple.fr' });
    expect(valeurPourLeChamp('courriel', 'eloi').ok).toBe(false);
    expect(valeurPourLeChamp('texte', '  ')).toEqual({ ok: true, valeur: null });
  });
});

describe('vue d’une base', () => {
  it('note la vue en liste et la relit ; le tableau est la vue par défaut', () => {
    const enTete = modifierEnTete('id: x', { base: { champs: [], tri: null, largeurs: {}, vue: 'liste' } });
    expect(enTete).toContain('  view: list');
    expect(lireConfigDeBase(enTete)?.vue).toBe('liste');
    expect(lireConfigDeBase('base:\n  fields: []')?.vue).toBeUndefined();
    expect(lireConfigDeBase('base:\n  fields: []\n  view: autre')?.vue).toBeUndefined();
  });
});
