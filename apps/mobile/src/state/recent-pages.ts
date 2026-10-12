import type { TreeNode } from '@notes/core';
import { pagesAplaties } from './pages';
import type { PageListee } from './pages';

/** Pages récentes de l'accueil (choix d'Eloi, 2026-10-11) : les 10 dernières modifiées sur le NAS, par le PC ou le téléphone. */
export const nombreDePagesRecentes = 10;

export interface PageRecente extends PageListee {
  modifieLe: number;
}

/** Les pages les plus récemment modifiées, la plus récente en tête. Une page sans date (pas encore copiée, en attente) n'y est pas. */
export function pagesRecentes(arbre: readonly TreeNode[], dates: ReadonlyMap<string, number>, nombre = nombreDePagesRecentes): PageRecente[] {
  return pagesAplaties(arbre)
    .flatMap((page): PageRecente[] => {
      const modifieLe = page.noeud.genre === 'page' ? dates.get(page.noeud.chemin) : undefined;
      return modifieLe === undefined ? [] : [{ ...page, modifieLe }];
    })
    .sort((a, b) => b.modifieLe - a.modifieLe)
    .slice(0, nombre);
}

/** « à l'instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 3 jours », puis la date. */
export function depuisQuand(date: number, maintenant: number): string {
  const minutes = Math.floor((maintenant - date) / 60_000);
  if (minutes < 1) {
    return 'à l’instant';
  }
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  const heures = Math.floor(minutes / 60);
  if (heures < 24) {
    return `il y a ${heures} h`;
  }
  const jour = (moment: number): number => {
    const d = new Date(moment);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const jours = jour(maintenant) - jour(date);
  if (jours <= 1) {
    return 'hier';
  }
  if (jours < 7) {
    return `il y a ${jours} jours`;
  }
  const d = new Date(date);
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...(d.getFullYear() === new Date(maintenant).getFullYear() ? {} : { year: 'numeric' }) })}`;
}
