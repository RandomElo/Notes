import { joindreChemins } from '../fs/paths';
import type { LocalFs } from '../fs/local-fs';
import { nomDuFichierDeConflit } from '../page/conflict';
import { assemblerPage, decouperPage, lireSurcharges } from '../page/front-matter';
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
  /** Le front-matter tel qu'il est écrit, sans ses délimiteurs, ou null : l'export Markdown peut le garder (README §9). */
  enTete: string | null;
}

/** Le corps d'un élément de l'arborescence et ses surcharges de thème, lus en une fois. Ne modifie rien. */
export async function lireContenu(fs: LocalFs, chemin: string): Promise<PageContent> {
  const infos = chemin === '' ? null : await fs.infos(chemin);
  const fichier = infos?.estDossier === true ? cheminDuFichierPage(chemin) : chemin;
  if (infos === null || (await fs.infos(fichier)) === null) {
    throw new VaultError('introuvable', 'Cette page est introuvable.');
  }
  const morceaux = decouperPage(await fs.lireTexte(fichier));
  return { corps: morceaux.corps, surcharges: lireSurcharges(morceaux.enTete), enTete: morceaux.enTete };
}

export interface SaveRequest {
  /** Le corps à écrire. */
  corps: string;
  /** Le corps tel qu'il a été lu avant modification : sert à voir si le fichier a changé entre-temps. */
  corpsDeBase: string;
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
export async function enregistrerCorps(contexte: VaultContext, chemin: string, { corps, corpsDeBase }: SaveRequest): Promise<SaveResult> {
  const { fs } = contexte;
  const { texte } = await chargerPage(fs, chemin);
  const morceaux = decouperPage(texte);
  if (morceaux.corps === corps) {
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
  await fs.ecrireTexte(cheminDuFichierPage(chemin), modifierMetaDansTexte(assemble, { modifieLe: dateIso(contexte) }));
  return { ecrit: true, conflit };
}
