import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from './components/Notice';
import { RecordingScreen } from './features/voice-memos/RecordingScreen';
import { Connection } from './screens/Connection';
import { Home } from './screens/Home';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';
import { NavigationContexte, fermerLePlusRecent } from './state/navigation';
import type { Ecran, Navigation } from './state/navigation';
import { useNotes } from './state/NotesContext';
import { useThemeApplique } from './state/theme';

// L'écran de page porte l'éditeur (TipTap, coloration du code) : chargé à la première page ouverte, pas au lancement.
const PageScreen = lazy(() => import('./screens/PageScreen').then((module) => ({ default: module.PageScreen })));

/**
 * Navigation entre écrans : une pile, que le bouton Retour d'Android dépile
 * après avoir fermé ce qui est ouvert par-dessus (feuille, sommaire,
 * visionneuse). Sur l'accueil, Retour ferme l'application.
 */
export function App() {
  const { env, pret, reglages, motDePasse, titres, theme } = useNotes();
  useThemeApplique(theme);
  const [pile, definirPile] = useState<Ecran[]>([{ nom: 'accueil' }]);
  const [deplies, definirDeplies] = useState<ReadonlySet<string>>(new Set());
  const positions = useRef(new Map<number, number>());
  const ecran = pile.at(-1) ?? { nom: 'accueil' };

  const ouvrir = useCallback((suivant: Ecran) => {
    definirPile((avant) => {
      positions.current.set(avant.length - 1, window.scrollY);
      const courant = avant.at(-1);
      // Rouvrir la page affichée ne l'empile pas une deuxième fois.
      if (courant !== undefined && JSON.stringify(courant) === JSON.stringify(suivant)) {
        return avant;
      }
      return [...avant, suivant];
    });
    window.scrollTo(0, 0);
  }, []);

  const retour = useCallback(() => {
    if (fermerLePlusRecent()) {
      return;
    }
    if (pile.length <= 1) {
      env.quitter();
      return;
    }
    definirPile(pile.slice(0, -1));
    // L'écran précédent retrouve l'endroit où on l'avait laissé.
    const position = positions.current.get(pile.length - 2) ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, position));
  }, [env, pile]);

  useEffect(() => env.surRetour(retour), [env, retour]);

  // Réglages, arborescence et thème lus : le premier écran est dessiné à l'image suivante, l'écran de démarrage peut partir.
  useEffect(() => {
    if (!pret) {
      return;
    }
    requestAnimationFrame(() => {
      env.contenuAffiche();
      // Repère pour mesurer le lancement (DevTools : performance.getEntriesByName('notes-pret')).
      performance.mark('notes-pret');
    });
    // L'écran de page se charge dans la foulée, en arrière-plan : la première page s'ouvre sans attendre.
    const prechargement = setTimeout(() => void import('./screens/PageScreen'), 300);
    return () => clearTimeout(prechargement);
  }, [env, pret]);

  const navigation = useMemo<Navigation>(
    () => ({
      ouvrir,
      ouvrirPageParId: (id) => {
        const page = titres.get(id);
        if (page !== undefined) {
          ouvrir({ nom: 'page', chemin: page.chemin });
        }
      },
      retour,
      deplies,
      basculer: (chemin) =>
        definirDeplies((avant) => {
          const suivants = new Set(avant);
          if (!suivants.delete(chemin)) {
            suivants.add(chemin);
          }
          return suivants;
        }),
    }),
    [ouvrir, retour, titres, deplies],
  );

  if (!pret) {
    return null;
  }

  if (reglages.nas === null || !motDePasse) {
    return (
      <NavigationContexte.Provider value={navigation}>
        <Connection />
      </NavigationContexte.Provider>
    );
  }

  return (
    <NavigationContexte.Provider value={navigation}>
      {ecran.nom === 'accueil' && <Home />}
      {ecran.nom === 'page' && (
        <Suspense fallback={null}>
          <PageScreen key={ecran.chemin} chemin={ecran.chemin} />
        </Suspense>
      )}
      {ecran.nom === 'recherche' && <Search />}
      {ecran.nom === 'reglages' && <Settings />}
      {ecran.nom === 'connexion' && <Connection retour={retour} />}
      <RecordingScreen />
      <Notice />
    </NavigationContexte.Provider>
  );
}
