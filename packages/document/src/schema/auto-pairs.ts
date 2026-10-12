import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';

/*
 * Fermeture automatique, comme dans VS Code (demande d'Eloi du 2026-10-10) :
 * taper une parenthèse, un crochet, une accolade ou des guillemets pose aussi
 * le caractère fermant, curseur au milieu. Chaque paire s'ouvre avec une
 * espace de chaque côté du curseur (« ( | ) », « [ | ] », « " | " »), insécable
 * dans les guillemets français, sauf dans le code (choix d'Eloi, 2026-10-11).
 * Un crochet en début de ligne ou après un marqueur de liste reste collé
 * (« [] », « - [x] ») : c'est le raccourci des tâches. Une apostrophe collée à
 * un mot (« l'arbre ») reste seule. Pas l'accent grave ni l'astérisque, qui
 * déclenchent les raccourcis de mise en forme. Sert à l'éditeur du PC et aux
 * champs du téléphone.
 */

export const pairesAutomatiques: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}', '«': '»', '"': '"', "'": "'" };
/** L'espace posée à l'intérieur d'une paire, hors du code. */
export const espacesInterieures: Readonly<Record<string, string>> = { '(': ' ', '[': ' ', '{': ' ', '«': ' ', '"': ' ', "'": ' ' };
/** Début de ligne ou marqueur de liste juste avant : un crochet y commence une case à cocher, sans espace. */
const avantUneCase = /^(?:|[-*+] )$/;
const fermants = new Set(Object.values(pairesAutomatiques));
/** La paire ne s'ouvre que devant la fin du texte, une espace ou une ponctuation fermante : devant un mot, on veut un seul caractère. */
const suiteAdmise = /^(?:$|[\s)\]}»"'.,;:!?])/;
const lettreOuChiffre = /[\p{L}\p{N}]$/u;

export type DecisionDePaire =
  /** Poser `ouvrant + espace + (sélection) + espace + fermant`, curseur après la première espace. */
  | { genre: 'paire'; ouvrant: string; fermant: string; espace: string }
  /** Le fermant est déjà là (après l'espace intérieure, le cas échéant) : passer les `longueur` caractères. */
  | { genre: 'sauter'; longueur: number }
  | null;

/**
 * Que faire du caractère « saisi », entre « avant » et « apres » (au moins
 * deux caractères de chaque côté du curseur quand il y en a, vides en bout
 * de texte) ? `selection` : du texte est sélectionné, il est alors entouré.
 * `code` : dans du code, pas d'espace intérieure. null : rien de spécial.
 */
export function deciderPaire(saisi: string, avant: string, apres: string, selection: boolean, code = false): DecisionDePaire {
  if (!selection && fermants.has(saisi)) {
    if (apres.startsWith(saisi)) {
      return { genre: 'sauter', longueur: 1 };
    }
    const ouvrant = Object.keys(pairesAutomatiques).find((cle) => pairesAutomatiques[cle] === saisi);
    const espace = ouvrant === undefined ? undefined : espacesInterieures[ouvrant];
    if (espace !== undefined && apres.startsWith(espace + saisi)) {
      return { genre: 'sauter', longueur: 2 };
    }
  }
  const fermant = pairesAutomatiques[saisi];
  if (fermant === undefined) {
    return null;
  }
  const espace = code || (saisi === '[' && avantUneCase.test(avant)) ? '' : (espacesInterieures[saisi] ?? '');
  if (selection) {
    return { genre: 'paire', ouvrant: saisi, fermant, espace };
  }
  // Un guillemet droit juste après un mot ferme une citation, ou note des pouces ; une apostrophe y élide : pas de paire.
  if (!suiteAdmise.test(apres) || ((saisi === '"' || saisi === "'") && lettreOuChiffre.test(avant))) {
    return null;
  }
  return { genre: 'paire', ouvrant: saisi, fermant, espace };
}

/**
 * Retour arrière dans une paire vide (« () », « ( | ) », « « | » ») : rend
 * combien de caractères effacer avant et après le curseur, ou null.
 */
export function effacerLaPaire(avant: string, apres: string): { avant: number; apres: number } | null {
  for (const [ouvrant, fermant] of Object.entries(pairesAutomatiques)) {
    const espace = espacesInterieures[ouvrant];
    if (espace !== undefined && avant.endsWith(ouvrant + espace) && apres.startsWith(espace + fermant)) {
      return { avant: 2, apres: 2 };
    }
    if (avant.endsWith(ouvrant) && apres.startsWith(fermant)) {
      return { avant: 1, apres: 1 };
    }
  }
  return null;
}

/** La fermeture automatique dans l'éditeur. */
export const FermetureAutomatique = Extension.create({
  name: 'fermetureAutomatique',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput(view, de, a, texte) {
            if (texte.length !== 1 || !view.editable) {
              return false;
            }
            const { state } = view;
            const $de = state.doc.resolve(de);
            if (!$de.parent.isTextblock || $de.parent !== state.doc.resolve(a).parent) {
              return false;
            }
            const avant = state.doc.textBetween(Math.max($de.start(), de - 2), de);
            const apres = state.doc.textBetween(a, Math.min($de.end(), a + 2));
            const code = $de.parent.type.spec.code === true || state.schema.marks['code']?.isInSet($de.marks()) !== undefined;
            const decision = deciderPaire(texte, avant, apres, de !== a, code);
            if (decision === null) {
              return false;
            }
            const tr = state.tr;
            if (decision.genre === 'sauter') {
              view.dispatch(tr.setSelection(TextSelection.create(state.doc, a + decision.longueur)).scrollIntoView());
              return true;
            }
            const { ouvrant, fermant, espace } = decision;
            if (de !== a) {
              tr.insertText(espace + fermant, a).insertText(ouvrant + espace, de);
              tr.setSelection(TextSelection.create(tr.doc, de + 1 + espace.length, a + 1 + espace.length));
            } else {
              tr.insertText(ouvrant + espace + espace + fermant, de);
              tr.setSelection(TextSelection.create(tr.doc, de + 1 + espace.length));
            }
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          handleKeyDown(view, evenement) {
            if (evenement.key !== 'Backspace' || !view.editable) {
              return false;
            }
            const { state } = view;
            const { empty, $from } = state.selection;
            if (!empty || !$from.parent.isTextblock) {
              return false;
            }
            const avant = state.doc.textBetween(Math.max($from.start(), $from.pos - 2), $from.pos);
            const apres = state.doc.textBetween($from.pos, Math.min($from.end(), $from.pos + 2));
            const effacement = effacerLaPaire(avant, apres);
            if (effacement === null) {
              return false;
            }
            view.dispatch(state.tr.delete($from.pos - effacement.avant, $from.pos + effacement.apres));
            return true;
          },
        },
      }),
    ];
  },
});
