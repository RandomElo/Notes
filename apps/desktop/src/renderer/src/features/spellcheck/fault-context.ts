/** Une faute dans sa phrase, pour la liste des fautes de la page. */
export interface FaultContext {
  avant: string;
  mot: string;
  apres: string;
  /** La phrase a été coupée avant ou après : on l'affiche avec « … ». */
  coupeAvant: boolean;
  coupeApres: boolean;
}

/** Caractères gardés au plus de chaque côté du mot, pour une phrase très longue. */
const largeurMax = 90;
const finDePhrase = /[.!?…]/;

/**
 * La phrase qui contient la faute, découpée autour d'elle : du dernier point
 * (ou du début du bloc) avant le mot jusqu'au premier point après. Une phrase
 * trop longue est coupée à un espace, au plus à 90 caractères du mot.
 */
export function contexteDeFaute(texte: string, de: number, a: number): FaultContext {
  let debut = 0;
  for (let indice = de - 1; indice > 0; indice--) {
    if (finDePhrase.test(texte.charAt(indice - 1)) && /\s/.test(texte.charAt(indice))) {
      debut = indice + 1;
      break;
    }
  }
  let fin = texte.length;
  for (let indice = a; indice < texte.length; indice++) {
    if (finDePhrase.test(texte.charAt(indice)) && (indice + 1 === texte.length || /\s/.test(texte.charAt(indice + 1)))) {
      fin = indice + 1;
      break;
    }
  }
  let avant = texte.slice(debut, de);
  let apres = texte.slice(a, fin);
  let coupeAvant = debut > 0;
  let coupeApres = fin < texte.length;
  if (avant.length > largeurMax) {
    const coupe = avant.indexOf(' ', avant.length - largeurMax);
    avant = avant.slice(coupe === -1 ? avant.length - largeurMax : coupe + 1);
    coupeAvant = true;
  }
  if (apres.length > largeurMax) {
    const coupe = apres.lastIndexOf(' ', largeurMax);
    apres = apres.slice(0, coupe <= 0 ? largeurMax : coupe);
    coupeApres = true;
  }
  return { avant, mot: texte.slice(de, a), apres, coupeAvant, coupeApres };
}
