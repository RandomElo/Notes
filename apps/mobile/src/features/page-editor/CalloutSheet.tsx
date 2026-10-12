import { calloutDuCurseur, changerIconeDuCallout, changerNatureDuCallout, iconeDuCallout, iconesProposees, naturesDeCallout, retirerCallout } from '@notes/document';
import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Sheet } from '../../components/Sheet';

/** Couleur et icône du callout du curseur, comme le menu du PC, ou le retirer. */
export function CalloutSheet({ editeur, fermer }: { editeur: Editor; fermer: () => void }) {
  const callout = calloutDuCurseur(editeur.state);
  if (callout === null) {
    return null;
  }
  const jouer = (commande: (etat: EditorState) => Transaction | null, fermerApres = false): void => {
    const transaction = commande(editeur.state);
    if (transaction !== null) {
      editeur.view.dispatch(transaction);
    }
    if (fermerApres) {
      fermer();
    }
  };
  const icone = iconeDuCallout(callout);
  return (
    <Sheet titre="Callout" fermer={fermer}>
      <div className="space-y-4 px-5 pb-2">
        <div>
          <p className="mb-2 text-sm text-discret">Couleur</p>
          <div className="grid grid-cols-2 gap-2">
            {naturesDeCallout.map((nature) => (
              <button
                key={nature.type}
                type="button"
                aria-pressed={nature.type === callout.type}
                onClick={() => jouer(changerNatureDuCallout(nature.type))}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none ${nature.type === callout.type ? 'bg-accent/25 font-medium' : 'bg-texte/10 active:bg-texte/15'}`}
              >
                <span className={`callout-pastille-${nature.type} size-3.5 rounded-full`} aria-hidden="true" />
                {nature.libelle}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-discret">Icône</p>
          <div className="grid grid-cols-8 gap-1">
            {iconesProposees.map((proposee) => (
              <button
                key={proposee}
                type="button"
                aria-label={`Icône ${proposee}`}
                aria-pressed={proposee === icone}
                onClick={() => jouer(changerIconeDuCallout(proposee))}
                className={`flex aspect-square items-center justify-center rounded-lg text-xl outline-none ${proposee === icone ? 'bg-accent/25' : 'active:bg-texte/15'}`}
              >
                {proposee}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => jouer(retirerCallout, true)} className="w-full rounded-lg px-3 py-2.5 text-left text-discret outline-none active:bg-texte/10">
          Retirer le callout (le texte reste)
        </button>
      </div>
    </Sheet>
  );
}
