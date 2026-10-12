# Architecture technique

## Choix

| Couche | Choix | Pourquoi |
|---|---|---|
| Runtime desktop | Electron | Accès Node pour SMB et fichiers, écosystème mûr |
| Runtime Android | Capacitor | Même code React et TypeScript dans une WebView, plugins natifs pour SMB et secrets |
| UI | React | Écosystème le mieux couvert pour TipTap |
| Éditeur | TipTap (ProseMirror) | Modèle de blocs strict, nécessaire pour le comportement Notion (BlockNote écarté, trop limité sur tableaux et blocs) |
| Build | Vite, electron-builder, Gradle, Go | Rapide, packaging AppImage et APK, binaire compagnon SMB |
| Langage | TypeScript | Schéma de document et front-matter typés. Dossiers et fichiers en anglais, variables et fonctions en français |
| Styles | Variables CSS générées depuis TOML, TailwindCSS | Thème surchargeable par page sans recompilation |
| Tests | Vitest, Playwright, `go test` | Détail des emplacements plus bas |

Pas de backend, pas de base de données, pas de Docker : c'est une application cliente, le NAS ne fait que du partage de fichiers.

## Organisation du dépôt

Monorepo en npm workspaces. Le découpage existe pour une raison : tout ce qui est partagé entre desktop et Android vit hors des applications.

```
Notes/
├── packages/
│   ├── core/            # fichiers, vault, sync, verrous (le contenu d'une page y est opaque)
│   ├── document/        # contenu d'une page : schéma TipTap, Markdown, opérations ciblées
│   └── ui/              # composants React partagés : rendu d'une page, thème
├── apps/
│   ├── desktop/         # Electron : main, preload, renderer
│   ├── mobile/          # Capacitor : écrans de consultation, plugin SMB (Kotlin)
│   └── smb-companion/   # binaire Go statique, client SMB du desktop
├── fixtures/vault-demo/ # petit vault d'exemple pour le dev et les tests de bout en bout
├── docs/               # spécification (spec/, un fichier par sujet) et raccourcis
├── scripts/             # build du compagnon, vérifications
├── poc/                 # essais jetables, un dossier par essai, supprimés une fois conclus
├── package.json         # workspaces
└── README.md
```

Sens des dépendances, vérifié par le lint :

- `core` et `document` ne dépendent l'un de l'autre dans aucun sens, et d'aucune plateforme : ni Node, ni Electron, ni Capacitor, ni React, ni DOM. Ils tournent tels quels dans un processus Node et dans une WebView.
- `ui` s'appuie sur `document`. Les applications s'appuient sur les trois paquets et ne s'importent jamais entre elles.
- Les accès au disque et au NAS passent par deux interfaces de `core`, `LocalFs` et `RemoteFs`, que chaque application implémente (Node et binaire compagnon côté desktop, plugins Capacitor côté Android). C'est ce qui permet de coder la sync une seule fois et de la tester sans NAS.

Pourquoi trois paquets : `core` se teste sans rien savoir de l'éditeur, `document` porte la règle d'aller-retour Markdown sans perte et les modifications que le téléphone applique sans éditeur, `ui` garantit le même rendu des deux côtés.

## Tests

| Type | Emplacement | Outil |
|---|---|---|
| Unitaire TypeScript | À côté du fichier testé (`x.test.ts`) | Vitest |
| Aller-retour Markdown | `packages/document/tests/roundtrip/`, un fichier `.md` par cas, plus tout le vault d'exemple et des textes tirés au hasard | Vitest |
| Sync sans NAS | `packages/core/src/sync/`, avec des systèmes de fichiers en mémoire | Vitest |
| Unitaire Go | À côté du fichier (`x_test.go`) | `go test` |
| Intégration sur le NAS réel | `apps/smb-companion`, sous le tag `nas`, lancé à la main | `go test -tags nas` |
| Bout en bout desktop | `apps/desktop/e2e/`, sur une copie de `fixtures/vault-demo/`, lancé par `npm run test:e2e` | Playwright |
| Logique de l'application Android | `apps/mobile/src/`, à côté du fichier | Vitest |
| Écrans Android dans un navigateur | `npm run dev -w @notes/mobile`, vault d'exemple en mémoire | À la main ou Playwright |
| Application Android sur le poste | Émulateur Android 13 contre un Samba d'essai, voir plus bas | À la main, par `adb` |

## Essais Android sur le poste

Pour essayer l'APK sans le téléphone ni le NAS : un émulateur Android sans fenêtre et un serveur Samba en Docker réglé comme le NAS.

Ce qui est installé sur le poste :

- Java 21 (`sudo apt install openjdk-21-jdk-headless`), exigé par Capacitor 8 pour compiler l'APK. Java 17 reste à côté.
- Le SDK Android dans `/opt/android-sdk` (appartient à Eloi, sans sudo) : plateforme 36, build-tools 36.0.0, émulateur, image `system-images;android-33;google_apis;x86_64` (Android 13, comme le téléphone d'Eloi), environ 1,5 Go. Ajout par `sdkmanager --sdk_root=/opt/android-sdk "<paquet>"`.
- Le téléphone virtuel `notes-essai` (Pixel 6), créé au premier démarrage dans `~/.android/avd/`.
- Docker, piloté avec sudo : le compte d'Eloi n'est pas dans le groupe `docker`, et ne doit pas y être pour Claude (ce groupe vaut un accès root).

Déroulé :

1. `sudo bash scripts/samba-essai.sh demarrer` (par Eloi) : conteneur `notes-samba-essai` (Alpine 3.22, Samba), port 445 sur 127.0.0.1 seulement, partage `partage` avec une copie du vault d'exemple dans `notes`, utilisateur `utilisateur`, mot de passe tiré au hasard au premier démarrage et gardé ensuite, dans `.cache/samba-essai/acces.txt` (lisible par Eloi seul, hors du dépôt). Réglage : SMB 3.1.1 seul, signature exigée, chiffrement au choix du client, comme le NAS. `demarrer sans-chiffrement` le coupe, pour vérifier que l'application refuse la connexion. L'état des sessions (`smbstatus` : protocole, chiffrement, signature) est recopié toutes les 2 s dans `.cache/samba-essai/smbstatus.txt`.
2. `bash scripts/android-emulateur.sh demarrer` : émulateur sans fenêtre, rien ne s'affiche sur l'écran. Depuis l'émulateur, le poste est à l'adresse `10.0.2.2`.
3. `npm run android:apk`, puis `adb install -r apps/mobile/release/Notes-<version>.apk` et `adb shell am start -n fr.eloi.notes/.MainActivity`. L'écran se lit par `adb exec-out screencap -p`, se pilote par `adb shell input` (touchers, texte, touche Tab pour passer au champ suivant), la position des éléments par `adb shell uiautomator dump`. Réseau coupé et rendu : `adb shell svc wifi disable` et `svc data disable`.
4. À la fin : `bash scripts/android-emulateur.sh arreter`, et `sudo bash scripts/samba-essai.sh arreter` (par Eloi), qui supprime le conteneur.

Pièges :

- Tant que le Samba d'essai tourne, un test du compagnon (`companion-binary.test.ts`, qui attend que rien ne réponde sur 127.0.0.1:445) échoue dans `npm run check`. Arrêter le Samba avant.
- La WebView de l'image Android 13 est ancienne (Chrome 109) : sans `color-mix()`, les fonds en transparence de Tailwind 4 (callouts) y sont faux. Le téléphone a la WebView à jour du Play Store ; l'émulateur sert au comportement, pas aux couleurs.
- En mode debug, Capacitor écrit dans logcat chaque appel de plugin avec ses paramètres, mot de passe compris : `loggingBehavior: 'none'` dans `capacitor.config.ts`, à ne jamais retirer. Après un essai, vérifier que le mot de passe d'essai n'apparaît pas dans `adb logcat -d`.

## Processus desktop

- Main (Node) : cycle SMB, verrous distants, lecture et écriture du vault, watcher FS, coffre à secrets, export PDF, appels LanguageTool, IA (Ollama) et Whisper.
- Renderer (React) : éditeur, arborescence, onglets, sommaires, modales IA, réglages.

`nodeIntegration` désactivé, `contextIsolation` activé, communication via `preload` et `contextBridge` typé.

## Dépendances clés

`@tiptap/*` (avec table, image, code-block-lowlight, task-list), `lowlight`, binaire compagnon SMB en Go (`github.com/cloudsoda/go-smb2`, voir [sync](sync.md)), `yaml` (front-matter), `smol-toml` (thème), `markdown-it` et `markdown-it-mark` (lecture du Markdown), `prosemirror-markdown` (écriture, avec un sérialiseur maison), `@iarna/toml`, `lucide-react`, `emojibase-data` (noms des emojis en français), `onnxruntime-web` (moteur ONNX en WebAssembly, pour le détourage des icônes, avec le modèle silueta de rembg), `fflate` (archives ZIP de l'export, MIT, sans dépendance).

Côté Android : Capacitor 8 (`@capacitor/core`, `android`, `filesystem`, `network`, `app`, `app-launcher`, `splash-screen`), plugin SMB maison en Kotlin s'appuyant sur `smbj` 0.15.0, coffre du mot de passe en Kotlin sur l'Android Keystore.



## Machines visées

| Appareil | Détail |
|---|---|
| PC fixe | AMD Ryzen 7 5800X, 31 Go de mémoire, AMD Radeon RX 7600 (8 Go), Linux Mint, Cinnamon, X11 |
| Portable | Carte graphique NVIDIA |
| Téléphone | Samsung Galaxy S20 FE, Android 13, One UI 5.0 |
