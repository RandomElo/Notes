import { normaliserListe, retirerTachesVides, sectionTerminee } from '@notes/document';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

/*
 * Mode liste de tâches dans l'éditeur (README §14) : la page n'est qu'une
 * liste de tâches, sans titres ; tout ce qu'on écrit y devient une tâche, un
 * bloc (code, tableau…) se range sous une tâche ; une tâche cochée descend
 * dans la section « Terminé » (titre et repli en décorations, rien dans le
 * fichier) ; une tâche laissée vide disparaît quand on la quitte, comme dans
 * Keep.
 */

interface EtatDuModeListe {
  actif: boolean;
  /** Section « Terminé » repliée. */
  replie: boolean;
}

export const cleDuModeListe = new PluginKey<EtatDuModeListe>('mode-liste');

/** Classe des tâches cachées quand « Terminé » est replié (voir styles.css). */
export const classeTacheRepliee = 'tache-repliee';

/** Marque des transactions du mode liste lui-même : il ne les retraite pas. */
const metaDuRangement = 'modeListe:rangement';

/** Le n-ième bloc de texte du document (ordre de lecture) et le décalage du curseur dedans. */
function blocDeTexte(document: ProseMirrorNode, position: number): { rang: number; decalage: number } | null {
  let rang = -1;
  let trouve: { rang: number; decalage: number } | null = null;
  document.descendants((noeud, debut) => {
    if (trouve !== null) {
      return false;
    }
    if (noeud.isTextblock) {
      rang += 1;
      if (position > debut && position <= debut + noeud.nodeSize - 1) {
        trouve = { rang, decalage: position - debut - 1 };
      }
      return false;
    }
    return true;
  });
  return trouve;
}

function positionDuBloc(document: ProseMirrorNode, { rang, decalage }: { rang: number; decalage: number }): number | null {
  let vu = -1;
  let position: number | null = null;
  document.descendants((noeud, debut) => {
    if (position !== null) {
      return false;
    }
    if (noeud.isTextblock) {
      vu += 1;
      if (vu === rang) {
        position = debut + 1 + Math.min(decalage, noeud.content.size);
      }
      return false;
    }
    return true;
  });
  return position;
}

/**
 * Après une modification, la page redevient une seule liste (`normaliserListe`) :
 * le curseur reste dans le même bloc de texte, puisque l'ordre de lecture ne
 * change pas. Puis les tâches laissées vides hors du curseur disparaissent.
 */
export function rangerLaPage(etat: EditorState, documentChange: boolean): Transaction | null {
  const tr = etat.tr;
  let change = false;
  if (documentChange) {
    const curseur = blocDeTexte(etat.doc, etat.selection.head);
    if (normaliserListe(tr)) {
      change = true;
      const position = curseur === null ? null : positionDuBloc(tr.doc, curseur);
      if (position !== null) {
        tr.setSelection(TextSelection.create(tr.doc, position));
      }
    }
  }
  if (retirerTachesVides(tr, tr.selection.head)) {
    change = true;
  }
  return change ? tr.setMeta(metaDuRangement, true) : null;
}

/**
 * Texte tapé dans un paragraphe vide de premier niveau, en mode liste : le
 * paragraphe devient une tâche qui contient ce texte, jointe aux listes de
 * tâches voisines. null quand la frappe n'est pas concernée.
 */
export function tacheALaFrappe(etat: EditorState, texte: string): Transaction | null {
  const { selection, schema } = etat;
  const $debut = selection.$from;
  if (!selection.empty || $debut.depth !== 1 || $debut.parent.type.name !== 'paragraph' || $debut.parent.content.size > 0) {
    return null;
  }
  if (texte === '') {
    return null;
  }
  const debut = $debut.before(1);
  const liste = schema.nodes['taskList']!.create(
    { tight: true },
    schema.nodes['taskItem']!.create({ checked: false }, schema.nodes['paragraph']!.create(null, schema.text(texte, etat.storedMarks ?? []))),
  );
  const tr = etat.tr.replaceWith(debut, $debut.after(1), liste);
  // Ouverture de la liste, de l'item et du paragraphe.
  let curseur = debut + 3 + texte.length;
  if (tr.doc.resolve(debut + liste.nodeSize).nodeAfter?.type.name === 'taskList') {
    tr.join(debut + liste.nodeSize);
  }
  if (tr.doc.resolve(debut).nodeBefore?.type.name === 'taskList') {
    tr.join(debut);
    curseur -= 2;
  }
  return tr.setSelection(TextSelection.create(tr.doc, curseur)).scrollIntoView();
}

/**
 * Avant un bloc choisi dans le menu « / » (code, tableau, image, callout,
 * texte) : une tâche ne peut pas commencer par un tel bloc, il se range sous
 * une tâche (choix d'Eloi, 2026-10-08). Sur une tâche vide qui en suit une
 * autre (on vient de faire Entrée), elle disparaît et le bloc va sous la tâche
 * d'avant ; sinon, il va sous le texte de la tâche. Rend la transaction qui
 * prépare un paragraphe vide à cet endroit, le curseur dedans ; null si le
 * curseur n'est pas dans le texte d'une tâche.
 */
export function placerSousLaTache(etat: EditorState): Transaction | null {
  const $curseur = etat.selection.$from;
  const profondeur = $curseur.depth;
  if (profondeur < 2 || $curseur.node(profondeur - 1).type.name !== 'taskItem' || $curseur.index(profondeur - 1) !== 0) {
    return null;
  }
  const paragraphe = etat.schema.nodes['paragraph']!.create();
  const tr = etat.tr;
  const debutDeLaTache = $curseur.before(profondeur - 1);
  const tache = $curseur.node(profondeur - 1);
  if (tache.childCount === 1 && $curseur.parent.content.size === 0 && $curseur.index(profondeur - 2) > 0) {
    tr.delete(debutDeLaTache, $curseur.after(profondeur - 1));
    // Juste avant la fermeture de la tâche précédente.
    tr.insert(debutDeLaTache - 1, paragraphe);
    return tr.setSelection(TextSelection.create(tr.doc, debutDeLaTache));
  }
  const apresLeTexte = $curseur.after(profondeur);
  tr.insert(apresLeTexte, paragraphe);
  return tr.setSelection(TextSelection.create(tr.doc, apresLeTexte + 1));
}

const chevron = (replie: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: rotate(${replie ? 0 : 90}deg)"><path d="m9 18 6-6-6-6"/></svg>`;

/** Titre de la section « Terminé », dans la liste, avec son bouton de repli. */
function titreDeSection(vue: EditorView, nombre: number, replie: boolean, surRepli: (replie: boolean) => void): HTMLElement {
  const ligne = document.createElement('li');
  ligne.className = 'titre-termine';
  ligne.contentEditable = 'false';
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.setAttribute('aria-expanded', String(!replie));
  bouton.title = replie ? 'Afficher les tâches terminées' : 'Masquer les tâches terminées';
  bouton.innerHTML = chevron(replie);
  bouton.append(` Terminé (${nombre})`);
  // Le curseur reste où il est : le clic ne doit pas entrer dans le contenu.
  bouton.addEventListener('mousedown', (evenement) => evenement.preventDefault());
  bouton.addEventListener('click', () => {
    vue.dispatch(vue.state.tr.setMeta(cleDuModeListe, { replie: !replie }).setMeta('addToHistory', false));
    surRepli(!replie);
  });
  ligne.append(bouton);
  return ligne;
}

/** Invite du paragraphe vide où se trouve le curseur, dans une tâche : son texte, ou une note dessous. */
function invite(etat: EditorState): Decoration | null {
  const { $head, empty } = etat.selection;
  if (!empty || $head.parent.type.name !== 'paragraph' || $head.parent.content.size > 0 || $head.depth < 2 || $head.node(-1).type.name !== 'taskItem') {
    return null;
  }
  const texte = $head.index(-1) === 0 ? 'Nouvelle tâche' : 'Texte sous la tâche, ou / pour un bloc';
  return Decoration.node($head.before(), $head.after(), { class: 'invite-tache', 'data-placeholder': texte });
}

function decorations(etat: EditorState, { actif, replie }: EtatDuModeListe, surRepli: (replie: boolean) => void): DecorationSet {
  if (!actif) {
    return DecorationSet.empty;
  }
  const positions = sectionTerminee(etat.doc);
  const indication = invite(etat);
  if (positions.length === 0) {
    return indication === null ? DecorationSet.empty : DecorationSet.create(etat.doc, [indication]);
  }
  const liste: Decoration[] = [
    Decoration.widget(positions[0]!, (vue) => titreDeSection(vue, positions.length, replie, surRepli), {
      side: -1,
      key: `termine-${positions.length}-${replie}`,
      ignoreSelection: true,
    }),
  ];
  if (indication !== null) {
    liste.push(indication);
  }
  if (replie) {
    for (const position of positions) {
      liste.push(Decoration.node(position, position + etat.doc.nodeAt(position)!.nodeSize, { class: classeTacheRepliee }));
    }
  }
  return DecorationSet.create(etat.doc, liste);
}

export interface TodoModeOptions {
  /** Appelé quand « Terminé » est replié ou déplié, pour le retenir. */
  surRepli: (replie: boolean) => void;
}

/** Le mode liste : inactif tant que la page ne le demande pas (`definirModeListe`). */
export const TodoMode = Extension.create<TodoModeOptions>({
  name: 'modeListe',

  addOptions() {
    return { surRepli: () => undefined };
  },

  addProseMirrorPlugins() {
    const { surRepli } = this.options;
    return [
      new Plugin<EtatDuModeListe>({
        key: cleDuModeListe,
        state: {
          init: () => ({ actif: false, replie: false }),
          apply: (tr, etat) => {
            const demande = tr.getMeta(cleDuModeListe) as Partial<EtatDuModeListe> | undefined;
            if (demande === undefined) {
              return etat;
            }
            return { ...etat, ...demande };
          },
        },
        // Une case cochée, un titre ou un bloc tapé, une tâche laissée vide : tout est rangé dans la même étape
        // d'annulation. Une page rechargée depuis le disque est montrée telle qu'elle est.
        appendTransaction: (transactions, _avant, etat) => {
          const nouvelles = transactions.filter((tr) => tr.getMeta(metaDuRangement) !== true);
          if (cleDuModeListe.getState(etat)?.actif !== true || nouvelles.length === 0 || transactions.some((tr) => tr.getMeta('preventUpdate') === true)) {
            return null;
          }
          const documentChange = nouvelles.some((tr) => tr.docChanged);
          if (!documentChange && !nouvelles.some((tr) => tr.selectionSet)) {
            return null;
          }
          const tr = rangerLaPage(etat, documentChange);
          // Quitter une tâche vide sans rien écrire ne laisse pas d'étape d'annulation.
          return tr === null ? null : documentChange ? tr : tr.setMeta('addToHistory', false);
        },
        props: {
          decorations(etat) {
            const mode = cleDuModeListe.getState(etat);
            return mode === undefined ? DecorationSet.empty : decorations(etat, mode, surRepli);
          },
          attributes: (etat): Record<string, string> => (cleDuModeListe.getState(etat)?.actif === true ? { 'data-mode-liste': '' } : {}),
          handleTextInput(vue, _de, _a, texte) {
            if (cleDuModeListe.getState(vue.state)?.actif !== true || !vue.editable) {
              return false;
            }
            const tr = tacheALaFrappe(vue.state, texte);
            if (tr === null) {
              return false;
            }
            vue.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

/** Active ou coupe le mode liste dans l'éditeur, avec l'état de repli retenu pour la page. Ne touche pas au document. */
export function definirModeListe(vue: EditorView, actif: boolean, replie: boolean): void {
  vue.dispatch(vue.state.tr.setMeta(cleDuModeListe, { actif, replie }).setMeta('addToHistory', false));
}
