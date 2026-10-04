#!/usr/bin/env node
// Vérifie que la carte du code (.claude/carte/*.md) et le dépôt disent la même chose :
// tout fichier source figure dans la carte de sa partie, et toute entrée cochée existe.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

// Chaque partie du dépôt, les fichiers de carte qui la décrivent, et ce qu'il faut y parcourir.
const parties = [
  { dossier: 'packages/core', cartes: ['core.md'], sources: ['src'] },
  { dossier: 'packages/document', cartes: ['document.md'], sources: ['src'] },
  { dossier: 'packages/ui', cartes: ['ui.md'], sources: ['src'] },
  { dossier: 'apps/desktop', cartes: ['desktop.md', 'desktop-renderer.md', 'desktop-blocs-riches.md', 'desktop-liens-icones.md'], sources: ['src'] },
  { dossier: 'apps/mobile', cartes: ['mobile.md'], sources: ['src'] },
  { dossier: 'apps/smb-companion', cartes: ['smb-companion.md'], sources: ['main.go', 'internal'] },
  { dossier: '.', cartes: ['racine.md'], sources: ['scripts'] },
];

const extensionsSource = /\.(ts|tsx|mts|js|mjs|go|kt|css|html|sh)$/;
const estUnTest = (chemin) => /(\.test\.tsx?|_test\.go)$/.test(chemin);

function parcourir(chemin) {
  if (!existsSync(chemin)) {
    return [];
  }
  if (statSync(chemin).isFile()) {
    return [chemin];
  }
  return readdirSync(chemin, { withFileTypes: true }).flatMap((entree) => {
    if (entree.name === 'node_modules' || entree.name.startsWith('.')) {
      return [];
    }
    return parcourir(join(chemin, entree.name));
  });
}

/** Entrées d'une carte : lignes « - [x] `chemin` ... » ou « - [ ] `chemin` ... », plusieurs chemins possibles par ligne. */
function lireCarte(fichier) {
  const entrees = [];
  for (const ligne of readFileSync(fichier, 'utf8').split('\n')) {
    const debut = /^- \[( |x)\] /.exec(ligne);
    if (debut === null) {
      continue;
    }
    const description = ligne.indexOf(' : ');
    const zone = description === -1 ? ligne : ligne.slice(0, description);
    for (const [, chemin] of zone.matchAll(/`([^`]+)`/g)) {
      entrees.push({ chemin, existe: debut[1] === 'x' });
    }
  }
  return entrees;
}

const problemes = [];

for (const partie of parties) {
  const fichiersCarte = partie.cartes.map((nom) => join(racine, '.claude/carte', nom)).filter(existsSync);
  if (fichiersCarte.length === 0) {
    // .claude/ n'est pas versionné : sans carte (clone neuf), il n'y a rien à vérifier.
    continue;
  }
  const entrees = fichiersCarte.flatMap(lireCarte);
  const nomCartes = partie.cartes.join(' ou ');
  const base = join(racine, partie.dossier);

  for (const entree of entrees.filter((e) => e.existe && !e.chemin.includes('<') && !e.chemin.includes('*'))) {
    if (!existsSync(join(base, entree.chemin))) {
      problemes.push(`${nomCartes} : « ${entree.chemin} » est coché mais n'existe pas dans ${partie.dossier}`);
    }
  }

  const coches = entrees.filter((e) => e.existe).map((e) => e.chemin);
  for (const source of partie.sources) {
    for (const fichier of parcourir(join(base, source))) {
      const chemin = relative(base, fichier);
      if (!extensionsSource.test(chemin) || estUnTest(chemin)) {
        continue;
      }
      const couvert = coches.some((entree) => entree === chemin || (entree.endsWith('/') && chemin.startsWith(entree)));
      if (!couvert) {
        problemes.push(`${nomCartes} : « ${chemin} » existe dans ${partie.dossier} mais n'est pas coché dans la carte`);
      }
    }
  }
}

if (problemes.length > 0) {
  console.error(`Carte du code désynchronisée (${problemes.length}) :`);
  for (const probleme of problemes) {
    console.error(`  - ${probleme}`);
  }
  process.exit(1);
}
console.log('Carte du code à jour.');
