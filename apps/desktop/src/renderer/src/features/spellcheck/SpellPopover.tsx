import type { Editor } from '@tiptap/react';
import { BookPlus, EyeOff } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../lib/ipc';
import { fauteA } from './spellcheck-extension';
import type { FauteSoulignee } from './spellcheck-extension';
import { ignorerLaRemarque } from './useSpellcheck';
import { magasinDeCorrection } from './spellcheck-store';

const selecteurDesFautes = '.faute-orthographe, .faute-grammaire';

/**
 * Bulle d'un mot souligné (docs/spec/correction.md), ouverte d'un clic : ce que dit la
 * règle, les suggestions (un clic remplace le mot), « Ignorer » jusqu'à la
 * fermeture de Notes, et pour l'orthographe « Ajouter au dictionnaire ».
 */
export function SpellPopover({ editor }: { editor: Editor }) {
  const [cible, definirCible] = useState<FauteSoulignee | null>(null);
  const [position, definirPosition] = useState<{ gauche: number; haut: number } | null>(null);
  const bulle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const zone = editor.view.dom;
    const surClic = (evenement: MouseEvent): void => {
      const element = evenement.target instanceof Element ? evenement.target.closest(selecteurDesFautes) : null;
      definirCible(element === null || !zone.contains(element) ? null : fauteA(editor.state, editor.view.posAtDOM(element, 0)));
    };
    // Le texte a bougé : la bulle ne correspond plus à rien.
    const surTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged) {
        definirCible(null);
      }
    };
    zone.addEventListener('click', surClic);
    editor.on('transaction', surTransaction);
    return () => {
      zone.removeEventListener('click', surClic);
      editor.off('transaction', surTransaction);
    };
  }, [editor]);

  useEffect(() => {
    if (cible === null) {
      return;
    }
    const fermerSiDehors = (evenement: MouseEvent): void => {
      const cibleDuClic = evenement.target instanceof Element ? evenement.target : null;
      if (cibleDuClic !== null && !bulle.current?.contains(cibleDuClic) && cibleDuClic.closest(selecteurDesFautes) === null) {
        definirCible(null);
      }
    };
    // Échap ferme la bulle avant de servir à l'éditeur (sélection du bloc).
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') {
        evenement.preventDefault();
        evenement.stopPropagation();
        definirCible(null);
        editor.view.focus();
      }
    };
    document.addEventListener('mousedown', fermerSiDehors);
    window.addEventListener('keydown', surTouche, true);
    return () => {
      document.removeEventListener('mousedown', fermerSiDehors);
      window.removeEventListener('keydown', surTouche, true);
    };
  }, [cible, editor]);

  useLayoutEffect(() => {
    if (cible === null || cible.a > editor.state.doc.content.size) {
      definirPosition(null);
      return;
    }
    const coordonnees = editor.view.coordsAtPos(cible.de);
    const largeur = bulle.current?.offsetWidth ?? 0;
    const hauteur = bulle.current?.offsetHeight ?? 0;
    const haut = coordonnees.bottom + 4 + hauteur > window.innerHeight - 8 ? Math.max(8, coordonnees.top - hauteur - 4) : coordonnees.bottom + 4;
    definirPosition({ gauche: Math.max(8, Math.min(coordonnees.left, window.innerWidth - largeur - 8)), haut });
  }, [editor, cible]);

  if (cible === null) {
    return null;
  }
  const { faute } = cible;
  const fermer = (): void => {
    definirCible(null);
    editor.view.focus();
  };
  const remplacer = (suggestion: string): void => {
    editor.view.dispatch(editor.state.tr.insertText(suggestion, cible.de, cible.a));
    fermer();
  };
  const bouton = 'hover:bg-texte/10 focus-visible:bg-accent/30 flex w-full items-center gap-2 rounded px-2 py-1 text-left outline-0';

  return (
    <div
      ref={bulle}
      role="dialog"
      aria-label={faute.nature === 'orthographe' ? "Faute d'orthographe" : 'Remarque de grammaire'}
      style={{ left: position?.gauche ?? 0, top: position?.haut ?? 0, visibility: position === null ? 'hidden' : 'visible' }}
      className="bg-surface fixed z-40 w-72 rounded-lg p-2 text-sm shadow-lg"
    >
      <p className="px-2 pt-1 pb-2">{faute.message === '' ? 'Faute possible.' : faute.message}</p>
      {editor.isEditable && faute.suggestions.length > 0 && (
        <ul className="mb-1">
          {faute.suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button type="button" onClick={() => remplacer(suggestion)} className={`${bouton} text-accent font-medium`}>
                {suggestion === '' ? '(supprimer)' : suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="bg-texte/10 my-1 h-px" />
      <button
        type="button"
        onClick={() => {
          ignorerLaRemarque(faute);
          fermer();
        }}
        className={`${bouton} text-discret`}
      >
        <EyeOff className="size-4" aria-hidden="true" />
        Ignorer
      </button>
      {faute.nature === 'orthographe' && (
        <button
          type="button"
          onClick={() => {
            void api.ajouterAuDictionnaire({ mot: faute.mot }).then(magasinDeCorrection.definirDictionnaire);
            fermer();
          }}
          className={`${bouton} text-discret`}
        >
          <BookPlus className="size-4" aria-hidden="true" />
          Ajouter « {faute.mot} » au dictionnaire
        </button>
      )}
      <p className="text-discret/70 px-2 pt-1 text-xs">Règle {faute.regle}</p>
    </div>
  );
}
