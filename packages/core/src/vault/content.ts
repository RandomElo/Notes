import { joindreChemins } from '../fs/paths';
import type { LocalFs } from '../fs/local-fs';
import { nomDuFichierDeConflit } from '../page/conflict';
import { assemblerPage, decouperPage, lireLargeursDesTableaux, lireSurcharges } from '../page/front-matter';
import { cheminDuFichierPage, modifierMetaDansTexte } from '../page/page-file';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { chargerPage, dateIso } from './operations';

/**
 * Le corps d'une page : tout ce qui suit le front-matter. Pour core c'est une
 * chaîne opaque, lue et écrite telle quelle.
 */

/**
 * Lit le corps d'un élément de l'arborescence, importé ou non : le page.md
 * d'un dossier, ou un fichier .md posé là par un autre outil. Ne modifie rien.
 */
export async function lireCorps(fs: LocalFs, chemin: string): Promise<string> {
  return (await lireContenu(fs, chemin)).corps;
}

export interface PageContent {
  corps: string;
  /** Surcharges de thème du front-matter (`theme_overrides`), non vérifiées. */
  surcharges: Record<string, string>;
  /** Le front-matter tel qu'il est écrit, sans ses délimiteurs, ou null : l'export Markdown peut le garder (docs/spec/export.md). */
  enTete: string | null;
  /** Largeur des colonnes de chaque tableau, dans l'ordre de la page (`table_widths`). */
  largeursDesTableaux: number[][];
}

/** Le corps d'un élément de l'arborescence et ses surcharges de thème, lus en une fois. Ne modifie rien. */
export async function lireContenu(fs: LocalFs, chemin: string): Promise<PageContent> {
  const infos = chemin === '' ? null : await fs.infos(chemin);
  const fichier = infos?.estDossier === true ? cheminDuFichierPage(chemin) : chemin;
  if (infos === null || (await fs.infos(fichier)) === null) {
    throw new VaultError('introuvable', 'Cette page est introuvable.');
  }
  const morceaux = decouperPage(await fs.lireTexte(fichier));
  return { corps: morceaux.corps, surcharges: lireSurcharges(morceaux.enTete), enTete: morceaux.enTete, largeursDesTableaux: lireLargeursDesTableaux(morceaux.enTete) };
}

export interface SaveRequest {
  /** Le corps à écrire. */
  corps: string;
  /** Le corps tel qu'il a été lu avant modification : sert à voir si le fichier a changé entre-temps. */
  corpsDeBase: string;
  /** Largeur des colonnes de chaque tableau du corps, dans l'ordre. Absent : l'en-tête n'y touche pas. */
  largeursDesTableaux?: number[][];
}

export interface SaveResult {
  /** Faux si le fichier contenait déjà ce corps : rien n'a été écrit. */
  ecrit: boolean;
  /** Nom de la sauvegarde de la version trouvée sur le disque, si elle différait de la base. */
  conflit: string | null;
}

/**
 * Enregistre le corps d'une page importée. Le front-matter est conservé, seule
 * sa date de modification change.
 *
 * Jamais d'écrasement silencieux : si le fichier n'est plus celui qui a été lu
 * (modifié par un autre outil ou par la sync), sa version est d'abord gardée à
 * côté, dans `page.conflit-[date].md`.
 */
export async function enregistrerCorps(contexte: VaultContext, chemin: string, { corps, corpsDeBase, largeursDesTableaux }: SaveRequest): Promise<SaveResult> {
  const { fs } = contexte;
  const { texte } = await chargerPage(fs, chemin);
  const morceaux = decouperPage(texte);
  const memesLargeurs = largeursDesTableaux === undefined || memesListes(lireLargeursDesTableaux(morceaux.enTete), largeursDesTableaux);
  if (morceaux.corps === corps && memesLargeurs) {
    return { ecrit: false, conflit: null };
  }

  let conflit: string | null = null;
  if (morceaux.corps !== corpsDeBase) {
    const dejaPris = (await fs.lister(chemin)).map((entree) => entree.nom);
    conflit = nomDuFichierDeConflit(new Date(contexte.maintenant()), dejaPris);
    await fs.ecrireTexte(joindreChemins(chemin, conflit), texte);
  }

  const assemble = assemblerPage({
    ...morceaux,
    corps,
    // Un fichier qui s'arrêtait juste après le front-matter : il faut une fin de ligne avant le corps.
    apresFermeture: morceaux.apresFermeture === '' && corps !== '' ? morceaux.finDeLigne : morceaux.apresFermeture,
  });
  await fs.ecrireTexte(
    cheminDuFichierPage(chemin),
    modifierMetaDansTexte(assemble, { modifieLe: dateIso(contexte), ...(memesLargeurs ? {} : { largeursDesTableaux: largeursDesTableaux ?? null }) }),
  );
  return { ecrit: true, conflit };
}

/** Deux listes de largeurs identiques ; une liste vide vaut une liste absente en fin. */
function memesListes(a: number[][], b: number[][]): boolean {
  const sansFin = (listes: number[][]): number[][] => {
    const copie = [...listes];
    while (copie.length > 0 && copie[copie.length - 1]!.length === 0) {
      copie.pop();
    }
    return copie;
  };
  return JSON.stringify(sansFin(a)) === JSON.stringify(sansFin(b));
}

/**
 * Change seulement la largeur des colonnes des tableaux d'une page (une bordure
 * glissée dans l'éditeur) : le corps ne bouge pas. Rien n'est écrit si elles
 * n'ont pas changé.
 */
export async function enregistrerLargeursDesTableaux(contexte: VaultContext, chemin: string, largeursDesTableaux: number[][]): Promise<boolean> {
  const { fs } = contexte;
  const { texte } = await chargerPage(fs, chemin);
  if (memesListes(lireLargeursDesTableaux(decouperPage(texte).enTete), largeursDesTableaux)) {
    return false;
  }
  await fs.ecrireTexte(cheminDuFichierPage(chemin), modifierMetaDansTexte(texte, { modifieLe: dateIso(contexte), largeursDesTableaux }));
  return true;
}
