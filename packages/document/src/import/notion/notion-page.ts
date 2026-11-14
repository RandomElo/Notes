import { aLaClasse, lireHtml, texteDe, trouver, trouverTous } from './notion-dom';
import type { ChildNode, Element } from './notion-dom';

/**
 * Ce qu'il faut savoir d'une page de l'export HTML de Notion avant de
 * l'importer (docs/spec/import-notion.md) : titre, icône, images à copier,
 * pages liées (pour l'ordre des sous-pages) et bases de données.
 */

export type NotionIcon = { nature: 'emoji'; valeur: string } | { nature: 'image'; adresse: string };

export interface NotionDatabase {
  /** Rang de la base dans la page, à partir de 0. */
  rang: number;
  titre: string;
  /** Adresses des pages de ses lignes, telles qu'écrites dans le HTML (base en tableau HTML). */
  lignes: string[];
  /** Adresse de son fichier `.csv` (base exportée en CSV : ses lignes sont les sous-pages de sa page), sinon null. */
  csv: string | null;
}

export interface NotionPageSummary {
  titre: string;
  icone: NotionIcon | null;
  /** Adresses des images de la page (icône comprise), telles qu'écrites dans le HTML. */
  images: string[];
  /** Adresses des PDF joints à la page, telles qu'écrites dans le HTML. */
  fichiers: string[];
  /** Adresses des autres pages de l'export, dans l'ordre où la page les montre. */
  liens: string[];
  bases: NotionDatabase[];
  /** Le texte du corps, espaces resserrées : sert à repérer les doublons. */
  texte: string;
  /** Ni texte, ni image, ni fichier joint, ni base, ni propriété remplie (ligne d'une base). */
  vide: boolean;
}

/** Le corps d'une page : son `article`, ou tout le document. */
export function articleDe(noeuds: readonly ChildNode[]): readonly ChildNode[] {
  const article = trouver(noeuds, (element) => element.name === 'article');
  return article === null ? noeuds : article.children;
}

export function titreDe(article: readonly ChildNode[]): string {
  const titre = trouver(article, (element) => aLaClasse(element, 'page-title'));
  return titre === null ? '' : texteDe(titre);
}

export function iconeDe(article: readonly ChildNode[]): NotionIcon | null {
  const entete = trouver(article, (element) => aLaClasse(element, 'page-header-icon'));
  if (entete === null) {
    return null;
  }
  const image = trouver(entete.children, (element) => element.name === 'img');
  const source = image?.attribs['src'];
  if (source !== undefined && source !== '') {
    return { nature: 'image', adresse: source };
  }
  const icone = trouver(entete.children, (element) => aLaClasse(element, 'icon'));
  const emoji = icone === null ? texteDe(entete) : texteDIcone(icone);
  return emoji === '' ? null : { nature: 'emoji', valeur: emoji };
}

/** L'emoji d'une icône : dans `data-emoji` (exports récents) ou en texte, que `texteDe` laisse de côté. */
export function texteDIcone(icone: Element): string {
  const attribut = icone.attribs['data-emoji']?.trim();
  return attribut !== undefined && attribut !== '' ? attribut : icone.children.map((enfant) => ('data' in enfant ? String(enfant.data) : '')).join('').trim();
}

/** Lien vers le fichier `.csv` d'une base de données de l'export. */
export function estLienCsv(element: Element): boolean {
  const adresse = element.attribs['href'] ?? '';
  return element.name === 'a' && estAdresseLocale(adresse) && /\.csv$/i.test(adresse);
}

/** Une adresse relative vers un fichier de l'export (ni web, ni ancre, ni courriel). */
export function estAdresseLocale(adresse: string): boolean {
  return adresse !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(adresse) && !adresse.startsWith('#') && !adresse.startsWith('//');
}

/** Une image collée dans Notion, écrite dans le HTML même (`data:image/png;base64,…`). */
export function estImageIntegree(adresse: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(adresse);
}

/** Un PDF de l'export, le seul fichier joint que Notes reprend. */
export function estPdfLocal(adresse: string): boolean {
  return estAdresseLocale(adresse) && /\.pdf(?:[?#].*)?$/i.test(adresse);
}

export function estAdresseDePage(adresse: string): boolean {
  return /\.html?(?:#.*)?$/i.test(adresse) && estAdresseLocale(adresse);
}

/** Lignes d'une base : la première colonne de son tableau renvoie à leurs pages. */
export function lignesDeLaBase(tableau: Element): string[] {
  return trouverTous(tableau.children, (element) => element.name === 'td' && aLaClasse(element, 'cell-title'))
    .map((cellule) => trouver(cellule.children, (element) => element.name === 'a')?.attribs['href'] ?? '')
    .filter(estAdresseDePage);
}

/** Un bloc de base de données : tableau HTML (`collection-content`) ou lien vers son `.csv`. */
export function estBlocDeBase(element: Element): boolean {
  return (element.name === 'div' && aLaClasse(element, 'collection-content')) || estLienCsv(element);
}

/** Les bases de la page, dans l'ordre du document : c'est leur rang. */
export function basesDe(article: readonly ChildNode[]): NotionDatabase[] {
  return trouverTous(article, estBlocDeBase).map((bloc, rang) => {
    if (estLienCsv(bloc)) {
      return { rang, titre: '', lignes: [], csv: bloc.attribs['href']! };
    }
    const tableau = trouver(bloc.children, (element) => element.name === 'table');
    const titre = trouver(bloc.children, (element) => aLaClasse(element, 'collection-title'));
    return { rang, titre: titre === null ? '' : texteDe(titre), lignes: tableau === null ? [] : lignesDeLaBase(tableau), csv: null };
  });
}

export function analyserPageNotion(html: string): NotionPageSummary {
  const article = articleDe(lireHtml(html));
  const icone = iconeDe(article);
  const corps = trouver(article, (element) => aLaClasse(element, 'page-body')) ?? null;
  const contenu = corps === null ? article : corps.children;
  const images = trouverTous(contenu, (element) => element.name === 'img')
    .map((image) => image.attribs['src'] ?? '')
    .filter((adresse) => (estAdresseLocale(adresse) && !estAdresseDePage(adresse)) || estImageIntegree(adresse));
  if (icone?.nature === 'image' && estAdresseLocale(icone.adresse)) {
    images.unshift(icone.adresse);
  }
  const adresses = trouverTous(contenu, (element) => element.name === 'a').map((lien) => lien.attribs['href'] ?? '');
  const liens = adresses.filter(estAdresseDePage);
  const fichiers = adresses.filter(estPdfLocal);
  const bases = basesDe(contenu);
  const texte = corps === null ? '' : texteDe(corps);
  const proprietes = trouver(article, (element) => element.name === 'table' && aLaClasse(element, 'properties'));
  const proprietesRemplies = proprietes !== null && trouverTous(proprietes.children, (element) => element.name === 'td').some((cellule) => texteDe(cellule) !== '');
  const vide = texte === '' && images.length === 0 && fichiers.length === 0 && bases.length === 0 && !proprietesRemplies;
  return { titre: titreDe(article), icone, images: [...new Set(images)], fichiers: [...new Set(fichiers)], liens: [...new Set(liens)], bases, texte, vide };
}

