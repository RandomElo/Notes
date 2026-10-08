import { useCallback, useEffect, useState } from 'react';
import type { MemosState } from '../../../../shared/memos-contract';
import { api } from '../../lib/ipc';

/**
 * État des mémos vocaux (README §13), relu quand le dossier des notes change
 * (un mémo arrive par la sync, une sous-page est créée) et quand la
 * transcription change d'état (téléchargement du modèle, serveur).
 */
export function useMemos(): { etat: MemosState | null; recharger: () => void; definir: (etat: MemosState) => void } {
  const [etat, definirEtat] = useState<MemosState | null>(null);
  const recharger = useCallback(() => {
    void api.etatMemos().then(definirEtat);
  }, []);
  useEffect(() => {
    recharger();
    const desabonnerVault = api.surVaultModifie(recharger);
    const desabonnerWhisper = api.surEtatWhisper((whisper) => definirEtat((actuel) => (actuel === null ? actuel : { ...actuel, whisper })));
    return () => {
      desabonnerVault();
      desabonnerWhisper();
    };
  }, [recharger]);
  return { etat, recharger, definir: definirEtat };
}
