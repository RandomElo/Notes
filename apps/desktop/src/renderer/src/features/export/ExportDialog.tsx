import type { TreeNode } from '@notes/core';
import type { Theme } from '@notes/ui';
import { Download, FolderOpen, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { margesDePage } from '../../../../shared/ipc-contract';
import type { PageMargins } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { useStoredState } from '../../state/useStoredState';
import { estOptionsDExport, formatsDExport, optionsParDefaut } from './export-options';
import type { ExportFormat, ExportOptions } from './export-options';
import { PageIcon } from '../page-icon/PageIcon';
import { basculerPage, pagesGardees } from './page-selection';
import { ExportSelect } from './ExportSelect';
import { exporterLaPage } from './run-export';

const descriptions: Record<ExportFormat, { libelle: string; detail: string }> = {
  pdf: { libelle: 'PDF', detail: 'Pour imprimer ou envoyer : A4, fond blanc, couleurs du thème.' },
  markdown: { libelle: 'Markdown', detail: "Le texte seul, lisible par n'importe quel outil. Images en mention." },
  html: { libelle: 'HTML', detail: 'Un seul fichier, images comprises, apparence exacte.' },
  zip: { libelle: 'Archive ZIP', detail: 'La page et ses sous-pages en HTML reliées, avec leurs images.' },
};
const libellesDesMarges: Record<PageMargins, string> = { etroites: 'Étroites', normales: 'Normales', larges: 'Larges' };

type ExportState = { genre: 'repos' } | { genre: 'encours' } | { genre: 'fait'; chemin: string; nom: string } | { genre: 'erreur'; message: string };

/** Les pages d'une archive, à cocher : décocher une page décoche ses sous-pages. */
function PagesDeLArchive({ racine, exclues, surChangement }: { racine: TreeNode; exclues: ReadonlySet<string>; surChangement: (exclues: Set<string>) => void }) {
  const ligne = (noeud: TreeNode, profondeur: number): ReactNode => (
    <li key={noeud.chemin}>
      <label
        style={{ paddingLeft: 8 + profondeur * 18 }}
        className="hover:bg-texte/10 has-[:focus-visible]:bg-texte/15 flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-sm"
      >
        <input
          type="checkbox"
          checked={!exclues.has(noeud.chemin)}
          onChange={(evenement) => surChangement(basculerPage(exclues, noeud, evenement.target.checked))}
          className="accent-accent size-4 shrink-0 outline-0"
        />
        <PageIcon icone={noeud.icone} chemin={noeud.chemin} className="text-sm" />
        <span className={`min-w-0 truncate ${exclues.has(noeud.chemin) ? 'text-discret' : ''}`}>{noeud.titre}</span>
      </label>
      {noeud.enfants.length > 0 && <ul>{noeud.enfants.map((enfant) => ligne(enfant, profondeur + 1))}</ul>}
    </li>
  );
  return (
    <ul aria-label="Pages de l'archive" className="max-h-[30vh] overflow-y-auto">
      {ligne(racine, 0)}
    </ul>
  );
}


/** Une case à cocher de la fenêtre, état montré par le fond. */
function Case({ coche, surChangement, children }: { coche: boolean; surChangement: (coche: boolean) => void; children: ReactNode }) {
  return (
    <label className="hover:bg-texte/10 has-[:focus-visible]:bg-texte/15 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm">
      <input type="checkbox" checked={coche} onChange={(evenement) => surChangement(evenement.target.checked)} className="accent-accent size-4 outline-0" />
      {children}
    </label>
  );
}

interface ExportDialogProps {
  noeud: TreeNode;
  theme: Theme;
  surFermeture: () => void;
}

/**
 * Fenêtre d'export d'une page (README §9) : le format, ses options, puis la
 * boîte « Enregistrer sous » du système. Le résultat s'affiche à côté du bouton.
 */
export function ExportDialog({ noeud, theme, surFermeture }: ExportDialogProps) {
  const [options, definirOptions] = useStoredState<ExportOptions>('notes.export', optionsParDefaut, estOptionsDExport);
  const [etat, definirEtat] = useState<ExportState>({ genre: 'repos' });
  const changer = (modification: Partial<ExportOptions>): void => {
    definirOptions((actuelles) => ({ ...actuelles, ...modification }));
    definirEtat({ genre: 'repos' });
  };
  // Pages décochées pour l'archive, par leur chemin. Propre à cet export : rien n'est retenu.
  const [exclues, definirExclues] = useState<ReadonlySet<string>>(new Set());
  const gardees = pagesGardees(noeud, exclues);

  const exporter = async (): Promise<void> => {
    definirEtat({ genre: 'encours' });
    const resultat = await exporterLaPage(noeud, options, theme, exclues);
    if (resultat.ok) {
      definirEtat({ genre: 'fait', chemin: resultat.chemin, nom: resultat.nom });
    } else {
      definirEtat(resultat.annule ? { genre: 'repos' } : { genre: 'erreur', message: resultat.message });
    }
  };

  // Échap ferme, où que soit le focus (il peut être retombé sur la page pendant l'export).
  useEffect(() => {
    const surTouche = (evenement: globalThis.KeyboardEvent): void => {
      if (evenement.key === 'Escape' && !evenement.defaultPrevented) {
        evenement.preventDefault();
        surFermeture();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [surFermeture]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[10vh]" onMouseDown={surFermeture}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exporter la page"
        className="border-bordure bg-surface flex w-full max-w-md flex-col rounded-xl border shadow-2xl"
        onMouseDown={(evenement) => evenement.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
          <Download className="text-accent size-5 shrink-0" aria-hidden="true" />
          <h2 className="shrink-0 text-base font-semibold">Exporter</h2>
          <p className="text-discret min-w-0 truncate text-sm">{noeud.titre}</p>
        </div>

        {/* Rien ne défile ici, pour que les listes ouvertes ne soient pas coupées : seule la liste des pages du ZIP a une hauteur limitée. */}
        <div className="flex flex-col gap-3 px-5 pb-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Format</span>
            <ExportSelect
              libelle="Format"
              valeur={options.format}
              choix={formatsDExport.map((format) => ({ cle: format, libelle: descriptions[format].libelle }))}
              surChoix={(format) => changer({ format })}
              autoFocus
              pleineLargeur
            />
            <span className="text-discret text-xs">{descriptions[options.format].detail}</span>
          </div>

          <div className="flex flex-col gap-1">
            {options.format === 'pdf' && (
              <>
                <div className="flex items-center justify-between gap-3 px-2 text-sm">
                  Marges
                  <ExportSelect
                    libelle="Marges"
                    valeur={options.marges}
                    choix={margesDePage.map((marges) => ({ cle: marges, libelle: libellesDesMarges[marges] }))}
                    surChoix={(marges) => changer({ marges })}
                  />
                </div>
                <Case coche={options.icones} surChangement={(icones) => changer({ icones })}>
                  Icônes (de la page, des mentions et des sites)
                </Case>
              </>
            )}
            {options.format === 'markdown' && (
              <Case coche={options.enTete} surChangement={(enTete) => changer({ enTete })}>
                Garder les métadonnées en tête du fichier (front-matter)
              </Case>
            )}
            {options.format === 'zip' && (
              <>
                <p className="text-discret px-2 py-1 text-xs">
                  {noeud.enfants.length === 0
                    ? "Cette page n'a pas de sous-page."
                    : `${gardees} page${gardees > 1 ? 's' : ''} sur ${pagesGardees(noeud, new Set())}. Décoche celles à laisser de côté.`}
                </p>
                {noeud.enfants.length > 0 && (
                  <PagesDeLArchive
                    racine={noeud}
                    exclues={exclues}
                    surChangement={(suivantes) => {
                      definirExclues(suivantes);
                      definirEtat({ genre: 'repos' });
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div className="border-bordure flex items-center justify-end gap-3 border-t px-5 py-4">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {etat.genre === 'fait' && (
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-succes min-w-0 truncate" title={etat.chemin}>
                  Exporté : {etat.nom}
                </span>
                <button
                  type="button"
                  onClick={() => void api.montrerExport({ chemin: etat.chemin })}
                  className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 outline-0"
                >
                  <FolderOpen className="size-3.5" aria-hidden="true" />
                  Montrer
                </button>
              </span>
            )}
            {etat.genre === 'erreur' && (
              <span role="alert" className="text-erreur">
                {etat.message}
              </span>
            )}
          </div>
          {/* Reste focalisable pendant l'export (aria-disabled) : le focus ne retombe pas sur la page. */}
          <button
            type="button"
            aria-disabled={etat.genre === 'encours' || (options.format === 'zip' && gardees === 0)}
            onClick={() => etat.genre !== 'encours' && !(options.format === 'zip' && gardees === 0) && void exporter()}
            className="bg-accent text-fond hover:bg-accent/85 focus-visible:bg-accent/75 flex h-10 shrink-0 items-center gap-2 rounded-md px-5 text-sm font-semibold outline-0 aria-disabled:opacity-60"
          >
            {etat.genre === 'encours' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
            {etat.genre === 'encours' ? 'Export…' : 'Exporter'}
          </button>
        </div>
      </div>
    </div>
  );
}
