import { decouperFences, remettreEnPlace } from './reserved-blocks';

/**
 * Nettoyage systématique d'une sortie de modèle avant de la proposer (README
 * §12) : fence qui englobe tout, réflexion affichée, préambule et conclusion,
 * séparateurs ajoutés, puces, niveaux de titre, emojis et gras ajoutés. Ce qui
 * était déjà dans l'entrée est gardé. Les blocs de code ne sont jamais
 * touchés : ceux de la page sont mis de côté avant l'appel
 * (`reserved-blocks.ts`), ceux que le modèle écrit restent tels quels.
 */

export interface CleanupInput {
  /** Sortie brute du modèle. */
  sortie: string;
  /** Ce qui a été envoyé au modèle (repères compris). */
  entree: string;
  /** Blocs mis de côté avant l'appel. */
  reserves: readonly string[];
  /** Titre de la page : un premier titre qui le répète est retiré. */
  titre: string;
  /** Relecture : la proposition doit garder à peu près autant de texte que la page. */
  memeLongueur?: boolean;
}

export interface CleanupResult {
  markdown: string;
  /** Ce que le nettoyage n'a pas pu réparer et que l'utilisateur doit savoir, en français. */
  avertissements: string[];
}

const debutsDePreambule =
  /^(?:voici|voilà|bien s[uû]r|certainement|d'accord|ok\b|parfait|absolument|tr[eè]s bien|avec plaisir|je vous propose|ci-dessous|here is|here's|sure\b|certainly)/i;
const debutsDeConclusion =
  /^(?:n'h[ée]sitez|j'esp[eè]re|si vous (?:souhaitez|voulez|avez|le souhaitez)|dites-moi|faites-moi savoir|cette version|ce texte (?:reformul|restructur|am[ée]lior)|les (?:principales )?modifications|j'ai (?:apport[ée]|am[ée]lior[ée]|corrig[ée]|restructur[ée]|reformul[ée]|modifi[ée]|conserv[ée]|gard[ée])|remarques?\s*:|notes?\s*:|let me know|i hope)/i;

/** Fence `markdown` (ou sans langage) qui entoure toute la sortie. */
function retirerFenceEnglobante(texte: string): string {
  const trouve = /^\s*(`{3,}|~{3,})[ \t]*(?:markdown|md)?[ \t]*\n([\s\S]*?)\n[ \t]*\1[ \t]*\s*$/i.exec(texte);
  return trouve === null ? texte : trouve[2]!;
}

/** Réflexion que certains modèles écrivent avant leur réponse (`<think>…</think>`). */
function retirerReflexion(texte: string): string {
  return texte.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '');
}

/** Paragraphes (séparés par une ligne vide) d'un morceau de texte hors code. */
function enParagraphes(lignes: string[]): string[][] {
  const paragraphes: string[][] = [[]];
  for (const ligne of lignes) {
    if (ligne.trim() === '') {
      if (paragraphes[paragraphes.length - 1]!.length > 0) {
        paragraphes.push([]);
      }
    } else {
      paragraphes[paragraphes.length - 1]!.push(ligne);
    }
  }
  return paragraphes.filter((paragraphe) => paragraphe.length > 0);
}

const texteBrut = (ligne: string): string => ligne.replace(/^#{1,6}\s+/, '').replace(/[*_]/g, '').trim();

/** Préambule (« Voici le texte relu : ») et conclusion (« N'hésitez pas… ») du modèle. */
function retirerPreambuleEtConclusion(texte: string, entree: string): string {
  const morceaux = decouperFences(texte);
  const premier = morceaux[0];
  if (premier !== undefined && !premier.fence) {
    const paragraphes = enParagraphes(premier.lignes);
    const tete = paragraphes[0];
    if (tete !== undefined && tete.length === 1 && debutsDePreambule.test(texteBrut(tete[0]!)) && !entree.includes(tete[0]!.trim())) {
      const index = premier.lignes.indexOf(tete[0]!);
      premier.lignes.splice(0, index + 1);
    }
  }
  const dernier = morceaux[morceaux.length - 1];
  if (dernier !== undefined && !dernier.fence) {
    // Plusieurs paragraphes de conclusion possibles (« J'ai corrigé… » puis « N'hésitez pas… ») : on remonte tant qu'ils en sont.
    for (;;) {
      const paragraphes = enParagraphes(dernier.lignes);
      const queue = paragraphes[paragraphes.length - 1];
      if (queue === undefined || !debutsDeConclusion.test(texteBrut(queue[0]!)) || entree.includes(queue[0]!.trim())) {
        break;
      }
      const index = dernier.lignes.lastIndexOf(queue[0]!);
      dernier.lignes.splice(index);
    }
  }
  return morceaux.map((morceau) => morceau.lignes.join('\n')).join('\n');
}

/** Applique une transformation ligne à ligne en dehors des blocs fencés. */
function horsCode(texte: string, transformer: (lignes: string[]) => string[]): string {
  return decouperFences(texte)
    .map((morceau) => (morceau.fence ? morceau.lignes : transformer(morceau.lignes)).join('\n'))
    .join('\n');
}

const separateur = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;

/** Séparateurs ajoutés : l'application n'en crée plus, ils ne restent que s'ils étaient déjà là. */
function retirerSeparateurs(lignes: string[], entreeEnAvait: boolean): string[] {
  if (entreeEnAvait) {
    return lignes;
  }
  // Un `---` juste sous une ligne de texte est un titre souligné, pas un séparateur.
  return lignes.filter((ligne, index) => !(separateur.test(ligne) && (index === 0 || lignes[index - 1]!.trim() === '')));
}

/** Puces `*`, `+` et `•` ramenées à `-`, comme l'écrit l'application. */
function normaliserPuces(lignes: string[]): string[] {
  return lignes.map((ligne) => ligne.replace(/^(\s*)[*+•]([ \t]+)/, '$1-$2'));
}

/**
 * Niveaux de titre : un premier titre qui répète celui de la page est retiré,
 * le niveau le plus haut est celui de l'entrée (ou 1), sans saut de niveau en
 * descendant, au plus 5 (les titres que l'éditeur connaît).
 */
function remettreLesTitres(lignes: string[], entree: string, titre: string): string[] {
  const titreDe = (ligne: string): { niveau: number; texte: string } | null => {
    const trouve = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(ligne);
    return trouve === null ? null : { niveau: trouve[1]!.length, texte: trouve[2]! };
  };
  const niveauxDeLEntree = entree
    .split('\n')
    .map(titreDe)
    .filter((t) => t !== null)
    .map((t) => t.niveau);
  const haut = niveauxDeLEntree.length > 0 ? Math.min(...niveauxDeLEntree) : 1;

  const resultat = [...lignes];
  const premier = resultat.findIndex((ligne) => ligne.trim() !== '');
  const tete = premier === -1 ? null : titreDe(resultat[premier]!);
  if (tete !== null && texteBrut(tete.texte).toLocaleLowerCase('fr') === titre.trim().toLocaleLowerCase('fr')) {
    resultat.splice(premier, 1);
  }

  const niveaux = resultat.map(titreDe);
  const presents = niveaux.filter((t) => t !== null).map((t) => t.niveau);
  if (presents.length === 0) {
    return resultat;
  }
  const decalage = haut - Math.min(...presents);
  // Pile des niveaux d'origine ouverts, pour écrire chaque titre au plus un cran sous son parent.
  const pile: Array<{ origine: number; niveau: number }> = [];
  return resultat.map((ligne, index) => {
    const t = niveaux[index];
    if (t === null || t === undefined) {
      return ligne;
    }
    while (pile.length > 0 && pile[pile.length - 1]!.origine >= t.niveau) {
      pile.pop();
    }
    const parent = pile[pile.length - 1];
    const voulu = t.niveau + decalage;
    const niveau = Math.min(5, Math.max(haut, parent === undefined ? haut : Math.min(voulu, parent.niveau + 1)));
    pile.push({ origine: t.niveau, niveau });
    return `${'#'.repeat(niveau)} ${t.texte}`;
  });
}

const emoji = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic}))*/gu;

/** Emojis ajoutés par le modèle ; ceux qui étaient dans l'entrée restent. */
function retirerEmojis(lignes: string[], entree: string): string[] {
  const presents = new Set(entree.match(emoji) ?? []);
  return lignes.map((ligne) =>
    ligne
      // Repère d'un caractère d'usage privé à la place de l'emoji retiré, ôté juste après avec l'espace qui le précède.
      .replace(emoji, (trouve) => (presents.has(trouve) ? trouve : '\uE000'))
      // Un emoji retiré ne laisse ni double espace ni espace en tête de texte.
      .replace(/^(\s*(?:#{1,6}|[-*+]|\d+[.)])?\s*)\uE000\s*/u, '$1')
      .replace(/ ?\uE000/g, ''),
  );
}

/** Gras ajouté par le modèle (`**x**`, `__x__`) ; un passage déjà en gras dans l'entrée le reste. */
function retirerGras(lignes: string[], entree: string): string[] {
  const garde = (interieur: string): boolean => entree.includes(`**${interieur}**`) || entree.includes(`__${interieur}__`);
  return lignes.map((ligne) => ligne.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*|__(?=\S)([^_\n]*?\S)__/g, (tout, a?: string, b?: string) => (garde(a ?? b ?? '') ? tout : (a ?? b ?? ''))));
}

/** Pas plus d'une ligne vide de suite, hors code ; une seule fin de ligne finale. */
function resserrer(lignes: string[]): string[] {
  return lignes.filter((ligne, index) => !(ligne.trim() === '' && index > 0 && lignes[index - 1]!.trim() === '')).map((ligne) => (ligne.trim() === '' ? '' : ligne));
}

/** Une relecture qui rend moins de 85 % des mots a sans doute retiré du texte (vu en essai : des paragraphes proches fusionnés). */
const partMinimaleDesMots = 0.85;
const mots = (texte: string): number => texte.replace(/\[\[BLOC-\d+\]\]/g, '').split(/\s+/).filter((mot) => /[\p{L}\p{N}]/u.test(mot)).length;

/** Liens vers d'autres pages présents dans l'entrée et absents de la sortie. */
function mentionsPerdues(entree: string, sortie: string): number {
  const mentions = new Set(entree.match(/notes:\/\/[0-9a-f-]{36}/g) ?? []);
  return [...mentions].filter((mention) => !sortie.includes(mention)).length;
}

export function nettoyerSortie({ sortie, entree, reserves, titre, memeLongueur = false }: CleanupInput): CleanupResult {
  let texte = sortie.replace(/\r\n?/g, '\n');
  texte = retirerReflexion(texte);
  texte = retirerFenceEnglobante(texte.trim());
  texte = retirerPreambuleEtConclusion(texte, entree);
  // « Voici le texte : » suivi d'un fence qui englobe la réponse : le fence n'apparaît qu'une fois le préambule ôté.
  texte = retirerFenceEnglobante(texte.trim());
  const entreeAvaitDesSeparateurs = entree.split('\n').some((ligne) => separateur.test(ligne));
  texte = horsCode(texte, (lignes) => retirerSeparateurs(lignes, entreeAvaitDesSeparateurs));
  texte = horsCode(texte, normaliserPuces);
  texte = horsCode(texte, (lignes) => retirerEmojis(lignes, entree));
  texte = horsCode(texte, (lignes) => retirerGras(lignes, entree));
  texte = horsCode(texte, (lignes) => remettreLesTitres(lignes, entree, titre));

  const motsRendus = mots(texte);
  const remis = remettreEnPlace(texte, reserves);
  const markdown = `${horsCode(remis.texte, resserrer).trim()}\n`;

  const avertissements: string[] = [];
  if (remis.remisALaFin > 0) {
    avertissements.push(
      remis.remisALaFin === 1
        ? 'Le modèle a laissé de côté un bloc (code, callout ou image) : il est remis à la fin de la page.'
        : `Le modèle a laissé de côté ${remis.remisALaFin} blocs (code, callouts ou images) : ils sont remis à la fin de la page.`,
    );
  }
  const perdues = mentionsPerdues(entree, markdown);
  if (perdues > 0) {
    avertissements.push(perdues === 1 ? 'Une mention de page a disparu dans la proposition.' : `${perdues} mentions de page ont disparu dans la proposition.`);
  }
  const motsRecus = mots(entree);
  if (memeLongueur && motsRecus > 0 && motsRendus > 0 && motsRendus < motsRecus * partMinimaleDesMots) {
    avertissements.push(`La proposition a ${Math.round((1 - motsRendus / motsRecus) * 100)} % de mots en moins que la page : le modèle a peut-être retiré du texte. Vérifie avant d’accepter.`);
  }
  if (markdown.trim() === '') {
    avertissements.push("Le modèle n'a rien proposé.");
  }
  return { markdown, avertissements };
}
