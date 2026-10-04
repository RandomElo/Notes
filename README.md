# Notes

Éditeur de notes local-first, inspiré de Notion et AppFlowy, pour un usage personnel mono-utilisateur. Application desktop Linux pour écrire, petite application Android pour consulter et retoucher, synchronisation SMB vers un NAS.

Ce document est la référence du projet : cahier des charges, décisions techniques et suivi d'avancement. Toute décision prise en cours de route y est reportée (voir [Journal des décisions](#20-journal-des-décisions)).

## État du projet

| | |
|---|---|
| Dernière mise à jour | 2026-10-04 |
| Version | 0.9.0 |
| Avancement | J0 à J8 terminés : recette J8 validée par Eloi le 2026-10-04, retouches 0.8.1 à 0.8.4 comprises |
| Jalon en cours | J9 (export), à lancer par `/jalon J9` |
| Points bloquants | Aucun |

Ce qui fonctionne aujourd'hui :

- le socle : monorepo, application Electron durcie, AppImage, vérifications automatiques (`npm run check`) ;
- la connexion au NAS en SMB 3.1.1 signé et chiffré, par le binaire compagnon embarqué, vérifiée sur le NAS réel ;
- le mot de passe du NAS chiffré par le trousseau du système ;
- le choix du dossier des notes au premier lancement ;
- la barre de titre de l'application, avec ses boutons de fenêtre, à la place du cadre du système ;
- l'arborescence : créer, renommer, déplacer, réordonner et dupliquer des pages, à la souris et au clavier, avec import à la demande des notes venues d'un autre outil ;
- la persistance : l'arbre, les pages dépliées et la page ouverte se retrouvent après redémarrage ;
- l'éditeur de base : paragraphes, titres de niveau 1 à 5, listes à puces, ordonnées et de tâches, blocs de code, gras, italique, barré, souligné, code, avec les raccourcis de saisie Markdown et les raccourcis clavier ;
- l'enregistrement automatique en Markdown, sans perte : une page ouverte sans être modifiée ne change pas d'un octet, et seuls les blocs modifiés sont réécrits ;
- l'aperçu en lecture seule d'une note venue d'un autre outil, avant son import ;
- la gestion des blocs au clavier : `Échap` sélectionne le bloc du curseur (puis toute la liste, puis rien), les flèches parcourent, `Shift+↑/↓` étend, `Ctrl+Shift+↑/↓` déplace, `Ctrl+D` duplique, `Suppr` supprime, `Tab` indente. Dans une liste, un élément emmène ses sous-éléments avec lui. Une poignée apparaît au survol d'un bloc ou sur la sélection pour la glisser ou ouvrir son menu ;
- le menu `/` (texte, titres, listes, tâche, code, page enfant, date), la barre d'outils flottante et le titre de page modifiable sur place ;
- la création d'une page depuis le texte (`/page`) ou l'arborescence : on tape son nom, puis le curseur est dans son contenu.
- le thème : il se règle dans les réglages, avec un aperçu en direct, et s'enregistre dans `.notes/theme.toml`, qu'on peut aussi modifier à la main. Couleurs, polices, titres, puces et largeurs. Le fichier est relu dès qu'il est enregistré, une valeur fausse est ignorée et signalée sans rien bloquer, et une page peut avoir ses propres couleurs.
- les blocs riches : blocs de code colorés (langage choisi dans une liste avec recherche ou deviné au collage, bouton copier, numéros de ligne et retour à la ligne réglables dans le thème), tableaux (grille de taille au `/tableau`, poignées pour ajouter ou retirer colonnes et lignes, navigation au clavier, alignement des colonnes), images (insertion, collage ou dépôt, copie dans `assets/`, largeur, alignement, texte alternatif, légende, visionneuse, liste des images inutilisées), callouts (nature, icône, texte mis en forme) ;
- la synchronisation avec le NAS (à valider sur le NAS réel) : au démarrage, toutes les 10 secondes, une seconde après chaque modification et à la fermeture, dans les deux sens. Quand une page a changé des deux côtés, la version du NAS est gardée à côté en `page.conflit-[date].md`. Une page en cours d'écriture sur un autre appareil s'affiche en lecture seule, avec « Forcer l'édition ». La barre de statut, en bas, montre l'état et ouvre le détail ; NAS injoignable, elle dit depuis quand, et une coupure du réseau se voit dans la seconde.
- l'écran de résolution des conflits : la page et la version mise de côté face à face, bloc par bloc, avec garder A, B ou les deux, poignées pour placer une version ailleurs, aperçu et validation.
- les liens et icônes (J8) : `@` ou `/lien` pour mentionner une page, affichée avec son icône et son titre du moment ; renommer une page fait suivre ses mentions, jusque dans les fichiers des autres pages ; un lien ou une mention s'ouvre d'un clic, et son infobulle permet de le modifier, le copier ou le retirer ; une adresse collée devient une mention de site (favicon et titre du site), ou un lien si le site ne répond pas ; mentions cassées barrées et listées dans les réglages ; icône de page (emoji cherché en français, icône Lucide cherchée par un mot français, image recadrée avec « Retirer le fond » par un modèle local), au-dessus du titre, dans l'arborescence, les onglets, la recherche et les mentions ; une image copiée d'une page et collée dans une autre y est copiée.
- la navigation (J7) : onglets dans la barre de titre, retrouvés au redémarrage, avec un point quand la page n'est pas encore sur le NAS ; recherche `Ctrl+K` floue sur les titres, sans accents, pages récentes, création d'une page quand rien ne correspond ; sommaire à droite de la page, à jour à la frappe, qui suit la lecture, et sommaire complet avec filtre par l'icône du haut de la page ; recherche globale instantanée par `Ctrl+Alt+Espace`, dans une petite fenêtre, Notes restant en fond fenêtre fermée (`Ctrl+Q` pour quitter, démarrage avec la session en option) ; `Ctrl+\` et `Ctrl+Shift+\` masquent la barre latérale et le sommaire, `Ctrl+,` ouvre les réglages.

Ce qui a été écarté : les citations et les séparateurs, qu'on ne peut plus créer (un fichier qui en contient les garde).

Ce qui n'existe pas encore : la suppression de page, l'application Android.

Reste à faire :

- passer l'intervalle de sync de 10 à 5 s (décidé le 2026-10-04 sur les durées relevées par Eloi, environ 60 ms par cycle) : `intervalleParDefautMs` dans `main/sync/scheduler.ts`, pas encore fait ;
- lancer J9.

Pour reprendre : `npm install`, puis `npm run dev` (la première fois, le modèle de détourage est téléchargé, 44 Mo). J9 se lance avec `/jalon J9`. Pour installer la version construite : `npm run installer`.

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
22. [Frise chronologique](#frise-chronologique)

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
- Persistance : Markdown avec front-matter YAML, assets par page, sync par cycle de 10 s avec verrou distant, corbeille NAS (rétention 30 jours).
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
| Aller-retour Markdown | `packages/document/tests/roundtrip/`, un fichier `.md` par cas, plus tout le vault d'exemple et des textes tirés au hasard | Vitest |
| Sync sans NAS | `packages/core/src/sync/`, avec des systèmes de fichiers en mémoire | Vitest |
| Unitaire Go | À côté du fichier (`x_test.go`) | `go test` |
| Intégration sur le NAS réel | `apps/smb-companion`, sous le tag `nas`, lancé à la main | `go test -tags nas` |
| Bout en bout desktop | `apps/desktop/e2e/`, sur une copie de `fixtures/vault-demo/`, lancé par `npm run test:e2e` | Playwright |
| Recette manuelle | `docs/recettes/J<n>.md` | À la main |

### Processus desktop

- Main (Node) : cycle SMB, verrous distants, lecture et écriture du vault, watcher FS, raccourci global, coffre à secrets, export PDF, appels LanguageTool, LiteLLM et Whisper.
- Renderer (React) : éditeur, arborescence, onglets, sommaires, palette `Ctrl+K`, modales IA, réglages.

`nodeIntegration` désactivé, `contextIsolation` activé, communication via `preload` et `contextBridge` typé.

### Dépendances clés

`@tiptap/*` (avec table, image, code-block-lowlight, task-list), `lowlight`, binaire compagnon SMB en Go (`github.com/cloudsoda/go-smb2`, voir §5), `yaml` (front-matter), `smol-toml` (thème), `markdown-it` et `markdown-it-mark` (lecture du Markdown), `prosemirror-markdown` (écriture, avec un sérialiseur maison), `@iarna/toml`, `lucide-react`, `emojibase-data` (noms des emojis en français), `onnxruntime-web` (moteur ONNX en WebAssembly, pour le détourage des icônes, avec le modèle silueta de rembg).

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
| `icon` | Emoji (`📚`), nom d'icône Lucide en kebab-case (`book-open`) ou image du dossier `assets/` de la page (`assets/icone.webp`) |
| `created`, `updated` | Dates ISO |
| `mode` | Optionnel, `todo` pour le mode liste de tâches (§14) |
| `theme_overrides` | Optionnel, surcharges de couleurs (§8) |

### Corps

Markdown standard : titres, gras, italique, barré, code, listes, tâches `- [ ]` et `- [x]`, tableaux GFM, code fencé, images.

- Souligné : Markdown n'a pas de syntaxe pour lui, il s'écrit `<u>texte</u>`. C'est la seule balise HTML que l'application reconnaît.

- Blocs avancés sans équivalent Markdown : bloc code fencé `notes-callout` contenant du YAML (type, icône, texte). Reste lisible dans n'importe quel éditeur.
- Liens internes : syntaxe Markdown standard avec cible `notes://uuid` (`[Projets](notes://0199…)`), résolue en titre courant à l'affichage, réécrite en chemin relatif à l'export. Lien cassé affiché barré. Quand une page est renommée, le texte de ses mentions est réécrit dans les pages qui la citent, seulement dans les blocs concernés. Un lien interne dont le texte est mis en forme (`[*x*](notes://…)`) reste un lien ordinaire, que le renommage ne touche pas.
- Liens externes : label nettoyé si identique à l'URL (`https://www.google.com/` devient `google.com`).
- Couleurs de texte : non supportées en v1 (pas de syntaxe Markdown propre ; couvert par thème et callouts).
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

Le corps suit la même règle, bloc par bloc. À la lecture, chaque bloc de premier niveau (un paragraphe, un titre, une liste entière, un bloc de code) garde son texte d'origine et ce qui le sépare du suivant. À l'enregistrement, un bloc qui n'a pas changé ressort avec ce texte, même s'il a été écrit par un autre outil avec une autre syntaxe (`*` pour les puces, titres soulignés, fins de ligne Windows). Seuls les blocs créés ou modifiés sont écrits, dans la forme de l'application : puces en `-`, emphase en `*`, code entre clôtures, une ligne vide entre deux blocs. Avant d'écrire, l'application relit ce qu'elle a produit et vérifie qu'elle retrouve le même document. Sinon elle réécrit toute la page dans sa forme à elle.

Ce que Markdown ne sait pas écrire n'est pas enregistré : les paragraphes vides et les espaces en début de paragraphe.

Si le fichier a changé sur le disque depuis sa lecture (autre outil, sync) alors que la page est en cours de modification, sa version est d'abord gardée à côté, dans `page.conflit-[date].md`, puis la page est enregistrée. Sans modification en cours, la page ouverte est simplement rechargée.

---

## 5. Synchronisation SMB

Le vault local est la source de travail. Client SMB intégré, pas de montage système. Le moteur de sync est dans `packages/core` et sert aux deux applications, avec un comportement différent selon l'appareil.

| | Desktop | Android |
|---|---|---|
| Copie locale | Vault complet | Cache des pages (texte complet, assets à la demande) |
| Sens | Bidirectionnel | Descendant, plus écriture directe à chaque modification |
| Déclenchement | Toutes les 10 s, une seconde après chaque modification du dossier des notes, au démarrage, à la fermeture | À l'ouverture, au retour au premier plan, au tirer pour rafraîchir, toutes les 30 s au premier plan |
| Édition hors ligne | Oui, poussée au cycle suivant | Non |

### Cycle

Lister l'état distant, comparer à l'index local (chemin, mtime, hash), calculer le delta (push, pull, suppression), transférer, mettre à jour l'index, rafraîchir l'UI. Cycle sauté si rien n'a changé.

Règles précises, arrêtées en J5 :

- L'index retient, pour chaque fichier, sa date et sa taille des deux côtés au dernier passage, et l'empreinte SHA-256 du contenu. Un fichier n'a changé d'un côté que si sa date ou sa taille diffère ; si seul l'horodatage a bougé (contenu identique), rien n'est transféré.
- Modifié d'un seul côté : il part de l'autre. Supprimé d'un côté et inchangé de l'autre : supprimé de l'autre. Supprimé d'un côté mais modifié de l'autre : la version modifiée revient. Modifié des deux côtés : les contenus sont comparés, et s'ils diffèrent, c'est un conflit (filet de sécurité ci-dessous).
- Juste avant chaque transfert ou suppression, le fichier est revérifié des deux côtés : s'il a bougé depuis le relevé (frappe en cours), il est laissé au cycle suivant.
- Garde-fou : si un des deux côtés n'a plus aucun fichier alors que l'index en connaît (disque démonté, dossier du NAS vidé, mauvais réglage), l'index est ignoré et les deux côtés sont fusionnés sans rien supprimer.
- Le NAS ne distingue pas les majuscules des minuscules. Un changement de casse (« courses » devenu « Courses ») est appliqué par un renommage, jamais par une suppression suivie d'un envoi. Deux noms qui ne diffèrent que par la casse sont laissés de côté et signalés.
- Ne sont jamais transportés : les verrous `.lock`, les fichiers temporaires d'une écriture en cours (`.nom.xxxx.tmp`), la corbeille `.trash/` du NAS, et les fichiers du poste dont le nom serait refusé par SMB (signalés dans le détail de la sync).
- Toute écriture sur le NAS passe par un fichier temporaire du même dossier, renommé ensuite : l'autre appareil ne lit jamais un fichier à moitié écrit.
- Une erreur réseau arrête le cycle, l'index garde ce qui a été fait. Des identifiants refusés arrêtent les essais automatiques jusqu'à la prochaine modification des réglages, pour ne pas faire verrouiller le compte par le NAS.

### Verrou distant par page

Fichier `.lock` (holder, pid, heartbeat) dans le dossier de la page sur le NAS. Les `.lock` ne sont jamais copiés dans le vault local.

| Situation | Comportement |
|---|---|
| Pas de verrou | Ouverture en écriture |
| Verrou de cet appareil | Reprise normale |
| Verrou d'un autre appareil, heartbeat < 90 s | Lecture seule ; bouton « Forcer l'édition » sur desktop uniquement |
| Verrou périmé (> 90 s) | Reprise automatique |

Le `.lock` est un petit JSON : identifiant de l'appareil (tiré au hasard à l'installation et gardé dans les réglages locaux), nom de la machine, pid, heartbeat en date ISO. Un verrou illisible compte comme périmé. Le heartbeat est rafraîchi à chaque cycle.

Le desktop ne garde le verrou que pendant l'édition active : posé à la première frappe, relâché une fois la page poussée sur le NAS, dès qu'on quitte la page ou après 10 s sans frappe. Quitter la page lance un cycle tout de suite. L'autre appareil le voit à son cycle suivant, 10 s au plus. Sans cette règle, une liste de courses laissée ouverte dans un onglet à la maison resterait verrouillée et le téléphone ne pourrait rien cocher. Une page ouverte mais inactive est rechargée si le cycle détecte une version distante plus récente.

### Écriture depuis Android

Le téléphone n'écrit jamais dans son cache en attendant mieux. Chaque modification suit ce déroulé :

1. Vérifier que le NAS est joignable, sinon refuser avec un message clair.
2. Lire le verrou : s'il est tenu par un autre appareil et vivant, refuser.
3. Poser le verrou, relire `page.md` sur le NAS, appliquer l'opération sur cette version fraîche.
4. Écrire sur le NAS, mettre à jour le cache, retirer le verrou.

Pour une retouche de texte, le verrou est tenu avec heartbeat le temps de la saisie. Conséquence voulue : le téléphone ne peut pas créer de conflit, puisqu'il n'a jamais de modification en attente.

### Filet de sécurité

En cas de divergence détectée, la version distante est sauvegardée en `page.conflit-[date].md`. Jamais d'écrasement silencieux.

Sur le desktop, l'enregistrement d'une page et les écritures de la sync dans le dossier des notes passent par une même file d'attente : la sync vérifie que le fichier n'a pas bougé depuis son relevé et l'écrit sans qu'un enregistrement puisse tomber entre les deux. Une page qui passe en lecture seule (verrou forcé par l'autre appareil) enregistre d'abord sa dernière frappe.

La sauvegarde est posée à côté du fichier sur le poste, puis la version du poste part sur le NAS, sauvegarde comprise : au cycle suivant, l'autre appareil a les deux versions. La même règle vaut pour tout fichier synchronisé (`.order.conflit-[date]`, `theme.conflit-[date].toml`). Les sauvegardes présentes dans le dossier des notes sont listées dans le détail de la sync, avec un bouton qui les montre dans le gestionnaire de fichiers.

### Résolution d'un conflit

Une page qui a une version mise de côté l'annonce par un bandeau en tête de page. Son bouton « Résoudre », comme celui du détail de la sync, ouvre l'écran de résolution à la place de la page. La page (A) et la version mise de côté (B) y sont comparées bloc par bloc, dans la typographie de la page :

- bloc identique : affiché tel quel ;
- bloc présent d'un seul côté : « Garder » ou « Retirer » ;
- bloc entièrement différent : « Garder A », « Garder B » ou « Les deux », B placé après A ;
- paragraphe ou titre dont seul un passage diffère : les deux passages dans le texte, B après A, chacun avec une poignée pour le placer entre deux autres mots et un × pour le retirer. Les passages vont d'une ponctuation à l'autre (« 18 km, » face à « 20 km, »), au mot près s'il n'y en a pas.

Chaque version de bloc a aussi une poignée pour la poser ailleurs dans la page (glisser, ou `Ctrl+Shift+↑/↓`). La version restée en place est alors gardée d'office, sauf si elle avait été écartée. « Tout A » et « Tout B » règlent tout d'un côté, « Aperçu » montre la page qui sortira. « Valider » reste grisé tant qu'une différence n'est pas réglée. Il prend le verrou de la page (refusé si un autre appareil l'édite), enregistre la page, puis supprime la version mise de côté ; si la page a changé entre-temps, sa version du disque est gardée à son tour. « Retour » revient à la page sans rien changer. Pris en entier d'un côté, le résultat est ce fichier à l'octet près ; sinon chaque bloc garde son Markdown d'origine, séparé du suivant par une ligne vide.

### Hors ligne

Le desktop continue de fonctionner sur le vault local. Indicateur d'état dans la barre de statut : synchronisé, en cours, en attente, injoignable, conflit, plus « désactivée » tant que le NAS ou le mot de passe ne sont pas réglés. Injoignable, la barre dit depuis quand : « NAS injoignable depuis 19:02 », heure du premier échec. Le desktop surveille la connexion du poste (une fois par seconde) : câble débranché ou wifi coupé, le cycle en cours est abandonné et le NAS montré injoignable tout de suite ; au retour du réseau, un cycle part. Un clic ouvre le détail : dernière synchronisation, sauvegardes de conflit, fichiers en souffrance, bouton « Synchroniser ». Sur Android, la consultation continue sur le cache et les contrôles de modification sont désactivés.

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

`#` à `#####` (titres), `-` ou `*` (puces), `1.` (ordonnée), `[]` ou `[ ]` (case à cocher), ` ``` ` (code), `**gras**`, `*italique*`, `~~barré~~`, `` `code` ``. `==texte==` reste du texte : le surlignage n'est plus proposé.

Ni citation ni séparateur : Eloi n'en veut pas dans ses notes. `>` et `---` tapés restent du texte, et rien dans l'application n'en crée. Un fichier qui en contient déjà (note venue d'un autre outil) les affiche et les garde tels quels.

La case à cocher se tape aussi dans une puce, comme en Markdown : `- [ ] ` donne une tâche, `- [x] ` une tâche cochée. Les marques se déclenchent en début de ligne, après une espace, et aussi après une apostrophe, une parenthèse, un guillemet ou un tiret : `l'*italique*` fonctionne.

### Affichage des listes et des titres

- Puces : la forme et la couleur changent à chaque niveau (disque bleu, cercle orange, carré vert), puis le cycle reprend.
- Listes ordonnées : 1, 2, 3 au premier niveau, a, b, c au deuxième, i, ii, iii au troisième. C'est un affichage : dans le fichier, Markdown ne connaît que les nombres, les sous-listes y restent numérotées 1, 2, 3.
- Titres : le niveau 1 est le titre de la page, affiché en haut, en grand. Dans le texte, `#` est donc le premier niveau en dessous, et il y en a cinq, chacun avec son signe : `#` en gras, `##` un peu plus petit avec un trait fin dessous, de la couleur du titre, `###` en italique, `####` gris à la taille du texte, `#####` en italique gris sans gras. Pas de filet. Couleurs : palette « Feux », choisie sur comparatif, `#` rouge, `##` orange, `###` jaune, `####` vert, `#####` gris. Les puces suivent (rouge, orange, vert) et l'accent passe au bleu `#60a5fa`. Dans le fichier, `#` reste un titre Markdown de niveau 1. Ces valeurs deviendront celles du thème par défaut en J4.

### Enregistrement

Il n'y a pas de commande pour enregistrer. La page s'enregistre toute seule un peu moins d'une seconde après la dernière frappe, au changement de page et à la fermeture de la fenêtre, qui attend la fin de l'écriture. L'état (« Modifié », « Enregistrement… », « Enregistré ») s'affiche en haut de la page et y reste visible quand elle défile. Un échec s'y affiche aussi, et l'enregistrement est retenté tout seul.

Le titre affiché en haut de la page est celui du front-matter. Il se modifie sur place : on clique dedans et on tape. `Entrée` ou `↓` le valide et passe au contenu, `Échap` annule, `↑` au tout début du contenu y remonte. La page est renommée quand on quitte le titre, son dossier aussi, comme avec `F2` dans l'arborescence. Un titre refusé (vide, trop long) n'est pas enregistré : l'ancien revient et la raison s'affiche dessous.

### Syntaxe non gérée

Ce que l'éditeur ne sait pas modifier s'affiche tel quel, en texte brut, dans un bloc à part qu'on ne peut pas modifier : titres de niveau 6, définitions de liens par référence, image au milieu d'une phrase, image dans une cellule de tableau (le tableau entier reste alors brut). Ce texte est réécrit à l'identique dans le fichier. Le HTML n'est jamais interprété : il reste du texte. Seule exception, `<u>texte</u>`, lu comme du souligné. Un bloc `notes-callout` mal formé (YAML invalide, clé inconnue, nature inconnue, liste dans le texte) reste un bloc de code, qu'on corrige à la main.

Une liste à puces dont certains items seulement ont une case à cocher reste une liste à puces, la case y est du texte.

### Menu `/`

Titres, paragraphe, listes, tâche, code, tableau, image, callout, page enfant, lien, date. En français avec alias anglais, recherche insensible aux accents.

- Il s'ouvre quand on tape `/` en début de bloc ou après une espace, pas dans « et/ou », une date ou un bloc de code. Ce qu'on tape ensuite filtre la liste, y compris par le nom anglais (`quote`, `todo`) ou la syntaxe Markdown (`###`).
- Flèches pour choisir, `Entrée` ou `Tab` pour valider, `Échap` pour fermer sans toucher au texte.
- Dans un bloc vide, la commande transforme le bloc. Dans un bloc qui contient déjà du texte, elle crée le nouveau bloc en dessous.
- « Page enfant » crée une sous-page de la page ouverte et l'ouvre : on tape son nom dans l'arborescence, et une fois le nom validé le curseur est dans son contenu. C'est vrai de toute page qu'on vient de créer (`Ctrl+N`, bouton, menu). « Date » écrit la date du jour en toutes lettres (« 2 octobre 2026 »).
- « Tableau » ouvre une grille : on survole la taille voulue (en-tête compris), on clique ou on valide par `Entrée`. « Image » ouvre le sélecteur de fichiers. « Callout » transforme le paragraphe vide en callout « Info », ou en ajoute un dessous.
- « Lien vers une page » (`/lien`) ouvre le même choix de page que `@`.

### Gestion des blocs au clavier

Comportement Notion, absent d'AppFlowy : `Échap` sélectionne le bloc, puis le désélectionne, les flèches naviguent, `Shift+↑/↓` étend la sélection, `Ctrl+Shift+↑/↓` déplace, `Ctrl+D` duplique, `Tab` et `Shift+Tab` indentent. Poignée `⠿` au survol pour le glisser-déposer et le menu contextuel.

- Un bloc est un paragraphe, un titre, un bloc de code, ou un item de liste. Une liste n'est pas un bloc, ses items le sont. Un item sélectionné ne montre que sa ligne : ses sous-items ne sont pas mis en évidence, mais ils le suivent quand il est déplacé, dupliqué ou supprimé.
- `Échap` sélectionne le bloc du curseur. Sur un paragraphe ou un titre sélectionné, un deuxième appui rend le curseur. Sur un item ou un sous-item sélectionné, le deuxième appui prend toute la liste, sous-listes comprises, et le troisième rend le curseur. Il n'y a pas d'étape intermédiaire (sous-liste, item parent).
- Avec du texte déjà sélectionné, `Échap` prend tous les blocs que la sélection traverse. Une liste où elle commence ou finit est prise en entier. Après `Ctrl+A`, toute la page est prise.
- Quand la sélection s'étend ou se déplace, la page défile pour garder à l'écran le bloc de tête (celui que les flèches déplacent), sous la barre du haut.
- Les blocs sélectionnés se montrent par leur fond, de la même hauteur pour tous les blocs d'une ligne (titre, paragraphe ou item). Les flèches passent d'un bloc à l'autre dans l'ordre de lecture, sous-items compris. `Shift+↑/↓` étend la sélection aux blocs voisins de même niveau.
- La règle des flèches : sans `Ctrl`, elles agissent sur la sélection (`↑/↓` la déplace, `Shift+↑/↓` l'étend). `Ctrl+Shift+↑/↓` déplace les blocs eux-mêmes. `Ctrl+↑/↓` seul ne fait rien sur des blocs.
- `Entrée` rend le curseur, à la fin du bloc. `Suppr` ou `Retour arrière` supprime les blocs sélectionnés. Une frappe ordinaire ne remplace pas des blocs sélectionnés : elle est ignorée.
- `Ctrl+Shift+↑/↓` et `Ctrl+D` marchent aussi sans sélection, sur le bloc du curseur, qui reste dans son texte.
- Déplacer : le bloc passe de l'autre côté de son voisin, une liste entière comptant pour un voisin. Le premier ou le dernier item d'une liste en sort pour franchir le bloc d'à côté, et rejoint une liste de même nature s'il en trouve une. Un sous-item au bord de sa sous-liste garde son niveau et change de parent : en montant il devient le dernier sous-item de l'item du dessus, en descendant le premier sous-item de l'item du dessous. Si son parent n'a pas de voisin de ce côté, il sort au niveau de son parent.
- `Tab` et `Shift+Tab` n'agissent que sur les items de liste. Ailleurs ils ne font rien, Markdown n'ayant pas de retrait pour un paragraphe, mais ne font pas sortir de l'éditeur.
- La poignée apparaît à gauche du bloc que la souris survole (elle reste quand la souris va vers elle) et, sans survol, à gauche du premier bloc sélectionné. On la tire pour déplacer le bloc, ou toute la sélection s'il en fait partie ; un clic sélectionne le bloc et ouvre son menu : dupliquer, monter, descendre, supprimer.
- Un clic dans le vide sous le dernier bloc met le curseur dans un paragraphe vide en fin de page, créé si le dernier bloc n'en est pas un. Tant qu'il reste vide, le fichier ne change pas.

### Barre d'outils flottante

Apparaît quand du texte est sélectionné, à la souris ou au clavier ; un simple clic dans le texte ne la montre pas. Dans une cellule de tableau ou un callout, elle vient aussi au clic, pour leurs menus. Elle disparaît à la frappe, au clic ailleurs ou sur `Échap`. Contenu adapté au type de bloc (texte, titre, cellule, image, code, callout).

Elle se place au-dessus de la ligne du curseur. Elle porte la nature du bloc (texte, titres, listes, code), qu'on change dans une liste déroulante, puis gras, italique, souligné, barré et code. Dans un bloc de code, seule la nature du bloc est proposée. Dans une cellule, la nature du bloc laisse la place à l'étiquette « Tableau », à ses menus d'ajout et de suppression et à l'alignement de la colonne. Dans un callout, elle laisse la place à sa nature (Info, Succès, Attention, Danger, ou retirer le callout) et à son icône. Une image sélectionnée a sa propre barre (voir Images).

### Tableaux

Mise en page uniquement (pas de types, filtres ni tri). Tableaux GFM : la première ligne est toujours l'en-tête, une cellule tient sur une ligne (pas de saut de ligne, `Maj+Entrée` ne fait rien), sans cellules fusionnées ni largeur de colonne, que Markdown ne sait pas écrire.

- Création par `/tableau` et sa grille de taille. Ensuite, une poignée « + » au bord droit et une au bord bas, chacune visible seulement quand la souris approche de son bord : un clic ajoute une colonne ou une ligne, un glissement en ajoute plusieurs pendant le geste, et en retire en revenant. Seule une colonne ou une ligne vide est retirée, et il reste toujours l'en-tête et une colonne : tirer une poignée ne fait jamais perdre de texte.
- Navigation : `Tab` et `Maj+Tab` passent à la cellule suivante ou précédente (`Tab` dans la dernière cellule ajoute une ligne), `Ctrl+↑/↓` à la cellule du dessus ou du dessous, `Ctrl+←/→` saute un mot en appui bref et passe à la cellule voisine en appui long (plus de 350 ms, puis une cellule de plus à chaque délai). `Entrée` descend d'une cellule, et sous la dernière ligne en ajoute une. Depuis la dernière ligne, `↓` sort du tableau.
- Au survol d'une cellule, une poignée à gauche de sa ligne et une au-dessus de sa colonne, comme dans Notion. Un clic sélectionne toute la ligne ou la colonne et ouvre son menu : mettre en en-tête (une ligne qui n'est pas la première), insérer au-dessus, en dessous, à gauche, à droite, supprimer. Un glissement la déplace, un trait bleu montre où elle tombera. Une ligne glissée en premier devient l'en-tête : GFM n'a d'en-tête que la première ligne, pas de colonne d'en-tête.
- Dans la barre d'outils, une cellule montre l'étiquette « Tableau », un « + » qui ouvre les ajouts (ligne au-dessus, en dessous, colonne à gauche, à droite), une corbeille qui ouvre les suppressions (ligne, colonne, tableau), puis l'alignement.
- L'alignement est celui de la colonne (`:--`, `:-:`, `--:` dans le fichier), réglé depuis la barre d'outils. Il suit la colonne quand elle est déplacée.
- Écrit en colonnes alignées par des espaces, pour rester lisible dans un éditeur de texte. Un tableau qu'on n'a pas modifié garde son texte d'origine.

### Blocs de code

Coloration `lowlight` (highlight.js), limitée aux langages choisis par Eloi, un nom par entrée (pas de « / ») : Arduino, Assembleur ARM, Assembleur x86, Bash, C, C#, C++, CSS, Diff, Dockerfile, Excel, Go, HTML, INI, Java, JavaScript, JSON, JSX, Kotlin, Makefile, Markdown, Nginx, PHP, PowerShell, Python, Rust, Shell, SQL, TOML, TSX, TypeScript, XML, YAML. Deux noms d'une même grammaire (HTML et XML, JavaScript et JSX, TypeScript et TSX, TOML et INI, Bash et Shell) sont deux entrées qui colorent pareil. Un autre langage déjà écrit dans un fichier reste tel quel, sans couleur. Couleurs du thème « Dark+ » de VS Code ; les mots de contrôle (`if`, `return`, `import`…) ont leur propre couleur. Une barre au-dessus du code donne le langage, qu'on change dans une liste avec recherche (nom, identifiant ou alias comme `ts`, sans accents ni casse ; « Texte brut » retire le langage), et un bouton « Copier ». Du code collé dans un bloc vide sans langage lui donne son langage s'il se reconnaît nettement. `Tab` et `Maj+Tab` indentent de deux espaces. Les numéros de ligne et le retour à la ligne se règlent dans le thème pour tous les blocs (`[code] line_numbers`, `wrap`), rien n'est ajouté au fichier de la page. Avec le retour à la ligne, la suite d'une ligne longue reste alignée sur son texte. Le numéro d'une dernière ligne vide n'est pas affiché.

### Images

Insertion par `/image` (sélecteur de fichiers, plusieurs à la fois), glisser-déposer ou collage. L'image est copiée dans le dossier `assets/` de la page, jamais en remplaçant un fichier : le nom d'origine est gardé sans espaces ni caractères gênants (`Capture d'écran (2).png` devient `Capture-d-écran-2.png`), un nom pris reçoit un numéro, une image collée prend la date (`image-2026-10-03-143005.png`). Sa nature est vérifiée par ses premiers octets (PNG, JPEG, GIF, WebP, AVIF, SVG). Toute image reçue (collée, déposée, choisie, téléchargée) est enregistrée en WebP compressé (qualité 82 %), réduite à 1920 px de large au plus, avec l'extension `.webp` ; un GIF (souvent animé) et un SVG (vectoriel) restent tels quels. Une image reçue peut faire jusqu'à 200 Mo, la version enregistrée 50 Mo. Dans les réglages, « Images en WebP » convertit les images déjà dans le dossier des notes : chaque page renvoie à la nouvelle version, l'ancien fichier reste et passe dans les images inutilisées. Une image va au premier niveau de la page, pas dans une cellule, un callout ou un item. Pas de vidéo.

- Dans le fichier : `![texte alternatif](assets/x.png#largeur=66&align=centre "Légende")`. La largeur (un pourcentage entier de 10 à 100) et l'alignement (gauche, centre, droite) vont dans le fragment de l'adresse, que les autres outils ignorent. Pleine largeur et centrage sont les valeurs par défaut, qui ne s'écrivent pas.
- Au survol, une barre sur chaque bord de l'image, comme dans Notion (curseur de redimensionnement) : tirée, elle règle la largeur de 10 à 100 %, l'image suit le geste avec son pourcentage affiché, et le fichier ne change qu'au lâcher. Une image centrée grandit des deux côtés.
- Un clic sélectionne l'image et montre sa barre : taille (Petit 33 %, Moyen 66 %, Grand pour toute la page), alignement, texte alternatif et légende (dans un petit formulaire), agrandir. Un clic dans le vide du bloc, à côté de l'image ou sous sa légende, la quitte et ferme sa barre. Un double-clic ouvre la visionneuse plein écran, légende en bas de l'écran, fermée par `Échap`, le bouton ou un clic à côté.
- Seules les images du dossier des notes s'affichent, servies par le main (protocole `notes-asset:`), qui vérifie le chemin et la nature du fichier. Une image d'Internet n'est jamais chargée : un cadre le dit à sa place.
- Coller le lien d'une image d'Internet (`https://…/x.png`) demande s'il faut la télécharger dans la page. « Télécharger » : le main la récupère (http et https seulement, sans cookies, 20 s et 200 Mo au plus, nature vérifiée par les premiers octets), puis elle est convertie en WebP et copiée dans `assets/` sous le nom de l'adresse. Seul un lien qui finit par une extension d'image déclenche la question. « Garder le lien » ou `Échap` : le lien est collé comme du texte. Sans réseau, ou si le lien ne mène pas à une image, un message le dit et le lien reste en texte.
- Images inutilisées : les réglages listent les fichiers des dossiers `assets/` dont la page ne parle plus, avec « Montrer » pour les voir dans le gestionnaire de fichiers. Rien n'est supprimé par l'application.
- Une image copiée d'une page et collée dans une autre s'affiche aussitôt (son adresse renvoie à la page d'origine), puis son fichier est copié dans les `assets/` de la page, sans rien remplacer, et l'adresse devient locale.

### Callouts

Encadré coloré avec une icône, qui contient un ou plusieurs paragraphes mis en forme (gras, italique, code, liens), sans listes ni titres. Quatre natures, chacune avec sa couleur du thème (`[callout]`) et son icône par défaut : Info 💡, Succès ✅, Attention ⚠️, Danger 🛑. L'icône se change parmi une quinzaine d'emojis ; une icône choisie reste quand la nature change, celle de la nature suit. `Entrée` sur le dernier paragraphe vide sort du callout, `Retour arrière` au début de son premier paragraphe le sort du callout.

Dans le fichier, un bloc fencé `notes-callout` en YAML, clés facultatives, l'icône seulement si elle n'est pas celle de la nature :

```notes-callout
type: warning
text: |-
  Couper le **wifi** avant.

  Deuxième paragraphe.
```

### Liens et mentions

`@` ou `/lien` pour mentionner une page (icône et titre courant, suit les renommages). URL collée sur une sélection ou seule. Mentions cassées signalées et listées dans les réglages.

- `@` en début de bloc, après une espace ou une parenthèse (pas dans une adresse de courriel) ouvre la liste des pages : les récentes, puis, à la frappe, recherche floue sans accents. Flèches, `Entrée` ou `Tab`, `Échap` comme pour le menu `/`. La mention est suivie d'une espace.
- À l'écran, une mention montre l'icône et le titre du moment de la page, soulignés finement. Le fichier garde le texte écrit, mis à jour au renommage (§4). Une page introuvable : le texte du fichier, barré et gris.
- Tout lien s'ouvre d'un simple clic : une mention ou un lien `notes://` ouvre la page (`Ctrl+clic` ou clic du milieu : nouvel onglet), une adresse web part dans le navigateur, une adresse `mailto:` dans la messagerie. Pour modifier un lien, on y entre au clavier, ou par son infobulle.
- Au survol d'un lien (ou quand le curseur y entre au clavier), une infobulle, collée au lien et qui reste ouverte tant que la souris va vers elle, donne son adresse, « Modifier » (texte et adresse, `exemple.fr` devient `https://exemple.fr`, une adresse vide retire le lien), « Copier l'adresse » et « Retirer le lien » (le texte reste). Sur une mention : le chemin de la page, « Changer de page » (la liste des pages se rouvre) et « Retirer la mention » (le titre reste en texte).
- Une adresse web collée seule devient d'abord un lien dont le texte est l'adresse nettoyée, puis une mention de site : Notes demande au site son titre et sa favicon (http et https seulement, sans cookies, 8 secondes et 512 Ko au plus, favicon de 256 Ko au plus), et le lien prend ce titre, favicon devant, comme une mention de page. Dans le fichier : `[Titre du site](https://exemple.fr "mention")`. La favicon, ramenée à un PNG de 64 px, est gardée dans `.notes/favicons/<site>.png` et synchronisée ; l'affichage ne va jamais la chercher sur Internet (un globe à sa place s'il n'y en a pas). Site injoignable : le lien reste un lien. Dans l'infobulle, « En lien » ramène une mention de site à un simple lien, « Mention » fait l'inverse ; collée sur une sélection d'un seul bloc, elle fait de la sélection un lien. Un lien `notes://` vers une page connue collé devient une mention. Rien de cela dans un bloc de code ou du code en ligne. Le bouton « Lien » de la barre d'outils ouvre le même formulaire sur la sélection.
- Les réglages listent les mentions cassées (« Chercher »), page par page, avec « Ouvrir la page ».

### Icônes de page

Emoji (recherche FR), icône Lucide (table de correspondance FR vers EN), image (recadrage carré 128×128, détourage du fond via ONNX local, à la demande).

- L'icône s'affiche au-dessus du titre de la page, en grand, avec de l'espace au-dessus ; sans icône, le titre reste près du haut, et « Ajouter une icône » est centré dans l'espace au-dessus de lui (même écart en haut et en bas) ; un clic ouvre son choix. Sans icône, « Ajouter une icône » apparaît au survol du haut de la page. Le menu de l'arborescence a aussi « Icône ». Elle s'affiche dans l'arborescence, les onglets, la recherche et les mentions.
- Trois onglets dans le choix. Emoji : tous les emojis d'Unicode, cherchés par leur nom et leurs mots-clés français (Emojibase). Icônes : les icônes Lucide, cherchées par un mot français d'une table tenue à la main (« maison » trouve `house`) ou par leur nom anglais. Image : une image de l'ordinateur, ou d'Internet par son adresse (téléchargée par le main, comme une image collée), recadrée en carré (glisser pour déplacer, molette ou curseur pour zoomer), enregistrée en WebP 128 × 128 sous `assets/icone.webp` (sans rien remplacer : `icone-2.webp`…). « Retirer » enlève l'icône.
- « Retirer le fond » détoure le carré choisi par le modèle silueta (U²-Net allégé, 44 Mo), dans le main, par le moteur ONNX en WebAssembly : rien ne part sur le réseau, environ 2 secondes. Un damier montre ce qui est devenu transparent, « Garder le fond » revient en arrière. Le modèle et le moteur sont livrés dans l'AppImage (`npm run build:models` les prépare, empreinte du modèle vérifiée).
- Une ancienne icône image reste dans `assets/` et passe dans les images inutilisées.

---

## 7. Navigation et interface

Section desktop. L'interface Android est décrite en §15.

- Barre de titre : la fenêtre n'a pas le cadre du système. L'application dessine sa propre barre, comme Firefox : nom et version à gauche, boutons réduire, agrandir et fermer à droite. Toute la barre sert à déplacer la fenêtre.
- Disposition : onglets en haut, barre latérale (arborescence) à gauche, éditeur au centre, sommaire à droite, barre de statut en bas (sync, corrections, coût IA du jour).
- Barre latérale : arborescence repliable, glisser-déposer pour réordonner et déplacer, menu contextuel (nouvelle page, renommer, icône, dupliquer, exporter, supprimer), accès corbeille. Tout se fait aussi au clavier : flèches pour naviguer, `F2` pour renommer, `Alt+↑/↓` pour déplacer une page parmi ses sœurs. Pendant un glisser-déposer, un trait plat de 2 px à la couleur d'accent montre où la page tombera, un fond bleu qu'elle deviendra sous-page. `Ctrl+N` crée une page sœur de la page ouverte, juste après elle (à la racine si aucune n'est ouverte), `Ctrl+Shift+N` une page à la racine. `Échap` dans le nom d'une page encore « Sans titre » la supprime si elle n'a ni contenu, ni sous-page, ni fichier, et la page ouverte avant revient ; sinon il annule seulement le renommage. Les éléments dépliés et la page ouverte sont retenus d'un lancement à l'autre.
- Réglages : `Échap` les ferme et rend la page ; depuis l'écran du thème, il revient d'abord aux réglages.
- Onglets : dans la barre de titre, comme Firefox, entre le nom de l'application et les boutons de fenêtre. Multiples dans une seule fenêtre, `Ctrl+T` (onglet vide, recherche ouverte), `Ctrl+W` (le dernier onglet se vide au lieu de se fermer), `Ctrl+Tab` et `Ctrl+Shift+Tab`, `Ctrl+1` à `9`, clic du milieu pour fermer, restaurés au démarrage, point si la page n'est pas encore sur le NAS. Une page n'est ouverte que dans un onglet : un clic dans l'arborescence ramène à son onglet s'il existe, sinon elle remplace la page de l'onglet affiché. `Ctrl+clic` ou clic du milieu l'ouvre dans un nouvel onglet.
- Recherche `Ctrl+K` : sur les titres de page uniquement (pas de full-text en v1), floue, insensible aux accents, pages récentes par défaut, proposition de création si aucun résultat : juste après la page ouverte (choisi d'office), dedans, ou à la racine, une ligne chacun, au clavier. `Entrée` ouvre la page comme un clic dans l'arborescence, `Ctrl+Entrée` dans un nouvel onglet.
- Recherche globale : `Ctrl+Alt+Espace` ouvre instantanément, depuis n'importe où, une petite fenêtre qui ne contient que la barre de recherche, au milieu de l'écran, devant les autres fenêtres. `Entrée` ouvre la page dans la fenêtre de l'application, qui passe devant (`Ctrl+Entrée` dans un nouvel onglet) ; `Échap` ou un clic ailleurs la cache. Pour être instantanée, Notes reste lancée quand on ferme sa fenêtre : la page est enregistrée et la sync continue de tourner en fond, comme fenêtre ouverte. La petite fenêtre reste prête, cachée, et l'application capte elle-même le raccourci (`globalShortcut`, session X11 de Cinnamon). Environ 230 Mo de mémoire en fond. `Ctrl+Q` ou « Quitter Notes » dans les réglages l'arrêtent pour de bon. Les réglages proposent de la démarrer avec la session, sans fenêtre (`~/.config/autostart/notes.desktop`, argument `--fond`). Notes pas lancée, l'argument `--recherche` ouvre directement la petite fenêtre (environ 1 s depuis l'AppImage).
- Sommaire : version latérale permanente à droite de la page (tous les niveaux de titre, réduite en traits au repos, titres en clair au survol, suivi de lecture via IntersectionObserver), à jour à chaque frappe, et version complète (titrée « Sommaire », tous les niveaux en arbre, filtre insensible aux accents) ouverte par une icône à côté de « Enregistré », sans raccourci. Le latéral fait au plus 60 % de la hauteur de la fenêtre : au-delà, traits et liste défilent pour garder le titre en cours au milieu, les traits s'estompant seulement du côté où d'autres sont cachés, et au survol son nom s'affiche à la hauteur de son trait.

---

## 8. Thème

Thème défini dans `.notes/theme.toml`, converti en variables CSS, rechargé à chaud. Sombre uniquement en v1. Le même thème s'applique sur Android, sans réglage sur le téléphone.

Le point clé est la hiérarchie H1 à H5, nettement différenciée (taille, graisse, italique, trait), le titre de la page tenant lieu de niveau 1 (détail en §6). C'est la correction principale par rapport à AppFlowy.

- Thème par défaut : l'apparence arrêtée à la fin de J3 (titres choisis sur comparatif, puces et numérotation par niveau, fond de code). Sans fichier de thème, c'est lui qui s'applique. J4 n'a pas changé l'apparence, il l'a rendue réglable.
- Réglage dans l'application : l'éditeur de thème a son propre écran, pour ne pas se mélanger aux autres réglages. La page des réglages dit seulement où en est le thème (par défaut, personnalisé, réglages ignorés) et porte le bouton « Modifier le thème » qui y mène, un bouton de retour en ramène. Cet écran a un formulaire du thème (couleurs, texte, chaque niveau de titre, puces, code, interface) avec un aperçu d'une page d'exemple à côté. Chaque réglage s'applique tout de suite à l'écran, puis est écrit dans le fichier après un court délai, ou tout de suite si on quitte les réglages ou ferme la fenêtre. Une saisie refusée est signalée sous son champ, n'est pas appliquée et n'est pas écrite. Chaque réglage a son retour au défaut, et tout le thème aussi, après confirmation.
- Le fichier reste la référence, et l'application ne l'écrit que sur un geste : un réglage dans le formulaire, ou le bouton « Créer le fichier de thème ». Il n'est jamais créé tout seul. L'application l'écrit en entier, toutes les valeurs, commentées par section : un commentaire ou un réglage inconnu ajouté à la main disparaît donc au prochain réglage fait dans le formulaire. Le bouton « Ouvrir le fichier de thème » l'ouvre dans l'éditeur de texte du système.
- Ordre du formulaire, celui où on s'en sert : les cinq niveaux de titre d'abord (couleur, taille, graisse, espace au-dessus, italique, trait), puis le texte (interligne, taille, polices), puis la palette. Puces, code et interface sont repliés sous « Autres réglages ».
- Une couleur qui peut renvoyer à la palette (celle d'un titre, par exemple) se règle dans une seule liste où chaque couleur a sa pastille : un nom de la palette, qui suit la palette, ou « Couleur choisie… », qui ouvre le sélecteur de couleur du système et donne une couleur propre à ce réglage. Cette liste est dessinée par l'application (une liste déroulante du système n'affiche que du texte) et se manie au clavier comme une liste ordinaire : flèches, `Entrée`, `Échap`. Un « i » entouré, à côté du libellé ou du titre d'une section, explique au survol (ou au focus clavier) comment marchent les couleurs, la palette et l'interligne.
- Les polices se choisissent dans une liste : la police du système d'abord, puis les polices courantes sous Linux qui sont installées sur le poste (détectées en mesurant du texte, sans rien demander au système). Une police choisie s'écrit avec son repli (`'Noto Sans', sans-serif`), pour le téléphone qui ne l'aurait pas. Une police écrite à la main dans le fichier reste affichée telle quelle.
- Rechargement à chaud : le fichier est relu à chaque modification du dossier des notes, et ses valeurs deviennent des variables CSS posées sur la racine. Une ligne supprimée reprend sa valeur par défaut, un fichier supprimé rend le thème par défaut.
- Citations et séparateurs gardent un affichage fixe, hors du thème : l'application n'en crée plus (§6).
- Surcharges par page : `theme_overrides` dans le front-matter peut redéfinir des couleurs de la palette (`accent: "#ff8800"`), pas la typo, les tailles ni les espacements, pour garder une cohérence globale. Elles s'appliquent à la page ouverte seulement, pas à l'arborescence, et suivent le fichier à chaud. Ce qui n'est pas une couleur de la palette est ignoré.
- Validation tolérante : une valeur invalide ou un réglage inconnu est ignoré, la valeur par défaut reste, et un avertissement non bloquant le dit (un bandeau discret, et le détail dans les réglages). Un fichier illisible donne le thème par défaut. Une faute de frappe dans le thème ne casse jamais l'app.
- Le contenu du fichier n'est pas de confiance : seules des formes précises sont acceptées (couleur `#rrggbb`, taille comme `1.3rem`, graisse de 100 à 900, durée en `ms`, noms de polices), rien d'autre ne passe dans une variable CSS.

Sections du fichier :

| Section | Réglages |
|---|---|
| `[colors]` | `background`, `surface`, `border`, `text`, `muted`, `accent`, `success`, `warning`, `error`. C'est la palette : partout ailleurs, une couleur s'écrit `#rrggbb` ou par un de ces noms |
| `[typography]` | `font`, `mono`, `size`, `line_height` |
| `[heading.h1]` à `[heading.h5]` | `size`, `weight`, `italic`, `underline`, `color`, `margin_top`. `h1` est le `#` du texte, le titre de la page n'en fait pas partie |
| `[list]` | `bullet_1`, `bullet_2`, `bullet_3` : couleur des puces par niveau |
| `[code]` et `[code.syntax]` | `background`, `font_size`, `line_numbers`, `wrap`, puis `text`, `comment`, `keyword`, `control`, `string`, `regex`, `number`, `function`, `type`, `variable`, `tag`, `attribute` |
| `[callout]` | `info`, `success`, `warning`, `danger` |
| `[table]` | `border`, `header_background` |
| `[ui]` | `content_width`, `sidebar_width`, `radius`, `transition` |

Depuis J6, la coloration du code, les callouts et les tableaux se servent de leurs réglages, et le formulaire les montre sous « Autres réglages ». `[code]` a deux réglages de plus : `line_numbers` (faux par défaut) et `wrap` (vrai par défaut depuis 0.5.14).

Exemple :

```toml
[colors]
accent = "#ff8800"

[heading.h2]
size = "1.4rem"
underline = false
color = "accent"

[ui]
content_width = "56rem"
```

---

## 9. Export

Desktop uniquement.

| Format | Portée | Images | Apparence | Usage |
|---|---|---|---|---|
| PDF | Page seule | Oui | Élevée | Impression, envoi formel |
| Markdown | Page seule | Non (mention texte) | Nulle | Interopérabilité |
| HTML autonome | Page seule | Oui (base64) | Maximale | Partage par fichier |
| ZIP | Page et descendants | Oui | Selon format interne | Archivage |

- PDF : rendu hors écran avec les couleurs du thème actif sur fond blanc (`printToPDF`). Règles de saut de page : titres jamais seuls en bas, code, images, tableaux et callouts non coupés (tableaux : en-tête répété si la coupure est inévitable), orphelines et veuves gérées. Pied de page : titre et numéro de page, sans auteur. Options : format papier, marges, icônes ou non.
- Markdown : front-matter retirable, mentions de page écrites en texte simple (leur titre), images remplacées par une mention textuelle, jamais de citation : un callout ne devient pas une citation (sa forme exacte : P1).
- HTML autonome : CSS et images inlinés en base64, coloration syntaxique précalculée, sommaire avec ancres. Format recommandé pour partager en conservant l'apparence exacte.
- ZIP : page et enfants avec assets, arborescence conservée, option de sortie en HTML avec navigation entre pages.

---

## 10. Corbeille

Desktop uniquement. La corbeille est sur le NAS (`.trash/`), sans copie locale. Supprimer une page déplace son dossier complet (enfants inclus) vers un dossier horodaté, avec un `.trashmeta.yaml` (chemin d'origine, date, UUID du parent).

Une image retirée d'une page (son fichier dans `assets/` n'étant plus utilisé) part aussi dans la corbeille, à la demande d'Eloi (2026-10-03).

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

- Linux : AppImage via electron-builder (`Notes.AppImage`), aucune installation requise et aucune dépendance à un paquet du système : le client SMB est dans l'AppImage. Build x86_64 uniquement, pour le PC fixe et le portable (Linux Mint, Cinnamon, X11). `.deb` possible en complément.
- Android : APK construit avec Gradle, signé avec une clé locale, installé à la main (transfert du fichier ou `adb install`). Pas de Play Store.
- AppImage au nom fixe `Notes.AppImage`. `npm run installer` la construit et la met dans `~/Applications` (ou le dossier `NOTES_DOSSIER_INSTALLATION` de `.env`), par renommage. Notes se met à jour d'elle-même : fenêtre fermée, elle se relance aussitôt sur la nouvelle version ; ouverte, la barre de titre propose « Relancer ». Pas de serveur de mises à jour : projet privé. Numéro de version dans la barre de titre.
- La clé de signature Android reste hors du dépôt. La perdre oblige à désinstaller l'app avant de réinstaller une version signée autrement.

---

## 18. Roadmap

Chaque jalon est livrable et testable indépendamment. L'ordre suit les dépendances techniques (stockage, éditeur, sync) et termine par Android, une fois le desktop complet.

Vérification par Eloi : chaque jalon livré a sa recette `docs/recettes/J<n>.md`, avec ce qu'Eloi doit vérifier lui-même et les questions auxquelles il n'a pas encore répondu. Un jalon ne passe à « Fait » qu'une fois cette recette rapportée OK et ses questions tranchées. Le jalon suivant ne commence pas avant : pas de développement qui s'empile sur un jalon non vérifié.

| Jalon | Objet | Critère de sortie | État |
|---|---|---|---|
| J0 | Socle monorepo, Electron, preuve SMB | Fenêtre ouverte sous Linux, fichier test écrit et relu sur le NAS en SMB 3 depuis le poste (preuve côté téléphone déjà faite) | Fait |
| J1 | Stockage et arborescence | Arbre créé et réorganisé, persistant après redémarrage | Fait |
| J2 | Éditeur de base | Aller-retour Markdown sans perte | Fait |
| J3 | Gestion des blocs (clavier) | Page restructurable sans souris | Fait |
| J4 | Thème | Modif du TOML visible à chaud, hiérarchie lisible | Fait |
| J5 | Sync SMB | Deux machines pendant une journée sans perte ni écrasement | Fait |
| J6 | Blocs riches (code, images, tableaux, callouts) | Page technique complète rédigée confortablement | Fait |
| J7 | Navigation avancée | Raccourci global et sommaire toujours à jour | Fait |
| J8 | Liens et icônes | Renommage sans mention cassée | Fait |
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
| P1 | Export Markdown d'un callout : pas de citation (tranché), mais quelle forme à la place ? Garder le bloc `notes-callout` tel quel, ou écrire ses paragraphes en texte simple (avec son icône devant) ? | J9 |
| P2 | Export Markdown d'une mention de site : lien Markdown normal sans le titre « mention », ou gardée telle quelle ? | J9 |

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
| 2026-10-01 | Fenêtre sans cadre du système, barre de titre dessinée par l'application avec ses boutons de fenêtre (demande d'Eloi). |
| 2026-10-01 | Numéro de version : un jalon terminé augmente le deuxième nombre (J0 = 0.1.0, J1 = 0.2.0), toute autre livraison le troisième. Il se change d'un coup avec `npm run version:set`. |
| 2026-10-01 | Frise chronologique en fin de README : une ligne de quelques mots par étape, jamais retirée. |
| 2026-10-01 | `Ctrl+N` crée une sous-page de la page ouverte, `Ctrl+Shift+N` une page à la racine (demande d'Eloi). |
| 2026-10-01 | Pas de suppression de page avant le jalon de la corbeille (J10) : supprimer sans corbeille serait irréversible. |
| 2026-10-01 | Le mot de passe du NAS ne revient jamais au renderer : il n'en connaît que l'état (enregistré, gardé pour la session, absent). |
| 2026-10-02 | P3 tranché : le titre de la page se modifie sur place, la page est renommée quand on le quitte (choix d'Eloi). |
| 2026-10-02 | Menu `/` : les entrées dont la fonction n'existe pas encore (tableau, image, callout, lien) sont masquées jusqu'à leur jalon. `/date` écrit la date en toutes lettres (choix d'Eloi). |
| 2026-10-02 | Menu `/` dans un bloc non vide : la commande crée un bloc en dessous au lieu de transformer le texte déjà écrit. |
| 2026-10-02 | Une liste n'est pas un bloc, ses items le sont. Pour déplacer ou étendre une sélection, une liste entière compte pour un voisin. |
| 2026-10-02 | Une frappe ne remplace pas des blocs sélectionnés : `Entrée` pour écrire, `Suppr` pour supprimer. Évite d'effacer plusieurs blocs par une touche tapée par erreur. |
| 2026-10-02 | `Tab` n'indente que les items de liste : Markdown n'a pas de retrait pour un paragraphe. Hors liste il ne fait rien et ne sort pas de l'éditeur. |
| 2026-10-02 | Souligné ajouté (`Ctrl+U`), écrit `<u>texte</u>` dans le fichier, faute de syntaxe Markdown. Seule cette balise est reconnue, comme une marque du schéma, jamais injectée (demande d'Eloi). |
| 2026-10-02 | Sous-listes ordonnées affichées a, b, c puis i, ii, iii. Le fichier garde des nombres : Markdown n'a pas de listes à lettres (demande d'Eloi). |
| 2026-10-02 | Puces : forme et couleur différentes à chaque niveau (demande d'Eloi). |
| 2026-10-02 | Hiérarchie des titres arrêtée par Eloi après trois tours de comparatif (`~/demo-claude/notes/titres/`) : le titre de la page est le niveau 1, `#` est le premier niveau du texte. `#` gras, `##` trait fin gris, `###` italique, `####` gris, `#####` italique gris. Ni couleur ni filet. Remplace la variante à filet et bleu de la 0.3.1. |
| 2026-10-02 | Contrôle avant écriture précisé : un bloc gardé doit se relire comme dans le document, un bloc réécrit doit se relire à sa place comme il se lit seul. Une espace en fin de gras ne fait donc plus réécrire toute la page. |
| 2026-10-02 | Aller-retour Markdown sans perte par conservation du texte d'origine : chaque bloc de premier niveau garde son texte, seuls les blocs modifiés sont réécrits. Une relecture de contrôle précède chaque écriture (§4). |
| 2026-10-02 | Lecture du Markdown avec `markdown-it` et un convertisseur maison vers le schéma TipTap, écriture avec `prosemirror-markdown`. `@tiptap/markdown` écarté : il ne donne pas les lignes d'origine de chaque bloc. |
| 2026-10-02 | Ce que le schéma ne représente pas encore (tableau, image, titre de niveau 6, définition de lien) devient un bloc brut, affiché tel quel, non modifiable, jamais perdu. Le HTML reste du texte. |
| 2026-10-02 | Forme écrite par l'application : puces en `-`, emphase en `*`, gras en `**`, code entre clôtures, saut de ligne forcé par une barre oblique inverse. Deux listes voisines de même nature changent de marqueur (`-` puis `*`, `1.` puis `1)`) pour ne pas être relues comme une seule. |
| 2026-10-02 | Enregistrement automatique, 800 ms après la dernière frappe, au changement de page et à la fermeture. Pas de `Ctrl+S`. La fermeture de la fenêtre attend la fin des écritures. |
| 2026-10-02 | Fichier modifié ailleurs pendant la frappe : sa version est gardée en `page.conflit-[date].md` (date à l'heure du poste, à la seconde), puis la page est enregistrée. Sans frappe en attente, la page ouverte est rechargée. |
| 2026-10-02 | Les paragraphes vides ne sont pas enregistrés : Markdown n'a pas de quoi les écrire. |
| 2026-10-02 | `- [ ] ` tapé dans une puce donne une tâche, et les marques se déclenchent après une apostrophe (`l'*italique*`) : deux ajouts aux raccourcis de saisie de TipTap. |
| 2026-10-02 | Tests de bout en bout avec Playwright, qui lance l'application construite sur une copie du vault d'exemple (`npm run test:e2e`). Hors de `npm run check`, car ils ouvrent des fenêtres. |
| 2026-10-02 | Une note non importée s'affiche en lecture seule sous la proposition d'import, avec le même rendu que l'éditeur. |
| 2026-10-02 | Ni citation ni séparateur dans l'application (demande d'Eloi) : retirés du menu « / », de la barre d'outils et des raccourcis de saisie. Ils restent lus et réécrits sans perte quand un fichier en contient. |
| 2026-10-02 | `Échap` répété monte d'un cran (bloc, liste entière, bloc contenant) puis rend le curseur. Avant, il s'arrêtait sur le dernier bloc parent et ne désélectionnait jamais. Une sélection de texte, `Ctrl+A` compris, devient une sélection de blocs. |
| 2026-10-02 | Fond de sélection de même hauteur pour tous les blocs d'une ligne (celle du plus grand titre), en couleur opaque pour que deux items voisins ne fassent pas de bande plus foncée. |
| 2026-10-02 | Après le nom d'une page qu'on vient de créer, le curseur va dans son contenu, quelle que soit la façon de la créer. |
| 2026-10-02 | Listes, choix d'Eloi : un item sélectionné ne montre que sa ligne et ses sous-items le suivent. `Échap` : l'item, toute la liste, puis rien (remplace la montée cran par cran décidée plus haut). `Ctrl+Shift+↑/↓` étend la sélection, `Alt+Shift+↑/↓` déplace. |
| 2026-10-02 | La poignée n'apparaît plus au survol : elle existe seulement tant que des blocs sont sélectionnés (demande d'Eloi). La souris seule ne sélectionne donc plus un bloc, il faut `Échap`. |
| 2026-10-02 | Un sous-item au bord de sa sous-liste se déplace en gardant son niveau : il passe sous l'item voisin de son parent, ou sort au niveau du parent s'il n'y a pas de voisin. Avant, le déplacement ne faisait rien. |
| 2026-10-02 | Règle des flèches sur les blocs, voulue par Eloi : sans `Ctrl` elles agissent sur la sélection (`↑/↓` naviguer, `Shift+↑/↓` étendre), avec `Ctrl` elles déplacent les blocs (`Ctrl+↑/↓`, `Ctrl+Shift+↑/↓`). Remplace `Ctrl+Shift` pour étendre et `Alt+Shift` pour déplacer, décidés le même jour. |
| 2026-10-02 | `Ctrl+↑/↓` ne déplace plus les blocs (demande d'Eloi) : seul `Ctrl+Shift+↑/↓` le fait, sur les blocs sélectionnés ou sur celui du curseur. |
| 2026-10-02 | Thème : les clés du TOML sont en anglais, comme les noms de sections prévus. Une couleur hors palette peut renvoyer à une couleur de la palette par son nom (`color = "muted"`), ce qui permet aux surcharges de page de tout faire suivre. |
| 2026-10-02 | Le fichier de thème n'est jamais créé tout seul dans le vault (règle 3) : il se crée depuis les réglages, avec les valeurs par défaut commentées, et n'est jamais remplacé s'il existe. |
| 2026-10-02 | Lecture du TOML avec `smol-toml` (JavaScript pur, tourne dans une WebView), dans `packages/ui`. Le main ne fait que lire le fichier : c'est le renderer qui l'interprète, avec une liste fermée de formes acceptées pour chaque valeur. |
| 2026-10-02 | Les réglages de coloration du code, des callouts et des tableaux existent dès J4, sans effet avant J6, pour que le fichier de thème créé maintenant soit déjà complet. |
| 2026-10-02 | Une surcharge de page invalide est ignorée sans message : seul le fichier de thème a ses avertissements à l'écran. |
| 2026-10-02 | Le thème se règle aussi dans les réglages (demande d'Eloi) : formulaire et aperçu en direct. Le fichier TOML reste la référence. Le renderer envoie le thème réglé, le main le revérifie valeur par valeur et rédige lui-même le fichier, en entier : le renderer ne choisit jamais le texte écrit sur le disque. Ce qu'on avait ajouté à la main dans le fichier hors des réglages connus est perdu à ce moment-là. |
| 2026-10-02 | L'éditeur de thème est un écran à part, ouvert par un bouton depuis les réglages (demande d'Eloi) : chaque famille de réglages longue aura son écran plutôt que de s'empiler sur la même page. |
| 2026-10-03 | Éditeur de thème, retours d'Eloi : titres en tête du formulaire (c'est surtout leur couleur et l'interligne qu'il règle), polices choisies dans une liste de polices installées au lieu d'une suite de noms à taper, infobulles « i » sur les couleurs, listes déroulantes aux couleurs de l'application. |
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
| 2026-10-03 | Le trait sous un titre prend la couleur du titre et une épaisseur proportionnée à sa taille (demande d'Eloi), au lieu d'un gris fixe de 1 px. La couleur d'un réglage ne se choisit plus que dans la liste à pastilles, sans carré à côté. |
| 2026-10-03 | Couleurs des titres : palette « Feux », choisie par Eloi parmi huit propositions (`~/demo-claude/notes/couleurs-titres/`). Titres 1 à 5 en `#f87171`, `#fb923c`, `#facc15`, `#4ade80` et gris, puces en rouge, orange, vert, accent `#60a5fa`, coloration du code assortie. C'est le thème par défaut, et les mêmes couleurs ont été reportées dans le fichier de thème d'Eloi, qui passait devant. |
| 2026-10-03 | Sync (J5) : un fichier a changé d'un côté si sa date ou sa taille diffère de l'index ; l'empreinte SHA-256 (calculée en TypeScript pur dans `core`) évite les transferts et les faux conflits quand seul l'horodatage a bougé. |
| 2026-10-03 | Sync : en conflit, la version du NAS est gardée à côté sous le nom `page.conflit-[date].md` (même forme pour tout fichier) puis envoyée avec la version du poste. Les sauvegardes sont listées dans le détail de la sync et se suppriment à la main. |
| 2026-10-03 | Sync : garde-fou contre les suppressions en masse. Un côté sans aucun fichier alors que l'index en connaît fait ignorer l'index : fusion sans suppression. |
| 2026-10-03 | Sync : le NAS ignore la casse. Un changement de casse devient un renommage ; deux noms qui ne diffèrent que par la casse sont laissés de côté et signalés. |
| 2026-10-03 | Écriture atomique sur le NAS dans le compagnon : fichier temporaire `.nom.xxxx.tmp` puis renommage. La sync ignore ce motif. |
| 2026-10-03 | Verrou `.lock` en JSON (holder, nom de la machine, pid, heartbeat ISO). Identifiant d'appareil tiré au hasard et gardé dans `settings.json`. Sans NAS ou NAS injoignable, l'édition n'est jamais bloquée sur desktop. |
| 2026-10-03 | Barre de statut en bas de la fenêtre, avec un sixième état « désactivée » (NAS ou mot de passe pas réglés). Après des identifiants refusés, plus d'essai automatique avant un changement de réglages. |
| 2026-10-03 | Chaque jalon livré a sa recette `docs/recettes/J<n>.md` (ce qu'Eloi vérifie, questions en attente). Le jalon suivant ne commence qu'après la recette rapportée OK (demande d'Eloi). |
| 2026-10-03 | Version 0.5.8 : J5 livré pour la recette. La version 0.6.0 viendra quand le critère aura été vérifié sur les deux machines. |
| 2026-10-03 | J6 commence avant la recette de J5, reportée par Eloi. Exception à la règle d'un jalon vérifié avant le suivant : J5 reste « En cours » jusqu'à sa recette. |
| 2026-10-03 | Images (choix d'Eloi) : la légende est le titre Markdown de l'image, la largeur et l'alignement vont dans un fragment de l'adresse, valeurs par défaut omises : `![texte](assets/x.png#largeur=66&align=centre "Légende")`. Les autres outils affichent l'image et ignorent le fragment. |
| 2026-10-03 | Callouts (choix d'Eloi) : texte mis en forme seulement (paragraphes, gras, italique, code, surlignage, liens), écrit en Markdown dans la clé `text` du YAML, en bloc littéral `|` dès qu'il fait plusieurs lignes. Pas de listes ni de titres dedans. |
| 2026-10-03 | Blocs de code (choix d'Eloi) : numérotation des lignes et retour à la ligne se règlent dans le thème pour tous les blocs (`[code] line_numbers`, `wrap`), rien n'est ajouté au fichier de la page. |
| 2026-10-03 | Tableaux (choix d'Eloi) : `/tableau` ouvre une grille où l'on choisit la taille au survol, puis des poignées aux bords droit et bas ajoutent ou retirent colonnes et lignes pendant qu'on les tire. |
| 2026-10-03 | Tableaux : une poignée ne retire qu'une colonne ou une ligne vide, pour ne jamais perdre de texte. `Entrée` dans une cellule descend d'une cellule et ajoute une ligne sous la dernière. Une cellule tient sur une ligne. Écrits en colonnes alignées par des espaces. |
| 2026-10-03 | Images : copiées dans `assets/` avec un nom assaini et jamais écrasé, nature vérifiée par les premiers octets, servies au renderer par un protocole `notes-asset:` du main limité aux images du dossier des notes. Les images d'Internet ne sont jamais chargées. Les images inutilisées sont listées dans les réglages, pas supprimées. |
| 2026-10-03 | Callouts : quatre natures (info, succès, attention, danger), icône parmi une liste courte en attendant le choix d'icône de J8. Un `notes-callout` mal formé reste un bloc de code. YAML écrit par la lib `yaml` (schéma « failsafe » : tout reste du texte). |
| 2026-10-03 | Blocs de code : toutes les langues de highlight.js, langage deviné au collage dans un bloc vide. Numéro de ligne porté par le premier caractère de la ligne et affiché en marge : un élément ajouté au début des lignes déplaçait les lettres tapées. |
| 2026-10-03 | Correction de fond (présente depuis J2) : l'éditeur a son propre schéma, et ProseMirror compare les types de nœud par identité. Aucun bloc n'était donc reconnu comme inchangé à l'enregistrement, toute la page était réécrite en forme canonique. Les essais ne le voyaient pas, la page d'exemple étant déjà canonique. Le document est maintenant ramené au schéma du paquet avant l'écriture. |
| 2026-10-03 | Le bouton « Copier » demande l'écriture dans le presse-papiers : seule permission accordée par la session, la lecture reste refusée. |
| 2026-10-03 | Retours de la recette J5 (Eloi) : la sync était trop lente et le verrou trop long à disparaître. Cycle toutes les 10 s au lieu de 30, et un cycle une seconde après toute modification du dossier des notes. Verrou relâché dès qu'on quitte la page (une fois la page poussée), ou après 20 s sans frappe au lieu de 60. |
| 2026-10-03 | Retours d'Eloi sur J6 : surlignage retiré du projet (plus rien pour en créer, un fichier qui en contient le garde, comme la citation) ; barre d'outils des tableaux avec étiquette « Tableau », boutons `+` et poubelle ; images en Petit, Moyen, Grand plus un curseur de largeur (pourcentage de 10 à 100 dans le fichier). Prévu dans `.claude/PLAN-RETOUCHES.md`, pas encore fait. |
| 2026-10-03 | Questions de la recette J6 tranchées par Eloi, toutes acceptées : `Entrée` descend d'une cellule, une poignée ne retire qu'une colonne ou une ligne vide, seize icônes de callout en attendant J8, images d'Internet jamais chargées d'elles-mêmes (un lien collé proposera de la télécharger, prévu), images inutilisées listées sans suppression, numéros de ligne désactivés par défaut. Ses autres retours sur J6 sont prévus dans `.claude/PLAN-RETOUCHES.md`. |
| 2026-10-03 | Dernière question de la recette J5 tranchée par Eloi : le verrou met encore trop longtemps à se libérer, les délais seront raccourcis encore (prévu, pas encore fait). |
| 2026-10-03 | Questions de la recette J5 tranchées par Eloi : les conflits auront un écran de résolution dans l'application (bloc par bloc, A, B ou les deux, morceaux de texte déplaçables), au lieu d'une comparaison à la main ; la barre de statut lui va, avec « NAS injoignable depuis HH:MM » quand le NAS ne répond pas. Prévu, pas encore fait, comme le passage immédiat à « injoignable » quand le réseau est coupé. |
| 2026-10-03 | Prévu à la demande d'Eloi, pas encore fait : ne plus perdre de texte non enregistré au « Forcer l'édition », et raccourcir encore le délai de sync après mesure de la durée d'un cycle. |
| 2026-10-03 | Prévu à la demande d'Eloi, pas encore fait : `Ctrl+N` crée une page sœur au lieu d'une sous-page, `Échap` sur le nom d'une page qu'on vient de créer l'annule, barre de dépôt de l'arborescence en trait plat. |
| 2026-10-03 | Version 0.5.9 : J6 livré pour la recette. J5 attend toujours la sienne : 0.6.0 viendra avec J5 validé. |
| 2026-10-03 | Version 0.5.11, retouches de sync (lot 1 du plan) : verrou relâché 10 s après la dernière frappe au lieu de 20 ; perte du réseau vue par `net.isOnline()` interrogé chaque seconde, cycle abandonné et NAS injoignable aussitôt ; barre de statut « NAS injoignable depuis HH:MM » (heure du premier échec, gardée dans l'état de la sync) ; durée de chaque cycle écrite dans la console du main, pour décider du passage à 5 s. |
| 2026-10-03 | Texte perdu au « Forcer l'édition » : reproduit dans un essai. Sur le main, l'enregistrement d'une page pouvait tomber entre la vérification et l'écriture d'un fichier tiré du NAS, et être écrasé sans sauvegarde. Enregistrements et écritures de la sync dans le vault local partagent maintenant une file d'attente ; la page qui passe en lecture seule enregistre d'abord sa frappe en attente. |
| 2026-10-03 | Écran des conflits, précisé avec Eloi sur maquette : l'écran s'affiche dans la page, avec sa typographie. Chaque version d'un bloc et chaque morceau de texte a une poignée pour être placé ailleurs (dans la page pour un bloc, entre deux mots pour un texte) ; par défaut B suit A. Quand une version est sortie d'un bloc par sa poignée, celle qui reste en place est gardée d'office, sauf si elle avait déjà été écartée. |
| 2026-10-03 | Écran des conflits, suite (Eloi) : il s'ouvre par un bouton « Résoudre » dans le détail de la sync et par un bandeau sur la page qui a une version en conflit ; « Valider » reste grisé tant qu'une différence n'est pas réglée ; pas de jalon à part, c'est une retouche de J5 avec sa partie dans la recette J5. |
| 2026-10-03 | Version 0.5.12 : écran de résolution des conflits. Comparaison sur les blocs de premier niveau (une liste entière est un bloc), appariés sur leur texte exact ; les passages d'un paragraphe sont montrés en Markdown tel qu'il est écrit. Le message « modifiée ailleurs » de l'éditeur est remplacé par le bandeau de la page, qui reste tant que la version mise de côté existe. |
| 2026-10-03 | Recette J5, questions de l'écran des conflits (Eloi) : si les deux versions ne diffèrent que par le titre ou les métadonnées, l'écran dit que le contenu est le même, « Valider » supprime la sauvegarde et le titre de A est gardé ; « Les deux » sur deux listes à puces les réunit en une seule liste, sur les autres blocs B devient un bloc séparé après A. |
| 2026-10-03 | Recette J5, suite (Eloi) : une liste entière reste un seul bloc dans l'écran des conflits (on garde toute la liste A, B ou les deux, pas ligne par ligne) ; les passages d'un paragraphe restent montrés tels qu'ils sont écrits, avec les `**` du gras. |
| 2026-10-03 | Recette J0 supprimée à la demande d'Eloi : ses parties 3 à 5 ne seront pas rapportées. J0 rejoint J1 à J4, vérifiés au fil des séances sans recette. Le `.env` est créé. |
| 2026-10-03 | Version 0.5.13, retouches de l'arborescence (lot 2) : `Ctrl+N` crée une page sœur juste après la page ouverte (remplace la décision du 2026-10-01) ; `Échap` sur le nom d'une page encore « Sans titre » la supprime, refusé par le core si elle a un contenu, une sous-page ou un autre fichier (c'est alors un simple abandon du renommage, sans message) ; barre de dépôt en trait plat de 2 px ; `Échap` ferme les réglages. |
| 2026-10-03 | Version 0.5.14, blocs de code (lot 3, choix d'Eloi) : liste courte de 33 langages, un nom par entrée sans « / » (HTML et XML, JavaScript et JSX, TypeScript et TSX, TOML et INI, Bash et Shell séparés ; ni SCSS ni Lua) ; couleurs Dark+ de VS Code, avec cinq catégories de plus dans le thème (`text`, `control`, `regex`, `tag`, `attribute`) ; mots de contrôle repérés par une liste, faute de classe highlight.js ; retour à la ligne par défaut ; marge des numéros réduite. Le `theme.toml` d'Eloi passé en Dark+ avec son accord. Bouton « Réglages » : focus montré par le fond, sans contour. |
| 2026-10-03 | Version 0.5.15, éditeur (lot 4, demandes d'Eloi) : la poignée revient au survol d'un bloc, en plus de la sélection (remplace la décision du 2026-10-02) ; un clic sous le dernier bloc crée au besoin un paragraphe vide de fin et y met le curseur, sans rien écrire tant qu'il est vide ; dans la barre d'outils, la nature du callout montre sa pastille de couleur. |
| 2026-10-03 | Version 0.5.16, tableaux (lot 5, validé par Eloi) : poignées « + » seulement à l'approche des bords droit et bas, plus épaisses (16 px) ; barre d'outils avec l'étiquette « Tableau », un menu d'ajouts et un menu de suppressions ; poignées de ligne et de colonne : sélection entière, menu, déplacement par glissement, « Mettre en en-tête » qui place la ligne en premier. La poignée de bloc d'un tableau se décale pour laisser la place à celle de la première ligne (corrigé en 0.5.17). |
| 2026-10-03 | Essais de bout en bout sous Xvfb (`xvfb-run`, demande d'Eloi) : les fenêtres de l'application ne s'affichent plus sur son écran et ne lui prennent plus le focus. Une fenêtre cachée a été essayée : des essais échouaient. |
| 2026-10-03 | Version 0.5.17 (retour d'Eloi) : la poignée de bloc d'un tableau débordait sur le panneau latéral à la taille d'ouverture et n'était pas à la hauteur de celle de la première ligne. Elle reste dans la marge de 24 px, centrée sur la première ligne ; la poignée de ligne, plus fine (12 px), est posée sur le bord gauche, un peu vers l'intérieur. |
| 2026-10-03 | Version 0.5.18 (retour d'Eloi, capture) : la poignée collait encore au panneau latéral. La zone centrale a une marge gauche de 48 px au lieu de 24 (la droite reste à 24) : les poignées des blocs, à 24 px du texte, gardent un espace net avec le panneau. |
| 2026-10-03 | Version 0.5.19, retrait du surlignage (lot 5 bis, demande d'Eloi) : plus de bouton, de `Ctrl+Shift+H`, de raccourci de saisie `==texte==` ni de règle de collage ; retiré de la page d'exemple, de l'aperçu du thème et de ce README. Comme la citation et le séparateur, la marque reste dans le schéma : un fichier qui contient `==texte==` l'affiche surligné et le réécrit tel quel. Tapé dans l'application, `==texte==` reste du texte, écrit `\==texte\==`. |
| 2026-10-03 | Version 0.5.20, images (lot 6, validé par Eloi) : tailles Petit, Moyen, Grand (33, 66, 100) et glissière de largeur dans la barre de l'image ; dans le fichier, un pourcentage entier de 10 à 100 (`#largeur=45`), rien pour Grand ; une largeur hors de ces bornes reste dans l'adresse, telle quelle. Légende de la visionneuse en bas de l'écran. Un lien d'image collé propose de la télécharger dans `assets/`, par une session réseau à part. L'image supprimée qui part à la corbeille attend J10. Fin des retouches des recettes J5 et J6 : le plan `.claude/PLAN-RETOUCHES.md` est supprimé, chaque décision est dans ce journal. |
| 2026-10-03 | Version 0.5.21 (retour d'Eloi) : la largeur d'une image se règle par ses bords, comme dans Notion, au lieu d'une glissière dans la barre (qui garde Petit, Moyen, Grand). Un clic dans le vide du bloc image ferme sa barre, le curseur va dans le texte voisin. |
| 2026-10-03 | Version 0.5.22 (demande d'Eloi) : la barre d'outils du texte n'apparaît plus qu'à la sélection, plus au simple clic (remplace la décision de J3). Exception : dans une cellule de tableau ou un callout, elle vient encore au clic, car elle porte leurs menus. |
| 2026-10-03 | Réponses d'Eloi (recette J5, partie 15) : téléchargement d'une image abandonné après 20 s ; nom du fichier tiré de l'adresse, question posée seulement pour un lien qui finit par une extension d'image ; la barre d'outils garde son apparition au clic dans une cellule ou un callout ; le travail depuis 0.5.9 sera commité après la recette J5. |
| 2026-10-03 | Version 0.5.23, images en WebP (demande d'Eloi) : toute image reçue est enregistrée en WebP qualité 82 %, réduite à 1920 px de large ; GIF et SVG gardés tels quels. Conversion faite dans le renderer par le moteur d'images de Chromium (aucune dépendance), le main ne fait que lire et écrire. Une image reçue peut faire 200 Mo, la version enregistrée 50. Les images déjà présentes se convertissent depuis les réglages (« Images en WebP ») : la page renvoie à la version WebP, l'adresse seule est remplacée dans le fichier, l'ancienne image reste pour être supprimée à la main. |
| 2026-10-03 | Recettes J5 et J6 validées par Eloi, retouches comprises (parties 1 à 17 de la recette J5) : J5 et J6 passent à « Fait », version 0.7.0 (0.6.0 pour J5, 0.7.0 pour J6, livrés ensemble). L'intervalle de sync reste à 10 s faute de mesure du cycle. |
| 2026-10-04 | J7, choix d'Eloi : onglets dans la barre de titre ; une page n'est ouverte que dans un onglet, un clic dans l'arborescence ramène à son onglet ou remplace la page de l'onglet affiché ; sommaire complet ouvert par une icône en haut de la page, sans raccourci (« plus il y a de raccourcis, moins on s'en sert »). |
| 2026-10-04 | J7, raccourci global : Eloi ne veut pas d'application qui reste en fond, il préfère une fenêtre un peu plus lente à s'ouvrir. Le `globalShortcut` d'Electron, qui ne vit qu'avec l'application, est remplacé par un raccourci de Cinnamon qui lance l'AppImage avec `--recherche` ; l'instance unique ramène la fenêtre si elle est ouverte. Fermer la fenêtre quitte toujours l'application. |
| 2026-10-04 | Version 0.7.2 (demande d'Eloi) : le raccourci global n'affiche plus l'application derrière la recherche, seulement une petite fenêtre avec la barre de recherche. La page choisie s'ouvre dans la fenêtre de l'application ; sans choix, l'application s'arrête si elle n'était pas ouverte, rien ne reste en fond. |
| 2026-10-04 | Version 0.7.3 (choix d'Eloi, mesures à l'appui) : la recherche globale doit être instantanée. Depuis l'AppImage, tout lancement coûte environ 1 s, même pour passer la main à l'instance ouverte. Eloi accepte donc que Notes reste en fond, fenêtre fermée, avec la petite fenêtre prête et cachée et le raccourci capté par l'application : affichage en quelques millisecondes, environ 230 Mo de mémoire. Sync en pause tant que la fenêtre est fermée, `Ctrl+Q` pour quitter, démarrage avec la session en option. Remplace la décision « rien en fond » du même jour ; le raccourci personnalisé de Cinnamon est à retirer. |
| 2026-10-04 | Recette J7, réponses d'Eloi : les 230 Mo en fond lui vont ; la sync doit continuer fenêtre fermée (remplace la pause de la 0.7.3) ; la barre de recherche lui convient. Ses choix sont résumés dans `.claude/notes/recherche-globale.md`, pour la refaire dans un autre projet. |
| 2026-10-04 | Version 0.7.5, retours d'Eloi sur le sommaire : la fenêtre du sommaire complet porte le titre « Sommaire » ; le sommaire latéral, qui prenait toute la hauteur avec beaucoup de titres, est limité à 60 % de la fenêtre (32 rem au plus) et défile pour garder le titre en cours au milieu, aligné avec son nom au survol. |
| 2026-10-04 | Recette J7, questions tranchées par Eloi : `Ctrl+T` avec la recherche, dernier onglet vidé, `Ctrl+Z` perdu au changement d'onglet, tout acceptés ; le sommaire latéral montre tous les niveaux ; une page créée depuis la recherche se place au clavier, juste après la page ouverte par défaut, sinon dedans ou à la racine ; icône de liste pour le sommaire. Version 0.7.6. |
| 2026-10-04 | Version 0.7.6, mise à jour locale (demande d'Eloi, remplace « pas d'auto-update » du §17) : AppImage au nom fixe, `npm run installer` qui la remplace par renommage, Notes qui surveille son fichier et se relance (en fond, ou par « Relancer » si la fenêtre est ouverte, page enregistrée d'abord). `app.relaunch` d'Electron ne marche pas depuis une AppImage : Notes lance la nouvelle par bash (`/bin/bash`, livré avec Mint), qui ferme les descripteurs hérités pour que l'ancien montage disparaisse, et la nouvelle attend la fin de l'ancienne. Sans bash, relance directe. |
| 2026-10-04 | Recette J8, questions tranchées par Eloi, toutes acceptées : mention au titre du moment, lien interne mis en forme laissé en lien ; `Ctrl+Z` ne défait pas la mise à jour d'une mention ; détourage silueta suffisant ; icône image `icone-2.webp`, l'ancienne dans les images inutilisées ; `mailto:` ouvre la messagerie. Ses retours : infobulle qui se ferme quand la souris va vers elle, « Ajouter une icône » trop haut, sélection de blocs qui ne fait pas défiler la page, icône depuis l'adresse d'une image, et mention de site comme Notion. |
| 2026-10-04 | Recette J8 validée par Eloi, retouches 0.8.1 à 0.8.4 comprises : J8 passe à « Fait », version 0.9.0. Il commite lui-même. |
| 2026-10-04 | Durées de cycle de la sync relevées par Eloi (relevé du NAS 51 à 55 ms, cycle 56 à 61 ms) : l'intervalle passera de 10 à 5 s, réglage à faire. |
| 2026-10-04 | Export (J9), choix d'Eloi : pas de citation dans l'export, un callout n'est pas converti en citation ; une mention de page s'exporte en texte simple (son titre) en Markdown ; PDF aux couleurs du thème sur fond blanc ; pas d'auteur dans le pied de page. |
| 2026-10-04 | Mention de site (choix d'Eloi, comme « Mention » au collage dans Notion) : toute adresse collée seule devient une puce avec la favicon et le titre du site, contacté à chaque collage (sans cookies, délai court) ; l'infobulle la ramène à un simple lien. Dans le fichier, un lien Markdown standard au titre « mention » : `[Titre du site](https://exemple.fr "mention")`. La favicon est gardée dans `.notes/favicons/`, synchronisée, jamais rechargée d'Internet à l'affichage. |
| 2026-10-04 | J8, choix faits sans Eloi (questions de la recette J8) : une mention est un nœud à part, pour tout lien `notes://uuid` au texte simple ; un lien interne mis en forme reste un lien. La page ouverte n'est pas réécrite par le main au renommage : son éditeur change ses mentions, enregistrées comme une frappe (pas de faux conflit). Icône : emoji tel quel, nom Lucide en kebab-case, ou `assets/…` de la page ; image en WebP 128 × 128. Détourage par `onnxruntime-web` en WebAssembly dans un worker du main, avec le modèle silueta (Apache 2.0) téléchargé au build et vérifié par empreinte : `@imgly/background-removal-node` écarté (AGPL, `sharp` et `onnxruntime-node` natifs). AppImage de 128 à 159 Mo. Les adresses `mailto:` s'ouvrent aussi depuis la fenêtre. Une image collée depuis une autre page est copiée dans la sienne. |
| 2026-10-04 | J8, choix d'Eloi : tout lien s'ouvre d'un simple clic (mention : la page ; adresse : le navigateur) ; pour modifier un lien, on y entre au clavier ou par « Modifier » dans son infobulle. Renommer une page réécrit le libellé de ses mentions dans les pages qui la citent, pour que les fichiers restent justes hors de l'application. L'icône se choisit au-dessus du titre de la page et par le menu de l'arborescence. Icône image : recadrage carré 128×128, et un bouton « Retirer le fond » (détourage local, modèle compressé, lancé dans le main) plutôt qu'un détourage d'office. |
| 2026-10-04 | Recette J7 validée par Eloi, retouches 0.7.1 à 0.7.7 comprises : J7 passe à « Fait », version 0.8.0. |
| 2026-10-04 | Version 0.7.7 (Eloi) : le dégradé des traits du sommaire ne s'affiche que du côté où des traits sont cachés. Tout en haut de la page, pas de dégradé en haut ; tout en bas, pas en bas. |
| 2026-10-04 | Version 0.7.6, défaut corrigé : avec plus de titres que la hauteur limitée du sommaire latéral, les traits se tassaient jusqu'à disparaître. |
| 2026-10-04 | J7, choix faits sans Eloi (questions de la recette J7) : `Ctrl+T` ouvre la recherche dans l'onglet neuf ; le dernier onglet se vide au lieu de se fermer ; la recherche vide montre huit pages récentes, et à défaut les premières pages ; une page créée depuis la recherche va à la racine ; le sommaire latéral s'arrête au niveau 3 ; le titre en cours est le dernier passé sous la barre du haut (le premier en haut de page, le dernier visible en bas) ; seule la page de l'onglet affiché est chargée, l'historique d'annulation ne survit donc pas à un changement d'onglet. |

---

## Annexe : raccourcis

Desktop uniquement. La liste complète, contexte par contexte (arborescence, recherche, titre, code, conflits) et la création du raccourci global dans Cinnamon : [`docs/raccourcis.md`](docs/raccourcis.md).

### Global

| Raccourci | Action |
|---|---|
| `Ctrl+Alt+Espace` | Recherche globale, dans une petite fenêtre (Notes lancée, même fenêtre fermée) |

### Application

| Raccourci | Action |
|---|---|
| `Ctrl+K` | Palette de recherche |
| `Ctrl+N` | Nouvelle page juste après la page ouverte, au même niveau (à la racine si aucune page n'est ouverte) |
| `Ctrl+Shift+N` | Nouvelle page à la racine |
| `Échap` (nom d'une page « Sans titre ») | Supprimer la page si elle est vide, sinon annuler le renommage |
| `Échap` (réglages) | Revenir aux réglages depuis le thème, puis à la page |
| `Ctrl+T` / `Ctrl+W` | Nouvel onglet / fermer |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Onglet suivant / précédent |
| `Ctrl+clic`, clic du milieu | Ouvrir la page dans un nouvel onglet (arborescence) ; le clic du milieu ferme un onglet |
| `Ctrl+Entrée` (recherche) | Ouvrir la page dans un nouvel onglet |
| `Ctrl+1` à `Ctrl+9` | Onglet n |
| `Ctrl+\` | Afficher/masquer la barre latérale |
| `Ctrl+Shift+\` | Afficher/masquer le sommaire |
| `Ctrl+,` | Réglages |
| `Ctrl+Q` | Quitter Notes pour de bon (fermer la fenêtre la garde en fond) |

### Édition

| Raccourci | Action |
|---|---|
| `Ctrl+B` / `Ctrl+I` | Gras / italique |
| `Ctrl+U` | Souligné |
| `Ctrl+Shift+S` | Barré |
| `Ctrl+E` | Code inline |
| `Ctrl+Alt+1` à `5` | Titre H1 à H5 |
| `Ctrl+Alt+0` | Paragraphe |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Annuler / rétablir |
| `/` | Menu de commandes |
| `@` | Mentionner une page |

### Blocs

| Raccourci | Action |
|---|---|
| `Échap` | Sélectionner le bloc, puis sa liste, puis désélectionner |
| `↑` / `↓` | Bloc précédent / suivant |
| `Shift+↑/↓` | Étendre la sélection |
| `Ctrl+Shift+↑/↓` | Déplacer les blocs sélectionnés, ou le bloc du curseur |
| `Ctrl+D` | Dupliquer |
| `Tab` / `Shift+Tab` | Indenter / désindenter (items de liste) |
| `Entrée` | Quitter la sélection, curseur à la fin du bloc |
| `Suppr` / `Retour arrière` | Supprimer les blocs sélectionnés |

### Tableaux

| Raccourci | Action |
|---|---|
| `Tab` / `Shift+Tab` | Cellule suivante / précédente |
| `Ctrl+↑/↓` | Cellule au-dessus / en dessous |
| `Ctrl+←/→` (bref) | Mot précédent / suivant |
| `Ctrl+←/→` (long) | Cellule précédente / suivante |
| `Entrée` | Cellule du dessous, nouvelle ligne sous la dernière |
| `↓` (dernière ligne) | Sortie du tableau |

---

## Frise chronologique

Une ligne par étape, la plus récente en bas. Rien n'est jamais retiré de cette frise : c'est la trace courte de tout le projet, y compris des séances dont le détail a été élagué du journal de bord.

| Date | Version | Étape |
|---|---|---|
| 2026-10-01 | | Spécification réécrite, Windows retiré |
| 2026-10-01 | | Application Android spécifiée |
| 2026-10-01 | | POC SMB Android concluant |
| 2026-10-01 | | POC compagnon Go concluant |
| 2026-10-01 | | Chiffrement SMB imposé |
| 2026-10-01 | | Architecture et carte du code |
| 2026-10-01 | 0.1.0 | J0 : socle et connexion NAS |
| 2026-10-01 | 0.1.0 | Connexion validée sur le NAS |
| 2026-10-01 | 0.2.0 | J1 : stockage et arborescence |
| 2026-10-01 | 0.2.0 | Valeurs personnelles sorties du code |
| 2026-10-01 | 0.2.1 | Arborescence : états par le fond |
| 2026-10-01 | 0.2.1 | Barre de titre intégrée |
| 2026-10-02 | 0.3.0 | J2 : éditeur de base |
| 2026-10-02 | 0.3.1 | Souligné, listes, titres |
| 2026-10-02 | 0.3.2 | Hiérarchie des titres arrêtée |
| 2026-10-02 | 0.4.0 | J3 : blocs au clavier |
| 2026-10-02 | 0.4.1 | Retours sur les blocs |
| 2026-10-02 | 0.4.2 | Listes : sélection et déplacement |
| 2026-10-02 | 0.4.3 | Flèches : sélection ou déplacement |
| 2026-10-02 | 0.4.4 | Déplacement : Ctrl+Maj seul |
| 2026-10-02 | 0.5.0 | J4 : thème |
| 2026-10-02 | 0.5.1 | Thème réglable dans les réglages |
| 2026-10-02 | 0.5.2 | Thème : écran à part |
| 2026-10-03 | 0.5.3 | Éditeur de thème plus clair |
| 2026-10-03 | 0.5.4 | Pastilles de couleur |
| 2026-10-03 | 0.5.5 | Trait de titre, liste seule |
| 2026-10-03 | 0.5.6 | Palette Feux |
| 2026-10-03 | 0.5.7 | Cases à cocher alignées |
| 2026-10-03 | 0.5.8 | J5 : sync écrite, en recette |
| 2026-10-03 | 0.5.9 | J6 : blocs riches, en recette |
| 2026-10-03 | 0.5.10 | Sync plus rapide, verrou rendu |
| 2026-10-03 | 0.5.11 | Sync : réseau, forçage, délais |
| 2026-10-03 | 0.5.12 | Écran de résolution des conflits |
| 2026-10-03 | 0.5.13 | Arborescence : Ctrl+N, Échap |
| 2026-10-03 | 0.5.14 | Code : langages, couleurs Dark+ |
| 2026-10-03 | 0.5.15 | Poignée au survol, clic final |
| 2026-10-03 | 0.5.16 | Tableaux : poignées, menus |
| 2026-10-03 | 0.5.17 | Poignée du tableau alignée |
| 2026-10-03 | 0.5.18 | Marge gauche de la page élargie |
| 2026-10-03 | 0.5.19 | Surlignage retiré |
| 2026-10-03 | 0.5.20 | Images : tailles, lien collé |
| 2026-10-03 | 0.5.21 | Image redimensionnée par ses bords |
| 2026-10-03 | 0.5.22 | Barre du texte à la sélection |
| 2026-10-03 | 0.5.23 | Images converties en WebP |
| 2026-10-03 | 0.6.0 | J5 : sync validée |
| 2026-10-03 | 0.7.0 | J6 : blocs riches validés |
| 2026-10-04 | 0.7.1 | J7 : navigation, en recette |
| 2026-10-04 | 0.7.2 | Recherche globale seule |
| 2026-10-04 | 0.7.3 | Recherche globale instantanée |
| 2026-10-04 | 0.7.4 | Sync continue fenêtre fermée |
| 2026-10-04 | 0.7.5 | Sommaire : hauteur limitée |
| 2026-10-04 | 0.7.6 | Mise à jour automatique locale |
| 2026-10-04 | 0.7.7 | Dégradé du sommaire ajusté |
| 2026-10-04 | 0.8.0 | J7 : navigation validée |
| 2026-10-04 | 0.8.1 | J8 : liens et icônes, en recette |
| 2026-10-04 | 0.8.2 | Mentions de site, retouches J8 |
| 2026-10-04 | 0.8.3 | Haut de page, boutons d'icône |
| 2026-10-04 | 0.8.4 | « Ajouter une icône » centré |
| 2026-10-04 | 0.9.0 | J8 : liens et icônes validés |
