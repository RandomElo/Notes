/**
 * La page ouverte qui peut recevoir le texte d'un fichier Markdown déposé
 * (docs/spec/interface.md) : son éditeur s'inscrit ici tant qu'il est
 * affiché et modifiable. Une seule à la fois : l'onglet affiché.
 */
let ajouter: ((markdown: string) => void) | null = null;

/** Inscrit l'éditeur affiché ; rend de quoi le désinscrire. */
export function inscrireCibleDAjout(ajout: (markdown: string) => void): () => void {
  ajouter = ajout;
  return () => {
    if (ajouter === ajout) {
      ajouter = null;
    }
  };
}

/** Ajoute le texte à la fin de la page affichée. Faux s'il n'y en a pas (pas de page ouverte, ou en lecture seule). */
export function ajouterALaPageOuverte(markdown: string): boolean {
  if (ajouter === null) {
    return false;
  }
  ajouter(markdown);
  return true;
}

export function peutAjouter(): boolean {
  return ajouter !== null;
}
