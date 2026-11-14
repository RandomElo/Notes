import { FileText, Rows3 } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface BaseModeDialogProps {
  /** La page a des sous-pages : elles deviennent les lignes, ou restent des pages à côté d'une base sans pages. */
  aDesSousPages: boolean;
  surChoix: (lignes: 'pages' | 'tableau') => void;
  surAnnulation: () => void;
}

/** Question posée quand une page passe en base de données (docs/spec/base-de-donnees.md) : une page par ligne, ou des lignes sans page. */
export function BaseModeDialog({ aDesSousPages, surChoix, surAnnulation }: BaseModeDialogProps) {
  const premier = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    premier.current?.focus();
  }, []);
  const bouton = 'hover:bg-texte/10 focus-visible:bg-texte/20 flex w-full items-start gap-2 rounded px-2.5 py-2 text-left outline-0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Passer en base de données"
        onKeyDown={(evenement) => {
          if (evenement.key === 'Escape') {
            evenement.preventDefault();
            evenement.stopPropagation();
            surAnnulation();
          }
        }}
        className="border-bordure bg-surface w-96 space-y-2 rounded-lg border p-4 text-sm shadow-xl shadow-black/40"
      >
        <p className="font-semibold">Passer en base de données</p>
        <button ref={premier} type="button" onClick={() => surChoix('pages')} className={bouton}>
          <FileText className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Une page par ligne
            <span className="text-discret block text-xs">{aDesSousPages ? 'Les sous-pages deviennent les lignes. ' : ''}Chaque ligne a sa page, où écrire.</span>
          </span>
        </button>
        <button type="button" onClick={() => surChoix('tableau')} className={bouton}>
          <Rows3 className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Lignes sans page
            <span className="text-discret block text-xs">
              Les lignes vivent dans le tableau de cette page.{aDesSousPages ? ' Les sous-pages restent des pages ; « Paramètres de la base » peut les convertir.' : ''}
            </span>
          </span>
        </button>
        <button type="button" onClick={surAnnulation} className={bouton}>
          Annuler
        </button>
      </div>
    </div>
  );
}
