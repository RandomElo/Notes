import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { themeParDefaut, variablesDuTheme } from '@notes/ui';
import { App } from './App';
import { poserVariables } from './features/theme/apply-theme';
import './styles.css';

// Le thème par défaut est en place avant le premier affichage : celui du dossier des notes le remplace dès qu'il est lu.
poserVariables(document.documentElement, variablesDuTheme(themeParDefaut));

const racine = document.getElementById('racine');
if (racine === null) {
  throw new Error('Élément racine introuvable.');
}

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
