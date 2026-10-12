import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.eloi.notes',
  appName: 'Notes',
  webDir: 'dist',
  // Jamais de journal des appels de plugins : en mode debug, Capacitor y écrirait les paramètres, mot de passe du NAS compris (règle 7).
  loggingBehavior: 'none',
  // Fond de la WebView avant le premier dessin : celui de l'application, pas du noir.
  backgroundColor: '#16171B',
  plugins: {
    // L'écran de démarrage reste jusqu'au premier affichage du contenu (main.tsx), sans fond intermédiaire.
    SplashScreen: { launchAutoHide: false, launchFadeOutDuration: 150, backgroundColor: '#16171B' },
    // Texte clair dans les barres du système, sur le fond sombre de l'application.
    SystemBars: { style: 'DARK' },
  },
  android: {
    // Aucune ressource http, aucun contenu distant : la WebView ne charge que l'application.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
