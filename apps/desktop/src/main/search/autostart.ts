import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Argument du lancement à l'ouverture de session : aucune fenêtre, la recherche prête en fond. */
export const argumentEnFond = '--fond';

/** Fichier de démarrage automatique de la session (norme freedesktop, lue par Cinnamon). */
export function cheminDuLanceur(dossierDeConfiguration: string): string {
  return join(dossierDeConfiguration, 'autostart', 'notes.desktop');
}

/** Un argument de la ligne `Exec` d'un fichier .desktop, entre guillemets doubles, caractères réservés échappés. */
function argumentDesktop(valeur: string): string {
  return `"${valeur.replace(/[\\"`$]/g, (caractere) => `\\${caractere}`)}"`;
}

/** Contenu du fichier : lance l'AppImage en fond à l'ouverture de session. */
export function contenuDuLanceur(appImage: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Notes',
    'Comment=Garde la recherche de Notes prête (Ctrl+Alt+Espace)',
    `Exec=${argumentDesktop(appImage)} ${argumentEnFond}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

/**
 * Démarrage de Notes avec la session, réglé depuis l'application. Le
 * fichier n'est écrit ou retiré que sur demande. Hors de l'AppImage
 * (développement), il n'y a pas de programme stable à lancer : rien à régler.
 */
export class Autostart {
  private readonly fichier: string;

  constructor(
    dossierDeConfiguration: string,
    private readonly appImage: string | undefined,
  ) {
    this.fichier = cheminDuLanceur(dossierDeConfiguration);
  }

  disponible(): boolean {
    return this.appImage !== undefined && this.appImage !== '';
  }

  /** Vrai si le fichier existe et lance bien cette AppImage. */
  async actif(): Promise<boolean> {
    if (!this.disponible()) {
      return false;
    }
    try {
      return (await readFile(this.fichier, 'utf8')) === contenuDuLanceur(this.appImage as string);
    } catch {
      return false;
    }
  }

  async definir(actif: boolean): Promise<void> {
    if (!this.disponible()) {
      return;
    }
    if (actif) {
      await mkdir(dirname(this.fichier), { recursive: true });
      await writeFile(this.fichier, contenuDuLanceur(this.appImage as string), { mode: 0o644 });
    } else {
      await rm(this.fichier, { force: true });
    }
  }
}
