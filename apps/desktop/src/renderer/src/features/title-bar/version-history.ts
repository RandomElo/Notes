/*
 * Historique des versions montré au clic sur la version (docs/spec/interface.md) :
 * la frise du README, lue au build. Une entrée par version, la plus récente
 * en premier ; les étapes d'une même version sont réunies.
 */

export interface VersionEntry {
  version: string;
  /** Date de la dernière étape de la version, `AAAA-MM-JJ`. */
  date: string;
  etapes: string[];
}

const ligneDeFrise = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/;

export function versionsDeLaFrise(readme: string): VersionEntry[] {
  const versions = new Map<string, VersionEntry>();
  for (const ligne of readme.split(/\r?\n/)) {
    const trouve = ligneDeFrise.exec(ligne);
    if (trouve === null || trouve[2] === '' || trouve[3] === '') {
      continue;
    }
    const [, date, version, etape] = trouve as unknown as [string, string, string, string];
    const entree = versions.get(version) ?? { version, date, etapes: [] };
    entree.date = date;
    entree.etapes.push(etape.replace(/`/g, ''));
    versions.set(version, entree);
  }
  return [...versions.values()].reverse();
}

/** `12 oct. 2026`. */
export function dateCourte(date: string): string {
  const [annee, mois, jour] = date.split('-').map(Number) as [number, number, number];
  return new Date(annee, mois - 1, jour).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
