import { Fragment } from '@tiptap/pm/model';
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MarkdownSerializer } from 'prosemirror-markdown';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import { schema } from '../schema/extensions';

/**
 * Forme canonique : le Markdown que l'application écrit pour un bloc qu'elle a
 * créé ou modifié. Puces en `-`, emphase en `*`, code entre clôtures, saut de
 * ligne forcé par une barre oblique inverse.
 */

const lettreOuChiffre = /[\p{L}\p{N}]/u;

/** Hors des caractères de mise en forme : surlignage, entités, liens automatiques entre chevrons, balises de souligné. */
const aEchapperPartout = /=(?==)|&(?=#?[a-zA-Z0-9]+;)|<(?=[a-zA-Z][a-zA-Z0-9+.-]{1,31}:|[^\s<>@]+@|\/?u>)/g;

/**
 * Échappe un texte pour qu'il soit relu comme du texte. Le tiret bas entre deux
 * lettres ou chiffres (snake_case) n'a pas besoin de l'être.
 */
function echapper(texte: string, debutDeLigne: boolean): string {
  const echappe = texte
    .replace(/[`*\\~[\]_]/g, (caractere, position: number) => {
      const entreDeuxLettres =
        caractere === '_' && lettreOuChiffre.test(texte[position - 1] ?? '') && lettreOuChiffre.test(texte[position + 1] ?? '');
      return entreDeuxLettres ? caractere : `\\${caractere}`;
    })
    .replace(aEchapperPartout, '\\$&');
  if (!debutDeLigne) {
    return echappe;
  }
  // En début de ligne : puce, citation, titre, liste ordonnée, soulignement de titre, ligne de tableau.
  return echappe
    .replace(/^(\+(?= |$)|[-*>])/, '\\$&')
    .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
    .replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2')
    .replace(/^(=+\s*)$/, '\\$1')
    .replace(/^(\||:-)/, '\\$1');
}

function ecrireTexte(etat: MarkdownSerializerState, noeud: ProseMirrorNode, parent: ProseMirrorNode): void {
  const interne = etat as unknown as { atBlockStart: boolean; out: string };
  // Un titre tient sur une ligne. Ailleurs, un retour à la ligne dans le texte est un simple saut de ligne du fichier.
  const lignes = (parent.type.name === 'heading' ? (noeud.text ?? '').replace(/\n/g, ' ') : (noeud.text ?? '')).split('\n');
  lignes.forEach((ligne, index) => {
    // Début de bloc, ligne suivante du même texte, ou texte qui suit un saut de ligne forcé.
    const debutDeLigne = index > 0 || interne.atBlockStart || /\n[ \t>]*$/.test(interne.out);
    // Markdown ignore les espaces en début de ligne ; à quatre, il en ferait un bloc de code.
    // Avant un retour à la ligne, deux espaces en feraient un saut forcé.
    const sansFin = index < lignes.length - 1 ? ligne.replace(/[ \t]+$/, '') : ligne;
    const contenu = debutDeLigne ? sansFin.replace(/^[ \t]+/, '') : sansFin;
    etat.write();
    interne.out += echapper(contenu, debutDeLigne);
    if (index < lignes.length - 1) {
      interne.out += '\n';
    }
  });
}

/** Délimiteur d'un code en ligne : assez d'accents graves pour ne pas se confondre avec ceux du texte. */
function accentsGraves(noeud: ProseMirrorNode, sens: -1 | 1): string {
  const texte = noeud.isText ? (noeud.text ?? '') : '';
  let longueur = 0;
  for (const suite of texte.match(/`+/g) ?? []) {
    longueur = Math.max(longueur, suite.length);
  }
  let resultat = longueur > 0 && sens > 0 ? ' `' : '`';
  resultat += '`'.repeat(longueur);
  if (longueur > 0 && sens < 0) {
    resultat += ' ';
  }
  return resultat;
}

function cibleDeLien(marque: Mark): string {
  const adresse = String(marque.attrs['href'] ?? '')
    .replace(/[\s]/g, (espace) => encodeURIComponent(espace))
    .replace(/[()\\]/g, '\\$&');
  const titre = marque.attrs['title'];
  return typeof titre === 'string' && titre !== '' ? `${adresse} "${titre.replace(/["\\]/g, '\\$&')}"` : adresse;
}

/**
 * Deux listes de même famille qui se suivent seraient relues comme une seule.
 * Markdown les sépare si elles n'ont pas le même marqueur : `-`, `*` ou `+`
 * pour les puces et les tâches, `1.` ou `1)` pour les listes ordonnées.
 */
export type ListMarker = '-' | '*' | '+' | '.' | ')';

const marqueursParFamille = { puces: ['-', '*', '+'], numeros: ['.', ')'] } as const;

function familleDe(noeud: ProseMirrorNode): keyof typeof marqueursParFamille | null {
  const nom = noeud.type.name;
  return nom === 'bulletList' || nom === 'taskList' ? 'puces' : nom === 'orderedList' ? 'numeros' : null;
}

function marqueurDeListe(etat: MarkdownSerializerState, noeud: ProseMirrorNode, parent: ProseMirrorNode, index: number): ListMarker {
  const famille = familleDe(noeud) ?? 'puces';
  const marqueurs: readonly ListMarker[] = marqueursParFamille[famille];
  // Une ligne vide suffit entre deux listes : sans cela, prosemirror-markdown en met deux.
  const interne = etat as unknown as { closed: ProseMirrorNode | null; flushClose(taille?: number): void };
  if (interne.closed?.type === noeud.type) {
    interne.flushClose();
  }
  // Pour un bloc de premier niveau écrit seul, c'est l'appelant qui connaît les marqueurs de ses voisins.
  if (parent.type === schema.topNodeType && parent.childCount === 1) {
    const aEviter = (etat.options as { marqueursAEviter?: readonly ListMarker[] }).marqueursAEviter ?? [];
    return marqueurLibre(noeud, aEviter) ?? (marqueurs[0] as ListMarker);
  }
  // Ailleurs : on alterne avec les listes de la même famille qui précèdent dans le même parent.
  let rang = 0;
  while (index - rang - 1 >= 0 && familleDe(parent.child(index - rang - 1)) === famille) {
    rang++;
  }
  return marqueurs[rang % 2] as ListMarker;
}

/**
 * Marqueur que prendra une liste écrite en forme canonique entre des voisins
 * qui portent déjà ceux-là. null si le bloc n'est pas une liste.
 */
export function marqueurLibre(noeud: ProseMirrorNode, aEviter: readonly (ListMarker | null)[]): ListMarker | null {
  const famille = familleDe(noeud);
  if (famille === null) {
    return null;
  }
  const marqueurs: readonly ListMarker[] = marqueursParFamille[famille];
  // Coincée entre deux listes qui prennent tous les marqueurs (possible pour une liste ordonnée) : on garde le premier.
  return marqueurs.find((marqueur) => !aEviter.includes(marqueur)) ?? (marqueurs[0] as ListMarker);
}

/** Dans une liste serrée, ces blocs suivent le paragraphe de l'item sans ligne vide, sinon la liste serait relue aérée. */
function collerDansUneListeSerree(etat: MarkdownSerializerState): void {
  const interne = etat as unknown as { inTightList: boolean; flushClose(taille: number): void };
  if (interne.inTightList) {
    interne.flushClose(1);
  }
}

const emphase = { mixable: true, expelEnclosingWhitespace: true };

const serialiseur = new MarkdownSerializer(
  {
    paragraph(etat, noeud) {
      etat.renderInline(noeud);
      if (noeud.childCount > 0) {
        // Des espaces en fin de paragraphe ne veulent rien dire en Markdown.
        const interne = etat as unknown as { out: string };
        interne.out = interne.out.replace(/[ \t]+$/, '');
      }
      etat.closeBlock(noeud);
    },
    heading(etat, noeud) {
      collerDansUneListeSerree(etat);
      const interne = etat as unknown as { out: string };
      etat.write('#'.repeat(Number(noeud.attrs['level'])) + (noeud.childCount > 0 ? ' ' : ''));
      etat.renderInline(noeud, false);
      // Des croisillons en fin de titre seraient pris pour sa fermeture.
      interne.out = interne.out.replace(/[ \t]+$/, '').replace(/(\s)(#+)$/, '$1\\$2');
      etat.closeBlock(noeud);
    },
    blockquote(etat, noeud) {
      collerDansUneListeSerree(etat);
      etat.wrapBlock('> ', null, noeud, () => etat.renderContent(noeud));
    },
    codeBlock(etat, noeud) {
      collerDansUneListeSerree(etat);
      const plusLongue = (noeud.textContent.match(/`{3,}/g) ?? []).reduce((a, b) => (b.length > a.length ? b : a), '``');
      const cloture = plusLongue + '`';
      etat.write(cloture + (typeof noeud.attrs['language'] === 'string' ? noeud.attrs['language'] : '') + '\n');
      etat.text(noeud.textContent, false);
      etat.write('\n');
      etat.write(cloture);
      etat.closeBlock(noeud);
    },
    horizontalRule(etat, noeud) {
      etat.write('---');
      etat.closeBlock(noeud);
    },
    bulletList(etat, noeud, parent, index) {
      const puce = marqueurDeListe(etat, noeud, parent, index);
      etat.renderList(noeud, '  ', () => `${puce} `);
    },
    orderedList(etat, noeud, parent, index) {
      const point = marqueurDeListe(etat, noeud, parent, index);
      const depart = Number(noeud.attrs['start'] ?? 1);
      const largeur = String(depart + noeud.childCount - 1).length;
      etat.renderList(noeud, ' '.repeat(largeur + 2), (item) => `${String(depart + item).padStart(largeur, ' ')}${point} `);
    },
    taskList(etat, noeud, parent, index) {
      const puce = marqueurDeListe(etat, noeud, parent, index);
      etat.renderList(noeud, '  ', (item) => `${puce} [${noeud.child(item).attrs['checked'] === true ? 'x' : ' '}] `);
    },
    listItem(etat, noeud) {
      etat.renderContent(noeud);
    },
    taskItem(etat, noeud) {
      etat.renderContent(noeud);
    },
    hardBreak(etat, noeud, parent, index) {
      // Un saut de ligne forcé en fin de bloc n'a pas de sens en Markdown : il n'est écrit que s'il est suivi de contenu.
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== noeud.type) {
          // Un titre tient sur une ligne : le saut y devient une espace.
          etat.write(parent.type.name === 'heading' ? ' ' : '\\\n');
          return;
        }
      }
    },
    rawBlock(etat, noeud) {
      etat.text(String(noeud.attrs['source']).replace(/\r\n?/g, '\n'), false);
      etat.closeBlock(noeud);
    },
    text: ecrireTexte,
  },
  {
    bold: { open: '**', close: '**', ...emphase },
    italic: { open: '*', close: '*', ...emphase },
    strike: { open: '~~', close: '~~', ...emphase },
    highlight: { open: '==', close: '==', ...emphase },
    underline: { open: '<u>', close: '</u>', ...emphase },
    link: {
      open: '[',
      close: (_etat, marque) => `](${cibleDeLien(marque)})`,
      mixable: true,
    },
    code: {
      open: (_etat, _marque, parent, index) => accentsGraves(parent.child(index), -1),
      close: (_etat, _marque, parent, index) => accentsGraves(parent.child(index - 1), 1),
      escape: false,
    },
  },
  { hardBreakNodeName: 'hardBreak', strict: true },
);

/**
 * Markdown canonique d'un bloc, en `\n`, sans fin de ligne finale.
 * « marqueursAEviter » : les marqueurs de liste des blocs voisins dans le fichier.
 */
export function blocCanonique(noeud: ProseMirrorNode, marqueursAEviter: readonly ListMarker[] = []): string {
  return serialiseur.serialize(schema.topNodeType.create(null, [sortirLesEspaces(noeud)]), { marqueursAEviter } as object);
}

const marquesSansEspaceAuBord = ['bold', 'italic', 'strike', 'highlight', 'underline'];

/**
 * Markdown n'accepte pas d'espace juste après l'ouverture d'une marque ni juste
 * avant sa fermeture (`** gras **` n'est pas du gras). Les espaces au bord d'un
 * passage marqué en sortent donc avant l'écriture. prosemirror-markdown le fait
 * aussi, mais perd la suite d'un texte de plusieurs lignes : on le devance.
 */
function sortirLesEspaces(noeud: ProseMirrorNode): ProseMirrorNode {
  if (noeud.isText || noeud.isLeaf || noeud.type.spec.code === true) {
    return noeud;
  }
  if (!noeud.inlineContent) {
    const enfants: ProseMirrorNode[] = [];
    noeud.forEach((enfant) => enfants.push(sortirLesEspaces(enfant)));
    return enfants.every((enfant, index) => enfant === noeud.child(index)) ? noeud : noeud.copy(Fragment.fromArray(enfants));
  }

  const enfants: ProseMirrorNode[] = [];
  let change = false;
  noeud.forEach((enfant, _position, index) => {
    const bords = /^(\s*)([\s\S]*?)(\s*)$/.exec(enfant.text ?? '');
    if (!enfant.isText || bords === null || enfant.marks.some((marque) => marque.type.name === 'code')) {
      enfants.push(enfant);
      return;
    }
    const [, avant = '', milieu = '', apres = ''] = bords;
    const sensibles = enfant.marks.filter((marque) => marquesSansEspaceAuBord.includes(marque.type.name));
    // Une marque s'ouvre ici si le voisin de gauche ne la porte pas, et se ferme ici si celui de droite ne la porte pas.
    const voisinPorte = (voisin: number, marque: Mark): boolean =>
      voisin >= 0 && voisin < noeud.childCount && marque.isInSet(noeud.child(voisin).marks);
    const ouvertes = sensibles.filter((marque) => !voisinPorte(index - 1, marque));
    const fermees = sensibles.filter((marque) => !voisinPorte(index + 1, marque));
    // Un texte fait seulement d'espaces sort des marques qui s'ouvrent ou se ferment sur lui.
    const sortAvant = avant !== '' && (ouvertes.length > 0 || (milieu === '' && fermees.length > 0));
    const sortApres = apres !== '' && fermees.length > 0;
    if (!sortAvant && !sortApres) {
      enfants.push(enfant);
      return;
    }
    change = true;
    const sans = (retirees: Mark[]): Mark[] => enfant.marks.filter((marque) => !retirees.includes(marque));
    if (milieu === '') {
      enfants.push(schema.text(avant + apres, sans([...ouvertes, ...fermees])));
      return;
    }
    const debut = sortAvant ? '' : avant;
    const fin = sortApres ? '' : apres;
    if (sortAvant) {
      enfants.push(schema.text(avant, sans(ouvertes)));
    }
    enfants.push(schema.text(debut + milieu + fin, enfant.marks));
    if (sortApres) {
      enfants.push(schema.text(apres, sans(fermees)));
    }
  });
  return change ? noeud.copy(Fragment.fromArray(enfants)) : noeud;
}

/**
 * Marqueur de liste d'un bloc déjà écrit en Markdown, null si ce n'est pas une
 * liste. Un bloc brut peut en être une (liste qui contient une image, par exemple).
 */
export function marqueurDuTexte(noeud: ProseMirrorNode, texte: string): ListMarker | null {
  if (familleDe(noeud) === null && noeud.type.name !== 'rawBlock') {
    return null;
  }
  // Seule la première ligne compte : c'est elle qui dit si le bloc est une liste.
  const trouve = /^ {0,3}(?:([-*+])(?:[ \t]|$)|\d{1,9}([.)])(?:[ \t]|$))/.exec(texte.split(/\r?\n/, 1)[0] ?? '');
  return ((trouve?.[1] ?? trouve?.[2]) as ListMarker | undefined) ?? null;
}
