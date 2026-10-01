import type { TreeNode } from '@notes/core';
import { ChevronRight, Ellipsis, FileQuestion, FileText, Folder, ListTodo, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import type { DropZone } from './tree-model';

export interface TreeRowProps {
  noeud: TreeNode;
  profondeur: number;
  deplie: boolean;
  selectionne: boolean;
  /** Vrai pour la ligne qui reçoit le focus clavier de l'arborescence. */
  focalisable: boolean;
  enRenommage: boolean;
  /** Zone survolée pendant un glisser-déposer, null hors survol. */
  zoneDeDepot: DropZone | null;
  surSelection: () => void;
  surBascule: () => void;
  surValidationDuTitre: (titre: string) => void;
  surAbandonDuRenommage: () => void;
  surAjoutDeSousPage: () => void;
  surMenu: (x: number, y: number) => void;
  surTouche: (evenement: KeyboardEvent<HTMLDivElement>) => void;
  surFocus: () => void;
  surDebutDeGlisser: (evenement: DragEvent<HTMLDivElement>) => void;
  surSurvol: (evenement: DragEvent<HTMLDivElement>) => void;
  surDepot: (evenement: DragEvent<HTMLDivElement>) => void;
  surFinDeGlisser: () => void;
  enregistrer: (element: HTMLDivElement | null) => void;
}

const stylesDeZone: Record<DropZone, string> = {
  avant: 'shadow-[inset_0_2px_0_var(--color-accent)]',
  apres: 'shadow-[inset_0_-2px_0_var(--color-accent)]',
  dedans: 'bg-accent/20',
};

/** Une ligne de l'arborescence : chevron, icône, titre (ou champ de renommage) et actions au survol. */
export function TreeRow(props: TreeRowProps) {
  const { noeud, profondeur, deplie, selectionne, enRenommage, zoneDeDepot } = props;
  const aDesEnfants = noeud.enfants.length > 0;

  const ouvrirMenu = (evenement: MouseEvent) => {
    evenement.preventDefault();
    evenement.stopPropagation();
    props.surMenu(evenement.clientX, evenement.clientY);
  };

  return (
    <div
      ref={props.enregistrer}
      role="treeitem"
      aria-level={profondeur + 1}
      aria-selected={selectionne}
      aria-expanded={aDesEnfants ? deplie : undefined}
      tabIndex={props.focalisable ? 0 : -1}
      draggable={noeud.importe && !enRenommage}
      onClick={props.surSelection}
      onContextMenu={ouvrirMenu}
      onKeyDown={props.surTouche}
      onFocus={props.surFocus}
      onDragStart={props.surDebutDeGlisser}
      onDragOver={props.surSurvol}
      onDrop={props.surDepot}
      onDragEnd={props.surFinDeGlisser}
      style={{ paddingLeft: 8 + profondeur * 16 }}
      // Les états se distinguent par le fond seul, jamais par un contour : survol (gris léger),
      // focus clavier (gris plus marqué), page ouverte (bleu), page ouverte au focus (bleu plus marqué).
      className={`group flex h-7 cursor-pointer items-center gap-1 rounded-md pr-1 text-sm outline-0 select-none ${
        selectionne ? 'bg-accent/25 focus-visible:bg-accent/40' : 'hover:bg-texte/10 focus-visible:bg-texte/20'
      } ${zoneDeDepot === null ? '' : stylesDeZone[zoneDeDepot]}`}
    >
      {aDesEnfants ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={deplie ? 'Replier' : 'Déplier'}
          onClick={(evenement) => {
            evenement.stopPropagation();
            props.surBascule();
          }}
          className="text-discret hover:bg-bordure flex size-5 shrink-0 items-center justify-center rounded"
        >
          <ChevronRight className={`size-3.5 transition-transform ${deplie ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}

      <RowIcon noeud={noeud} />

      {enRenommage ? (
        <TitleInput titre={noeud.titre} surValidation={props.surValidationDuTitre} surAbandon={props.surAbandonDuRenommage} />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate ${noeud.importe ? '' : 'text-discret italic'}`}
          title={noeud.importe ? noeud.titre : `${noeud.titre} (non importé)`}
        >
          {noeud.titre}
        </span>
      )}

      {!enRenommage && (
        <span className="hidden shrink-0 items-center group-focus-within:flex group-hover:flex">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Actions sur ${noeud.titre}`}
            onClick={ouvrirMenu}
            className="text-discret hover:bg-bordure hover:text-texte flex size-5 items-center justify-center rounded"
          >
            <Ellipsis className="size-3.5" aria-hidden="true" />
          </button>
          {noeud.importe && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Nouvelle sous-page dans ${noeud.titre}`}
              onClick={(evenement) => {
                evenement.stopPropagation();
                props.surAjoutDeSousPage();
              }}
              className="text-discret hover:bg-bordure hover:text-texte flex size-5 items-center justify-center rounded"
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function RowIcon({ noeud }: { noeud: TreeNode }) {
  const classe = 'text-discret size-4 shrink-0';
  // Une icône emoji s'affiche telle quelle. Les icônes Lucide et image arrivent en J8.
  if (noeud.icone !== null && /\P{ASCII}/u.test(noeud.icone)) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center text-xs" aria-hidden="true">
        {noeud.icone}
      </span>
    );
  }
  if (!noeud.importe) {
    return noeud.genre === 'fichier' ? (
      <FileQuestion className={classe} aria-hidden="true" />
    ) : (
      <Folder className={classe} aria-hidden="true" />
    );
  }
  return noeud.mode === 'todo' ? (
    <ListTodo className={classe} aria-hidden="true" />
  ) : (
    <FileText className={classe} aria-hidden="true" />
  );
}

/** Champ de renommage : Entrée ou la perte du focus valide, Échap abandonne. */
function TitleInput(props: { titre: string; surValidation: (titre: string) => void; surAbandon: () => void }) {
  const [valeur, definirValeur] = useState(props.titre);
  const champ = useRef<HTMLInputElement>(null);
  const termine = useRef(false);

  useEffect(() => {
    champ.current?.focus();
    champ.current?.select();
  }, []);

  const finir = (valider: boolean) => {
    if (termine.current) {
      return;
    }
    termine.current = true;
    if (valider) {
      props.surValidation(valeur);
    } else {
      props.surAbandon();
    }
  };

  return (
    <input
      ref={champ}
      value={valeur}
      aria-label="Titre de la page"
      maxLength={200}
      spellCheck={false}
      onChange={(evenement) => definirValeur(evenement.target.value)}
      onClick={(evenement) => evenement.stopPropagation()}
      onBlur={() => finir(true)}
      onKeyDown={(evenement) => {
        evenement.stopPropagation();
        if (evenement.key === 'Enter') {
          finir(true);
        } else if (evenement.key === 'Escape') {
          finir(false);
        }
      }}
      className="bg-fond outline-accent min-w-0 flex-1 rounded px-1 text-sm outline-2"
    />
  );
}
