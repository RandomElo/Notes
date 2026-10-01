import { dossierParent, joindreChemins, nomDeBase } from '../fs/paths';
import { decouperPage, lireChampsExistants } from '../page/front-matter';
import { nomDeDossier, nomLibre, titreParDefaut, verifierTitre } from '../page/naming';
import { analyserPage, cheminDuFichierPage, modifierMetaDansTexte, texteDePageNeuve } from '../page/page-file';
import { fichierPage } from '../page/types';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { ecrireOrdre, lireOrdre } from './order';
import { dateIso, nomsPris, nouvelId, verifierParent } from './operations';
import type { PageLocation } from './operations';
import { estIgnore } from './tree';

/**
 * Importe un élément venu d'un autre outil : il reçoit un identifiant et un
 * front-matter, et devient une page. C'est la seule fonction qui écrit dans
 * un élément non importé, et elle n'est appelée que sur demande explicite.
 *
 * - fichier `Titre.md` : devient le dossier `Titre/` avec son `page.md` ;
 * - dossier avec un `page.md` sans front-matter valide : le front-matter est complété ;
 * - dossier sans `page.md` : une page vide est créée, au nom du dossier.
 *
 * Le corps du fichier n'est jamais modifié.
 */
export async function importer(contexte: VaultContext, chemin: string): Promise<PageLocation> {
  const { fs } = contexte;
  const entree = chemin === '' ? null : await fs.infos(chemin);
  // Rien de ce qui est caché ou rangé dans un dossier ignoré (`.notes`, `.trash`, `assets`) ne s'importe.
  const dansUnDossierIgnore = chemin.split('/').slice(0, -1).some((segment) => estIgnore(segment, true));
  if (entree === null || dansUnDossierIgnore || estIgnore(nomDeBase(chemin), entree.estDossier)) {
    throw new VaultError('introuvable', 'Cet élément est introuvable.');
  }
  const parent = dossierParent(chemin);
  try {
    await verifierParent(fs, parent);
  } catch {
    throw new VaultError('non_importee', "Importe d'abord le dossier qui contient cet élément.");
  }

  const id = nouvelId(contexte);
  const date = dateIso(contexte);
  const completer = (texte: string, titreDeRepli: string): string => {
    const existants = lireChampsExistants(decouperPage(texte).enTete);
    return modifierMetaDansTexte(texte, {
      id,
      titre: existants.titre ?? titreUtilisable(titreDeRepli),
      creeLe: existants.creeLe ?? date,
      modifieLe: date,
    });
  };

  let cheminPage = chemin;
  if (!entree.estDossier) {
    const nom = nomDeBase(chemin).slice(0, -'.md'.length);
    cheminPage = joindreChemins(parent, nomLibre(nomDeDossier(nom), await nomsPris(fs, parent)));
    const texte = await fs.lireTexte(chemin);
    await fs.creerDossier(cheminPage);
    await fs.ecrireTexte(cheminDuFichierPage(cheminPage), completer(texte, nom));
    // L'original n'est retiré qu'une fois la page écrite.
    await fs.supprimer(chemin);
  } else if ((await fs.infos(joindreChemins(chemin, fichierPage))) === null) {
    await fs.ecrireTexte(
      cheminDuFichierPage(chemin),
      texteDePageNeuve({ id, titre: titreUtilisable(nomDeBase(chemin)), creeLe: date, modifieLe: date }),
    );
  } else {
    const texte = await fs.lireTexte(cheminDuFichierPage(chemin));
    if (analyserPage(texte).meta !== null) {
      throw new VaultError('deja_importee', 'Cette page est déjà importée.');
    }
    await fs.ecrireTexte(cheminDuFichierPage(chemin), completer(texte, nomDeBase(chemin)));
  }

  // Si le parent a un ordre manuel, la nouvelle page se range à la fin ; sinon l'ordre par titre s'applique.
  const ordre = await lireOrdre(fs, parent);
  if (ordre.length > 0) {
    await ecrireOrdre(fs, parent, [...ordre, id]);
  }
  return { chemin: cheminPage, id };
}

function titreUtilisable(titre: string): string {
  return verifierTitre(titre) === null ? titre.trim() : titreParDefaut;
}
