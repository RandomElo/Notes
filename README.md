# Notes

Éditeur de notes local-first, inspiré de Notion et AppFlowy, pour un usage personnel mono-utilisateur. Application desktop Linux pour écrire, petite application Android pour consulter et retoucher, synchronisation SMB vers un NAS.

Ce document est la référence du projet : cahier des charges, décisions techniques et suivi d'avancement. Toute décision prise en cours de route y est reportée (voir [Journal des décisions](#20-journal-des-décisions)).

## État du projet

| | |
|---|---|
| Dernière mise à jour | 2026-10-01 |
| Avancement | J0 et J1 terminés, J2 pas commencé |
| Jalon en cours | Aucun, prochain : J2 (éditeur de base) |
| Points bloquants | Aucun |

Ce qui fonctionne aujourd'hui :

- le socle : monorepo, application Electron durcie, AppImage, vérifications automatiques (`npm run check`) ;
- la connexion au NAS en SMB 3.1.1 signé et chiffré, par le binaire compagnon embarqué, vérifiée sur le NAS réel ;
- le mot de passe du NAS chiffré par le trousseau du système ;
- le choix du dossier des notes au premier lancement ;
- l'arborescence : créer, renommer, déplacer, réordonner et dupliquer des pages, à la souris et au clavier, avec import à la demande des notes venues d'un autre outil ;
- la persistance : l'arbre, les pages dépliées et la page ouverte se retrouvent après redémarrage.

Ce qui n'existe pas encore : l'éditeur (le centre de la fenêtre n'affiche que le titre de la page), la synchronisation avec le NAS (seul le test de connexion existe), la suppression de page, l'application Android.

Reste à faire avant ou pendant J2 :

- commiter le travail de J1, qui ne l'est pas encore ;
- créer le fichier `.env` à partir de `.env.example` pour pouvoir lancer `npm run test:nas` ;
- dérouler les parties 3 à 5 de `docs/recettes/J0.md` (refus de connexion, relance, test d'intégration), non rapportées à ce jour.

Pour reprendre : `npm install`, puis `npm run dev`. Le jalon suivant se lance avec `/jalon J2`.

## Sommaire

1. [Contexte](#1-contexte)
2. [Cahier des charges](#2-cahier-des-charges)
3. [Architecture technique](#3-architecture-technique)
4. [Format de stockage](#4-format-de-stockage)
5. [Synchronisation SMB](#5-synchronisation-smb)
6. [Éditeur](#6-éditeur)
7. [Navigation et interface](#7-navigation-et-interface)
8. [Thème](#8-thème)
9. [Export](#9-export)
10. [Corbeille](#10-corbeille)
11. [Correction orthographique](#11-correction-orthographique)
12. [Fonctions IA](#12-fonctions-ia)
13. [Dictée vocale](#13-dictée-vocale)
14. [Mode liste de tâches](#14-mode-liste-de-tâches)
15. [Application Android](#15-application-android)
16. [Sécurité et configuration](#16-sécurité-et-configuration)
17. [Packaging et distribution](#17-packaging-et-distribution)
18. [Roadmap](#18-roadmap)
19. [Points à trancher](#19-points-à-trancher)
20. [Journal des décisions](#20-journal-des-décisions)
21. [Annexe : raccourcis](#annexe--raccourcis)

---

## 1. Contexte

### Pourquoi pas un outil existant

- Notion : très lisible, bons raccourcis, mais tout passe par le réseau, donc lent au quotidien.
- AppFlowy self-hosted : abandonné, le NAS n'a pas la puissance pour la stack (Postgres, Redis, MinIO).
- AppFlowy Cloud : solution actuelle. Bon design, mais hiérarchie de titres H1/H2/H3 trop peu différenciée, et gestion des blocs au clavier en retrait par rapport à Notion.

### Réponse

Un outil desktop local-first qui ouvre les pages instantanément (contenu sur disque), reprend le design d'AppFlowy et la gestion de blocs de Notion, corrige la hiérarchie typographique via un thème modifiable, se synchronise en SMB, et stocke tout en Markdown standard lisible sans l'app.

Une application Android l'accompagne pour avoir ses listes de tâches et ses pages dans la poche. Ce n'est pas un second éditeur : on y lit, on coche, on ajoute une ligne, on corrige une phrase.

### Hors périmètre

Windows, iOS, bases de données relationnelles, vidéos embarquées, publication publique de liens, multi-utilisateur, auto-update, thème clair (v1), coffres multiples, publication sur le Play Store.

---

## 2. Cahier des charges

| Réf | Contrainte |
|---|---|
| C1 | Application desktop native Linux, application Android compagnon |
| C2 | Desktop 100 % hors ligne ; le réseau ne sert qu'à la sync et aux services annexes |
| C3 | Un dossier par page, fichier `.md` lisible sans l'app |
| C4 | Arborescence de pages à profondeur illimitée |
| C5 | Sync SMB automatique, client intégré à l'app (desktop et Android) |
| C6 | Plusieurs appareils ouverts simultanément (postes Linux, téléphone), donc gestion des accès concurrents |
| C7 | Identifiants SMB stockés chiffrés |
| C8 | Design inspiré d'AppFlowy, typographie corrigée |
| C9 | Services réseau : LanguageTool, LiteLLM, Whisper (optionnel) |
| C10 | Android : consultation hors ligne possible, modification uniquement avec le NAS joignable |

### Périmètre fonctionnel desktop

- Édition : paragraphe, titres H1 à H5, listes (puces, ordonnées, tâches), code, image, tableau, lien de page, lien externe, callout ; raccourcis Markdown ; menu `/` ; barre d'outils flottante ; gestion des blocs au clavier.
- Organisation : arborescence réordonnable, icônes (emoji, Lucide, image), onglets multiples, recherche `Ctrl+K` et raccourci global, sommaire latéral et modal.
- Persistance : Markdown avec front-matter YAML, assets par page, sync par cycle de 30 s avec verrou distant, corbeille NAS (rétention 30 jours).
- Export : PDF (sauts de page propres), Markdown, HTML autonome, ZIP.
- Assistance : correction FR (LanguageTool), relecture et mise au propre (LiteLLM, avec estimation de coût), dictée vocale (Whisper).

### Périmètre fonctionnel Android

- Consultation : arborescence, recherche par titre, lecture de toutes les pages avec le même rendu que le desktop, accès direct aux listes de tâches.
- Modification légère : cocher et décocher, ajouter, modifier, supprimer et réordonner une tâche, compléter une liste à puces, retoucher un texte, créer une page simple.
- Tout le reste (blocs riches, export, corbeille, IA, dictée, correction, réglage du thème) reste sur le desktop.

Détail en [section 15](#15-application-android).

---

## 3. Architecture technique

### Choix

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

### Organisation du dépôt

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
├── docs/recettes/       # procédures de test manuel, une par jalon
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

### Tests

| Type | Emplacement | Outil |
|---|---|---|
| Unitaire TypeScript | À côté du fichier testé (`x.test.ts`) | Vitest |
| Aller-retour Markdown | `packages/document/tests/roundtrip/` | Vitest |
| Sync sans NAS | `packages/core/src/sync/`, avec des systèmes de fichiers en mémoire | Vitest |
| Unitaire Go | À côté du fichier (`x_test.go`) | `go test` |
| Intégration sur le NAS réel | `apps/smb-companion`, sous le tag `nas`, lancé à la main | `go test -tags nas` |
| Bout en bout desktop | `apps/desktop/e2e/`, sur `fixtures/vault-demo/` | Playwright |
| Recette manuelle | `docs/recettes/J<n>.md` | À la main |

### Processus desktop

- Main (Node) : cycle SMB, verrous distants, lecture et écriture du vault, watcher FS, raccourci global, coffre à secrets, export PDF, appels LanguageTool, LiteLLM et Whisper.
- Renderer (React) : éditeur, arborescence, onglets, sommaires, palette `Ctrl+K`, modales IA, réglages.

`nodeIntegration` désactivé, `contextIsolation` activé, communication via `preload` et `contextBridge` typé.

### Dépendances clés

`@tiptap/*` (avec table, image, code-block-lowlight, task-list), `lowlight`, binaire compagnon SMB en Go (`github.com/cloudsoda/go-smb2`, voir §5), `yaml` (front-matter), `prosemirror-markdown` (sérialiseur custom), `@iarna/toml`, `lucide-react`, `@imgly/background-removal-node`.

Côté Android : `@capacitor/core`, `@capacitor/filesystem`, plugin SMB maison en Kotlin s'appuyant sur `smbj` 0.13 (validé par un POC le 2026-10-01).

---

## 4. Format de stockage

Le « vault » est le dossier qui contient toutes les notes : c'est lui qu'on choisit au premier lancement et qui est copié sur le NAS. Le mot vient d'Obsidian (un coffre de notes). Il existe en deux exemplaires, le vault local sur le poste, où l'on travaille, et sa copie sur le NAS. Dans l'interface, on parle simplement du « dossier des notes ».

Une page est un dossier contenant `page.md`, un dossier `assets/` si besoin, et les pages enfants.

```
vault/
├── .notes/               # theme.toml, dictionary.txt, ai-usage.json
├── Projets/
│   ├── page.md
│   ├── .order            # ordre manuel des enfants
│   └── Refonte du NAS/
│       ├── page.md
│       └── assets/
└── .trash/               # corbeille, uniquement sur le NAS
```

### Nommage

Nom de dossier = titre assaini (caractères refusés par SMB remplacés : `\ / : * ? " < > |`, 100 caractères max). L'identifiant réel vit dans le front-matter, pas dans le nom.

### Front-matter YAML

| Champ | Contenu |
|---|---|
| `id` | UUID v7 |
| `title` | Titre de la page |
| `icon` | Emoji, nom Lucide ou image |
| `created`, `updated` | Dates ISO |
| `mode` | Optionnel, `todo` pour le mode liste de tâches (§14) |
| `theme_overrides` | Optionnel, surcharges de couleurs (§8) |

### Corps

Markdown standard : titres, gras, italique, barré, code, listes, tâches `- [ ]` et `- [x]`, tableaux GFM, code fencé, images.

- Blocs avancés sans équivalent Markdown : bloc code fencé `notes-callout` contenant du YAML (type, icône, texte). Reste lisible dans n'importe quel éditeur.
- Liens internes : syntaxe Markdown standard avec cible `notes://uuid`, résolue en titre courant à l'affichage, réécrite en chemin relatif à l'export. Lien cassé affiché barré.
- Liens externes : label nettoyé si identique à l'URL (`https://www.google.com/` devient `google.com`).
- Couleurs de texte : non supportées en v1 (pas de syntaxe Markdown propre ; couvert par thème, callouts et surlignage).
- Ordre manuel : fichier `.order` (liste d'UUID) dans chaque dossier qui a des enfants.

### Import de `.md` externes

Détectés et marqués « non importés ». La normalisation (titre, UUID, front-matter) ne se fait que sur demande explicite. Jamais de réécriture silencieuse.

Trois cas, tous affichés en italique dans l'arborescence :

- un fichier `Titre.md` posé dans le vault : l'import crée le dossier `Titre/` et y place le fichier sous le nom `page.md`, avec un front-matter ajouté ;
- un dossier dont le `page.md` n'a pas de front-matter valide : l'import complète le front-matter, en gardant le titre, la date et les clés déjà présentes ;
- un dossier sans `page.md` mais qui contient des notes : l'import y crée une page vide à son nom.

Le texte du fichier n'est jamais modifié. Un élément s'importe après son dossier parent. Les fichiers dont le nom serait refusé par SMB (`:`, `?`, `*`...) ne sont pas affichés : ils ne pourraient pas être synchronisés.

### Vault local

Le dossier du vault sur le poste se choisit au premier lancement (`~/Notes` proposé) et se retient dans les réglages locaux. Il doit être réservé aux notes : la racine du disque et le dossier personnel sont refusés. L'application surveille ce dossier et met l'arborescence à jour quand un autre outil y change quelque chose.

### Ordre d'affichage

Les pages listées dans `.order` viennent d'abord, dans cet ordre. Le reste suit par titre, à la française (accents ignorés, « Page 2 » avant « Page 10 »). Dès qu'on déplace une page à la main, le `.order` du dossier est écrit avec toutes ses pages.

### Écriture

Une page ouverte puis enregistrée sans modification ne change pas d'un octet. Quand l'application modifie le front-matter, elle ne touche qu'aux clés concernées : clés inconnues, commentaires et ordre des clés sont conservés. Toute écriture passe par un fichier temporaire puis un renommage, pour qu'une coupure ne laisse jamais un fichier à moitié écrit.

---

## 5. Synchronisation SMB

Le vault local est la source de travail. Client SMB intégré, pas de montage système. Le moteur de sync est dans `packages/core` et sert aux deux applications, avec un comportement différent selon l'appareil.

| | Desktop | Android |
|---|---|---|
| Copie locale | Vault complet | Cache des pages (texte complet, assets à la demande) |
| Sens | Bidirectionnel | Descendant, plus écriture directe à chaque modification |
| Déclenchement | Toutes les 30 s, au démarrage, à la fermeture | À l'ouverture, au retour au premier plan, au tirer pour rafraîchir, toutes les 30 s au premier plan |
| Édition hors ligne | Oui, poussée au cycle suivant | Non |

### Cycle

Lister l'état distant, comparer à l'index local (chemin, mtime, hash), calculer le delta (push, pull, suppression), transférer, mettre à jour l'index, rafraîchir l'UI. Cycle sauté si rien n'a changé.

### Verrou distant par page

Fichier `.lock` (holder, pid, heartbeat) dans le dossier de la page sur le NAS. Les `.lock` ne sont jamais copiés dans le vault local.

| Situation | Comportement |
|---|---|
| Pas de verrou | Ouverture en écriture |
| Verrou de cet appareil | Reprise normale |
| Verrou d'un autre appareil, heartbeat < 90 s | Lecture seule ; bouton « Forcer l'édition » sur desktop uniquement |
| Verrou périmé (> 90 s) | Reprise automatique |

Le desktop ne garde le verrou que pendant l'édition active : posé à la première frappe, relâché après 60 s sans frappe une fois la page poussée sur le NAS. Sans cette règle, une liste de courses laissée ouverte dans un onglet à la maison resterait verrouillée et le téléphone ne pourrait rien cocher. Une page ouverte mais inactive est rechargée si le cycle détecte une version distante plus récente.

### Écriture depuis Android

Le téléphone n'écrit jamais dans son cache en attendant mieux. Chaque modification suit ce déroulé :

1. Vérifier que le NAS est joignable, sinon refuser avec un message clair.
2. Lire le verrou : s'il est tenu par un autre appareil et vivant, refuser.
3. Poser le verrou, relire `page.md` sur le NAS, appliquer l'opération sur cette version fraîche.
4. Écrire sur le NAS, mettre à jour le cache, retirer le verrou.

Pour une retouche de texte, le verrou est tenu avec heartbeat le temps de la saisie. Conséquence voulue : le téléphone ne peut pas créer de conflit, puisqu'il n'a jamais de modification en attente.

### Filet de sécurité

En cas de divergence détectée, la version distante est sauvegardée en `page.conflit-[date].md`. Jamais d'écrasement silencieux.

### Hors ligne

Le desktop continue de fonctionner sur le vault local. Indicateur d'état dans la barre de statut : synchronisé, en cours, en attente, injoignable, conflit. Sur Android, la consultation continue sur le cache et les contrôles de modification sont désactivés.

### Point de vigilance

Le NAS parle SMB 3, c'est la version visée, avec chiffrement du transport. Les libs SMB en JavaScript pur (`@marsaud/smb2` et dérivées) s'arrêtent à SMB 2.0.2 sans chiffrement : elles sont écartées. Côté desktop, le client SMB est embarqué dans l'application : l'AppImage contient tout ce qu'il faut et ne dépend d'aucun paquet du système. Le `smbclient` installé sur le poste est donc écarté lui aussi. La forme retenue est un binaire compagnon lié statiquement, livré dans l'AppImage, qui parle SMB 3 et que le main pilote par messages JSON sur son entrée et sa sortie standard. Il garde la session ouverte, ce qui évite de repayer connexion et authentification à chaque opération.

Il est écrit en Go avec la lib `go-smb2` (Go pur), ce qui donne un exécutable unique d'environ 5 Mo sans aucune dépendance. Validé par un POC sur le NAS réel : SMB 3.1.1 imposé, signature exigée, chiffrement imposé, et environ une milliseconde par opération une fois la session ouverte.

Le NAS est réglé sur « chiffrement défini par le client » : c'est au client de le demander. `go-smb2` ne sait pas le faire d'origine, il ne chiffre que si le serveur l'exige. Le projet embarque donc une copie de la lib avec un correctif d'une dizaine de lignes qui impose le chiffrement et refuse la connexion s'il n'est pas négocié. Vérifié sur le NAS : sans le correctif, aucune réponse chiffrée ; avec, toutes le sont, sans surcoût mesurable. Le correctif est à reporter à chaque mise à jour de la lib.

Un module natif Node lié à `libsmbclient` est écarté : il faudrait embarquer toute la chaîne de bibliothèques Samba et le recompiler à chaque version d'Electron. Dans tous les cas, le client reste derrière l'interface `RemoteFs`, donc remplaçable sans toucher à la sync.

Côté Android, `smbj` gère SMB 3 chiffré, vérifié sur le téléphone avec le NAS réel.

Le compte du NAS a la double authentification activée, mais elle ne s'applique pas à SMB : la connexion se fait par identifiant et mot de passe seulement, vérifié avec le compte réel. La 2FA dépend du mode d'accès au NAS (elle a dû être gérée pour l'outil de sauvegarde, qui passe par un autre accès), pas du compte lui-même. Rien à coder de ce côté.

---

## 6. Éditeur

Section desktop. Sur Android, le même schéma TipTap sert au rendu en lecture seule (§15).

### Raccourcis de saisie Markdown

`#` à `#####` (titres), `-` ou `*` (puces), `1.` (ordonnée), `[]` ou `[ ]` (case à cocher), `>` (citation), `---` (séparateur), ` ``` ` (code), `**gras**`, `*italique*`, `~~barré~~`, `` `code` ``, `==surlignage==`.

### Menu `/`

Titres, paragraphe, listes, tâche, citation, code, tableau, image, séparateur, callout, page enfant, lien, date. En français avec alias anglais, recherche insensible aux accents.

### Gestion des blocs au clavier

Comportement Notion, absent d'AppFlowy : `Échap` sélectionne le bloc (deux fois : le bloc parent), les flèches naviguent, `Shift+↑/↓` étend la sélection, `Ctrl+Shift+↑/↓` déplace, `Ctrl+D` duplique, `Tab` et `Shift+Tab` indentent. Poignée `⠿` au survol pour le glisser-déposer et le menu contextuel.

### Barre d'outils flottante

Apparaît au clic (pas seulement à la sélection de texte), disparaît à la frappe, au clic ailleurs ou sur `Échap`. Contenu adapté au type de bloc (texte, titre, cellule, image, code, callout).

### Tableaux

Mise en page uniquement (pas de types, filtres ni tri). Création de lignes et colonnes par cliquer-glisser avec aperçu en temps réel. Navigation `Tab`, `Ctrl+↑/↓`, `Ctrl+←/→` (mot en appui bref, cellule en appui long > 350 ms).

### Blocs de code

Coloration `lowlight` (highlight.js), large liste de langages, sélecteur avec recherche, détection auto au collage, bouton copier, numérotation optionnelle, retour à la ligne, `Tab` indente.

### Images

Insertion par `/image`, glisser-déposer ou collage, copie dans `assets/`, redimensionnement (33, 66, 100 %), alignement, alt text, légende, visionneuse plein écran. Pas de vidéo. Détection des assets orphelins.

### Liens et mentions

`@` ou `/lien` pour mentionner une page (icône et titre courant, suit les renommages). URL collée sur une sélection ou seule. Mentions cassées signalées et listées dans les réglages.

### Icônes de page

Emoji (recherche FR), icône Lucide (table de correspondance FR vers EN), image (recadrage carré 128×128, détourage auto du fond via ONNX local).

---

## 7. Navigation et interface

Section desktop. L'interface Android est décrite en §15.

- Disposition : onglets en haut, barre latérale (arborescence) à gauche, éditeur au centre, sommaire à droite, barre de statut en bas (sync, corrections, coût IA du jour).
- Barre latérale : arborescence repliable, glisser-déposer pour réordonner et déplacer, menu contextuel (nouvelle page, renommer, icône, dupliquer, exporter, supprimer), accès corbeille. Tout se fait aussi au clavier : flèches pour naviguer, `F2` pour renommer, `Alt+↑/↓` pour déplacer une page parmi ses sœurs. Les éléments dépliés et la page ouverte sont retenus d'un lancement à l'autre.
- Onglets : multiples dans une seule fenêtre, `Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`, `Ctrl+1` à `9`, restaurés au démarrage, point si non synchronisé.
- Recherche `Ctrl+K` : sur les titres de page uniquement (pas de full-text en v1), floue, insensible aux accents, pages récentes par défaut, proposition de création si aucun résultat.
- Raccourci global : `Ctrl+Alt+Espace` par défaut, configurable, ramène la fenêtre au premier plan et ouvre la recherche depuis n'importe où dans le système. Les postes visés sont en session X11 (Cinnamon), où `globalShortcut` d'Electron fonctionne ; Wayland n'est pas pris en charge.
- Sommaire : version latérale permanente (suivi de lecture via IntersectionObserver, réduite en traits au repos) et version modale (arborescence complète, recherche).

---

## 8. Thème

Thème défini dans `.notes/theme.toml`, converti en variables CSS, rechargé à chaud. Sombre uniquement en v1. Le même thème s'applique sur Android, sans réglage sur le téléphone.

Le point clé est la hiérarchie H1 à H5, nettement différenciée (taille, graisse, couleur). C'est la correction principale par rapport à AppFlowy.

- Sections du TOML : couleurs (`colors`), typographie (`typography`), par niveau de titre (`heading.h1` à `h5`), code et sa coloration syntaxique, callouts, tableau, UI (largeurs, radius, transitions).
- Surcharges par page : `theme_overrides` dans le front-matter peut redéfinir des couleurs, pas la typo, les tailles ni les espacements, pour garder une cohérence globale.
- Validation tolérante : une valeur TOML invalide provoque un repli sur le défaut et un avertissement non bloquant. Une faute de frappe dans le thème ne casse jamais l'app.

---

## 9. Export

Desktop uniquement.

| Format | Portée | Images | Apparence | Usage |
|---|---|---|---|---|
| PDF | Page seule | Oui | Élevée | Impression, envoi formel |
| Markdown | Page seule | Non (mention texte) | Nulle | Interopérabilité |
| HTML autonome | Page seule | Oui (base64) | Maximale | Partage par fichier |
| ZIP | Page et descendants | Oui | Selon format interne | Archivage |

- PDF : rendu hors écran avec le thème actif (`printToPDF`). Règles de saut de page : titres jamais seuls en bas, code, images, tableaux et callouts non coupés (tableaux : en-tête répété si la coupure est inévitable), orphelines et veuves gérées. Pied de page : titre, auteur, numéro de page. Options : format papier, marges, icônes ou non.
- Markdown : front-matter retirable, mentions réécrites en chemins relatifs, images remplacées par une mention textuelle, callouts convertis en citations.
- HTML autonome : CSS et images inlinés en base64, coloration syntaxique précalculée, sommaire avec ancres. Format recommandé pour partager en conservant l'apparence exacte.
- ZIP : page et enfants avec assets, arborescence conservée, option de sortie en HTML avec navigation entre pages.

---

## 10. Corbeille

Desktop uniquement. La corbeille est sur le NAS (`.trash/`), sans copie locale. Supprimer une page déplace son dossier complet (enfants inclus) vers un dossier horodaté, avec un `.trashmeta.yaml` (chemin d'origine, date, UUID du parent).

Rétention de 30 jours, purge automatique au démarrage. Interface : liste, prévisualisation, restaurer, supprimer définitivement (confirmation requise), vider. Si le NAS est injoignable, corbeille locale temporaire transférée au cycle suivant.

---

## 11. Correction orthographique

Desktop uniquement. LanguageTool, français seulement. Vérification par bloc modifié (debounce 800 ms), pas sur la page entière. Soulignement rouge (orthographe) ou bleu (grammaire, style). Popover : suggestion, règle, « Ignorer », « Ajouter au dictionnaire » (`.notes/dictionary.txt`, synchronisé). Code et URL exclus. Compteur dans la barre de statut. Désactivation silencieuse si le serveur est injoignable : l'édition n'est jamais bloquée.

---

## 12. Fonctions IA

Desktop uniquement. Toutes les requêtes passent par le proxy LiteLLM du réseau.

### Deux fonctions, appliquées à la page entière

- Relecture stylistique : améliore fluidité et formulation sans changer la structure ni le sens.
- Mise au propre : transforme des notes en vrac en document structuré et développé. Ce n'est pas un résumé, c'est l'inverse.

### Flux

Jamais de remplacement direct. Sélection de la fonction, modale d'estimation (modèle, tokens d'entrée et de sortie, coût, dépense du jour), exécution annulable, vue de comparaison avant/après (diff en deux colonnes ou unifié), puis accepter ou rejeter. Une acceptation s'annule par `Ctrl+Z`.

### Coût

Tokens d'entrée calculés localement, sortie estimée par ratio calibré, tarifs récupérés depuis LiteLLM (`/model/info`). Historique dans `.notes/ai-usage.json` (synchronisé), agrégé par jour, semaine, mois et année avec graphiques. Dépense du jour affichée en permanence.

### Nettoyage des sorties LLM

Systématique avant insertion : suppression des fences englobantes, des préambules et conclusions, des séparateurs ajoutés, normalisation des puces, vérification de la cohérence des niveaux de titre, suppression des emojis et du gras parasites ajoutés par le modèle (ce qui était présent dans l'entrée est préservé). Les blocs de code ne sont jamais touchés.

### Configuration

URL du proxy, clé API chiffrée, modèle par fonction, prompts système éditables, seuil d'alerte de dépense mensuelle.

---

## 13. Dictée vocale

Desktop uniquement. Whisper en local, via un serveur `faster-whisper` dédié sur la machine GPU du réseau. Il n'est pas embarqué dans l'app : cohérent avec LanguageTool et LiteLLM, et cela évite 1 Go d'installeur et CUDA côté client.

- Config recommandée : modèle `large-v3-turbo`, quantification `int8_float16`, environ 2 Go de VRAM, langue FR forcée. Une dictée de 30 s est transcrite en 1 à 3 s.
- Flux : déclenchement (micro ou raccourci), enregistrement (forme d'onde), arrêt manuel ou sur silence prolongé, envoi, transcription insérée au curseur. L'audio est supprimé après transcription, jamais stocké dans `assets/`.
- Chaînage optionnel avec la Mise au propre (§12), toujours via la modale de coût, jamais automatique.
- Repli : dictée désactivée avec un message explicite si le serveur est injoignable.

---

## 14. Mode liste de tâches

Un mode dédié par page, façon Google Keep, distinct des cases à cocher normales. C'est aussi l'usage principal de l'application Android.

Les cases à cocher classiques (§6) restent un bloc parmi d'autres, inséré via `/tache` ou `[] `, mélangé librement avec du texte et des titres. Leur comportement ne change pas.

Le mode liste s'active page par page, par un bouton dans l'en-tête, ce qui écrit `mode: todo` dans le front-matter. Une fois activé :

- Chaque nouvelle ligne devient automatiquement une case à cocher, sans retaper `/tache` ou `[]`.
- `Entrée` en fin d'item crée directement l'item suivant, déjà sous forme de case.
- Les items cochés passent en style barré et atténué, et se regroupent en bas de page dans une section « Terminé » repliable.
- Un champ d'ajout rapide reste visible en haut de liste, comme dans Keep.
- Le mode se désactive à tout moment : la page redevient un éditeur classique, les items existants restent des cases à cocher normales.

Le stockage reste du Markdown standard (`- [ ]` et `- [x]`). Le flag `mode: todo` ne change que le comportement d'édition, pas le format de fichier : une page en mode liste reste lisible et éditable telle quelle hors de l'application.

---

## 15. Application Android

Compagnon de consultation, pas un second éditeur. Construite avec Capacitor à partir de `packages/core`, `packages/document` et `packages/ui`, donc même format, même rendu, même thème que le desktop.

### Consultation

- Écran d'accueil : les pages en mode liste d'abord, puis les pages récentes.
- Arborescence dans un tiroir latéral, repliable, en lecture seule (pas de déplacement de pages).
- Recherche par titre, floue et insensible aux accents, comme `Ctrl+K`.
- Lecture de toutes les pages avec le rendu complet : titres, code coloré, tableaux (défilement horizontal), images (visionneuse plein écran), callouts, mentions cliquables.
- Sommaire en version modale.
- Tout cela fonctionne hors ligne sur le cache local. Un indicateur donne l'état du NAS et la date de la dernière synchronisation.

### Modifications permises

| Action | Où |
|---|---|
| Cocher, décocher une tâche | Toutes les pages |
| Ajouter une tâche (champ d'ajout rapide) | Pages en mode liste |
| Modifier le texte, supprimer, réordonner une tâche | Pages en mode liste |
| Compléter une liste à puces (ajouter un item) | Toutes les pages |
| Retoucher un paragraphe ou un titre, en Markdown brut | Toutes les pages |
| Créer une page simple (titre, parent, classique ou mode liste) | Arborescence |

Toute modification exige une connexion SMB directe au NAS au moment où elle est faite (déroulé en §5). Quand le NAS est injoignable, les cases, champs et boutons de modification sont désactivés et un bandeau l'indique. Il n'y a pas de file d'attente de modifications.

Techniquement, le téléphone n'embarque pas l'éditeur complet : la page est rendue par TipTap en lecture seule, et chaque modification est une opération ciblée de `packages/document` (basculer une tâche, insérer un item, remplacer le texte d'un bloc) suivie de la même sérialisation Markdown que sur le desktop.

### Hors périmètre Android

Menu `/`, gestion des blocs, barre d'outils, édition de tableaux, insertion d'images, renommage, déplacement et suppression de pages, corbeille, export, onglets, correction orthographique, IA, dictée, réglage du thème, synchronisation en arrière-plan, widget.

### Réseau

Le téléphone est sur Tailscale, lancé au démarrage. L'adresse du NAS configurée dans l'app est son adresse Tailscale (nom MagicDNS ou IP `100.x`) : la même au domicile et à l'extérieur, donc consultation et modification possibles partout où le tailnet est joignable. L'app ne pilote pas Tailscale, elle constate seulement que le NAS répond ou non. Le chiffrement SMB 3 reste activé même à travers le tunnel.

---

## 16. Sécurité et configuration

### Secrets

Règle : aucun identifiant n'est écrit en clair sur le disque, ni dans le vault, ni dans les réglages, ni dans les journaux. Concerne le mot de passe SMB, la clé API LiteLLM, et les identifiants LanguageTool et Whisper le cas échéant. Les secrets sont stockés hors du vault et jamais synchronisés.

- Desktop : `safeStorage` d'Electron, qui s'appuie sur le trousseau du système (`libsecret`, KWallet). Sans trousseau disponible, Electron retomberait sur un stockage non chiffré (backend `basic_text`) : l'app le détecte, refuse d'enregistrer le secret, le garde en mémoire le temps de la session et le redemande au lancement suivant.
- Android : clé générée dans l'Android Keystore, qui chiffre le mot de passe SMB stocké dans le stockage privé de l'app. Seul ce secret est concerné.
- Les secrets ne quittent jamais le processus qui en a besoin : sur desktop ils restent dans le main, le renderer ne les reçoit pas. Le mot de passe SMB est transmis au binaire compagnon par son entrée standard, jamais en argument de ligne de commande (visible dans `ps`) ni par variable d'environnement, et le compagnon ne l'écrit nulle part.
- Rien de sensible dans les messages d'erreur ni dans les logs : ni mot de passe, ni clé, ni en-tête d'autorisation.

### Compte du NAS

L'app se connecte en SMB avec le compte personnel d'Eloi, pas avec un compte dédié. La double authentification de ce compte ne couvre pas SMB : le mot de passe enregistré par l'app donne donc accès à tous les partages du compte. C'est ce qui rend la règle ci-dessus non négociable, le mot de passe n'existe sur le poste et sur le téléphone que sous forme chiffrée.

### Emplacement des fichiers

| Fichier | Emplacement | Synchronisé |
|---|---|---|
| Secrets chiffrés | `userData/secrets.enc` | Non |
| Réglages locaux | `userData/settings.json` | Non |
| Index des titres | `userData/cache/titles.json` | Non |
| Index de sync | `userData/cache/sync-index.json` | Non |
| Thème | `vault/.notes/theme.toml` | Oui |
| Dictionnaire | `vault/.notes/dictionary.txt` | Oui |
| Historique IA | `vault/.notes/ai-usage.json` | Oui |

Sur Android, cache des pages, index et réglages vivent dans le stockage privé de l'application.

### Durcissement

- Electron : `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, IPC via `contextBridge` minimal, CSP stricte, navigation externe bloquée (ouverture via `shell.openExternal`), validation des entrées venant du disque et du NAS.
- Chaque appel IPC est refusé s'il ne vient pas de la page de l'application. Toute demande de permission (caméra, micro, notifications) est refusée par défaut.
- Le port de débogage de Chromium est retiré des versions installées : l'application ne peut pas être pilotée de l'extérieur.
- Le binaire compagnon est lancé sans aucune variable d'environnement du poste, et s'arrête dès que l'application ferme son entrée.
- Android : CSP stricte dans la WebView, aucun contenu distant chargé, liens externes ouverts dans le navigateur du téléphone, pas de permission au-delà du réseau.
- Les deux : le contenu des pages vient du NAS et n'est pas de confiance. Le Markdown est toujours rendu via le schéma TipTap, jamais injecté en HTML brut.

---

## 17. Packaging et distribution

- Linux : AppImage via electron-builder (`Notes-1.0.0-x86_64.AppImage`), aucune installation requise et aucune dépendance à un paquet du système : le client SMB est dans l'AppImage. Build x86_64 uniquement, pour le PC fixe et le portable (Linux Mint, Cinnamon, X11). `.deb` possible en complément.
- Android : APK construit avec Gradle, signé avec une clé locale, installé à la main (transfert du fichier ou `adb install`). Pas de Play Store.
- Pas d'auto-update : projet privé, réinstallation manuelle. Numéro de version visible dans les réglages des deux applications.
- La clé de signature Android reste hors du dépôt. La perdre oblige à désinstaller l'app avant de réinstaller une version signée autrement.

---

## 18. Roadmap

Chaque jalon est livrable et testable indépendamment. L'ordre suit les dépendances techniques (stockage, éditeur, sync) et termine par Android, une fois le desktop complet.

| Jalon | Objet | Critère de sortie | État |
|---|---|---|---|
| J0 | Socle monorepo, Electron, preuve SMB | Fenêtre ouverte sous Linux, fichier test écrit et relu sur le NAS en SMB 3 depuis le poste (preuve côté téléphone déjà faite) | Fait |
| J1 | Stockage et arborescence | Arbre créé et réorganisé, persistant après redémarrage | Fait |
| J2 | Éditeur de base | Aller-retour Markdown sans perte | À faire |
| J3 | Gestion des blocs (clavier) | Page restructurable sans souris | À faire |
| J4 | Thème | Modif du TOML visible à chaud, hiérarchie lisible | À faire |
| J5 | Sync SMB | Deux machines pendant une journée sans perte ni écrasement | À faire |
| J6 | Blocs riches (code, images, tableaux, callouts) | Page technique complète rédigée confortablement | À faire |
| J7 | Navigation avancée | Raccourci global et sommaire toujours à jour | À faire |
| J8 | Liens et icônes | Renommage sans mention cassée | À faire |
| J9 | Export | 20 pages en PDF sans coupure incorrecte | À faire |
| J10 | Corbeille | Page supprimée restaurée intégralement | À faire |
| J11 | Correction orthographique | Aucune latence perceptible à la frappe | À faire |
| J12 | Fonctions IA | Coût réel égal au coût estimé, sortie propre | À faire |
| J13 | Dictée vocale | 30 s transcrites en moins de 5 s | À faire |
| J14 | Mode liste de tâches, finition desktop | L'outil remplace AppFlowy au quotidien | À faire |
| J15 | Android, consultation | APK installé, toutes les pages lisibles hors ligne, cache à jour après passage sur le wifi | À faire |
| J16 | Android, modification légère | Tâche cochée sur le téléphone visible sur le desktop au cycle suivant, modification refusée proprement sans NAS | À faire |

Android arrive en dernier, mais deux choses se préparent dès le début pour ne pas tout reprendre en J15 : `packages/core` reste sans dépendance Node (J1), et les opérations ciblées sur une page (basculer une tâche, insérer un item) sont écrites dans `packages/document` au moment du mode liste (J14).

---

## 19. Points à trancher

| Réf | Question | Échéance |
|---|---|---|
| | Aucun point ouvert | |

---

## 20. Journal des décisions

| Date | Décision |
|---|---|
| 2026-10-01 | Windows abandonné. Cibles : Linux (desktop) et Android (compagnon). |
| 2026-10-01 | Android en Capacitor, pour partager le code React et TypeScript avec le desktop. |
| 2026-10-01 | Android accède au vault en SMB direct, avec un cache local pour la consultation hors ligne. |
| 2026-10-01 | Sur Android, toute modification exige le NAS joignable. Pas de file d'attente hors ligne. |
| 2026-10-01 | Modifications Android : tâches (cocher, ajouter, modifier, supprimer, réordonner), ajout d'item dans une liste à puces, retouche de texte, création de page simple. |
| 2026-10-01 | Android placé en fin de roadmap (J15, J16), après le desktop complet. |
| 2026-10-01 | Monorepo npm workspaces : `packages/core`, `packages/document`, `packages/ui`, `apps/desktop`, `apps/mobile`, `apps/smb-companion`. Le contenu d'une page (schéma, Markdown, opérations ciblées) a son propre paquet, séparé des fichiers et de la sync. |
| 2026-10-01 | Emplacements fixés pour les tests, les POC, le vault d'exemple et les recettes manuelles (§3). |
| 2026-10-01 | Versions du socle : Electron 44 (version figée, exigée par electron-builder), Vite 7 (electron-vite 5 ne gère pas encore Vite 8), TypeScript 6 (typescript-eslint ne gère pas encore TypeScript 7), React 19, Tailwind 4, Vitest 5. |
| 2026-10-01 | Protocole du compagnon : une requête JSON par ligne, le mot de passe arrive dans la requête `connecter`, le contenu des fichiers en base64. Le compagnon s'arrête quand son entrée se ferme. |
| 2026-10-01 | Le dossier du vault dans le partage est un réglage (`dossierVault`, « Notes » par défaut), créé s'il n'existe pas. |
| 2026-10-01 | Front-matter lu et écrit avec la lib `yaml` plutôt que `gray-matter` : elle tourne dans une WebView et sait modifier une clé sans réécrire le reste. Les valeurs sont lues comme du texte, pour qu'un titre « 2026 » ne devienne pas un nombre. |
| 2026-10-01 | Surveillance du vault par `fs.watch` récursif de Node plutôt que `chokidar` : une dépendance de moins. |
| 2026-10-01 | Dossier du vault local choisi au premier lancement, `~/Notes` proposé. Racine du disque et dossier personnel refusés. |
| 2026-10-01 | Une page créée s'appelle « Sans titre » et passe aussitôt en renommage. Une copie s'appelle « Titre (copie) » et reçoit de nouveaux identifiants pour toute sa descendance ; ses liens internes pointent toujours vers les pages d'origine. |
| 2026-10-01 | `Ctrl+N` crée une sous-page de la page ouverte, `Ctrl+Shift+N` une page à la racine (demande d'Eloi). |
| 2026-10-01 | Pas de suppression de page avant le jalon de la corbeille (J10) : supprimer sans corbeille serait irréversible. |
| 2026-10-01 | Le mot de passe du NAS ne revient jamais au renderer : il n'en connaît que l'état (enregistré, gardé pour la session, absent). |
| 2026-10-01 | SMB 3 visé, avec chiffrement (le NAS l'accepte). Libs JavaScript pures écartées car limitées à SMB 2.0.2. |
| 2026-10-01 | Accès hors domicile par Tailscale : l'app utilise l'adresse Tailscale du NAS partout. |
| 2026-10-01 | Aucun identifiant en clair sur le disque. Sans trousseau système, le secret n'est pas enregistré et est redemandé à chaque lancement. |
| 2026-10-01 | Client SMB desktop embarqué dans l'AppImage, sans dépendance au système. `smbclient` du poste et module natif `libsmbclient` écartés. Forme retenue : binaire compagnon statique piloté par le main. |
| 2026-10-01 | Desktop sur le PC fixe et le portable uniquement (x86_64, Cinnamon, X11). Pas de build ARM pour le Raspberry Pi, pas de prise en charge de Wayland. |
| 2026-10-01 | Verrou desktop posé à la première frappe, relâché après 60 s sans frappe une fois la page poussée. |
| 2026-10-01 | Sur Android, les images d'une page sont téléchargées à sa première ouverture puis gardées en cache. Le texte de toutes les pages est synchronisé. |
| 2026-10-01 | Binaire compagnon SMB écrit en Go avec `go-smb2`. Validé par un POC sur le NAS (SMB 3.1.1, signature exigée). POC supprimé ensuite. |
| 2026-10-01 | Chiffrement SMB imposé par le client, sur desktop comme sur Android, sans changer le réglage du NAS (« défini par le client »). Côté desktop, copie de `go-smb2` avec un correctif maison. |
| 2026-10-01 | Connexion SMB avec le compte personnel d'Eloi, pas de compte dédié. La 2FA du compte ne concerne pas SMB (vérifié), rien à gérer dans l'app. |
| 2026-10-01 | Lib SMB Android : `smbj`, dans un plugin Capacitor maison. Validé par un POC sur le téléphone (SMB 3 chiffré : écriture, lecture, liste, suppression). POC supprimé ensuite. |

---

## Annexe : raccourcis

Desktop uniquement.

### Global

| Raccourci | Action |
|---|---|
| `Ctrl+Alt+Espace` | Recherche globale (configurable) |

### Application

| Raccourci | Action |
|---|---|
| `Ctrl+K` | Palette de recherche |
| `Ctrl+N` | Nouvelle sous-page de la page ouverte (à la racine si aucune page n'est ouverte) |
| `Ctrl+Shift+N` | Nouvelle page à la racine |
| `Ctrl+T` / `Ctrl+W` | Nouvel onglet / fermer |
| `Ctrl+Tab` | Onglet suivant |
| `Ctrl+1` à `Ctrl+9` | Onglet n |
| `Ctrl+\` | Afficher/masquer la barre latérale |
| `Ctrl+Shift+\` | Afficher/masquer le sommaire |
| `Ctrl+,` | Réglages |

### Édition

| Raccourci | Action |
|---|---|
| `Ctrl+B` / `Ctrl+I` | Gras / italique |
| `Ctrl+Shift+S` | Barré |
| `Ctrl+E` | Code inline |
| `Ctrl+Shift+H` | Surlignage |
| `Ctrl+Alt+1` à `5` | Titre H1 à H5 |
| `Ctrl+Alt+0` | Paragraphe |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Annuler / rétablir |
| `/` | Menu de commandes |
| `@` | Mentionner une page |

### Blocs

| Raccourci | Action |
|---|---|
| `Échap` (×1 / ×2) | Sélectionner le bloc / le parent |
| `↑` / `↓` | Bloc précédent / suivant |
| `Shift+↑/↓` | Étendre la sélection |
| `Ctrl+Shift+↑/↓` | Déplacer le bloc |
| `Ctrl+D` | Dupliquer |
| `Tab` / `Shift+Tab` | Indenter / désindenter |

### Tableaux

| Raccourci | Action |
|---|---|
| `Tab` / `Shift+Tab` | Cellule suivante / précédente |
| `Ctrl+↑/↓` | Cellule au-dessus / en dessous |
| `Ctrl+←/→` (bref) | Mot précédent / suivant |
| `Ctrl+←/→` (long) | Cellule précédente / suivante |
| `Entrée` (dernière cellule) | Nouvelle ligne |
