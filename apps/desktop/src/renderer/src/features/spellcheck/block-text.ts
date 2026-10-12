import type { Node as NoeudPm } from '@tiptap/pm/model';
import type { SpellcheckRequest } from '../../../../shared/ipc-contract';

/** Ce qui tient la place d'un nœud en ligne sans texte (mention, saut de ligne) : un caractère, comme sa taille dans le document. */
export const caractereDeRemplacement = '\uFFFC';

/** Adresses écrites en clair dans le texte : jamais vérifiées (docs/spec/correction.md). */
const adresse = /\b(?:https?:\/\/|www\.)[^\s<>"]+|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi;

/** Vrai pour un bloc dont le texte se vérifie : un bloc de texte qui n'est pas du code. */
export function estBlocAVerifier(noeud: NoeudPm): boolean {
  return noeud.isTextblock && noeud.type.spec.code !== true;
}

/**
 * Texte d'un bloc tel qu'il part à LanguageTool, et ce qui en est exclu : code
 * en ligne, adresses, mentions et autres nœuds sans texte. Chaque caractère du
 * texte correspond à une position du bloc : la position d'un caractère est
 * `debutDuBloc + 1 + indice`.
 */
export function texteDuBloc(bloc: NoeudPm): SpellcheckRequest {
  let texte = '';
  const exclus: [number, number][] = [];
  const exclure = (de: number, a: number): void => {
    exclus.push([de, a]);
  };
  bloc.forEach((enfant) => {
    const debut = texte.length;
    if (enfant.isText) {
      texte += enfant.text ?? '';
      if (enfant.marks.some((marque) => marque.type.spec.code === true || marque.type.name === 'code')) {
        exclure(debut, texte.length);
      }
    } else {
      texte += caractereDeRemplacement.repeat(enfant.nodeSize);
      exclure(debut, texte.length);
    }
  });
  for (const trouve of texte.matchAll(adresse)) {
    exclure(trouve.index, trouve.index + trouve[0].length);
  }
  exclus.sort((x, y) => x[0] - y[0]);
  // Une adresse peut chevaucher du code ou toucher une mention : les plages qui se touchent n'en font qu'une.
  const fusionnes: [number, number][] = [];
  for (const plage of exclus) {
    const derniere = fusionnes.at(-1);
    if (derniere !== undefined && derniere[1] >= plage[0]) {
      derniere[1] = Math.max(derniere[1], plage[1]);
    } else {
      fusionnes.push([plage[0], plage[1]]);
    }
  }
  return { texte, exclus: fusionnes };
}

/** Vrai si le bloc n'a rien à vérifier (vide, ou tout exclu). */
export function rienAVerifier({ texte, exclus }: SpellcheckRequest): boolean {
  let restant = texte.length;
  for (const [de, a] of exclus) {
    restant -= a - de;
  }
  return restant === 0 || texte.trim() === '';
}
