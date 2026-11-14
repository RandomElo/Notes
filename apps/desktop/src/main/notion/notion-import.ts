import { readFile, readdir, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import { aUneExtensionDImage, ajouterImage, ajouterPdf, changerIcone, creerPage, enregistrerCorps, longueurMaxTitre, natureDIcone, tailleMaxDImage, tailleMaxDePdf, titreParDefaut, verifierTitre } from '@notes/core';
import type { VaultContext } from '@notes/core';
import { analyserPageNotion, convertirPageNotion, estImageIntegree, lireCsv } from '@notes/document';
import type { NotionDatabaseChoice, NotionPageSummary } from '@notes/document';

/**
 * Import d'un export HTML de Notion (docs/spec/import-notion.md). L'export est
 * un dossier : chaque page est un fichier `Titre <id>.html`, ses sous-pages et
 * ses images dans le dossier `Titre <id>/` à côté. Les pages arrivent à la
 * racine du dossier des notes, dans la même arborescence ; une base de données
 * devient ce qu'Eloi a choisi pour elle.
 */

/** Pourquoi une page est proposée à la suppression (décochée d'office). */
export type NotionFlag = 'vide' | 'modele' | 'doublon' | 'sans-titre';

export interface NotionExportPage {
  /** Chemin du fichier HTML dans l'export, en `/`. */
  fichier: string;
  resume: NotionPageSummary;
  parent: string | null;
  enfants: string[];
  signalements: NotionFlag[];
  /** PDF joints à la page, avec leur taille en octets. */
  pdf: { nom: string; taille: number }[];
}

export interface NotionExportDatabase {
  /** `<fichier de la page>#<rang>` : la base, d'une analyse à l'import. */
  cle: string;
  titre: string;
  /** Titre de la page où elle se trouve. */
  page: string;
  /** Fichiers des pages de ses lignes. */
  lignes: string[];
  /** Son fichier `.csv` dans l'export, null pour une base en tableau HTML. */
  csv: string | null;
  /** La page qui n'est que cette base (base en pleine page), null sinon. */
  pageDeLaBase: string | null;
}

export interface NotionExport {
  dossier: string;
  pages: Map<string, NotionExportPage>;
  racines: string[];
  bases: NotionExportDatabase[];
  images: number;
}

const idNotion = /([0-9a-f]{32})(?:\.html?)?$/i;

/** L'identifiant de Notion d'un nom de fichier ou d'une adresse notion.so, sans tirets. */
export function idDeNotion(adresse: string): string | null {
  const sansAncre = adresse.split(/[?#]/)[0]!.replace(/-/g, '');
  return idNotion.exec(sansAncre)?.[1]?.toLowerCase() ?? null;
}

/** Une adresse relative d'un fichier HTML de l'export, ramenée à un chemin de l'export. null si elle en sort. */
export function cheminDansLExport(depuis: string, adresse: string): string | null {
  let decodee: string;
  try {
    decodee = decodeURIComponent(adresse.split(/[?#]/)[0]!);
  } catch {
    return null;
  }
  const chemin = posix.normalize(posix.join(posix.dirname(depuis), decodee));
  return chemin.startsWith('../') || chemin === '..' || posix.isAbsolute(chemin) ? null : chemin;
}

/** Un titre comparé à un autre : espaces resserrées, sans casse ni accents. */
function normaliserTitre(titre: string): string {
  return titre.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Titre accepté par Notes : coupé, une seule ligne, « Sans titre » s'il est vide. */
export function titreAccepte(titre: string): string {
  const propre = titre.replace(/\s+/g, ' ').trim().slice(0, longueurMaxTitre).trim();
  return propre !== '' && verifierTitre(propre) === null ? propre : titreParDefaut;
}

/** Le titre d'une page de l'export : le sien, ou son nom de fichier sans identifiant. */
export function titreDeLaPage(fichier: string, resume: NotionPageSummary): string {
  return titreAccepte(resume.titre || posix.basename(fichier).replace(/\.html?$/i, '').replace(/\s*[0-9a-f]{32}$/i, ''));
}

export async function analyserExport(dossier: string): Promise<NotionExport> {
  const entrees = await readdir(dossier, { recursive: true, withFileTypes: true });
  const fichiers = entrees
    .filter((entree) => entree.isFile())
    .map((entree) => posix.join(...posix.relative(dossier.replace(/\\/g, '/'), entree.parentPath.replace(/\\/g, '/')).split('/').filter((morceau) => morceau !== ''), entree.name));
  const pages = new Map<string, NotionExportPage>();
  for (const fichier of fichiers.filter((nom) => /\.html?$/i.test(nom))) {
    const html = await readFile(posix.join(dossier, fichier), 'utf8');
    if (!/class="[^"]*page-title/.test(html) && /^index\.html?$/i.test(posix.basename(fichier))) {
      // Sommaire de l'espace, pas une page.
      continue;
    }
    pages.set(fichier, { fichier, resume: analyserPageNotion(html), parent: null, enfants: [], signalements: [], pdf: [] });
  }

  // Une page a pour parent celle dont le dossier la contient : `A/B <id>.html` (ou `A <id>/B <id>.html`) est sous `A <id>.html`.
  // Deux pages sœurs de même titre partagent un nom de dossier : la bonne est celle qui renvoie à la sous-page.
  const parDossier = new Map<string, string[]>();
  for (const fichier of pages.keys()) {
    const radical = fichier.replace(/\.html?$/i, '');
    for (const dossierDeLaPage of new Set([radical, radical.replace(/\s+[0-9a-f]{32}$/i, '')])) {
      parDossier.set(dossierDeLaPage, [...(parDossier.get(dossierDeLaPage) ?? []), fichier]);
    }
  }
  for (const page of pages.values()) {
    const candidats = (parDossier.get(posix.dirname(page.fichier)) ?? []).filter((fichier) => fichier !== page.fichier);
    const renvoie = (fichier: string): boolean => pages.get(fichier)!.resume.liens.some((lien) => cheminDansLExport(fichier, lien) === page.fichier);
    const parent = candidats.find(renvoie) ?? candidats[0];
    if (parent !== undefined) {
      page.parent = parent;
      pages.get(parent)!.enfants.push(page.fichier);
    }
  }
  // Sous-pages dans l'ordre où leur page les montre, les autres ensuite par titre.
  const ordonner = (liste: string[], depuis: NotionExportPage | null): string[] => {
    const rangs = new Map<string, number>();
    depuis?.resume.liens.forEach((lien) => {
      const chemin = cheminDansLExport(depuis.fichier, lien);
      if (chemin !== null && !rangs.has(chemin)) {
        rangs.set(chemin, rangs.size);
      }
    });
    depuis?.resume.bases.forEach((base) =>
      base.lignes.forEach((ligne) => {
        const chemin = cheminDansLExport(depuis.fichier, ligne);
        if (chemin !== null && !rangs.has(chemin)) {
          rangs.set(chemin, rangs.size);
        }
      }),
    );
    const titre = (fichier: string): string => titreDeLaPage(fichier, pages.get(fichier)!.resume);
    return [...liste].sort((a, b) => (rangs.get(a) ?? Infinity) - (rangs.get(b) ?? Infinity) || titre(a).localeCompare(titre(b), 'fr'));
  };
  for (const page of pages.values()) {
    page.enfants = ordonner(page.enfants, page);
  }
  const racines = ordonner(
    [...pages.values()].filter((page) => page.parent === null).map((page) => page.fichier),
    null,
  );

  await signaler(pages, racines, dossier);

  const bases = [...pages.values()].flatMap((page) =>
    page.resume.bases.map((base) => {
      // Base en CSV : sa page est le fichier HTML de même nom, ses lignes en sont les sous-pages.
      const pageDeLaBase = base.csv === null ? undefined : pages.get(cheminDansLExport(page.fichier, base.csv)?.replace(/\.csv$/i, '.html') ?? '');
      const lignes =
        base.csv === null
          ? base.lignes.map((ligne) => cheminDansLExport(page.fichier, ligne)).filter((chemin): chemin is string => chemin !== null && pages.has(chemin))
          : (pageDeLaBase?.enfants ?? []);
      return {
        cle: `${page.fichier}#${base.rang}`,
        titre: base.titre || (pageDeLaBase === undefined ? titreDeLaPage(page.fichier, page.resume) : titreDeLaPage(pageDeLaBase.fichier, pageDeLaBase.resume)),
        page: titreDeLaPage(page.fichier, page.resume),
        lignes,
        csv: base.csv === null ? null : cheminDansLExport(page.fichier, base.csv),
        pageDeLaBase: pageDeLaBase?.fichier ?? null,
      };
    }),
  );
  const images = new Set(
    [...pages.values()].flatMap((page) => page.resume.images.map((image) => (estImageIntegree(image) ? image : cheminDansLExport(page.fichier, image))).filter((chemin) => chemin !== null)),
  ).size;
  return { dossier, pages, racines, bases, images };
}

/** Pages que Notion crée à l'ouverture d'un compte. */
const modelesDeNotion = new Set(["accueil de l'espace d'equipe", 'guide de demarrage', 'getting started', 'people', 'team home', 'personal home', 'quick note'].map((titre) => normaliserTitre(titre)));

/** Signalements et PDF de chaque page ; un doublon est signalé après sa première occurrence, dans l'ordre de l'arbre. */
async function signaler(pages: Map<string, NotionExportPage>, racines: readonly string[], dossier: string): Promise<void> {
  const vus = new Set<string>();
  const parcourir = async (fichier: string): Promise<void> => {
    const page = pages.get(fichier)!;
    const titre = normaliserTitre(page.resume.titre);
    if (page.resume.vide && page.enfants.length === 0) {
      page.signalements.push('vide');
    }
    if (modelesDeNotion.has(titre)) {
      page.signalements.push('modele');
    }
    if (titre === '' || titre === 'sans titre' || titre === 'untitled') {
      page.signalements.push('sans-titre');
    }
    const empreinte = `${titre}\n${page.resume.texte}`;
    if (vus.has(empreinte) && !page.signalements.includes('vide')) {
      page.signalements.push('doublon');
    }
    vus.add(empreinte);
    for (const adresse of page.resume.fichiers) {
      const chemin = cheminDansLExport(fichier, adresse);
      const infos = chemin === null ? null : await stat(posix.join(dossier, chemin)).catch(() => null);
      if (chemin !== null && infos?.isFile() === true && !page.pdf.some((pdf) => pdf.nom === posix.basename(chemin))) {
        page.pdf.push({ nom: posix.basename(chemin), taille: infos.size });
      }
    }
    for (const enfant of page.enfants) {
      await parcourir(enfant);
    }
  };
  for (const racine of racines) {
    await parcourir(racine);
  }
}

/** Aperçu d'une page de l'export, converti comme à l'import ; les images en `data:` (5 Mo au plus chacune), les mentions en texte. */
export async function apercuDePage(exportNotion: NotionExport, fichier: string): Promise<{ corps: string; images: Record<string, string> } | null> {
  const page = exportNotion.pages.get(fichier);
  if (page === undefined) {
    return null;
  }
  const html = await readFile(posix.join(exportNotion.dossier, fichier), 'utf8');
  const images: Record<string, string> = {};
  for (const adresse of page.resume.images) {
    if (estImageIntegree(adresse)) {
      images[adresse] = adresse;
      continue;
    }
    const chemin = cheminDansLExport(fichier, adresse);
    const source = chemin === null ? null : posix.join(exportNotion.dossier, chemin);
    const infos = source === null ? null : await stat(source).catch(() => null);
    const nature = chemin === null ? null : /\.([a-z0-9]+)$/i.exec(chemin)?.[1]?.toLowerCase();
    const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
    if (source !== null && infos?.isFile() === true && infos.size <= 5 * 1024 * 1024 && nature !== undefined && nature !== null && types[nature] !== undefined) {
      images[adresse] = `data:${types[nature]};base64,${(await readFile(source)).toString('base64')}`;
    }
  }
  const tableaux = new Map<string, string[][] | null>();
  for (const base of page.resume.bases) {
    const chemin = base.csv === null ? null : cheminDansLExport(fichier, base.csv);
    tableaux.set(base.csv ?? '', chemin === null ? null : lireCsv(await readFile(posix.join(exportNotion.dossier, chemin), 'utf8').catch(() => '')));
  }
  const converti = convertirPageNotion(html, {
    page: () => null,
    image: (adresse) => (images[adresse] === undefined ? null : adresse),
    fichier: () => null,
    base: () => 'tableau',
    csv: (adresse) => tableaux.get(adresse) ?? null,
    ligne: () => null,
  });
  return { corps: converti.corps, images };
}

/** Pages à ne pas créer : les lignes des bases montrées en tableau seul ou ignorées, les pages décochées, et ce qui est dessous. */
export function pagesEcartees(exportNotion: NotionExport, choix: ReadonlyMap<string, NotionDatabaseChoice>, exclues: Iterable<string> = []): Set<string> {
  const ecartees = new Set<string>();
  const ecarter = (fichier: string): void => {
    if (ecartees.has(fichier)) {
      return;
    }
    ecartees.add(fichier);
    exportNotion.pages.get(fichier)?.enfants.forEach(ecarter);
  };
  for (const fichier of exclues) {
    ecarter(fichier);
  }
  for (const base of exportNotion.bases) {
    const choisi = choix.get(base.cle) ?? 'tableau-et-pages';
    if (choisi === 'tableau' || choisi === 'ignorer') {
      base.lignes.forEach(ecarter);
    }
    // Une base en pleine page qu'on n'importe pas : sa page, vide, non plus.
    if (choisi === 'ignorer' && base.pageDeLaBase !== null && `${base.pageDeLaBase}#0` === base.cle) {
      ecarter(base.pageDeLaBase);
    }
  }
  return ecartees;
}

export interface NotionImportResult {
  pages: number;
  /** Chaque avertissement avec le nombre de pages concernées. */
  avertissements: { message: string; pages: number }[];
}

export interface NotionImportOptions {
  contexte: VaultContext;
  exportNotion: NotionExport;
  choix: ReadonlyMap<string, NotionDatabaseChoice>;
  /** Pages décochées : ni elles, ni leurs sous-pages. */
  exclues?: Iterable<string>;
  /** Fait passer une opération sur le dossier des notes dans la file commune (ipc/vault.ts). */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  surProgression: (faites: number, total: number) => void;
  /** Vrai si l'import a été arrêté : on s'arrête à la page suivante. */
  arrete: () => boolean;
}

/** Crée les pages (d'abord toutes, pour que les mentions trouvent leur cible), puis écrit leur contenu. */
export async function importerExport({ contexte, exportNotion, choix, exclues = [], enSerie, surProgression, arrete }: NotionImportOptions): Promise<NotionImportResult> {
  const { pages, dossier } = exportNotion;
  const ecartees = pagesEcartees(exportNotion, choix, exclues);
  const ordre: { fichier: string; parent: string | null }[] = [];
  const parcourir = (fichier: string, parent: string | null): void => {
    if (ecartees.has(fichier)) {
      return;
    }
    ordre.push({ fichier, parent });
    pages.get(fichier)!.enfants.forEach((enfant) => parcourir(enfant, fichier));
  };
  exportNotion.racines.forEach((racine) => parcourir(racine, null));
  const total = ordre.length * 2;
  let faites = 0;
  surProgression(faites, total);

  const creees = new Map<string, { id: string; titre: string; chemin: string }>();
  const parIdDeNotion = new Map<string, { id: string; titre: string }>();
  for (const { fichier, parent } of ordre) {
    if (arrete()) {
      break;
    }
    const titre = titreDeLaPage(fichier, pages.get(fichier)!.resume);
    const cheminDuParent = parent === null ? '' : (creees.get(parent)?.chemin ?? null);
    if (cheminDuParent !== null) {
      const page = await enSerie(() => creerPage(contexte, { parent: cheminDuParent, titre }));
      creees.set(fichier, { id: page.id, titre, chemin: page.chemin });
      const id = idDeNotion(fichier);
      if (id !== null) {
        parIdDeNotion.set(id, { id: page.id, titre });
      }
    }
    surProgression(++faites, total);
  }

  const avertissements = new Map<string, number>();
  for (const { fichier } of ordre) {
    const page = creees.get(fichier);
    if (page === undefined || arrete()) {
      continue;
    }
    const { resume } = pages.get(fichier)!;
    const html = await readFile(posix.join(dossier, fichier), 'utf8');
    const images = await copierLesFichiers(contexte, enSerie, dossier, fichier, page.chemin, resume.images, 'image');
    const pdf = await copierLesFichiers(contexte, enSerie, dossier, fichier, page.chemin, resume.fichiers, 'pdf');
    const tableaux = new Map<string, string[][] | null>();
    for (const base of resume.bases) {
      const chemin = base.csv === null ? null : cheminDansLExport(fichier, base.csv);
      tableaux.set(base.csv ?? '', chemin === null ? null : lireCsv(await readFile(posix.join(dossier, chemin), 'utf8').catch(() => '')));
    }
    const lignesDeLaBase = (adresseCsv: string): string[] => {
      const chemin = cheminDansLExport(fichier, adresseCsv);
      return chemin === null ? [] : (pages.get(chemin.replace(/\.csv$/i, '.html'))?.enfants ?? []);
    };
    const converti = convertirPageNotion(html, {
      page: (adresse) => {
        const chemin = /^https?:/i.test(adresse) ? null : cheminDansLExport(fichier, adresse);
        const cible = chemin === null ? undefined : creees.get(chemin);
        if (cible !== undefined) {
          return { id: cible.id, titre: cible.titre, sousPage: chemin !== null && pages.get(chemin)?.parent === fichier };
        }
        const id = idDeNotion(adresse);
        return (id === null ? undefined : parIdDeNotion.get(id)) ?? null;
      },
      image: (adresse) => images.get(adresse) ?? null,
      fichier: (adresse) => pdf.get(adresse) ?? null,
      base: (rang) => choix.get(`${fichier}#${rang}`) ?? 'tableau-et-pages',
      csv: (adresse) => tableaux.get(adresse) ?? null,
      ligne: (adresseCsv, titre) => {
        const cle = normaliserTitre(titre);
        const trouvee = lignesDeLaBase(adresseCsv).map((ligne) => creees.get(ligne)).find((cible) => cible !== undefined && normaliserTitre(cible.titre) === cle);
        return trouvee === undefined ? null : { id: trouvee.id, titre: trouvee.titre };
      },
    });
    await enSerie(() => enregistrerCorps(contexte, page.chemin, { corps: converti.corps, corpsDeBase: '' }));
    const icone = resume.icone === null ? null : resume.icone.nature === 'emoji' ? resume.icone.valeur : (images.get(resume.icone.adresse) ?? null);
    const valeur = icone === null ? null : decodeURIComponent(icone);
    if (valeur !== null && natureDIcone(valeur) !== null) {
      await enSerie(() => changerIcone(contexte, page.chemin, valeur)).catch(() => undefined);
    }
    for (const message of converti.avertissements) {
      avertissements.set(message, (avertissements.get(message) ?? 0) + 1);
    }
    surProgression(++faites, total);
  }
  return { pages: creees.size, avertissements: [...avertissements].map(([message, nombre]) => ({ message, pages: nombre })) };
}

/** Copie les images ou les PDF d'une page dans son dossier ; rend, pour chaque adresse du HTML, celle de la copie. */
async function copierLesFichiers(
  contexte: VaultContext,
  enSerie: NotionImportOptions['enSerie'],
  dossier: string,
  fichier: string,
  page: string,
  adresses: readonly string[],
  nature: 'image' | 'pdf',
): Promise<Map<string, string>> {
  const copies = new Map<string, string>();
  for (const adresse of adresses) {
    if (nature === 'image' && estImageIntegree(adresse)) {
      try {
        const octets = new Uint8Array(Buffer.from(adresse.slice(adresse.indexOf(',') + 1), 'base64'));
        copies.set(adresse, await enSerie(() => ajouterImage(contexte, page, null, octets)));
      } catch {
        // Image mal formée ou d'un format inconnu : elle manquera.
      }
      continue;
    }
    const chemin = cheminDansLExport(fichier, adresse);
    if (chemin === null || (nature === 'image' ? !aUneExtensionDImage(chemin) : !/\.pdf$/i.test(chemin))) {
      continue;
    }
    try {
      const source = posix.join(dossier, chemin);
      const infos = await stat(source);
      if (!infos.isFile() || infos.size > (nature === 'image' ? tailleMaxDImage : tailleMaxDePdf)) {
        continue;
      }
      const octets = new Uint8Array(await readFile(source));
      const ajouter = nature === 'image' ? ajouterImage : ajouterPdf;
      copies.set(adresse, await enSerie(() => ajouter(contexte, page, posix.basename(chemin), octets)));
    } catch {
      // Fichier absent ou d'une autre nature : il manquera, la page le signale.
    }
  }
  return copies;
}
