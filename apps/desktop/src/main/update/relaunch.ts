import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Numéro de l'instance à attendre avant de démarrer : la nouvelle version ne prend la place qu'une fois l'ancienne finie. */
export const variableDAttente = 'NOTES_ATTENDRE_FIN';
/** Au-delà, la nouvelle instance démarre quand même (l'ancienne est bloquée) : l'instance unique fera le reste. */
const attenteMaxMs = 30_000;

/** Variables posées par l'environnement de l'AppImage en cours : la nouvelle AppImage pose les siennes. */
const variablesDeLAppImage = ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD'];

/**
 * Ferme tout descripteur hérité au-delà des trois standards, puis lance le
 * programme. Sans cela, la nouvelle AppImage garderait le canal par lequel
 * l'ancienne tient son montage, qui ne se démonterait jamais. Pour bash, livré
 * d'office avec Mint : dash, le /bin/sh de Mint, ne ferme pas un descripteur
 * au-delà de 9.
 */
export const scriptDeRelance = 'for f in /proc/$$/fd/*; do n=${f##*/}; [ "$n" -gt 2 ] 2>/dev/null && eval "exec $n>&-"; done; exec "$0" "$@"';

/**
 * Lance la nouvelle AppImage, détachée, avant de quitter. `app.relaunch`
 * d'Electron ne convient pas : son relanceur vit dans le dossier monté de
 * l'ancienne AppImage, qui disparaît avec elle.
 */
export const cheminDeBash = '/bin/bash';

export function relancerApresLaFin(appImage: string, argumentsDeLancement: readonly string[], lancer: typeof spawn = spawn, existeBash: () => boolean = () => existsSync(cheminDeBash)): void {
  const environnement: NodeJS.ProcessEnv = { ...process.env, [variableDAttente]: String(process.pid) };
  for (const variable of variablesDeLAppImage) {
    delete environnement[variable];
  }
  const options = { detached: true, stdio: 'ignore', env: environnement } as const;
  // Sans bash, relance directe : l'ancien montage reste alors jusqu'à ce que la nouvelle instance s'arrête.
  const enfant = existeBash() ? lancer(cheminDeBash, ['-c', scriptDeRelance, appImage, ...argumentsDeLancement], options) : lancer(appImage, [...argumentsDeLancement], options);
  enfant.unref();
}

const estVivant = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Au démarrage d'une instance relancée : attend la fin de l'ancienne. Rien à attendre sinon. */
export async function attendreLaFinDeLAncienne(environnement: NodeJS.ProcessEnv, vivant: (pid: number) => boolean = estVivant, pasMs = 100): Promise<void> {
  const pid = Number(environnement[variableDAttente]);
  delete environnement[variableDAttente];
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }
  const fin = Date.now() + attenteMaxMs;
  while (vivant(pid) && Date.now() < fin) {
    await new Promise((resoudre) => setTimeout(resoudre, pasMs));
  }
}
