/**
 * File d'attente des accès au vault local : opérations sur les pages,
 * enregistrements, ajouts d'images, et écritures de la sync. Une tâche à la
 * fois, dans l'ordre d'arrivée : deux écritures du même fichier ne se
 * marchent pas dessus.
 */
export interface SerialQueue {
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  /** Se termine quand toutes les tâches déjà demandées sont finies. */
  attendre: () => Promise<void>;
}

export function creerFileDAttente(): SerialQueue {
  let file: Promise<unknown> = Promise.resolve();
  return {
    enSerie: <T>(tache: () => Promise<T>): Promise<T> => {
      const resultat = file.then(tache, tache);
      file = resultat.catch(() => undefined);
      return resultat;
    },
    attendre: async () => {
      await file;
    },
  };
}
