#!/usr/bin/env node
// Change le numéro de version partout d'un coup : racine, applications et paquets.
// Usage : npm run version:set -- 0.3.0
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Version attendue sous la forme 0.3.0 (npm run version:set -- 0.3.0).');
  process.exit(1);
}

const fichiers = [join(racine, 'package.json')];
for (const groupe of ['apps', 'packages']) {
  for (const dossier of readdirSync(join(racine, groupe))) {
    const fichier = join(racine, groupe, dossier, 'package.json');
    if (existsSync(fichier)) {
      fichiers.push(fichier);
    }
  }
}

for (const fichier of fichiers) {
  const contenu = readFileSync(fichier, 'utf8');
  const modifie = contenu.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
  if (modifie === contenu && !contenu.includes(`"version": "${version}"`)) {
    console.error(`Champ « version » introuvable dans ${fichier}.`);
    process.exit(1);
  }
  writeFileSync(fichier, modifie);
}

// Le fichier de verrouillage porte aussi la version de chaque paquet du monorepo.
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: racine, stdio: 'ignore' });
console.log(`Version ${version} appliquée à ${fichiers.length} fichiers package.json.`);
