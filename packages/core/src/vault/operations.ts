import { dossierParent, estDansDossier, joindreChemins, nomDeBase } from '../fs/paths';
import type { LocalFs } from '../fs/local-fs';
import { genererId } from '../page/id';
import { longueurMaxTitre, nomDeDossier, nomLibre, verifierTitre } from '../page/naming';
import { analyserPage, cheminDuFichierPage, modifierMetaDansTexte, texteDePageNeuve } from '../page/page-file';
import { fichierPage } from '../page/types';
import type { PageMeta } from '../page/types';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { ecrireOrdre, fichierOrdre, lireOrdre } from './order';
import { ordonner } from './tree';

/** Résultat d'une opération qui crée ou déplace une page : où elle se trouve maintenant. */
export interface PageLocation {
  chemin: string;
  id: string;
}

export function nouvelId(contexte: VaultContext): string {
  return genererId(contexte.maintenant(), contexte.octetsAleatoires(10));
}

export function dateIso(contexte: VaultContext): string {
  return new Date(contexte.maintenant()).toISOString();
}

/** Lit une page importée. Échoue si le dossier n'existe pas ou si la page n'est pas importée. */
export async function chargerPage(fs: LocalFs, chemin: string): Promise<{ texte: string; meta: PageMeta }> {
  const cheminPage = cheminDuFichierPage(chemin);
  if (chemin === '' || (await fs.infos(cheminPage)) === null) {
    throw new VaultError('introuvable', 'Cette page est introuvable.');
  }
  const texte = await fs.lireTexte(cheminPage);
  const { meta } = analyserPage(texte);
  if (meta === null) {
    throw new VaultError('non_importee', "Cette page n'est pas encore importée.");
  }
  return { texte, meta };
}

/** Un parent acceptable est la racine du vault ou une page importée. */
export async function verifierParent(fs: LocalFs, parent: string): Promise<void> {
  if (parent !== '') {
    await chargerPage(fs, parent);
  }
}

/** Noms déjà utilisés dans un dossier, pour éviter les collisions. */
export async function nomsPris(fs: LocalFs, dossier: string, sauf?: string): Promise<string[]> {
  return (await fs.lister(dossier)).map((entree) => entree.nom).filter((nom) => nom !== sauf);
}

/** Identifiants des pages importées d'un dossier, dans l'ordre d'affichage. Ne descend pas. */
export async function idsDesEnfants(fs: LocalFs, dossier: string): Promise<string[]> {
  const pages: { id: string; titre: string; chemin: string }[] = [];
  for (const entree of await fs.lister(dossier)) {
    if (!entree.estDossier || entree.nom.startsWith('.')) {
      continue;
    }
    const chemin = joindreChemins(dossier, entree.nom);
    const cheminPage = cheminDuFichierPage(chemin);
    if ((await fs.infos(cheminPage)) === null) {
      continue;
    }
    const { meta } = analyserPage(await fs.lireTexte(cheminPage));
    if (meta !== null) {
      pages.push({ id: meta.id, titre: meta.titre, chemin });
    }
  }
  return ordonner(pages, await lireOrdre(fs, dossier)).map((page) => page.id);
}

function inserer(ids: readonly string[], id: string, index: number | undefined): string[] {
  const sans = ids.filter((autre) => autre !== id);
  const position = index === undefined ? sans.length : Math.max(0, Math.min(Math.floor(index), sans.length));
  return [...sans.slice(0, position), id, ...sans.slice(position)];
}

function exigerTitre(titre: string): string {
  const refus = verifierTitre(titre);
  if (refus !== null) {
    throw new VaultError('titre_invalide', refus);
  }
  return titre.trim();
}

/** Crée une page vide sous « parent » (vide pour la racine), en dernière position par défaut. */
export async function creerPage(
  contexte: VaultContext,
  demande: { parent: string; titre: string; index?: number },
): Promise<PageLocation> {
  const { fs } = contexte;
  const titre = exigerTitre(demande.titre);
  await verifierParent(fs, demande.parent);

  const ids = await idsDesEnfants(fs, demande.parent);
  const id = nouvelId(contexte);
  const date = dateIso(contexte);
  const chemin = joindreChemins(demande.parent, nomLibre(nomDeDossier(titre), await nomsPris(fs, demande.parent)));

  await fs.creerDossier(chemin);
  await fs.ecrireTexte(cheminDuFichierPage(chemin), texteDePageNeuve({ id, titre, creeLe: date, modifieLe: date }));
  await ecrireOrdre(fs, demande.parent, inserer(ids, id, demande.index));
  return { chemin, id };
}

/** Change le titre d'une page et aligne le nom de son dossier. */
export async function renommerPage(contexte: VaultContext, chemin: string, nouveauTitre: string): Promise<PageLocation> {
  const { fs } = contexte;
  const titre = exigerTitre(nouveauTitre);
  const { texte, meta } = await chargerPage(fs, chemin);
  if (titre === meta.titre) {
    return { chemin, id: meta.id };
  }
  await fs.ecrireTexte(
    cheminDuFichierPage(chemin),
    modifierMetaDansTexte(texte, { titre, modifieLe: dateIso(contexte) }),
  );

  const parent = dossierParent(chemin);
  const nomActuel = nomDeBase(chemin);
  const nom = nomLibre(nomDeDossier(titre), await nomsPris(fs, parent, nomActuel));
  if (nom === nomActuel) {
    return { chemin, id: meta.id };
  }
  const nouveauChemin = joindreChemins(parent, nom);
  await fs.renommer(chemin, nouveauChemin);
  return { chemin: nouveauChemin, id: meta.id };
}

/**
 * Déplace une page sous « parent » à la position « index », ou la réordonne
 * si le parent ne change pas. L'index se compte parmi les pages du parent,
 * la page déplacée non comprise.
 */
export async function deplacerPage(
  contexte: VaultContext,
  chemin: string,
  cible: { parent: string; index?: number },
): Promise<PageLocation> {
  const { fs } = contexte;
  const { meta } = await chargerPage(fs, chemin);
  if (estDansDossier(cible.parent, chemin)) {
    throw new VaultError('deplacement_invalide', 'Une page ne peut pas être déplacée dans elle-même.');
  }
  await verifierParent(fs, cible.parent);

  const parentActuel = dossierParent(chemin);
  const idsCible = await idsDesEnfants(fs, cible.parent);
  if (cible.parent === parentActuel) {
    await ecrireOrdre(fs, parentActuel, inserer(idsCible, meta.id, cible.index));
    return { chemin, id: meta.id };
  }

  const nouveauChemin = joindreChemins(cible.parent, nomLibre(nomDeBase(chemin), await nomsPris(fs, cible.parent)));
  await fs.renommer(chemin, nouveauChemin);
  await ecrireOrdre(fs, cible.parent, inserer(idsCible, meta.id, cible.index));

  const ordreSource = await lireOrdre(fs, parentActuel);
  if (ordreSource.includes(meta.id)) {
    await ecrireOrdre(
      fs,
      parentActuel,
      ordreSource.filter((id) => id !== meta.id),
    );
  }
  return { chemin: nouveauChemin, id: meta.id };
}

/**
 * Déplace plusieurs pages ensemble sous « parent », à la suite et dans
 * l'ordre donné, à partir de la position « index ». L'index se compte parmi
 * les pages du parent, les pages déplacées non comprises. Une page dont un
 * ancêtre est aussi déplacé suit celui-ci : elle n'est pas traitée à part.
 */
export async function deplacerPages(
  contexte: VaultContext,
  chemins: readonly string[],
  cible: { parent: string; index?: number },
): Promise<PageLocation[]> {
  const { fs } = contexte;
  const racines = chemins.filter((chemin, rang) => chemins.indexOf(chemin) === rang && !chemins.some((autre) => autre !== chemin && estDansDossier(chemin, autre)));
  if (racines.some((chemin) => estDansDossier(cible.parent, chemin))) {
    throw new VaultError('deplacement_invalide', 'Une page ne peut pas être déplacée dans elle-même.');
  }
  await verifierParent(fs, cible.parent);
  const deplacees: PageLocation[] = [];
  for (const chemin of racines) {
    deplacees.push(await deplacerPage(contexte, chemin, { parent: cible.parent }));
  }
  const ids = deplacees.map((page) => page.id);
  const autres = (await idsDesEnfants(fs, cible.parent)).filter((id) => !ids.includes(id));
  const position = cible.index === undefined ? autres.length : Math.max(0, Math.min(Math.floor(cible.index), autres.length));
  await ecrireOrdre(fs, cible.parent, [...autres.slice(0, position), ...ids, ...autres.slice(position)]);
  return deplacees;
}

/**
 * Supprime une page qui vient d'être créée et n'a servi à rien : ni contenu, ni sous-page, ni
 * autre fichier dans son dossier, sans passer par la corbeille : il n'y a rien à garder.
 * Toute page qui contient quelque chose est refusée, rien n'est écrit.
 */
export async function supprimerPageVide(contexte: VaultContext, chemin: string): Promise<PageLocation> {
  const { fs } = contexte;
  const { texte, meta } = await chargerPage(fs, chemin);
  // Les fichiers cachés (ordre des sous-pages, sans sous-page) ne comptent pas.
  const autres = (await fs.lister(chemin)).filter((entree) => entree.nom !== fichierPage && !entree.nom.startsWith('.'));
  if (analyserPage(texte).corps.trim() !== '' || autres.length > 0) {
    throw new VaultError('page_non_vide', "Cette page n'est pas vide : elle n'est pas supprimée.");
  }

  const parent = dossierParent(chemin);
  await fs.supprimer(chemin);
  const ordre = await lireOrdre(fs, parent);
  if (ordre.includes(meta.id)) {
    await ecrireOrdre(fs, parent, ordre.filter((id) => id !== meta.id));
  }
  return { chemin: parent, id: meta.id };
}

/**
 * Duplique une page et toute sa descendance, juste après l'original. Chaque
 * copie reçoit un nouvel identifiant. Les liens internes des copies pointent
 * toujours vers les pages d'origine.
 */
export async function dupliquerPage(contexte: VaultContext, chemin: string): Promise<PageLocation> {
  const { fs } = contexte;
  const { meta } = await chargerPage(fs, chemin);
  const parent = dossierParent(chemin);
  const suffixe = ' (copie)';
  const titre = [...meta.titre].slice(0, longueurMaxTitre - suffixe.length).join('') + suffixe;
  const idsParent = await idsDesEnfants(fs, parent);
  const copie = joindreChemins(parent, nomLibre(nomDeDossier(titre), await nomsPris(fs, parent)));

  const id = await copierPage(contexte, chemin, copie, titre);
  await ecrireOrdre(fs, parent, inserer(idsParent, id, idsParent.indexOf(meta.id) + 1));
  return { chemin: copie, id };
}

/** Copie récursive d'un dossier de page. Renvoie le nouvel identifiant de la page copiée. */
async function copierPage(contexte: VaultContext, source: string, destination: string, titre?: string): Promise<string> {
  const { fs } = contexte;
  await fs.creerDossier(destination);
  let idCopie = '';
  const correspondance = new Map<string, string>();

  for (const entree of await fs.lister(source)) {
    const depuis = joindreChemins(source, entree.nom);
    const vers = joindreChemins(destination, entree.nom);
    if (entree.nom === fichierPage && !entree.estDossier) {
      const texte = await fs.lireTexte(depuis);
      const { meta } = analyserPage(texte);
      if (meta === null) {
        await fs.copierFichier(depuis, vers);
        continue;
      }
      idCopie = nouvelId(contexte);
      const date = dateIso(contexte);
      await fs.ecrireTexte(
        vers,
        modifierMetaDansTexte(texte, { id: idCopie, creeLe: date, modifieLe: date, ...(titre === undefined ? {} : { titre }) }),
      );
    } else if (entree.nom.startsWith('.')) {
      // `.order` est reconstruit plus bas, les autres fichiers cachés (verrous) ne se copient pas.
      continue;
    } else if (entree.estDossier) {
      const idOrigine = await idDePage(fs, depuis);
      const idEnfant = await copierPage(contexte, depuis, vers);
      if (idOrigine !== null && idEnfant !== '') {
        correspondance.set(idOrigine, idEnfant);
      }
    } else {
      await fs.copierFichier(depuis, vers);
    }
  }

  const ordre = (await fs.infos(joindreChemins(source, fichierOrdre))) === null ? [] : await lireOrdre(fs, source);
  const ordreCopie = ordre.map((id) => correspondance.get(id)).filter((id): id is string => id !== undefined);
  await ecrireOrdre(fs, destination, ordreCopie);
  return idCopie;
}

async function idDePage(fs: LocalFs, dossier: string): Promise<string | null> {
  const cheminPage = cheminDuFichierPage(dossier);
  if ((await fs.infos(cheminPage)) === null) {
    return null;
  }
  return analyserPage(await fs.lireTexte(cheminPage)).meta?.id ?? null;
}
