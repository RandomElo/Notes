import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/ipc';
import { estListeDeTextes } from '../../state/useStoredState';
import { useVault } from '../../state/useVault';
import { useTheme } from '../theme/useTheme';
import { trouverParCle } from '../sidebar/tree-model';
import { ongletActif, estEtatDOnglets } from '../tabs/tabs-model';
import { demandeDeCreation } from './creation-place';
import { SearchPalette } from './SearchPalette';

/**
 * Contenu de la petite fenêtre du raccourci global (README §7) : la
 * recherche seule. Un choix ouvre la page dans la fenêtre principale ;
 * `Échap` cache la fenêtre. Elle prend la hauteur de son contenu. Gardée
 * cachée entre deux usages, elle repart de zéro à chaque fois qu'on la cache.
 */
export function SearchWindowView() {
  const vault = useVault();
  // Les couleurs du thème du dossier des notes, comme dans la fenêtre principale.
  useTheme(vault.etat === null ? undefined : vault.etat.dossier);
  const [ouvertures, definirOuvertures] = useState(0);
  const contenu = useRef<HTMLDivElement>(null);
  const { recharger } = vault;
  // La page de l'onglet affiché de la fenêtre principale (ou la dernière, fenêtre fermée) : on peut créer à côté.
  const pageOuverte = trouverParCle(vault.arbre, lireOngletAffiche());

  useEffect(() => api.surRechercheCachee(() => definirOuvertures((nombre) => nombre + 1)), []);
  // Des pages ont pu être créées, renommées ou déplacées depuis la dernière fois.
  useEffect(() => api.surRechercheMontree(() => void recharger()), [recharger]);

  useEffect(() => {
    const element = contenu.current;
    if (element === null) {
      return;
    }
    const observateur = new ResizeObserver(() => void api.ajusterLaRecherche({ hauteur: element.getBoundingClientRect().height }));
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  return (
    <div ref={contenu}>
      {vault.etat?.dossier == null ? (
        <p className="bg-surface text-discret p-4 text-sm">{vault.etat === null ? 'Lecture du dossier des notes…' : "Aucun dossier des notes n'est choisi : ouvre Notes pour en choisir un."}</p>
      ) : (
        <SearchPalette
          key={ouvertures}
          seule
          arbre={vault.arbre}
          recentes={lireRecentes()}
          pageOuverte={pageOuverte}
          surChoix={(id, nouvelOnglet) => void api.choisirDepuisLaRecherche({ id, nouvelOnglet })}
          surCreation={async (titre, ou) => {
            const resultat = await api.creerPage({ ...demandeDeCreation(vault.arbre, pageOuverte, ou), titre });
            if (!resultat.ok) {
              return resultat.erreur.message;
            }
            await api.choisirDepuisLaRecherche({ id: resultat.page.id, nouvelOnglet: false });
            return null;
          }}
          surFermeture={() => void api.fermerLaRecherche()}
        />
      )}
    </div>
  );
}

/** Pages récentes de la fenêtre principale, relues à chaque affichage : les deux pages partagent leur stockage local. */
function lireRecentes(): string[] {
  try {
    const lues: unknown = JSON.parse(window.localStorage.getItem('notes.recentes') ?? '[]');
    return estListeDeTextes(lues) ? lues : [];
  } catch {
    return [];
  }
}

/** Page de l'onglet affiché dans la fenêtre principale, lue dans le stockage local partagé. */
function lireOngletAffiche(): string | null {
  try {
    const lus: unknown = JSON.parse(window.localStorage.getItem('notes.onglets') ?? 'null');
    return estEtatDOnglets(lus) ? ongletActif(lus).cle : null;
  } catch {
    return null;
  }
}
