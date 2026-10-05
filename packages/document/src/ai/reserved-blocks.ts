/**
 * Blocs que le modèle ne voit pas (README §12) : blocs de code, callouts (bloc
 * fencé `notes-callout`) et images seules sur leur ligne. Ils partent au
 * modèle sous la forme d'un repère `[[BLOC-n]]`, qu'on remplace au retour par
 * le texte d'origine, octet pour octet : le modèle ne peut ni les abîmer ni
 * les perdre.
 */

export interface PreparedText {
  /** Ce qui part au modèle. */
  texte: string;
  /** Texte d'origine de chaque bloc mis de côté, dans l'ordre des repères. */
  reserves: string[];
}

export interface RestoredText {
  texte: string;
  /** Repères que le modèle a omis : leur bloc est remis à la fin de la page. */
  remisALaFin: number;
}

export const repere = (numero: number): string => `[[BLOC-${numero}]]`;
const motifDeRepere = /\[\[BLOC-(\d+)\]\]/g;

/** Ouverture d'un bloc fencé : au plus trois espaces, trois ` ou ~ au moins. */
export function ouvertureDeFence(ligne: string): { marque: string; longueur: number } | null {
  const trouve = /^ {0,3}(`{3,}|~{3,})/.exec(ligne);
  if (trouve === null) {
    return null;
  }
  const marque = trouve[1]!;
  // Une info de bloc ` ne peut pas contenir de ` (CommonMark).
  if (marque.startsWith('`') && ligne.slice(trouve[0].length).includes('`')) {
    return null;
  }
  return { marque: marque[0]!, longueur: marque.length };
}

export function fermeLeFence(ligne: string, ouverture: { marque: string; longueur: number }): boolean {
  const trouve = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(ligne);
  return trouve !== null && trouve[1]![0] === ouverture.marque && trouve[1]!.length >= ouverture.longueur;
}

const imageSeule = /^!\[[^\]\n]*\]\([^)\n]+\)\s*$/;

/**
 * Découpe un texte Markdown en morceaux, chacun marqué comme bloc fencé ou
 * non. Un fence jamais fermé va jusqu'à la fin, comme en CommonMark.
 */
export function decouperFences(texte: string): Array<{ fence: boolean; lignes: string[] }> {
  const morceaux: Array<{ fence: boolean; lignes: string[] }> = [];
  const lignes = texte.split('\n');
  let courant: { fence: boolean; lignes: string[] } | null = null;
  let ouverture: { marque: string; longueur: number } | null = null;
  for (const ligne of lignes) {
    if (ouverture !== null) {
      courant!.lignes.push(ligne);
      if (fermeLeFence(ligne, ouverture)) {
        ouverture = null;
        courant = null;
      }
      continue;
    }
    const debut = ouvertureDeFence(ligne);
    if (debut !== null) {
      ouverture = debut;
      courant = { fence: true, lignes: [ligne] };
      morceaux.push(courant);
      continue;
    }
    if (courant === null || courant.fence) {
      courant = { fence: false, lignes: [] };
      morceaux.push(courant);
    }
    courant.lignes.push(ligne);
  }
  return morceaux;
}

/** Remplace les blocs réservés par leurs repères. */
export function mettreDeCote(markdown: string): PreparedText {
  const reserves: string[] = [];
  const sortie: string[] = [];
  for (const morceau of decouperFences(markdown)) {
    if (morceau.fence) {
      reserves.push(morceau.lignes.join('\n'));
      sortie.push(repere(reserves.length));
      continue;
    }
    for (const ligne of morceau.lignes) {
      if (imageSeule.test(ligne)) {
        reserves.push(ligne.trimEnd());
        sortie.push(repere(reserves.length));
      } else {
        sortie.push(ligne);
      }
    }
  }
  return { texte: sortie.join('\n'), reserves };
}

/**
 * Remet chaque bloc à la place de son repère. Un repère seul sur sa ligne
 * (même entouré de gras ou d'une puce ajoutés par le modèle) devient le bloc ;
 * un repère au milieu d'une phrase en est retiré, et le bloc vient après la
 * ligne. Un bloc dont le repère a disparu est remis à la fin : rien ne se perd.
 */
export function remettreEnPlace(texte: string, reserves: readonly string[]): RestoredText {
  const places = new Set<number>();
  const lignes: string[] = [];
  const reserve = (numero: number): string | null => {
    const bloc = reserves[numero - 1];
    if (bloc === undefined || places.has(numero)) {
      return null;
    }
    places.add(numero);
    return bloc;
  };
  for (const ligne of texte.split('\n')) {
    const numeros = [...ligne.matchAll(motifDeRepere)].map((trouve) => Number(trouve[1]));
    if (numeros.length === 0) {
      lignes.push(ligne);
      continue;
    }
    const reste = ligne.replace(motifDeRepere, '').replace(/^\s*(?:[-*+]|\d+[.)])?\s*/, '').replace(/[*_`\s]/g, '');
    const blocs = numeros.map(reserve).filter((bloc): bloc is string => bloc !== null);
    if (reste === '') {
      // Lignes vides autour : une image collée à un paragraphe en ferait partie. Les doublons sont retirés au nettoyage.
      lignes.push(...blocs.flatMap((bloc) => ['', bloc, '']));
    } else {
      lignes.push(ligne.replace(motifDeRepere, '').replace(/ {2,}/g, ' ').trimEnd(), ...blocs.flatMap((bloc) => ['', bloc, '']));
    }
  }
  const oublies = reserves.map((_, rang) => rang + 1).filter((numero) => !places.has(numero));
  let resultat = lignes.join('\n');
  if (oublies.length > 0) {
    resultat = `${resultat.trimEnd()}\n\n${oublies.map((numero) => reserves[numero - 1]).join('\n\n')}\n`;
  }
  return { texte: resultat, remisALaFin: oublies.length };
}
