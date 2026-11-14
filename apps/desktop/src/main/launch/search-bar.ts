import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { cheminDeBash, scriptDeRelance } from '../update/relaunch';

/** Entrée de menu posée par l'installation de la barre de recherche du poste (`../BarreRecherche`). */
export const entreeDeLaBarre = 'barre-recherche.desktop';

/** Argument qui demande à la barre de ne chercher que les pages de Notes, comme son `Ctrl+K` depuis Notes. */
export const argumentCibleNotes = '--cible=notes';

/** Variables de l'AppImage de Notes : la barre, une autre AppImage, pose les siennes. */
const variablesDeLAppImage = ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD'];

/** Dossiers où chercher l'entrée de menu, du plus personnel au plus général (spécification XDG). */
export function dossiersDesApplications(env: NodeJS.ProcessEnv, maison: string): string[] {
  const personnel = env['XDG_DATA_HOME'] !== undefined && env['XDG_DATA_HOME'] !== '' ? env['XDG_DATA_HOME'] : join(maison, '.local/share');
  const communs = (env['XDG_DATA_DIRS'] !== undefined && env['XDG_DATA_DIRS'] !== '' ? env['XDG_DATA_DIRS'] : '/usr/local/share:/usr/share').split(':').filter((dossier) => dossier !== '');
  return [personnel, ...communs].map((dossier) => join(dossier, 'applications'));
}

/**
 * Programme de la ligne `Exec=` d'une entrée de menu : le premier mot, entre guillemets
 * ou non. Les arguments et codes de champ (`%U`…) sont laissés : Notes passe les siens.
 */
export function programmeDeLEntree(contenu: string): string | null {
  const ligne = contenu.split(/\r?\n/).find((texte) => texte.startsWith('Exec='));
  if (ligne === undefined) {
    return null;
  }
  const commande = ligne.slice('Exec='.length).trim();
  const programme = commande.startsWith('"') ? /^"((?:[^"\\]|\\.)*)"/.exec(commande)?.[1]?.replace(/\\(.)/g, '$1') : commande.split(/\s+/)[0];
  return programme === undefined || programme === '' ? null : programme;
}

/** Chemin de la barre de recherche, lu dans son entrée de menu, null si elle n'est pas installée. */
export async function trouverLaBarre(dossiers: readonly string[], lire: (chemin: string) => Promise<string> = (chemin) => readFile(chemin, 'utf8')): Promise<string | null> {
  for (const dossier of dossiers) {
    try {
      const programme = programmeDeLEntree(await lire(join(dossier, entreeDeLaBarre)));
      if (programme !== null) {
        return programme;
      }
    } catch {
      // Pas d'entrée dans ce dossier : le suivant.
    }
  }
  return null;
}

/**
 * Montre la barre de recherche du poste : un second lancement la fait apparaître dans l'instance
 * déjà là. Lancée détachée, sans les variables ni les descripteurs de l'AppImage de Notes : si la
 * barre n'était pas lancée, elle reste ouverte après Notes sans retenir son montage (voir update/relaunch.ts).
 * Rend false si la barre n'est pas installée.
 */
export async function ouvrirLaBarre(dossiers: readonly string[] = dossiersDesApplications(process.env, homedir()), lancer: typeof spawn = spawn): Promise<boolean> {
  const programme = await trouverLaBarre(dossiers);
  if (programme === null) {
    return false;
  }
  const environnement: NodeJS.ProcessEnv = { ...process.env };
  for (const variable of variablesDeLAppImage) {
    delete environnement[variable];
  }
  const enfant = lancer(cheminDeBash, ['-c', scriptDeRelance, programme, argumentCibleNotes], { detached: true, stdio: 'ignore', env: environnement });
  enfant.on('error', () => undefined);
  enfant.unref();
  return true;
}
