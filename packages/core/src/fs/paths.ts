/**
 * Chemins relatifs à la racine du vault ou du partage : segments séparés par
 * « / », jamais absolus. Les mêmes règles sont appliquées par le binaire
 * compagnon (apps/smb-companion/internal/smbfs/paths.go).
 */

// Caractères refusés par SMB dans un nom, plus les caractères de contrôle.
// eslint-disable-next-line no-control-regex
const caracteresInterdits = /[\\:*?"<>|\u0000-\u001f]/;

/** Renvoie la raison du refus, ou null si le chemin est acceptable. */
export function verifierCheminRelatif(chemin: string): string | null {
  if (chemin === '') {
    return 'Le chemin est vide.';
  }
  if (caracteresInterdits.test(chemin)) {
    return 'Le chemin contient un caractère interdit (\\ : * ? " < > |).';
  }
  if (chemin.startsWith('/') || chemin.endsWith('/')) {
    return 'Le chemin ne commence ni ne finit par « / ».';
  }
  for (const segment of chemin.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      return 'Le chemin contient un segment vide, « . » ou « .. ».';
    }
    if (/[ .]$/.test(segment)) {
      return 'Un nom ne finit ni par un point ni par une espace.';
    }
  }
  return null;
}

/** Assemble des morceaux de chemin en ignorant les morceaux vides. */
export function joindreChemins(...morceaux: string[]): string {
  return morceaux.filter((morceau) => morceau !== '').join('/');
}

/** Dossier parent d'un chemin, vide pour un élément à la racine. */
export function dossierParent(chemin: string): string {
  const coupure = chemin.lastIndexOf('/');
  return coupure === -1 ? '' : chemin.slice(0, coupure);
}

/** Dernier segment d'un chemin. */
export function nomDeBase(chemin: string): string {
  return chemin.slice(chemin.lastIndexOf('/') + 1);
}

/** Vrai si « chemin » est « ancetre » lui-même ou se trouve dedans. */
export function estDansDossier(chemin: string, ancetre: string): boolean {
  return ancetre === '' || chemin === ancetre || chemin.startsWith(`${ancetre}/`);
}
