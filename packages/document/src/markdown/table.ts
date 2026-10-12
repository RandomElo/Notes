import { Fragment } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { schema } from '../schema/extensions';

/**
 * Forme canonique d'un tableau GFM : colonnes alignées par des espaces pour
 * rester lisible dans un éditeur de texte, ligne de séparation qui porte
 * l'alignement de chaque colonne.
 *
 * | Langage | Année |
 * | ------- | ----: |
 * | Go      |  2009 |
 */

/** Tient la place d'un saut de ligne pendant l'écriture du paragraphe, remplacé ensuite par `<br>` (caractère d'usage privé). */
const repereDeRetour = '\uE001';

/**
 * Une cellule tient sur une ligne : un saut forcé (Ctrl+Entrée) s'écrit
 * `<br>`, un retour à la ligne du texte devient une espace.
 */
function surUneLigne(paragraphe: ProseMirrorNode): ProseMirrorNode {
  const enfants: ProseMirrorNode[] = [];
  paragraphe.forEach((enfant) => {
    if (enfant.type.name === 'hardBreak') {
      enfants.push(schema.text(repereDeRetour));
    } else if (enfant.isText && (enfant.text ?? '').includes('\n')) {
      enfants.push(schema.text((enfant.text ?? '').replace(/\n/g, ' '), enfant.marks));
    } else {
      enfants.push(enfant);
    }
  });
  return paragraphe.copy(Fragment.fromArray(enfants));
}

/** Échappe chaque `|` qui n'est pas déjà précédé d'une barre oblique inverse : dans un tableau, il couperait la cellule, même dans du code. */
function echapperLesBarres(texte: string): string {
  let resultat = '';
  let barresObliques = 0;
  for (const caractere of texte) {
    if (caractere === '|' && barresObliques % 2 === 0) {
      resultat += '\\';
    }
    barresObliques = caractere === '\\' ? barresObliques + 1 : 0;
    resultat += caractere;
  }
  return resultat;
}

const longueur = (texte: string): number => [...texte].length;

/**
 * Le Markdown d'un tableau, lignes séparées par `\n`. « ecrireParagraphe »
 * donne la forme canonique d'un paragraphe (canonical.ts).
 */
export function ecrireTableau(tableau: ProseMirrorNode, ecrireParagraphe: (paragraphe: ProseMirrorNode) => string): string {
  const lignes: string[][] = [];
  tableau.forEach((ligne) => {
    const cellules: string[] = [];
    ligne.forEach((cellule) => {
      const paragraphe = cellule.firstChild;
      const texte = paragraphe === null ? '' : ecrireParagraphe(surUneLigne(paragraphe)).replace(/\n/g, ' ').trim().replaceAll(repereDeRetour, '<br>');
      cellules.push(echapperLesBarres(texte));
    });
    lignes.push(cellules);
  });
  const colonnes = Math.max(1, ...lignes.map((ligne) => ligne.length));
  const alignements: (string | null)[] = [];
  const entete = tableau.firstChild;
  for (let colonne = 0; colonne < colonnes; colonne++) {
    const cellule = entete !== null && colonne < entete.childCount ? entete.child(colonne) : null;
    const align = cellule?.attrs['align'];
    alignements.push(align === 'left' || align === 'center' || align === 'right' ? align : null);
  }
  const largeurs = alignements.map((_align, colonne) => Math.max(3, ...lignes.map((ligne) => longueur(ligne[colonne] ?? ''))));

  const ecrireLigne = (cellules: string[]): string =>
    '| ' +
    largeurs
      .map((largeur, colonne) => {
        const texte = cellules[colonne] ?? '';
        const marge = largeur - longueur(texte);
        return alignements[colonne] === 'right' ? ' '.repeat(marge) + texte : texte + ' '.repeat(marge);
      })
      .join(' | ') +
    ' |';
  const separation =
    '| ' +
    largeurs
      .map((largeur, colonne) => {
        switch (alignements[colonne]) {
          case 'left':
            return ':' + '-'.repeat(largeur - 1);
          case 'center':
            return ':' + '-'.repeat(largeur - 2) + ':';
          case 'right':
            return '-'.repeat(largeur - 1) + ':';
          default:
            return '-'.repeat(largeur);
        }
      })
      .join(' | ') +
    ' |';

  const [premiere = [], ...suite] = lignes;
  return [ecrireLigne(premiere), separation, ...suite.map(ecrireLigne)].join('\n');
}
