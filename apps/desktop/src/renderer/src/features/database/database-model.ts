import { couleurDuChoix, largeurMaxDeColonne, largeurMinDeColonne, maxChoix, nomDeChoixValide } from '@notes/core';
import type { BaseChoiceColor, BaseConfig, BaseField, BaseFieldType, BaseSort } from '@notes/core';
import type { DatabaseState } from '@notes/ui';
import { couleurDuTheme } from '@notes/ui';

/** Libellés des types de champ, dans l'ordre du choix. */
export const typesDeChamp: { type: BaseFieldType; libelle: string }[] = [
  { type: 'etat', libelle: 'État' },
  { type: 'choix', libelle: 'Choix' },
  { type: 'texte', libelle: 'Texte' },
  { type: 'case', libelle: 'Case à cocher' },
  { type: 'nombre', libelle: 'Nombre' },
  { type: 'courriel', libelle: 'Courriel' },
];

/** Clic sur l'en-tête d'une colonne : croissant, puis décroissant, puis plus de tri. Une autre colonne repart en croissant. */
export function triSuivant(actuel: BaseSort | null, champ: string): BaseSort | null {
  if (actuel?.champ !== champ) {
    return { champ, sens: 'croissant' };
  }
  return actuel.sens === 'croissant' ? { champ, sens: 'decroissant' } : null;
}

/** Couleur CSS d'un état d'après la liste du thème ; un état qui n'y est pas (écrit à la main) est gris. */
export function couleurDEtat(etats: readonly DatabaseState[], nom: string): string {
  const trouve = etats.find((etat) => etat.name === nom);
  return couleurDuTheme(trouve?.color ?? 'muted');
}

/** Libellés des couleurs d'un choix, dans l'ordre de la palette. */
export const couleursDeChoixLibellees: { couleur: BaseChoiceColor; libelle: string }[] = [
  { couleur: 'accent', libelle: 'Bleu' },
  { couleur: 'success', libelle: 'Vert' },
  { couleur: 'warning', libelle: 'Orange' },
  { couleur: 'error', libelle: 'Rouge' },
  { couleur: 'muted', libelle: 'Gris' },
];

/** Couleur CSS d'une valeur d'un champ « choix » ; une valeur hors de la liste (écrite à la main) est grise. */
export function couleurDeChoix(champ: BaseField, valeur: string): string {
  return couleurDuTheme(couleurDuChoix(champ, valeur) ?? 'muted');
}

/** La configuration où un champ « choix » reçoit une liste de choix changée. */
export function avecChoix(config: BaseConfig, nom: string, changer: (choix: NonNullable<BaseField['choix']>) => NonNullable<BaseField['choix']>): BaseConfig {
  return { ...config, champs: config.champs.map((champ) => (champ.nom === nom ? { ...champ, choix: changer(champ.choix ?? []) } : champ)) };
}

/** La configuration avec la couleur d'un choix réglée (null : celle de sa place dans la liste). */
export function avecCouleurDeChoix(config: BaseConfig, nom: string, choix: string, couleur: BaseChoiceColor | null): BaseConfig {
  return avecChoix(config, nom, (liste) => liste.map((candidat) => (candidat.nom === choix ? { ...candidat, couleur } : candidat)));
}

/** La configuration où un choix monte (-1) ou descend (+1) d'une place : c'est l'ordre du tri. */
export function avecChoixDeplace(config: BaseConfig, nom: string, choix: string, pas: -1 | 1): BaseConfig {
  return avecChoix(config, nom, (liste) => {
    const rang = liste.findIndex((candidat) => candidat.nom === choix);
    const cible = rang + pas;
    if (rang === -1 || cible < 0 || cible >= liste.length) {
      return liste;
    }
    const copie = [...liste];
    [copie[rang], copie[cible]] = [copie[cible]!, copie[rang]!];
    return copie;
  });
}

/** La configuration avec un choix de plus, à la fin. Inchangée si le nom n'est pas possible ou existe déjà. */
export function avecNouveauChoix(config: BaseConfig, nom: string, choix: string): BaseConfig {
  const propre = choix.trim();
  return avecChoix(config, nom, (liste) => (!nomDeChoixValide(propre) || liste.length >= maxChoix || liste.some((candidat) => candidat.nom === propre) ? liste : [...liste, { nom: propre, couleur: null }]));
}

/** La configuration avec un champ de plus, à la fin. */
export function avecChamp(config: BaseConfig, nom: string, type: BaseFieldType): BaseConfig {
  return { ...config, champs: [...config.champs, { nom: nom.trim(), type }] };
}

/** La configuration sans un champ (le tri tombe s'il portait sur lui). Les valeurs restent dans les lignes : rien n'est perdu. */
export function sansChamp(config: BaseConfig, nom: string): BaseConfig {
  const { [nom]: _largeur, ...largeurs } = config.largeurs;
  return { ...config, champs: config.champs.filter((champ) => champ.nom !== nom), tri: config.tri?.champ === nom ? null : config.tri, largeurs };
}

/** Largeur d'une colonne de champ sans largeur réglée, en pixels. La colonne « Page » prend la place qui reste. */
export function largeurParDefaut(type: BaseFieldType): number {
  return type === 'case' ? 90 : type === 'texte' || type === 'courriel' ? 200 : 140;
}

/** La configuration où un champ est renommé : le tri et la largeur suivent (comme `renommerChampDeBase` du core). */
export function avecChampRenomme(config: BaseConfig, ancien: string, nouveau: string): BaseConfig {
  return {
    ...config,
    champs: config.champs.map((champ) => (champ.nom === ancien ? { ...champ, nom: nouveau } : champ)),
    tri: config.tri?.champ === ancien ? { ...config.tri, champ: nouveau } : config.tri,
    largeurs: Object.fromEntries(Object.entries(config.largeurs).map(([colonne, largeur]) => [colonne === ancien ? nouveau : colonne, largeur])),
  };
}

/** La configuration où un champ monte (-1) ou descend (+1) d'une place : c'est l'ordre des colonnes. */
export function avecChampDeplace(config: BaseConfig, nom: string, pas: -1 | 1): BaseConfig {
  const rang = config.champs.findIndex((champ) => champ.nom === nom);
  const cible = rang + pas;
  if (rang === -1 || cible < 0 || cible >= config.champs.length) {
    return config;
  }
  const champs = [...config.champs];
  [champs[rang], champs[cible]] = [champs[cible]!, champs[rang]!];
  return { ...config, champs };
}

/** La configuration avec la largeur d'une colonne, ramenée dans ses bornes. */
export function avecLargeur(config: BaseConfig, colonne: string, largeur: number): BaseConfig {
  return { ...config, largeurs: { ...config.largeurs, [colonne]: Math.round(Math.min(largeurMaxDeColonne, Math.max(largeurMinDeColonne, largeur))) } };
}

/**
 * La configuration où un champ change de type. Les valeurs écrites restent telles quelles dans les lignes.
 * Un champ qui devient « choix » prend pour liste les valeurs déjà écrites (« valeurs », dans l'ordre des lignes).
 */
export function avecType(config: BaseConfig, nom: string, type: BaseFieldType, valeurs: readonly string[] = []): BaseConfig {
  return {
    ...config,
    champs: config.champs.map((champ) => {
      if (champ.nom !== nom) {
        return champ;
      }
      if (type !== 'choix') {
        const { choix: _choix, ...sansChoix } = champ;
        return { ...sansChoix, type };
      }
      const existants = [...new Set(valeurs.map((valeur) => valeur.trim()))].filter(nomDeChoixValide).slice(0, maxChoix);
      return { ...champ, type, choix: champ.choix ?? existants.map((choix) => ({ nom: choix, couleur: null })) };
    }),
  };
}

/** Le champ que la case d'une base en liste coche : le premier champ « case à cocher », sinon le premier champ « état ». */
export function champDeLaCase(config: BaseConfig): BaseField | null {
  return config.champs.find((champ) => champ.type === 'case') ?? config.champs.find((champ) => champ.type === 'etat') ?? null;
}

/** Une ligne est cochée : case cochée, ou, pour un champ « état », dans le dernier état de la liste. */
export function ligneCochee(champ: BaseField, valeur: string, etats: readonly DatabaseState[]): boolean {
  return champ.type === 'case' ? valeur === 'true' : etats.length > 0 && valeur === etats[etats.length - 1]!.name;
}

/** La valeur à écrire pour cocher ou décocher : « true » ou rien, ou le dernier état de la liste ou le premier. */
export function valeurDeLaCase(champ: BaseField, coche: boolean, etats: readonly DatabaseState[]): string {
  if (champ.type === 'case') {
    return String(coche);
  }
  const etat = coche ? etats[etats.length - 1] : etats[0];
  return etat?.name ?? '';
}
