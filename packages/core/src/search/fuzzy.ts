/**
 * Recherche floue sur les titres de page (docs/spec/interface.md) : les lettres tapées
 * doivent apparaître dans le titre, dans l'ordre, pas forcément côte à côte.
 * Accents, casse et espaces de la saisie sont ignorés. Les lettres qui se
 * suivent et celles qui ouvrent un mot comptent davantage.
 */

export interface FuzzyMatch {
  score: number;
  /** Position dans le titre d'origine de chaque caractère trouvé, pour le mettre en valeur. */
  positions: number[];
}

export interface RankedResult<T> extends FuzzyMatch {
  element: T;
}

const pointsParLettre = 1;
const bonusDebutDeMot = 8;
const bonusDebutDeTitre = 4;
const bonusLettresQuiSeSuivent = 6;
const penaliteParLettreSautee = 0.5;

const ligatures: Record<string, string> = { œ: 'oe', æ: 'ae', ß: 'ss' };

/** Texte comparable : sans accents, en minuscules. Chaque caractère obtenu garde la position de celui d'où il vient. */
export function normaliserPourRecherche(texte: string): { texte: string; origines: number[] } {
  let resultat = '';
  const origines: number[] = [];
  let position = 0;
  for (const caractere of texte) {
    const minuscule = caractere.toLowerCase();
    const simple = ligatures[minuscule] ?? minuscule.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    for (const morceau of simple) {
      resultat += morceau;
      origines.push(position);
    }
    position += caractere.length;
  }
  return { texte: resultat, origines };
}

const estLettreOuChiffre = (caractere: string | undefined): boolean => caractere !== undefined && /[\p{L}\p{N}]/u.test(caractere);

/**
 * Meilleure façon de retrouver la saisie dans le titre, ou null si une de
 * ses lettres manque. Une saisie vide correspond à tout, avec un score nul.
 */
export function correspondanceFloue(saisie: string, titre: string): FuzzyMatch | null {
  const requete = normaliserPourRecherche(saisie).texte.replace(/\s+/gu, '');
  if (requete === '') {
    return { score: 0, positions: [] };
  }
  const { texte, origines } = normaliserPourRecherche(titre);
  const n = texte.length;
  const m = requete.length;
  if (m > n) {
    return null;
  }

  const valeurDeLaLettre = (i: number): number => {
    let valeur = pointsParLettre;
    if (i === 0) {
      valeur += bonusDebutDeMot + bonusDebutDeTitre;
    } else if (!estLettreOuChiffre(texte[i - 1]) && estLettreOuChiffre(texte[i])) {
      valeur += bonusDebutDeMot;
    }
    return valeur;
  };

  // meilleur[j][i] : meilleur score quand la lettre j de la saisie est prise à la position i du titre.
  // venant[j][i] : position de la lettre j - 1 dans ce meilleur cas, pour retrouver le chemin.
  const meilleur: Float64Array[] = [];
  const venant: Int32Array[] = [];
  for (let j = 0; j < m; j += 1) {
    const ligne = new Float64Array(n).fill(Number.NEGATIVE_INFINITY);
    const origine = new Int32Array(n).fill(-1);
    const precedente = meilleur[j - 1];
    // Meilleur départ possible parmi les positions déjà passées, pénalité des lettres sautées comprise :
    // max sur k de (precedente[k] + penalite × k), à corriger ensuite de penalite × (i - 1).
    let maxEcarte = Number.NEGATIVE_INFINITY;
    let maxEcarteEn = -1;
    for (let i = 0; i < n; i += 1) {
      if (precedente !== undefined && i >= 2) {
        const candidat = (precedente[i - 2] ?? Number.NEGATIVE_INFINITY) + penaliteParLettreSautee * (i - 2);
        if (candidat > maxEcarte) {
          maxEcarte = candidat;
          maxEcarteEn = i - 2;
        }
      }
      if (texte[i] !== requete[j]) {
        continue;
      }
      if (precedente === undefined) {
        ligne[i] = valeurDeLaLettre(i);
        continue;
      }
      const collee = i >= 1 ? (precedente[i - 1] ?? Number.NEGATIVE_INFINITY) + bonusLettresQuiSeSuivent : Number.NEGATIVE_INFINITY;
      const ecartee = maxEcarte - penaliteParLettreSautee * (i - 1);
      if (collee === Number.NEGATIVE_INFINITY && ecartee === Number.NEGATIVE_INFINITY) {
        continue;
      }
      if (collee >= ecartee) {
        ligne[i] = collee + valeurDeLaLettre(i);
        origine[i] = i - 1;
      } else {
        ligne[i] = ecartee + valeurDeLaLettre(i);
        origine[i] = maxEcarteEn;
      }
    }
    meilleur.push(ligne);
    venant.push(origine);
  }

  const derniere = meilleur[m - 1] ?? new Float64Array();
  let fin = -1;
  let scoreFinal = Number.NEGATIVE_INFINITY;
  derniere.forEach((score, i) => {
    if (score > scoreFinal) {
      scoreFinal = score;
      fin = i;
    }
  });
  if (fin < 0) {
    return null;
  }

  const positionsNormalisees: number[] = [];
  for (let j = m - 1, i = fin; j >= 0; j -= 1) {
    positionsNormalisees.unshift(i);
    i = venant[j]?.[i] ?? -1;
  }
  // Une ligature (« œ » pour « oe ») donne deux caractères comparables pour un seul affiché.
  const positions = [...new Set(positionsNormalisees.map((i) => origines[i] ?? 0))];
  return { score: scoreFinal, positions };
}

/**
 * Éléments qui correspondent à la saisie, le meilleur en premier. À score
 * égal, le titre le plus court passe devant, puis l'ordre d'origine.
 */
export function classerParTitre<T>(saisie: string, elements: readonly T[], titreDe: (element: T) => string): RankedResult<T>[] {
  const resultats: (RankedResult<T> & { rang: number })[] = [];
  elements.forEach((element, rang) => {
    const correspondance = correspondanceFloue(saisie, titreDe(element));
    if (correspondance !== null) {
      resultats.push({ ...correspondance, element, rang });
    }
  });
  resultats.sort((a, b) => b.score - a.score || titreDe(a.element).length - titreDe(b.element).length || a.rang - b.rang);
  return resultats.map(({ element, score, positions }) => ({ element, score, positions }));
}
