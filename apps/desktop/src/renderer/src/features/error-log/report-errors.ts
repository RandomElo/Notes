import type { RendererError } from '../../../../shared/ipc-contract';

/*
 * Erreurs de l'affichage envoyées au journal des erreurs du profil
 * (docs/spec/architecture.md, « Journal des erreurs ») : sans elles, un
 * écran vide ne laisse aucune trace de sa cause.
 */

function signaler(erreur: RendererError): void {
  // Le journal ne doit jamais provoquer d'autre erreur.
  void window.notes.signalerErreur(erreur).catch(() => undefined);
}

const enTexte = (valeur: unknown): { message: string; detail?: string } => {
  if (valeur instanceof Error) {
    return valeur.stack === undefined ? { message: String(valeur) } : { message: String(valeur), detail: valeur.stack };
  }
  return { message: String(valeur) };
};

/** Erreurs non rattrapées et promesses rejetées sans suite. */
export function ecouterLesErreurs(): void {
  window.addEventListener('error', (evenement) => {
    const { message, detail } = enTexte(evenement.error ?? evenement.message);
    signaler({ nature: 'erreur', message, detail: detail ?? `${evenement.filename}:${evenement.lineno}:${evenement.colno}` });
  });
  window.addEventListener('unhandledrejection', (evenement) => signaler({ nature: 'promesse', ...enTexte(evenement.reason) }));
}

/** Plantage d'un composant React : l'écran se vide, la pile des composants dit lequel. */
export function signalerErreurReact(erreur: unknown, info: { componentStack?: string | undefined }): void {
  const { message, detail } = enTexte(erreur);
  signaler({ nature: 'react', message, detail: [detail, 'Composants :', info.componentStack].filter(Boolean).join('\n') });
  console.error(erreur);
}
