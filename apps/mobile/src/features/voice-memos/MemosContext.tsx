import { envoyerMemosEnAttente, listerMemosEnAttente, nomDeMemo } from '@notes/core';
import type { PendingMemo } from '@notes/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { EtatEnregistrement } from '../../platform/environment';
import { useNotes } from '../../state/NotesContext';

/** Le niveau du son se relit à ce rythme pendant l'enregistrement. */
const intervalleDuNiveauMs = 120;

interface MemosValue {
  /** Mémos terminés, pas encore sur le NAS, du plus ancien au plus récent. */
  attente: PendingMemo[];
  /** Un envoi vers le NAS est en cours. */
  envoi: boolean;
  /** L'enregistrement en cours, null s'il n'y en a pas. */
  enregistrement: EtatEnregistrement | null;
  /** L'écran d'enregistrement est affiché ; Retour le cache, l'enregistrement continue. */
  ecranVisible: boolean;
  montrerEcran(visible: boolean): void;
  /** Jette un mémo pas encore envoyé. */
  jeter(nom: string): Promise<void>;
  demarrer(): Promise<void>;
  /** Range le mémo et l'envoie aussitôt si le NAS répond. */
  terminer(): Promise<void>;
  annuler(): Promise<void>;
}

const Contexte = createContext<MemosValue | null>(null);

export function useMemos(): MemosValue {
  const valeur = useContext(Contexte);
  if (valeur === null) {
    throw new Error('useMemos hors de MemosProvider.');
  }
  return valeur;
}

/**
 * Mémos vocaux du téléphone (J17, docs/spec/memos.md). Un mémo terminé attend dans le
 * dossier privé de l'application ; il part dans `.notes/memos/` aussitôt si
 * le NAS répond, sinon à la première sync qui le joint. L'enregistrement
 * continue écran éteint (service Android) : son état est relu au retour dans
 * l'application.
 */
export function MemosProvider({ children }: { children: ReactNode }) {
  const { env, distantDuVault, surNasJoint, synchroniser, montrerAvis } = useNotes();
  const [attente, definirAttente] = useState<PendingMemo[]>([]);
  const [envoi, definirEnvoi] = useState(false);
  const [enregistrement, definirEnregistrement] = useState<EtatEnregistrement | null>(null);
  const [ecranVisible, montrerEcran] = useState(true);
  /** Un seul envoi à la fois : celui d'après l'enregistrement et celui de la sync ne se croisent pas. */
  const file = useRef<Promise<void>>(Promise.resolve());

  const relire = useCallback(async (): Promise<PendingMemo[]> => {
    const lus = await listerMemosEnAttente(env.memosEnAttente).catch(() => []);
    definirAttente(lus);
    return lus;
  }, [env]);

  /** Envoie les mémos en attente. Lève l'erreur du NAS : ceux qui restent attendent la fois suivante. */
  const envoyer = useCallback((): Promise<void> => {
    const suite = file.current
      .catch(() => undefined)
      .then(async () => {
        if (distantDuVault === null || (await relire()).length === 0) {
          return;
        }
        definirEnvoi(true);
        try {
          await envoyerMemosEnAttente(env.memosEnAttente, distantDuVault, () => void relire());
        } finally {
          definirEnvoi(false);
          await relire();
        }
      });
    file.current = suite;
    return suite;
  }, [env, distantDuVault, relire]);

  useEffect(() => surNasJoint(envoyer), [surNasJoint, envoyer]);

  /** Relit l'enregistrement (terminé depuis la notification ?) et les mémos en attente. */
  const verifier = useCallback(async () => {
    const etat = await env.enregistreur.etat().catch(() => null);
    if (etat !== null) {
      if (etat.erreur !== null) {
        montrerAvis(etat.erreur);
      }
      definirEnregistrement(etat.enCours ? etat : null);
    }
    await relire();
  }, [env, montrerAvis, relire]);

  useEffect(() => {
    void verifier();
    return env.surOccasionDeSync(
      (raison) => {
        if (raison === 'premier-plan') {
          void verifier();
        }
      },
      () => undefined,
    );
  }, [env, verifier]);

  // Pendant l'enregistrement, le niveau du son, et la fin s'il est terminé depuis la notification.
  const enCours = enregistrement !== null;
  useEffect(() => {
    if (!enCours) {
      return;
    }
    const minuterie = setInterval(() => {
      void env.enregistreur
        .etat()
        .then((etat) => {
          if (etat.enCours) {
            definirEnregistrement(etat);
          } else {
            void verifier();
          }
        })
        .catch(() => undefined);
    }, intervalleDuNiveauMs);
    return () => clearInterval(minuterie);
  }, [enCours, env, verifier]);

  const demarrer = useCallback(async () => {
    try {
      await env.enregistreur.demarrer(nomDeMemo(Date.now()));
      montrerEcran(true);
      definirEnregistrement(await env.enregistreur.etat());
    } catch (erreur) {
      montrerAvis(erreur instanceof Error && erreur.message !== '' ? erreur.message : "L'enregistrement n'a pas pu commencer.");
    }
  }, [env, montrerAvis]);

  const terminer = useCallback(async () => {
    const nom = await env.enregistreur.terminer().catch(() => null);
    definirEnregistrement(null);
    if (nom === null) {
      montrerAvis("Mémo trop court : rien n'a été gardé.");
      await relire();
      return;
    }
    try {
      await envoyer();
    } catch {
      // Session fermée ou NAS absent : une sync le rejoint, et envoie le mémo si elle y arrive.
      void synchroniser();
    }
    const restants = await relire();
    montrerAvis(restants.some((memo) => memo.nom === nom) ? 'Mémo gardé sur le téléphone : il partira quand le NAS répondra.' : 'Mémo envoyé sur le NAS.');
  }, [env, envoyer, montrerAvis, relire, synchroniser]);

  const annuler = useCallback(async () => {
    await env.enregistreur.annuler().catch(() => undefined);
    definirEnregistrement(null);
  }, [env]);

  const jeter = useCallback(
    async (nom: string) => {
      // Après l'envoi en cours, s'il y en a un : il a pu le prendre, et alors il est déjà sur le NAS.
      const suite = file.current.catch(() => undefined).then(() => env.memosEnAttente.supprimer(nom));
      file.current = suite.catch(() => undefined);
      await suite.catch(() => undefined);
      await relire();
    },
    [env, relire],
  );

  return (
    <Contexte.Provider value={{ attente, envoi, enregistrement, ecranVisible, montrerEcran, jeter, demarrer, terminer, annuler }}>{children}</Contexte.Provider>
  );
}
