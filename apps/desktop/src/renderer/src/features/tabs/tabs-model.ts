/**
 * Onglets de la fenêtre (docs/spec/interface.md) : logique pure, testée. Un onglet montre
 * une page (sa clé dans l'arborescence) ou rien. Une page n'est jamais
 * ouverte dans deux onglets : l'ouvrir ramène à l'onglet qui la montre. Le dernier
 * onglet se ferme comme les autres : sans onglet, la fenêtre montre la recherche de pages.
 */

export interface Tab {
  id: string;
  /** Clé de la page montrée (voir `cleDeNoeud`), null pour un onglet vide. */
  cle: string | null;
}

export interface TabsState {
  onglets: Tab[];
  /** Identifiant de l'onglet affiché, null quand il n'y a plus d'onglet. */
  actif: string | null;
}

export function etatInitial(cle: string | null): TabsState {
  return { onglets: [{ id: 'o1', cle }], actif: 'o1' };
}

export const sansOnglet: TabsState = { onglets: [], actif: null };

/** Lecture tolérante de l'état gardé d'un lancement à l'autre. */
export function estEtatDOnglets(valeur: unknown): valeur is TabsState {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const { onglets, actif } = valeur as { onglets?: unknown; actif?: unknown };
  if (Array.isArray(onglets) && onglets.length === 0) {
    return actif === null;
  }
  return (
    Array.isArray(onglets) &&
    onglets.every(
      (onglet: unknown) =>
        typeof onglet === 'object' &&
        onglet !== null &&
        typeof (onglet as Tab).id === 'string' &&
        ((onglet as Tab).cle === null || typeof (onglet as Tab).cle === 'string'),
    ) &&
    new Set(onglets.map((onglet: Tab) => onglet.id)).size === onglets.length &&
    onglets.some((onglet: Tab) => onglet.id === actif)
  );
}

export function ongletActif(etat: TabsState): Tab | null {
  return etat.onglets.find((onglet) => onglet.id === etat.actif) ?? etat.onglets[0] ?? null;
}

function nouvelId(etat: TabsState): string {
  const numeros = etat.onglets.map((onglet) => Number(/^o(\d+)$/.exec(onglet.id)?.[1] ?? 0));
  return `o${Math.max(0, ...numeros) + 1}`;
}

/**
 * Ouvre une page. Si un onglet la montre déjà, il passe devant. Sinon elle
 * remplace la page de l'onglet affiché, ou arrive dans un nouvel onglet juste
 * après lui si on le demande (clic dans l'arborescence). Un onglet affiché
 * vide la reçoit plutôt que d'en ouvrir un autre. Sans onglet, elle en ouvre un.
 */
export function ouvrir(etat: TabsState, cle: string, nouvelOnglet = false): TabsState {
  const existant = etat.onglets.find((onglet) => onglet.cle === cle);
  if (existant !== undefined) {
    return existant.id === etat.actif ? etat : { ...etat, actif: existant.id };
  }
  const affiche = ongletActif(etat);
  if (affiche === null || (nouvelOnglet && affiche.cle !== null)) {
    return ajouter(etat, cle);
  }
  return remplacer(etat, cle);
}

/** Change la page de l'onglet affiché, sans chercher ailleurs (page abandonnée par Échap, page retirée). */
export function remplacer(etat: TabsState, cle: string | null): TabsState {
  const affiche = ongletActif(etat);
  if (affiche === null) {
    return cle === null ? etat : ajouter(etat, cle);
  }
  if (affiche.cle === cle) {
    return etat;
  }
  // La page ne doit pas rester ouverte dans un autre onglet : celui-là se ferme.
  const autre = cle === null ? undefined : etat.onglets.find((onglet) => onglet.cle === cle);
  const onglets = etat.onglets.filter((onglet) => onglet !== autre).map((onglet) => (onglet.id === affiche.id ? { ...onglet, cle } : onglet));
  return { ...etat, onglets };
}

/** Nouvel onglet juste après l'onglet affiché, qui passe devant (« + » : vide). */
export function ajouter(etat: TabsState, cle: string | null = null): TabsState {
  const id = nouvelId(etat);
  const rang = etat.onglets.findIndex((onglet) => onglet.id === etat.actif);
  const onglets = [...etat.onglets];
  onglets.splice(rang + 1, 0, { id, cle });
  return { onglets, actif: id };
}

/**
 * Ferme un onglet. Si c'était l'onglet affiché, son voisin de droite prend
 * la place (celui de gauche s'il était le dernier). Fermer le dernier ne laisse aucun onglet.
 */
export function fermer(etat: TabsState, id: string): TabsState {
  const rang = etat.onglets.findIndex((onglet) => onglet.id === id);
  if (rang < 0) {
    return etat;
  }
  const onglets = etat.onglets.filter((onglet) => onglet.id !== id);
  if (etat.actif !== id) {
    return { ...etat, onglets };
  }
  const voisin = onglets[Math.min(rang, onglets.length - 1)];
  return { onglets, actif: voisin?.id ?? null };
}

/** Ferme les onglets des pages données (pages mises à la corbeille), comme `fermer` un par un. */
export function fermerLesPages(etat: TabsState, cles: ReadonlySet<string>): TabsState {
  return etat.onglets.filter((onglet) => onglet.cle !== null && cles.has(onglet.cle)).reduce((suite, onglet) => fermer(suite, onglet.id), etat);
}

/** Déplace un onglet au rang donné (compté avant le déplacement, comme la place visée dans la barre). */
export function deplacer(etat: TabsState, id: string, rang: number): TabsState {
  const depart = etat.onglets.findIndex((onglet) => onglet.id === id);
  if (depart < 0) {
    return etat;
  }
  const arrivee = Math.max(0, Math.min(rang > depart ? rang - 1 : rang, etat.onglets.length - 1));
  if (arrivee === depart) {
    return etat;
  }
  const onglets = [...etat.onglets];
  const [onglet] = onglets.splice(depart, 1);
  onglets.splice(arrivee, 0, onglet as Tab);
  return { ...etat, onglets };
}

export function activer(etat: TabsState, id: string): TabsState {
  return etat.actif === id || !etat.onglets.some((onglet) => onglet.id === id) ? etat : { ...etat, actif: id };
}

