import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { schema } from '../../schema/extensions';
import { ecrireMarkdown } from '../../markdown/serialize';
import { aLaClasse, classes, enfantsElements, estElement, estTexte, lireHtml, texteDe, trouver, trouverTous } from './notion-dom';
import type { ChildNode, Element } from './notion-dom';
import { articleDe, estAdresseDePage, estAdresseLocale, estLienCsv, estPdfLocal, iconeDe, texteDIcone, titreDe } from './notion-page';
import type { NotionIcon } from './notion-page';

/**
 * Conversion d'une page de l'export HTML de Notion en page de Notes
 * (docs/spec/import-notion.md). Chaque bloc de Notion devient un bloc du
 * schéma ; ce que Notes n'a pas (bloc dépliable, colonnes, couleurs) prend la
 * forme la plus proche, sans perdre le texte. Le Markdown sort de
 * `ecrireMarkdown` : il est toujours relu à l'identique.
 */

/** Ce que devient une base de données de Notion, choisi base par base. */
export type NotionDatabaseChoice = 'tableau-et-pages' | 'pages' | 'tableau' | 'ignorer';

export interface NotionResolver {
  /**
   * La page de Notes d'une adresse de l'export (fichier `.html` ou lien notion.so), null si elle n'est pas importée.
   * « sousPage » : c'est une sous-page directe de la page convertie.
   */
  page(adresse: string): { id: string; titre: string; sousPage?: boolean } | null;
  /** L'adresse dans la page de Notes d'une image copiée, null si elle n'a pas pu l'être. */
  image(adresse: string): string | null;
  /** L'adresse dans la page de Notes d'un PDF copié, null si elle n'a pas pu l'être. */
  fichier(adresse: string): string | null;
  /** Le choix pour la base de rang donné dans la page. */
  base(rang: number): NotionDatabaseChoice;
  /** Les lignes du fichier `.csv` d'une base (en-tête compris), null s'il est illisible. */
  csv(adresse: string): string[][] | null;
  /** La page importée d'une ligne de la base dont le `.csv` est à cette adresse, d'après son titre. */
  ligne(adresseCsv: string, titre: string): { id: string; titre: string } | null;
}

export interface ConvertedNotionPage {
  titre: string;
  icone: NotionIcon | null;
  corps: string;
  /** Ce qui n'a pas pu être repris tel quel, une phrase par point. */
  avertissements: string[];
}

interface Json {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Json[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}
type Marque = NonNullable<Json['marks']>[number];
/** Contenu en ligne, coupé en lignes aux sauts de ligne. */
type Lignes = Json[][];

const balisesDeBloc = new Set(['aside', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'div', 'figure', 'pre', 'blockquote', 'details', 'table', 'hr', 'nav', 'header', 'article', 'section']);

const paragraphe = (contenu: Json[] = []): Json => (contenu.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content: contenu });
const texte = (valeur: string, marques: Marque[] = []): Json => (marques.length === 0 ? { type: 'text', text: valeur } : { type: 'text', text: valeur, marks: marques });

class Convertisseur {
  private rangDeBase = 0;
  readonly avertissements: string[] = [];

  constructor(
    private readonly resolveur: NotionResolver,
    private readonly titreDeLaPage: string,
  ) {}

  private avertir(message: string): void {
    if (!this.avertissements.includes(message)) {
      this.avertissements.push(message);
    }
  }

  // Contenu en ligne

  enLignes(noeuds: readonly ChildNode[], marques: Marque[] = []): Lignes {
    const lignes: Lignes = [[]];
    const ajouter = (morceaux: Lignes): void => {
      morceaux.forEach((morceau, index) => {
        if (index > 0) {
          lignes.push([]);
        }
        lignes[lignes.length - 1]!.push(...morceau);
      });
    };
    for (const noeud of noeuds) {
      ajouter(this.enLigne(noeud, marques));
    }
    return lignes.map(nettoyerLigne);
  }

  private enLigne(noeud: ChildNode, marques: Marque[]): Lignes {
    if (estTexte(noeud)) {
      return noeud.data.split('\n').map((morceau) => (morceau === '' ? [] : [texte(morceau, marques)]));
    }
    if (!estElement(noeud)) {
      return [[]];
    }
    const nom = noeud.name;
    if (nom === 'br') {
      return [[], []];
    }
    if (nom === 'svg' || nom === 'script' || nom === 'style' || nom === 'img' || aLaClasse(noeud, 'icon')) {
      return [[]];
    }
    if (aLaClasse(noeud, 'notion-text-equation-token')) {
      // Le LaTeX est dans l'attribut (exports récents) ou dans l'annotation du MathML.
      const formule = trouver(noeud.children, (element) => element.name === 'annotation');
      const source = noeud.attribs['data-notion-inline-equation']?.trim() || (formule === null ? texteDe(noeud) : texteDe(formule));
      return [[texte(source, [{ type: 'code' }])]];
    }
    if (nom === 'a') {
      return this.lien(noeud, marques);
    }
    return this.enLignes(noeud.children, ajouterMarque(marques, marqueDe(noeud)));
  }

  private lien(element: Element, marques: Marque[]): Lignes {
    const adresse = element.attribs['href'] ?? '';
    if (estLienCsv(element)) {
      // Une base citée dans le texte : elle garde son rang, son nom reste en texte.
      this.rangDeBase++;
      return [[texte(posixBasename(adresse))]];
    }
    const cible = estAdresseDePage(adresse) || /notion\.(so|site)\//i.test(adresse) ? this.resolveur.page(adresse) : null;
    if (cible !== null) {
      return [[{ type: 'pageMention', attrs: { id: cible.id, libelle: cible.titre } }]];
    }
    const copie = estPdfLocal(adresse) ? this.resolveur.fichier(adresse) : null;
    if (/^(https?:|mailto:)/i.test(adresse) || copie !== null) {
      return this.enLignes(element.children, ajouterMarque(marques, { type: 'link', attrs: { href: copie ?? adresse } }));
    }
    return this.enLignes(element.children, marques);
  }

  /** Lignes en paragraphes, les lignes vides retirées. */
  private enParagraphes(lignes: Lignes): Json[] {
    return lignes.filter((ligne) => ligne.length > 0).map((ligne) => paragraphe(ligne));
  }

  /** Lignes en un seul contenu, sauts de ligne en espaces (titre, cellule sans saut). */
  private surUneLigne(lignes: Lignes): Json[] {
    return nettoyerLigne(lignes.filter((ligne) => ligne.length > 0).flatMap((ligne, index) => (index === 0 ? ligne : [texte(' '), ...ligne])));
  }

  // Blocs

  blocs(noeuds: readonly ChildNode[]): Json[] {
    const sortie: Json[] = [];
    let enAttente: ChildNode[] = [];
    const viderLeTexte = (): void => {
      sortie.push(...this.enParagraphes(this.enLignes(enAttente)));
      enAttente = [];
    };
    for (const noeud of noeuds) {
      const lienCsv = estElement(noeud) && estLienCsv(noeud);
      if (!lienCsv && (!estElement(noeud) || !balisesDeBloc.has(noeud.name))) {
        enAttente.push(noeud);
        continue;
      }
      viderLeTexte();
      for (const bloc of lienCsv ? this.baseCsv(noeud as Element) : this.bloc(noeud as Element)) {
        const precedent = sortie[sortie.length - 1];
        // Notion écrit chaque item dans sa propre liste : les listes voisines de même nature se rejoignent.
        if (precedent !== undefined && estListe(bloc) && precedent.type === bloc.type && precedent.attrs?.['notion'] === bloc.attrs?.['notion']) {
          precedent.content!.push(...bloc.content!);
        } else {
          sortie.push(bloc);
        }
      }
    }
    viderLeTexte();
    return sortie;
  }

  private bloc(element: Element): Json[] {
    const nom = element.name;
    if (/^h[1-6]$/.test(nom)) {
      const contenu = this.surUneLigne(this.enLignes(element.children));
      const niveau = Math.min(Number(nom.slice(1)), 5);
      return contenu.length === 0 ? [] : [{ type: 'heading', attrs: { level: niveau }, content: contenu }];
    }
    if (nom === 'p') {
      return this.enParagraphes(this.enLignes(element.children));
    }
    if (nom === 'hr') {
      return [{ type: 'horizontalRule' }];
    }
    if (nom === 'pre') {
      return [this.code(element)];
    }
    if (nom === 'blockquote') {
      const contenu = this.blocs(element.children);
      return contenu.length === 0 ? [] : [{ type: 'blockquote', content: contenu }];
    }
    if (nom === 'ul' || nom === 'ol') {
      return this.liste(element);
    }
    if (nom === 'details') {
      return this.depliable(element, true);
    }
    if (nom === 'aside' && aLaClasse(element, 'callout')) {
      return [this.callout(element)];
    }
    if (nom === 'div' && estMetadonneesDeBase(element)) {
      return [];
    }
    if (nom === 'table') {
      return this.tableau(element);
    }
    if (nom === 'figure') {
      return this.figure(element);
    }
    if (nom === 'nav' && aLaClasse(element, 'table_of_contents')) {
      return [];
    }
    if (nom === 'div' && aLaClasse(element, 'collection-content')) {
      return this.base(element);
    }
    if (nom === 'header' || (nom === 'table' && aLaClasse(element, 'properties'))) {
      return [];
    }
    // Colonnes, retraits et autres conteneurs : leur contenu, dans l'ordre.
    return this.blocs(element.children);
  }

  private code(element: Element): Json {
    const code = trouver(element.children, (enfant) => enfant.name === 'code') ?? element;
    const brut = texteBrutDe(code).replace(/\n$/, '');
    const langage = /language-(.+)$/i.exec(code.attribs['class'] ?? '')?.[1]?.trim().toLowerCase().replace(/\s+/g, '') ?? '';
    const reconnu = langage === '' || langage === 'plaintext' ? null : langage;
    return { type: 'codeBlock', attrs: { language: reconnu }, ...(brut === '' ? {} : { content: [texte(brut)] }) };
  }

  private liste(element: Element): Json[] {
    const items = enfantsElements(element).filter((enfant) => enfant.name === 'li');
    if (aLaClasse(element, 'toggle')) {
      return items.flatMap((item) => {
        const details = trouver(item.children, (enfant) => enfant.name === 'details');
        return details === null ? [{ type: 'bulletList', attrs: { tight: true, notion: 'puces' }, content: [this.item(item)] }] : this.depliable(details, true);
      });
    }
    if (aLaClasse(element, 'to-do-list')) {
      return enListes(
        items.map((item) => this.tache(item)),
        (contenu) => ({ type: 'taskList', attrs: { tight: true, notion: 'taches' }, content: contenu }),
      );
    }
    const numerotee = element.name === 'ol';
    const depart = Number(element.attribs['start'] ?? 1);
    return enListes(
      items.map((item) => this.item(item)),
      (contenu, rang) =>
        numerotee
          ? { type: 'orderedList', attrs: { start: (Number.isFinite(depart) ? depart : 1) + rang, tight: true, notion: 'numeros' }, content: contenu }
          : { type: 'bulletList', attrs: { tight: true, notion: 'puces' }, content: contenu },
    );
  }

  /** Un item : son texte en premier paragraphe, puis ses blocs. */
  private item(item: Element, type = 'listItem', attrs?: Record<string, unknown>): Json {
    const enLigne: ChildNode[] = [];
    const blocs: ChildNode[] = [];
    for (const enfant of item.children) {
      if (estElement(enfant) && aLaClasse(enfant, 'checkbox')) {
        continue;
      }
      (estBlocDItem(enfant) ? blocs : enLigne).push(enfant);
    }
    const lignes = this.enLignes(enLigne).filter((ligne) => ligne.length > 0);
    const suite = [...lignes.slice(1).map((ligne) => paragraphe(ligne)), ...this.blocs(blocs)];
    // Sans texte, l'item prend son premier paragraphe s'il en a un.
    const premier = lignes.length === 0 && suite[0]?.type === 'paragraph' ? suite.shift()! : paragraphe(lignes[0] ?? []);
    return { type, ...(attrs === undefined ? {} : { attrs }), content: [premier, ...suite] };
  }

  private tache(item: Element): Json {
    const caseACocher = trouver(item.children, (enfant) => aLaClasse(enfant, 'checkbox'));
    return this.item(item, 'taskItem', { checked: caseACocher !== null && aLaClasse(caseACocher, 'checkbox-on') });
  }

  /** Bloc dépliable : un titre dépliable devient un titre suivi de son contenu, un bloc dépliable un item de liste. */
  private depliable(details: Element, enItem: boolean): Json[] {
    const resume = trouver(details.children, (enfant) => enfant.name === 'summary');
    const reste = details.children.filter((enfant) => enfant !== resume);
    const titre = resume === null ? null : trouver(resume.children, (enfant) => /^h[1-6]$/.test(enfant.name));
    if (titre !== null) {
      return [...this.bloc(titre), ...this.blocs(reste)];
    }
    const contenu = resume === null ? [] : this.surUneLigne(this.enLignes(resume.children));
    const blocs = this.blocs(reste);
    if (!enItem) {
      return [...(contenu.length === 0 ? [] : [paragraphe(contenu)]), ...blocs];
    }
    return [{ type: 'bulletList', attrs: { tight: true, notion: 'puces' }, content: [{ type: 'listItem', content: [paragraphe(contenu), ...blocs] }] }];
  }

  private figure(figure: Element): Json[] {
    if (aLaClasse(figure, 'link-to-page')) {
      // Le bloc « page » de Notion : Notes montre déjà ses sous-pages sous le titre, il ne reste que les liens vers les autres.
      const lien = trouver(figure.children, (element) => element.name === 'a');
      const adresse = lien?.attribs['href'] ?? '';
      const cible = lien === null ? null : this.resolveur.page(adresse);
      // Vers une page de l'export qui n'est pas importée (décochée, ligne de base en tableau seul) : son titre seul n'aurait plus de sens.
      if (lien !== null && (cible?.sousPage === true || (cible === null && estAdresseDePage(adresse)))) {
        return [];
      }
    }
    if (aLaClasse(figure, 'callout')) {
      return [this.callout(figure)];
    }
    if (aLaClasse(figure, 'equation')) {
      const formule = trouver(figure.children, (element) => element.name === 'annotation');
      const source = formule === null ? texteDe(figure) : texteBrutDe(formule).trim();
      return source === '' ? [] : [{ type: 'codeBlock', attrs: { language: 'latex' }, content: [texte(source)] }];
    }
    const image = trouver(figure.children, (element) => element.name === 'img');
    if (aLaClasse(figure, 'image') && image !== null) {
      return this.image(figure, image);
    }
    const legende = trouver(figure.children, (element) => element.name === 'figcaption');
    const lien = trouver(figure.children, (element) => element.name === 'a');
    if (lien !== null) {
      const adresse = lien.attribs['href'] ?? '';
      const titre = trouver(lien.children, (element) => aLaClasse(element, 'bookmark-title'));
      const libelle = texteDe(titre ?? lien) || adresse;
      const contenu = this.surUneLigne(titre === null ? this.enLignes([lien]) : [[texte(libelle, [{ type: 'link', attrs: { href: adresse } }])]]);
      if (estAdresseLocale(adresse) && !estAdresseDePage(adresse)) {
        const copie = estPdfLocal(adresse) ? this.resolveur.fichier(adresse) : null;
        if (copie !== null) {
          return [paragraphe([texte(`📎 ${libelle}`, [{ type: 'link', attrs: { href: copie } }])])];
        }
        this.avertir(
          estPdfLocal(adresse)
            ? 'Des PDF de l’export sont introuvables ou trop gros : leur nom reste dans la page.'
            : 'Des fichiers joints (autres que des images et des PDF) ne sont pas importés : leur nom reste dans la page.',
        );
        return [paragraphe([texte(`📎 ${libelle}`)])];
      }
      return [paragraphe(contenu.length === 0 ? [texte(libelle)] : contenu), ...(legende === null ? [] : this.enParagraphes(this.enLignes(legende.children)))];
    }
    return this.blocs(figure.children);
  }

  private image(figure: Element, image: Element): Json[] {
    const adresse = image.attribs['src'] ?? '';
    const legende = trouver(figure.children, (element) => element.name === 'figcaption');
    const texteDeLegende = legende === null ? '' : texteDe(legende);
    if (/^https?:/i.test(adresse)) {
      return [paragraphe([texte(texteDeLegende || adresse, [{ type: 'link', attrs: { href: adresse } }])])];
    }
    const copie = this.resolveur.image(adresse);
    if (copie === null) {
      this.avertir('Des images de l’export sont introuvables, trop grandes ou d’un format que Notes ne lit pas (BMP, ICO) : elles manquent.');
      return texteDeLegende === '' ? [] : [paragraphe([texte(texteDeLegende)])];
    }
    return [{ type: 'image', attrs: { src: copie, alt: texteDeLegende } }];
  }

  private callout(figure: Element): Json {
    const icone = trouver(figure.children, (element) => aLaClasse(element, 'icon'));
    const emoji = figure.attribs['data-notion-callout-icon']?.trim() || (icone === null || icone.name === 'img' ? null : texteDIcone(icone) || null);
    const conteneurs = enfantsElements(figure).filter((enfant) => enfant.name === 'div');
    const contenu = conteneurs[conteneurs.length - 1] ?? figure;
    const paragraphes = this.blocs(contenu === icone ? [] : contenu.children)
      .flatMap((bloc) => (bloc.type === 'paragraph' ? [bloc] : texteDuBloc(bloc).map((ligne) => paragraphe([texte(ligne)]))))
      .filter((bloc) => bloc.content !== undefined);
    return { type: 'callout', attrs: { type: natureDuCallout(classes(figure)), icon: emoji }, content: paragraphes.length === 0 ? [paragraphe()] : paragraphes };
  }

  private tableau(tableau: Element, premiereColonne?: (cellule: Element) => Json[]): Json[] {
    const lignes = trouverTous(tableau.children, (element) => element.name === 'tr');
    if (lignes.length === 0) {
      return [];
    }
    const largeur = Math.max(...lignes.map((ligne) => enfantsElements(ligne).filter((cellule) => cellule.name === 'td' || cellule.name === 'th').length));
    const rangees = lignes.map((ligne, rang) => {
      const cellules = enfantsElements(ligne).filter((cellule) => cellule.name === 'td' || cellule.name === 'th');
      const type = rang === 0 ? 'tableHeader' : 'tableCell';
      const contenu = Array.from({ length: largeur }, (_vide, colonne) => {
        const cellule = cellules[colonne];
        const enLigne = cellule === undefined ? [] : colonne === 0 && rang > 0 && premiereColonne !== undefined ? premiereColonne(cellule) : this.cellule(cellule);
        return { type, content: [paragraphe(enLigne)] };
      });
      return { type: 'tableRow', content: contenu };
    });
    return [{ type: 'table', content: rangees }];
  }

  private cellule(cellule: Element): Json[] {
    const lignes = this.enLignes(cellule.children).filter((ligne) => ligne.length > 0);
    return lignes.flatMap((ligne, index) => (index === 0 ? ligne : [{ type: 'hardBreak' }, ...ligne]));
  }

  private base(bloc: Element): Json[] {
    const rang = this.rangDeBase++;
    const choix = this.resolveur.base(rang);
    const tableau = trouver(bloc.children, (element) => element.name === 'table');
    if (choix === 'ignorer' || choix === 'pages' || tableau === null) {
      return [];
    }
    const titre = trouver(bloc.children, (element) => aLaClasse(element, 'collection-title'));
    const texteDuTitre = titre === null ? '' : texteDe(titre);
    const entete = texteDuTitre === '' || texteDuTitre === this.titreDeLaPage ? [] : [{ type: 'heading', attrs: { level: 3 }, content: [texte(texteDuTitre)] }];
    const premiereColonne =
      choix === 'tableau-et-pages'
        ? (cellule: Element): Json[] => {
            const lien = trouver(cellule.children, (element) => element.name === 'a');
            const cible = lien === null ? null : this.resolveur.page(lien.attribs['href'] ?? '');
            return cible === null ? this.cellule(cellule) : [{ type: 'pageMention', attrs: { id: cible.id, libelle: cible.titre } }];
          }
        : (cellule: Element): Json[] => (texteDe(cellule) === '' ? [] : [texte(texteDe(cellule))]);
    return [...entete, ...this.tableau(tableau, premiereColonne)];
  }

  /** Base exportée en CSV : le tableau vient du fichier, ses lignes sont des sous-pages. */
  private baseCsv(lien: Element): Json[] {
    this.rangDeBase++;
    const choix = this.resolveur.base(this.rangDeBase - 1);
    if (choix === 'ignorer' || choix === 'pages') {
      return [];
    }
    const adresse = lien.attribs['href'] ?? '';
    const lignes = this.resolveur.csv(adresse);
    if (lignes === null || lignes.length === 0) {
      this.avertir('Des bases de données n’ont pas pu être lues : leur tableau manque.');
      return [];
    }
    const largeur = Math.max(...lignes.map((ligne) => ligne.length));
    const enCellule = (valeur: string): Json[] =>
      valeur
        .split(/\r?\n/)
        .map((morceau) => morceau.trim())
        .filter((morceau) => morceau !== '')
        .flatMap((morceau, index) => (index === 0 ? [texte(morceau)] : [{ type: 'hardBreak' }, texte(morceau)]));
    const rangees = lignes.map((ligne, rang) => ({
      type: 'tableRow',
      content: Array.from({ length: largeur }, (_vide, colonne) => {
        const valeur = ligne[colonne] ?? '';
        const cible = rang > 0 && colonne === 0 && choix === 'tableau-et-pages' && valeur.trim() !== '' ? this.resolveur.ligne(adresse, valeur.trim()) : null;
        const contenu = cible === null ? enCellule(valeur) : [{ type: 'pageMention', attrs: { id: cible.id, libelle: cible.titre } }];
        return { type: rang === 0 ? 'tableHeader' : 'tableCell', content: [paragraphe(contenu)] };
      }),
    }));
    return [{ type: 'table', content: rangees }];
  }

  /** Propriétés d'une page (ligne d'une base) : une puce par propriété remplie, en tête de page. */
  proprietes(article: readonly ChildNode[]): Json[] {
    const tableau = trouver(article, (element) => element.name === 'table' && aLaClasse(element, 'properties'));
    if (tableau === null) {
      return [];
    }
    const items = trouverTous(tableau.children, (element) => element.name === 'tr').flatMap((ligne) => {
      const nom = trouver(ligne.children, (element) => element.name === 'th');
      const valeur = trouver(ligne.children, (element) => element.name === 'td');
      if (nom === null || valeur === null) {
        return [];
      }
      const contenu = this.surUneLigne(this.enLignes(valeur.children));
      if (contenu.length === 0) {
        return [];
      }
      return [{ type: 'listItem', content: [paragraphe([texte(texteDe(nom), [{ type: 'bold' }]), texte(' : '), ...contenu])] }];
    });
    return items.length === 0 ? [] : [{ type: 'bulletList', attrs: { tight: true }, content: items }];
  }
}

/** Dans un item, ce qui suit son texte : sous-liste, retrait, ou tout bloc (un simple `div` de texte reste du texte). */
function estBlocDItem(noeud: ChildNode): boolean {
  if (!estElement(noeud) || !balisesDeBloc.has(noeud.name)) {
    return false;
  }
  return noeud.name !== 'div' || aLaClasse(noeud, 'indented') || noeud.children.some((enfant) => estElement(enfant) && balisesDeBloc.has(enfant.name));
}

/**
 * Items en listes. Un item sans texte mais avec un contenu (Notion le permet,
 * le Markdown ne le relit pas) laisse ce contenu hors de la liste, à sa place :
 * la liste reprend après lui. « rang » : nombre d'items déjà placés.
 */
function enListes(items: Json[], liste: (contenu: Json[], rang: number) => Json): Json[] {
  const sortie: Json[] = [];
  let enCours: Json[] = [];
  let places = 0;
  const fermer = (): void => {
    if (enCours.length > 0) {
      sortie.push(liste(enCours, places - enCours.length));
      enCours = [];
    }
  };
  for (const item of items) {
    const [premier, ...reste] = item.content ?? [];
    if (premier?.type === 'paragraph' && premier.content === undefined && reste.length > 0) {
      fermer();
      sortie.push(...reste);
      places++;
    } else {
      enCours.push(item);
      places++;
    }
  }
  fermer();
  return sortie;
}

/** Le bloc « Métadonnées : filtres et tris » que Notion met sous le lien d'une base : rien à importer. */
function estMetadonneesDeBase(element: Element): boolean {
  const premier = enfantsElements(element)[0];
  return premier?.name === 'b' && /^M[ée]tadonn[ée]es/i.test(texteDe(premier));
}

function posixBasename(adresse: string): string {
  let nom = adresse.split('/').pop() ?? adresse;
  try {
    nom = decodeURIComponent(nom);
  } catch {
    // Adresse mal encodée : le nom tel quel.
  }
  return nom.replace(/\s*[0-9a-f]{32}\.csv$/i, '').replace(/\.csv$/i, '');
}

function estListe(bloc: Json): boolean {
  return bloc.type === 'bulletList' || bloc.type === 'orderedList' || bloc.type === 'taskList';
}

function marqueDe(element: Element): Marque | null {
  switch (element.name) {
    case 'strong':
    case 'b':
      return { type: 'bold' };
    case 'em':
    case 'i':
      return { type: 'italic' };
    case 'del':
    case 's':
      return { type: 'strike' };
    case 'code':
      return { type: 'code' };
    case 'u':
      return { type: 'underline' };
    case 'mark':
      return classes(element).some((classe) => classe.endsWith('_background')) ? { type: 'highlight' } : null;
    default:
      return /border-bottom\s*:[^;]*solid/i.test(element.attribs['style'] ?? '') ? { type: 'underline' } : null;
  }
}

/** Un code en ligne ne se combine à aucune autre marque : le code l'emporte. */
function ajouterMarque(marques: Marque[], marque: Marque | null): Marque[] {
  if (marque === null || marques.some((existante) => existante.type === marque.type)) {
    return marques;
  }
  if (marques.some((existante) => existante.type === 'code')) {
    return marques;
  }
  if (marque.type === 'code') {
    return [marque];
  }
  return [...marques, marque];
}

/** Espaces de début et de fin de ligne retirées, textes voisins de mêmes marques réunis. */
function nettoyerLigne(ligne: Json[]): Json[] {
  const reunie: Json[] = [];
  for (const noeud of ligne) {
    const precedent = reunie[reunie.length - 1];
    if (precedent?.type === 'text' && noeud.type === 'text' && JSON.stringify(precedent.marks ?? []) === JSON.stringify(noeud.marks ?? [])) {
      precedent.text += noeud.text!;
    } else {
      reunie.push({ ...noeud });
    }
  }
  const premier = reunie[0];
  if (premier?.type === 'text') {
    premier.text = premier.text!.replace(/^\s+/, '');
  }
  const dernier = reunie[reunie.length - 1];
  if (dernier?.type === 'text') {
    dernier.text = dernier.text!.replace(/\s+$/, '');
  }
  return reunie.filter((noeud) => noeud.type !== 'text' || noeud.text !== '');
}

function texteBrutDe(noeud: ChildNode): string {
  if (estTexte(noeud)) {
    return noeud.data;
  }
  if (!estElement(noeud)) {
    return '';
  }
  return noeud.name === 'br' ? '\n' : noeud.children.map(texteBrutDe).join('');
}

/** Les lignes de texte d'un bloc, pour le mettre dans un callout, qui n'a que des paragraphes. */
function texteDuBloc(bloc: Json): string[] {
  if (bloc.text !== undefined) {
    return [bloc.text];
  }
  if (bloc.type === 'pageMention') {
    return [String(bloc.attrs?.['libelle'] ?? '')];
  }
  const enfants = bloc.content ?? [];
  if (enfants.every((enfant) => enfant.type === 'text' || enfant.type === 'pageMention' || enfant.type === 'hardBreak')) {
    const ligne = enfants.map((enfant) => texteDuBloc(enfant).join('')).join('');
    return ligne.trim() === '' ? [] : [ligne];
  }
  return enfants.flatMap((enfant) => texteDuBloc(enfant).map((ligne) => (enfant.type === 'listItem' || enfant.type === 'taskItem' ? `• ${ligne}` : ligne)));
}

function natureDuCallout(classesDuBloc: string[]): string {
  const couleur = classesDuBloc.find((classe) => classe.startsWith('block-color-'))?.slice('block-color-'.length).replace(/_background$/, '') ?? '';
  if (couleur === 'red' || couleur === 'pink') {
    return 'danger';
  }
  if (couleur === 'orange' || couleur === 'yellow' || couleur === 'brown') {
    return 'warning';
  }
  if (couleur === 'green') {
    return 'success';
  }
  return 'info';
}

/** Retire l'attribut interne `notion` (nature de liste) avant de bâtir les nœuds. */
function sansAttributsInternes(bloc: Json): Json {
  const { attrs, content, ...reste } = bloc;
  const propres = attrs === undefined ? undefined : Object.fromEntries(Object.entries(attrs).filter(([cle]) => cle !== 'notion'));
  return { ...reste, ...(propres === undefined ? {} : { attrs: propres }), ...(content === undefined ? {} : { content: content.map(sansAttributsInternes) }) };
}

/** Un bloc que le schéma refuse devient son texte, en paragraphes. */
function enNoeud(bloc: Json, avertir: (message: string) => void): ProseMirrorNode[] {
  try {
    const noeud = schema.nodeFromJSON(sansAttributsInternes(bloc));
    noeud.check();
    return [noeud];
  } catch {
    avertir('Certains blocs n’ont pas pu garder leur forme : leur texte est repris en paragraphes.');
    return texteDuBloc(bloc).map((ligne) => schema.node('paragraph', null, ligne === '' ? [] : [schema.text(ligne)]));
  }
}

export function convertirPageNotion(html: string, resolveur: NotionResolver): ConvertedNotionPage {
  const article = articleDe(lireHtml(html));
  const titre = titreDe(article);
  const convertisseur = new Convertisseur(resolveur, titre);
  const corpsDeLaPage = trouver(article, (element) => aLaClasse(element, 'page-body'));
  const blocs = [...convertisseur.proprietes(article), ...convertisseur.blocs(corpsDeLaPage === null ? [] : corpsDeLaPage.children)];
  const avertir = (message: string): void => {
    if (!convertisseur.avertissements.includes(message)) {
      convertisseur.avertissements.push(message);
    }
  };
  const noeuds = blocs.flatMap((bloc) => enNoeud(bloc, avertir));
  const document = schema.topNodeType.create(null, noeuds.length === 0 ? [schema.node('paragraph')] : noeuds);
  return { titre, icone: iconeDe(article), corps: ecrireMarkdown(document), avertissements: convertisseur.avertissements };
}
