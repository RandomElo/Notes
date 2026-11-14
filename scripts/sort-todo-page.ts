/*
 * Range une page en mode liste modifiée hors de Notes (une tâche cochée à la main dans le fichier) :
 * mêmes règles que l'éditeur (docs/spec/liste-de-taches.md), tâches cochées en tête de « Terminé ».
 * Seul le corps change ; l'en-tête reste tel quel. Une page qui n'est pas en mode liste n'est pas touchée.
 * Usage : npm run liste:ranger -- <chemin/vers/page.md> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Transform } from '@tiptap/pm/transform';
import { ecrireMarkdown, lireMarkdown, normaliserListe } from '../packages/document/src/index';

for (const fichier of process.argv.slice(2)) {
  const texte = readFileSync(fichier, 'utf8');
  const enTete = /^---\n[\s\S]*?\n---\n/.exec(texte);
  if (enTete === null || !/^mode: todo$/m.test(enTete[0])) {
    console.log(`${fichier} : pas en mode liste, rien à faire.`);
    continue;
  }
  const corps = texte.slice(enTete[0].length);
  const { document, source } = lireMarkdown(corps);
  const tr = new Transform(document);
  normaliserListe(tr);
  const nouveau = ecrireMarkdown(tr.doc, source);
  if (nouveau === corps) {
    console.log(`${fichier} : déjà rangée.`);
    continue;
  }
  writeFileSync(fichier, enTete[0] + nouveau);
  console.log(`${fichier} : rangée.`);
}
