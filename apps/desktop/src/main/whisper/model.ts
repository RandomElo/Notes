import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { telechargerVers } from '../languagetool/download';
import type { Telecharger } from '../languagetool/download';

export interface ModelFile {
  nom: string;
  adresse: string;
  taille: number;
  empreinte: string;
}

/**
 * Modèle de transcription des mémos vocaux (README §13) : large-v3-turbo de
 * Whisper, quantifié en 5 bits pour whisper.cpp. 574 Mo, environ 0,8 Go de
 * mémoire vidéo : il tient à côté du modèle d'Ollama sur une carte de 8 Go.
 * Téléchargé une fois depuis le dépôt de whisper.cpp chez Hugging Face,
 * vérifié par son empreinte, rangé hors de l'AppImage.
 */
export const modeleWhisper: ModelFile = {
  nom: 'ggml-large-v3-turbo-q5_0.bin',
  adresse: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
  taille: 574_041_195,
  empreinte: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
};

/**
 * Détection de la voix (Silero, 885 Ko) : seuls les passages parlés partent à
 * Whisper. Sans elle, Whisper invente du texte sur la musique ou le silence
 * (« Sous-titrage Société Radio-Canada », vu en essai).
 */
export const modeleDeVoix: ModelFile = {
  nom: 'ggml-silero-v5.1.2.bin',
  adresse: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin',
  taille: 885_098,
  empreinte: '29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf',
};

const fichiers = [modeleWhisper, modeleDeVoix];
export const tailleDesModeles = fichiers.reduce((total, fichier) => total + fichier.taille, 0);

/**
 * Dossier des modèles : à côté de l'AppImage (`~/Applications/Whisper`), comme
 * LanguageTool ; hors AppImage, dans `~/Applications`. `NOTES_DOSSIER_WHISPER`
 * le remplace, pour un essai qui ne doit pas toucher à l'installation du poste.
 */
export function dossierDeWhisper(env: NodeJS.ProcessEnv, maison: string): string {
  const impose = env['NOTES_DOSSIER_WHISPER'];
  if (impose !== undefined && isAbsolute(impose)) {
    return impose;
  }
  const appImage = env['APPIMAGE'];
  return join(appImage !== undefined && isAbsolute(appImage) ? dirname(appImage) : join(maison, 'Applications'), 'Whisper');
}

export function cheminDuModele(dossier: string, fichier: ModelFile = modeleWhisper): string {
  return join(dossier, fichier.nom);
}

/** Les modèles sont-ils là, entiers ? Leur empreinte a été vérifiée au téléchargement, avant d'être mis à leur place. */
export async function modeleInstalle(dossier: string, liste: readonly ModelFile[] = fichiers): Promise<boolean> {
  for (const fichier of liste) {
    try {
      if ((await stat(cheminDuModele(dossier, fichier))).size !== fichier.taille) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Télécharge chaque modèle qui manque à côté, vérifie son empreinte, puis le
 * met à sa place : un téléchargement interrompu ou faux ne laisse jamais un
 * modèle abîmé à la place du bon. `surOctets` reçoit le total des deux.
 */
export async function telechargerModele(
  dossier: string,
  telecharger: Telecharger,
  signal: AbortSignal,
  surOctets: (recus: number) => void,
  liste: readonly ModelFile[] = fichiers,
): Promise<void> {
  await mkdir(dossier, { recursive: true });
  let dejaRecus = 0;
  for (const fichier of liste) {
    const chemin = cheminDuModele(dossier, fichier);
    const present = await stat(chemin).then(
      (infos) => infos.size === fichier.taille,
      () => false,
    );
    if (!present) {
      const partiel = `${chemin}.partiel`;
      try {
        const empreinte = await telechargerVers(partiel, { adresse: fichier.adresse, libelle: 'Modèle de transcription', taille: fichier.taille }, telecharger, signal, (recus) => surOctets(dejaRecus + recus));
        if (empreinte !== fichier.empreinte) {
          throw new Error('Modèle de transcription : le fichier reçu n’est pas celui attendu (empreinte différente). Rien n’a été installé.');
        }
        await rename(partiel, chemin);
      } finally {
        await rm(partiel, { force: true });
      }
    }
    dejaRecus += fichier.taille;
    surOctets(dejaRecus);
  }
}
