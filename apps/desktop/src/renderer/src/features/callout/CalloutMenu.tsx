import { calloutDuCurseur, changerIconeDuCallout as changerIcone, changerNatureDuCallout as changerNature, iconeDuCallout, iconesProposees, naturesDeCallout, retirerCallout } from '@notes/document';
import type { Editor } from '@tiptap/react';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/**
 * Partie « callout » de la barre d'outils, quand le curseur est dans un
 * callout : sa nature (couleur), son icône, ou le retirer.
 */
export function CalloutMenu({ editor }: { editor: Editor }) {
  const [ouvert, definirOuvert] = useState<'nature' | 'icone' | null>(null);
  const callout = calloutDuCurseur(editor.state);
  if (callout === null) {
    return null;
  }
  const sansFocus = (evenement: { preventDefault(): void }): void => evenement.preventDefault();
  const jouer = (commande: (etat: EditorState) => Transaction | null): void => {
    const transaction = commande(editor.state);
    if (transaction !== null) {
      editor.view.dispatch(transaction);
    }
    definirOuvert(null);
  };
  const libelle = naturesDeCallout.find((nature) => nature.type === callout.type)?.libelle ?? 'Info';
  const icone = iconeDuCallout(callout);
  const menu = 'border-bordure bg-surface absolute top-full left-0 mt-1 rounded-md border shadow-xl shadow-black/40';

  return (
    <>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={ouvert === 'nature'}
          title="Nature du callout"
          aria-label={`Nature du callout : ${libelle}`}
          onMouseDown={sansFocus}
          onClick={() => definirOuvert((etat) => (etat === 'nature' ? null : 'nature'))}
          className={`flex h-7 items-center gap-1.5 rounded px-2 text-sm ${ouvert === 'nature' ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
        >
          <span className={`callout-pastille callout-pastille-${callout.type} size-3 rounded-full`} aria-hidden="true" />
          {libelle}
          <ChevronDown className="text-discret size-3.5" aria-hidden="true" />
        </button>
        {ouvert === 'nature' && (
          <div role="menu" aria-label="Nature du callout" className={`${menu} w-44 py-1`}>
            {naturesDeCallout.map((nature) => (
              <button
                key={nature.type}
                type="button"
                role="menuitemradio"
                aria-checked={nature.type === callout.type}
                onMouseDown={sansFocus}
                onClick={() => jouer(changerNature(nature.type))}
                className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm ${nature.type === callout.type ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
              >
                <span className={`callout-pastille callout-pastille-${nature.type} size-3 rounded-full`} aria-hidden="true" />
                {nature.libelle}
              </button>
            ))}
            <span className="bg-bordure my-1 block h-px" aria-hidden="true" />
            <button type="button" role="menuitem" onMouseDown={sansFocus} onClick={() => jouer(retirerCallout)} className="hover:bg-texte/10 block w-full px-3 py-1 text-left text-sm">
              Retirer le callout
            </button>
          </div>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={ouvert === 'icone'}
          title="Icône du callout"
          aria-label="Icône du callout"
          onMouseDown={sansFocus}
          onClick={() => definirOuvert((etat) => (etat === 'icone' ? null : 'icone'))}
          className={`flex size-7 items-center justify-center rounded ${ouvert === 'icone' ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
        >
          {icone}
        </button>
        {ouvert === 'icone' && (
          <div role="menu" aria-label="Icône du callout" className={`${menu} grid w-44 grid-cols-4 gap-1 p-2`}>
            {iconesProposees.map((proposee) => (
              <button
                key={proposee}
                type="button"
                role="menuitemradio"
                aria-checked={proposee === icone}
                onMouseDown={sansFocus}
                onClick={() => jouer(changerIcone(proposee))}
                className={`flex size-8 items-center justify-center rounded text-base ${proposee === icone ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
              >
                {proposee}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
