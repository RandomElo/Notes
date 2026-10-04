import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { Bold, ChevronDown, Code, Italic, Link, Strikethrough, Underline } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { CalloutMenu } from '../callout/CalloutMenu';
import type { LinkStorage } from '../links/link-extension';
import { slashOuvert } from '../slash-menu/slash-extension';
import { TableMenu } from '../tables/TableMenu';
import { changerType, typeCourant, typesDeBloc } from './toolbar-model';

const marques: { nom: string; libelle: string; raccourci: string; icone: LucideIcon }[] = [
  { nom: 'bold', libelle: 'Gras', raccourci: 'Ctrl+B', icone: Bold },
  { nom: 'italic', libelle: 'Italique', raccourci: 'Ctrl+I', icone: Italic },
  { nom: 'underline', libelle: 'Souligné', raccourci: 'Ctrl+U', icone: Underline },
  { nom: 'strike', libelle: 'Barré', raccourci: 'Ctrl+Maj+S', icone: Strikethrough },
  { nom: 'code', libelle: 'Code', raccourci: 'Ctrl+E', icone: Code },
];

/**
 * Barre d'outils flottante (README §6) : elle apparaît quand du texte est
 * sélectionné (au clic aussi dans une cellule ou un callout, pour leurs
 * menus), et disparaît à la frappe, au clic ailleurs ou sur Échap. Son contenu dépend du bloc : dans un bloc de code, pas de
 * mise en forme du texte, seulement la nature du bloc. Dans une cellule, les
 * lignes, colonnes et l'alignement du tableau ; dans un callout, sa nature et
 * son icône.
 */
export function FloatingToolbar({ editor }: { editor: Editor }) {
  const [, rafraichir] = useReducer((compteur: number) => compteur + 1, 0);
  const [demandee, definirDemandee] = useState(false);
  const [menuOuvert, definirMenuOuvert] = useState(false);
  const [position, definirPosition] = useState<{ gauche: number; haut: number } | null>(null);
  const barre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const zone = editor.view.dom;
    const montrer = (): void => {
      // La sélection du clic n'est connue qu'après l'événement.
      window.setTimeout(() => definirDemandee(true), 0);
    };
    const surTouche = (evenement: KeyboardEvent): void => {
      // Une touche de modification seule (Ctrl avant Ctrl+B) ne ferme pas la barre.
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(evenement.key) && !(evenement.ctrlKey && evenement.key !== 'Control')) {
        definirDemandee(false);
        definirMenuOuvert(false);
      }
    };
    const surSelection = (): void => {
      // Du texte sélectionné, à la souris ou au clavier (Maj+flèches), fait revenir la barre.
      if (editor.state.selection instanceof TextSelection && !editor.state.selection.empty) {
        definirDemandee(true);
      }
    };
    const clicAilleurs = (evenement: MouseEvent): void => {
      const cible = evenement.target as Node;
      if (!zone.contains(cible) && barre.current?.contains(cible) !== true) {
        definirDemandee(false);
        definirMenuOuvert(false);
      }
    };
    zone.addEventListener('mouseup', montrer);
    zone.addEventListener('keydown', surTouche);
    editor.on('selectionUpdate', surSelection);
    window.addEventListener('mousedown', clicAilleurs);
    window.addEventListener('scroll', rafraichir, true);
    window.addEventListener('resize', rafraichir);
    editor.on('transaction', rafraichir);
    return () => {
      zone.removeEventListener('mouseup', montrer);
      zone.removeEventListener('keydown', surTouche);
      editor.off('selectionUpdate', surSelection);
      window.removeEventListener('mousedown', clicAilleurs);
      window.removeEventListener('scroll', rafraichir, true);
      window.removeEventListener('resize', rafraichir);
      editor.off('transaction', rafraichir);
    };
  }, [editor]);

  const selection = editor.isDestroyed ? null : editor.state.selection;
  const possible = demandee && selection instanceof TextSelection && editor.isFocused && slashOuvert(editor.state) === null;
  const dansUnTableau = possible && editor.isActive('table');
  const dansUnCallout = possible && !dansUnTableau && editor.isActive('callout');
  // Dans le texte, seulement sur une sélection (demande d'Eloi). Une cellule ou un callout l'ont aussi au clic :
  // la barre porte leurs menus (lignes et colonnes, nature et icône).
  const visible = possible && (!selection.empty || dansUnTableau || dansUnCallout);
  const de = visible ? selection.from : null;
  const dansDuCode = visible && selection.$from.parent.type.spec.code === true;

  useLayoutEffect(() => {
    if (de === null || barre.current === null) {
      definirPosition(null);
      return;
    }
    const debut = editor.view.coordsAtPos(de);
    const zone = editor.view.dom.getBoundingClientRect();
    const { offsetWidth: largeur, offsetHeight: hauteur } = barre.current;
    // Au-dessus de la ligne. Tout en haut de la page, elle passe dessous pour ne pas couvrir le titre.
    const auDessus = debut.top - hauteur - 8;
    const haut = auDessus < Math.max(zone.top - hauteur, 96) ? debut.bottom + 8 : auDessus;
    const gauche = Math.max(zone.left, Math.min(debut.left - 12, zone.right - largeur, window.innerWidth - largeur - 8));
    definirPosition((actuelle) => (actuelle?.gauche === gauche && actuelle.haut === haut ? actuelle : { gauche, haut }));
  });

  if (!visible) {
    return null;
  }
  const type = typeCourant(editor);
  const libelleDuType = typesDeBloc.find((candidat) => candidat.cle === type)?.libelle ?? 'Texte';
  // Aucun bouton ne prend le focus : la sélection de l'éditeur doit rester en place.
  const sansFocus = (evenement: { preventDefault(): void }): void => evenement.preventDefault();

  return (
    <div
      ref={barre}
      role="toolbar"
      aria-label="Mise en forme"
      style={{ left: position?.gauche ?? 0, top: position?.haut ?? 0, visibility: position === null ? 'hidden' : 'visible' }}
      className="border-bordure bg-surface fixed z-30 flex items-center gap-0.5 rounded-md border p-1 shadow-xl shadow-black/40"
    >
      {dansUnTableau && <TableMenu editor={editor} />}
      {dansUnCallout && <CalloutMenu editor={editor} />}
      <div className={`relative ${dansUnTableau || dansUnCallout ? 'hidden' : ''}`}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menuOuvert}
          title="Nature du bloc"
          aria-label={`Nature du bloc : ${libelleDuType}`}
          onMouseDown={sansFocus}
          onClick={() => definirMenuOuvert((ouvert) => !ouvert)}
          className={`flex h-7 items-center gap-1 rounded px-2 text-sm ${menuOuvert ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
        >
          {libelleDuType}
          <ChevronDown className="text-discret size-3.5" aria-hidden="true" />
        </button>
        {menuOuvert && (
          <div role="listbox" aria-label="Nature du bloc" className="border-bordure bg-surface absolute top-full left-0 mt-1 w-44 rounded-md border py-1 shadow-xl shadow-black/40">
            {typesDeBloc.map((candidat) => (
              <button
                key={candidat.cle}
                type="button"
                role="option"
                aria-selected={candidat.cle === type}
                onMouseDown={sansFocus}
                onClick={() => {
                  changerType(editor, candidat.cle);
                  definirMenuOuvert(false);
                }}
                className={`block w-full px-3 py-1 text-left text-sm ${candidat.cle === type ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
              >
                {candidat.libelle}
              </button>
            ))}
          </div>
        )}
      </div>

      {!dansDuCode && <span className="bg-bordure mx-1 h-5 w-px" aria-hidden="true" />}
      {!dansDuCode &&
        marques.map((marque) => {
          const active = editor.isActive(marque.nom);
          return (
            <button
              key={marque.nom}
              type="button"
              title={`${marque.libelle} (${marque.raccourci})`}
              aria-label={marque.libelle}
              aria-pressed={active}
              onMouseDown={sansFocus}
              onClick={() => editor.chain().focus().toggleMark(marque.nom).run()}
              className={`flex size-7 items-center justify-center rounded ${active ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
            >
              <marque.icone className="size-4" aria-hidden="true" />
            </button>
          );
        })}
      {!dansDuCode && (
        <button
          type="button"
          title="Lien"
          aria-label="Lien"
          aria-pressed={editor.isActive('link')}
          onMouseDown={sansFocus}
          onClick={() => {
            (editor.storage as unknown as { liens: LinkStorage }).liens.ouvrirFormulaire?.();
            definirDemandee(false);
          }}
          className={`flex size-7 items-center justify-center rounded ${editor.isActive('link') ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
        >
          <Link className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
