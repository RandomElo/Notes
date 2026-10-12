import { nomDeDossier } from '@notes/core';
import { formatsDePapier, margesDePage } from '../../shared/ipc-contract';
import type { ExportImageResult, ExportRequest, ExportResult, PageMargins, PaperFormat } from '../../shared/ipc-contract';
import type { PdfSettings } from '../export/pdf';
import { creerArchive, estCheminDArchive } from '../export/zip';
import type { ArchiveEntry } from '../export/zip';
import { champs } from './vault';

/** Ce que chaque format écrit : extension et nom du filtre de la boîte « Enregistrer sous ». */
const formats = {
  pdf: { extension: 'pdf', libelle: 'Document PDF' },
  markdown: { extension: 'md', libelle: 'Markdown' },
  html: { extension: 'html', libelle: 'Page web' },
  zip: { extension: 'zip', libelle: 'Archive ZIP' },
} as const;

export type ExportFormat = keyof typeof formats;

/** Taille maximale d'un export reçu du renderer (texte ou fichiers d'une archive) : images en base64 comprises. */
export const tailleMaxDExport = 512 * 1024 * 1024;

export interface ExportHandlersDependencies {
  /** Boîte « Enregistrer sous » du système. null si l'utilisateur annule. */
  choisirDestination: (nomPropose: string, format: { extension: string; libelle: string }) => Promise<string | null>;
  imprimer: (html: string, reglages: PdfSettings) => Promise<Uint8Array>;
  ecrire: (chemin: string, octets: Uint8Array) => Promise<void>;
  montrer: (chemin: string) => void;
  /** Ouvre le fichier exporté avec le programme du système (lecteur PDF, navigateur…), pour voir le résultat. */
  ouvrir: (chemin: string) => void;
  /** Image du dossier des notes ouvert (images/asset-protocol.ts), null si ce n'en est pas une. */
  lireImage: (chemin: string) => Promise<{ octets: Uint8Array; type: string } | null>;
}

const estTexte = (valeur: unknown): valeur is string => typeof valeur === 'string' && valeur.length <= tailleMaxDExport;

/** Nom de fichier proposé : le titre assaini comme un nom de dossier de page, avec l'extension du format. */
export function nomDeFichier(nom: string, extension: string): string {
  return `${nomDeDossier(nom.trim() === '' ? 'Export' : nom)}.${extension}`;
}

/** La demande, vérifiée champ par champ, ou null. Les entrées viennent du renderer : rien n'est supposé valide. */
export function lireDemande(demande: unknown): ExportRequest | null {
  const { format, nom } = champs(demande);
  if (typeof nom !== 'string' || nom.length > 1000) {
    return null;
  }
  if (format === 'markdown' || format === 'html') {
    const { texte } = champs(demande);
    return estTexte(texte) ? { format, nom, texte } : null;
  }
  if (format === 'pdf') {
    const { titre, html, papier, marges } = champs(demande);
    const valide =
      typeof titre === 'string' &&
      titre.length <= 1000 &&
      estTexte(html) &&
      (formatsDePapier as readonly unknown[]).includes(papier) &&
      (margesDePage as readonly unknown[]).includes(marges);
    return valide ? { format, nom, titre, html, papier: papier as PaperFormat, marges: marges as PageMargins } : null;
  }
  if (format === 'zip') {
    const { fichiers } = champs(demande);
    if (!Array.isArray(fichiers) || fichiers.length === 0 || fichiers.length > 100_000) {
      return null;
    }
    let total = 0;
    const lus: ArchiveEntry[] = [];
    for (const fichier of fichiers) {
      const { chemin, octets } = champs(fichier);
      if (typeof chemin !== 'string' || !estCheminDArchive(chemin) || !(octets instanceof Uint8Array)) {
        return null;
      }
      total += octets.length;
      lus.push({ chemin, octets });
    }
    return total <= tailleMaxDExport ? { format, nom, fichiers: lus } : null;
  }
  return null;
}

/** Handlers des canaux « export: » (docs/spec/export.md). */
export function creerHandlersExport({ choisirDestination, imprimer, ecrire, montrer, ouvrir, lireImage }: ExportHandlersDependencies) {
  // Seuls les fichiers que l'utilisateur vient d'exporter peuvent être montrés.
  const exportes = new Set<string>();

  return {
    exporter: async (recue: unknown): Promise<ExportResult> => {
      const demande = lireDemande(recue);
      if (demande === null) {
        return { ok: false, annule: false, message: 'Demande invalide.' };
      }
      const format = formats[demande.format];
      const chemin = await choisirDestination(nomDeFichier(demande.nom, format.extension), format);
      if (chemin === null) {
        return { ok: false, annule: true };
      }
      try {
        let octets: Uint8Array;
        if (demande.format === 'pdf') {
          octets = await imprimer(demande.html, { papier: demande.papier, marges: demande.marges, titre: demande.titre });
        } else if (demande.format === 'zip') {
          octets = creerArchive(demande.fichiers);
        } else {
          octets = new TextEncoder().encode(demande.texte);
        }
        await ecrire(chemin, octets);
        exportes.add(chemin);
        ouvrir(chemin);
        return { ok: true, chemin, nom: chemin.split('/').pop() ?? chemin };
      } catch {
        // Pas de chemin ni de détail système dans le message : il s'affiche tel quel.
        return { ok: false, annule: false, message: "L'export n'a pas pu être écrit." };
      }
    },

    montrer: (demande: unknown): void => {
      const { chemin } = champs(demande);
      if (typeof chemin === 'string' && exportes.has(chemin)) {
        montrer(chemin);
      }
    },

    lireImage: async (demande: unknown): Promise<ExportImageResult> => {
      const { chemin } = champs(demande);
      if (typeof chemin !== 'string' || chemin.length > 4096) {
        return { ok: false };
      }
      const image = await lireImage(chemin);
      return image === null ? { ok: false } : { ok: true, ...image };
    },
  };
}
