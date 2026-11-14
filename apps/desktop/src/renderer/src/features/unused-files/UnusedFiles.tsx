import type { UnusedFile } from '@notes/core';
import { FileSearch, FolderOpen, ListChecks, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/ipc';
import { UnusedFilesDialog } from './UnusedFilesDialog';
import { libelleDeTaille, resume } from './unused-files';

type Recherche = { etat: 'pas-faite' } | { etat: 'en-cours' } | { etat: 'faite'; fichiers: UnusedFile[] };

/** Au-delà, la liste ne tient plus dans les réglages : elle s'ouvre dans la fenêtre de tri. */
const maxDansLesReglages = 5;

/**
 * Fichiers inutilisés (docs/spec/stockage.md) : les images et PDF des dossiers `assets/` dont
 * la page ne parle plus, après une image ou un PDF retiré du texte. Rien ne part tout
 * seul : on les montre dans le gestionnaire de fichiers, ou on les met à la
 * corbeille (docs/spec/corbeille.md). Quand il y en a beaucoup, une fenêtre aide à les trier.
 */
export function UnusedFiles() {
  const [recherche, definirRecherche] = useState<Recherche>({ etat: 'pas-faite' });
  const [tri, definirTri] = useState(false);
  const [erreur, definirErreur] = useState<{ chemin: string; message: string } | null>(null);

  const retirer = (chemins: string[]): void => {
    const partis = new Set(chemins);
    definirRecherche((actuelle) => (actuelle.etat === 'faite' ? { etat: 'faite', fichiers: actuelle.fichiers.filter((fichier) => !partis.has(fichier.chemin)) } : actuelle));
  };
  const mettreALaCorbeille = async (chemin: string): Promise<void> => {
    const resultat = await api.mettreFichierJointALaCorbeille({ chemin });
    if (!resultat.ok) {
      definirErreur({ chemin, message: resultat.erreur.message });
      return;
    }
    definirErreur(null);
    retirer([chemin]);
  };
  const chercher = (): void => {
    definirRecherche({ etat: 'en-cours' });
    void api.listerFichiersInutilises().then((fichiers) => definirRecherche({ etat: 'faite', fichiers }));
  };
  const fichiers = recherche.etat === 'faite' ? recherche.fichiers : [];

  return (
    <section aria-labelledby="titre-fichiers-inutilises" className="space-y-4">
      <div>
        <h2 id="titre-fichiers-inutilises" className="text-xl font-semibold">
          Fichiers inutilisés
        </h2>
        <p className="text-discret mt-1 text-sm">
          Les images et PDF restés dans le dossier d'une page alors que la page ne les montre plus. Un fichier mis à la corbeille s'y restaure pendant 30 jours.
        </p>
      </div>
      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status">
            {recherche.etat === 'pas-faite'
              ? 'Pas encore cherché.'
              : recherche.etat === 'en-cours'
                ? 'Recherche en cours…'
                : fichiers.length === 0
                  ? 'Aucun fichier inutilisé.'
                  : `Inutilisés : ${resume(fichiers)}.`}
          </p>
          <div className="flex items-center gap-2">
            {fichiers.length > maxDansLesReglages && (
              <button
                type="button"
                onClick={() => definirTri(true)}
                className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex h-8 items-center gap-2 rounded-md px-3 font-medium whitespace-nowrap outline-0"
              >
                <ListChecks className="size-4 shrink-0" aria-hidden="true" />
                Trier
              </button>
            )}
            <button
              type="button"
              onClick={chercher}
              disabled={recherche.etat === 'en-cours'}
              className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 leading-none font-medium whitespace-nowrap outline-0 disabled:opacity-50"
            >
              <FileSearch className="size-4 shrink-0" aria-hidden="true" />
              Chercher
            </button>
          </div>
        </div>
        {fichiers.length > 0 && fichiers.length <= maxDansLesReglages && (
          <ul className="space-y-1">
            {fichiers.map((fichier) => (
              <li key={fichier.chemin} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={fichier.chemin}>
                  {fichier.chemin}
                </span>
                <span className="text-discret text-xs">{libelleDeTaille(fichier.taille)}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void api.montrerFichier({ chemin: fichier.chemin })}
                    className="hover:bg-texte/10 focus-visible:bg-accent/30 inline-flex items-center gap-1.5 rounded px-2 py-1 outline-0"
                  >
                    <FolderOpen className="size-3.5" aria-hidden="true" />
                    Montrer
                  </button>
                  <button
                    type="button"
                    onClick={() => void mettreALaCorbeille(fichier.chemin)}
                    className="hover:bg-texte/10 focus-visible:bg-accent/30 inline-flex items-center gap-1.5 rounded px-2 py-1 outline-0"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Mettre à la corbeille
                  </button>
                </span>
                {erreur?.chemin === fichier.chemin && <p className="text-erreur w-full text-xs">{erreur.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {tri && fichiers.length > 0 && <UnusedFilesDialog fichiers={fichiers} surRetrait={retirer} surFermeture={() => definirTri(false)} />}
    </section>
  );
}
