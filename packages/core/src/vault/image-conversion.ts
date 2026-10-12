import { joindreChemins } from '../fs/paths';
import type { LocalFs } from '../fs/local-fs';
import { fichierPage } from '../page/types';
import { ajouterImage, dossierAssets, natureDImage } from './assets';
import type { ImageKind } from './assets';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { estIgnore } from './tree';

/**
 * Conversion des images en WebP (docs/spec/editeur.md, décision du 2026-10-03) : toute
 * image reçue est enregistrée en WebP compressé, et les images déjà dans le
 * dossier des notes se convertissent à la demande. La conversion elle-même
 * (décodage, réduction, compression) est faite par l'application, qui a un
 * moteur d'images ; ici, seulement ce qui touche aux fichiers du vault.
 */

/** Natures converties. Un GIF (souvent animé) et un SVG (vectoriel) restent tels quels. */
export const naturesAConvertir: readonly ImageKind[] = ['png', 'jpg', 'webp', 'avif'];

/** Le nom d'une image une fois convertie : même nom, extension `.webp`. */
export function nomEnWebp(nom: string | null): string | null {
  return nom === null ? null : `${nom.replace(/\.[^./]*$/, '')}.webp`;
}

const echapper = (texte: string): string => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Remplace, dans le texte d'une page, l'adresse de l'image `assets/<ancien>`
 * par `assets/<nouveau>`, seulement dans la cible d'un lien ou d'une image
 * Markdown. Un nom écrit encodé (`%C3%A9`) est remplacé encodé, un nom écrit
 * en clair reste en clair. Le reste du texte ne change pas d'un octet.
 */
export function remplacerImageDansTexte(texte: string, ancien: string, nouveau: string): { texte: string; remplacements: number } {
  let remplacements = 0;
  let resultat = texte;
  for (const [cherche, remplace] of [
    [ancien, nouveau],
    [encodeURIComponent(ancien), encodeURIComponent(nouveau)],
  ] as const) {
    const motif = new RegExp(`(\\]\\(\\s*<?(?:\\./)?${dossierAssets}/)${echapper(cherche)}(?=[#)\\s"'>])`, 'g');
    resultat = resultat.replace(motif, (_tout, debut: string) => {
      remplacements++;
      return `${debut}${remplace}`;
    });
    if (cherche === encodeURIComponent(ancien) && encodeURIComponent(ancien) === ancien) {
      break;
    }
  }
  return { texte: resultat, remplacements };
}

/** Une image à convertir : la page qui y renvoie et le nom du fichier dans son dossier `assets/`. */
export interface ImageToConvert {
  page: string;
  nom: string;
}

/**
 * Les images du dossier des notes à convertir : celles qu'une page affiche,
 * dans son dossier `assets/`, en PNG, JPEG ou AVIF. Une image déjà en WebP,
 * un GIF, un SVG ou une image dont plus aucune page ne parle ne sont pas
 * concernés. Ne modifie rien.
 */
export async function listerImagesAConvertir(fs: LocalFs): Promise<ImageToConvert[]> {
  const trouvees: ImageToConvert[] = [];
  const parcourir = async (dossier: string): Promise<void> => {
    const entrees = await fs.lister(dossier);
    const assets = entrees.find((entree) => entree.estDossier && entree.nom === dossierAssets);
    const page = entrees.find((entree) => !entree.estDossier && entree.nom === fichierPage);
    if (assets !== undefined && page !== undefined) {
      const texte = await fs.lireTexte(joindreChemins(dossier, fichierPage));
      for (const fichier of await fs.lister(joindreChemins(dossier, dossierAssets))) {
        if (fichier.estDossier || fichier.nom.startsWith('.') || remplacerImageDansTexte(texte, fichier.nom, fichier.nom).remplacements === 0) {
          continue;
        }
        const nature = natureDImage(await fs.lireOctets(joindreChemins(dossier, dossierAssets, fichier.nom)));
        if (nature !== null && nature !== 'webp' && naturesAConvertir.includes(nature)) {
          trouvees.push({ page: dossier, nom: fichier.nom });
        }
      }
    }
    for (const entree of entrees) {
      if (entree.estDossier && !estIgnore(entree.nom, true)) {
        await parcourir(joindreChemins(dossier, entree.nom));
      }
    }
  };
  await parcourir('');
  return trouvees;
}

/**
 * Remplace une image d'une page par sa version WebP : la copie est ajoutée
 * dans `assets/` (sans rien remplacer), puis la page renvoie à elle. L'ancien
 * fichier reste là : il apparaît dans les images inutilisées, on le supprime
 * soi-même. Rend l'adresse de la nouvelle image.
 */
export async function remplacerParWebp(contexte: VaultContext, page: string, ancien: string, octets: Uint8Array): Promise<string> {
  if (natureDImage(octets) !== 'webp') {
    throw new VaultError('chemin_invalide', "La version convertie n'est pas une image WebP.");
  }
  const cheminPage = joindreChemins(page, fichierPage);
  const avant = await contexte.fs.lireTexte(cheminPage);
  if (remplacerImageDansTexte(avant, ancien, ancien).remplacements === 0) {
    throw new VaultError('introuvable', `La page ne renvoie plus à « ${ancien} ».`);
  }
  const adresse = await ajouterImage(contexte, page, nomEnWebp(ancien), octets);
  const nouveau = decodeURIComponent(adresse.slice(dossierAssets.length + 1));
  // Relue juste avant d'écrire : les opérations sur le vault passent une à une (file du main).
  const { texte } = remplacerImageDansTexte(await contexte.fs.lireTexte(cheminPage), ancien, nouveau);
  await contexte.fs.ecrireTexte(cheminPage, texte);
  return adresse;
}
