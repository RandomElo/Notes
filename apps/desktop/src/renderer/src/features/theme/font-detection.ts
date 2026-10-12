/**
 * Dit quelles polices sont installées sur le poste, sans rien demander au
 * système : un texte est mesuré dans la police voulue puis dans une police de
 * repli. S'il a la même largeur avec les trois replis, la police manque.
 * Le navigateur ne donne pas la liste des polices sans une permission que
 * l'application refuse (docs/spec/securite.md).
 */
export function policesInstallees(noms: readonly string[]): string[] {
  const contexte = document.createElement('canvas').getContext('2d');
  if (contexte === null) {
    return [];
  }
  const echantillon = 'mmmmmmmmmmlliWWQ@#0123456789';
  const largeur = (police: string): number => {
    contexte.font = `48px ${police}`;
    return contexte.measureText(echantillon).width;
  };
  const replis = ['monospace', 'serif', 'sans-serif'];
  const references = replis.map(largeur);
  return noms.filter((nom) => replis.some((repli, index) => largeur(`'${nom}', ${repli}`) !== references[index]));
}
