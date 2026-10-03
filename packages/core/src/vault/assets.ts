import { joindreChemins, verifierCheminRelatif } from '../fs/paths';
import { versTexte } from '../fs/utf8';
import type { LocalFs } from '../fs/local-fs';
import { cleDeNom, longueurMaxNom } from '../page/naming';
import { fichierPage } from '../page/types';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { estIgnore } from './tree';

/**
 * Images d'une page (README §4 et §6) : elles sont copiées dans le dossier
 * `assets/` de la page, et la page y renvoie par un chemin relatif
 * (`assets/schema.png`). Une page déplacée ou dupliquée emporte donc ses images.
 */

export const dossierAssets = 'assets';

/** Taille maximale d'une image ajoutée : bien au-delà d'une capture d'écran, bien en deçà d'un abus. */
export const tailleMaxDImage = 50 * 1024 * 1024;

/** Taille maximale d'une image reçue avant sa conversion en WebP, qui la ramène bien en dessous de la précédente. */
export const tailleMaxAvantConversion = 200 * 1024 * 1024;

export type ImageKind = 'png' | 'jpg' | 'gif' | 'webp' | 'avif' | 'svg';

const extensions: Record<ImageKind, string[]> = {
  png: ['png'],
  jpg: ['jpg', 'jpeg'],
  gif: ['gif'],
  webp: ['webp'],
  avif: ['avif'],
  svg: ['svg'],
};

/** Extensions des fichiers d'image reconnus. */
export const extensionsDImage = Object.values(extensions).flat();

const commencePar = (octets: Uint8Array, signature: number[], decalage = 0): boolean => signature.every((octet, index) => octets[decalage + index] === octet);
const ascii = (texte: string): number[] => [...texte].map((caractere) => caractere.charCodeAt(0));

/**
 * Nature d'une image d'après ses premiers octets, pas d'après son nom : un
 * fichier qui se dit image sans en être une est refusé. null si ce n'est pas
 * une image reconnue.
 */
export function natureDImage(octets: Uint8Array): ImageKind | null {
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (commencePar(octets, [0xff, 0xd8, 0xff])) {
    return 'jpg';
  }
  if (commencePar(octets, ascii('GIF87a')) || commencePar(octets, ascii('GIF89a'))) {
    return 'gif';
  }
  if (commencePar(octets, ascii('RIFF')) && commencePar(octets, ascii('WEBP'), 8)) {
    return 'webp';
  }
  if (commencePar(octets, ascii('ftyp'), 4) && (commencePar(octets, ascii('avif'), 8) || commencePar(octets, ascii('avis'), 8))) {
    return 'avif';
  }
  // SVG : du texte. Affiché comme image (balise img), il n'exécute aucun script.
  const debut = versTexte(octets.subarray(0, 1024)).replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(debut)) {
    return 'svg';
  }
  return null;
}

/** Vrai si ce nom de fichier a l'extension d'une image reconnue. */
export function aUneExtensionDImage(nom: string): boolean {
  const extension = /\.([^.]+)$/.exec(nom)?.[1]?.toLowerCase();
  return extension !== undefined && extensionsDImage.includes(extension);
}

/**
 * Nom du fichier copié dans `assets/` : le nom d'origine sans ce qui gênerait
 * dans un lien Markdown ou sur le NAS (espaces, parenthèses, caractères
 * refusés par SMB), avec l'extension de sa vraie nature. Un nom déjà pris
 * reçoit un numéro (`schema-2.png`). Sans nom d'origine (image collée), la date.
 */
export function nomDeFichierDImage(nomDOrigine: string | null, nature: ImageKind, nomsPris: Iterable<string>, maintenant: number): string {
  const base = (nomDOrigine ?? '')
    .replace(/\.[^.]*$/, '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|#%&{}()[\]^`~!$'=+;,@\s\u0000-\u001f\u007f]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  const nom = base === '' ? `image-${horodatage(maintenant)}` : [...base].slice(0, longueurMaxNom - 12).join('');
  const extension = extensions[nature][0] as string;
  const pris = new Set([...nomsPris].map(cleDeNom));
  for (let numero = 1; ; numero++) {
    const candidat = `${nom}${numero === 1 ? '' : `-${numero}`}.${extension}`;
    if (!pris.has(cleDeNom(candidat))) {
      return candidat;
    }
  }
}

const deux = (nombre: number): string => String(nombre).padStart(2, '0');

/** `2026-10-03-143005`, à l'heure du poste comme les sauvegardes de conflit : seulement pour nommer une image collée. */
function horodatage(maintenant: number): string {
  const date = new Date(maintenant);
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}-${deux(date.getHours())}${deux(date.getMinutes())}${deux(date.getSeconds())}`;
}

/**
 * Copie une image dans le dossier `assets/` de la page, sans jamais remplacer
 * un fichier existant. Rend l'adresse à écrire dans la page (`assets/x.png`).
 */
export async function ajouterImage(contexte: VaultContext, cheminDeLaPage: string, nomDOrigine: string | null, octets: Uint8Array): Promise<string> {
  if (octets.length === 0 || octets.length > tailleMaxDImage) {
    throw new VaultError('chemin_invalide', `Une image doit faire moins de ${tailleMaxDImage / 1024 / 1024} Mo.`);
  }
  const nature = natureDImage(octets);
  if (nature === null) {
    throw new VaultError('chemin_invalide', "Ce fichier n'est pas une image reconnue (PNG, JPEG, GIF, WebP, AVIF ou SVG).");
  }
  const page = await contexte.fs.infos(joindreChemins(cheminDeLaPage, fichierPage));
  if (page === null || page.estDossier) {
    throw new VaultError('introuvable', 'Cette page est introuvable.');
  }
  const dossier = joindreChemins(cheminDeLaPage, dossierAssets);
  await contexte.fs.creerDossier(dossier);
  const existants = (await contexte.fs.lister(dossier)).map((entree) => entree.nom);
  const nom = nomDeFichierDImage(nomDOrigine, nature, existants, contexte.maintenant());
  if (verifierCheminRelatif(joindreChemins(dossier, nom)) !== null) {
    throw new VaultError('chemin_invalide', "Ce nom d'image n'est pas accepté.");
  }
  await contexte.fs.ecrireOctets(joindreChemins(dossier, nom), octets);
  return `${dossierAssets}/${encodeURIComponent(nom)}`;
}

/**
 * Images orphelines : les fichiers des dossiers `assets/` auxquels leur page
 * ne renvoie plus. Une image compte comme utilisée dès que la page contient
 * son adresse, encodée ou non. Ne modifie rien.
 */
export async function listerImagesOrphelines(fs: LocalFs): Promise<string[]> {
  const orphelines: string[] = [];
  const parcourir = async (dossier: string): Promise<void> => {
    const entrees = await fs.lister(dossier);
    const assets = entrees.find((entree) => entree.estDossier && entree.nom === dossierAssets);
    const page = entrees.find((entree) => !entree.estDossier && entree.nom === fichierPage);
    if (assets !== undefined) {
      const texte = page === undefined ? '' : await fs.lireTexte(joindreChemins(dossier, fichierPage));
      const variantes = new Set([texte, decoderSansErreur(texte)]);
      for (const fichier of await fs.lister(joindreChemins(dossier, dossierAssets))) {
        if (fichier.estDossier || fichier.nom.startsWith('.')) {
          continue;
        }
        const cherche = `${dossierAssets}/${fichier.nom}`;
        if (![...variantes].some((variante) => variante.includes(cherche) || variante.includes(`${dossierAssets}/${encodeURIComponent(fichier.nom)}`))) {
          orphelines.push(joindreChemins(dossier, dossierAssets, fichier.nom));
        }
      }
    }
    for (const entree of entrees) {
      if (entree.estDossier && !estIgnore(entree.nom, true)) {
        await parcourir(joindreChemins(dossier, entree.nom));
      }
    }
  };
  await parcourir('');
  return orphelines;
}

/** Le texte avec ses séquences `%XX` décodées, là où elles se décodent. */
function decoderSansErreur(texte: string): string {
  return texte.replace(/(?:%[0-9A-Fa-f]{2})+/g, (sequence) => {
    try {
      return decodeURIComponent(sequence);
    } catch {
      return sequence;
    }
  });
}
