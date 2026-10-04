import { parse, stringify } from 'yaml';
import { LocalFsError } from '../fs/local-fs';
import type { LocalFs } from '../fs/local-fs';
import { dossierParent, joindreChemins, nomDeBase, verifierCheminRelatif } from '../fs/paths';
import { RemoteFsError } from '../fs/remote-fs';
import type { RemoteFs } from '../fs/remote-fs';
import { versTexte } from '../fs/utf8';
import { estId } from '../page/id';
import { cleDeNom, nomLibre } from '../page/naming';
import { analyserPage, cheminDuFichierPage } from '../page/page-file';
import { fichierPage } from '../page/types';
import { aUneExtensionDImage, dossierAssets } from '../vault/assets';
import { VaultError } from '../vault/context';
import type { VaultContext } from '../vault/context';
import { chargerPage, idsDesEnfants, nomsPris } from '../vault/operations';
import type { PageLocation } from '../vault/operations';
import { ecrireOrdre, lireOrdre } from '../vault/order';
import { lireArbre } from '../vault/tree';
import type { TreeNode } from '../vault/tree';

/**
 * Corbeille (README §10). Une page supprimée part avec tout son dossier dans
 * `.trash/<horodatage> <nom>/`, à côté d'un `.trashmeta.yaml` qui dit d'où
 * elle vient. Elle y passe d'abord sur le poste, dans un `.trash/` que la sync
 * ne transporte pas ; le cycle suivant la dépose dans le `.trash/` du NAS et
 * la retire du poste (`transfererCorbeille`). Les deux corbeilles ont la même
 * forme : listage, aperçu, suppression et purge passent par `TrashStorage`.
 */

export const dossierCorbeille = '.trash';
export const fichierMetaCorbeille = '.trashmeta.yaml';
/** Une entrée plus vieille que ce délai est purgée au démarrage. */
export const retentionCorbeilleMs = 30 * 24 * 60 * 60 * 1000;

export type TrashKind = 'page' | 'image';

/** Une entrée de la corbeille, telle que décrite par son `.trashmeta.yaml`. */
export interface TrashEntry {
  /** Nom du dossier horodaté dans `.trash/` : il identifie l'entrée. */
  entree: string;
  nature: TrashKind;
  /** Nom du dossier de la page, ou du fichier image, rangé dans l'entrée. */
  nom: string;
  /** Titre de la page, nom du fichier pour une image. */
  titre: string;
  cheminOrigine: string;
  /** Date ISO 8601. */
  supprimeLe: string;
  /** Identifiant de la page, null pour une image. */
  id: string | null;
  /** Page qui la contenait (la page de l'image), null à la racine. */
  parentId: string | null;
  /**
   * Place de la page parmi ses sœurs au moment de la suppression : la sœur
   * qui la suivait, celle qui la précédait, et son rang. null pour une image.
   */
  suivantId: string | null;
  precedentId: string | null;
  rang: number | null;
}

/** Ce que montre l'aperçu d'une entrée. */
export type TrashPreview =
  | { nature: 'page'; titre: string; corps: string; sousPages: string[] }
  | { nature: 'image'; titre: string; octets: Uint8Array };

/** Une corbeille, sur le poste ou sur le NAS. Chemins relatifs à la racine du vault. */
export interface TrashStorage {
  /** Contenu direct d'un dossier, vide s'il n'existe pas. */
  lister(chemin: string): Promise<{ nom: string; estDossier: boolean }[]>;
  lire(chemin: string): Promise<Uint8Array>;
  /** Écrit un fichier, dossiers parents créés. */
  ecrire(chemin: string, octets: Uint8Array): Promise<void>;
  /** Crée un dossier et ses parents. Sans effet s'il existe. */
  creerDossier(chemin: string): Promise<void>;
  /** Supprime un fichier ou un dossier et tout son contenu. Sans effet s'il n'existe pas. */
  supprimerTout(chemin: string): Promise<void>;
}

export function stockageLocal(fs: LocalFs): TrashStorage {
  return {
    lister: async (chemin) => ((await fs.infos(chemin))?.estDossier === true ? fs.lister(chemin) : []),
    lire: (chemin) => fs.lireOctets(chemin),
    ecrire: async (chemin, octets) => {
      await fs.creerDossier(dossierParent(chemin));
      await fs.ecrireOctets(chemin, octets);
    },
    creerDossier: (chemin) => fs.creerDossier(chemin),
    supprimerTout: async (chemin) => {
      if ((await fs.infos(chemin)) !== null) {
        await fs.supprimer(chemin);
      }
    },
  };
}

export function stockageDistant(fs: RemoteFs): TrashStorage {
  const lister = async (chemin: string) => {
    try {
      return await fs.lister(chemin);
    } catch (erreur) {
      if (erreur instanceof RemoteFsError && erreur.code === 'introuvable') {
        return [];
      }
      throw erreur;
    }
  };
  // Le NAS ne supprime qu'un dossier vide : on vide d'abord, en profondeur.
  const supprimerTout = async (chemin: string): Promise<void> => {
    const infos = await fs.infos(chemin);
    if (infos === null) {
      return;
    }
    if (infos.estDossier) {
      for (const enfant of await lister(chemin)) {
        await supprimerTout(joindreChemins(chemin, enfant.nom));
      }
    }
    await fs.supprimer(chemin);
  };
  return {
    lister,
    lire: (chemin) => fs.lire(chemin),
    ecrire: async (chemin, octets) => {
      await fs.creerDossier(dossierParent(chemin));
      await fs.ecrire(chemin, octets);
    },
    creerDossier: (chemin) => fs.creerDossier(chemin),
    supprimerTout,
  };
}

/** Vrai pour un nom d'entrée acceptable venant de l'écran : un seul segment, ni caché ni temporaire. */
export function estNomDEntree(nom: unknown): nom is string {
  return typeof nom === 'string' && nom !== '' && !nom.includes('/') && !nom.startsWith('.') && verifierCheminRelatif(nom) === null;
}

/** Met une page et toute sa descendance dans la corbeille du poste. Rend le parent qu'elle quitte. */
export async function mettreALaCorbeille(contexte: VaultContext, chemin: string): Promise<PageLocation> {
  const { fs } = contexte;
  const { meta } = await chargerPage(fs, chemin);
  const parent = dossierParent(chemin);
  const soeurs = await idsDesEnfants(fs, parent);
  const rang = soeurs.indexOf(meta.id);
  await deposer(contexte, chemin, {
    nature: 'page',
    titre: meta.titre,
    id: meta.id,
    parentId: parent === '' ? null : await idDePage(fs, parent),
    suivantId: rang === -1 ? null : (soeurs[rang + 1] ?? null),
    precedentId: rang <= 0 ? null : (soeurs[rang - 1] ?? null),
    rang: rang === -1 ? null : rang,
  });
  const ordre = await lireOrdre(fs, parent);
  if (ordre.includes(meta.id)) {
    await ecrireOrdre(fs, parent, ordre.filter((id) => id !== meta.id));
  }
  return { chemin: parent, id: meta.id };
}

/** Met une image du dossier `assets/` d'une page dans la corbeille du poste (image inutilisée). */
export async function mettreImageALaCorbeille(contexte: VaultContext, chemin: string): Promise<void> {
  const { fs } = contexte;
  const assets = dossierParent(chemin);
  if (nomDeBase(assets) !== dossierAssets || !aUneExtensionDImage(chemin) || (await fs.infos(chemin))?.estDossier !== false) {
    throw new VaultError('introuvable', 'Cette image est introuvable.');
  }
  const page = dossierParent(assets);
  await deposer(contexte, chemin, {
    nature: 'image',
    titre: nomDeBase(chemin),
    id: null,
    parentId: page === '' ? null : await idDePage(fs, page),
    suivantId: null,
    precedentId: null,
    rang: null,
  });
}

/**
 * Range un dossier de page ou une image dans une nouvelle entrée. La
 * description est écrite avant le déplacement : une entrée sans son élément
 * (arrêt entre les deux) n'est jamais prise pour complète, et l'élément ne se
 * retrouve jamais dans la corbeille sans description.
 */
async function deposer(contexte: VaultContext, chemin: string, description: Omit<TrashEntry, 'entree' | 'nom' | 'cheminOrigine' | 'supprimeLe'>): Promise<void> {
  const { fs } = contexte;
  const maintenant = contexte.maintenant();
  const nom = nomDeBase(chemin);
  await fs.creerDossier(dossierCorbeille);
  const entree = nomLibre(`${horodatage(maintenant)} ${nom}`, await nomsPris(fs, dossierCorbeille));
  const dossier = joindreChemins(dossierCorbeille, entree);
  await fs.creerDossier(dossier);
  await fs.ecrireTexte(
    joindreChemins(dossier, fichierMetaCorbeille),
    ecrireMeta({ ...description, entree, nom, cheminOrigine: chemin, supprimeLe: new Date(maintenant).toISOString() }),
  );
  await fs.renommer(chemin, joindreChemins(dossier, nom));
}

/** Entrées complètes d'une corbeille, les plus récentes en premier. */
export async function listerCorbeille(stockage: TrashStorage): Promise<TrashEntry[]> {
  const entrees: TrashEntry[] = [];
  for (const dossier of await stockage.lister(dossierCorbeille)) {
    if (dossier.estDossier && estNomDEntree(dossier.nom)) {
      const entree = await lireEntree(stockage, dossier.nom).catch(() => null);
      if (entree !== null) {
        entrees.push(entree);
      }
    }
  }
  return entrees.sort((a, b) => (a.supprimeLe < b.supprimeLe ? 1 : a.supprimeLe > b.supprimeLe ? -1 : 0));
}

/** Lit une entrée. null si elle est incomplète (description illisible, élément absent). */
async function lireEntree(stockage: TrashStorage, entree: string): Promise<TrashEntry | null> {
  const dossier = joindreChemins(dossierCorbeille, entree);
  const contenu = await stockage.lister(dossier);
  if (!contenu.some((element) => element.nom === fichierMetaCorbeille && !element.estDossier)) {
    return null;
  }
  const meta = lireMeta(versTexte(await stockage.lire(joindreChemins(dossier, fichierMetaCorbeille))), entree);
  if (meta === null) {
    return null;
  }
  const element = contenu.find((candidat) => candidat.nom === meta.nom);
  return element !== undefined && element.estDossier === (meta.nature === 'page') ? meta : null;
}

async function exigerEntree(stockage: TrashStorage, entree: string): Promise<TrashEntry> {
  const lue = estNomDEntree(entree) ? await lireEntree(stockage, entree) : null;
  if (lue === null) {
    throw new VaultError('introuvable', "Cet élément n'est plus dans la corbeille.");
  }
  return lue;
}

/** Ce que montre l'aperçu : le texte de la page et ses sous-pages, ou l'image. */
export async function lireApercu(stockage: TrashStorage, entree: string): Promise<TrashPreview> {
  const lue = await exigerEntree(stockage, entree);
  const element = joindreChemins(dossierCorbeille, entree, lue.nom);
  if (lue.nature === 'image') {
    return { nature: 'image', titre: lue.titre, octets: await stockage.lire(element) };
  }
  const corps = analyserPage(versTexte(await stockage.lire(cheminDuFichierPage(element)))).corps;
  return { nature: 'page', titre: lue.titre, corps, sousPages: await titresDesSousPages(stockage, element) };
}

/** Titres de toute la descendance, en profondeur d'abord, indentés de deux espaces par niveau. */
async function titresDesSousPages(stockage: TrashStorage, dossier: string, niveau = 0): Promise<string[]> {
  const titres: string[] = [];
  for (const enfant of await stockage.lister(dossier)) {
    if (!enfant.estDossier || enfant.nom.startsWith('.') || enfant.nom === dossierAssets) {
      continue;
    }
    const chemin = joindreChemins(dossier, enfant.nom);
    const page = await stockage.lire(cheminDuFichierPage(chemin)).catch(() => null);
    const meta = page === null ? null : analyserPage(versTexte(page)).meta;
    if (meta !== null) {
      titres.push(`${'  '.repeat(niveau)}${meta.titre}`, ...(await titresDesSousPages(stockage, chemin, niveau + 1)));
    }
  }
  return titres;
}

/**
 * Remet une entrée de la corbeille du poste dans le dossier des notes. Une
 * page revient sous son parent d'origine (retrouvé par identifiant, même
 * déplacé), à la racine s'il n'existe plus, à sa place parmi ses sœurs
 * (`placeDOrigine`) ; une image
 * dans le dossier `assets/` de sa page. Rien n'est écrasé : un nom pris en
 * donne un autre. L'entrée de la corbeille du NAS se rapatrie d'abord
 * (`rapatrierEntree`).
 */
export async function restaurerEntree(contexte: VaultContext, entree: string): Promise<{ chemin: string; id: string | null }> {
  const { fs } = contexte;
  const lue = await exigerEntree(stockageLocal(fs), entree);
  const dossier = joindreChemins(dossierCorbeille, entree);
  const arbre = await lireArbre(fs);
  const parent = lue.parentId === null ? null : cheminParId(arbre, lue.parentId);

  if (lue.nature === 'image') {
    // Sans sa page, une image n'a nulle part où aller : on la laisse dans la corbeille.
    const page = parent ?? (lue.parentId === null ? '' : null);
    if (page === null) {
      throw new VaultError('introuvable', "La page de cette image n'existe plus : elle reste dans la corbeille.");
    }
    const assets = joindreChemins(page, dossierAssets);
    await fs.creerDossier(assets);
    const chemin = joindreChemins(assets, nomDeFichierLibre(lue.nom, await nomsPris(fs, assets)));
    await fs.renommer(joindreChemins(dossier, lue.nom), chemin);
    await fs.supprimer(dossier);
    return { chemin, id: null };
  }

  if (lue.id !== null && cheminParId(arbre, lue.id) !== null) {
    throw new VaultError('deja_presente', 'Cette page est déjà dans le dossier des notes : elle reste dans la corbeille.');
  }
  const destinationParent = parent ?? '';
  const chemin = joindreChemins(destinationParent, nomLibre(lue.nom, await nomsPris(fs, destinationParent)));
  await fs.renommer(joindreChemins(dossier, lue.nom), chemin);
  await fs.supprimer(dossier);
  const id = (await idDePage(fs, chemin)) ?? lue.id;
  if (id !== null) {
    const ordre = (await idsDesEnfants(fs, destinationParent)).filter((autre) => autre !== id);
    // Sous un autre parent que celui d'origine, ses anciennes sœurs n'y sont pas : elle va en dernier.
    const position = parent === null && lue.parentId !== null ? ordre.length : placeDOrigine(ordre, lue);
    await ecrireOrdre(fs, destinationParent, [...ordre.slice(0, position), id, ...ordre.slice(position)]);
  }
  return { chemin, id };
}

/**
 * Rang où remettre une page parmi ses sœurs actuelles : avant la sœur qui la
 * suivait, sinon après celle qui la précédait, sinon à son ancien rang, sinon
 * en dernier. La suivante passe d'abord : deux sœurs voisines supprimées
 * ensemble reviennent dans leur ordre, quel que soit l'ordre des restaurations.
 */
export function placeDOrigine(ordre: readonly string[], entree: Pick<TrashEntry, 'suivantId' | 'precedentId' | 'rang'>): number {
  const suivante = entree.suivantId === null ? -1 : ordre.indexOf(entree.suivantId);
  if (suivante !== -1) {
    return suivante;
  }
  const precedente = entree.precedentId === null ? -1 : ordre.indexOf(entree.precedentId);
  if (precedente !== -1) {
    return precedente + 1;
  }
  return entree.rang === null ? ordre.length : Math.min(entree.rang, ordre.length);
}

/**
 * Copie une entrée de la corbeille du NAS dans celle du poste, en passant par
 * un dossier caché que listages et transferts ignorent, puis la retire du
 * NAS. Elle se restaure ensuite comme une entrée du poste.
 */
export async function rapatrierEntree(fs: LocalFs, distant: RemoteFs, entree: string): Promise<void> {
  const nas = stockageDistant(distant);
  await exigerEntree(nas, entree);
  const destination = joindreChemins(dossierCorbeille, entree);
  if ((await fs.infos(destination)) !== null) {
    throw new LocalFsError('existe_deja', 'Cet élément est déjà dans la corbeille du poste.');
  }
  const provisoire = joindreChemins(dossierCorbeille, `.${entree}.rapatriement`);
  const poste = stockageLocal(fs);
  await poste.supprimerTout(provisoire);
  await copier(nas, joindreChemins(dossierCorbeille, entree), poste, provisoire);
  await fs.renommer(provisoire, destination);
  await nas.supprimerTout(joindreChemins(dossierCorbeille, entree));
}

/** Supprime définitivement une entrée. */
export async function supprimerEntree(stockage: TrashStorage, entree: string): Promise<void> {
  if (!estNomDEntree(entree)) {
    throw new VaultError('chemin_invalide', 'Élément de la corbeille invalide.');
  }
  await stockage.supprimerTout(joindreChemins(dossierCorbeille, entree));
}

/** Vide une corbeille, entrées incomplètes comprises. */
export async function viderCorbeille(stockage: TrashStorage): Promise<void> {
  for (const element of await stockage.lister(dossierCorbeille)) {
    await stockage.supprimerTout(joindreChemins(dossierCorbeille, element.nom));
  }
}

/**
 * Supprime les entrées de plus de 30 jours, d'après leur description, ou
 * d'après l'horodatage de leur nom si elle est illisible. Rend leur nombre.
 */
export async function purgerCorbeille(stockage: TrashStorage, maintenant: number): Promise<number> {
  let purgees = 0;
  for (const element of await stockage.lister(dossierCorbeille)) {
    if (!element.estDossier) {
      continue;
    }
    const lue = estNomDEntree(element.nom) ? await lireEntree(stockage, element.nom).catch(() => null) : null;
    const date = Date.parse(lue?.supprimeLe ?? dateDuNom(element.nom.replace(/^\./, '')) ?? '');
    if (Number.isFinite(date) && maintenant - date > retentionCorbeilleMs) {
      await stockage.supprimerTout(joindreChemins(dossierCorbeille, element.nom));
      purgees++;
    }
  }
  return purgees;
}

/**
 * Dépose les entrées de la corbeille du poste dans celle du NAS, puis les
 * retire du poste. Le contenu part d'abord, la description en dernier : sur
 * le NAS, une entrée coupée en route n'est pas complète et sera réécrite au
 * cycle suivant. Rend le nombre d'entrées transférées.
 */
export async function transfererCorbeille(fs: LocalFs, distant: RemoteFs): Promise<number> {
  const poste = stockageLocal(fs);
  const nas = stockageDistant(distant);
  let transferees = 0;
  for (const lue of await listerCorbeille(poste)) {
    const dossier = joindreChemins(dossierCorbeille, lue.entree);
    await copier(poste, joindreChemins(dossier, lue.nom), nas, joindreChemins(dossier, lue.nom));
    await nas.ecrire(joindreChemins(dossier, fichierMetaCorbeille), await poste.lire(joindreChemins(dossier, fichierMetaCorbeille)));
    await poste.supprimerTout(dossier);
    transferees++;
  }
  return transferees;
}

/** Copie un fichier ou un dossier d'une corbeille à l'autre. Les verrous et fichiers temporaires restent où ils sont. */
async function copier(source: TrashStorage, depuis: string, cible: TrashStorage, vers: string): Promise<void> {
  const parent = await source.lister(dossierParent(depuis));
  const element = parent.find((candidat) => candidat.nom === nomDeBase(depuis));
  if (element === undefined) {
    return;
  }
  if (!element.estDossier) {
    await cible.ecrire(vers, await source.lire(depuis));
    return;
  }
  await cible.creerDossier(vers);
  for (const enfant of await source.lister(depuis)) {
    if (enfant.nom === '.lock' || /^\..+\.tmp$/.test(enfant.nom)) {
      continue;
    }
    await copier(source, joindreChemins(depuis, enfant.nom), cible, joindreChemins(vers, enfant.nom));
  }
}

/** « 2026-10-04T10-12-30-123Z » : une date ISO sans les caractères que SMB refuse. */
function horodatage(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

/** Date ISO tirée de l'horodatage au début d'un nom d'entrée, null s'il n'y en a pas. */
function dateDuNom(nom: string): string | null {
  const morceaux = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(nom);
  return morceaux === null ? null : `${morceaux[1]}T${morceaux[2]}:${morceaux[3]}:${morceaux[4]}.${morceaux[5]}Z`;
}

function ecrireMeta(entree: TrashEntry): string {
  return stringify({
    kind: entree.nature,
    title: entree.titre,
    name: entree.nom,
    path: entree.cheminOrigine,
    deleted: entree.supprimeLe,
    id: entree.id,
    parent: entree.parentId,
    ...(entree.nature === 'page' ? { next: entree.suivantId, previous: entree.precedentId, position: entree.rang } : {}),
  });
}

/** Lecture tolérante d'un `.trashmeta.yaml` : null s'il manque l'essentiel. */
function lireMeta(texte: string, entree: string): TrashEntry | null {
  let brut: unknown;
  try {
    brut = parse(texte);
  } catch {
    return null;
  }
  if (typeof brut !== 'object' || brut === null) {
    return null;
  }
  const champs = brut as Record<string, unknown>;
  const nature = champs['kind'];
  const nom = champs['name'];
  const chemin = champs['path'];
  const date = champs['deleted'];
  if ((nature !== 'page' && nature !== 'image') || typeof nom !== 'string' || nom.includes('/') || verifierCheminRelatif(nom) !== null) {
    return null;
  }
  if (typeof chemin !== 'string' || typeof date !== 'string' || !Number.isFinite(Date.parse(date))) {
    return null;
  }
  const id = champs['id'];
  const parent = champs['parent'];
  const titre = champs['title'];
  return {
    entree,
    nature,
    nom,
    titre: typeof titre === 'string' && titre.trim() !== '' ? titre : nom,
    cheminOrigine: chemin,
    supprimeLe: date,
    id: typeof id === 'string' && estId(id) ? id : null,
    parentId: typeof parent === 'string' && estId(parent) ? parent : null,
    suivantId: typeof champs['next'] === 'string' && estId(champs['next']) ? champs['next'] : null,
    precedentId: typeof champs['previous'] === 'string' && estId(champs['previous']) ? champs['previous'] : null,
    rang: typeof champs['position'] === 'number' && Number.isInteger(champs['position']) && champs['position'] >= 0 ? champs['position'] : null,
  };
}

async function idDePage(fs: LocalFs, dossier: string): Promise<string | null> {
  const chemin = joindreChemins(dossier, fichierPage);
  if ((await fs.infos(chemin)) === null) {
    return null;
  }
  return analyserPage(await fs.lireTexte(chemin)).meta?.id ?? null;
}

function cheminParId(arbre: readonly TreeNode[], id: string): string | null {
  for (const noeud of arbre) {
    if (noeud.id === id) {
      return noeud.chemin;
    }
    const trouve = cheminParId(noeud.enfants, id);
    if (trouve !== null) {
      return trouve;
    }
  }
  return null;
}

/** « photo.png », sinon « photo 2.png », « photo 3.png »... sans distinction de casse. */
function nomDeFichierLibre(nom: string, pris: readonly string[]): string {
  const cles = new Set(pris.map(cleDeNom));
  const point = nom.lastIndexOf('.');
  const base = point > 0 ? nom.slice(0, point) : nom;
  const extension = point > 0 ? nom.slice(point) : '';
  let candidat = nom;
  for (let numero = 2; cles.has(cleDeNom(candidat)); numero++) {
    candidat = `${base} ${numero}${extension}`;
  }
  return candidat;
}
