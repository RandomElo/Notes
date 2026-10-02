import { TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ThemeNoticeProps {
  avertissements: string[];
  /** Ouvre les réglages, où le détail est affiché. */
  surDetail: () => void;
}

/**
 * Avertissement non bloquant (README §8) : le fichier de thème contient des
 * réglages ignorés. Il n'empêche rien, se ferme, et revient si le fichier
 * change et reste fautif.
 */
export function ThemeNotice({ avertissements, surDetail }: ThemeNoticeProps) {
  const [ferme, definirFerme] = useState(false);
  useEffect(() => definirFerme(false), [avertissements]);
  if (avertissements.length === 0 || ferme) {
    return null;
  }
  return (
    <div role="status" className="bg-surface fixed right-4 bottom-4 z-30 flex max-w-sm items-center gap-3 rounded-lg p-3 text-sm shadow-lg">
      <TriangleAlert className="text-alerte size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        {avertissements.length === 1 ? 'Thème : un réglage a été ignoré.' : `Thème : ${avertissements.length} réglages ont été ignorés.`}
      </p>
      <button type="button" onClick={surDetail} className="bg-texte/10 hover:bg-texte/20 focus-visible:bg-texte/30 rounded px-2 py-1 outline-0">
        Voir
      </button>
      <button
        type="button"
        onClick={() => definirFerme(true)}
        aria-label="Fermer l'avertissement du thème"
        className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 rounded p-0.5 outline-0"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
