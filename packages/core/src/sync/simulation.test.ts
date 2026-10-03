import { describe, expect, it } from 'vitest';
import { MemoryIndexStore, MemoryLocalFs } from '../testing/memory-fs';
import { MemoryRemoteFs } from '../testing/memory-remote-fs';
import { synchroniser } from './engine';

/**
 * Deux appareils et un NAS, des centaines d'opérations tirées au hasard :
 * écrire, créer, renommer une page, synchroniser l'un ou l'autre, couper le
 * NAS. Chaque écriture ajoute une marque unique au texte de la page, donc une
 * version qui en remplace une autre en connaissance de cause garde ses
 * marques. Ce que le test vérifie, c'est le critère de J5 : aucune marque
 * synchronisée ne disparaît (pas de perte, pas d'écrasement), et les deux
 * appareils finissent identiques.
 */

function generateur(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Appareil {
  nom: string;
  fs: MemoryLocalFs;
  index: MemoryIndexStore;
}

async function simuler(graine: number, etapes: number): Promise<void> {
  const hasard = generateur(graine);
  const choisir = <T>(liste: readonly T[]): T => liste[Math.floor(hasard() * liste.length)]!;
  // Comme le NAS réel : « Page » et « page » sont le même dossier.
  const nas = new MemoryRemoteFs(true);
  const appareils: Appareil[] = ['a', 'b'].map((nom) => ({ nom, fs: new MemoryLocalFs(), index: new MemoryIndexStore() }));
  let marques = 0;
  const marquesSynchronisees = new Set<string>();

  const pages = async (appareil: Appareil): Promise<string[]> =>
    Object.keys(appareil.fs.contenu())
      .filter((chemin) => chemin.endsWith('/page.md'))
      .map((chemin) => chemin.slice(0, -'/page.md'.length));

  const cycle = async (appareil: Appareil): Promise<void> => {
    try {
      await synchroniser({ local: appareil.fs, distant: nas, index: appareil.index, cle: 'vault', maintenant: () => Date.UTC(2026, 9, 3), appareil: appareil.nom });
      // Ce qui était sur le poste au début d'un cycle réussi est parti sur le NAS ou y a été gardé.
      for (const texte of Object.values(appareil.fs.contenu())) {
        for (const marque of texte.match(/m\d+/g) ?? []) {
          marquesSynchronisees.add(marque);
        }
      }
    } catch {
      // NAS coupé : le cycle reprendra plus tard.
    }
  };

  for (let etape = 0; etape < etapes; etape++) {
    const appareil = choisir(appareils);
    const tirage = hasard();
    const existantes = await pages(appareil);
    if (tirage < 0.35 && existantes.length > 0) {
      const page = choisir(existantes);
      const texte = await appareil.fs.lireTexte(`${page}/page.md`);
      await appareil.fs.ecrireTexte(`${page}/page.md`, `${texte}m${++marques}\n`);
    } else if (tirage < 0.45) {
      // Comme l'application, on ne crée pas « P1 » à côté de « p1 ».
      const page = `P${Math.floor(hasard() * 6)}`;
      if (!existantes.some((autre) => autre.toLowerCase() === page.toLowerCase()) && (await appareil.fs.infos(page)) === null) {
        await appareil.fs.creerDossier(page);
        await appareil.fs.ecrireTexte(`${page}/page.md`, `m${++marques}\n`);
      }
    } else if (tirage < 0.5 && existantes.length > 0) {
      // Un nouveau nom, ou le même avec une autre casse (« r3 » devient « R3 »).
      const page = choisir(existantes);
      const vers = hasard() < 0.5 ? `R${Math.floor(hasard() * 6)}` : page === page.toLowerCase() ? page.toUpperCase() : page.toLowerCase();
      const pris = (await pages(appareil)).some((autre) => autre !== page && autre.toLowerCase() === vers.toLowerCase());
      if (vers !== page && !pris && (await appareil.fs.infos(vers)) === null) {
        await appareil.fs.renommer(page, vers);
      }
    } else if (tirage < 0.55) {
      nas.panne = !nas.panne;
    } else {
      await cycle(appareil);
    }
  }

  nas.panne = false;
  for (const appareil of [...appareils, ...appareils]) {
    await cycle(appareil);
  }
  const [a, b] = appareils as [Appareil, Appareil];
  expect(a.fs.contenu()).toEqual(b.fs.contenu());
  expect(nas.contenu()).toEqual(a.fs.contenu());

  const presentes = new Set(Object.values(a.fs.contenu()).flatMap((texte) => texte.match(/m\d+/g) ?? []));
  const perdues = [...marquesSynchronisees].filter((marque) => !presentes.has(marque));
  expect(perdues).toEqual([]);
}

describe('deux appareils au hasard', () => {
  for (const graine of [1, 2, 3, 42, 2026, 31337]) {
    it(`ne perd rien et converge (graine ${graine})`, async () => {
      await simuler(graine, 400);
    });
  }
});
