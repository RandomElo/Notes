import { AtSign, CalendarDays, FilePlus, Heading1, Heading2, Heading3, Heading4, Heading5, List, ListOrdered, ListTodo, MessageSquareText, Pilcrow, SquareCode, Table, Image } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Ce que fait une commande du menu « / ». */
export type SlashAction =
  | { genre: 'paragraphe' }
  | { genre: 'titre'; niveau: 1 | 2 | 3 | 4 | 5 }
  | { genre: 'liste'; liste: 'bulletList' | 'orderedList' | 'taskList' }
  | { genre: 'code' }
  | { genre: 'tableau' }
  | { genre: 'image' }
  | { genre: 'callout' }
  | { genre: 'date' }
  | { genre: 'sousPage' }
  | { genre: 'lien' };

export interface SlashCommand {
  libelle: string;
  /** Autres mots qui trouvent la commande, dont les noms anglais. */
  alias: string[];
  icone: LucideIcon;
  action: SlashAction;
}

const titre = (niveau: 1 | 2 | 3 | 4 | 5, icone: LucideIcon): SlashCommand => ({
  libelle: `Titre ${niveau}`,
  alias: [`h${niveau}`, `heading ${niveau}`, `title ${niveau}`, '#'.repeat(niveau)],
  icone,
  action: { genre: 'titre', niveau },
});

/**
 * Commandes du menu « / » (README §6). Citation et séparateur n'y sont pas :
 * Eloi n'en veut pas.
 */
export const commandes: SlashCommand[] = [
  { libelle: 'Texte', alias: ['paragraphe', 'paragraph', 'text', 'p'], icone: Pilcrow, action: { genre: 'paragraphe' } },
  titre(1, Heading1),
  titre(2, Heading2),
  titre(3, Heading3),
  titre(4, Heading4),
  titre(5, Heading5),
  { libelle: 'Liste à puces', alias: ['puces', 'bullet', 'bulleted list', 'ul', '-'], icone: List, action: { genre: 'liste', liste: 'bulletList' } },
  { libelle: 'Liste numérotée', alias: ['ordonnee', 'numeros', 'numbered list', 'ordered', 'ol', '1.'], icone: ListOrdered, action: { genre: 'liste', liste: 'orderedList' } },
  { libelle: 'Tâche', alias: ['case a cocher', 'a faire', 'todo', 'to-do', 'task', 'checkbox', '[]'], icone: ListTodo, action: { genre: 'liste', liste: 'taskList' } },
  { libelle: 'Code', alias: ['bloc de code', 'code block', '```'], icone: SquareCode, action: { genre: 'code' } },
  { libelle: 'Tableau', alias: ['table', 'grille', 'grid', '|'], icone: Table, action: { genre: 'tableau' } },
  { libelle: 'Image', alias: ['photo', 'img', 'picture', 'capture', '![]'], icone: Image, action: { genre: 'image' } },
  { libelle: 'Callout', alias: ['encadre', 'note', 'info', 'alerte', 'attention', 'admonition'], icone: MessageSquareText, action: { genre: 'callout' } },
  { libelle: 'Page enfant', alias: ['sous-page', 'nouvelle page', 'subpage', 'child page', 'page'], icone: FilePlus, action: { genre: 'sousPage' } },
  { libelle: 'Lien vers une page', alias: ['lien', 'mention', 'link', 'mention page', '@'], icone: AtSign, action: { genre: 'lien' } },
  { libelle: 'Date', alias: ["aujourd'hui", 'jour', 'today', 'date'], icone: CalendarDays, action: { genre: 'date' } },
];

/** Minuscules et sans accents : « tach » et « TÂCHE » trouvent « Tâche ». */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Les commandes qui correspondent à ce qui est tapé après « / ». Celles dont le nom commence par la recherche viennent d'abord. */
export function filtrerCommandes(requete: string): SlashCommand[] {
  const cherche = normaliser(requete);
  if (cherche === '') {
    return commandes;
  }
  const rang = (commande: SlashCommand): number => {
    const noms = [commande.libelle, ...commande.alias].map(normaliser);
    if (noms[0]?.startsWith(cherche) === true) {
      return 0;
    }
    if (noms.some((nom) => nom.startsWith(cherche) || nom.split(' ').some((mot) => mot.startsWith(cherche)))) {
      return 1;
    }
    return noms.some((nom) => nom.includes(cherche)) ? 2 : -1;
  };
  return commandes
    .map((commande) => ({ commande, rang: rang(commande) }))
    .filter((trouve) => trouve.rang !== -1)
    .sort((a, b) => a.rang - b.rang)
    .map((trouve) => trouve.commande);
}

/** « 2 octobre 2026 », « 1er mars 2027 » : la date en toutes lettres, comme on l'écrit dans une note. */
export function dateEnToutesLettres(date: Date): string {
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(date);
  const jour = date.getDate() === 1 ? '1er' : String(date.getDate());
  return `${jour} ${mois} ${date.getFullYear()}`;
}
