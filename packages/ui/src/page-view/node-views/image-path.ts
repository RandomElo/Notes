/**
 * Où est le fichier d'une image : son adresse dans la page (`assets/x.png`),
 * relative au dossier de la page, devient un chemin relatif au dossier des
 * notes (`Projets/NAS/assets/x.png`). null pour ce qui ne s'affiche pas : une
 * adresse externe (http, data...), absolue, ou qui sortirait du dossier des
 * notes. Les images d'Internet ne sont jamais chargées : elles se copient
 * dans `assets/`.
 */
export function cheminDeLImage(cheminDeLaPage: string, src: string): string | null {
  if (src === '' || src.startsWith('/') || src.startsWith('\\') || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
    return null;
  }
  const sansSuite = src.split(/[?#]/, 1)[0] ?? '';
  const morceaux = cheminDeLaPage === '' ? [] : cheminDeLaPage.split('/');
  for (const brut of sansSuite.split('/')) {
    let morceau: string;
    try {
      morceau = decodeURIComponent(brut);
    } catch {
      return null;
    }
    if (morceau.includes('/') || morceau.includes('\\') || morceau.includes('\0')) {
      return null;
    }
    if (morceau === '' || morceau === '.') {
      continue;
    }
    if (morceau === '..') {
      if (morceaux.length === 0) {
        return null;
      }
      morceaux.pop();
      continue;
    }
    morceaux.push(morceau);
  }
  return morceaux.length === 0 ? null : morceaux.join('/');
}
