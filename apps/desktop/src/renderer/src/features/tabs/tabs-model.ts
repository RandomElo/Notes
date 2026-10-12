/**
 * Onglets de la fenêtre (docs/spec/interface.md) : logique pure, testée. Un onglet montre
 * une page (sa clé dans l'arborescence) ou rien. Une page n'est jamais
 * ouverte dans deux onglets : l'ouvrir ramène à l'onglet qui la montre.
 */

export interface Tab {
  id: string;
  /** Clé de la page montrée (voir `cleDeNoeud`), null pour un onglet vide. */
  cle: string | null;
}

export interface TabsState {
  onglets: Tab[];
  /** Identifiant de l'onglet affiché. Toujours celui d'un des onglets. */
  actif: string;
}

export function etatInitial(cle: string | null): TabsState {
  return { onglets: [{ id: 'o1', cle }], actif: 'o1' };
}

/** Lecture tolérante de l'état gardé d'un lancement à l'autre. */
export function estEtatDOnglets(valeur: unknown): valeur is TabsState {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const { onglets, actif } = valeur as { onglets?: unknown; actif?: unknown };
  return (
    Array.isArray(onglets) &&
    onglets.length > 0 &&
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

export function ongletActif(etat: TabsState): Tab {
  return etat.onglets.find((onglet) => onglet.id === etat.actif) ?? (etat.onglets[0] as Tab);
}

function nouvelId(etat: TabsState): string {
  const numeros = etat.onglets.map((onglet) => Number(/^o(\d+)$/.exec(onglet.id)?.[1] ?? 0));
  return `o${Math.max(0, ...numeros) + 1}`;
}

/**
 * Ouvre une page. Si un onglet la montre déjà, il passe devant. Sinon elle
 * remplace la page de l'onglet affiché, ou arrive dans un nouvel onglet juste
 * après lui si on le demande (Ctrl+clic, clic du milieu).
 */
export function ouvrir(etat: TabsState, cle: string, nouvelOnglet = false): TabsState {
  const existant = etat.onglets.find((onglet) => onglet.cle === cle);
  if (existant !== undefined) {
    return existant.id === etat.actif ? etat : { ...etat, actif: existant.id };
  }
  if (nouvelOnglet) {
    return ajouter(etat, cle);
  }
  return remplacer(etat, cle);
}

/** Change la page de l'onglet affiché, sans chercher ailleurs (page abandonnée par Échap, page retirée). */
export function remplacer(etat: TabsState, cle: string | null): TabsState {
  if (ongletActif(etat).cle === cle) {
    return etat;
  }
  // La page ne doit pas rester ouverte dans un autre onglet : celui-là se ferme.
  const autre = cle === null ? undefined : etat.onglets.find((onglet) => onglet.cle === cle);
  const onglets = etat.onglets.filter((onglet) => onglet !== autre).map((onglet) => (onglet.id === etat.actif ? { ...onglet, cle } : onglet));
  return { ...etat, onglets };
}

/** Nouvel onglet juste après l'onglet affiché, qui passe devant (Ctrl+T : vide). */
export function ajouter(etat: TabsState, cle: string | null = null): TabsState {
  const id = nouvelId(etat);
  const rang = etat.onglets.findIndex((onglet) => onglet.id === etat.actif);
  const onglets = [...etat.onglets];
  onglets.splice(rang + 1, 0, { id, cle });
  return { onglets, actif: id };
}

/**
 * Ferme un onglet. Si c'était l'onglet affiché, son voisin de droite prend
 * la place (celui de gauche s'il était le dernier). Le dernier onglet ne se
 * ferme pas : il devient vide.
 */
export function fermer(etat: TabsState, id: string): TabsState {
  const rang = etat.onglets.findIndex((onglet) => onglet.id === id);
  if (rang < 0) {
    return etat;
  }
  if (etat.onglets.length === 1) {
    return etat.onglets[0]?.cle === null ? etat : { ...etat, onglets: [{ id, cle: null }] };
  }
  const onglets = etat.onglets.filter((onglet) => onglet.id !== id);
  if (etat.actif !== id) {
    return { ...etat, onglets };
  }
  const voisin = onglets[Math.min(rang, onglets.length - 1)] as Tab;
  return { onglets, actif: voisin.id };
}

export function activer(etat: TabsState, id: string): TabsState {
  return etat.actif === id || !etat.onglets.some((onglet) => onglet.id === id) ? etat : { ...etat, actif: id };
}

/** Onglet suivant (sens 1) ou précédent (sens -1), en boucle. */
export function voisin(etat: TabsState, sens: 1 | -1): TabsState {
  const rang = etat.onglets.findIndex((onglet) => onglet.id === etat.actif);
  const nombre = etat.onglets.length;
  return activer(etat, (etat.onglets[(rang + sens + nombre) % nombre] as Tab).id);
}

/** Ctrl+1 à Ctrl+9 : onglet n, compté à partir de 1. Rien s'il n'existe pas. */
export function parNumero(etat: TabsState, numero: number): TabsState {
  const onglet = etat.onglets[numero - 1];
  return onglet === undefined ? etat : activer(etat, onglet.id);
}
