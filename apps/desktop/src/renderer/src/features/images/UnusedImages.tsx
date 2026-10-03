import { FolderOpen, ImageOff } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/ipc';

type Recherche = { etat: 'pas-faite' } | { etat: 'en-cours' } | { etat: 'faite'; images: string[] };

/**
 * Images inutilisées (README §6) : les fichiers des dossiers `assets/` dont
 * la page ne parle plus, après une image retirée du texte. Ils sont listés,
 * pas supprimés : on les montre dans le gestionnaire de fichiers, et on
 * décide soi-même.
 */
export function UnusedImages() {
  const [recherche, definirRecherche] = useState<Recherche>({ etat: 'pas-faite' });
  const chercher = (): void => {
    definirRecherche({ etat: 'en-cours' });
    void api.listerImagesOrphelines().then((images) => definirRecherche({ etat: 'faite', images }));
  };
  return (
    <section aria-labelledby="titre-images" className="space-y-4">
      <div>
        <h2 id="titre-images" className="text-xl font-semibold">
          Images inutilisées
        </h2>
        <p className="text-discret mt-1 text-sm">Les images restées dans le dossier d'une page alors que la page ne les montre plus. Rien n'est supprimé ici.</p>
      </div>
      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status">
            {recherche.etat === 'pas-faite'
              ? 'Pas encore cherché.'
              : recherche.etat === 'en-cours'
                ? 'Recherche en cours…'
                : recherche.images.length === 0
                  ? 'Aucune image inutilisée.'
                  : recherche.images.length === 1
                    ? 'Une image inutilisée.'
                    : `${recherche.images.length} images inutilisées.`}
          </p>
          <button
            type="button"
            onClick={chercher}
            disabled={recherche.etat === 'en-cours'}
            className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 leading-none font-medium whitespace-nowrap outline-0 disabled:opacity-50"
          >
            <ImageOff className="size-4 shrink-0" aria-hidden="true" />
            Chercher
          </button>
        </div>
        {recherche.etat === 'faite' && recherche.images.length > 0 && (
          <ul className="space-y-1">
            {recherche.images.map((image) => (
              <li key={image} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-xs" title={image}>
                  {image}
                </span>
                <button
                  type="button"
                  onClick={() => void api.montrerFichier({ chemin: image })}
                  className="hover:bg-texte/10 focus-visible:bg-accent/30 inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 outline-0"
                >
                  <FolderOpen className="size-3.5" aria-hidden="true" />
                  Montrer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
