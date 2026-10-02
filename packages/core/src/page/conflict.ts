import { fichierPage } from './types';

const prefixe = 'page.conflit-';

/**
 * Nom de la sauvegarde d'une version qui allait être écrasée (README §5) :
 * `page.conflit-2026-10-02-141503.md`, à l'heure du poste. Pas de deux-points,
 * que SMB refuse. « dejaPris » évite d'écraser une sauvegarde de la même seconde.
 */
export function nomDuFichierDeConflit(date: Date, dejaPris: readonly string[] = []): string {
  const deux = (nombre: number): string => String(nombre).padStart(2, '0');
  const jour = `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
  const heure = `${deux(date.getHours())}${deux(date.getMinutes())}${deux(date.getSeconds())}`;
  const base = `${prefixe}${jour}-${heure}`;
  let nom = `${base}.md`;
  for (let numero = 2; dejaPris.includes(nom); numero++) {
    nom = `${base}-${numero}.md`;
  }
  return nom;
}

/** Vrai pour une sauvegarde de conflit : ce n'est pas une page, elle ne paraît pas dans l'arborescence. */
export function estFichierDeConflit(nom: string): boolean {
  return nom.startsWith(prefixe) && nom.endsWith('.md') && nom !== fichierPage;
}
