import { decouperFences } from './reserved-blocks';

/**
 * Mise au propre section par section (README §12). Un modèle local de 8
 * milliards de paramètres, à qui l'on donne toute une page, la recopie presque
 * telle quelle ; sur une section seule, il suit la consigne (essais du
 * 2026-10-12 sur des notes de cours). Les titres ne passent pas par le
 * modèle : ils restent tels quels, à leur place. Les lignes de texte qui se
 * suivent sont mises en liste ici, avant l'appel, parce que le modèle garde
 * bien une liste mais en crée rarement une lui-même.
 */

export interface NoteSection {
  /** Ligne de titre telle qu'écrite, null pour ce qui précède le premier titre. */
  titre: string | null;
  /** Contenu sous le titre, jusqu'au titre suivant. */
  corps: string;
}

const ligneDeTitre = /^ {0,3}#{1,6}[ \t]+\S/;

/** Découpe le texte à chaque titre ; un `#` dans un bloc fencé n'est pas un titre. */
export function decouperEnSections(texte: string): NoteSection[] {
  const sections: Array<{ titre: string | null; lignes: string[] }> = [{ titre: null, lignes: [] }];
  for (const morceau of decouperFences(texte)) {
    for (const ligne of morceau.lignes) {
      if (!morceau.fence && ligneDeTitre.test(ligne)) {
        sections.push({ titre: ligne, lignes: [] });
      } else {
        sections[sections.length - 1]!.lignes.push(ligne);
      }
    }
  }
  return sections
    .map((section) => ({ titre: section.titre, corps: section.lignes.join('\n').trim() }))
    .filter((section) => section.titre !== null || section.corps !== '');
}

/** Remet les sections bout à bout, une ligne vide entre un titre et son contenu. */
export function assemblerSections(sections: readonly NoteSection[]): string {
  return sections
    .map((section) => [section.titre, section.corps].filter((partie): partie is string => partie !== null && partie !== '').join('\n\n'))
    .join('\n\n');
}

/** Ligne qui a déjà sa forme : puce, liste numérotée, citation, tableau, fence, repère de bloc, ligne décalée. */
const dejaFormee = (ligne: string): boolean => /^(?:\s*(?:[-*+][ \t]|\d+[.)][ \t]|>|\|)|\s*(?:`{3}|~{3})|\s*\[\[BLOC-\d+\]\]|\s)/.test(ligne);

/**
 * Lignes de texte qui se suivent (au moins deux, sans ligne vide entre elles)
 * : une puce chacune. Une ligne finie par « : » reste en tête de la liste qui
 * la suit. Un groupe qui contient déjà une puce, une citation, un tableau ou
 * un repère est laissé tel quel, comme une ligne seule.
 */
export function mettreEnListes(corps: string): string {
  const groupes: string[][] = [[]];
  for (const ligne of corps.split('\n')) {
    if (ligne.trim() === '') {
      if (groupes[groupes.length - 1]!.length > 0) {
        groupes.push([]);
      }
    } else {
      groupes[groupes.length - 1]!.push(ligne);
    }
  }
  return groupes
    .filter((groupe) => groupe.length > 0)
    .map((groupe) => {
      if (groupe.length < 2 || groupe.some(dejaFormee)) {
        return groupe.join('\n');
      }
      const sortie: string[] = [];
      groupe.forEach((ligne, index) => {
        if (/:\s*$/.test(ligne) && index < groupe.length - 1) {
          if (sortie.length > 0) {
            sortie.push('');
          }
          sortie.push(ligne.trim(), '');
        } else {
          sortie.push(`- ${ligne.trim()}`);
        }
      });
      return sortie.join('\n');
    })
    .join('\n\n');
}

/** Une section qui n'a que des repères de blocs, ou rien, ne part pas au modèle. */
export function aDuTexte(corps: string): boolean {
  return /[\p{L}\p{N}]/u.test(corps.replace(/\[\[BLOC-\d+\]\]/g, ''));
}

/** Ce que le modèle reçoit pour une section : son titre pour le contexte, puis ses notes. */
export function demandeDeSection(section: NoteSection): string {
  const titre = section.titre === null ? '(début de la page)' : section.titre.replace(/^ {0,3}#{1,6}[ \t]+/, '').trim();
  return `Titre de la section : ${titre}\nNotes :\n${section.corps}`;
}

/**
 * Longueur maximale de la réponse pour une section, en tokens : de quoi
 * corriger et compléter les phrases, pas de quoi écrire un cours (vu en essai :
 * « Suite de », seul sous son titre, devenait une page entière).
 */
export function sortieMaxDeSection(corps: string): number {
  return Math.ceil((corps.length * 10) / 23) + 40;
}

/** Une réponse plus longue que ça a sans doute inventé. */
const allongementMaximal = (corps: string): number => corps.length * 1.6 + 40;

/**
 * La réponse du modèle pour une section, ou les notes mises en liste si elle
 * n'est pas sûre : coupée par la limite, bien plus longue que les notes, ou
 * privée d'un repère de bloc. `gardee` dit qu'on a gardé les notes.
 */
export function reponseDeSection(corps: string, reponse: string, coupee: boolean): { texte: string; gardee: boolean } {
  const texte = reponse
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '')
    .replace(/^\s*(?:R[ée]ponse\s*:)\s*/i, '')
    // Le titre est déjà en place : un titre en tête de la réponse le répète.
    .replace(/^(?:\s*#{1,6}[ \t][^\n]*\n)+/, '')
    .trim();
  const reperes = corps.match(/\[\[BLOC-\d+\]\]/g) ?? [];
  if (coupee || texte === '' || texte.length > allongementMaximal(corps) || reperes.some((repere) => !texte.includes(repere))) {
    return { texte: corps, gardee: true };
  }
  return { texte, gardee: false };
}

/**
 * Titres : ils ne passent pas par l'appel de leur section, mais on en corrige
 * les fautes à part, tous ensemble, par un appel court (demande d'Eloi,
 * 2026-10-12). Rien d'autre n'y change : niveaux et place restent ceux de la page.
 */
// Sans l'exemple, qwen3:8b recopie les titres sans rien corriger (essai du 2026-10-12).
export const consigneDesTitres = [
  'Tu es correcteur orthographique. Tu reçois des titres de notes en français, un par ligne, numérotés, écrits vite : certains ont des fautes d’orthographe, d’accord ou de frappe.',
  'Pour chaque titre, écris-le corrigé : corrige chaque mot mal orthographié et chaque accord faux, garde les mêmes mots dans le même ordre, sans reformuler.',
  'Les noms propres et les noms d’outils restent tels quels, sauf faute de frappe évidente.',
  '',
  'Exemple :',
  '1. Les diférents modèle',
  '2. Présentation',
  '3. Outils utilisé',
  '',
  'Réponse :',
  '1. Les différents modèles',
  '2. Présentation',
  '3. Outils utilisés',
  '',
  'Réponds uniquement par les titres corrigés, un par ligne, dans le même ordre, chacun précédé de son numéro.',
].join('\n');

const texteDuTitre = (ligne: string): string => ligne.replace(/^ {0,3}#{1,6}[ \t]+/, '').replace(/[ \t#]*$/, '');

/** Les titres numérotés, tels qu'envoyés au modèle. */
export function demandeDesTitres(titres: readonly string[]): string {
  return titres.map((titre, index) => `${index + 1}. ${texteDuTitre(titre)}`).join('\n');
}

/** Longueur maximale de la réponse pour les titres, en tokens. */
export function sortieMaxDesTitres(titres: readonly string[]): number {
  return sortieMaxDeSection(demandeDesTitres(titres));
}

const mots = (texte: string): number => texte.split(/\s+/).filter((mot) => mot !== '').length;

/**
 * Titres corrigés, chacun avec son niveau d'origine. Un titre dont la
 * correction change le nombre de mots ou la longueur de plus d'un quart,
 * ou qui manque à la réponse, reste tel quel.
 */
export function titresCorriges(titres: readonly string[], reponse: string): string[] {
  const recus = new Map<number, string>();
  for (const ligne of reponse.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').split('\n')) {
    const trouve = /^\s*(\d+)[.)][ \t]+(.+?)\s*$/.exec(ligne);
    if (trouve !== null) {
      recus.set(Number(trouve[1]), trouve[2]!.replace(/^#+[ \t]+/, '').replace(/^\*\*(.*)\*\*$/, '$1'));
    }
  }
  return titres.map((titre, index) => {
    const avant = texteDuTitre(titre);
    const apres = recus.get(index + 1);
    if (apres === undefined || mots(apres) !== mots(avant) || Math.abs(apres.length - avant.length) > Math.max(3, avant.length / 4)) {
      return titre;
    }
    return `${/^ {0,3}#{1,6}/.exec(titre)![0].trim()} ${apres}`;
  });
}
