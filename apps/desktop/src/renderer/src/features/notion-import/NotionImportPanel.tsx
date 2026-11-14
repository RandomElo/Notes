import { FileArchive, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TreeNode } from '@notes/core';
import type { NotionAnalysis, NotionDatabaseChoice, NotionProgress } from '../../../../shared/notion-contract';
import { api } from '../../lib/ipc';
import { NotionPagePicker } from './NotionPagePicker';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0';
const boutonPrincipal =
  'bg-accent text-fond hover:brightness-110 focus-visible:brightness-125 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0';


type Etape =
  | { nom: 'repos'; erreur: string | null }
  | { nom: 'lecture' }
  | { nom: 'analyse'; analyse: NotionAnalysis; choix: Record<string, NotionDatabaseChoice> }
  | { nom: 'import'; avancement: NotionProgress | null; arret: boolean }
  | { nom: 'fini'; pages: number; avertissements: { message: string; pages: number }[]; arrete: boolean };

const pluriel = (nombre: number, un: string, plusieurs: string): string => `${nombre.toLocaleString('fr-FR')} ${nombre > 1 ? plusieurs : un}`;

/**
 * Rubrique « Import Notion » des réglages (docs/spec/import-notion.md) : choisir
 * les .zip de l'export HTML, décider base par base, importer à la racine.
 */
export function NotionImportPanel({ surImport }: { surImport: (arbre: TreeNode[]) => void }) {
  const [etape, definirEtape] = useState<Etape>({ nom: 'repos', erreur: null });

  useEffect(
    () =>
      api.surAvancementNotion((avancement) => {
        definirEtape((actuelle) => (actuelle.nom === 'import' ? { ...actuelle, avancement } : actuelle));
      }),
    [],
  );

  const choisir = async (): Promise<void> => {
    const archives = await api.choisirArchivesNotion();
    if (archives.length === 0) {
      return;
    }
    definirEtape({ nom: 'lecture' });
    const resultat = await api.analyserNotion({ archives });
    if (!resultat.ok) {
      definirEtape({ nom: 'repos', erreur: resultat.erreur });
      return;
    }
    definirEtape({ nom: 'analyse', analyse: resultat.analyse, choix: Object.fromEntries(resultat.analyse.bases.map((base) => [base.cle, 'tableau-et-pages'])) });
  };

  const importer = async (choix: Record<string, NotionDatabaseChoice>, exclues: string[]): Promise<void> => {
    definirEtape({ nom: 'import', avancement: null, arret: false });
    const resultat = await api.importerNotion({ choix, exclues });
    if (!resultat.ok) {
      definirEtape({ nom: 'repos', erreur: resultat.erreur });
      return;
    }
    surImport(resultat.arbre);
    definirEtape({ nom: 'fini', pages: resultat.pages, avertissements: resultat.avertissements, arrete: resultat.arrete });
  };

  const abandonner = (): void => {
    void api.abandonnerNotion();
    definirEtape({ nom: 'repos', erreur: null });
  };

  return (
    <section aria-labelledby="titre-notion" className="space-y-4">
      <div>
        <h2 id="titre-notion" className="text-xl font-semibold">
          Import Notion
        </h2>
        <p className="text-discret mt-1 text-sm">
          Toutes les pages de Notion arrivent à la racine du dossier des notes, avec leurs sous-pages, leurs icônes, leurs images et les mentions entre elles. Rien
          n'est envoyé sur Internet.
        </p>
      </div>

      <div className="bg-surface space-y-4 rounded-lg p-4 text-sm">
        {etape.nom === 'repos' && (
          <>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Dans Notion : Paramètres, Général, « Exporter tout le contenu de l'espace ».</li>
              <li>Format HTML, avec le contenu des sous-pages et un dossier par sous-page.</li>
              <li>Notion envoie un lien par courriel : télécharger le ou les fichiers .zip.</li>
              <li>Les choisir ici, tous ensemble s'il y en a plusieurs.</li>
            </ol>
            {etape.erreur !== null && (
              <p role="alert" className="text-erreur">
                {etape.erreur}
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => void choisir()} className={boutonPrincipal}>
                <FileArchive className="size-4" aria-hidden="true" />
                Choisir l'export (.zip)
              </button>
            </div>
          </>
        )}

        {etape.nom === 'lecture' && (
          <p role="status" className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Lecture de l'export…
          </p>
        )}

        {etape.nom === 'analyse' && (
          <>
            <p role="status">
              {pluriel(etape.analyse.pages, 'page', 'pages')} et {pluriel(etape.analyse.images, 'image', 'images')} trouvées : choix des pages en cours.
            </p>
            <NotionPagePicker
              analyse={etape.analyse}
              choix={etape.choix}
              surChoix={(cle, valeur) => definirEtape({ ...etape, choix: { ...etape.choix, [cle]: valeur } })}
              surImport={(exclues) => void importer(etape.choix, exclues)}
              surAnnulation={abandonner}
            />
          </>
        )}

        {etape.nom === 'import' && (
          <>
            <p role="status">{etape.arret ? 'Arrêt après la page en cours…' : 'Import en cours. On peut continuer à écrire.'}</p>
            <div
              className="bg-texte/10 h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="Import"
              aria-valuenow={etape.avancement === null ? 0 : Math.round((etape.avancement.faites / Math.max(1, etape.avancement.total)) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bg-accent h-full rounded-full transition-[width]"
                style={{ width: `${etape.avancement === null ? 0 : (etape.avancement.faites / Math.max(1, etape.avancement.total)) * 100}%` }}
              />
            </div>
            {!etape.arret && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    void api.abandonnerNotion();
                    definirEtape({ ...etape, arret: true });
                  }}
                  className={boutonSecondaire}
                >
                  <X className="size-4" aria-hidden="true" />
                  Arrêter
                </button>
              </div>
            )}
          </>
        )}

        {etape.nom === 'fini' && (
          <>
            <p role="status">
              {etape.arrete ? 'Import arrêté : ' : ''}
              {pluriel(etape.pages, 'page importée', 'pages importées')}.
            </p>
            {etape.avertissements.length > 0 && (
              <ul className="text-discret list-disc space-y-1 pl-5" aria-label="Avertissements de l'import">
                {etape.avertissements.map((avertissement) => (
                  <li key={avertissement.message}>
                    {avertissement.message} ({pluriel(avertissement.pages, 'page', 'pages')})
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => definirEtape({ nom: 'repos', erreur: null })} className={boutonSecondaire}>
                Importer un autre export
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
