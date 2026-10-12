import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface MarkdownDropDialogProps {
  /** Noms des fichiers déposés. */
  noms: string[];
  /** Titre de la page ouverte, null s'il n'y en a pas : les pages se créent alors à la racine. */
  pageOuverte: string | null;
  /** Le texte peut s'ajouter à la page ouverte (affichée et modifiable). */
  ajoutPossible: boolean;
  /** Rend le message d'erreur, ou null si c'est fait. */
  surCreation: () => Promise<string | null>;
  surAjout: () => Promise<string | null>;
  surAnnulation: () => void;
}

/**
 * Question posée quand on dépose des fichiers Markdown dans la fenêtre
 * (docs/spec/interface.md) : en faire des pages, sous la page ouverte, ou
 * ajouter leur texte à la fin de celle-ci. `Échap` annule.
 */
export function MarkdownDropDialog({ noms, pageOuverte, ajoutPossible, surCreation, surAjout, surAnnulation }: MarkdownDropDialogProps) {
  const [enCours, definirEnCours] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const premier = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    premier.current?.focus();
  }, []);

  const lancer = (action: () => Promise<string | null>): void => {
    definirEnCours(true);
    definirErreur(null);
    void action().then((message) => {
      definirEnCours(false);
      definirErreur(message);
    });
  };
  const plusieurs = noms.length > 1;
  const bouton = 'rounded px-2.5 py-1.5 text-left outline-0 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fichiers Markdown déposés"
        onKeyDown={(evenement) => {
          if (evenement.key === 'Escape' && !enCours) {
            evenement.preventDefault();
            evenement.stopPropagation();
            surAnnulation();
          }
        }}
        className="border-bordure bg-surface w-96 space-y-3 rounded-lg border p-4 text-sm shadow-xl shadow-black/40"
      >
        <p className="flex items-start gap-2">
          <FileText className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {plusieurs ? `${noms.length} fichiers Markdown` : 'Un fichier Markdown'}
            <span className="text-discret block truncate text-xs" title={noms.join(', ')}>
              {noms.join(', ')}
            </span>
          </span>
        </p>
        <div className="flex flex-col gap-1">
          <button ref={premier} type="button" disabled={enCours} onClick={() => lancer(surCreation)} className={`bg-accent/25 hover:bg-accent/40 focus-visible:bg-accent/50 ${bouton}`}>
            {plusieurs ? `Créer ${noms.length} pages` : 'Créer une page'}
            <span className="text-discret block text-xs">{pageOuverte === null ? 'À la racine' : `Sous « ${pageOuverte} »`}</span>
          </button>
          {ajoutPossible && pageOuverte !== null && (
            <button type="button" disabled={enCours} onClick={() => lancer(surAjout)} className={`hover:bg-texte/10 focus-visible:bg-texte/20 ${bouton}`}>
              Ajouter à la fin de « {pageOuverte} »
            </button>
          )}
          <button type="button" disabled={enCours} onClick={surAnnulation} className={`hover:bg-texte/10 focus-visible:bg-texte/20 ${bouton}`}>
            Annuler
          </button>
        </div>
        {erreur !== null && (
          <p role="alert" className="text-erreur">
            {erreur}
          </p>
        )}
      </div>
    </div>
  );
}
