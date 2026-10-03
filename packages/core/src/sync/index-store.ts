/**
 * Index de sync : pour chaque fichier, son état des deux côtés au dernier
 * passage (date, taille) et l'empreinte du contenu alors identique. C'est ce
 * qui permet de savoir de quel côté un fichier a changé depuis.
 *
 * L'index appartient à un couple (dossier local, dossier du NAS) : si l'un
 * des deux change, la clé change et l'index repart de zéro.
 */
export interface SyncIndex {
  version: 1;
  /** Identifie le couple de dossiers synchronisés. */
  cle: string;
  fichiers: Record<string, IndexEntry>;
  /** Dossiers présents des deux côtés au dernier passage. */
  dossiers: string[];
}

export interface FileStamp {
  /** Millisecondes depuis l'époque Unix. */
  modifieLe: number;
  taille: number;
}

export interface IndexEntry {
  local: FileStamp;
  distant: FileStamp;
  /** SHA-256 du contenu, le même des deux côtés au dernier passage. */
  hash: string;
}

/** Où l'index est rangé : un fichier du profil sur desktop, le stockage privé sur Android. */
export interface IndexStore {
  /** Texte enregistré, null s'il n'y en a pas encore. */
  lire(): Promise<string | null>;
  ecrire(texte: string): Promise<void>;
}

export function indexVide(cle: string): SyncIndex {
  return { version: 1, cle, fichiers: {}, dossiers: [] };
}

/**
 * Lit l'index enregistré. Un index illisible, d'une autre version ou d'un
 * autre couple de dossiers est remplacé par un index vide : la sync suivante
 * compare alors les contenus, sans rien supprimer ni écraser.
 */
export async function chargerIndex(magasin: IndexStore, cle: string): Promise<SyncIndex> {
  let brut: unknown;
  try {
    const texte = await magasin.lire();
    if (texte === null) {
      return indexVide(cle);
    }
    brut = JSON.parse(texte);
  } catch {
    return indexVide(cle);
  }
  if (typeof brut !== 'object' || brut === null) {
    return indexVide(cle);
  }
  const objet = brut as Record<string, unknown>;
  if (objet['version'] !== 1 || objet['cle'] !== cle || typeof objet['fichiers'] !== 'object' || objet['fichiers'] === null || !Array.isArray(objet['dossiers'])) {
    return indexVide(cle);
  }
  const fichiers: Record<string, IndexEntry> = {};
  for (const [chemin, entree] of Object.entries(objet['fichiers'] as Record<string, unknown>)) {
    if (estEntree(entree)) {
      fichiers[chemin] = { local: { ...entree.local }, distant: { ...entree.distant }, hash: entree.hash };
    }
  }
  const dossiers = (objet['dossiers'] as unknown[]).filter((dossier): dossier is string => typeof dossier === 'string');
  return { version: 1, cle, fichiers, dossiers };
}

export async function enregistrerIndex(magasin: IndexStore, index: SyncIndex): Promise<void> {
  await magasin.ecrire(JSON.stringify(index));
}

function estTampon(valeur: unknown): valeur is FileStamp {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const { modifieLe, taille } = valeur as Record<string, unknown>;
  return typeof modifieLe === 'number' && Number.isFinite(modifieLe) && typeof taille === 'number' && Number.isFinite(taille);
}

function estEntree(valeur: unknown): valeur is IndexEntry {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const { local, distant, hash } = valeur as Record<string, unknown>;
  return estTampon(local) && estTampon(distant) && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash);
}
