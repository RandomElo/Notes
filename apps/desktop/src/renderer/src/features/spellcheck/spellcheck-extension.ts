import { Extension } from '@tiptap/core';
import type { Node as NoeudPm } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { SpellcheckRequest, SpellIssue } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { estBlocAVerifier, rienAVerifier, texteDuBloc } from './block-text';
import { correctionPrete, fauteAMontrer, magasinDeCorrection } from './spellcheck-store';

/** Temps sans frappe avant de vérifier les blocs modifiés (docs/spec/correction.md). */
export const delaiDeVerificationMs = 800;
/** Blocs vérifiés en même temps : une page entière ne doit pas noyer le serveur. */
const verificationsSimultanees = 3;

interface Envoi {
  id: number;
  /** Position avant le bloc, suivie à travers les modifications. */
  debut: number;
  texte: string;
}

interface EtatDeCorrection {
  decorations: DecorationSet;
  /** Blocs modifiés depuis leur dernière vérification (position avant le bloc). */
  aVerifier: number[];
  envois: Envoi[];
}

type Action = { genre: 'envoyer'; envois: Envoi[] } | { genre: 'resultat'; id: number; fautes: SpellIssue[] | null } | { genre: 'tout-revoir' } | { genre: 'filtrer' };

export const cleDeCorrection = new PluginKey<EtatDeCorrection>('correction-orthographique');

/** Une faute soulignée, avec sa place dans le document. */
export interface FauteSoulignee {
  de: number;
  a: number;
  faute: SpellIssue;
}

/** Les blocs à vérifier entre deux positions (tout le document par défaut). */
function blocsEntre(document: NoeudPm, de = 0, a = document.content.size): number[] {
  const trouves: number[] = [];
  document.nodesBetween(Math.max(0, de), Math.min(a, document.content.size), (noeud, position) => {
    if (estBlocAVerifier(noeud)) {
      trouves.push(position);
      return false;
    }
    return !noeud.isTextblock;
  });
  return trouves;
}

const sansDoublon = (positions: number[]): number[] => [...new Set(positions)].sort((x, y) => x - y);

/** Plages du document final touchées par une transaction. */
function plagesModifiees(transaction: Transaction): [number, number][] {
  const plages: [number, number][] = [];
  transaction.mapping.maps.forEach((carte, indice) => {
    const suite = transaction.mapping.slice(indice + 1);
    carte.forEach((_ancienDebut, _ancienneFin, debut, fin) => {
      plages.push([suite.map(debut, -1), suite.map(fin, 1)]);
    });
  });
  return plages;
}

function decorationsDe(debut: number, fautes: SpellIssue[]): Decoration[] {
  const snapshot = magasinDeCorrection.lire();
  return fautes
    .filter((faute) => fauteAMontrer(faute, snapshot))
    .map((faute) =>
      Decoration.inline(debut + 1 + faute.de, debut + 1 + faute.a, { class: faute.nature === 'orthographe' ? 'faute-orthographe' : 'faute-grammaire' }, { faute }),
    );
}

function appliquer(transaction: Transaction, ancien: EtatDeCorrection): EtatDeCorrection {
  let { decorations, aVerifier, envois } = ancien;
  const document = transaction.doc;
  if (transaction.docChanged) {
    decorations = decorations.map(transaction.mapping, document);
    aVerifier = aVerifier.flatMap((position) => {
      const resultat = transaction.mapping.mapResult(position, 1);
      return resultat.deleted ? [] : [resultat.pos];
    });
    envois = envois.map((envoi) => ({ ...envoi, debut: transaction.mapping.map(envoi.debut, 1) }));
    for (const [de, a] of plagesModifiees(transaction)) {
      // Un mot qu'on retouche perd son soulignement tout de suite ; il revient après vérification s'il est toujours faux.
      decorations = decorations.remove(decorations.find(de, a));
      aVerifier.push(...blocsEntre(document, de, a));
    }
    aVerifier = sansDoublon(aVerifier.filter((position) => position <= document.content.size));
  }
  const action = transaction.getMeta(cleDeCorrection) as Action | undefined;
  if (action === undefined) {
    return { decorations, aVerifier, envois };
  }
  switch (action.genre) {
    case 'envoyer': {
      const envoyes = new Set(action.envois.map((envoi) => envoi.debut));
      return { decorations, aVerifier: aVerifier.filter((position) => !envoyes.has(position)), envois: [...envois, ...action.envois] };
    }
    case 'resultat': {
      const envoi = envois.find((candidat) => candidat.id === action.id);
      const restants = envois.filter((candidat) => candidat.id !== action.id);
      const bloc = envoi === undefined ? null : document.nodeAt(envoi.debut);
      // Le bloc a changé depuis l'envoi : il est déjà repassé dans « à vérifier », la réponse ne vaut plus.
      if (envoi === undefined || action.fautes === null || bloc === null || !estBlocAVerifier(bloc) || texteDuBloc(bloc).texte !== envoi.texte) {
        return { decorations, aVerifier, envois: restants };
      }
      const anciennes = decorations.find(envoi.debut + 1, envoi.debut + bloc.nodeSize - 1);
      decorations = decorations.remove(anciennes).add(document, decorationsDe(envoi.debut, action.fautes));
      return { decorations, aVerifier, envois: restants };
    }
    case 'tout-revoir':
      return { decorations, aVerifier: blocsEntre(document), envois };
    case 'filtrer': {
      const snapshot = magasinDeCorrection.lire();
      const gardees = decorations.find().filter((decoration) => fauteAMontrer((decoration.spec as { faute: SpellIssue }).faute, snapshot));
      return { decorations: DecorationSet.create(document, gardees), aVerifier, envois };
    }
  }
}

/** La faute soulignée à cette position, s'il y en a une. */
export function fauteA(etat: EditorState, position: number): FauteSoulignee | null {
  const decorations = cleDeCorrection.getState(etat)?.decorations;
  const decoration = decorations?.find(position, position).find((candidate) => candidate.from <= position && position <= candidate.to);
  return decoration === undefined ? null : { de: decoration.from, a: decoration.to, faute: (decoration.spec as { faute: SpellIssue }).faute };
}

/** Nombre de fautes soulignées. */
function compter(etat: EditorState): number {
  return cleDeCorrection.getState(etat)?.decorations.find().length ?? 0;
}

/** Toutes les fautes soulignées, dans l'ordre de la page. */
export function fautesDeLaPage(etat: EditorState): FauteSoulignee[] {
  const decorations = cleDeCorrection.getState(etat)?.decorations.find() ?? [];
  return decorations
    .map((decoration) => ({ de: decoration.from, a: decoration.to, faute: (decoration.spec as { faute: SpellIssue }).faute }))
    .sort((x, y) => x.de - y.de);
}

/** L'éditeur de la page ouverte, pour la liste des fautes ouverte depuis la barre de statut. */
let vueOuverte: EditorView | null = null;

export function vueDeLaPageOuverte(): EditorView | null {
  return vueOuverte !== null && !vueOuverte.isDestroyed ? vueOuverte : null;
}

/** Envoie au main les blocs à vérifier, quelques-uns à la fois, et pose les réponses. */
function verifier(vue: EditorView, prochainId: () => number): void {
  const etat = cleDeCorrection.getState(vue.state);
  if (etat === undefined || etat.aVerifier.length === 0 || !correctionPrete(magasinDeCorrection.lire())) {
    return;
  }
  const demandes: { envoi: Envoi; demande: SpellcheckRequest }[] = [];
  for (const debut of etat.aVerifier) {
    const bloc = vue.state.doc.nodeAt(debut);
    if (bloc !== null && estBlocAVerifier(bloc)) {
      const demande = texteDuBloc(bloc);
      demandes.push({ envoi: { id: prochainId(), debut, texte: demande.texte }, demande });
    }
  }
  vue.dispatch(vue.state.tr.setMeta(cleDeCorrection, { genre: 'envoyer', envois: demandes.map(({ envoi }) => envoi) } satisfies Action).setMeta('addToHistory', false));
  const repondre = (id: number, fautes: SpellIssue[] | null): void => {
    if (!vue.isDestroyed) {
      vue.dispatch(vue.state.tr.setMeta(cleDeCorrection, { genre: 'resultat', id, fautes } satisfies Action).setMeta('addToHistory', false));
    }
  };
  const file = [...demandes];
  const suivante = async (): Promise<void> => {
    for (let element = file.shift(); element !== undefined; element = file.shift()) {
      const { envoi, demande } = element;
      if (rienAVerifier(demande)) {
        repondre(envoi.id, []);
        continue;
      }
      const fautes = await api.verifierOrthographe(demande).catch(() => null);
      repondre(envoi.id, fautes);
    }
  };
  for (let fil = 0; fil < verificationsSimultanees; fil++) {
    void suivante();
  }
}

/**
 * Correction orthographique dans l'éditeur (docs/spec/correction.md) : chaque bloc modifié
 * est vérifié 800 ms après la dernière frappe, jamais la page entière d'un
 * coup sauf à l'ouverture. Rouge pour l'orthographe, bleu pour le reste. Les
 * soulignements ne sont que de l'affichage : le document n'est pas modifié.
 * Sans LanguageTool prêt, rien n'est souligné et rien n'attend.
 */
export const SpellcheckDecorations = Extension.create({
  name: 'correctionOrthographique',

  addProseMirrorPlugins() {
    return [creerPluginDeCorrection()];
  },
});

/** Le plugin seul, pour l'éditeur et pour les tests (sans vue, rien n'est envoyé). */
export function creerPluginDeCorrection(): Plugin<EtatDeCorrection> {
  let compteur = 0;
  const prochainId = (): number => ++compteur;
  return new Plugin<EtatDeCorrection>({
    key: cleDeCorrection,
    state: {
      init: (_configuration, etat) => ({ decorations: DecorationSet.empty, aVerifier: blocsEntre(etat.doc), envois: [] }),
      apply: appliquer,
    },
    props: {
      decorations: (etat) => cleDeCorrection.getState(etat)?.decorations,
    },
    view: (vue) => {
      let minuteur: number | undefined;
      const planifier = (): void => {
        window.clearTimeout(minuteur);
        minuteur = window.setTimeout(() => verifier(vue, prochainId), delaiDeVerificationMs);
      };
      vueOuverte = vue;
      let snapshot = magasinDeCorrection.lire();
      let dernieres: DecorationSet | undefined;
      const publier = (): void => {
        const decorations = cleDeCorrection.getState(vue.state)?.decorations;
        const modifiees = decorations !== dernieres;
        dernieres = decorations;
        magasinDeCorrection.definirFautes(correctionPrete(magasinDeCorrection.lire()) ? compter(vue.state) : null, modifiees);
      };
      const desabonner = magasinDeCorrection.abonner(() => {
        // L'état vu est noté avant d'agir : la transaction publie les fautes, ce qui rappelle cet abonné.
        const ancien = snapshot;
        const nouveau = magasinDeCorrection.lire();
        snapshot = nouveau;
        if (correctionPrete(nouveau) && !correctionPrete(ancien)) {
          vue.dispatch(vue.state.tr.setMeta(cleDeCorrection, { genre: 'tout-revoir' } satisfies Action).setMeta('addToHistory', false));
        } else if (nouveau.dictionnaire !== ancien.dictionnaire || nouveau.ignores !== ancien.ignores) {
          vue.dispatch(vue.state.tr.setMeta(cleDeCorrection, { genre: 'filtrer' } satisfies Action).setMeta('addToHistory', false));
        }
        publier();
      });
      planifier();
      publier();
      return {
        update: (vueAJour, ancienEtat) => {
          const avant = cleDeCorrection.getState(ancienEtat);
          const apres = cleDeCorrection.getState(vueAJour.state);
          if (apres !== undefined && apres !== avant && apres.aVerifier.length > 0 && (vueAJour.state.doc !== ancienEtat.doc || apres.aVerifier !== avant?.aVerifier)) {
            planifier();
          }
          publier();
        },
        destroy: () => {
          window.clearTimeout(minuteur);
          desabonner();
          if (vueOuverte === vue) {
            vueOuverte = null;
          }
          magasinDeCorrection.definirFautes(null, true);
        },
      };
    },
  });
}
