import { fichierPage } from './types';

const prefixe = 'page.conflit-';

/**
 * Nom de la sauvegarde d'une version qui allait être écrasée (README §5) :
 * `page.conflit-2026-10-02-141503.md`, à l'heure du poste. Pas de deux-points,
 * que SMB refuse. « dejaPris » évite d'écraser une sauvegarde de la même seconde.
 */
export function nomDuFichierDeConflit(date: Date, dejaPris: readonly string[] = []): string {
  return nomLibreDeConflit('page', '.md', date, dejaPris);
}

/**
 * `base.conflit-AAAA-MM-JJ-HHMMSS[-n]extension`, premier nom absent de « dejaPris ».
 * Sert aux pages comme aux autres fichiers synchronisés (voir sync/conflict.ts).
 */
export function nomLibreDeConflit(base: string, extension: string, date: Date, dejaPris: readonly string[]): string {
  const deux = (nombre: number): string => String(nombre).padStart(2, '0');
  const jour = `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
  const heure = `${deux(date.getHours())}${deux(date.getMinutes())}${deux(date.getSeconds())}`;
  const debut = `${base}.conflit-${jour}-${heure}`;
  let nom = `${debut}${extension}`;
  for (let numero = 2; dejaPris.includes(nom); numero++) {
    nom = `${debut}-${numero}${extension}`;
  }
  return nom;
}

/** Vrai pour une sauvegarde de conflit : ce n'est pas une page, elle ne paraît pas dans l'arborescence. */
export function estFichierDeConflit(nom: string): boolean {
  return nom.startsWith(prefixe) && nom.endsWith('.md') && nom !== fichierPage;
}
