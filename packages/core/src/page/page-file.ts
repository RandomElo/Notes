import { joindreChemins } from '../fs/paths';
import type { LocalFs } from '../fs/local-fs';
import { assemblerPage, decouperPage, lireMeta, modifierEnTete } from './front-matter';
import type { FrontMatterChanges } from './front-matter';
import { fichierPage } from './types';
import type { PageFile } from './types';

/** Chemin du page.md d'une page à partir du chemin de son dossier. */
export function cheminDuFichierPage(dossier: string): string {
  return joindreChemins(dossier, fichierPage);
}

/** Interprète le contenu d'un page.md. */
export function analyserPage(texte: string): PageFile {
  const { enTete, corps } = decouperPage(texte);
  return { meta: lireMeta(enTete), enTete, corps };
}

/** Lit la page d'un dossier. */
export async function lirePage(fs: LocalFs, dossier: string): Promise<PageFile> {
  return analyserPage(await fs.lireTexte(cheminDuFichierPage(dossier)));
}

/**
 * Modifie le front-matter d'un contenu de page sans toucher au corps. Si la
 * page n'avait pas de front-matter, il est ajouté en tête.
 */
export function modifierMetaDansTexte(texte: string, changements: FrontMatterChanges): string {
  const morceaux = decouperPage(texte);
  return assemblerPage({
    ...morceaux,
    enTete: modifierEnTete(morceaux.enTete, changements),
    // Un front-matter ajouté à une page qui n'en avait pas se termine par une fin de ligne.
    apresFermeture: morceaux.enTete === null ? morceaux.finDeLigne : morceaux.apresFermeture,
  });
}

/** Contenu d'une page neuve : front-matter complet, corps fourni. */
export function texteDePageNeuve(meta: Required<Pick<FrontMatterChanges, 'id' | 'titre' | 'creeLe' | 'modifieLe'>>, corps = ''): string {
  return assemblerPage({ bom: '', enTete: modifierEnTete(null, meta), corps, finDeLigne: '\n', apresFermeture: '\n' });
}
