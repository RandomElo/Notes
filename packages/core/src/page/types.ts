/** Métadonnées d'une page, lues dans le front-matter YAML de son page.md. */
export interface PageMeta {
  /** UUID v7. C'est l'identité de la page, le nom du dossier n'en est qu'un reflet. */
  id: string;
  titre: string;
  /** Valeur brute du champ « icon » (emoji, nom Lucide ou image). Interprétée à partir de J8. */
  icone: string | null;
  /** Dates ISO 8601. */
  creeLe: string;
  modifieLe: string;
  mode: PageMode | null;
  /** Rôle particulier de la page : `memos` pour la page « Mémos vocaux » (README §13). Absent pour une page ordinaire. */
  role?: PageRole;
}

/** « todo » : la page se comporte comme une liste de tâches (README §14). */
export type PageMode = 'todo';
export type PageRole = 'memos';

/** Une page telle qu'elle est sur le disque. */
export interface PageFile {
  /** null si le fichier n'a pas de front-matter valide : page non importée. */
  meta: PageMeta | null;
  /** Bloc YAML entre les deux « --- », sans eux. null s'il n'y en a pas. */
  enTete: string | null;
  /** Tout ce qui suit le front-matter, tel quel. */
  corps: string;
}

/** Nom du fichier qui porte le contenu d'une page dans son dossier. */
export const fichierPage = 'page.md';
