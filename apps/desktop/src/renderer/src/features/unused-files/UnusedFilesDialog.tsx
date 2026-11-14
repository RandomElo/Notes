import type { UnusedFile } from '@notes/core';
import { FileText, FolderOpen, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { schemaDesImages } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { fichiersMontres, libelleDeTaille, nomDuFichier, pageDuFichier, resume } from './unused-files';
import type { FileFilter, FileSort } from './unused-files';

interface UnusedFilesDialogProps {
  fichiers: UnusedFile[];
  /** Fichiers mis à la corbeille : ils sortent de la liste des réglages. */
  surRetrait: (chemins: string[]) => void;
  surFermeture: () => void;
}

const adresse = (chemin: string): string => `${schemaDesImages}://vault/${chemin.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Fenêtre de tri des fichiers inutilisés (docs/spec/stockage.md), quand il y en a beaucoup : chacun
 * avec son aperçu, sa page, sa taille ; triés par taille, nom ou date, filtrés par nature. On coche
 * ceux qui partent à la corbeille. `Échap` ferme.
 */
export function UnusedFilesDialog({ fichiers, surRetrait, surFermeture }: UnusedFilesDialogProps) {
  const [filtre, definirFiltre] = useState<FileFilter>('tous');
  const [tri, definirTri] = useState<FileSort>('taille');
  const [coches, definirCoches] = useState<Set<string>>(new Set());
  const [enCours, definirEnCours] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const fenetre = useRef<HTMLDivElement>(null);
  const montres = useMemo(() => fichiersMontres(fichiers, filtre, tri), [fichiers, filtre, tri]);
  const choisis = fichiers.filter((fichier) => coches.has(fichier.chemin));

  useEffect(() => {
    fenetre.current?.focus();
  }, []);

  // Échap ferme la fenêtre, même quand le focus en est sorti (bouton désactivé) : en capture, avant les réglages.
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape' && !enCours) {
        evenement.preventDefault();
        evenement.stopPropagation();
        surFermeture();
      }
    };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [enCours, surFermeture]);

  const basculer = (chemin: string): void => {
    definirCoches((avant) => {
      const apres = new Set(avant);
      if (apres.has(chemin)) {
        apres.delete(chemin);
      } else {
        apres.add(chemin);
      }
      return apres;
    });
  };
  const toutCoche = montres.length > 0 && montres.every((fichier) => coches.has(fichier.chemin));

  const mettreALaCorbeille = async (): Promise<void> => {
    definirEnCours(true);
    const partis: string[] = [];
    for (const fichier of choisis) {
      const resultat = await api.mettreFichierJointALaCorbeille({ chemin: fichier.chemin });
      if (resultat.ok) {
        partis.push(fichier.chemin);
      }
    }
    definirEnCours(false);
    const refuses = choisis.length - partis.length;
    definirErreur(refuses === 0 ? null : refuses === 1 ? "Un fichier n'a pas pu être mis à la corbeille." : `${refuses} fichiers n'ont pas pu être mis à la corbeille.`);
    definirCoches(new Set());
    surRetrait(partis);
  };

  const choix = 'hover:bg-texte/10 focus-visible:bg-texte/20 rounded px-2 py-1 outline-0';
  const choixActif = 'bg-accent/25 focus-visible:bg-accent/40 rounded px-2 py-1 outline-0';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={fenetre}
        role="dialog"
        aria-modal="true"
        aria-label="Trier les fichiers inutilisés"
        tabIndex={-1}
        className="bg-surface flex max-h-[85vh] w-[46rem] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg p-4 text-sm shadow-xl shadow-black/40 outline-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Fichiers inutilisés : {resume(fichiers)}</h2>
          <div className="flex items-center gap-1" role="group" aria-label="Nature">
            {(['tous', 'image', 'pdf'] as const).map((valeur) => (
              <button key={valeur} type="button" aria-pressed={filtre === valeur} onClick={() => definirFiltre(valeur)} className={filtre === valeur ? choixActif : choix}>
                {valeur === 'tous' ? 'Tous' : valeur === 'image' ? 'Images' : 'PDF'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={toutCoche} onChange={() => definirCoches(toutCoche ? new Set() : new Set(montres.map((fichier) => fichier.chemin)))} className="accent-accent size-4" />
            Tout cocher
          </label>
          <div className="flex items-center gap-1" role="group" aria-label="Trier par">
            <span className="text-discret mr-1">Trier par</span>
            {(['taille', 'nom', 'date'] as const).map((valeur) => (
              <button key={valeur} type="button" aria-pressed={tri === valeur} onClick={() => definirTri(valeur)} className={tri === valeur ? choixActif : choix}>
                {valeur === 'taille' ? 'Taille' : valeur === 'nom' ? 'Nom' : 'Date'}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" aria-label="Fichiers">
          {montres.map((fichier) => (
            <li key={fichier.chemin} className={`flex items-center gap-3 rounded px-2 py-1 ${coches.has(fichier.chemin) ? 'bg-accent/15' : 'hover:bg-texte/5'}`}>
              <input type="checkbox" checked={coches.has(fichier.chemin)} onChange={() => basculer(fichier.chemin)} aria-label={`Choisir ${nomDuFichier(fichier.chemin)}`} className="accent-accent size-4 shrink-0" />
              <span className="bg-fond flex size-12 shrink-0 items-center justify-center overflow-hidden rounded">
                {fichier.nature === 'image' ? <img src={adresse(fichier.chemin)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : <FileText className="text-discret size-6" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={fichier.chemin}>
                  {nomDuFichier(fichier.chemin)}
                </span>
                <span className="text-discret block truncate text-xs">
                  {pageDuFichier(fichier.chemin) || 'Racine'} · {new Date(fichier.modifieLe).toLocaleDateString('fr-FR')}
                </span>
              </span>
              <span className="text-discret w-16 shrink-0 text-right text-xs">{libelleDeTaille(fichier.taille)}</span>
              <button
                type="button"
                onClick={() => void api.montrerFichier({ chemin: fichier.chemin })}
                aria-label={`Montrer ${nomDuFichier(fichier.chemin)} dans le gestionnaire de fichiers`}
                title="Montrer dans le gestionnaire de fichiers"
                className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 flex size-7 shrink-0 items-center justify-center rounded outline-0"
              >
                <FolderOpen className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {erreur !== null && (
          <p role="alert" className="text-erreur">
            {erreur}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={surFermeture} disabled={enCours} className="hover:bg-texte/10 focus-visible:bg-texte/20 h-8 rounded-md px-3 font-medium outline-0">
            Fermer
          </button>
          <button
            type="button"
            disabled={choisis.length === 0 || enCours}
            onClick={() => void mettreALaCorbeille()}
            className="bg-erreur/20 hover:bg-erreur/35 focus-visible:bg-erreur/45 inline-flex h-8 items-center gap-2 rounded-md px-3 font-medium outline-0 disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {choisis.length === 0 ? 'Mettre à la corbeille' : `Mettre à la corbeille (${resume(choisis)})`}
          </button>
        </div>
      </div>
    </div>
  );
}
