import { shell } from 'electron';
import type { Session, WebContents } from 'electron';
import { schemaDesImages } from '../../shared/ipc-contract';

const politiqueDeBase = [
  "default-src 'none'",
  // Les images de la page viennent seulement du dossier des notes, par le protocole du main (images/asset-protocol.ts).
  `img-src 'self' data: ${schemaDesImages}:`,
  // Écoute d'un mémo vocal : ses octets sont lus par une adresse blob: créée par la page (README §13).
  'media-src blob:',
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

/** CSP de l'application. En développement, Vite a besoin de scripts en ligne et d'un WebSocket. */
export function politiqueDeContenu(developpement: boolean): string {
  const regles = developpement
    ? ["script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "connect-src 'self' ws://localhost:*"]
    : ["script-src 'self'", "style-src 'self' 'unsafe-inline'", "connect-src 'none'"];
  return [...politiqueDeBase, ...regles].join('; ');
}

/** Applique la CSP à toutes les réponses et refuse toute demande de permission, sauf l'écriture dans le presse-papiers. */
export function durcirSession(session: Session, developpement: boolean): void {
  const politique = politiqueDeContenu(developpement);
  session.webRequest.onHeadersReceived((details, repondre) => {
    repondre({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [politique] } });
  });
  // Seule exception : écrire du texte dans le presse-papiers (bouton « Copier » d'un bloc de code). Jamais le lire.
  session.setPermissionRequestHandler((_contenu, permission, repondre) => repondre(permission === 'clipboard-sanitized-write'));
  session.setPermissionCheckHandler((_contenu, permission) => permission === 'clipboard-sanitized-write');
}

/**
 * Empêche la page de naviguer ailleurs ou d'ouvrir des fenêtres. Les liens
 * http(s) partent dans le navigateur du système, les adresses mailto dans la messagerie.
 */
export function durcirContenu(contenu: WebContents, urlApplication: string): void {
  contenu.on('will-navigate', (evenement, url) => {
    if (!url.startsWith(urlApplication)) {
      evenement.preventDefault();
      ouvrirDansLeNavigateur(url);
    }
  });
  contenu.setWindowOpenHandler(({ url }) => {
    ouvrirDansLeNavigateur(url);
    return { action: 'deny' };
  });
  contenu.on('will-attach-webview', (evenement) => evenement.preventDefault());
}

export function estLienExterneSur(url: string): boolean {
  try {
    const protocole = new URL(url).protocol;
    return protocole === 'https:' || protocole === 'http:' || protocole === 'mailto:';
  } catch {
    return false;
  }
}

function ouvrirDansLeNavigateur(url: string): void {
  if (estLienExterneSur(url)) {
    void shell.openExternal(url);
  }
}
