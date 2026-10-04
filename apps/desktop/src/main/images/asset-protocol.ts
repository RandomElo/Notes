import { aUneExtensionDImage, natureDImage, tailleMaxDImage, verifierCheminRelatif } from '@notes/core';
import type { ImageKind, LocalFs } from '@notes/core';
import { protocol } from 'electron';
import { schemaDesImages } from '../../shared/ipc-contract';

const typesMime: Record<ImageKind, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

/** À appeler avant que l'application soit prête : le schéma se comporte comme une adresse web ordinaire et sûre. */
export function declarerSchemaDesImages(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: schemaDesImages, privileges: { standard: true, secure: true } }]);
}

/**
 * Réponse à une demande d'image de la page : `notes-asset://vault/<chemin>`.
 * Seuls les fichiers d'image du dossier des notes sont servis, vérifiés par
 * leurs premiers octets. Tout le reste reçoit un 404, sans dire pourquoi.
 */
export async function repondreImage(adresse: string, fs: LocalFs | null): Promise<Response> {
  const introuvable = new Response(null, { status: 404 });
  let chemin: string;
  try {
    const url = new URL(adresse);
    if (url.protocol !== `${schemaDesImages}:` || url.hostname !== 'vault' || url.search !== '' || url.username !== '' || url.port !== '') {
      return introuvable;
    }
    chemin = url.pathname
      .slice(1)
      .split('/')
      .map((morceau) => decodeURIComponent(morceau))
      .join('/');
  } catch {
    return introuvable;
  }
  const image = await lireImageDuVault(chemin, fs);
  if (image === null) {
    return introuvable;
  }
  return new Response(image.octets, {
    headers: {
      'Content-Type': image.type,
      // Un SVG ouvert seul n'exécute rien et ne charge rien.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      // L'image peut changer sur le disque (sync) : pas de cache.
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Une image du dossier des notes (chemin relatif à lui) avec sa nature, vérifiée
 * par ses premiers octets, ou null pour tout ce qui n'en est pas une. Sert le
 * protocole des images et l'export (images mises dans le fichier exporté).
 */
export async function lireImageDuVault(chemin: string, fs: LocalFs | null): Promise<{ octets: Uint8Array; type: string } | null> {
  if (fs === null || verifierCheminRelatif(chemin) !== null || !aUneExtensionDImage(chemin)) {
    return null;
  }
  try {
    const infos = await fs.infos(chemin);
    if (infos === null || infos.estDossier || infos.taille > tailleMaxDImage) {
      return null;
    }
    const octets = await fs.lireOctets(chemin);
    const nature = natureDImage(octets);
    return nature === null ? null : { octets, type: typesMime[nature] };
  } catch {
    return null;
  }
}

/** Sert les images du dossier des notes ouvert, une fois l'application prête. */
export function servirLesImages(fs: () => LocalFs | null): void {
  protocol.handle(schemaDesImages, (requete) => repondreImage(requete.url, fs()));
}
