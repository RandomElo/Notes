import { decouperFences } from '../ai/reserved-blocks';

/**
 * Un fichier Markdown déposé dans la fenêtre (docs/spec/interface.md) : il
 * devient une page, ou s'ajoute à la page ouverte. Ici, seulement le texte :
 * le titre, et les images locales qu'il faut copier dans le dossier de la
 * page. La lecture du fichier et la copie des images sont dans le main.
 */

// Adresse nue, ou entre chevrons (elle peut alors contenir des espaces), puis un titre éventuel.
const image = /!\[([^\]\n]*)\]\((?:<([^>\n]+)>|([^)\s]+))((?:\s+"[^"\n]*")?)\)/g;

/** Une adresse d'image qui désigne un fichier à côté du Markdown : ni web, ni données, ni chemin absolu. */
function estLocale(adresse: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(adresse) && !adresse.startsWith('/') && !adresse.startsWith('#');
}

/** Les adresses des images locales du texte, sans doublon, dans l'ordre ; les blocs de code ne comptent pas. */
export function imagesLocales(markdown: string): string[] {
  const adresses = new Set<string>();
  for (const morceau of decouperFences(markdown)) {
    if (morceau.fence) {
      continue;
    }
    for (const trouve of morceau.lignes.join('\n').matchAll(image)) {
      const adresse = trouve[2] ?? trouve[3]!;
      if (estLocale(adresse)) {
        adresses.add(adresse);
      }
    }
  }
  return [...adresses];
}

/** Remplace les adresses des images copiées par leur nouvelle adresse (`assets/x.png`), hors des blocs de code. */
export function remplacerImages(markdown: string, nouvelles: ReadonlyMap<string, string>): string {
  if (nouvelles.size === 0) {
    return markdown;
  }
  return decouperFences(markdown)
    .map((morceau) =>
      morceau.fence
        ? morceau.lignes.join('\n')
        : morceau.lignes.join('\n').replace(image, (tout, texte: string, entreChevrons: string | undefined, nue: string | undefined, titre: string) => {
            const nouvelle = nouvelles.get(entreChevrons ?? nue ?? '');
            return nouvelle === undefined ? tout : `![${texte}](${nouvelle}${titre})`;
          }),
    )
    .join('\n');
}

/**
 * Titre de la page et corps à écrire. Le titre vient, dans l'ordre, du
 * front-matter du fichier (`title:`), d'un titre `#` en première ligne (retiré
 * du corps, puisqu'il devient le titre de la page), sinon du nom du fichier.
 * Le front-matter d'un autre outil est retiré : la page a le sien.
 */
export function titreEtCorps(markdown: string, nomDuFichier: string): { titre: string; corps: string } {
  let corps = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let titre: string | null = null;
  const enTete = /^---\n([\s\S]*?)\n---\n?/.exec(corps);
  if (enTete !== null) {
    const ligne = /^title:\s*(.+)$/m.exec(enTete[1]!);
    titre = ligne === null ? null : ligne[1]!.trim().replace(/^(["'])(.*)\1$/, '$2').trim() || null;
    corps = corps.slice(enTete[0].length);
  }
  const premier = /^\s*#[ \t]+(.+?)[ \t#]*(?:\n|$)/.exec(corps);
  if (premier !== null) {
    titre ??= premier[1]!.trim();
    if (titre === premier[1]!.trim()) {
      corps = corps.slice(premier[0].length);
    }
  }
  corps = corps.replace(/^\n+/, '');
  titre ??= nomDuFichier.replace(/\.(md|markdown)$/i, '').trim();
  return { titre: titre === '' ? 'Sans titre' : titre, corps: corps === '' || corps.endsWith('\n') ? corps : `${corps}\n` };
}
