import { estSauvegardeDeConflit } from '../sync/conflict';
import { VaultError } from './context';
import type { VaultContext } from './context';

/**
 * Dictionnaire personnel de la correction orthographique (README §11) : un mot
 * par ligne dans `.notes/dictionary.txt`, synchronisé avec le reste. Lisible et
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

/**
 * Lit le dictionnaire. Les versions mises de côté par la sync
 * (`dictionary.conflit-[date].txt`, un mot ajouté sur les deux appareils
 * entre deux cycles) comptent aussi : aucun mot ajouté n'est perdu.
 */
export async function lireDictionnaire(contexte: VaultContext): Promise<string[]> {
  const { fs } = contexte;
  if ((await fs.infos(dossierDuDictionnaire)) === null) {
    return [];
  }
  const fichiers = (await fs.lister(dossierDuDictionnaire))
    .filter((entree) => !entree.estDossier && (entree.nom === 'dictionary.txt' || (entree.nom.startsWith('dictionary.') && estSauvegardeDeConflit(entree.nom))))
    .map((entree) => `${dossierDuDictionnaire}/${entree.nom}`);
  const mots: string[] = [];
  for (const fichier of fichiers) {
    mots.push(...motsDuDictionnaire(await fs.lireTexte(fichier)));
  }
  return [...new Set(mots)];
}

/** Ajoute un mot à la fin du fichier, sans toucher au reste. Sans effet s'il y est déjà. Rend la liste à jour. */
export async function ajouterAuDictionnaire(contexte: VaultContext, mot: string): Promise<string[]> {
  const valide = motValide(mot);
  if (valide === null) {
    throw new VaultError('chemin_invalide', "Ce mot ne peut pas aller dans le dictionnaire.");
  }
  const { fs } = contexte;
  const existant = (await fs.infos(fichierDuDictionnaire)) === null ? '' : await fs.lireTexte(fichierDuDictionnaire);
  if (!motsDuDictionnaire(existant).includes(valide)) {
    await fs.creerDossier(dossierDuDictionnaire);
    const separateur = existant === '' || existant.endsWith('\n') ? '' : '\n';
    await fs.ecrireTexte(fichierDuDictionnaire, `${existant}${separateur}${valide}\n`);
  }
  return lireDictionnaire(contexte);
}
