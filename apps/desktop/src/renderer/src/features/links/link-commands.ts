import { estAdresseWeb, idDeLienInterne, libelleDAdresse } from '@notes/document';
import { getMarkRange } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/** Un lien du texte : sa plage, son texte et son adresse. */
export interface LinkRange {
  de: number;
  a: number;
  texte: string;
  adresse: string;
  /** Titre Markdown du lien : `mention` pour une mention de site. */
  titre: string | null;
}

/** Le lien qui couvre la position « position » (ou qui la touche à droite), null s'il n'y en a pas. */
export function lienA(etat: EditorState, position: number): LinkRange | null {
  const type = etat.schema.marks['link'];
  if (type === undefined) {
    return null;
  }
  const $position = etat.doc.resolve(position);
  const plage = getMarkRange($position, type) ?? (position < etat.doc.content.size ? getMarkRange(etat.doc.resolve(position + 1), type) : undefined);
  if (plage === undefined) {
    return null;
  }
  const marque = etat.doc.nodeAt(plage.from)?.marks.find((candidate) => candidate.type === type);
  return {
    de: plage.from,
    a: plage.to,
    texte: etat.doc.textBetween(plage.from, plage.to),
    adresse: String(marque?.attrs['href'] ?? ''),
    titre: typeof marque?.attrs['title'] === 'string' ? (marque.attrs['title'] as string) : null,
  };
}

/** Les liens du document vers « adresse », dans l'ordre. */
export function liensVers(etat: EditorState, adresse: string): LinkRange[] {
  const liens: LinkRange[] = [];
  etat.doc.descendants((noeud, position) => {
    const marque = noeud.isText ? noeud.marks.find((candidate) => candidate.type.name === 'link' && candidate.attrs['href'] === adresse) : undefined;
    if (marque === undefined) {
      return;
    }
    const lien = lienA(etat, position);
    if (lien !== null && !liens.some((connu) => connu.de === lien.de)) {
      liens.push(lien);
    }
  });
  return liens;
}

/** Le lien où se trouve le curseur, s'il est à l'intérieur (pas à l'un de ses bords). */
export function lienDuCurseur(etat: EditorState): LinkRange | null {
  const { selection } = etat;
  if (!selection.empty) {
    return null;
  }
  const lien = lienA(etat, selection.from);
  return lien !== null && selection.from > lien.de && selection.from < lien.a ? lien : null;
}

/**
 * Adresse saisie à la main, rendue utilisable : `exemple.fr` devient
 * `https://exemple.fr`. null si ce n'est ni une adresse web ou de courriel,
 * ni un lien vers une page (`notes://uuid`).
 */
export function normaliserAdresse(saisie: string): string | null {
  const adresse = saisie.trim();
  if (adresse === '') {
    return null;
  }
  if (idDeLienInterne(adresse) !== null || estAdresseWeb(adresse)) {
    return adresse;
  }
  if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(adresse)) {
    return `mailto:${adresse}`;
  }
  if (/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(?::\d+)?(?:[/?#]\S*)?$/u.test(adresse)) {
    return `https://${adresse}`;
  }
  return null;
}

/**
 * Pose le lien « adresse » sur la plage, avec le texte « texte » (vide :
 * l'adresse nettoyée). Un lien vers une page devient une mention. « titre » :
 * le titre Markdown du lien (`mention` pour une mention de site). La
 * transaction rendue n'est pas encore appliquée.
 */
export function poserLien(etat: EditorState, plage: { de: number; a: number }, texte: string, adresse: string, titre: string | null = null): Transaction {
  const transaction = etat.tr;
  const id = idDeLienInterne(adresse);
  const libelle = texte.trim() === '' ? libelleDAdresse(adresse) : texte;
  if (id !== null && etat.schema.nodes['pageMention'] !== undefined) {
    const mention = etat.schema.nodes['pageMention'].create({ id, libelle, title: null });
    return transaction.replaceWith(plage.de, plage.a, mention);
  }
  const lien = etat.schema.marks['link']?.create({ href: adresse, title: titre });
  if (lien === undefined) {
    return transaction;
  }
  if (etat.doc.textBetween(plage.de, plage.a) !== libelle) {
    // Le nouveau texte garde la mise en forme du début de la plage, pas l'ancien lien.
    const marques = etat.doc.resolve(plage.de + (plage.a > plage.de ? 1 : 0)).marks().filter((marque) => marque.type !== lien.type);
    transaction.replaceWith(plage.de, plage.a, etat.schema.text(libelle, marques));
  }
  const fin = plage.de + libelle.length;
  transaction.removeMark(plage.de, fin, lien.type).addMark(plage.de, fin, lien);
  // Ce qu'on tape ensuite n'entre pas dans le lien.
  return transaction.removeStoredMark(lien.type);
}

/** Retire le lien de sa plage : le texte reste. */
export function retirerLien(etat: EditorState, plage: { de: number; a: number }): Transaction {
  const type = etat.schema.marks['link'];
  return type === undefined ? etat.tr : etat.tr.removeMark(plage.de, plage.a, type);
}
