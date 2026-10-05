import { useSyncExternalStore } from 'react';
import type { IgnoredRemark, SpellcheckState, SpellIssue } from '../../../../shared/ipc-contract';

/**
 * Ce que l'éditeur, la barre de statut et les réglages partagent sur la
 * correction orthographique : l'état venu du main, le dictionnaire personnel,
 * les remarques ignorées, et le nombre de fautes de la page ouverte.
 */
export interface SpellcheckSnapshot {
  etat: SpellcheckState | null;
  dictionnaire: ReadonlySet<string>;
  /** Remarques écartées par « Ignorer », pour toujours (`.notes/spelling-ignored.txt`) : `règle|mot`. */
  ignores: ReadonlySet<string>;
  /** Fautes soulignées dans la page ouverte, null sans page ouverte ou sans correction prête. */
  fautes: number | null;
  /** Change à chaque fois que les fautes soulignées changent, même si leur nombre reste le même. */
  revision: number;
}

let instantane: SpellcheckSnapshot = { etat: null, dictionnaire: new Set(), ignores: new Set(), fautes: null, revision: 0 };
const abonnes = new Set<() => void>();

function changer(modification: Partial<SpellcheckSnapshot>): void {
  instantane = { ...instantane, ...modification };
  for (const abonne of abonnes) {
    abonne();
  }
}

export const magasinDeCorrection = {
  lire: (): SpellcheckSnapshot => instantane,
  abonner: (abonne: () => void): (() => void) => {
    abonnes.add(abonne);
    return () => abonnes.delete(abonne);
  },
  definirEtat: (etat: SpellcheckState): void => changer({ etat }),
  definirDictionnaire: (mots: readonly string[]): void => changer({ dictionnaire: new Set(mots) }),
  /** Masque la remarque tout de suite, avant que le main ne l'ait enregistrée. */
  ignorer: (faute: SpellIssue): void => changer({ ignores: new Set([...instantane.ignores, cleDIgnore(faute)]) }),
  definirIgnores: (remarques: readonly IgnoredRemark[]): void => changer({ ignores: new Set(remarques.map(cleDIgnore)) }),
  /** « modifiees » : les fautes soulignées ne sont plus les mêmes (la liste des fautes est à relire). */
  definirFautes: (fautes: number | null, modifiees = false): void => {
    if (fautes !== instantane.fautes || modifiees) {
      changer({ fautes, revision: instantane.revision + (modifiees ? 1 : 0) });
    }
  },
};

export function useMagasinDeCorrection(): SpellcheckSnapshot {
  return useSyncExternalStore(magasinDeCorrection.abonner, magasinDeCorrection.lire);
}

const cleDIgnore = ({ regle, mot }: { regle: string; mot: string }): string => `${regle}|${mot}`;

/** Vrai si la correction est prête à vérifier. */
export function correctionPrete(snapshot: SpellcheckSnapshot): boolean {
  return snapshot.etat?.installation === 'installee' && snapshot.etat.serveur === 'pret';
}

/**
 * Vrai si une faute reste à montrer : pas ignorée, et pour l'orthographe, mot
 * absent du dictionnaire. Un mot du dictionnaire écrit en minuscules vaut aussi
 * avec une majuscule (début de phrase).
 */
export function fauteAMontrer(faute: SpellIssue, { dictionnaire, ignores }: Pick<SpellcheckSnapshot, 'dictionnaire' | 'ignores'>): boolean {
  if (ignores.has(cleDIgnore(faute))) {
    return false;
  }
  if (faute.nature !== 'orthographe') {
    return true;
  }
  const minuscule = faute.mot.charAt(0).toLowerCase() + faute.mot.slice(1);
  return !dictionnaire.has(faute.mot) && !dictionnaire.has(minuscule);
}
