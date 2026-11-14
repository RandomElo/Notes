import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Un passage trouvé dans la page : positions de début et de fin dans le document. */
export interface FoundRange {
  from: number;
  to: number;
}

/** Un caractère ramené à sa forme cherchable : sans accent, en minuscule (« É » et « e » se valent). */
function plier(caractere: string): string {
  return caractere.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Les passages d'un document qui contiennent « requete », sans tenir compte des accents ni de la
 * casse (docs/spec/editeur.md), dans l'ordre de lecture. La recherche se fait bloc de texte par
 * bloc de texte : un passage ne déborde pas d'un paragraphe sur le suivant. Une mention ou une
 * image compte pour un caractère qu'on ne trouve pas.
 */
export function chercherDansLaPage(document: ProseMirrorNode, requete: string): FoundRange[] {
  const cherche = [...requete].map(plier).join('');
  if (cherche.trim() === '') {
    return [];
  }
  const trouves: FoundRange[] = [];
  document.descendants((bloc, debut) => {
    if (!bloc.isTextblock) {
      return true;
    }
    // Texte plié du bloc, et pour chacun de ses caractères la position du caractère d'origine.
    let plie = '';
    const positions: number[] = [];
    bloc.forEach((enfant, decalage) => {
      const depart = debut + 1 + decalage;
      if (enfant.isText) {
        let rang = 0;
        for (const caractere of enfant.text ?? '') {
          for (const morceau of plier(caractere)) {
            plie += morceau;
            positions.push(depart + rang);
          }
          rang += caractere.length;
        }
      } else {
        plie += '￼';
        positions.push(depart);
      }
    });
    positions.push(debut + 1 + bloc.content.size);
    for (let index = plie.indexOf(cherche); index !== -1; index = plie.indexOf(cherche, index + cherche.length)) {
      const fin = index + cherche.length;
      // La fin tombe juste après le dernier caractère d'origine trouvé.
      trouves.push({ from: positions[index]!, to: fin < positions.length - 1 ? positions[fin]! : positions[positions.length - 1]! });
    }
    return false;
  });
  return trouves;
}
