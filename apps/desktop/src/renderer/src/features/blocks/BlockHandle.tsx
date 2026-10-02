import type { Editor } from '@tiptap/react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ContextMenu } from '../sidebar/ContextMenu';
import type { MenuItem } from '../sidebar/ContextMenu';
import { deplacerBlocs, dupliquerBlocs, supprimerBlocs } from './block-commands';
import type { BlockCommand } from './block-commands';
import { BlockSelection } from './block-selection';

interface Place {
  gauche: number;
  haut: number;
}

/**
 * Poignée des blocs sélectionnés (README §6) : elle n'existe que tant qu'une
 * sélection de blocs existe, à gauche du premier. On la tire pour déplacer la
 * sélection, on clique dessus pour ouvrir son menu. Elle double la gestion au
 * clavier, elle ne la remplace pas.
 */
export function BlockHandle({ editor }: { editor: Editor }) {
  const [place, definirPlace] = useState<Place | null>(null);
  const [menu, definirMenu] = useState<{ x: number; y: number } | null>(null);
  // Pendant un glissement, la sélection de l'éditeur change : la poignée doit rester en place, sinon le glissement meurt.
  const glisse = useRef(false);

  useEffect(() => {
    const reperer = (): void => {
      if (glisse.current) {
        return;
      }
      const { selection, doc } = editor.state;
      const element = selection instanceof BlockSelection ? editor.view.nodeDOM(selection.from) : null;
      if (!(element instanceof HTMLElement)) {
        definirPlace(null);
        return;
      }
      const cadre = element.getBoundingClientRect();
      // Une puce ou un numéro se dessine à gauche de son item : la poignée se place avant.
      const retrait = doc.nodeAt(selection.from)?.type.name === 'listItem' ? 46 : 24;
      const haut = cadre.top + 1;
      definirPlace((actuelle) => (actuelle?.gauche === cadre.left - retrait && actuelle.haut === haut ? actuelle : { gauche: cadre.left - retrait, haut }));
    };
    reperer();
    editor.on('transaction', reperer);
    window.addEventListener('scroll', reperer, true);
    window.addEventListener('resize', reperer);
    return () => {
      editor.off('transaction', reperer);
      window.removeEventListener('scroll', reperer, true);
      window.removeEventListener('resize', reperer);
    };
  }, [editor]);

  const surDebutDeGlisser = (evenement: DragEvent<HTMLButtonElement>): void => {
    const { selection } = editor.state;
    if (!(selection instanceof BlockSelection)) {
      evenement.preventDefault();
      return;
    }
    glisse.current = true;
    // ProseMirror fait le reste : repère de dépôt, insertion du contenu, retrait des blocs d'origine.
    // Ce qui est à retirer est donné à part : la sélection peut changer pendant le glissement.
    const contenu = selection.content();
    editor.view.dragging = { slice: contenu, move: true, node: selection } as unknown as typeof editor.view.dragging;
    evenement.dataTransfer.effectAllowed = 'move';
    evenement.dataTransfer.setData('text/plain', contenu.content.textBetween(0, contenu.content.size, '\n'));
    const element = editor.view.nodeDOM(selection.from);
    if (element instanceof HTMLElement) {
      evenement.dataTransfer.setDragImage(element, 0, 0);
    }
  };

  const jouer = (commande: BlockCommand): void => {
    const transaction = commande(editor.state);
    if (transaction !== null) {
      editor.view.dispatch(transaction);
    }
    editor.view.focus();
  };
  const elements: MenuItem[] = [
    { libelle: 'Dupliquer', icone: Copy, raccourci: 'Ctrl+D', action: () => jouer(dupliquerBlocs) },
    { libelle: 'Monter', icone: ArrowUp, raccourci: 'Ctrl+Maj+↑', action: () => jouer(deplacerBlocs(-1)) },
    { libelle: 'Descendre', icone: ArrowDown, raccourci: 'Ctrl+Maj+↓', action: () => jouer(deplacerBlocs(1)) },
    { libelle: 'Supprimer', icone: Trash2, raccourci: 'Suppr', action: () => jouer(supprimerBlocs) },
  ];

  return (
    <>
      {place !== null && (
        <button
          type="button"
          draggable
          aria-label="Déplacer la sélection ou ouvrir son menu"
          title="Glisser pour déplacer, cliquer pour le menu"
          style={{ left: place.gauche, top: place.haut }}
          onDragStart={surDebutDeGlisser}
          onDragEnd={() => {
            glisse.current = false;
            definirPlace(null);
            editor.view.focus();
          }}
          onClick={(evenement) => definirMenu({ x: evenement.clientX, y: evenement.clientY })}
          // Hors de l'ordre de tabulation : au clavier, tout passe par Échap et les raccourcis.
          tabIndex={-1}
          className="text-discret hover:bg-texte/10 hover:text-texte fixed z-20 flex h-6 w-5 cursor-grab items-center justify-center rounded"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
      )}
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          elements={elements}
          surFermeture={() => {
            definirMenu(null);
            // Le clavier revient à l'éditeur : la sélection de blocs y est toujours.
            editor.view.focus();
          }}
        />
      )}
    </>
  );
}
