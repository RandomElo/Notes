import { alignementsDImage, estLargeurDImage } from '../schema/nodes/image';
import type { ImageAlign, ImageAttributes, ImageWidth } from '../schema/nodes/image';
import type { Jeton } from './tokenizer';

/**
 * Image dans le fichier (README §4, décision du 2026-10-03) :
 * `![texte](assets/x.png#largeur=66&align=centre "Légende")`. La largeur (un
 * entier de 10 à 100) et
 * l'alignement vont dans le fragment de l'adresse, que les autres outils
 * ignorent. Un fragment qui n'est pas exactement de cette forme reste dans
 * l'adresse, tel quel.
 */

interface Reglages {
  src: string;
  largeur: ImageWidth | null;
  alignement: ImageAlign | null;
}

/** Sépare l'adresse de ses réglages d'affichage. */
export function lireAdresse(adresse: string): Reglages {
  const diese = adresse.indexOf('#');
  const sans = { src: adresse, largeur: null, alignement: null };
  if (diese === -1) {
    return sans;
  }
  let largeur: ImageWidth | null = null;
  let alignement: ImageAlign | null = null;
  const vus = new Set<string>();
  for (const morceau of adresse.slice(diese + 1).split('&')) {
    const [cle, valeur, ...reste] = morceau.split('=');
    if (reste.length > 0 || cle === undefined || vus.has(cle)) {
      return sans;
    }
    vus.add(cle);
    if (cle === 'largeur' && estLargeurDImage(Number(valeur)) && String(Number(valeur)) === valeur) {
      largeur = Number(valeur);
    } else if (cle === 'align' && (alignementsDImage as readonly (string | undefined)[]).includes(valeur)) {
      alignement = valeur as ImageAlign;
    } else {
      return sans;
    }
  }
  return { src: adresse.slice(0, diese), largeur, alignement };
}

/** Adresse écrite dans le fichier : celle de l'image, plus ses réglages s'il y en a. */
export function ecrireAdresse({ src, largeur, alignement }: Reglages): string {
  const reglages = [largeur === null ? null : `largeur=${largeur}`, alignement === null ? null : `align=${alignement}`].filter((morceau) => morceau !== null);
  const adresse = reglages.length === 0 ? src : `${src}#${reglages.join('&')}`;
  // Une espace ou un chevron couperait l'adresse : ils sont encodés. Les parenthèses et la barre oblique inverse sont échappées.
  // Les lettres accentuées, encodées par markdown-it à la lecture, sont écrites en clair pour rester lisibles.
  return adresse
    .replace(/(?:%[C-F][0-9A-F](?:%[89AB][0-9A-F]){1,3})+/gi, (encode) => decoder(encode))
    .replace(/[\s<>]/g, (caractere) => encodeURIComponent(caractere))
    .replace(/[()\\]/g, '\\$&');
}

function decoder(encode: string): string {
  try {
    return decodeURIComponent(encode);
  } catch {
    return encode;
  }
}

/** Texte alternatif d'une image, en texte simple : ce que markdown-it en ferait dans `alt`. */
function texteDe(jetons: Jeton[]): string {
  return jetons.map((jeton) => (jeton.type === 'image' ? texteDe(jeton.children ?? []) : jeton.type === 'softbreak' || jeton.type === 'hardbreak' ? ' ' : jeton.content)).join('');
}

/** Attributs d'un bloc image à partir de son jeton. */
export function attributsDImage(jeton: Jeton): ImageAttributes {
  const titre = jeton.attrGet('title');
  return {
    ...lireAdresse(jeton.attrGet('src') ?? ''),
    alt: texteDe(jeton.children ?? []),
    title: titre === null || titre === '' ? null : titre,
  };
}

/** Le Markdown d'une image, sur une ligne. */
export function ecrireImage(attributs: ImageAttributes): string {
  // Dans le texte alternatif, tout ce qui pourrait être lu comme une mise en forme ou fermer le crochet est échappé.
  const alt = attributs.alt.replace(/\s+/g, ' ').replace(/[\\`*_[\]<>&=~!]/g, '\\$&');
  const titre = attributs.title === null || attributs.title === '' ? '' : ` "${attributs.title.replace(/\s+/g, ' ').replace(/["\\]/g, '\\$&')}"`;
  return `![${alt}](${ecrireAdresse(attributs)}${titre})`;
}
