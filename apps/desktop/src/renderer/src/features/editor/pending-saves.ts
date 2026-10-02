/**
 * Les enregistrements que la fenêtre doit attendre avant de se fermer. Chaque
 * éditeur ouvert y inscrit de quoi écrire tout de suite ce qu'il n'a pas encore
 * enregistré.
 */
const vidages = new Set<() => Promise<void>>();

/** Inscrit un éditeur. Renvoie la fonction qui le retire. */
export function inscrireVidage(vider: () => Promise<void>): () => void {
  vidages.add(vider);
  return () => {
    vidages.delete(vider);
  };
}

/** Enregistre tout ce qui est en attente. Ne rejette jamais : la fermeture ne doit pas rester bloquée. */
export async function toutEnregistrer(): Promise<void> {
  await Promise.allSettled([...vidages].map((vider) => vider()));
}
