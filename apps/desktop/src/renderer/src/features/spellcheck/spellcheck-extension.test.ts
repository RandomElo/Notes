import { lireMarkdown } from '@notes/document';
import { EditorState } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { describe, expect, it, vi } from 'vitest';
import type { SpellIssue } from '../../../../shared/ipc-contract';
import { cleDeCorrection, creerPluginDeCorrection, fauteA } from './spellcheck-extension';
import { magasinDeCorrection } from './spellcheck-store';

vi.mock('../../lib/ipc', () => ({ api: {} }));

function etatDe(markdown: string): EditorState {
  return EditorState.create({ doc: lireMarkdown(markdown).document, plugins: [creerPluginDeCorrection()] });
}

const faute = (de: number, a: number, mot: string, nature: SpellIssue['nature'] = 'orthographe'): SpellIssue => ({
  de,
  a,
  mot,
  message: '',
  regle: nature === 'orthographe' ? 'FR_SPELLING_RULE' : 'A_ACCENT',
  nature,
  suggestions: [],
});

/** Envoie tous les blocs à vérifier, comme le ferait la vue, et rend l'état et les identifiants des envois. */
function envoyer(etat: EditorState): { etat: EditorState; envois: { id: number; debut: number; texte: string }[] } {
  const envois = cleDeCorrection.getState(etat)!.aVerifier.map((debut, indice) => ({ id: 100 + indice, debut, texte: etat.doc.nodeAt(debut)!.textContent }));
  return { etat: etat.apply(etat.tr.setMeta(cleDeCorrection, { genre: 'envoyer', envois })), envois };
}

const repondre = (etat: EditorState, id: number, fautes: SpellIssue[]): EditorState => etat.apply(etat.tr.setMeta(cleDeCorrection, { genre: 'resultat', id, fautes }));

describe('soulignement des fautes', () => {
  it("vérifie tous les blocs de texte à l'ouverture, pas le code", () => {
    const etat = etatDe('Un.\n\nDeux.\n\n```\ncode\n```\n');
    expect(cleDeCorrection.getState(etat)!.aVerifier).toHaveLength(2);
  });

  it('souligne la réponse au bon endroit', () => {
    const { etat, envois } = envoyer(etatDe('Il fesait beau.\n'));
    const apres = repondre(etat, envois[0]!.id, [faute(3, 9, 'fesait')]);
    const position = envois[0]!.debut + 1 + 4;
    expect(fauteA(apres, position)?.faute.mot).toBe('fesait');
    expect(apres.doc.textBetween(fauteA(apres, position)!.de, fauteA(apres, position)!.a)).toBe('fesait');
    expect(cleDeCorrection.getState(apres)!.aVerifier).toEqual([]);
  });

  it("jette une réponse pour un bloc modifié depuis l'envoi, et le revérifie", () => {
    const { etat, envois } = envoyer(etatDe('Il fesait beau.\n'));
    const modifie = etat.apply(etat.tr.insertText('!', etat.doc.content.size - 1));
    const apres = repondre(modifie, envois[0]!.id, [faute(3, 9, 'fesait')]);
    expect(cleDeCorrection.getState(apres)!.decorations.find()).toHaveLength(0);
    expect(cleDeCorrection.getState(apres)!.aVerifier).toEqual([envois[0]!.debut]);
  });

  it('retire le soulignement du mot retouché, garde les autres', () => {
    const { etat, envois } = envoyer(etatDe('Il fesait beau, a vélo.\n'));
    let apres = repondre(etat, envois[0]!.id, [faute(3, 9, 'fesait'), faute(16, 17, 'a', 'grammaire')]);
    const debut = envois[0]!.debut + 1;
    apres = apres.apply(apres.tr.insertText('i', debut + 4, debut + 5));
    const restantes = cleDeCorrection
      .getState(apres)!
      .decorations.find()
      .map((decoration) => apres.doc.textBetween(decoration.from, decoration.to));
    expect(restantes).toEqual(['a']);
  });

  it('ne souligne pas un mot du dictionnaire, même en début de phrase', () => {
    magasinDeCorrection.definirDictionnaire(['sequelize']);
    const { etat, envois } = envoyer(etatDe('Sequelize marche.\n'));
    const apres = repondre(etat, envois[0]!.id, [faute(0, 9, 'Sequelize')]);
    expect(cleDeCorrection.getState(apres)!.decorations.find()).toHaveLength(0);
    magasinDeCorrection.definirDictionnaire([]);
  });

  it('retire les fautes ignorées sans revérifier', () => {
    const { etat, envois } = envoyer(etatDe('Il fesait beau.\n'));
    let apres = repondre(etat, envois[0]!.id, [faute(3, 9, 'fesait')]);
    magasinDeCorrection.ignorer(faute(3, 9, 'fesait'));
    apres = apres.apply(apres.tr.setMeta(cleDeCorrection, { genre: 'filtrer' }));
    expect(cleDeCorrection.getState(apres)!.decorations.find()).toHaveLength(0);
    expect(cleDeCorrection.getState(apres)!.aVerifier).toEqual([]);
  });
});

describe('deux éditeurs ouverts en même temps', () => {
  it('ne se renvoient pas leurs nombres de fautes sans fin (écran gris à la création d’une page)', () => {
    // La vue du plugin sans navigateur : une fausse vue suffit, et ses minuteurs ne partent jamais.
    vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined });
    const pret = { installation: 'installee', serveur: 'pret', dossier: '', taille: 0, etapes: [] } as unknown as Parameters<typeof magasinDeCorrection.definirEtat>[0];
    magasinDeCorrection.definirEtat(pret);
    const ouvrir = (etat: EditorState, plugin: ReturnType<typeof creerPluginDeCorrection>) => {
      const vue = { state: etat, isDestroyed: false, dispatch: (tr: Transaction) => (vue.state = vue.state.apply(tr)) };
      return plugin.spec.view!(vue as unknown as EditorView);
    };
    // Une page avec une faute soulignée, une autre sans : leurs nombres diffèrent.
    const plugin = creerPluginDeCorrection();
    const doc = lireMarkdown('Il fesait beau.\n').document;
    let avecFaute = EditorState.create({ doc, plugins: [plugin] });
    const envois = cleDeCorrection.getState(avecFaute)!.aVerifier.map((debut, indice) => ({ id: indice + 1, debut, texte: avecFaute.doc.nodeAt(debut)!.textContent }));
    avecFaute = avecFaute.apply(avecFaute.tr.setMeta(cleDeCorrection, { genre: 'envoyer', envois }));
    avecFaute = avecFaute.apply(avecFaute.tr.setMeta(cleDeCorrection, { genre: 'resultat', id: 1, fautes: [faute(3, 8, 'fesèt')] }));
    expect(cleDeCorrection.getState(avecFaute)!.decorations.find()).toHaveLength(1);
    const premier = ouvrir(avecFaute, plugin);
    const second = ouvrir(etatDe('Rien à redire.\n'), creerPluginDeCorrection());
    expect(() => magasinDeCorrection.definirEtat({ ...pret })).not.toThrow();
    premier.destroy?.();
    second.destroy?.();
    vi.unstubAllGlobals();
  });
});
