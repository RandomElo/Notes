import { mkdtemp, rm, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { lireArbre } from '@notes/core';
import type { NotionAnalysisResult, NotionDatabaseChoice, NotionImportResult, NotionPageNode, NotionPreviewResult, NotionProgress } from '../../shared/notion-contract';
import { extraireArchives } from '../notion/notion-archive';
import { analyserExport, apercuDePage, importerExport, titreDeLaPage } from '../notion/notion-import';
import type { NotionExport } from '../notion/notion-import';
import type { VaultService } from '../vault/vault-service';
import { champs } from './vault';

export interface NotionHandlersDependencies {
  vault: VaultService;
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  /** Dossier où créer le dossier temporaire de l'export. */
  dossierTemporaire: () => string;
  choisirArchives: () => Promise<string[]>;
  signalerAvancement: (avancement: NotionProgress) => void;
}

const choixPossibles: readonly NotionDatabaseChoice[] = ['tableau-et-pages', 'pages', 'tableau', 'ignorer'];
const maxArchives = 50;

/** L'arbre à cocher, tiré de l'analyse. */
function arbreDe(exportNotion: NotionExport): NotionPageNode[] {
  const noeud = (fichier: string): NotionPageNode => {
    const page = exportNotion.pages.get(fichier)!;
    return {
      fichier,
      titre: titreDeLaPage(fichier, page.resume),
      icone: page.resume.icone?.nature === 'emoji' ? page.resume.icone.valeur : null,
      signalements: page.signalements,
      pdf: page.pdf,
      bases: exportNotion.bases.filter((base) => base.cle.startsWith(`${fichier}#`)).map((base) => base.cle),
      enfants: page.enfants.map(noeud),
    };
  };
  return exportNotion.racines.map(noeud);
}

const message = (erreur: unknown): string => (erreur instanceof Error ? erreur.message : String(erreur));

/**
 * Import de Notion (docs/spec/import-notion.md) : une analyse à la fois, gardée
 * avec son dossier temporaire jusqu'à l'import ou l'abandon. Les archives
 * viennent du sélecteur de fichiers ; leurs chemins sont revérifiés.
 */
export function creerHandlersNotion({ vault, enSerie, dossierTemporaire, choisirArchives, signalerAvancement }: NotionHandlersDependencies) {
  let analyse: NotionExport | null = null;
  let enCours = false;
  let arrete = false;

  const oublier = async (): Promise<void> => {
    const dossier = analyse?.dossier;
    analyse = null;
    if (dossier !== undefined) {
      await rm(dossier, { recursive: true, force: true }).catch(() => undefined);
    }
  };

  return {
    choisir: (): Promise<string[]> => choisirArchives(),

    analyser: async (demande: unknown): Promise<NotionAnalysisResult> => {
      const { archives } = champs(demande);
      if (!Array.isArray(archives) || archives.length === 0 || archives.length > maxArchives || !archives.every((archive) => typeof archive === 'string' && isAbsolute(archive) && /\.zip$/i.test(archive))) {
        return { ok: false, erreur: 'Choisis un ou plusieurs fichiers .zip exportés de Notion.' };
      }
      if (enCours) {
        return { ok: false, erreur: 'Un import est déjà en cours.' };
      }
      await oublier();
      const dossier = await mkdtemp(join(dossierTemporaire(), 'notes-notion-'));
      try {
        for (const archive of archives as string[]) {
          if (!(await stat(archive).catch(() => null))?.isFile()) {
            throw new Error(`${archive.split('/').pop()} est introuvable.`);
          }
        }
        signalerAvancement({ etape: 'lecture', faites: 0, total: archives.length });
        await extraireArchives(archives as string[], dossier);
        analyse = await analyserExport(dossier);
        if (analyse.pages.size === 0) {
          await oublier();
          return { ok: false, erreur: "Aucune page de Notion dans ces fichiers. Il faut l'export au format HTML." };
        }
        return {
          ok: true,
          analyse: {
            pages: analyse.pages.size,
            images: analyse.images,
            bases: analyse.bases.map(({ cle, titre, page, lignes }) => ({ cle, titre, page, lignes: lignes.length })),
            arbre: arbreDe(analyse),
          },
        };
      } catch (erreur) {
        analyse = null;
        await rm(dossier, { recursive: true, force: true }).catch(() => undefined);
        return { ok: false, erreur: `Lecture de l'export impossible : ${message(erreur)}` };
      }
    },

    apercu: async (demande: unknown): Promise<NotionPreviewResult> => {
      const { fichier } = champs(demande);
      if (analyse === null || typeof fichier !== 'string' || !analyse.pages.has(fichier)) {
        return { ok: false, erreur: 'Page introuvable dans l’export.' };
      }
      try {
        const apercu = await apercuDePage(analyse, fichier);
        return apercu === null ? { ok: false, erreur: 'Page introuvable dans l’export.' } : { ok: true, ...apercu };
      } catch (erreur) {
        return { ok: false, erreur: `Aperçu impossible : ${message(erreur)}` };
      }
    },

    importer: async (demande: unknown): Promise<NotionImportResult> => {
      const exportNotion = analyse;
      if (exportNotion === null) {
        return { ok: false, erreur: "Aucun export n'est analysé." };
      }
      if (enCours) {
        return { ok: false, erreur: 'Un import est déjà en cours.' };
      }
      const recu = champs(demande)['choix'];
      const exclues = champs(demande)['exclues'] ?? [];
      if (typeof recu !== 'object' || recu === null || !Array.isArray(exclues) || !exclues.every((fichier) => typeof fichier === 'string' && exportNotion.pages.has(fichier))) {
        return { ok: false, erreur: 'Demande invalide.' };
      }
      const choix = new Map<string, NotionDatabaseChoice>();
      for (const base of exportNotion.bases) {
        const valeur = (recu as Record<string, unknown>)[base.cle];
        if (typeof valeur === 'string' && (choixPossibles as readonly string[]).includes(valeur)) {
          choix.set(base.cle, valeur as NotionDatabaseChoice);
        }
      }
      enCours = true;
      arrete = false;
      try {
        const contexte = vault.contexte();
        const resultat = await importerExport({
          contexte,
          exportNotion,
          choix,
          exclues: exclues as string[],
          enSerie,
          surProgression: (faites, total) => signalerAvancement({ etape: 'import', faites, total }),
          arrete: () => arrete,
        });
        return { ok: true, ...resultat, arbre: await lireArbre(contexte.fs), arrete };
      } catch (erreur) {
        return { ok: false, erreur: `L'import s'est arrêté : ${message(erreur)}` };
      } finally {
        enCours = false;
        await oublier();
      }
    },

    abandonner: async (): Promise<void> => {
      if (enCours) {
        arrete = true;
        return;
      }
      await oublier();
    },

    /** À la fermeture : rien ne doit rester dans le dossier temporaire. */
    arreter: (): Promise<void> => {
      arrete = true;
      return enCours ? Promise.resolve() : oublier();
    },
  };
}
