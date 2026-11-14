/**
 * Lecture d'un fichier CSV de l'export Notion (une base de données) : virgules,
 * valeurs entre guillemets (guillemet doublé à l'intérieur), sauts de ligne
 * dans une valeur, BOM en tête. Les lignes vides sont retirées.
 */
export function lireCsv(texte: string): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let valeur = '';
  let entreGuillemets = false;
  const source = texte.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const caractere = source[index]!;
    if (entreGuillemets) {
      if (caractere === '"' && source[index + 1] === '"') {
        valeur += '"';
        index++;
      } else if (caractere === '"') {
        entreGuillemets = false;
      } else {
        valeur += caractere;
      }
    } else if (caractere === '"') {
      entreGuillemets = true;
    } else if (caractere === ',') {
      ligne.push(valeur);
      valeur = '';
    } else if (caractere === '\n' || caractere === '\r') {
      if (caractere === '\r' && source[index + 1] === '\n') {
        index++;
      }
      ligne.push(valeur);
      lignes.push(ligne);
      ligne = [];
      valeur = '';
    } else {
      valeur += caractere;
    }
  }
  if (valeur !== '' || ligne.length > 0) {
    ligne.push(valeur);
    lignes.push(ligne);
  }
  return lignes.filter((cellules) => cellules.some((cellule) => cellule.trim() !== ''));
}
