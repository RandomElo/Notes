import type { BrowserWindow } from 'electron';

/** Si le renderer ne confirme pas la fermeture dans ce délai (page plantée), la fenêtre se ferme quand même. */
const delaiMaxDeFermetureMs = 3000;

/**
 * Handlers des canaux « fenetre: ». La fenêtre n'a pas de cadre système : c'est
 * la barre de titre de l'application qui porte les boutons réduire, agrandir et fermer.
 *
 * La fermeture se fait en deux temps, pour ne perdre aucune frappe : le
 * renderer est prévenu, enregistre la page ouverte, puis confirme. La fenêtre
 * ne se ferme qu'une fois les écritures du vault terminées.
 */
export function creerHandlersFenetre(fenetre: () => BrowserWindow | null, attendreEcritures: () => Promise<void> = async () => {}) {
  let confirmee = false;
  let delai: ReturnType<typeof setTimeout> | null = null;

  const fermerPourDeBon = async (): Promise<void> => {
    if (delai !== null) {
      clearTimeout(delai);
      delai = null;
    }
    await attendreEcritures().catch(() => undefined);
    confirmee = true;
    fenetre()?.close();
  };

  return {
    reduire: (): void => fenetre()?.minimize(),
    basculerAgrandissement: (): boolean => {
      const cible = fenetre();
      if (cible === null) {
        return false;
      }
      if (cible.isMaximized()) {
        cible.unmaximize();
      } else {
        cible.maximize();
      }
      return cible.isMaximized();
    },
    fermer: (): void => fenetre()?.close(),
    estAgrandie: (): boolean => fenetre()?.isMaximized() ?? false,
    confirmerFermeture: (): Promise<void> => fermerPourDeBon(),

    /**
     * À brancher sur l'événement « close » de la fenêtre. Retient la première
     * demande et appelle « prevenir », qui avertit le renderer.
     */
    surDemandeDeFermeture: (evenement: { preventDefault(): void }, prevenir: () => void): void => {
      if (confirmee) {
        return;
      }
      evenement.preventDefault();
      if (delai === null) {
        prevenir();
        delai = setTimeout(() => void fermerPourDeBon(), delaiMaxDeFermetureMs);
      }
    },
  };
}
