import type { Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ContextMenu } from '../sidebar/ContextMenu';
import type { MenuItem } from '../sidebar/ContextMenu';
import { estBloc, estItem, estListe } from './block-ranges';
import { deplacerBlocs, dupliquerBlocs, supprimerBlocs } from './block-commands';
import type { BlockCommand } from './block-commands';
import { BlockSelection } from './block-selection';

interface Place {
  gauche: number;
  haut: number;
}

/** Marge à gauche du contenu où la souris garde la poignée du bloc survolé : c'est là qu'elle s'affiche. */
const margeDeLaPoignee = 56;

/**
 * Haut de la partie visible de la page : sous la barre qui reste en haut quand la page défile
 * (fil d'Ariane, enregistrement), et sous le haut de la zone qui défile. La poignée ne monte pas plus haut.
 */
function hautVisible(view: EditorView): number {
  const zone = view.dom.closest('main')?.getBoundingClientRect().top ?? 0;
  const barre = view.dom.closest('[data-zone-page]')?.querySelector('[data-haut-de-page]')?.getBoundingClientRect().bottom ?? 0;
  return Math.max(zone, barre);
}

/** Début du bloc (au sens de la gestion des blocs) sous ce point de l'écran, ou null. */
function blocSousLePointeur(view: EditorView, x: number, y: number): number | null {
  const cadre = view.dom.getBoundingClientRect();
  if (y < Math.max(cadre.top, hautVisible(view)) || y > cadre.bottom || x < cadre.left - margeDeLaPoignee || x > cadre.right) {
    return null;
  }
  // Dans la marge, on cherche au bord du contenu, à la même hauteur.
  const trouve = view.posAtCoords({ left: Math.max(x, cadre.left + 2), top: y });
  if (trouve === null) {
    return null;
  }
  const { doc } = view.state;
  if (trouve.inside >= 0) {
    // Un nœud sans texte (image, séparateur) : il peut être lui-même le bloc.
    const position = doc.resolve(trouve.inside);
    const noeud = position.nodeAfter;
    if (noeud !== null && estBloc(noeud, position.parent, position.index())) {
      // Un item de liste dont la souris touche le fond (retrait d'une sous-tâche) : à la hauteur d'un sous-item, c'est lui.
      return sousItemVise(view, trouve.inside, x, y);
    }
  }
  const position = doc.resolve(trouve.inside >= 0 ? trouve.inside : trouve.pos);
  for (let profondeur = position.depth; profondeur >= 1; profondeur--) {
    if (estBloc(position.node(profondeur), position.node(profondeur - 1), position.index(profondeur - 1))) {
      return sousItemVise(view, position.before(profondeur), x, y);
    }
  }
  return null;
}

/** Délai avant que la poignée disparaisse quand la souris sort du texte. */
const delaiDeLaPoignee = 300;

/** Écart entre le bord gauche d'un item de liste et sa poignée : la puce se dessine entre les deux. */
const retraitDUnItem = 46;
/** Une tâche n'a pas de puce : sa case est tout contre son bord, la poignée se place plus près. */
const retraitDUneTache = 30;
const retraitDe = (nature: string | undefined): number => (nature === 'taskItem' ? retraitDUneTache : retraitDUnItem);

/**
 * Un item de liste contient ses sous-items : à la hauteur d'un sous-item, la souris vise lui, pas son
 * parent, où qu'elle soit à gauche (devant sa case aussi) ; le parent n'est visé qu'à la hauteur de sa propre ligne.
 */
function sousItemVise(view: EditorView, bloc: number, x: number, y: number): number {
  const noeud = view.state.doc.nodeAt(bloc);
  if (noeud === null || !estItem(noeud)) {
    return bloc;
  }
  let trouve: number | null = null;
  noeud.forEach((liste, decalageListe) => {
    if (trouve !== null || !estListe(liste)) {
      return;
    }
    liste.forEach((item, decalageItem) => {
      const debut = bloc + 1 + decalageListe + 1 + decalageItem;
      const element = trouve === null ? view.nodeDOM(debut) : null;
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const cadre = element.getBoundingClientRect();
      if (y >= cadre.top && y <= cadre.bottom) {
        trouve = debut;
      }
    });
  });
  return trouve === null ? bloc : sousItemVise(view, trouve, x, y);
}

/**
 * Poignée des blocs (docs/spec/editeur.md) : à gauche du bloc survolé, sinon du premier
 * bloc sélectionné. On la tire pour déplacer le bloc (ou toute la sélection
 * s'il en fait partie), on clique dessus pour ouvrir son menu. Elle double la
 * gestion au clavier, elle ne la remplace pas.
 */
export function BlockHandle({ editor }: { editor: Editor }) {
  const [place, definirPlace] = useState<Place | null>(null);
  const [menu, definirMenu] = useState<{ x: number; y: number } | null>(null);
  // Pendant un glissement, la sélection de l'éditeur change : la poignée doit rester en place, sinon le glissement meurt.
  const glisse = useRef(false);
  // Bloc survolé par la souris, prioritaire sur la sélection. Gardé quand la souris passe sur la poignée.
  const survole = useRef<number | null>(null);
  const reperer = useRef<() => void>(() => undefined);

  useEffect(() => {
    let attente = 0;
    reperer.current = (): void => {
      if (glisse.current) {
        return;
      }
      const { selection, doc } = editor.state;
      const debut = survole.current ?? (selection instanceof BlockSelection ? selection.from : null);
      const element = debut === null || debut > doc.content.size ? null : editor.view.nodeDOM(debut);
      if (!(element instanceof HTMLElement)) {
        definirPlace(null);
        return;
      }
      const cadre = element.getBoundingClientRect();
      // Une puce ou un numéro se dessine à gauche de son item : la poignée se place avant.
      const nature = doc.nodeAt(debut!)?.type.name;
      const retrait = nature === 'listItem' || nature === 'taskItem' ? retraitDe(nature) : 24;
      // Un tableau : à la hauteur de la poignée de sa première ligne (centrée sur la ligne), juste à côté d'elle.
      const premiereLigne = nature === 'table' ? element.querySelector('tr')?.getBoundingClientRect() : undefined;
      const hautDuBloc = premiereLigne === undefined ? cadre.top + 1 : premiereLigne.top + premiereLigne.height / 2 - 12;
      // Un bloc à moitié passé sous la barre du haut : la poignée reste juste sous elle, et disparaît avec le bloc.
      const limite = hautVisible(editor.view);
      if (cadre.bottom - 24 < limite) {
        definirPlace(null);
        return;
      }
      const haut = Math.max(hautDuBloc, limite);
      definirPlace((actuelle) => (actuelle?.gauche === cadre.left - retrait && actuelle.haut === haut ? actuelle : { gauche: cadre.left - retrait, haut }));
    };
    const surDeplacement = (evenement: MouseEvent): void => {
      if (glisse.current || menu !== null) {
        return;
      }
      // Sur la poignée elle-même, le bloc reste celui d'avant.
      if (evenement.target instanceof Element && evenement.target.closest('[data-poignee-blocs]') !== null) {
        window.clearTimeout(attente);
        return;
      }
      // Entre la poignée et son bloc (la case d'une tâche, la puce), et un peu autour d'elle : c'est le trajet vers la poignée.
      const poignee = document.querySelector('[data-poignee-blocs]');
      const actuelDom = survole.current === null ? null : editor.view.nodeDOM(survole.current);
      if (poignee !== null && actuelDom instanceof HTMLElement) {
        const cadrePoignee = poignee.getBoundingClientRect();
        const droite = Math.max(cadrePoignee.right + 6, actuelDom.getBoundingClientRect().left + 2);
        if (evenement.clientX >= cadrePoignee.left - 8 && evenement.clientX <= droite && evenement.clientY >= cadrePoignee.top - 8 && evenement.clientY <= cadrePoignee.bottom + 8) {
          window.clearTimeout(attente);
          return;
        }
      }
      const bloc = editor.isEditable ? blocSousLePointeur(editor.view, evenement.clientX, evenement.clientY) : null;
      if (bloc === survole.current) {
        window.clearTimeout(attente);
        return;
      }
      // La souris sort du texte (vers la marge, la poignée ou ailleurs) : la poignée attend un instant avant de disparaître.
      // D'un bloc à un autre, en revanche, elle suit tout de suite, sans retard.
      if (bloc === null && survole.current !== null) {
        window.clearTimeout(attente);
        attente = window.setTimeout(() => {
          survole.current = null;
          reperer.current();
        }, delaiDeLaPoignee);
        return;
      }
      window.clearTimeout(attente);
      survole.current = bloc;
      reperer.current();
    };
    const surTransaction = ({ transaction }: { transaction: Transaction }): void => {
      // Le document a changé sous la souris (frappe, déplacement) : le bloc survolé se retrouvera au prochain mouvement.
      // Un simple changement de sélection ou de focus le garde : le clic sur la poignée en a besoin.
      if (transaction.docChanged) {
        survole.current = null;
      }
      reperer.current();
    };
    reperer.current();
    editor.on('transaction', surTransaction);
    document.addEventListener('mousemove', surDeplacement);
    window.addEventListener('scroll', reperer.current, true);
    window.addEventListener('resize', reperer.current);
    const auScroll = reperer.current;
    return () => {
      window.clearTimeout(attente);
      editor.off('transaction', surTransaction);
      document.removeEventListener('mousemove', surDeplacement);
      window.removeEventListener('scroll', auScroll, true);
      window.removeEventListener('resize', auScroll);
    };
  }, [editor, menu]);

  /** Sélectionne le bloc survolé, sauf s'il fait déjà partie de la sélection de blocs. */
  const prendreLeBlocSurvole = (): void => {
    const bloc = survole.current;
    const { selection, doc } = editor.state;
    if (bloc === null || (selection instanceof BlockSelection && bloc >= selection.from && bloc < selection.to)) {
      return;
    }
    editor.view.dispatch(editor.state.tr.setSelection(new BlockSelection(doc, bloc)));
    survole.current = bloc;
  };

  const surDebutDeGlisser = (evenement: DragEvent<HTMLButtonElement>): void => {
    prendreLeBlocSurvole();
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
          data-poignee-blocs
          aria-label="Déplacer le bloc ou ouvrir son menu"
          title="Glisser pour déplacer, cliquer pour le menu"
          style={{ left: place.gauche, top: place.haut }}
          onDragStart={surDebutDeGlisser}
          onDragEnd={() => {
            // La poignée est hors de l'éditeur : ProseMirror ne voit pas la fin du geste et garderait son glissement
            // en cours. Resté là, il fait planter les modifications suivantes (Tab), puis l'affichage.
            editor.view.dragging = null;
            glisse.current = false;
            survole.current = null;
            definirPlace(null);
            editor.view.focus();
          }}
          onClick={(evenement) => {
            prendreLeBlocSurvole();
            definirMenu({ x: evenement.clientX, y: evenement.clientY });
          }}
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
