import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/ipc';
import type { LockView } from '../../../../shared/ipc-contract';

/** Le verrou est entretenu par le main ; le renderer ne lui signale une frappe qu'à cet intervalle au plus. */
const intervalleDeSignalementMs = 10_000;

export interface PageLock {
  verrou: LockView;
  /** À chaque modification du contenu. Pose ou entretient le verrou de la page sur le NAS. */
  signalerFrappe: () => void;
  /** Prend le verrou d'un autre appareil (« Forcer l'édition »). */
  forcer: () => Promise<void>;
}

/**
 * Verrou de la page ouverte (README §5). Lu à l'ouverture et après chaque
 * cycle de sync. Tant qu'un autre appareil l'édite, la page est en lecture
 * seule. Sans NAS, rien n'est bloqué.
 */
export function usePageLock(chemin: string): PageLock {
  const [verrou, definirVerrou] = useState<LockView>({ etat: 'inconnu' });
  const cheminActuel = useRef(chemin);
  const dernierSignal = useRef(0);

  useEffect(() => {
    cheminActuel.current = chemin;
    dernierSignal.current = 0;
    let actif = true;
    const relire = (): void => {
      void api.etatVerrou({ chemin }).then((lu) => actif && definirVerrou(lu));
    };
    relire();
    // Fin de cycle : le verrou a pu être pris, relâché ou forcé par un autre appareil.
    const desabonner = api.surEtatSync((etat) => etat.etat !== 'en_cours' && relire());
    return () => {
      actif = false;
      desabonner();
    };
  }, [chemin]);

  const signalerFrappe = useCallback(() => {
    const maintenant = Date.now();
    if (maintenant - dernierSignal.current < intervalleDeSignalementMs) {
      return;
    }
    dernierSignal.current = maintenant;
    const page = cheminActuel.current;
    void api.prendreVerrou({ chemin: page }).then((resultat) => {
      if (cheminActuel.current === page) {
        definirVerrou(resultat.ok ? { etat: 'a_moi' } : { etat: 'autre', nom: resultat.nom, heartbeat: Date.now() });
      }
    });
  }, []);

  const forcer = useCallback(async () => {
    const page = cheminActuel.current;
    const resultat = await api.prendreVerrou({ chemin: page, forcer: true });
    if (cheminActuel.current === page) {
      dernierSignal.current = Date.now();
      definirVerrou(resultat.ok ? { etat: 'a_moi' } : { etat: 'autre', nom: resultat.nom, heartbeat: Date.now() });
    }
  }, []);

  return { verrou, signalerFrappe, forcer };
}
