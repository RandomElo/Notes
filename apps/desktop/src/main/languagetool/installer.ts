import { mkdir, rename, rm, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SpellcheckStep } from '../../shared/ipc-contract';
import { extraireTarGz, extraireZip } from './archive';
import { telechargerVers } from './download';
import type { Telecharger } from './download';
import { archives as archivesParDefaut } from './downloads';
import type { ArchiveATelecharger } from './downloads';
import { ecrireVersions, lireVersions, versionsInitiales } from './versions';

/** Place libre demandée avant de commencer : archives et dossiers décompressés coexistent un moment (n-grammes : 1,8 + 3,2 Go). */
export const placeNecessaire = 6_000_000_000;

/** Intervalle minimal entre deux annonces de progression. */
const intervalleDAnnonceMs = 200;

export interface InstallerDependencies {
  /** Dossier de LanguageTool (`~/Applications/LanguageTool`). L'installation se prépare à côté, puis prend sa place. */
  dossier: string;
  /** Téléchargement d'une adresse https, dans une session à part. */
  telecharger: Telecharger;
  /** Appelé à chaque étape et pendant la progression. */
  surEtapes: (etapes: SpellcheckStep[]) => void;
  archives?: readonly ArchiveATelecharger[];
  /** Place libre demandée avant de commencer, en octets. */
  placeNecessaire?: number;
}

export function etapesInitiales(archives: readonly ArchiveATelecharger[] = archivesParDefaut): SpellcheckStep[] {
  return archives.map((archive) => ({ id: archive.dossier, libelle: archive.libelle, etat: 'a_faire', phase: null, fait: 0, total: archive.taille }));
}

/** Vrai si une installation finie est là (ses versions sont écrites). */
export async function estInstalle(dossier: string): Promise<boolean> {
  return (await lireVersions(dossier)) !== null;
}

/** Message lisible pour l'écran d'installation. Jamais de détail du système qui n'aide pas. */
function messageDErreur(erreur: unknown): string {
  if (erreur instanceof Error && erreur.name === 'AbortError') {
    return 'Installation annulée.';
  }
  return erreur instanceof Error ? erreur.message : "L'installation a échoué.";
}

/**
 * Installe LanguageTool, son Java et les n-grammes (README §11). Tout se
 * prépare dans `<dossier>.installation`, renommé à la fin : un dossier
 * `LanguageTool` présent est toujours une installation complète. Une
 * installation annulée ou ratée ne laisse rien derrière elle.
 */
export class LanguageToolInstaller {
  private readonly archives: readonly ArchiveATelecharger[];
  private controle: AbortController | null = null;
  private etapes: SpellcheckStep[];

  constructor(private readonly dependances: InstallerDependencies) {
    this.archives = dependances.archives ?? archivesParDefaut;
    this.etapes = etapesInitiales(this.archives);
  }

  get enCours(): boolean {
    return this.controle !== null;
  }

  /** Taille totale à télécharger. */
  get tailleTotale(): number {
    return this.archives.reduce((somme, archive) => somme + archive.taille, 0);
  }

  annuler(): void {
    this.controle?.abort();
  }

  /** Rend null si tout s'est bien passé, le message d'erreur sinon. Les étapes restent visibles après un échec. */
  async installer(): Promise<string | null> {
    if (this.controle !== null) {
      return null;
    }
    const controle = new AbortController();
    this.controle = controle;
    this.etapes = etapesInitiales(this.archives);
    this.annoncer();
    const { dossier } = this.dependances;
    const preparation = `${dossier}.installation`;
    try {
      await mkdir(dirname(dossier), { recursive: true });
      const libre = await statfs(dirname(dossier)).then((infos) => infos.bavail * infos.bsize);
      const place = this.dependances.placeNecessaire ?? placeNecessaire;
      if (libre < place) {
        throw new Error(`Il faut ${Math.ceil(place / 1e9)} Go libres dans ${dirname(dossier)}, il y en a ${(libre / 1e9).toFixed(1)}.`);
      }
      await rm(preparation, { recursive: true, force: true });
      await mkdir(preparation, { recursive: true });
      for (const archive of this.archives) {
        await this.installerArchive(archive, preparation, controle.signal);
      }
      await ecrireVersions(preparation, versionsInitiales);
      await rm(dossier, { recursive: true, force: true });
      await rename(preparation, dossier);
      return null;
    } catch (erreur) {
      const etape = this.etapes.find((candidate) => candidate.etat === 'en_cours');
      if (etape !== undefined) {
        etape.etat = 'echec';
      }
      this.annoncer();
      await rm(preparation, { recursive: true, force: true }).catch(() => undefined);
      return messageDErreur(erreur);
    } finally {
      this.controle = null;
    }
  }

  private async installerArchive(archive: ArchiveATelecharger, preparation: string, signal: AbortSignal): Promise<void> {
    const etape = this.etapes.find((candidate) => candidate.id === archive.dossier);
    if (etape === undefined) {
      return;
    }
    etape.etat = 'en_cours';
    etape.phase = 'telechargement';
    this.annoncer();

    const fichier = join(preparation, `${archive.dossier}.${archive.format}`);
    const empreinte = await telechargerVers(fichier, archive, this.dependances.telecharger, signal, (recus) => this.progresser(etape, recus));
    etape.phase = 'verification';
    this.annoncer();
    if (empreinte !== archive.empreinte) {
      throw new Error(`${archive.libelle} : le fichier reçu n'est pas celui attendu (empreinte différente). Rien n'a été installé.`);
    }

    etape.phase = 'decompression';
    etape.fait = 0;
    this.annoncer();
    const extraction = {
      fichier,
      destination: join(preparation, archive.dossier),
      niveauxRetires: archive.niveauxRetires,
      surProgression: (octets: number) => this.progresser(etape, octets),
      signal,
    };
    await (archive.format === 'zip' ? extraireZip(extraction) : extraireTarGz(extraction));
    await rm(fichier, { force: true });
    etape.etat = 'fait';
    etape.phase = null;
    etape.fait = etape.total;
    this.annoncer();
  }

  private derniereAnnonce = 0;

  private progresser(etape: SpellcheckStep, fait: number): void {
    etape.fait = Math.min(fait, etape.total);
    const maintenant = Date.now();
    if (maintenant - this.derniereAnnonce >= intervalleDAnnonceMs) {
      this.annoncer();
    }
  }

  private annoncer(): void {
    this.derniereAnnonce = Date.now();
    this.dependances.surEtapes(this.etapes.map((etape) => ({ ...etape })));
  }
}
