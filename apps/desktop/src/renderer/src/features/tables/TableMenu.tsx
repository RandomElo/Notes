import type { TableAlign } from '@notes/document';
import type { Editor } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { alignementCourant, alignerColonne } from './table-commands';

interface Action {
  libelle: string;
  jouer: (editor: Editor) => boolean;
}

const ajouts: Action[] = [
  { libelle: 'Ligne au-dessus', jouer: (editor) => editor.chain().focus().addRowBefore().run() },
  { libelle: 'Ligne en dessous', jouer: (editor) => editor.chain().focus().addRowAfter().run() },
  { libelle: 'Colonne à gauche', jouer: (editor) => editor.chain().focus().addColumnBefore().run() },
  { libelle: 'Colonne à droite', jouer: (editor) => editor.chain().focus().addColumnAfter().run() },
];

const suppressions: Action[] = [
  { libelle: 'Supprimer la ligne', jouer: (editor) => editor.chain().focus().deleteRow().run() },
  { libelle: 'Supprimer la colonne', jouer: (editor) => editor.chain().focus().deleteColumn().run() },
  { libelle: 'Supprimer le tableau', jouer: (editor) => editor.chain().focus().deleteTable().run() },
];

const alignements: { valeur: TableAlign; libelle: string; icone: LucideIcon }[] = [
  { valeur: 'left', libelle: 'Colonne alignée à gauche', icone: AlignLeft },
  { valeur: 'center', libelle: 'Colonne centrée', icone: AlignCenter },
  { valeur: 'right', libelle: 'Colonne alignée à droite', icone: AlignRight },
];

const sansFocus = (evenement: { preventDefault(): void }): void => evenement.preventDefault();

/** Une icône qui ouvre une petite liste d'actions sous elle. */
function MenuDActions(props: {
  libelle: string;
  icone: LucideIcon;
  actions: Action[];
  ouvert: boolean;
  surBascule: () => void;
  surAction: (action: Action) => void;
  danger?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={props.ouvert}
        title={props.libelle}
        aria-label={props.libelle}
        onMouseDown={sansFocus}
        onClick={props.surBascule}
        className={`flex size-7 items-center justify-center rounded ${props.ouvert ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
      >
        <props.icone className="size-4" aria-hidden="true" />
      </button>
      {props.ouvert && (
        <div role="menu" aria-label={props.libelle} className="border-bordure bg-surface absolute top-full left-0 mt-1 w-48 rounded-md border py-1 shadow-xl shadow-black/40">
          {props.actions.map((action) => (
            <button
              key={action.libelle}
              type="button"
              role="menuitem"
              onMouseDown={sansFocus}
              onClick={() => props.surAction(action)}
              className={`hover:bg-texte/10 block w-full px-3 py-1 text-left text-sm ${props.danger === true ? 'text-erreur' : ''}`}
            >
              {action.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Partie « tableau » de la barre d'outils, quand le curseur est dans une
 * cellule : une étiquette, un « + » pour ajouter une ligne ou une colonne,
 * une corbeille pour supprimer, puis l'alignement de la colonne. Cliquer
 * l'alignement actif le retire.
 */
export function TableMenu({ editor }: { editor: Editor }) {
  const [ouvert, definirOuvert] = useState<'ajouter' | 'supprimer' | null>(null);
  const actuel = alignementCourant(editor.state);
  const jouer = (action: Action): void => {
    action.jouer(editor);
    definirOuvert(null);
  };
  return (
    <>
      <span className="text-discret px-2 text-sm select-none">Tableau</span>
      <MenuDActions
        libelle="Ajouter une ligne ou une colonne"
        icone={Plus}
        actions={ajouts}
        ouvert={ouvert === 'ajouter'}
        surBascule={() => definirOuvert((etat) => (etat === 'ajouter' ? null : 'ajouter'))}
        surAction={jouer}
      />
      <MenuDActions
        libelle="Supprimer"
        icone={Trash2}
        actions={suppressions}
        ouvert={ouvert === 'supprimer'}
        surBascule={() => definirOuvert((etat) => (etat === 'supprimer' ? null : 'supprimer'))}
        surAction={jouer}
        danger
      />
      {alignements.map((alignement) => (
        <button
          key={alignement.valeur}
          type="button"
          title={alignement.libelle}
          aria-label={alignement.libelle}
          aria-pressed={actuel === alignement.valeur}
          onMouseDown={sansFocus}
          onClick={() => {
            const transaction = alignerColonne(actuel === alignement.valeur ? null : alignement.valeur)(editor.state);
            if (transaction !== null) {
              editor.view.dispatch(transaction);
            }
          }}
          className={`flex size-7 items-center justify-center rounded ${actuel === alignement.valeur ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
        >
          <alignement.icone className="size-4" aria-hidden="true" />
        </button>
      ))}
    </>
  );
}
