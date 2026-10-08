import type { Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { filtrerCommandes } from './slash-commands';
import { appliquerCommande, fermerSlash, slashOuvert } from './slash-extension';
import type { SlashActions, SlashKey, SlashStorage } from './slash-extension';

interface SlashMenuProps {
  editor: Editor;
  /** Les commandes qui demandent l'application (sous-page, tableau, image). */
  actions: SlashActions;
}

/**
 * Menu « / » : la liste des commandes sous le curseur, filtrée par ce qui est
 * tapé. Flèches pour choisir, Entrée ou Tab pour valider, Échap pour fermer.
 * Le focus reste dans l'éditeur : les touches arrivent par l'extension.
 */
export function SlashMenu({ editor, actions }: SlashMenuProps) {
  const [, rafraichir] = useReducer((compteur: number) => compteur + 1, 0);
  const [choix, definirChoix] = useState(0);
  const liste = useRef<HTMLDivElement>(null);
  const [position, definirPosition] = useState<{ gauche: number; haut: number } | null>(null);

  useEffect(() => {
    editor.on('transaction', rafraichir);
    return () => {
      editor.off('transaction', rafraichir);
    };
  }, [editor]);

  const ouvert = editor.isDestroyed ? null : slashOuvert(editor.state);
  const requete = ouvert?.requete ?? null;
  const trouvees = requete === null ? [] : filtrerCommandes(requete, actions.modeListe());
  const rang = Math.min(choix, Math.max(0, trouvees.length - 1));

  // Une nouvelle recherche repart du premier résultat.
  useEffect(() => definirChoix(0), [requete]);

  // Les touches sont lues à chaque rendu : le gestionnaire voit toujours la liste et le choix du moment.
  useEffect(() => {
    const stockage = (editor.storage as unknown as { slashMenu: SlashStorage }).slashMenu;
    stockage.surTouche = (touche: SlashKey): boolean => {
      if (ouvert === null) {
        return false;
      }
      if (touche === 'fermer') {
        fermerSlash(editor);
        return true;
      }
      if (trouvees.length === 0) {
        // Rien à choisir : Entrée et les flèches gardent leur rôle habituel.
        return false;
      }
      if (touche === 'valider') {
        const commande = trouvees[rang];
        if (commande !== undefined) {
          appliquerCommande(editor, commande.action, ouvert, actions);
        }
      } else {
        definirChoix((rang + (touche === 'bas' ? 1 : -1) + trouvees.length) % trouvees.length);
      }
      return true;
    };
    return () => {
      stockage.surTouche = null;
    };
  });

  const de = ouvert?.de ?? null;
  useLayoutEffect(() => {
    if (de === null) {
      definirPosition(null);
      return;
    }
    const curseur = editor.view.coordsAtPos(de);
    const hauteur = liste.current?.offsetHeight ?? 0;
    const largeur = liste.current?.offsetWidth ?? 0;
    // Sous la ligne, ou au-dessus s'il n'y a pas la place.
    const dessous = curseur.bottom + 6;
    const haut = dessous + hauteur > window.innerHeight - 8 ? Math.max(8, curseur.top - hauteur - 6) : dessous;
    definirPosition({ gauche: Math.max(8, Math.min(curseur.left, window.innerWidth - largeur - 8)), haut });
  }, [editor, de, trouvees.length]);

  useLayoutEffect(() => {
    liste.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [rang, requete]);

  if (ouvert === null) {
    return null;
  }
  return (
    <div
      ref={liste}
      role="listbox"
      aria-label="Commandes"
      style={{ left: position?.gauche ?? 0, top: position?.haut ?? 0, visibility: position === null ? 'hidden' : 'visible' }}
      className="border-bordure bg-surface fixed z-40 max-h-72 w-64 overflow-y-auto rounded-md border py-1 shadow-xl shadow-black/40"
    >
      {trouvees.length === 0 && <p className="text-discret px-3 py-2 text-sm">Aucune commande pour « {requete} ».</p>}
      {trouvees.map((commande, index) => (
        <button
          key={commande.libelle}
          type="button"
          role="option"
          aria-selected={index === rang}
          // Le clic ne doit pas retirer le focus à l'éditeur.
          onMouseDown={(evenement) => evenement.preventDefault()}
          onMouseEnter={() => definirChoix(index)}
          onClick={() => appliquerCommande(editor, commande.action, ouvert, actions)}
          className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${index === rang ? 'bg-accent/25' : ''}`}
        >
          <commande.icone className="text-discret size-4 shrink-0" aria-hidden="true" />
          {commande.libelle}
        </button>
      ))}
    </div>
  );
}
