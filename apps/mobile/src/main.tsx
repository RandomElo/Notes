import { Capacitor } from '@capacitor/core';
import { themeParDefaut, variablesDuTheme } from '@notes/ui/theme';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MemosProvider } from './features/voice-memos/MemosContext';
import type { Environnement } from './platform/environment';
import { environnementNatif } from './platform/native';
import { NotesProvider } from './state/NotesContext';
import { poserVariables } from './state/theme';
import './styles.css';

// Le thème par défaut est en place avant le premier affichage : celui du dossier des notes le remplace dès qu'il est lu.
poserVariables(document.documentElement, variablesDuTheme(themeParDefaut));

async function environnement(): Promise<Environnement> {
  if (Capacitor.isNativePlatform()) {
    return environnementNatif();
  }
  if (import.meta.env.DEV) {
    return (await import('./platform/demo')).environnementDeDemo();
  }
  throw new Error("Notes pour Android ne tourne que sur le téléphone (ou en démonstration avec npm run dev).");
}

const racine = document.getElementById('racine');
if (racine === null) {
  throw new Error('Élément racine introuvable.');
}

void environnement().then((env) =>
  createRoot(racine).render(
    <StrictMode>
      <NotesProvider env={env}>
        <MemosProvider>
          <App />
        </MemosProvider>
      </NotesProvider>
    </StrictMode>,
  ),
);
