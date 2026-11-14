import { useEffect, useMemo, useRef, useState } from 'react';
import readme from '../../../../../../../README.md?raw';
import { dateCourte, versionsDeLaFrise } from './version-history';

/**
 * La version dans la barre de titre : un clic montre les versions, la plus
 * récente en haut, chacune en quelques mots (la frise du README).
 * `Échap` ou un clic ailleurs la referme.
 */
export function VersionHistory({ version }: { version: string }) {
  const [ouvert, definirOuvert] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const versions = useMemo(() => versionsDeLaFrise(readme), []);

  useEffect(() => {
    if (!ouvert) {
      return undefined;
    }
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') {
        // Échap ferme la liste, et seulement elle (pas les réglages ouverts derrière).
        evenement.stopPropagation();
        definirOuvert(false);
      }
    };
    const surClic = (evenement: MouseEvent): void => {
      if (evenement.target instanceof Node && zone.current?.contains(evenement.target) !== true) {
        definirOuvert(false);
      }
    };
    window.addEventListener('keydown', surTouche, true);
    window.addEventListener('mousedown', surClic, true);
    return () => {
      window.removeEventListener('keydown', surTouche, true);
      window.removeEventListener('mousedown', surClic, true);
    };
  }, [ouvert]);

  return (
    <div ref={zone} className="hors-deplacement relative shrink-0">
      <button
        type="button"
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        onClick={() => definirOuvert((actuel) => !actuel)}
        className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 rounded px-1.5 py-0.5 text-xs whitespace-nowrap outline-0"
      >
        version {version}
      </button>
      {ouvert && (
        <div role="dialog" aria-label="Versions de Notes" className="bg-surface absolute top-full left-0 z-50 mt-1.5 w-[26rem] rounded-lg p-1.5 shadow-xl">
          <ol className="max-h-[60vh] overflow-y-auto">
            {versions.map((entree) => (
              <li key={entree.version} aria-current={entree.version === version ? 'true' : undefined} className={`rounded-md px-3 py-1.5 ${entree.version === version ? 'bg-accent/20' : ''}`}>
                <p className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold">{entree.version}</span>
                  <span className="text-discret">{dateCourte(entree.date)}</span>
                </p>
                <p className="text-discret text-xs">{entree.etapes.join(' · ')}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
