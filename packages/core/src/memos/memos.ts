import { joindreChemins, nomDeBase } from '../fs/paths';
import { decouperPage, assemblerPage } from '../page/front-matter';
import { cheminDuFichierPage, lirePage, modifierMetaDansTexte } from '../page/page-file';
import { fichierPage } from '../page/types';
import { VaultError } from '../vault/context';
import type { VaultContext } from '../vault/context';
import { creerPage } from '../vault/operations';
import type { PageLocation } from '../vault/operations';
import { estIgnore } from '../vault/tree';

/**
 * Mémos vocaux (docs/spec/memos.md). Le téléphone dépose un fichier audio dans
 * `.notes/memos/`, la sync l'amène sur le PC ; il y attend d'être transcrit.
 * Chaque mémo accepté devient une sous-page de la page « Mémos vocaux »,
 * reconnue à son en-tête (`role: memos`), puis l'audio part à la corbeille.
 */
export const dossierDesMemos = '.notes/memos';
export const titreDeLaPageDesMemos = 'Mémos vocaux';

/**
 * Tous les formats audio courants (choix d'Eloi, 2026-10-08), vidéos comprises
 * pour leur son : ce que Chromium ne lit pas est décodé par le ffmpeg livré
 * avec le desktop. AMR et 3GP sont ceux des enregistreurs Android.
 */
const extensionsAudio = [
  '.m4a', '.m4b', '.mp4', '.aac', '.ogg', '.oga', '.opus', '.spx', '.webm', '.weba', '.mka', '.mkv', '.wav', '.w64', '.mp3', '.mp2', '.mpga', '.flac',
  '.amr', '.awb', '.3gp', '.3ga', '.3g2', '.wma', '.asf', '.aif', '.aiff', '.aifc', '.caf', '.alac', '.ape', '.wv', '.tta', '.ac3', '.eac3', '.dts',
  '.au', '.snd', '.ra', '.rm', '.gsm', '.voc', '.mpc', '.tak', '.dsf', '.dff', '.mov', '.avi',
];

export interface VoiceMemo {
  nom: string;
  /** Chemin dans le dossier des notes. */
  chemin: string;
  /** Moment de l'enregistrement, en millisecondes : lu dans le nom, sinon la date du fichier. */
  date: number;
  taille: number;
}

export function estFichierAudio(nom: string): boolean {
  const minuscule = nom.toLowerCase();
  return extensionsAudio.some((extension) => minuscule.endsWith(extension));
}

/**
 * Moment d'un mémo d'après son nom, tel que le téléphone l'écrit (J17) :
 * `memo-2026-10-07-162400.m4a`, à l'heure du téléphone. null pour un autre nom.
 */
export function dateDuNom(nom: string): number | null {
  const trouve = /^memo-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\./i.exec(nom);
  if (trouve === null) {
    return null;
  }
  const [annee, mois, jour, heure, minute, seconde] = trouve.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(annee, mois - 1, jour, heure, minute, seconde);
  return date.getMonth() === mois - 1 && date.getDate() === jour ? date.getTime() : null;
}

/** Nom du fichier d'un mémo enregistré à ce moment (le téléphone, J17, l'écrit ainsi). */
export function nomDeMemo(date: number, extension = 'm4a'): string {
  const d = new Date(date);
  const deux = (n: number): string => String(n).padStart(2, '0');
  return `memo-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}${deux(d.getSeconds())}.${extension}`;
}

/** Titre de la sous-page d'un mémo : la date seule (choix d'Eloi, 2026-10-07). « Mémo du 7 octobre 2026 à 16 h 24 ». */
export function titreDuMemo(date: number): string {
  const d = new Date(date);
  const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Mémo du ${jour} à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Mémos en attente de transcription, du plus ancien au plus récent. */
export async function listerMemos(contexte: VaultContext): Promise<VoiceMemo[]> {
  const { fs } = contexte;
  if ((await fs.infos(dossierDesMemos)) === null) {
    return [];
  }
  return (await fs.lister(dossierDesMemos))
    .filter((entree) => !entree.estDossier && entree.taille > 0 && estFichierAudio(entree.nom) && !entree.nom.startsWith('.'))
    .map((entree) => ({ nom: entree.nom, chemin: joindreChemins(dossierDesMemos, entree.nom), date: dateDuNom(entree.nom) ?? entree.modifieLe, taille: entree.taille }))
    .sort((a, b) => a.date - b.date || a.nom.localeCompare(b.nom));
}

/** Un chemin de mémo venu de l'extérieur : un fichier audio directement dans `.notes/memos/`, rien d'autre. */
export function cheminDeMemoValide(chemin: unknown): chemin is string {
  return typeof chemin === 'string' && chemin.startsWith(`${dossierDesMemos}/`) && !chemin.slice(dossierDesMemos.length + 1).includes('/') && estFichierAudio(chemin) && !nomDeBase(chemin).startsWith('.');
}

/** La page « Mémos vocaux » à la racine du dossier des notes, null si elle n'existe pas encore. */
export async function trouverPageDesMemos(contexte: VaultContext): Promise<PageLocation | null> {
  const { fs } = contexte;
  for (const entree of await fs.lister('')) {
    if (!entree.estDossier || estIgnore(entree.nom, true) || (await fs.infos(joindreChemins(entree.nom, fichierPage))) === null) {
      continue;
    }
    const { meta } = await lirePage(fs, entree.nom);
    if (meta?.role === 'memos') {
      return { chemin: entree.nom, id: meta.id };
    }
  }
  return null;
}

/** La page « Mémos vocaux », créée à la racine (en dernier) si elle n'existe pas. */
export async function pageDesMemos(contexte: VaultContext): Promise<PageLocation> {
  const existante = await trouverPageDesMemos(contexte);
  if (existante !== null) {
    return existante;
  }
  const creee = await creerPage(contexte, { parent: '', titre: titreDeLaPageDesMemos });
  const fichier = cheminDuFichierPage(creee.chemin);
  await contexte.fs.ecrireTexte(fichier, modifierMetaDansTexte(await contexte.fs.lireTexte(fichier), { role: 'memos' }));
  return creee;
}

/**
 * Crée la sous-page d'un mémo accepté, titrée par sa date, avec le texte
 * donné. Le fichier audio n'est pas touché ici : il part à la corbeille ensuite.
 */
export async function creerPageDeMemo(contexte: VaultContext, memo: Pick<VoiceMemo, 'date'>, corps: string): Promise<PageLocation> {
  if (corps.trim() === '') {
    throw new VaultError('chemin_invalide', 'Le mémo n’a pas de texte.');
  }
  const parent = await pageDesMemos(contexte);
  const creee = await creerPage(contexte, { parent: parent.chemin, titre: titreDuMemo(memo.date) });
  const fichier = cheminDuFichierPage(creee.chemin);
  const morceaux = decouperPage(await contexte.fs.lireTexte(fichier));
  await contexte.fs.ecrireTexte(fichier, assemblerPage({ ...morceaux, corps: corps.endsWith('\n') ? corps : `${corps}\n` }));
  return creee;
}

/**
 * La page « Mémos vocaux » est-elle masquée sur ce poste ? Masquer retient les
 * mémos présents à ce moment ; un mémo qui n'y était pas la fait réapparaître
 * (docs/spec/memos.md). `vus` est null quand elle n'est pas masquée.
 */
export function pageDesMemosMasquee(vus: readonly string[] | null, enAttente: readonly VoiceMemo[]): boolean {
  return vus !== null && enAttente.every((memo) => vus.includes(memo.nom));
}
