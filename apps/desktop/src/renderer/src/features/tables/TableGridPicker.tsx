import type { Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

const maxColonnes = 8;
const maxLignes = 8;

interface TableGridPickerProps {
  editor: Editor;
  /** Position du curseur à l'ouverture : la grille s'affiche sous cette ligne, le tableau y est inséré. */
  position: number;
  surFermeture: () => void;
}

/** Contenu d'un tableau vide : l'en-tête, puis les lignes. */
function tableauVide(colonnes: number, lignes: number) {
  const ligne = (entete: boolean) => ({
    type: 'tableRow',
    content: Array.from({ length: colonnes }, () => ({ type: entete ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph' }] })),
  });
  return { type: 'table', content: Array.from({ length: lignes }, (_, index) => ligne(index === 0)) };
}

/**
 * Insère un tableau à la place du paragraphe vide du curseur, ou sous le bloc
 * du curseur s'il contient du texte. Le curseur va dans la première cellule.
 */
export function insererTableau(editor: Editor, position: number, colonnes: number, lignes: number): void {
  const $position = editor.state.doc.resolve(Math.min(position, editor.state.doc.content.size));
  const bloc = $position.parent;
  const vide = bloc.type.name === 'paragraph' && bloc.content.size === 0 && $position.depth > 0;
  const de = vide ? $position.before() : $position.depth > 0 ? $position.after() : position;
  const a = vide ? $position.after() : de;
  editor
    .chain()
    .focus()
    .insertContentAt({ from: de, to: a }, tableauVide(colonnes, lignes))
    // Début de la première cellule : tableau, ligne, cellule, paragraphe.
    .setTextSelection(de + 4)
    .run();
}

/**
 * Grille de taille du tableau (docs/spec/editeur.md) : on survole le nombre de colonnes
 * et de lignes voulu, le tableau est inséré au clic. Au clavier : flèches,
 * Entrée, Échap.
 */
export function TableGridPicker({ editor, position, surFermeture }: TableGridPickerProps) {
  const [taille, definirTaille] = useState({ colonnes: 3, lignes: 3 });
  const [place, definirPlace] = useState<{ gauche: number; haut: number } | null>(null);
  const grille = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const curseur = editor.view.coordsAtPos(Math.min(position, editor.state.doc.content.size));
    const hauteur = grille.current?.offsetHeight ?? 0;
    const largeur = grille.current?.offsetWidth ?? 0;
    const dessous = curseur.bottom + 6;
    definirPlace({
      gauche: Math.max(8, Math.min(curseur.left, window.innerWidth - largeur - 8)),
      haut: dessous + hauteur > window.innerHeight - 8 ? Math.max(8, curseur.top - hauteur - 6) : dessous,
    });
    // Après le focus que TipTap rend à l'éditeur, à l'image suivante, quand la commande « / » s'applique.
    const image = window.requestAnimationFrame(() => grille.current?.focus());
    return () => window.cancelAnimationFrame(image);
  }, [editor, position]);

  useEffect(() => {
    const clicAilleurs = (evenement: MouseEvent): void => {
      if (grille.current?.contains(evenement.target as Node) !== true) {
        surFermeture();
      }
    };
    window.addEventListener('mousedown', clicAilleurs);
    return () => window.removeEventListener('mousedown', clicAilleurs);
  }, [surFermeture]);

  const valider = (colonnes: number, lignes: number): void => {
    surFermeture();
    insererTableau(editor, position, colonnes, lignes);
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    const pas: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const deplacement = pas[evenement.key];
    if (deplacement !== undefined) {
      evenement.preventDefault();
      definirTaille(({ colonnes, lignes }) => ({
        colonnes: Math.min(maxColonnes, Math.max(1, colonnes + deplacement[0])),
        lignes: Math.min(maxLignes, Math.max(1, lignes + deplacement[1])),
      }));
    } else if (evenement.key === 'Enter') {
      evenement.preventDefault();
      valider(taille.colonnes, taille.lignes);
    } else if (evenement.key === 'Escape') {
      evenement.preventDefault();
      surFermeture();
      editor.commands.focus();
    }
  };

  return (
    <div
      ref={grille}
      role="dialog"
      aria-label={`Taille du tableau : ${taille.colonnes} colonnes, ${taille.lignes} lignes. Flèches pour changer, Entrée pour insérer.`}
      tabIndex={0}
      onKeyDown={surTouche}
      style={{ left: place?.gauche ?? 0, top: place?.haut ?? 0, visibility: place === null ? 'hidden' : 'visible' }}
      className="border-bordure bg-surface fixed z-40 rounded-md border p-2 shadow-xl shadow-black/40 outline-0"
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${maxColonnes}, 1.1rem)` }}>
        {Array.from({ length: maxLignes * maxColonnes }, (_, index) => {
          const colonne = (index % maxColonnes) + 1;
          const ligne = Math.floor(index / maxColonnes) + 1;
          const dedans = colonne <= taille.colonnes && ligne <= taille.lignes;
          return (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onMouseEnter={() => definirTaille({ colonnes: colonne, lignes: ligne })}
              onClick={() => valider(colonne, ligne)}
              // L'en-tête (première ligne) est plus soutenu. Une seule classe de fond à la fois : l'ordre des classes ne décide pas.
              className={`size-[1.1rem] rounded-sm ${!dedans ? 'bg-texte/10' : ligne === 1 ? 'bg-accent/90' : 'bg-accent/50'}`}
            />
          );
        })}
      </div>
      <p className="text-discret mt-2 text-center text-xs">
        {taille.colonnes} × {taille.lignes}, en-tête compris
      </p>
    </div>
  );
}
