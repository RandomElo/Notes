import { shell } from 'electron';
import type { Session, WebContents } from 'electron';

const politiqueDeBase = [
  "default-src 'none'",
  "img-src 'self' data:",
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

/** Applique la CSP à toutes les réponses et refuse toute demande de permission. */
export function durcirSession(session: Session, developpement: boolean): void {
  const politique = politiqueDeContenu(developpement);
  session.webRequest.onHeadersReceived((details, repondre) => {
    repondre({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [politique] } });
  });
  session.setPermissionRequestHandler((_contenu, _permission, repondre) => repondre(false));
  session.setPermissionCheckHandler(() => false);
}

/**
 * Empêche la page de naviguer ailleurs ou d'ouvrir des fenêtres. Les liens
 * http(s) partent dans le navigateur du système.
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
    return protocole === 'https:' || protocole === 'http:';
  } catch {
    return false;
  }
}

function ouvrirDansLeNavigateur(url: string): void {
  if (estLienExterneSur(url)) {
    void shell.openExternal(url);
  }
}
