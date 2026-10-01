import { dossierParent, estDansDossier, nomDeBase, verifierCheminRelatif } from '../fs/paths';
import { LocalFsError } from '../fs/local-fs';
import type { LocalEntry, LocalFs } from '../fs/local-fs';

/**
 * LocalFs en mémoire, pour tester core et les applications sans toucher au
 * disque. Il applique les mêmes règles qu'un vrai système de fichiers :
 * dossier parent obligatoire, pas d'écrasement au renommage.
 */
export class MemoryLocalFs implements LocalFs {
  private readonly fichiers = new Map<string, string>();
  private readonly dossiers = new Set<string>(['']);
  private readonly dates = new Map<string, number>();
  private horloge = 1;
  /** Nombre d'écritures (fichiers écrits, renommés, copiés, supprimés) : sert à vérifier qu'une lecture n'écrit rien. */
  ecritures = 0;

  /** Construit un vault à partir de « chemin → contenu ». Les dossiers parents sont créés. */
  static depuis(fichiers: Record<string, string>): MemoryLocalFs {
    const fs = new MemoryLocalFs();
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      fs.creerParents(chemin);
      fs.fichiers.set(chemin, contenu);
      fs.dates.set(chemin, fs.horloge++);
    }
    return fs;
  }

  /** Contenu complet, trié par chemin, pour comparer deux états. */
  contenu(): Record<string, string> {
    return Object.fromEntries([...this.fichiers].sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  async infos(chemin: string): Promise<LocalEntry | null> {
    this.verifier(chemin, true);
    const contenu = this.fichiers.get(chemin);
    if (contenu !== undefined) {
      return { nom: nomDeBase(chemin), estDossier: false, taille: contenu.length, modifieLe: this.dates.get(chemin) ?? 0 };
    }
    return this.dossiers.has(chemin) ? { nom: nomDeBase(chemin), estDossier: true, taille: 0, modifieLe: 0 } : null;
  }

  async lister(chemin: string): Promise<LocalEntry[]> {
    this.verifier(chemin, true);
    if (!this.dossiers.has(chemin)) {
      throw new LocalFsError('introuvable', `Dossier introuvable : ${chemin}`);
    }
    // Comme un vrai disque, la liste montre aussi les noms que l'application refuserait d'écrire.
    const entrees: LocalEntry[] = [];
    for (const dossier of this.dossiers) {
      if (dossier !== '' && dossierParent(dossier) === chemin) {
        entrees.push({ nom: nomDeBase(dossier), estDossier: true, taille: 0, modifieLe: 0 });
      }
    }
    for (const [fichier, contenu] of this.fichiers) {
      if (dossierParent(fichier) === chemin) {
        entrees.push({ nom: nomDeBase(fichier), estDossier: false, taille: contenu.length, modifieLe: this.dates.get(fichier) ?? 0 });
      }
    }
    return entrees.sort((a, b) => (a.nom < b.nom ? -1 : 1));
  }

  async lireTexte(chemin: string): Promise<string> {
    this.verifier(chemin);
    const contenu = this.fichiers.get(chemin);
    if (contenu === undefined) {
      throw new LocalFsError('introuvable', `Fichier introuvable : ${chemin}`);
    }
    return contenu;
  }

  async ecrireTexte(chemin: string, contenu: string): Promise<void> {
    this.verifier(chemin);
    if (!this.dossiers.has(dossierParent(chemin)) || this.dossiers.has(chemin)) {
      throw new LocalFsError('introuvable', `Dossier parent introuvable pour ${chemin}`);
    }
    this.fichiers.set(chemin, contenu);
    this.dates.set(chemin, this.horloge++);
    this.ecritures++;
  }

  async creerDossier(chemin: string): Promise<void> {
    this.verifier(chemin);
    if (this.fichiers.has(chemin)) {
      throw new LocalFsError('existe_deja', `Un fichier porte déjà ce nom : ${chemin}`);
    }
    this.creerParents(`${chemin}/x`);
  }

  async renommer(chemin: string, vers: string): Promise<void> {
    this.verifier(chemin);
    this.verifier(vers);
    if (this.fichiers.has(vers) || this.dossiers.has(vers)) {
      throw new LocalFsError('existe_deja', `La destination existe : ${vers}`);
    }
    if (!this.dossiers.has(dossierParent(vers))) {
      throw new LocalFsError('introuvable', `Dossier parent introuvable pour ${vers}`);
    }
    const contenu = this.fichiers.get(chemin);
    if (contenu !== undefined) {
      this.fichiers.delete(chemin);
      this.fichiers.set(vers, contenu);
    } else if (this.dossiers.has(chemin)) {
      const deplacer = (ancien: string): string => vers + ancien.slice(chemin.length);
      for (const dossier of [...this.dossiers].filter((d) => estDansDossier(d, chemin))) {
        this.dossiers.delete(dossier);
        this.dossiers.add(deplacer(dossier));
      }
      for (const [fichier, texte] of [...this.fichiers].filter(([f]) => estDansDossier(f, chemin))) {
        this.fichiers.delete(fichier);
        this.fichiers.set(deplacer(fichier), texte);
      }
    } else {
      throw new LocalFsError('introuvable', `Introuvable : ${chemin}`);
    }
    this.ecritures++;
  }

  async copierFichier(chemin: string, vers: string): Promise<void> {
    if (this.fichiers.has(vers) || this.dossiers.has(vers)) {
      throw new LocalFsError('existe_deja', `La destination existe : ${vers}`);
    }
    await this.ecrireTexte(vers, await this.lireTexte(chemin));
  }

  async supprimer(chemin: string): Promise<void> {
    this.verifier(chemin);
    if (!this.fichiers.has(chemin) && !this.dossiers.has(chemin)) {
      throw new LocalFsError('introuvable', `Introuvable : ${chemin}`);
    }
    for (const fichier of [...this.fichiers.keys()].filter((f) => estDansDossier(f, chemin))) {
      this.fichiers.delete(fichier);
    }
    for (const dossier of [...this.dossiers].filter((d) => estDansDossier(d, chemin))) {
      this.dossiers.delete(dossier);
    }
    this.ecritures++;
  }

  private verifier(chemin: string, racinePermise = false): void {
    if (chemin === '' && racinePermise) {
      return;
    }
    const refus = verifierCheminRelatif(chemin);
    if (refus !== null) {
      throw new LocalFsError('chemin_invalide', refus);
    }
  }

  private creerParents(chemin: string): void {
    for (let parent = dossierParent(chemin); parent !== ''; parent = dossierParent(parent)) {
      this.dossiers.add(parent);
    }
  }
}

/** Contexte de vault déterministe pour les tests : horloge qui avance d'une seconde par appel, aléa en compteur. */
export function contexteDeTest(fs: LocalFs, depart = Date.UTC(2026, 9, 1, 12, 0, 0)) {
  let instant = depart;
  let compteur = 0;
  return {
    fs,
    maintenant: () => (instant += 1000),
    octetsAleatoires: (taille: number) => {
      compteur++;
      return Uint8Array.from({ length: taille }, (_, index) => (compteur * 31 + index * 7) % 256);
    },
  };
}
