import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, session } from 'electron';
import type { PageMargins, PaperFormat } from '../../shared/ipc-contract';

export interface PdfSettings {
  papier: PaperFormat;
  marges: PageMargins;
  /** Titre de la page, écrit dans le pied de chaque page avec son numéro. */
  titre: string;
}

/** Marge de chaque côté, en millimètres. */
const millimetres: Record<PageMargins, number> = { etroites: 12, normales: 20, larges: 30 };
/** Place du pied de page (titre et numéro), ajoutée à la marge du bas. */
const hauteurDuPied = 8;
const pouce = 25.4;

/** Échappe un texte pour le poser dans le modèle HTML du pied de page. */
function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (caractere) => `&#${caractere.charCodeAt(0)};`);
}

/** Le pied de chaque page : le titre à gauche, le numéro à droite. Rempli par Chromium (`pageNumber`, `totalPages`). */
export function piedDePage(titre: string, marges: PageMargins): string {
  const cote = millimetres[marges];
  return (
    `<div style="box-sizing:border-box;width:100%;padding:0 ${cote}mm;display:flex;justify-content:space-between;gap:8mm;` +
    `font-family:system-ui,sans-serif;font-size:8pt;color:#646b76;">` +
    `<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${echapper(titre)}</span>` +
    `<span style="white-space:nowrap;"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
  );
}

/** Session de la fenêtre d'impression : rien d'autre que le fichier à imprimer n'est chargé. */
const partition = 'export-pdf';
let sessionPrete = false;

function preparerSession(): void {
  if (sessionPrete) {
    return;
  }
  sessionPrete = true;
  const sessionDImpression = session.fromPartition(partition);
  sessionDImpression.webRequest.onBeforeRequest((details, repondre) => {
    repondre({ cancel: !(details.url.startsWith('file://') && details.url.endsWith('/page.html')) && !details.url.startsWith('data:') });
  });
  sessionDImpression.setPermissionRequestHandler((_contenu, _permission, repondre) => repondre(false));
}

/**
 * Imprime en PDF le document HTML autonome d'une page (README §9), dans une
 * fenêtre cachée, sans script ni accès au réseau : le HTML vient du rendu de
 * l'application, mais son texte vient des fichiers de l'utilisateur.
 *
 * Le fichier passe par un dossier temporaire plutôt que par une adresse
 * `data:`, que Chromium limite en taille (images comprises).
 */
export async function imprimerEnPdf(html: string, reglages: PdfSettings): Promise<Uint8Array> {
  preparerSession();
  const dossier = await mkdtemp(join(app.getPath('temp'), 'notes-export-'));
  const fenetre = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, partition, spellcheck: false },
  });
  try {
    fenetre.webContents.on('will-navigate', (evenement) => evenement.preventDefault());
    fenetre.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const fichier = join(dossier, 'page.html');
    await writeFile(fichier, html, 'utf8');
    await fenetre.loadURL(pathToFileURL(fichier).href);
    const marge = millimetres[reglages.marges] / pouce;
    const pdf = await fenetre.webContents.printToPDF({
      pageSize: reglages.papier,
      printBackground: true,
      margins: { top: marge, bottom: (millimetres[reglages.marges] + hauteurDuPied) / pouce, left: marge, right: marge },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: piedDePage(reglages.titre, reglages.marges),
    });
    return new Uint8Array(pdf);
  } finally {
    fenetre.destroy();
    await rm(dossier, { recursive: true, force: true });
  }
}
