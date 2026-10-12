import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Element, ElementContent, Root } from 'hast';
import type { LanguageFn } from 'highlight.js';
import arduino from 'highlight.js/lib/languages/arduino';
import armasm from 'highlight.js/lib/languages/armasm';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import excel from 'highlight.js/lib/languages/excel';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import nginx from 'highlight.js/lib/languages/nginx';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import x86asm from 'highlight.js/lib/languages/x86asm';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { createLowlight } from 'lowlight';

/**
 * Coloration des blocs de code (docs/spec/editeur.md) avec lowlight, la grammaire de
 * highlight.js, pour une liste courte de langages choisie par Eloi. Ce sont des
 * décorations : le texte du bloc ne change pas, rien n'est écrit dans le
 * fichier. Un langage hors de la liste reste écrit tel quel dans le fichier,
 * simplement sans couleur. Le numéro de chaque ligne est aussi une décoration,
 * affichée ou non selon le thème (`[code] line_numbers`).
 */

export interface LanguageInfo {
  /** Identifiant écrit après les accents graves (`typescript`). */
  id: string;
  /** Nom lisible (`TypeScript`). */
  nom: string;
  /** Autres noms qui le désignent (`ts`). */
  alias: string[];
}

interface Choix extends LanguageInfo {
  /** Grammaire highlight.js qui le colore : HTML et XML partagent la même, JSX celle de JavaScript. */
  grammaire: string;
}

const grammaires: Record<string, LanguageFn> = {
  arduino, armasm, bash, c, cpp, csharp, css, diff, dockerfile, excel, go, ini, java, javascript, json,
  kotlin, makefile, markdown, nginx, php, powershell, python, rust, sql, typescript, x86asm, xml, yaml,
};

// Deux noms pour une même chose (HTML et XML, JavaScript et JSX...) font deux entrées : la liste n'a pas de « / ».
const choix: Choix[] = [
  { id: 'arduino', nom: 'Arduino', alias: ['ino'], grammaire: 'arduino' },
  { id: 'armasm', nom: 'Assembleur ARM', alias: ['arm'], grammaire: 'armasm' },
  { id: 'x86asm', nom: 'Assembleur x86', alias: ['asm', 'nasm'], grammaire: 'x86asm' },
  { id: 'bash', nom: 'Bash', alias: [], grammaire: 'bash' },
  { id: 'c', nom: 'C', alias: ['h'], grammaire: 'c' },
  { id: 'cpp', nom: 'C++', alias: ['c++', 'hpp', 'cc'], grammaire: 'cpp' },
  { id: 'csharp', nom: 'C#', alias: ['cs', 'c#'], grammaire: 'csharp' },
  { id: 'css', nom: 'CSS', alias: [], grammaire: 'css' },
  { id: 'diff', nom: 'Diff', alias: ['patch'], grammaire: 'diff' },
  { id: 'dockerfile', nom: 'Dockerfile', alias: ['docker'], grammaire: 'dockerfile' },
  { id: 'excel', nom: 'Excel', alias: ['xlsx', 'xls'], grammaire: 'excel' },
  { id: 'go', nom: 'Go', alias: ['golang'], grammaire: 'go' },
  { id: 'html', nom: 'HTML', alias: ['htm', 'xhtml'], grammaire: 'xml' },
  { id: 'ini', nom: 'INI', alias: ['cfg'], grammaire: 'ini' },
  { id: 'java', nom: 'Java', alias: [], grammaire: 'java' },
  { id: 'javascript', nom: 'JavaScript', alias: ['js', 'mjs', 'cjs'], grammaire: 'javascript' },
  { id: 'json', nom: 'JSON', alias: [], grammaire: 'json' },
  { id: 'jsx', nom: 'JSX', alias: [], grammaire: 'javascript' },
  { id: 'kotlin', nom: 'Kotlin', alias: ['kt'], grammaire: 'kotlin' },
  { id: 'makefile', nom: 'Makefile', alias: ['make', 'mk'], grammaire: 'makefile' },
  { id: 'markdown', nom: 'Markdown', alias: ['md'], grammaire: 'markdown' },
  { id: 'nginx', nom: 'Nginx', alias: [], grammaire: 'nginx' },
  { id: 'php', nom: 'PHP', alias: [], grammaire: 'php' },
  { id: 'powershell', nom: 'PowerShell', alias: ['ps1', 'pwsh'], grammaire: 'powershell' },
  { id: 'python', nom: 'Python', alias: ['py'], grammaire: 'python' },
  { id: 'rust', nom: 'Rust', alias: ['rs'], grammaire: 'rust' },
  { id: 'sh', nom: 'Shell', alias: ['shell', 'zsh'], grammaire: 'bash' },
  { id: 'sql', nom: 'SQL', alias: [], grammaire: 'sql' },
  { id: 'toml', nom: 'TOML', alias: [], grammaire: 'ini' },
  { id: 'tsx', nom: 'TSX', alias: [], grammaire: 'typescript' },
  { id: 'typescript', nom: 'TypeScript', alias: ['ts'], grammaire: 'typescript' },
  { id: 'xml', nom: 'XML', alias: ['svg'], grammaire: 'xml' },
  { id: 'yaml', nom: 'YAML', alias: ['yml'], grammaire: 'yaml' },
];

const lowlight = createLowlight(grammaires);
// Chaque nom de la liste désigne sa grammaire, même quand highlight.js ne le connaît pas comme alias.
for (const { id, alias, grammaire } of choix) {
  const manquants = [id, ...alias].filter((nom) => !lowlight.registered(nom));
  if (manquants.length > 0) {
    lowlight.registerAlias(grammaire, manquants);
  }
}

/** Vrai si ce langage (nom ou alias) est connu et sera coloré. */
export function langageConnu(langage: string | null | undefined): boolean {
  return typeof langage === 'string' && langage !== '' && lowlight.registered(langage);
}

/** Le langage le plus probable d'un morceau de code, ou null si rien ne ressort. */
export function devinerLangage(code: string): string | null {
  if (code.trim().length < 12) {
    return null;
  }
  const resultat = lowlight.highlightAuto(code);
  // En dessous, la détection tient du hasard sur un texte court.
  const langage = (resultat.data?.relevance ?? 0) >= 5 ? (resultat.data?.language ?? null) : null;
  // HTML et XML ont la même grammaire : une page web s'écrit `html`.
  if (langage === 'xml' && /<(!doctype|html|head|body|div|span|p|a|ul|li|script|style|section|main)\b/i.test(code)) {
    return 'html';
  }
  return langage;
}

const langages: LanguageInfo[] = choix
  .map(({ id, nom, alias }) => ({ id, nom, alias }))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

/** Les langages proposés, par nom. */
export function listerLangages(): LanguageInfo[] {
  return langages;
}

/** Nom lisible d'un langage, ou ce qui est écrit dans le fichier s'il est inconnu. */
export function nomDuLangage(langage: string): string {
  const cherche = langage.toLowerCase();
  return (langages.find((candidat) => candidat.id === cherche) ?? langages.find((candidat) => candidat.alias.includes(cherche)))?.nom ?? langage;
}

/**
 * Mots-clés de contrôle (conditions, boucles, sauts, imports) : VS Code les colore à part, highlight.js
 * les range avec les autres mots-clés. Ils reçoivent en plus la classe `hljs-controle`.
 */
const motsDeControle = new Set([
  'if', 'else', 'elif', 'elsif', 'switch', 'case', 'default', 'for', 'foreach', 'while', 'do', 'loop', 'break', 'continue',
  'return', 'goto', 'try', 'catch', 'except', 'finally', 'throw', 'throws', 'raise', 'import', 'export', 'from', 'as',
  'await', 'yield', 'match', 'when', 'with', 'pass', 'then', 'fi', 'done', 'esac', 'in', 'require', 'include', 'using',
]);

interface Plage {
  de: number;
  a: number;
  classes: string;
}

/** Les plages colorées d'un texte, à partir de l'arbre rendu par lowlight. */
function plagesColorees(arbre: Root): Plage[] {
  const plages: Plage[] = [];
  let position = 0;
  const parcourir = (noeuds: (ElementContent | Root['children'][number])[], classes: string[]): void => {
    for (const noeud of noeuds) {
      if (noeud.type === 'text') {
        if (classes.length > 0) {
          const controle = classes.includes('hljs-keyword') && motsDeControle.has(noeud.value.toLowerCase());
          plages.push({ de: position, a: position + noeud.value.length, classes: [...classes, ...(controle ? ['hljs-controle'] : [])].join(' ') });
        }
        position += noeud.value.length;
      } else if (noeud.type === 'element') {
        const element = noeud as Element;
        const propres = Array.isArray(element.properties['className']) ? element.properties['className'].map(String) : [];
        parcourir(element.children, [...classes, ...propres]);
      }
    }
  };
  parcourir(arbre.children, []);
  return plages;
}

function decorationsDuBloc(bloc: ProseMirrorNode, debut: number): Decoration[] {
  const decorations: Decoration[] = [];
  const texte = bloc.textContent;
  const langage = bloc.attrs['language'] as string | null;
  if (langageConnu(langage)) {
    for (const plage of plagesColorees(lowlight.highlight(langage as string, texte))) {
      decorations.push(Decoration.inline(debut + plage.de, debut + plage.a, { class: plage.classes }));
    }
  }
  // Le numéro de chaque ligne est porté par son premier caractère (le retour à la ligne pour une ligne vide) et
  // affiché par la feuille de style dans la marge. Pas de widget : un élément ajouté au début d'une ligne déplace
  // les lettres tapées. Il n'est pas dans le texte : il ne se copie pas. Une dernière ligne vide n'a pas de numéro.
  let numero = 1;
  let position = 0;
  for (const ligne of texte.split('\n')) {
    if (position < texte.length) {
      decorations.push(Decoration.inline(debut + position, debut + position + 1, { class: 'debut-de-ligne', 'data-numero': String(numero) }));
    }
    position += ligne.length + 1;
    numero++;
  }
  return decorations;
}

function toutDecorer(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((noeud, position) => {
    if (noeud.type.name === 'codeBlock') {
      decorations.push(...decorationsDuBloc(noeud, position + 1));
      return false;
    }
    return !noeud.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

const cle = new PluginKey<DecorationSet>('colorationDuCode');

export const CodeHighlight = Extension.create({
  name: 'colorationDuCode',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: cle,
        state: {
          init: (_config, etat) => toutDecorer(etat.doc),
          // Une page compte peu de blocs de code : tout recolorer à chaque modification reste immédiat.
          apply: (transaction, decorations) => (transaction.docChanged ? toutDecorer(transaction.doc) : decorations.map(transaction.mapping, transaction.doc)),
        },
        props: {
          decorations: (etat) => cle.getState(etat),
        },
      }),
    ];
  },
});
