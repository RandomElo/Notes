import { FolderOpen, ImageOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/ipc';

type Recherche = { etat: 'pas-faite' } | { etat: 'en-cours' } | { etat: 'faite'; images: string[] };

/**
 * Images inutilisées (README §6) : les fichiers des dossiers `assets/` dont
 * la page ne parle plus, après une image retirée du texte. Rien ne part tout
 * seul : on les montre dans le gestionnaire de fichiers, ou on les met à la
 * corbeille une par une (README §10).
 */
export function UnusedImages() {
  const [recherche, definirRecherche] = useState<Recherche>({ etat: 'pas-faite' });
  const [erreur, definirErreur] = useState<{ image: string; message: string } | null>(null);
  const mettreALaCorbeille = async (image: string): Promise<void> => {
    const resultat = await api.mettreImageALaCorbeille({ chemin: image });
    if (!resultat.ok) {
      definirErreur({ image, message: resultat.erreur.message });
      return;
    }
    definirErreur(null);
    definirRecherche((actuelle) => (actuelle.etat === 'faite' ? { etat: 'faite', images: actuelle.images.filter((autre) => autre !== image) } : actuelle));
  };
  // « Tout mettre à la corbeille » : confirmation à la place du bouton, puis une image après l'autre.
  const [confirmationDeTout, definirConfirmationDeTout] = useState(false);
  const [enCours, definirEnCours] = useState(false);
  const [echecs, definirEchecs] = useState<string | null>(null);
  const toutMettreALaCorbeille = async (images: string[]): Promise<void> => {
    definirEnCours(true);
    const refusees: string[] = [];
    for (const image of images) {
      const resultat = await api.mettreImageALaCorbeille({ chemin: image });
      if (!resultat.ok) {
        refusees.push(image);
      }
    }
    definirEnCours(false);
    definirConfirmationDeTout(false);
    definirErreur(null);
    definirEchecs(refusees.length === 0 ? null : refusees.length === 1 ? "Une image n'a pas pu être mise à la corbeille." : `${refusees.length} images n'ont pas pu être mises à la corbeille.`);
    definirRecherche({ etat: 'faite', images: refusees });
  };
  const chercher = (): void => {
    definirConfirmationDeTout(false);
    definirEchecs(null);
    definirRecherche({ etat: 'en-cours' });
    void api.listerImagesOrphelines().then((images) => definirRecherche({ etat: 'faite', images }));
  };
  return (
    <section aria-labelledby="titre-images" className="space-y-4">
      <div>
        <h2 id="titre-images" className="text-xl font-semibold">
          Images inutilisées
        </h2>
        <p className="text-discret mt-1 text-sm">Les images restées dans le dossier d'une page alors que la page ne les montre plus. Une image mise à la corbeille s'y restaure pendant 30 jours.</p>
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
        {recherche.etat === 'faite' && recherche.images.length > 1 && (
          <div
            className="flex flex-wrap items-center justify-end gap-2"
            aria-live="polite"
            onKeyDown={(evenement) => {
              if (evenement.key === 'Escape' && confirmationDeTout) {
                // Les réglages ne doivent pas se fermer pour autant.
                evenement.preventDefault();
                definirConfirmationDeTout(false);
              }
            }}
          >
            {echecs !== null && <p className="text-erreur">{echecs}</p>}
            {confirmationDeTout ? (
              <>
                <button
                  type="button"
                  autoFocus
                  aria-disabled={enCours}
                  onClick={() => !enCours && void toutMettreALaCorbeille(recherche.images)}
                  className="bg-erreur/20 hover:bg-erreur/35 focus-visible:bg-erreur/45 inline-flex h-8 items-center gap-2 rounded-md px-3 font-medium whitespace-nowrap outline-0"
                >
                  <Trash2 className="size-4 shrink-0" aria-hidden="true" />
                  Mettre les {recherche.images.length} images à la corbeille
                </button>
                <button
                  type="button"
                  onClick={() => definirConfirmationDeTout(false)}
                  className="hover:bg-texte/10 focus-visible:bg-texte/20 inline-flex h-8 items-center rounded-md px-3 font-medium outline-0"
                >
                  Annuler
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => definirConfirmationDeTout(true)}
                className="hover:bg-texte/10 focus-visible:bg-texte/20 inline-flex h-8 items-center gap-2 rounded-md px-3 font-medium whitespace-nowrap outline-0"
              >
                <Trash2 className="size-4 shrink-0" aria-hidden="true" />
                Tout mettre à la corbeille
              </button>
            )}
          </div>
        )}
        {recherche.etat === 'faite' && recherche.images.length > 0 && (
          <ul className="space-y-1">
            {recherche.images.map((image) => (
              <li key={image} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={image}>
                  {image}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void api.montrerFichier({ chemin: image })}
                    className="hover:bg-texte/10 focus-visible:bg-accent/30 inline-flex items-center gap-1.5 rounded px-2 py-1 outline-0"
                  >
                    <FolderOpen className="size-3.5" aria-hidden="true" />
                    Montrer
                  </button>
                  <button
                    type="button"
                    onClick={() => void mettreALaCorbeille(image)}
                    className="hover:bg-texte/10 focus-visible:bg-accent/30 inline-flex items-center gap-1.5 rounded px-2 py-1 outline-0"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Mettre à la corbeille
                  </button>
                </span>
                {erreur?.image === image && <p className="text-erreur w-full text-xs">{erreur.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
