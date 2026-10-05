import type { AiFunction, AiRun } from './usage';

/**
 * Ce qu'on tire de l'historique des appels IA : dépenses par période et
 * calage des estimations. Les périodes suivent l'heure locale du poste.
 */

export type UsagePeriod = 'jour' | 'semaine' | 'mois' | 'annee';

export interface UsageBucket {
  /** Début de la période, en millisecondes. */
  debut: number;
  appels: number;
  entree: number;
  sortie: number;
  /** Dépense en dollars (appels à une API externe seulement). */
  coutUsd: number;
}

/** Début de la période qui contient l'instant donné (lundi pour une semaine). */
export function debutDePeriode(instant: number, periode: UsagePeriod): number {
  const date = new Date(instant);
  date.setHours(0, 0, 0, 0);
  if (periode === 'semaine') {
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  } else if (periode === 'mois') {
    date.setDate(1);
  } else if (periode === 'annee') {
    date.setMonth(0, 1);
  }
  return date.getTime();
}

/** Début de la période précédente. */
function periodePrecedente(debut: number, periode: UsagePeriod): number {
  const date = new Date(debut);
  if (periode === 'jour') {
    date.setDate(date.getDate() - 1);
  } else if (periode === 'semaine') {
    date.setDate(date.getDate() - 7);
  } else if (periode === 'mois') {
    date.setMonth(date.getMonth() - 1);
  } else {
    date.setFullYear(date.getFullYear() - 1);
  }
  return date.getTime();
}

/** Les `nombre` dernières périodes jusqu'à celle de `maintenant`, la plus ancienne d'abord, vides comprises. */
export function totauxParPeriode(appels: readonly AiRun[], periode: UsagePeriod, maintenant: number, nombre: number): UsageBucket[] {
  const debuts: number[] = [debutDePeriode(maintenant, periode)];
  while (debuts.length < nombre) {
    debuts.unshift(periodePrecedente(debuts[0]!, periode));
  }
  const totaux = new Map<number, UsageBucket>(debuts.map((debut) => [debut, { debut, appels: 0, entree: 0, sortie: 0, coutUsd: 0 }]));
  for (const appel of appels) {
    const total = totaux.get(debutDePeriode(appel.date, periode));
    if (total !== undefined) {
      total.appels += 1;
      total.entree += appel.entree;
      total.sortie += appel.sortie;
      total.coutUsd += appel.coutUsd ?? 0;
    }
  }
  return debuts.map((debut) => totaux.get(debut)!);
}

/** Dépense en dollars de la période en cours (jour, mois…). */
export function depenseDeLaPeriode(appels: readonly AiRun[], periode: UsagePeriod, maintenant: number): number {
  return totauxParPeriode(appels, periode, maintenant, 1)[0]!.coutUsd;
}

/** Combien de tokens de sortie pour un token d'entrée, avant tout historique. */
export const ratioDeSortieParDefaut: Record<AiFunction, number> = {
  relecture: 1.05,
  'mise-au-propre': 1.8,
  memo: 1.2,
};

/** Nombre d'appels récents pris en compte pour caler une estimation. */
const appelsPourCaler = 10;

function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) {
    return null;
  }
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1 ? triees[milieu]! : (triees[milieu - 1]! + triees[milieu]!) / 2;
}

/** Les derniers appels menés à leur terme, du même modèle si possible. */
function appelsComparables(appels: readonly AiRun[], filtre: (appel: AiRun) => boolean): AiRun[] {
  return appels.filter((appel) => !appel.annule && appel.entree > 0 && filtre(appel)).slice(-appelsPourCaler);
}

export interface Calibration {
  /** Tokens de sortie par token d'entrée. */
  ratioDeSortie: number;
  /** Tokens réellement comptés par le fournisseur pour un token compté par Notes. */
  facteurDEntree: number;
  /** Durée par token de sortie, null tant qu'aucun appel de ce modèle n'est connu. */
  msParTokenDeSortie: number | null;
  /** Nombre d'appels sur lesquels repose le ratio de sortie. */
  appelsConnus: number;
}

/**
 * Calage d'une estimation sur les derniers appels : même fonction et même
 * modèle d'abord, sinon même fonction, sinon la valeur par défaut.
 */
export function calibrer(appels: readonly AiRun[], fonction: AiFunction, modele: string): Calibration {
  const memeModele = appelsComparables(appels, (appel) => appel.modele === modele);
  const memeFonctionEtModele = memeModele.filter((appel) => appel.fonction === fonction);
  const memeFonction = appelsComparables(appels, (appel) => appel.fonction === fonction);
  const pourLeRatio = memeFonctionEtModele.length > 0 ? memeFonctionEtModele : memeFonction;
  const ratio = mediane(pourLeRatio.map((appel) => appel.sortie / appel.entree));
  const facteur = mediane(memeModele.filter((appel) => appel.estimation.entreeComptee > 0).map((appel) => appel.entree / appel.estimation.entreeComptee));
  const vitesse = mediane(memeModele.filter((appel) => appel.sortie > 0).map((appel) => appel.dureeMs / appel.sortie));
  return {
    ratioDeSortie: ratio ?? ratioDeSortieParDefaut[fonction],
    facteurDEntree: facteur ?? 1,
    msParTokenDeSortie: vitesse,
    appelsConnus: pourLeRatio.length,
  };
}
