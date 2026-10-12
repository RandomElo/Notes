/**
 * Lecture du début d'une page web pour une mention de site (docs/spec/editeur.md) : son
 * titre et l'adresse de sa favicon. Le HTML n'est jamais interprété ni
 * affiché : on y cherche seulement ces deux informations, en texte.
 */

const entites: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Entités HTML d'un texte (`&amp;`, `&#233;`, `&eacute;` courants) remplacées par leur caractère. */
function decoderEntites(texte: string): string {
  return texte.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return entites[code.toLowerCase()] ?? tout;
  });
}

/** Attributs d'une balise ouvrante, noms en minuscules. */
function attributs(balise: string): Record<string, string> {
  const trouves: Record<string, string> = {};
  for (const [, nom = '', guillemets, simples, nu] of balise.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    trouves[nom.toLowerCase()] = decoderEntites(guillemets ?? simples ?? nu ?? '');
  }
  return trouves;
}

/**
 * Titre de la page : `og:title`, sinon `<title>`, espaces resserrés, 200 caractères au plus. null s'il n'y en a pas.
 * Un séparateur laissé en bout de titre est retiré : un site dont le titre se complète en JavaScript
 * envoie souvent « Course | » au lieu de « Course | Nom du site ».
 */
export function titreDeLaPage(html: string): string | null {
  let titre: string | null = null;
  for (const [balise] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributs(balise);
    if ((attrs['property'] ?? attrs['name']) === 'og:title' && attrs['content'] !== undefined) {
      titre = attrs['content'];
      break;
    }
  }
  titre ??= /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null;
  const propre = titre === null ? '' : decoderEntites(titre).replace(/\s+/g, ' ').replace(/^[\s|·•:–—-]+|[\s|·•:–—-]+$/g, '');
  return propre === '' ? null : [...propre].slice(0, 200).join('');
}

/**
 * Adresses possibles de la favicon, de la meilleure à la moins bonne : les
 * `<link rel="icon">` (la plus grande d'abord), l'icône Apple, puis
 * `/favicon.ico`. Seulement http et https.
 */
export function adressesDeFavicon(html: string, adresseDeLaPage: string): string[] {
  const candidates: { adresse: string; rang: number }[] = [];
  for (const [balise] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributs(balise);
    const rel = (attrs['rel'] ?? '').toLowerCase().split(/\s+/);
    if (attrs['href'] === undefined || !(rel.includes('icon') || rel.includes('apple-touch-icon'))) {
      continue;
    }
    const taille = Number(/(\d+)x\d+/.exec(attrs['sizes'] ?? '')?.[1] ?? 0);
    // Un SVG ne se convertit pas en PNG dans la fenêtre : en dernier recours seulement.
    const svg = /\.svg(\?|$)/i.test(attrs['href']) || attrs['type'] === 'image/svg+xml';
    candidates.push({ adresse: attrs['href'], rang: svg ? -1 : rel.includes('apple-touch-icon') ? 1 : 2 + Math.min(taille, 256) });
  }
  candidates.sort((a, b) => b.rang - a.rang);
  const adresses = [...candidates.map((candidate) => candidate.adresse), '/favicon.ico'].flatMap((adresse) => {
    try {
      const url = new URL(adresse, adresseDeLaPage);
      return url.protocol === 'http:' || url.protocol === 'https:' ? [url.href] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(adresses)];
}

/** Vrai pour les octets d'une icône Windows (`.ico`), que le moteur d'images de la fenêtre sait lire. */
export function estUneIco(octets: Uint8Array): boolean {
  return octets[0] === 0 && octets[1] === 0 && octets[2] === 1 && octets[3] === 0;
}
