import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { VaultError, aUneExtensionDImage, ajouterImage, creerPage, enregistrerCorps, tailleMaxDImage, verifierTitre } from '@notes/core';
import type { PageLocation, VaultContext } from '@notes/core';
import { imagesLocales, remplacerImages, titreEtCorps } from '@notes/document';

/**
 * Fichier Markdown déposé dans la fenêtre (docs/spec/interface.md) : il devient
 * une sous-page, ou s'ajoute à la fin de la page ouverte. Ses images locales
 * sont copiées dans le dossier `assets/` de la page, mais seulement celles qui
 * sont dans son dossier ou en dessous : un `../` ne sort pas de là.
 */

/** Taille maximale d'un fichier Markdown déposé. */
const tailleMaxDuTexte = 5 * 1024 * 1024;

export function estUnFichierMarkdown(chemin: string): boolean {
  return /^\.(md|markdown)$/i.test(extname(chemin));
}

async function lireLeFichier(fichier: string): Promise<string> {
  if (!isAbsolute(fichier) || !estUnFichierMarkdown(fichier)) {
    throw new VaultError('chemin_invalide', "Ce n'est pas un fichier Markdown (.md).");
  }
  const infos = await stat(fichier).catch(() => null);
  if (infos === null || !infos.isFile()) {
    throw new VaultError('introuvable', `${basename(fichier)} est introuvable.`);
  }
  if (infos.size > tailleMaxDuTexte) {
    throw new VaultError('chemin_invalide', `${basename(fichier)} est trop gros pour une page (5 Mo au plus).`);
  }
  return readFile(fichier, 'utf8');
}

/** Copie les images locales du texte dans la page, et rend le texte qui pointe vers leurs copies. Une image illisible garde son adresse. */
async function copierLesImages(contexte: VaultContext, fichier: string, page: string, texte: string): Promise<string> {
  const dossier = dirname(fichier);
  const nouvelles = new Map<string, string>();
  for (const adresse of imagesLocales(texte)) {
    try {
      const source = resolve(dossier, decodeURIComponent(adresse));
      const chemin = relative(dossier, source);
      if (chemin.startsWith('..') || isAbsolute(chemin) || !aUneExtensionDImage(source)) {
        continue;
      }
      const infos = await stat(source);
      if (!infos.isFile() || infos.size > tailleMaxDImage) {
        continue;
      }
      nouvelles.set(adresse, await ajouterImage(contexte, page, basename(source), new Uint8Array(await readFile(source))));
    } catch {
      // Adresse mal formée, fichier absent ou qui n'est pas une image : le lien reste tel quel.
    }
  }
  return remplacerImages(texte, nouvelles);
}

/** Crée une page sous « parent » (vide : la racine) avec le contenu du fichier. */
export async function creerPageDepuisMarkdown(contexte: VaultContext, fichier: string, parent: string): Promise<PageLocation> {
  const { titre, corps } = titreEtCorps(await lireLeFichier(fichier), basename(fichier));
  const page = await creerPage(contexte, { parent, titre: verifierTitre(titre) === null ? titre : 'Sans titre' });
  const avecImages = await copierLesImages(contexte, fichier, page.chemin, corps);
  await enregistrerCorps(contexte, page.chemin, { corps: avecImages, corpsDeBase: '' });
  return page;
}

/** Le contenu du fichier, prêt à être ajouté à la fin de la page « page » : front-matter d'un autre outil retiré, images copiées dans son dossier. */
export async function markdownAAjouter(contexte: VaultContext, fichier: string, page: string): Promise<string> {
  const texte = (await lireLeFichier(fichier))
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n?/, '');
  return copierLesImages(contexte, fichier, page, texte);
}
