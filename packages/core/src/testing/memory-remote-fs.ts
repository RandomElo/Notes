import { dossierParent, estDansDossier, joindreChemins, nomDeBase, verifierCheminRelatif } from '../fs/paths';
import { RemoteFsError } from '../fs/remote-fs';
import type { RemoteEntry, RemoteFs } from '../fs/remote-fs';
import { versOctets, versTexte } from '../fs/utf8';

type Operation = 'infos' | 'lister' | 'lire' | 'ecrire' | 'creerDossier' | 'renommer' | 'supprimer';

/**
 * RemoteFs en mémoire, pour tester la sync sans NAS. Il se comporte comme le
 * compagnon : renommer remplace la destination, supprimer refuse un dossier
 * non vide. Les pannes se simulent par `panne` (NAS injoignable) ou par
 * `echouerSur` (une opération précise échoue). Avec `insensibleALaCasse`, il
 * fait comme Samba : « Courses » et « courses » désignent le même fichier, qui
 * garde la casse de sa création.
 */
export class MemoryRemoteFs implements RemoteFs {
  constructor(private readonly insensibleALaCasse = false) {}

  private readonly fichiers = new Map<string, Uint8Array>();
  private readonly dossiers = new Set<string>(['']);
  private readonly dates = new Map<string, number>();
  private horloge = 1_000_000;
  /** Vrai : toute opération échoue comme si le NAS était injoignable. */
  panne = false;
  /** Appelée avant chaque opération : vrai la fait échouer (code `interne`). */
  echouerSur: ((operation: Operation, chemin: string) => boolean) | null = null;
  /** Appelée avant chaque opération, pour glisser une modification au milieu d'un cycle. */
  avantOperation: ((operation: Operation, chemin: string) => void) | null = null;
  ecritures = 0;

  static depuis(fichiers: Record<string, string>, insensibleALaCasse = false): MemoryRemoteFs {
    const fs = new MemoryRemoteFs(insensibleALaCasse);
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      fs.poser(chemin, contenu);
    }
    return fs;
  }

  /** Écrit un fichier sans passer par l'interface ni compter d'écriture : c'est « l'autre appareil ». */
  poser(chemin: string, contenu: string | Uint8Array): void {
    chemin = this.reel(chemin);
    for (let parent = dossierParent(chemin); parent !== ''; parent = dossierParent(parent)) {
      this.dossiers.add(parent);
    }
    this.fichiers.set(chemin, typeof contenu === 'string' ? versOctets(contenu) : contenu.slice());
    this.dates.set(chemin, this.horloge++);
  }

  /** Retire un fichier ou un dossier entier sans passer par l'interface. */
  retirer(chemin: string): void {
    for (const fichier of [...this.fichiers.keys()].filter((f) => estDansDossier(f, chemin))) {
      this.fichiers.delete(fichier);
    }
    for (const dossier of [...this.dossiers].filter((d) => d !== '' && estDansDossier(d, chemin))) {
      this.dossiers.delete(dossier);
    }
  }

  contenu(): Record<string, string> {
    return Object.fromEntries([...this.fichiers].sort(([a], [b]) => (a < b ? -1 : 1)).map(([chemin, octets]) => [chemin, versTexte(octets)]));
  }

  listeDesDossiers(): string[] {
    return [...this.dossiers].filter((d) => d !== '').sort();
  }

  async infos(chemin: string): Promise<RemoteEntry | null> {
    this.avant('infos', chemin, true);
    chemin = this.reel(chemin);
    const contenu = this.fichiers.get(chemin);
    if (contenu !== undefined) {
      return { nom: nomDeBase(chemin), estDossier: false, taille: contenu.length, modifieLe: this.dates.get(chemin) ?? 0 };
    }
    return this.dossiers.has(chemin) ? { nom: nomDeBase(chemin), estDossier: true, taille: 0, modifieLe: 0 } : null;
  }

  async lister(chemin: string): Promise<RemoteEntry[]> {
    this.avant('lister', chemin, true);
    chemin = this.reel(chemin);
    if (!this.dossiers.has(chemin)) {
      throw new RemoteFsError('introuvable', `Dossier introuvable : ${chemin}`);
    }
    const entrees: RemoteEntry[] = [];
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

  async lire(chemin: string): Promise<Uint8Array> {
    this.avant('lire', chemin);
    chemin = this.reel(chemin);
    const contenu = this.fichiers.get(chemin);
    if (contenu === undefined) {
      throw new RemoteFsError('introuvable', `Fichier introuvable : ${chemin}`);
    }
    return contenu.slice();
  }

  async ecrire(chemin: string, contenu: Uint8Array): Promise<void> {
    this.avant('ecrire', chemin);
    chemin = this.reel(chemin);
    if (!this.dossiers.has(dossierParent(chemin)) || this.dossiers.has(chemin)) {
      throw new RemoteFsError('introuvable', `Dossier parent introuvable pour ${chemin}`);
    }
    this.fichiers.set(chemin, contenu.slice());
    this.dates.set(chemin, this.horloge++);
    this.ecritures++;
  }

  async creerDossier(chemin: string): Promise<void> {
    this.avant('creerDossier', chemin);
    chemin = this.reel(chemin);
    if (this.fichiers.has(chemin)) {
      throw new RemoteFsError('existe_deja', `Un fichier porte déjà ce nom : ${chemin}`);
    }
    for (let dossier = chemin; dossier !== ''; dossier = dossierParent(dossier)) {
      this.dossiers.add(dossier);
    }
  }

  async renommer(chemin: string, vers: string): Promise<void> {
    this.avant('renommer', chemin);
    chemin = this.reel(chemin);
    // Le parent de la destination est résolu, son nom est pris tel quel : c'est ce qui change la casse.
    vers = joindreChemins(this.reel(dossierParent(vers)), nomDeBase(vers));
    const contenu = this.fichiers.get(chemin);
    if (contenu !== undefined) {
      const date = this.dates.get(chemin) ?? this.horloge++;
      this.fichiers.delete(chemin);
      this.fichiers.delete(this.reel(vers));
      this.fichiers.set(vers, contenu);
      this.dates.set(vers, date);
    } else if (this.dossiers.has(chemin)) {
      const deplacer = (ancien: string): string => vers + ancien.slice(chemin.length);
      for (const dossier of [...this.dossiers].filter((d) => estDansDossier(d, chemin))) {
        this.dossiers.delete(dossier);
        this.dossiers.add(deplacer(dossier));
      }
      for (const [fichier, texte] of [...this.fichiers].filter(([f]) => estDansDossier(f, chemin))) {
        const date = this.dates.get(fichier) ?? this.horloge++;
        this.fichiers.delete(fichier);
        this.fichiers.set(deplacer(fichier), texte);
        this.dates.set(deplacer(fichier), date);
      }
    } else {
      throw new RemoteFsError('introuvable', `Introuvable : ${chemin}`);
    }
    this.ecritures++;
  }

  async supprimer(chemin: string): Promise<void> {
    this.avant('supprimer', chemin);
    chemin = this.reel(chemin);
    if (this.fichiers.delete(chemin)) {
      this.ecritures++;
      return;
    }
    if (!this.dossiers.has(chemin)) {
      throw new RemoteFsError('introuvable', `Introuvable : ${chemin}`);
    }
    const nonVide = [...this.fichiers.keys(), ...this.dossiers].some((autre) => autre !== chemin && estDansDossier(autre, chemin));
    if (nonVide) {
      throw new RemoteFsError('dossier_non_vide', `Le dossier n'est pas vide : ${chemin}`);
    }
    this.dossiers.delete(chemin);
    this.ecritures++;
  }

  /** Le chemin tel qu'il est stocké : sans distinction de casse, chaque segment reprend le nom existant. */
  private reel(chemin: string): string {
    if (!this.insensibleALaCasse || chemin === '') {
      return chemin;
    }
    let resolu = '';
    for (const segment of chemin.split('/')) {
      const candidat = joindreChemins(resolu, segment);
      const existant = [...this.dossiers, ...this.fichiers.keys()].find(
        (autre) => autre !== '' && dossierParent(autre) === resolu && autre.toLowerCase() === candidat.toLowerCase(),
      );
      resolu = existant ?? candidat;
    }
    return resolu;
  }

  private avant(operation: Operation, chemin: string, racinePermise = false): void {
    if (this.panne) {
      throw new RemoteFsError('injoignable', 'NAS injoignable (panne simulée).');
    }
    if (!(chemin === '' && racinePermise)) {
      const refus = verifierCheminRelatif(chemin);
      if (refus !== null) {
        throw new RemoteFsError('requete_invalide', refus);
      }
    }
    this.avantOperation?.(operation, chemin);
    if (this.echouerSur?.(operation, chemin) === true) {
      throw new RemoteFsError('interne', `Échec simulé : ${operation} ${chemin}`);
    }
  }
}
