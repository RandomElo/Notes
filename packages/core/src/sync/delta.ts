import type { FileStamp, SyncIndex } from './index-store';
import type { Releve, ScanEntry } from './scan';

/**
 * Ce qu'un cycle doit faire de chaque chemin, décidé sur les seules dates et
 * tailles. Quand les deux côtés ont bougé, le moteur compare les contenus
 * avant de choisir (`comparer`) : rien n'est écrasé sur une simple date.
 */
export type SyncAction =
  /** Nouveau ou modifié sur le poste, inchangé sur le NAS. */
  | { type: 'pousser'; chemin: string }
  /** Nouveau ou modifié sur le NAS, inchangé sur le poste. */
  | { type: 'tirer'; chemin: string }
  /** Présent des deux côtés et modifié des deux côtés (ou jamais synchronisé). */
  | { type: 'comparer'; chemin: string }
  /** Supprimé sur le poste, inchangé sur le NAS. */
  | { type: 'supprimerDistant'; chemin: string }
  /** Supprimé sur le NAS, inchangé sur le poste. */
  | { type: 'supprimerLocal'; chemin: string }
  /** Supprimé des deux côtés : seule l'entrée de l'index disparaît. */
  | { type: 'oublier'; chemin: string }
  | { type: 'creerDossierDistant'; chemin: string }
  | { type: 'creerDossierLocal'; chemin: string }
  | { type: 'supprimerDossierDistant'; chemin: string }
  | { type: 'supprimerDossierLocal'; chemin: string }
  /** Un fichier d'un côté, un dossier de l'autre : rien ne se fait, l'erreur est signalée. */
  | { type: 'incompatible'; chemin: string };

export interface Delta {
  actions: SyncAction[];
  /** Vrai si l'index a été mis de côté parce qu'un des deux côtés était entièrement vide (voir plus bas). */
  indexIgnore: boolean;
}

export function memeTampon(a: FileStamp | ScanEntry | null | undefined, b: FileStamp | ScanEntry | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === null && (b ?? null) === null;
  }
  return a.modifieLe === b.modifieLe && a.taille === b.taille;
}

/**
 * Compare les deux relevés à l'index du dernier passage. L'ordre des actions
 * est celui de l'exécution : dossiers à créer (parents d'abord), transferts,
 * suppressions de fichiers, puis dossiers à supprimer (enfants d'abord).
 */
export function calculerDelta(local: Releve, distant: Releve, index: SyncIndex): Delta {
  // Garde-fou : un côté sans aucun fichier alors que l'index en connaît, c'est un disque démonté, un dossier
  // du NAS vidé ou un mauvais réglage, pas des suppressions voulues. L'index est alors ignoré : on fusionne
  // les deux côtés sans rien supprimer.
  const connus = Object.keys(index.fichiers).length;
  const indexIgnore = connus > 0 && (aucunFichier(local) || aucunFichier(distant));
  const fichiersConnus = indexIgnore ? {} : index.fichiers;
  const dossiersConnus = new Set(indexIgnore ? [] : index.dossiers);

  const transferts: SyncAction[] = [];
  const suppressions: SyncAction[] = [];
  const creations: SyncAction[] = [];
  const suppressionsDeDossiers: SyncAction[] = [];

  const chemins = new Set<string>([...local.keys(), ...distant.keys(), ...Object.keys(fichiersConnus), ...dossiersConnus]);
  for (const chemin of [...chemins].sort()) {
    const l = local.get(chemin) ?? null;
    const d = distant.get(chemin) ?? null;
    if (l !== null && d !== null && l.estDossier !== d.estDossier) {
      transferts.push({ type: 'incompatible', chemin });
      continue;
    }
    if (l?.estDossier === true || d?.estDossier === true || (l === null && d === null && dossiersConnus.has(chemin))) {
      const connu = dossiersConnus.has(chemin);
      if (l !== null && d === null) {
        (connu ? suppressionsDeDossiers : creations).push({ type: connu ? 'supprimerDossierLocal' : 'creerDossierDistant', chemin });
      } else if (l === null && d !== null) {
        (connu ? suppressionsDeDossiers : creations).push({ type: connu ? 'supprimerDossierDistant' : 'creerDossierLocal', chemin });
      }
      continue;
    }

    const connu = fichiersConnus[chemin];
    if (connu === undefined) {
      if (l !== null && d !== null) {
        transferts.push({ type: 'comparer', chemin });
      } else if (l !== null) {
        transferts.push({ type: 'pousser', chemin });
      } else if (d !== null) {
        transferts.push({ type: 'tirer', chemin });
      }
      continue;
    }

    const localChange = l === null || !memeTampon(l, connu.local);
    const distantChange = d === null || !memeTampon(d, connu.distant);
    if (l === null && d === null) {
      suppressions.push({ type: 'oublier', chemin });
    } else if (l === null) {
      // Supprimé sur le poste : on ne supprime sur le NAS que ce qui n'y a pas bougé, sinon on le récupère.
      (distantChange ? transferts : suppressions).push({ type: distantChange ? 'tirer' : 'supprimerDistant', chemin });
    } else if (d === null) {
      (localChange ? transferts : suppressions).push({ type: localChange ? 'pousser' : 'supprimerLocal', chemin });
    } else if (localChange && distantChange) {
      transferts.push({ type: 'comparer', chemin });
    } else if (localChange) {
      transferts.push({ type: 'pousser', chemin });
    } else if (distantChange) {
      transferts.push({ type: 'tirer', chemin });
    }
  }

  const profondeur = (action: SyncAction): number => action.chemin.split('/').length;
  creations.sort((a, b) => profondeur(a) - profondeur(b));
  suppressionsDeDossiers.sort((a, b) => profondeur(b) - profondeur(a));
  return { actions: [...creations, ...transferts, ...suppressions, ...suppressionsDeDossiers], indexIgnore };
}

function aucunFichier(releve: Releve): boolean {
  for (const entree of releve.values()) {
    if (!entree.estDossier) {
      return false;
    }
  }
  return true;
}
