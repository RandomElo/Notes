import { niveauxDeTitre, nomsDeCouleur } from '@notes/ui';
import type { ColorName } from '@notes/ui';

/** Nom affiché de chaque couleur de la palette. */
export const libellesDeCouleur: Record<ColorName, string> = {
  background: 'Fond',
  surface: 'Surface',
  border: 'Bordure',
  text: 'Texte',
  muted: 'Texte discret',
  accent: 'Accent',
  success: 'Succès',
  warning: 'Alerte',
  error: 'Erreur',
};

export interface FormField {
  /** Chemin du réglage dans le thème (`heading.h2.size`). */
  chemin: string;
  libelle: string;
}

export interface FormSection {
  titre: string;
  aide?: string;
  champs: FormField[];
}

const signes = ['#', '##', '###', '####', '#####'];

/** Le formulaire des réglages : les réglages du thème, regroupés et nommés en français. */
export const sectionsDuFormulaire: FormSection[] = [
  {
    titre: 'Couleurs',
    aide: 'La palette. Les titres, les puces et le code y renvoient par leur nom.',
    champs: nomsDeCouleur.map((nom) => ({ chemin: `colors.${nom}`, libelle: libellesDeCouleur[nom] })),
  },
  {
    titre: 'Texte',
    champs: [
      { chemin: 'typography.font', libelle: 'Police' },
      { chemin: 'typography.mono', libelle: 'Police du code' },
      { chemin: 'typography.size', libelle: 'Taille' },
      { chemin: 'typography.line_height', libelle: 'Interligne' },
    ],
  },
  ...niveauxDeTitre.map((niveau, index) => ({
    titre: `Titre ${index + 1}`,
    aide: `Ce que donne ${signes[index]} dans le texte.`,
    champs: [
      { chemin: `heading.${niveau}.size`, libelle: 'Taille' },
      { chemin: `heading.${niveau}.weight`, libelle: 'Graisse' },
      { chemin: `heading.${niveau}.color`, libelle: 'Couleur' },
      { chemin: `heading.${niveau}.margin_top`, libelle: 'Espace au-dessus' },
      { chemin: `heading.${niveau}.italic`, libelle: 'Italique' },
      { chemin: `heading.${niveau}.underline`, libelle: 'Trait dessous' },
    ],
  })),
  {
    titre: 'Puces',
    aide: 'Couleur des puces selon le niveau de la liste.',
    champs: [
      { chemin: 'list.bullet_1', libelle: 'Niveau 1' },
      { chemin: 'list.bullet_2', libelle: 'Niveau 2' },
      { chemin: 'list.bullet_3', libelle: 'Niveau 3' },
    ],
  },
  {
    titre: 'Code',
    champs: [
      { chemin: 'code.background', libelle: 'Fond' },
      { chemin: 'code.font_size', libelle: 'Taille' },
    ],
  },
  {
    titre: 'Interface',
    champs: [
      { chemin: 'ui.content_width', libelle: 'Largeur du texte' },
      { chemin: 'ui.sidebar_width', libelle: "Largeur de l'arborescence" },
      { chemin: 'ui.radius', libelle: 'Arrondi' },
      { chemin: 'ui.transition', libelle: 'Durée des transitions' },
    ],
  },
];

/**
 * Réglages qui n'ont pas encore d'effet (coloration du code, callouts et
 * tableaux arrivent en J6) : ils restent dans le fichier, pas dans le formulaire.
 */
export const prefixesMasques = ['code.syntax.', 'callout.', 'table.'];

export const unitesDeTaille = ['rem', 'px', 'em', '%'] as const;

/** « 1.3rem » → nombre et unité, pour les deux champs d'une taille. null si ce n'est pas une taille. */
export function decouperTaille(valeur: string): { nombre: string; unite: string } | null {
  const trouve = /^(\d*\.?\d+)(rem|em|px|%)$/.exec(valeur);
  return trouve === null ? null : { nombre: trouve[1] as string, unite: trouve[2] as string };
}

/** Une couleur sur six chiffres, comme en veut le sélecteur de couleur du navigateur. null si elle n'est pas en hexadécimal. */
export function surSixChiffres(couleur: string): string | null {
  const trouve = /^#([0-9a-f]{3,8})$/i.exec(couleur);
  if (trouve === null) {
    return null;
  }
  const chiffres = trouve[1] as string;
  if (chiffres.length === 3 || chiffres.length === 4) {
    return `#${[...chiffres.slice(0, 3)].map((chiffre) => chiffre + chiffre).join('')}`.toLowerCase();
  }
  return chiffres.length === 6 || chiffres.length === 8 ? `#${chiffres.slice(0, 6)}`.toLowerCase() : null;
}
