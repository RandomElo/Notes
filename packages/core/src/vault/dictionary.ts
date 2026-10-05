import { estSauvegardeDeConflit } from '../sync/conflict';
import { VaultError } from './context';
import type { VaultContext } from './context';

/**
 * Dictionnaire personnel de la correction orthographique (README §11) : un mot
 * par ligne dans `.notes/dictionary.txt`, synchronisé avec le reste. Même forme
 * pour les remarques ignorées, plus bas. Lisible et
 * modifiable à la main ; une ligne qui commence par `#` est un commentaire.
 */
export const dossierDuDictionnaire = '.notes';
export const fichierDuDictionnaire = `${dossierDuDictionnaire}/dictionary.txt`;
const longueurMaxDUnMot = 100;

/** Les mots d'un texte de dictionnaire, sans doublon, dans l'ordre. */
export function motsDuDictionnaire(texte: string): string[] {
  const mots = texte
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '' && !ligne.startsWith('#'));
  return [...new Set(mots)];
}

/** Le mot tel qu'il sera écrit, ou null s'il n'est pas acceptable (vide, trop long, sur plusieurs lignes). */
export function motValide(mot: string): string | null {
  const nettoye = mot.trim();
  // eslint-disable-next-line no-control-regex
  return nettoye === '' || nettoye.length > longueurMaxDUnMot || nettoye.startsWith('#') || /[\u0000-\u001f\u007f]/.test(nettoye) ? null : nettoye;
}

/** Lignes d'un fichier de liste et de ses versions mises de côté par la sync (`nom.conflit-[date].txt`) : aucune ligne ajoutée n'est perdue. */
async function lireListe(contexte: VaultContext, nom: string): Promise<string[]> {
  const { fs } = contexte;
  if ((await fs.infos(dossierDuDictionnaire)) === null) {
    return [];
  }
  const base = nom.replace(/\.txt$/, '');
  const fichiers = (await fs.lister(dossierDuDictionnaire))
    .filter((entree) => !entree.estDossier && (entree.nom === nom || (entree.nom.startsWith(`${base}.`) && estSauvegardeDeConflit(entree.nom))))
    .map((entree) => `${dossierDuDictionnaire}/${entree.nom}`);
  const lignes: string[] = [];
  for (const fichier of fichiers) {
    lignes.push(...motsDuDictionnaire(await fs.lireTexte(fichier)));
  }
  return [...new Set(lignes)];
}

/** Ajoute une ligne à la fin du fichier, sans toucher au reste. Sans effet si elle y est déjà. */
async function ajouterALaListe(contexte: VaultContext, nom: string, ligne: string): Promise<void> {
  const { fs } = contexte;
  const fichier = `${dossierDuDictionnaire}/${nom}`;
  const existant = (await fs.infos(fichier)) === null ? '' : await fs.lireTexte(fichier);
  if (!motsDuDictionnaire(existant).includes(ligne)) {
    await fs.creerDossier(dossierDuDictionnaire);
    const separateur = existant === '' || existant.endsWith('\n') ? '' : '\n';
    await fs.ecrireTexte(fichier, `${existant}${separateur}${ligne}\n`);
  }
}

/** Lit le dictionnaire, versions en conflit comprises (un mot ajouté sur les deux appareils entre deux cycles). */
export function lireDictionnaire(contexte: VaultContext): Promise<string[]> {
  return lireListe(contexte, 'dictionary.txt');
}

/** Ajoute un mot à la fin du fichier, sans toucher au reste. Sans effet s'il y est déjà. Rend la liste à jour. */
export async function ajouterAuDictionnaire(contexte: VaultContext, mot: string): Promise<string[]> {
  const valide = motValide(mot);
  if (valide === null) {
    throw new VaultError('chemin_invalide', 'Ce mot ne peut pas aller dans le dictionnaire.');
  }
  await ajouterALaListe(contexte, 'dictionary.txt', valide);
  return lireDictionnaire(contexte);
}

/**
 * Remarques écartées par « Ignorer » (README §11), gardées pour toujours et
 * sur tous les appareils : une ligne par remarque dans
 * `.notes/spelling-ignored.txt`, la règle de LanguageTool puis le passage
 * concerné (`A_ACCENT a`). La remarque n'est plus montrée nulle part.
 */
export const fichierDesIgnores = `${dossierDuDictionnaire}/spelling-ignored.txt`;

export interface IgnoredRemark {
  regle: string;
  mot: string;
}

/** La ligne écrite pour une remarque ignorée, ou null si elle n'est pas acceptable. */
export function ligneDIgnore({ regle, mot }: IgnoredRemark): string | null {
  const valide = motValide(mot);
  return /^[A-Za-z0-9_]{1,100}$/.test(regle) && valide !== null ? `${regle} ${valide}` : null;
}

export async function lireIgnores(contexte: VaultContext): Promise<IgnoredRemark[]> {
  return (await lireListe(contexte, 'spelling-ignored.txt')).flatMap((ligne) => {
    const espace = ligne.indexOf(' ');
    return espace <= 0 ? [] : [{ regle: ligne.slice(0, espace), mot: ligne.slice(espace + 1).trim() }];
  });
}

/** Ajoute une remarque ignorée à la fin du fichier. Rend la liste à jour. */
export async function ajouterAuxIgnores(contexte: VaultContext, remarque: IgnoredRemark): Promise<IgnoredRemark[]> {
  const ligne = ligneDIgnore(remarque);
  if (ligne === null) {
    throw new VaultError('chemin_invalide', 'Cette remarque ne peut pas être ignorée.');
  }
  await ajouterALaListe(contexte, 'spelling-ignored.txt', ligne);
  return lireIgnores(contexte);
}
