import type { BaseConfig, BaseField, BaseRow } from '@notes/core';
import { texteDeCellule } from '@notes/document';
import type { TableRow } from '@notes/document';

/*
 * Passage d'une base d'un mode à l'autre (docs/spec/base-de-donnees.md, « Base sans pages ») : une sous-page dont
 * le texte tient dans une cellule devient une ligne du tableau, son texte dans « Description » ; une autre reste
 * une page. Dans l'autre sens, chaque ligne devient une sous-page, sa Description devient son texte.
 */

/** Nom du champ qui reçoit le texte des sous-pages. */
export const nomDeDescription = 'Description';

/** Le champ « Description » à utiliser : celui qui existe s'il est en texte, sinon un nom libre. */
export function champDeDescription(config: BaseConfig): string {
  let nom = nomDeDescription;
  for (let rang = 2; config.champs.some((champ) => champ.nom === nom && champ.type !== 'texte'); rang += 1) {
    nom = `${nomDeDescription} ${rang}`;
  }
  return nom;
}

/** La configuration avec le champ de description, ajouté à la fin s'il n'existe pas. */
export function avecDescription(config: BaseConfig, nom: string): BaseConfig {
  return config.champs.some((champ) => champ.nom === nom) ? config : { ...config, champs: [...config.champs, { nom, type: 'texte' } satisfies BaseField] };
}

export interface ConversionVersTableau {
  /** Lignes de premier niveau qui passent dans le tableau, avec leur sous-page (à mettre à la corbeille ensuite). */
  converties: { chemin: string; ligne: TableRow }[];
  /** Titres des lignes de premier niveau qui restent des pages : leur texte, ou celui d'une sous-ligne, ne tient pas dans une cellule. */
  restent: string[];
}

/**
 * Ce que devient chaque ligne d'une base à pages qui passe sans pages. « lireCorps » rend le corps d'une
 * sous-page, ou null s'il n'a pas pu être lu (elle reste alors une page). Une ligne ne passe que si elle et
 * toutes ses sous-lignes passent : une sous-page qui reste garde ainsi sa page parente.
 */
export async function analyserVersTableau(lignes: readonly BaseRow[], description: string, lireCorps: (chemin: string) => Promise<string | null>): Promise<ConversionVersTableau> {
  const convertir = async (ligne: BaseRow): Promise<TableRow | null> => {
    const corps = await lireCorps(ligne.chemin);
    const texte = corps === null ? null : texteDeCellule(corps);
    const enfants = await Promise.all(ligne.enfants.map(convertir));
    if (texte === null || enfants.some((enfant) => enfant === null)) {
      return null;
    }
    return { titre: ligne.titre, valeurs: { ...ligne.valeurs, ...(texte === '' ? {} : { [description]: texte }) }, enfants: enfants as TableRow[] };
  };
  const resultat: ConversionVersTableau = { converties: [], restent: [] };
  for (const ligne of lignes) {
    const convertie = await convertir(ligne);
    if (convertie === null) {
      resultat.restent.push(ligne.titre);
    } else {
      resultat.converties.push({ chemin: ligne.chemin, ligne: convertie });
    }
  }
  return resultat;
}

/** Nombre de lignes, sous-lignes comprises. */
export function compterLignes(lignes: readonly { enfants: readonly unknown[] }[]): number {
  return lignes.reduce((total, ligne) => total + 1 + compterLignes(ligne.enfants as { enfants: readonly unknown[] }[]), 0);
}
