import type { LocalFs } from '../fs/local-fs';
import {
  baseParDefaut,
  colonneDesPages,
  couleursDeChoix,
  cleDeRepliValide,
  largeurMaxDeColonne,
  largeurMinDeColonne,
  maxChoix,
  maxLignesRepliees,
  lireConfigDeBase,
  lireValeurs,
  nomDeChampValide,
  nomDeChoixValide,
  valeurPourLeChamp,
} from '../page/database';
import type { BaseConfig, BaseField } from '../page/database';
import { analyserPage, cheminDuFichierPage, modifierMetaDansTexte } from '../page/page-file';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { chargerPage, dateIso } from './operations';
import { lireEnfants } from './tree';
import type { TreeNode } from './tree';

/*
 * Opérations sur une base de données (docs/spec/base-de-donnees.md) : lire la base et ses lignes, changer
 * une valeur d'une ligne, la configuration (champs, tri), renommer un champ partout.
 */

/** Une ligne : une sous-page de la base, avec ses valeurs et ses sous-lignes (ses propres sous-pages). */
export interface BaseRow {
  id: string;
  chemin: string;
  titre: string;
  icone: string | null;
  valeurs: Record<string, string>;
  enfants: BaseRow[];
}

/** Au-delà, les sous-lignes ne sont plus lues : une arborescence démesurée ne doit pas figer la base. */
const profondeurMax = 6;

/** Les lignes d'un dossier, dans l'ordre des sous-pages, avec leurs sous-lignes. */
async function lignesDe(fs: LocalFs, enfants: TreeNode[], profondeur: number): Promise<BaseRow[]> {
  const lignes: BaseRow[] = [];
  for (const enfant of enfants) {
    if (!enfant.importe || enfant.id === null) {
      continue;
    }
    const { enTete } = analyserPage(await fs.lireTexte(cheminDuFichierPage(enfant.chemin)));
    lignes.push({
      id: enfant.id,
      chemin: enfant.chemin,
      titre: enfant.titre,
      icone: enfant.icone,
      valeurs: lireValeurs(enTete),
      enfants: profondeur < profondeurMax ? await lignesDe(fs, enfant.enfants, profondeur + 1) : [],
    });
  }
  return lignes;
}

/** Toutes les lignes, sous-lignes comprises, à plat. */
function toutesLesLignes(lignes: readonly BaseRow[]): BaseRow[] {
  return lignes.flatMap((ligne) => [ligne, ...toutesLesLignes(ligne.enfants)]);
}

export interface Base {
  config: BaseConfig;
  /** Les lignes dans l'ordre des sous-pages (le tri se fait à l'affichage). */
  lignes: BaseRow[];
}

/** La base d'une page : sa configuration (celle par défaut s'il n'y en a pas) et ses sous-pages importées. */
export async function lireBase(fs: LocalFs, chemin: string): Promise<Base> {
  const page = analyserPage(await fs.lireTexte(cheminDuFichierPage(chemin)));
  if (page.meta === null) {
    throw new VaultError('non_importee', "Cette page n'est pas encore importée.");
  }
  return { config: lireConfigDeBase(page.enTete) ?? baseParDefaut, lignes: await lignesDe(fs, await lireEnfants(fs, chemin), 1) };
}

/** Vérifie une configuration reçue : noms valides et différents, tri sur un champ qui existe. */
export function verifierConfigDeBase(config: BaseConfig): string | null {
  const noms = new Set<string>();
  for (const champ of config.champs) {
    if (!nomDeChampValide(champ.nom)) {
      return `« ${champ.nom} » n'est pas un nom de champ possible (vide, trop long, « ${colonneDesPages} », ou avec | ).`;
    }
    if (noms.has(champ.nom)) {
      return `Deux champs s'appellent « ${champ.nom} ».`;
    }
    noms.add(champ.nom);
    const choix = champ.choix ?? [];
    if (choix.length > maxChoix) {
      return `Le champ « ${champ.nom} » a plus de ${maxChoix} choix.`;
    }
    const nomsDesChoix = new Set<string>();
    for (const { nom, couleur } of choix) {
      if (!nomDeChoixValide(nom) || nom !== nom.trim()) {
        return `« ${nom} » n'est pas un choix possible (vide, trop long, ou avec | ).`;
      }
      if (nomsDesChoix.has(nom)) {
        return `Le choix « ${nom} » est en double dans « ${champ.nom} ».`;
      }
      if (couleur !== null && !(couleursDeChoix as readonly string[]).includes(couleur)) {
        return `La couleur du choix « ${nom} » n'existe pas.`;
      }
      nomsDesChoix.add(nom);
    }
  }
  if (config.tri !== null && config.tri.champ !== colonneDesPages && !noms.has(config.tri.champ)) {
    return `Le tri porte sur un champ qui n'existe pas : « ${config.tri.champ} ».`;
  }
  for (const [nom, largeur] of Object.entries(config.largeurs)) {
    if ((nom !== colonneDesPages && !noms.has(nom)) || !Number.isInteger(largeur) || largeur < largeurMinDeColonne || largeur > largeurMaxDeColonne) {
      return `La largeur de la colonne « ${nom} » n'est pas possible (${largeurMinDeColonne} à ${largeurMaxDeColonne} pixels).`;
    }
  }
  const repliees = config.repliees ?? [];
  if (repliees.length > maxLignesRepliees || repliees.some((cle) => !cleDeRepliValide(cle, config.lignes))) {
    return 'La liste des lignes repliées est mal formée.';
  }
  return null;
}

/** Écrit la configuration d'une base dans l'en-tête de sa page. Le corps ne change pas. */
export async function changerConfigDeBase(contexte: VaultContext, chemin: string, config: BaseConfig): Promise<void> {
  const refus = verifierConfigDeBase(config);
  if (refus !== null) {
    throw new VaultError('chemin_invalide', refus);
  }
  const { texte } = await chargerPage(contexte.fs, chemin);
  await contexte.fs.ecrireTexte(cheminDuFichierPage(chemin), modifierMetaDansTexte(texte, { base: config, modifieLe: dateIso(contexte) }));
}

/**
 * Change une valeur d'une ligne (sous-page « ligne » de la base « base »). La saisie est ramenée à la
 * forme du type du champ ; vide, la valeur se retire. Seul l'en-tête de la ligne change.
 */
export async function changerValeurDeBase(contexte: VaultContext, base: string, ligne: string, champ: string, saisie: string): Promise<void> {
  const { config } = await lireBase(contexte.fs, base);
  const definition = config.champs.find((candidat) => candidat.nom === champ);
  if (definition === undefined) {
    throw new VaultError('introuvable', `Le champ « ${champ} » n'existe plus.`);
  }
  if (!estLigneDe(base, ligne)) {
    throw new VaultError('chemin_invalide', "Cette page n'est pas une ligne de la base.");
  }
  const resultat = valeurPourLeChamp(definition.type, saisie);
  if (!resultat.ok) {
    throw new VaultError('chemin_invalide', resultat.message);
  }
  // Un choix tapé qui n'est pas dans la liste s'y ajoute, à la fin.
  if (definition.type === 'choix' && resultat.valeur !== null && !(definition.choix ?? []).some((choix) => choix.nom === resultat.valeur)) {
    const nouveau = { nom: resultat.valeur, couleur: null };
    await changerConfigDeBase(contexte, base, avecChoix(config, champ, (choix) => [...choix, nouveau]));
  }
  const { texte } = await chargerPage(contexte.fs, ligne);
  const valeurs = { ...lireValeurs(analyserPage(texte).enTete) };
  if (resultat.valeur === null) {
    delete valeurs[champ];
  } else {
    valeurs[champ] = resultat.valeur;
  }
  await contexte.fs.ecrireTexte(cheminDuFichierPage(ligne), modifierMetaDansTexte(texte, { valeurs, modifieLe: dateIso(contexte) }));
}

/** Renomme un champ : dans la configuration (tri compris) et dans les valeurs de toutes les lignes. */
export async function renommerChampDeBase(contexte: VaultContext, chemin: string, ancien: string, nouveau: string): Promise<void> {
  const nom = nouveau.trim();
  const { config, lignes } = await lireBase(contexte.fs, chemin);
  if (nom === ancien) {
    return;
  }
  const champs = config.champs.map((champ) => (champ.nom === ancien ? { ...champ, nom } : champ));
  const tri = config.tri?.champ === ancien ? { ...config.tri, champ: nom } : config.tri;
  const largeurs = Object.fromEntries(Object.entries(config.largeurs).map(([colonne, largeur]) => [colonne === ancien ? nom : colonne, largeur]));
  await changerConfigDeBase(contexte, chemin, { ...config, champs, tri, largeurs });
  for (const ligne of toutesLesLignes(lignes)) {
    if (ligne.valeurs[ancien] === undefined) {
      continue;
    }
    const { [ancien]: valeur, ...autres } = ligne.valeurs;
    const { texte } = await chargerPage(contexte.fs, ligne.chemin);
    await contexte.fs.ecrireTexte(cheminDuFichierPage(ligne.chemin), modifierMetaDansTexte(texte, { valeurs: { ...autres, [nom]: valeur as string } }));
  }
}

/** La configuration où la liste des choix d'un champ est remplacée. */
function avecChoix(config: BaseConfig, champ: string, changer: (choix: NonNullable<BaseField['choix']>) => NonNullable<BaseField['choix']>): BaseConfig {
  return { ...config, champs: config.champs.map((candidat) => (candidat.nom === champ ? { ...candidat, choix: changer(candidat.choix ?? []) } : candidat)) };
}

/** Le champ « choix » d'une base, ou une erreur s'il n'existe plus ou n'est pas un choix. */
function champDeChoix(config: BaseConfig, champ: string): BaseField {
  const definition = config.champs.find((candidat) => candidat.nom === champ);
  if (definition?.type !== 'choix') {
    throw new VaultError('introuvable', `Le champ « ${champ} » n'est pas une liste de choix.`);
  }
  return definition;
}

/** Remplace la valeur « ancienne » du champ dans toutes les lignes qui l'ont ; null la retire. */
async function remplacerDansLesLignes(contexte: VaultContext, lignes: readonly BaseRow[], champ: string, ancienne: string, nouvelle: string | null): Promise<void> {
  for (const ligne of toutesLesLignes(lignes)) {
    if (ligne.valeurs[champ] !== ancienne) {
      continue;
    }
    const { [champ]: _ancienne, ...autres } = ligne.valeurs;
    const { texte } = await chargerPage(contexte.fs, ligne.chemin);
    await contexte.fs.ecrireTexte(cheminDuFichierPage(ligne.chemin), modifierMetaDansTexte(texte, { valeurs: nouvelle === null ? autres : { ...ligne.valeurs, [champ]: nouvelle }, modifieLe: dateIso(contexte) }));
  }
}

/** Renomme un choix d'un champ : dans la liste (sa couleur suit) et dans toutes les lignes qui l'ont. */
export async function renommerChoixDeBase(contexte: VaultContext, chemin: string, champ: string, ancien: string, nouveau: string): Promise<void> {
  const nom = nouveau.trim();
  const { config, lignes } = await lireBase(contexte.fs, chemin);
  const definition = champDeChoix(config, champ);
  if (nom === ancien) {
    return;
  }
  if (!nomDeChoixValide(nom)) {
    throw new VaultError('chemin_invalide', `« ${nom} » n'est pas un choix possible (vide, trop long, ou avec | ).`);
  }
  if ((definition.choix ?? []).some((choix) => choix.nom === nom)) {
    throw new VaultError('chemin_invalide', `Le choix « ${nom} » existe déjà.`);
  }
  await changerConfigDeBase(contexte, chemin, avecChoix(config, champ, (choix) => choix.map((candidat) => (candidat.nom === ancien ? { ...candidat, nom } : candidat))));
  await remplacerDansLesLignes(contexte, lignes, champ, ancien, nom);
}

/** Retire un choix d'un champ : de la liste, et des lignes qui l'avaient (leur cellule se vide). */
export async function retirerChoixDeBase(contexte: VaultContext, chemin: string, champ: string, nom: string): Promise<void> {
  const { config, lignes } = await lireBase(contexte.fs, chemin);
  champDeChoix(config, champ);
  await changerConfigDeBase(contexte, chemin, avecChoix(config, champ, (choix) => choix.filter((candidat) => candidat.nom !== nom)));
  await remplacerDansLesLignes(contexte, lignes, champ, nom, null);
}

/** Vrai si le dossier « chemin » est une ligne de la base « base » : une de ses sous-pages, à tout niveau (sous-lignes). */
export function estLigneDe(base: string, chemin: string): boolean {
  return base !== '' && chemin.startsWith(`${base}/`) && chemin.length > base.length + 1;
}
