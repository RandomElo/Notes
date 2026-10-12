import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

/** Un mémo de plusieurs heures tient dedans : 16 kHz mono 16 bits, c'est 115 Mo par heure. */
const tailleMaxDuWav = 400 * 1024 * 1024;
const delaiMaxMs = 5 * 60_000;

export type Lancer = (binaire: string, argumentsDeLancement: string[]) => ChildProcess;

const lancerParDefaut: Lancer = (binaire, argumentsDeLancement) =>
  // Environnement vide : ffmpeg n'a besoin de rien, et rien du poste ne passe.
  spawn(binaire, argumentsDeLancement, { env: {}, stdio: ['ignore', 'pipe', 'pipe'] });

/** Arguments de la conversion : le fichier, sans la vidéo, en WAV PCM 16 bits mono à 16 kHz sur la sortie. */
export function argumentsDeConversion(fichier: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', `file:${fichier}`, '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'];
}

/**
 * Convertit un fichier audio (ou vidéo : seul le son est gardé) en WAV 16 kHz
 * mono par le ffmpeg livré avec Notes (docs/spec/memos.md). Sert aux formats que
 * Chromium ne lit pas. Le chemin est absolu et déjà vérifié par l'appelant ;
 * le préfixe `file:` empêche ffmpeg de le lire comme une option ou un autre
 * protocole. Rejette avec un message en français.
 */
export function convertirEnWav(binaire: string, fichier: string, lancer: Lancer = lancerParDefaut): Promise<Uint8Array> {
  return new Promise((resoudre, rejeter) => {
    let processus: ChildProcess;
    try {
      processus = lancer(binaire, argumentsDeConversion(fichier));
    } catch {
      rejeter(new Error('Le décodeur audio de Notes ne démarre pas.'));
      return;
    }
    const morceaux: Buffer[] = [];
    let taille = 0;
    let erreurs = '';
    let fini = false;
    const finir = (erreur: Error | null): void => {
      if (fini) {
        return;
      }
      fini = true;
      clearTimeout(minuteur);
      if (erreur !== null) {
        processus.kill('SIGKILL');
        rejeter(erreur);
      } else {
        resoudre(new Uint8Array(Buffer.concat(morceaux)));
      }
    };
    const minuteur = setTimeout(() => finir(new Error('Le décodage de ce mémo a pris trop de temps.')), delaiMaxMs);
    processus.stdout?.on('data', (morceau: Buffer) => {
      taille += morceau.length;
      if (taille > tailleMaxDuWav) {
        finir(new Error('Ce mémo est trop long pour être transcrit.'));
        return;
      }
      morceaux.push(morceau);
    });
    processus.stderr?.on('data', (morceau: Buffer) => {
      erreurs = (erreurs + morceau.toString('utf8')).slice(-2000);
    });
    processus.on('error', () => finir(new Error('Le décodeur audio de Notes ne démarre pas.')));
    processus.on('close', (code) => {
      // Un WAV sans aucun échantillon : ffmpeg n'a trouvé aucun son dans le fichier.
      if (code === 0 && taille > 44) {
        finir(null);
      } else {
        finir(new Error(/does not contain any stream|Invalid data|could not find codec|Output file .* does not contain/i.test(erreurs) || code === 0 ? 'Ce fichier ne contient pas d’audio lisible.' : 'Cet audio ne se lit pas (fichier abîmé ou format inconnu).'));
      }
    });
  });
}

/** « Duration: 00:01:23.45 » dans ce qu'écrit ffmpeg en lisant un fichier ; null si absent (« N/A »). */
export function lireDureeAffichee(sortie: string): number | null {
  const trouve = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(sortie);
  if (trouve === null) {
    return null;
  }
  const [, heures, minutes, secondes] = trouve;
  return Math.round((Number(heures) * 3600 + Number(minutes) * 60 + Number(secondes)) * 1000);
}

/**
 * Durée d'un fichier audio en millisecondes, lue dans son en-tête par le
 * ffmpeg livré, sans le décoder (quelques millisecondes) : pour estimer une
 * transcription avant de la lancer. null si ffmpeg ne la donne pas.
 */
export function dureeAudio(binaire: string, fichier: string, lancer: Lancer = lancerParDefaut): Promise<number | null> {
  return new Promise((resoudre) => {
    let processus: ChildProcess;
    try {
      // Sans fichier de sortie, ffmpeg décrit l'entrée puis s'arrête en erreur : c'est voulu.
      processus = lancer(binaire, ['-hide_banner', '-nostdin', '-i', `file:${fichier}`]);
    } catch {
      resoudre(null);
      return;
    }
    let sortie = '';
    const minuteur = setTimeout(() => {
      processus.kill('SIGKILL');
      resoudre(null);
    }, 5000);
    // Rien n'est attendu sur la sortie standard, mais elle est vidée pour que ffmpeg ne s'y bloque jamais.
    processus.stdout?.resume();
    processus.stderr?.on('data', (morceau: Buffer) => {
      sortie = (sortie + morceau.toString('utf8')).slice(-8000);
    });
    processus.on('error', () => {
      clearTimeout(minuteur);
      resoudre(null);
    });
    processus.on('close', () => {
      clearTimeout(minuteur);
      resoudre(lireDureeAffichee(sortie));
    });
  });
}
