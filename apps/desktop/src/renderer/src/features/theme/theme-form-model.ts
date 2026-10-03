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
  /** Explication montrée dans une infobulle, à côté du libellé. */
  aide?: string;
  /** Pour une police : la famille proposée (texte ou code). */
  police?: FontFamilyKind;
}

export interface FormSection {
  titre: string;
  /** Explication montrée dans une infobulle, à côté du titre. */
  aide?: string;
  champs: FormField[];
  /** Réglage secondaire : rangé dans « Autres réglages », replié au départ. */
  avance?: boolean;
}

const signes = ['#', '##', '###', '####', '#####'];

const aideCouleurDeTitre =
  "Une couleur de la palette (Texte, Accent...) suit la palette : si tu changes l'Accent plus bas, ce titre change aussi. « Couleur choisie » garde la couleur que tu prends dans le carré, rien qu'à ce titre.";

/**
 * Le formulaire des réglages, dans l'ordre où on s'en sert : les titres
 * d'abord, puis le texte, puis la palette. Le reste est replié.
 */
export const sectionsDuFormulaire: FormSection[] = [
  ...niveauxDeTitre.map((niveau, index) => ({
    titre: `Titre ${index + 1}`,
    aide: `Ce que donne ${signes[index]} en début de ligne. Le titre de la page, tout en haut, n'en fait pas partie.`,
    champs: [
      { chemin: `heading.${niveau}.color`, libelle: 'Couleur', aide: aideCouleurDeTitre },
      { chemin: `heading.${niveau}.size`, libelle: 'Taille' },
      { chemin: `heading.${niveau}.weight`, libelle: 'Graisse' },
      { chemin: `heading.${niveau}.margin_top`, libelle: 'Espace au-dessus' },
      { chemin: `heading.${niveau}.italic`, libelle: 'Italique' },
      { chemin: `heading.${niveau}.underline`, libelle: 'Trait dessous' },
    ],
  })),
  {
    titre: 'Texte',
    champs: [
      {
        chemin: 'typography.line_height',
        libelle: 'Interligne',
        aide: "Hauteur d'une ligne par rapport à la taille du texte : 1,65 laisse un peu plus de la moitié d'une ligne d'air.",
      },
      { chemin: 'typography.size', libelle: 'Taille' },
      { chemin: 'typography.font', libelle: 'Police', police: 'texte' },
      { chemin: 'typography.mono', libelle: 'Police du code', police: 'code' },
    ],
  },
  {
    titre: 'Palette',
    aide: "Les neuf couleurs de base de l'application. Les titres, les puces et le code ne choisissent pas une valeur mais une de ces couleurs par son nom : changer l'Accent ici change tout ce qui utilise l'Accent.",
    champs: nomsDeCouleur.map((nom) => ({ chemin: `colors.${nom}`, libelle: libellesDeCouleur[nom] })),
  },
  {
    titre: 'Puces',
    aide: 'Couleur des puces selon le niveau de la liste.',
    avance: true,
    champs: [
      { chemin: 'list.bullet_1', libelle: 'Niveau 1' },
      { chemin: 'list.bullet_2', libelle: 'Niveau 2' },
      { chemin: 'list.bullet_3', libelle: 'Niveau 3' },
    ],
  },
  {
    titre: 'Code',
    avance: true,
    champs: [
      { chemin: 'code.line_numbers', libelle: 'Numéros de ligne' },
      { chemin: 'code.wrap', libelle: 'Retour à la ligne', aide: 'Sans retour à la ligne, une ligne trop longue fait défiler le bloc de côté.' },
      { chemin: 'code.background', libelle: 'Fond' },
      { chemin: 'code.font_size', libelle: 'Taille' },
    ],
  },
  {
    titre: 'Coloration du code',
    avance: true,
    champs: [
      { chemin: 'code.syntax.text', libelle: 'Texte' },
      { chemin: 'code.syntax.keyword', libelle: 'Mots-clés' },
      { chemin: 'code.syntax.control', libelle: 'Contrôle', aide: 'if, return, import… : les mots qui changent le cours du programme.' },
      { chemin: 'code.syntax.string', libelle: 'Chaînes' },
      { chemin: 'code.syntax.regex', libelle: 'Expressions régulières' },
      { chemin: 'code.syntax.number', libelle: 'Nombres' },
      { chemin: 'code.syntax.function', libelle: 'Fonctions' },
      { chemin: 'code.syntax.type', libelle: 'Types' },
      { chemin: 'code.syntax.variable', libelle: 'Variables' },
      { chemin: 'code.syntax.tag', libelle: 'Balises' },
      { chemin: 'code.syntax.attribute', libelle: 'Attributs' },
      { chemin: 'code.syntax.comment', libelle: 'Commentaires' },
    ],
  },
  {
    titre: 'Callouts',
    aide: 'Couleur de chaque nature de callout : son fond, léger, et sa barre à gauche.',
    avance: true,
    champs: [
      { chemin: 'callout.info', libelle: 'Info' },
      { chemin: 'callout.success', libelle: 'Succès' },
      { chemin: 'callout.warning', libelle: 'Attention' },
      { chemin: 'callout.danger', libelle: 'Danger' },
    ],
  },
  {
    titre: 'Tableaux',
    avance: true,
    champs: [
      { chemin: 'table.border', libelle: 'Bordures' },
      { chemin: 'table.header_background', libelle: "Fond de l'en-tête" },
    ],
  },
  {
    titre: 'Interface',
    avance: true,
    champs: [
      { chemin: 'ui.content_width', libelle: 'Largeur du texte' },
      { chemin: 'ui.sidebar_width', libelle: "Largeur de l'arborescence" },
      { chemin: 'ui.radius', libelle: 'Arrondi' },
      { chemin: 'ui.transition', libelle: 'Durée des transitions' },
    ],
  },
];

export type FontFamilyKind = 'texte' | 'code';

/**
 * Polices proposées, si elles sont installées sur le poste : les plus
 * courantes sous Linux. La police du système reste le choix par défaut.
 */
export const policesProposees: Record<FontFamilyKind, string[]> = {
  texte: [
    'Ubuntu',
    'Noto Sans',
    'Cantarell',
    'DejaVu Sans',
    'Liberation Sans',
    'Inter',
    'Roboto',
    'Open Sans',
    'Fira Sans',
    'Source Sans 3',
    'Lato',
    'IBM Plex Sans',
    'Noto Serif',
    'DejaVu Serif',
    'Liberation Serif',
    'Merriweather',
    'Georgia',
  ],
  code: [
    'JetBrains Mono',
    'Fira Code',
    'Ubuntu Mono',
    'DejaVu Sans Mono',
    'Liberation Mono',
    'Noto Sans Mono',
    'Source Code Pro',
    'Cascadia Code',
    'Hack',
    'IBM Plex Mono',
  ],
};

/** Polices de repli, si la police choisie manque sur un autre poste (le téléphone, par exemple). */
const replis: Record<FontFamilyKind, string> = { texte: 'sans-serif', code: 'monospace' };

/** La valeur écrite dans le thème pour une police choisie dans la liste. */
export function valeurDePolice(nom: string, famille: FontFamilyKind): string {
  return `'${nom}', ${replis[famille]}`;
}

/** Le nom de la police choisie dans une valeur du thème (`'Noto Sans', sans-serif` → `Noto Sans`), null si ce n'en est pas une de la liste. */
export function policeDeValeur(valeur: string, famille: FontFamilyKind): string | null {
  const nom = /^'([^']+)', (?:sans-serif|monospace)$/.exec(valeur)?.[1];
  return nom !== undefined && policesProposees[famille].includes(nom) ? nom : null;
}

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
