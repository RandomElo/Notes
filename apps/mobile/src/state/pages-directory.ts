import type { TitleEntry } from '@notes/core';
import type { MentionedPage, PagesDirectory } from '@notes/ui';

/** Annuaire des pages pour les mentions : titre et icône du moment. Un nouvel annuaire à chaque changement de l'arborescence. */
export function annuaireDesPages(titres: ReadonlyMap<string, TitleEntry>): PagesDirectory {
  const pages = new Map<string, MentionedPage>([...titres].map(([id, { titre, icone, chemin }]) => [id, { titre, icone, chemin }]));
  return { lire: (id) => pages.get(id) ?? null, abonner: () => () => undefined };
}

/** Hôte d'une adresse web, pour retrouver sa favicon gardée dans `.notes/favicons/`. */
export function hoteDe(adresse: string): string | null {
  return /^https?:\/\/([^/:?#@]+)/i.exec(adresse)?.[1] ?? null;
}
