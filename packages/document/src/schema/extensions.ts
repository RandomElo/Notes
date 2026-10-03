import { getSchema } from '@tiptap/core';
import type { Extensions } from '@tiptap/core';
import { Blockquote } from '@tiptap/extension-blockquote';
import { Bold } from '@tiptap/extension-bold';
import { Code } from '@tiptap/extension-code';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Heading } from '@tiptap/extension-heading';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { ListItem, ListKeymap } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Strike } from '@tiptap/extension-strike';
import { Text } from '@tiptap/extension-text';
import { Underline } from '@tiptap/extension-underline';
import { avecElision } from './marks/elision';
import { Highlight } from './marks/highlight';
import { Callout } from './nodes/callout';
import { Image } from './nodes/image';
import { BulletList, NestedTaskItem, OrderedList, TaskList } from './nodes/lists';
import { RawBlock } from './nodes/raw-block';
import { Table, TableCell, TableHeader, TableHeaderRow, TableRow } from './nodes/table';

/** Niveaux de titre de l'application (README §6). Un titre de niveau 6 reste un bloc brut. */
export const niveauxDeTitre = [1, 2, 3, 4, 5] as const;

/**
 * Les extensions TipTap qui définissent le contenu d'une page. L'éditeur du
 * desktop et le rendu en lecture seule partent de cette même liste, pour que
 * le schéma soit le même partout. Elles portent aussi leurs raccourcis de
 * saisie Markdown et leurs raccourcis clavier.
 */
// Citation, séparateur et surlignage : lus, affichés et réécrits pour ne rien perdre d'un fichier qui en
// contient, mais Eloi n'en veut pas dans ses notes. Ni raccourci de saisie (`>`, `---`, `==texte==`), ni
// règle de collage, ni raccourci clavier.
const sansSaisie = { addInputRules: () => [], addPasteRules: () => [], addKeyboardShortcuts: () => ({}) };

export const extensionsDuSchema: Extensions = [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [...niveauxDeTitre] }),
  Blockquote.extend(sansSaisie),
  BulletList,
  OrderedList,
  ListItem,
  TaskList,
  NestedTaskItem,
  ListKeymap,
  // `Tab` indente dans un bloc de code, de deux espaces.
  CodeBlock.configure({ enableTabIndentation: true, tabSize: 2 }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
  TableHeaderRow,
  Image,
  Callout,
  HorizontalRule.extend(sansSaisie),
  HardBreak,
  RawBlock,
  // Les liens ne s'ouvrent pas au clic et ne se créent pas tout seuls : leur édition arrive en J8.
  Link.configure({ openOnClick: false, autolink: false, linkOnPaste: false, protocols: ['notes'] }),
  avecElision(Bold, '**'),
  avecElision(Italic, '*'),
  avecElision(Strike, '~~'),
  // Pas de syntaxe Markdown pour le souligné : il s'écrit `<u>texte</u>` dans le fichier (Ctrl+U dans l'éditeur).
  Underline,
  Highlight.extend(sansSaisie),
  // Markdown permet du code en gras ou en italique : la marque de code n'exclut pas les autres.
  Code.extend({ excludes: '' }),
];

/** Schéma ProseMirror d'une page. */
export const schema = getSchema(extensionsDuSchema);
