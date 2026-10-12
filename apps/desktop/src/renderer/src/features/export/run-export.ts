import type { TreeNode } from '@notes/core';
import { exporterMarkdown } from '@notes/document';
import { documentHtmlAutonome, feuilleCommune, navigationDArchive, variablesDeSurcharge } from '@notes/ui';
import type { ArchiveNavigationEntry, Theme } from '@notes/ui';
import type { ExportResult } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { toutEnregistrer } from '../editor/pending-saves';
import { adresseDImage as adresseDImageDuVault, dossierDeLaPage } from '../images/image-url';
import { annuaireDesPages } from '../mentions/pages-directory';
import { adresseRelative, dossierDesImages, feuilleDeLArchive, nomDImageLibre, pagesDuPlan, planDeLArchive } from './archive-plan';
import type { ArchivePage } from './archive-plan';
import { imagesAEmporter, versDataUri } from './export-images';
import type { ExportOptions } from './export-options';
import { rendrePage } from './render-page';

const titreDePage = (id: string): string | null => annuaireDesPages.lire(id)?.titre ?? null;

interface PageRead {
  corps: string;
  enTete: string | null;
  surcharges: Record<string, string>;
}

/** Corps, front-matter et couleurs d'une page, lus sur le disque. null pour un élément sans page (dossier seul). */
async function lire(noeud: TreeNode): Promise<PageRead | null> {
  if (noeud.genre === 'dossier') {
    return null;
  }
  const lu = await api.lirePage({ chemin: noeud.chemin });
  if (!lu.ok) {
    throw new Error(`« ${noeud.titre} » n'a pas pu être lue : ${lu.erreur.message}`);
  }
  return lu;
}

/** Les images demandées, lues par le main. Une image illisible est simplement absente. */
async function lireImages(chemins: readonly string[]): Promise<Map<string, { octets: Uint8Array; type: string }>> {
  const images = new Map<string, { octets: Uint8Array; type: string }>();
  for (const chemin of chemins) {
    const lue = await api.lireImageDExport({ chemin });
    if (lue.ok) {
      images.set(chemin, { octets: lue.octets, type: lue.type });
    }
  }
  return images;
}

interface HtmlPageRequest {
  noeud: TreeNode;
  lu: PageRead;
  theme: Theme;
  papier: boolean;
  icones: boolean;
  /** Adresse de chaque image (chemin dans le dossier des notes) dans le fichier exporté. */
  images: ReadonlyMap<string, string>;
  lienVersLaPage?: (id: string) => string | null;
  navigation?: string | null;
  feuilleDeStyle?: string;
  /** Adresse finale d'une image d'après celle du rendu (archive). */
  adresseDImage?: (src: string) => string;
}

/** Le document HTML d'une page : rendue hors de l'écran, avec les images et les styles demandés. */
async function documentDeLaPage({ noeud, lu, theme, papier, icones, images, lienVersLaPage = () => null, navigation = null, feuilleDeStyle, adresseDImage }: HtmlPageRequest): Promise<string> {
  const dossier = dossierDeLaPage(noeud.chemin, noeud.genre);
  const rendu = await rendrePage({ corps: lu.corps, dossier, icone: noeud.icone, images, icones, lienVersLaPage, ...(adresseDImage === undefined ? {} : { adresseDImage }) });
  return documentHtmlAutonome({
    titre: noeud.titre,
    icone: rendu.icone,
    contenu: rendu.contenu,
    theme,
    surcharges: variablesDeSurcharge(lu.surcharges, theme).variables,
    papier,
    sommaire: rendu.sommaire,
    navigation,
    ...(feuilleDeStyle === undefined ? {} : { feuilleDeStyle }),
  });
}

/** Une page seule (page web, PDF) : ses images en adresses `data:`, dans le fichier. */
async function documentAutonome(noeud: TreeNode, lu: PageRead, theme: Theme, papier: boolean, icones: boolean): Promise<string> {
  const chemins = imagesAEmporter(lu.corps, noeud, dossierDeLaPage(noeud.chemin, noeud.genre), icones, annuaireDesPages.lire);
  const images = new Map([...(await lireImages(chemins))].map(([chemin, image]) => [chemin, versDataUri(image.octets, image.type)]));
  return documentDeLaPage({ noeud, lu, theme, papier, icones, images });
}

/** La navigation de l'archive vue depuis le fichier « depuis ». Une page laissée de côté y figure sans lien. */
function navigationDepuis(plan: ArchivePage, depuis: string, gardees: ReadonlySet<ArchivePage>): ArchiveNavigationEntry[] {
  const entree = (page: ArchivePage): ArchiveNavigationEntry => ({
    titre: page.noeud.titre,
    adresse: gardees.has(page) ? adresseRelative(depuis, page.fichier) : null,
    courante: page.fichier === depuis,
    enfants: page.enfants.filter(aUnePageGardee(gardees)).map(entree),
  });
  return [entree(plan)];
}

/** Vrai pour une page gardée, ou qui a une page gardée parmi ses descendants. */
const aUnePageGardee =
  (gardees: ReadonlySet<ArchivePage>) =>
  (page: ArchivePage): boolean =>
    gardees.has(page) || page.enfants.some(aUnePageGardee(gardees));

const encodeur = new TextEncoder();

/**
 * L'archive ZIP de la page et de ses sous-pages (docs/spec/export.md, choix d'Eloi) :
 * pages web reliées par une navigation, images et feuille de style communes
 * dans `assets/`. Les pages décochées dans la fenêtre d'export n'y sont pas.
 */
async function fichiersDeLArchive(noeud: TreeNode, exclues: ReadonlySet<string>, theme: Theme): Promise<{ chemin: string; octets: Uint8Array }[]> {
  const plan = planDeLArchive(noeud);
  const lues = new Map<ArchivePage, PageRead>();
  for (const page of pagesDuPlan(plan)) {
    const lu = exclues.has(page.noeud.chemin) ? null : await lire(page.noeud);
    if (lu !== null) {
      lues.set(page, lu);
    }
  }
  if (lues.size === 0) {
    throw new Error('Aucune page à exporter : coche au moins une page.');
  }
  const gardees = new Set(lues.keys());
  const fichierParId = new Map([...gardees].filter((page) => page.noeud.id !== null).map((page) => [(page.noeud.id as string).toLowerCase(), page.fichier]));

  // Toutes les images de l'archive, une fois chacune, dans `assets/images/`.
  const fichiers: { chemin: string; octets: Uint8Array }[] = [{ chemin: feuilleDeLArchive, octets: encodeur.encode(feuilleCommune(theme)) }];
  const placeDesImages = new Map<string, string>();
  const nomsPris = new Set<string>();
  for (const [page, lu] of lues) {
    const chemins = imagesAEmporter(lu.corps, page.noeud, dossierDeLaPage(page.noeud.chemin, page.noeud.genre), true, annuaireDesPages.lire).filter((chemin) => !placeDesImages.has(chemin));
    for (const [chemin, image] of await lireImages(chemins)) {
      const place = `${dossierDesImages}/${nomDImageLibre(chemin.split('/').pop() ?? 'image', nomsPris)}`;
      placeDesImages.set(chemin, place);
      fichiers.push({ chemin: place, octets: image.octets });
    }
  }

  // Au rendu, les images s'affichent par le protocole du main ; dans la page écrite, elles renvoient à `assets/images/`.
  const adresseDuRendu = new Map([...placeDesImages.keys()].map((chemin) => [chemin, adresseDImageDuVault('', chemin) ?? '']));
  const placeParAdresse = new Map([...placeDesImages].map(([chemin, place]) => [adresseDuRendu.get(chemin) ?? '', place]));
  for (const [page, lu] of lues) {
    const depuis = (cible: string): string => adresseRelative(page.fichier, cible);
    const html = await documentDeLaPage({
      noeud: page.noeud,
      lu,
      theme,
      papier: false,
      icones: true,
      images: adresseDuRendu,
      adresseDImage: (src) => {
        const place = placeParAdresse.get(src);
        return place === undefined ? src : depuis(place);
      },
      // Une mention d'une page de l'archive y mène ; les autres restent du texte.
      lienVersLaPage: (id) => {
        const cible = fichierParId.get(id.toLowerCase());
        return cible === undefined ? null : depuis(cible);
      },
      navigation: pagesDuPlan(plan).length > 1 ? navigationDArchive(navigationDepuis(plan, page.fichier, gardees)) : null,
      feuilleDeStyle: depuis(feuilleDeLArchive),
    });
    fichiers.push({ chemin: page.fichier, octets: encodeur.encode(html) });
  }
  return fichiers;
}

/**
 * Exporte une page (docs/spec/export.md) : enregistre d'abord ce qui est en attente, lit
 * la page sur le disque, prépare le fichier, puis le main demande où l'écrire.
 * « exclues » : chemins des sous-pages décochées, pour l'archive.
 */
export async function exporterLaPage(noeud: TreeNode, options: ExportOptions, theme: Theme, exclues: ReadonlySet<string> = new Set()): Promise<ExportResult> {
  await toutEnregistrer();
  try {
    if (options.format === 'zip') {
      return await api.exporter({ format: 'zip', nom: noeud.titre, fichiers: await fichiersDeLArchive(noeud, exclues, theme) });
    }
    const lu = await lire(noeud);
    if (lu === null) {
      return { ok: false, annule: false, message: "Ce dossier n'a pas de page à exporter." };
    }
    if (options.format === 'markdown') {
      const texte = exporterMarkdown(lu.corps, { titreDePage, enTete: options.enTete ? lu.enTete : null });
      return await api.exporter({ format: 'markdown', nom: noeud.titre, texte });
    }
    if (options.format === 'html') {
      return await api.exporter({ format: 'html', nom: noeud.titre, texte: await documentAutonome(noeud, lu, theme, false, true) });
    }
    const html = await documentAutonome(noeud, lu, theme, true, options.icones);
    return await api.exporter({ format: 'pdf', nom: noeud.titre, titre: noeud.titre, html, papier: 'A4', marges: options.marges });
  } catch (erreur) {
    return { ok: false, annule: false, message: erreur instanceof Error ? erreur.message : "L'export n'a pas pu être préparé." };
  }
}
