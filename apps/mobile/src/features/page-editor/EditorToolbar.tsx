import type { Editor } from '@tiptap/core';
import { FileCode, Heading, KeyboardOff, List, ListChecks, MessageSquareText, Pilcrow } from 'lucide-react';
import type { ReactNode } from 'react';

/** Le niveau suivant d'un titre : 1, 2, 3, puis retour au texte. */
function titreSuivant(editeur: Editor): void {
  const niveau = [1, 2, 3].find((n) => editeur.isActive('heading', { level: n }));
  const chaine = editeur.chain().focus();
  if (niveau === 3) {
    chaine.setParagraph().run();
  } else {
    chaine.setHeading({ level: ((niveau ?? 0) + 1) as 1 | 2 | 3 }).run();
  }
}

function enTexte(editeur: Editor): void {
  const chaine = editeur.chain().focus();
  if (editeur.isActive('bulletList')) {
    chaine.toggleBulletList();
  } else if (editeur.isActive('taskList')) {
    chaine.toggleTaskList();
  } else if (editeur.isActive('orderedList')) {
    chaine.toggleOrderedList();
  }
  chaine.setParagraph().run();
}

/**
 * Barre de l'édition sur le téléphone, au-dessus du clavier (choix d'Eloi,
 * 0.15.7 : seulement l'essentiel) : texte, titre (1, 2, 3 en touchant de
 * nouveau), puces, tâches, callout (dans un callout : sa couleur et son
 * icône), le Markdown du bloc, et à droite, à part, fermer le clavier. Le
 * gras et le reste passent par les raccourcis de saisie du PC (`**`, `1. `).
 */
export function EditorToolbar({ editeur, ouvrirCallout, ouvrirMarkdown }: { editeur: Editor; ouvrirCallout: () => void; ouvrirMarkdown: () => void }) {
  const niveau = [1, 2, 3].find((n) => editeur.isActive('heading', { level: n }));
  const dansUneListe = editeur.isActive('bulletList') || editeur.isActive('taskList') || editeur.isActive('orderedList');
  const bouton = (libelle: string, actif: boolean, action: () => void, icone: ReactNode) => (
    <button
      type="button"
      aria-label={libelle}
      title={libelle}
      aria-pressed={actif}
      // Le focus reste dans l'éditeur : le clavier ne se ferme pas.
      onPointerDown={(evenement) => evenement.preventDefault()}
      onClick={action}
      className={`flex h-10 min-w-10 shrink-0 items-center justify-center gap-0.5 rounded-lg px-2 outline-none ${actif ? 'bg-accent/25 text-texte' : 'text-discret active:bg-texte/15'}`}
    >
      {icone}
    </button>
  );
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2 py-1" role="toolbar" aria-label="Mise en forme">
      {bouton('Texte', !dansUneListe && niveau === undefined && !editeur.isActive('callout'), () => enTexte(editeur), <Pilcrow className="size-5" />)}
      {bouton(
        niveau === undefined ? 'Titre' : `Titre ${niveau}`,
        niveau !== undefined,
        () => titreSuivant(editeur),
        <>
          <Heading className="size-5" />
          {niveau !== undefined && <span className="text-xs">{niveau}</span>}
        </>,
      )}
      {bouton('Liste à puces', editeur.isActive('bulletList'), () => editeur.chain().focus().toggleBulletList().run(), <List className="size-5" />)}
      {bouton('Liste de tâches', editeur.isActive('taskList'), () => editeur.chain().focus().toggleTaskList().run(), <ListChecks className="size-5" />)}
      {bouton(
        editeur.isActive('callout') ? 'Couleur et icône du callout' : 'Callout',
        editeur.isActive('callout'),
        () => (editeur.isActive('callout') ? ouvrirCallout() : editeur.chain().focus().wrapIn('callout', { type: 'info' }).run()),
        <MessageSquareText className="size-5" />,
      )}
      {bouton('Modifier le Markdown du bloc', false, ouvrirMarkdown, <FileCode className="size-5" />)}
      <span className="ml-auto h-6 w-px shrink-0 bg-texte/15" aria-hidden="true" />
      {bouton('Fermer le clavier', false, () => editeur.commands.blur(), <KeyboardOff className="size-5" />)}
    </div>
  );
}
