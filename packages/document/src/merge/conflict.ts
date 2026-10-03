import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { finDeLigneDe } from '../markdown/lines';
import { lireMarkdown } from '../markdown/parse';

/**
 * Comparaison de deux versions d'une page pour l'écran des conflits (README
 * §5). A est la page, B la version mise de côté. Les blocs de premier niveau
 * sont appariés sur leur texte exact : rien n'est réécrit, chaque bloc garde
 * son Markdown d'origine.
 */
export type ConflictRow =
  /** Bloc identique des deux côtés. */
  | { genre: 'pareil'; texte: string }
  /** Bloc d'un seul côté, ou entièrement différent. */
  | { genre: 'bloc'; a: string | null; b: string | null }
  /**
   * Paragraphe ou titre d'une ligne dont seul un passage diffère. Les mots
   * sont séparés par une espace : `[...avant, a, ...apres].join(' ')` redonne A.
   * Un passage vide veut dire que l'autre côté a seulement ajouté du texte.
   */
  | { genre: 'texte'; avant: string[]; a: string; b: string; apres: string[] };

interface Bloc {
  texte: string;
  noeud: ProseMirrorNode;
}

export function comparerVersions(corpsA: string, corpsB: string): ConflictRow[] {
  const blocsA = blocsDe(corpsA);
  const blocsB = blocsDe(corpsB);
  const lignes: ConflictRow[] = [];
  let seulsA: Bloc[] = [];
  let seulsB: Bloc[] = [];
  const vider = (): void => {
    lignes.push(...apparier(seulsA, seulsB));
    seulsA = [];
    seulsB = [];
  };
  for (const pas of aligner(blocsA.map((bloc) => bloc.texte), blocsB.map((bloc) => bloc.texte))) {
    if (pas.genre === 'pareil') {
      vider();
      lignes.push({ genre: 'pareil', texte: (blocsA[pas.a] as Bloc).texte });
    } else if (pas.genre === 'a') {
      seulsA.push(blocsA[pas.indice] as Bloc);
    } else {
      seulsB.push(blocsB[pas.indice] as Bloc);
    }
  }
  vider();
  return lignes;
}

/**
 * Le corps de la page résolue, à partir des textes de blocs retenus dans
 * l'ordre. Si c'est exactement l'une des deux versions, elle est rendue à
 * l'octet près. Sinon les blocs sont séparés par une ligne vide, sauf deux
 * listes de même sorte, qui restent une seule liste.
 */
export function assemblerVersions(blocs: readonly string[], corpsA: string, corpsB: string): string {
  for (const corps of [corpsA, corpsB]) {
    const textes = blocsDe(corps).map((bloc) => bloc.texte);
    if (textes.length === blocs.length && textes.every((texte, indice) => texte === blocs[indice])) {
      return corps;
    }
  }
  const finDeLigne = finDeLigneDe(corpsA);
  let corps = '';
  blocs.forEach((bloc, indice) => {
    if (indice > 0) {
      const memeListe = sorteDeListe(blocs[indice - 1] as string) !== null && sorteDeListe(blocs[indice - 1] as string) === sorteDeListe(bloc);
      corps += memeListe ? finDeLigne : finDeLigne + finDeLigne;
    }
    corps += bloc;
  });
  return blocs.length === 0 ? '' : corps + finDeLigne;
}

/** Le Markdown d'un paragraphe dont les morceaux ont été placés à la main. */
export function assemblerTexte(mots: readonly string[]): string {
  return mots.join(' ');
}

function blocsDe(corps: string): Bloc[] {
  return lireMarkdown(corps).source.blocs.map((bloc) => ({ texte: bloc.texte, noeud: bloc.noeud }));
}

function sorteDeListe(texte: string): string | null {
  const marque = /^ {0,3}([-*+]|\d{1,9}[.)])[ \t]/.exec(texte)?.[1];
  if (marque === undefined) {
    return null;
  }
  return /\d/.test(marque) ? `n${marque.slice(-1)}` : marque;
}

type Pas = { genre: 'pareil'; a: number; b: number } | { genre: 'a' | 'b'; indice: number };

/** Plus longue suite commune de blocs identiques, puis le chemin pour passer de A à B. */
function aligner(a: string[], b: string[]): Pas[] {
  const longueurs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const ligne = longueurs[i] as number[];
      ligne[j] = a[i] === b[j] ? ((longueurs[i + 1] as number[])[j + 1] as number) + 1 : Math.max((longueurs[i + 1] as number[])[j] as number, ligne[j + 1] as number);
    }
  }
  const pas: Pas[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      pas.push({ genre: 'pareil', a: i++, b: j++ });
    } else if (j >= b.length || (i < a.length && ((longueurs[i + 1] as number[])[j] as number) >= ((longueurs[i] as number[])[j + 1] as number))) {
      pas.push({ genre: 'a', indice: i++ });
    } else {
      pas.push({ genre: 'b', indice: j++ });
    }
  }
  return pas;
}

/** Entre deux blocs identiques : les blocs de A et de B se répondent dans l'ordre, le surplus reste seul. */
function apparier(seulsA: Bloc[], seulsB: Bloc[]): ConflictRow[] {
  const lignes: ConflictRow[] = [];
  const paires = Math.min(seulsA.length, seulsB.length);
  for (let indice = 0; indice < Math.max(seulsA.length, seulsB.length); indice++) {
    const a = seulsA[indice];
    const b = seulsB[indice];
    if (indice < paires && a !== undefined && b !== undefined) {
      lignes.push(comparerTexte(a, b) ?? { genre: 'bloc', a: a.texte, b: b.texte });
    } else {
      lignes.push({ genre: 'bloc', a: a?.texte ?? null, b: b?.texte ?? null });
    }
  }
  return lignes;
}

/**
 * Deux paragraphes, ou deux titres de même niveau, sur une seule ligne et qui
 * ont au moins un mot en commun au début ou à la fin : seul le passage du
 * milieu diffère. null sinon, et les blocs se comparent en entier.
 */
function comparerTexte(a: Bloc, b: Bloc): ConflictRow | null {
  const memeSorte =
    a.noeud.type.name === b.noeud.type.name &&
    (a.noeud.type.name === 'paragraph' || (a.noeud.type.name === 'heading' && a.noeud.attrs['level'] === b.noeud.attrs['level']));
  if (!memeSorte || /[\r\n]/.test(a.texte) || /[\r\n]/.test(b.texte)) {
    return null;
  }
  const motsA = a.texte.split(' ');
  const motsB = b.texte.split(' ');
  const minimal = communsMinimaux(motsA, motsB);
  // Les passages vont d'une ponctuation à l'autre : « 18 km, » face à « 20 km, », et non « 18 » face à « 20 »,
  // qui donnerait « 18 20 km, » en gardant les deux. Faute de ponctuation commune, on revient au mot près.
  const ponctue = calerSurLaPonctuation(motsA, motsB, minimal);
  const { debut, fin } = aDesCommuns(motsA, ponctue) ? ponctue : minimal;
  if (!aDesCommuns(motsA, { debut, fin })) {
    return null;
  }
  return {
    genre: 'texte',
    avant: motsA.slice(0, debut),
    a: motsA.slice(debut, motsA.length - fin).join(' '),
    b: motsB.slice(debut, motsB.length - fin).join(' '),
    apres: motsA.slice(motsA.length - fin),
  };
}

interface Communs {
  /** Nombre de mots communs au début et à la fin. */
  debut: number;
  fin: number;
}

function communsMinimaux(motsA: string[], motsB: string[]): Communs {
  let debut = 0;
  while (debut < motsA.length && debut < motsB.length && motsA[debut] === motsB[debut]) {
    debut++;
  }
  let fin = 0;
  while (fin < motsA.length - debut && fin < motsB.length - debut && motsA[motsA.length - 1 - fin] === motsB[motsB.length - 1 - fin]) {
    fin++;
  }
  return { debut, fin };
}

const finDeMembre = /[,.;:!?)»]$/;

/** Rétrécit les parties communes pour que chaque passage commence et finisse à une ponctuation. Un simple ajout reste au mot près. */
function calerSurLaPonctuation(motsA: string[], motsB: string[], { debut, fin }: Communs): Communs {
  if (motsA.length - debut - fin === 0 || motsB.length - debut - fin === 0) {
    return { debut, fin };
  }
  let d = debut;
  while (d > 0 && !finDeMembre.test(motsA[d - 1] as string)) {
    d--;
  }
  let f = fin;
  while (f > 0 && !(finDeMembre.test(motsA[motsA.length - f - 1] as string) && finDeMembre.test(motsB[motsB.length - f - 1] as string))) {
    f--;
  }
  return { debut: d, fin: f };
}

/** Un titre qui ne garde que ses « # » en commun est un titre entièrement différent. */
function aDesCommuns(motsA: string[], { debut, fin }: Communs): boolean {
  return [...motsA.slice(0, debut), ...motsA.slice(motsA.length - fin)].some((mot) => mot !== '' && !/^#+$/.test(mot));
}
