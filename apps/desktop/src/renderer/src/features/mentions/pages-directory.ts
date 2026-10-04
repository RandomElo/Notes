import type { TreeNode } from '@notes/core';
import type { MentionedPage, PagesDirectory } from '@notes/ui';

/**
 * Annuaire des pages pour les mentions : identifiant vers titre, icône et
 * dossier, tenu à jour depuis l'arborescence. Une page qui ne change pas garde
 * le même objet, pour que seules les mentions concernées se redessinent.
 */
export class PagesIndex implements PagesDirectory {
  private pages = new Map<string, MentionedPage>();
  /** Identifiants des pages ouvertes récemment, la plus récente en premier : proposées au « @ » avant toute saisie. */
  recentes: readonly string[] = [];
  private readonly ecouteurs = new Set<() => void>();

  readonly lire = (id: string): MentionedPage | null => this.pages.get(id.toLowerCase()) ?? null;

  readonly abonner = (ecouteur: () => void): (() => void) => {
    this.ecouteurs.add(ecouteur);
    return () => this.ecouteurs.delete(ecouteur);
  };

  /** Toutes les pages connues, dans l'ordre de l'arborescence. */
  liste(): (MentionedPage & { id: string })[] {
    return [...this.pages].map(([id, page]) => ({ id, ...page }));
  }

  definirArbre(arbre: readonly TreeNode[]): void {
    const suivantes = new Map<string, MentionedPage>();
    const parcourir = (noeuds: readonly TreeNode[]): void => {
      for (const noeud of noeuds) {
        if (noeud.id !== null) {
          const id = noeud.id.toLowerCase();
          const avant = this.pages.get(id);
          const meme = avant !== undefined && avant.titre === noeud.titre && avant.icone === noeud.icone && avant.chemin === noeud.chemin;
          suivantes.set(id, meme ? avant : { titre: noeud.titre, icone: noeud.icone, chemin: noeud.chemin });
        }
        parcourir(noeud.enfants);
      }
    };
    parcourir(arbre);
    const change = suivantes.size !== this.pages.size || [...suivantes].some(([id, page]) => this.pages.get(id) !== page);
    this.pages = suivantes;
    if (change) {
      for (const ecouteur of this.ecouteurs) {
        ecouteur();
      }
    }
  }
}

/** L'annuaire de la fenêtre : une seule arborescence par fenêtre. */
export const annuaireDesPages = new PagesIndex();
