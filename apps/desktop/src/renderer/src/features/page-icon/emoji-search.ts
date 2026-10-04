import donnees from 'emojibase-data/fr/compact.json';
import { normaliser } from '../slash-menu/slash-commands';

export interface EmojiEntry {
  emoji: string;
  /** Nom français, comme « livre ouvert ». */
  libelle: string;
  /** Nom et mots-clés, sans accents ni majuscules. */
  mots: string[];
  /** Famille Unicode (0 smileys… 9 drapeaux). */
  groupe: number;
}

/** Familles montrées, dans l'ordre d'Unicode. Les « composants » (teintes de peau seules) n'en sont pas. */
export const groupesDEmojis = [
  { groupe: 0, nom: 'Smileys et émotions' },
  { groupe: 1, nom: 'Personnes' },
  { groupe: 3, nom: 'Animaux et nature' },
  { groupe: 4, nom: 'Nourriture et boissons' },
  { groupe: 5, nom: 'Voyages et lieux' },
  { groupe: 6, nom: 'Activités' },
  { groupe: 7, nom: 'Objets' },
  { groupe: 8, nom: 'Symboles' },
  { groupe: 9, nom: 'Drapeaux' },
] as const;

const groupesMontres = new Set<number>(groupesDEmojis.map((groupe) => groupe.groupe));

/** Tous les emojis proposés, dans l'ordre d'Unicode. Données d'Emojibase (licence MIT), en français. */
export const emojis: EmojiEntry[] = donnees
  .filter((entree) => entree.group !== undefined && groupesMontres.has(entree.group))
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((entree) => ({
    emoji: entree.unicode,
    libelle: entree.label,
    mots: [entree.label, ...(entree.tags ?? [])].map(normaliser),
    groupe: entree.group as number,
  }));

/**
 * Emojis qui correspondent à la recherche, en français, sans accents :
 * d'abord ceux dont le nom commence par elle, puis ceux dont un mot du nom ou
 * un mot-clé commence par elle, puis ceux qui la contiennent.
 */
export function chercherEmojis(requete: string): EmojiEntry[] {
  const cherche = normaliser(requete);
  if (cherche === '') {
    return emojis;
  }
  const rang = (entree: EmojiEntry): number => {
    if (entree.mots[0]?.startsWith(cherche) === true) {
      return 0;
    }
    if (entree.mots.some((mot) => mot.split(/[\s-]+/).some((partie) => partie.startsWith(cherche)))) {
      return 1;
    }
    return entree.mots.some((mot) => mot.includes(cherche)) ? 2 : -1;
  };
  return emojis
    .map((entree) => ({ entree, rang: rang(entree) }))
    .filter((trouve) => trouve.rang !== -1)
    .sort((a, b) => a.rang - b.rang)
    .map((trouve) => trouve.entree);
}
