import { Fragment } from '@tiptap/pm/model';
import type { Mark, MarkType, NodeType, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { schema } from '../schema/extensions';
import { iconeDuCallout } from '../schema/nodes/callout';
import type { ImageAttributes } from '../schema/nodes/image';
import { idDeLienInterne } from '../schema/nodes/page-mention';
import type { PageMentionAttributes } from '../schema/nodes/page-mention';

/** Titre Markdown d'un lien qui en fait une mention de site (même valeur que dans `@notes/ui`). */
const titreDeMentionDeSite = 'mention';

export interface MarkdownExportOptions {
  /** Titre du moment de la page d'identifiant « id », ou null si elle n'existe pas : la mention garde alors le texte du fichier. */
  titreDePage: (id: string) => string | null;
  /**
   * Adresse à écrire pour une image de la page, ou null pour la remplacer par
   * une mention textuelle. Absent : toutes les images sont remplacées (export
   * d'une page seule, docs/spec/export.md).
   */
  adresseDImage?: (src: string) => string | null;
  /** Front-matter de la page (bloc YAML sans ses délimiteurs) à garder en tête, ou null pour le retirer. */
  enTete?: string | null;
}

/**
 * Le Markdown d'export d'une page (docs/spec/export.md), lisible par n'importe quel outil :
 * mentions de page en texte simple (le titre du moment), mentions de site en
 * liens ordinaires, liens `notes://` réduits à leur texte, callouts en
 * paragraphes avec leur icône devant, images en mention textuelle ou vers une
 * adresse fournie (archive ZIP). Jamais de citation.
 *
 * Les blocs que l'export ne touche pas gardent leur texte d'origine, à l'octet
 * près ; les autres sont écrits dans la forme de l'application.
 */
export function exporterMarkdown(corps: string, options: MarkdownExportOptions): string {
  const lu = lireMarkdown(corps);
  const document = lu.document.copy(transformerContenu(lu.document.content, options));
  const texte = ecrireMarkdown(document, lu.source);
  return options.enTete === undefined || options.enTete === null ? texte : `---\n${options.enTete}${options.enTete === '' || options.enTete.endsWith('\n') ? '' : '\n'}---\n\n${texte}`;
}

/** Texte qui remplace une image dans un export sans images. */
export function mentionDImage(attributs: Pick<ImageAttributes, 'src' | 'alt' | 'title'>): string {
  const nom = decodeURIComponent(attributs.src.split('/').pop() ?? '').trim();
  const description = [attributs.alt.trim(), attributs.title?.trim() ?? ''].filter((morceau) => morceau !== '');
  return `Image : ${description.length > 0 ? description.join(', ') : nom}`;
}

function transformerContenu(contenu: Fragment, options: MarkdownExportOptions): Fragment {
  const noeuds: ProseMirrorNode[] = [];
  contenu.forEach((noeud) => noeuds.push(...transformer(noeud, options)));
  return Fragment.from(noeuds);
}

function transformer(noeud: ProseMirrorNode, options: MarkdownExportOptions): ProseMirrorNode[] {
  switch (noeud.type.name) {
    case 'pageMention': {
      const { id, libelle } = noeud.attrs as PageMentionAttributes;
      const titre = options.titreDePage(id) ?? libelle;
      return titre === '' ? [] : [schema.text(titre, noeud.marks)];
    }
    case 'text':
      return [noeud.mark(noeud.marks.flatMap(marquePourLExport))];
    case 'callout': {
      const icone = iconeDuCallout(noeud.attrs as { type: unknown; icon: unknown });
      const paragraphes: ProseMirrorNode[] = [];
      noeud.forEach((paragraphe, _decalage, index) => {
        const contenu = transformerContenu(paragraphe.content, options);
        paragraphes.push(paragraphe.copy(index === 0 ? Fragment.from(schema.text(`${icone} `)).append(contenu) : contenu));
      });
      return paragraphes;
    }
    case 'image': {
      const attributs = noeud.attrs as ImageAttributes;
      const adresse = options.adresseDImage?.(attributs.src) ?? null;
      if (adresse === null) {
        const italique = schema.marks['italic'] as MarkType;
        return [(schema.nodes['paragraph'] as NodeType).create(null, schema.text(mentionDImage(attributs), [italique.create()]))];
      }
      // Largeur et alignement sont propres à l'application : l'image exportée n'en garde rien.
      return [noeud.type.create({ ...attributs, src: adresse, largeur: null, alignement: null })];
    }
    default:
      return noeud.isLeaf ? [noeud] : [noeud.copy(transformerContenu(noeud.content, options))];
  }
}

/** Une marque telle qu'elle sort à l'export : lien interne retiré, mention de site ramenée à un lien. */
function marquePourLExport(marque: Mark): Mark[] {
  if (marque.type.name !== 'link') {
    return [marque];
  }
  const adresse = String(marque.attrs['href'] ?? '');
  if (idDeLienInterne(adresse) !== null) {
    return [];
  }
  return marque.attrs['title'] === titreDeMentionDeSite ? [marque.type.create({ ...marque.attrs, title: null })] : [marque];
}
