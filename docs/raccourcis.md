# Raccourcis clavier

Tous les raccourcis de l'application desktop, version 0.8.0. Seuls ceux qui existent déjà sont listés : `@` pour mentionner une page arrivera avec J8.

## Hors de l'application

| Raccourci | Effet |
|---|---|
| `Ctrl+Alt+Espace` | Ouvre aussitôt une petite fenêtre de recherche, de n'importe où, sans la fenêtre de Notes. `Entrée` ouvre la page dans Notes, `Ctrl+Entrée` dans un nouvel onglet, `Échap` ou un clic ailleurs la cache |

Il marche tant que Notes est lancée, même fenêtre fermée : fermer la fenêtre garde Notes en fond (la sync continue), `Ctrl+Q` la quitte pour de bon. Pour qu'il marche dès l'ouverture de session, cocher « Démarrer Notes avec la session » dans les réglages, section « Recherche globale ».

C'est Notes qui capte ces touches. Si un raccourci personnalisé de Cinnamon les utilise déjà, il passe avant et Notes ne les reçoit pas (les réglages le signalent) : le retirer dans Paramètres système, Clavier, Raccourcis, Raccourcis personnalisés, puis relancer Notes.

## Application

| Raccourci | Effet |
|---|---|
| `Ctrl+K` | Recherche d'une page par son titre |
| `Ctrl+N` | Nouvelle page juste après la page ouverte, au même niveau (à la racine si aucune page n'est ouverte) |
| `Ctrl+Shift+N` | Nouvelle page à la racine |
| `Ctrl+T` | Nouvel onglet, recherche ouverte |
| `Ctrl+W` | Fermer l'onglet (le dernier se vide au lieu de se fermer) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Onglet suivant / précédent |
| `Ctrl+1` à `Ctrl+9` | Onglet 1 à 9 |
| Clic du milieu sur un onglet | Fermer l'onglet |
| `Ctrl+\` | Masquer ou montrer la barre latérale |
| `Ctrl+Shift+\` | Masquer ou montrer le sommaire à droite de la page |
| `Ctrl+,` | Ouvrir ou fermer les réglages |
| `Ctrl+Q` | Quitter Notes pour de bon (fermer la fenêtre la garde en fond, pour la recherche globale) |
| `Échap` (réglages) | Revenir aux réglages depuis l'écran du thème, puis à la page |

## Recherche (`Ctrl+K`)

| Raccourci | Effet |
|---|---|
| `↑` / `↓` | Résultat précédent / suivant |
| `Entrée` | Ouvrir la page. Si rien ne correspond, créer la page : juste après la page ouverte, ou, choisi aux flèches, dedans ou à la racine |
| `Ctrl+Entrée` | Ouvrir la page dans un nouvel onglet |
| `Échap` | Fermer |

Le sommaire complet de la page (icône à côté de « Enregistré ») se pilote de la même façon : flèches, `Entrée` pour aller au titre, `Échap`.

## Arborescence

| Raccourci | Effet |
|---|---|
| `↑` / `↓` | Page précédente / suivante |
| `→` / `←` | Déplier, aller au premier enfant / replier, remonter au parent |
| `Début` / `Fin` | Première / dernière page |
| `Entrée` ou `Espace` | Ouvrir la page |
| `Ctrl+Entrée`, `Ctrl+clic`, clic du milieu | Ouvrir la page dans un nouvel onglet |
| `F2` | Renommer |
| `Alt+↑` / `Alt+↓` | Déplacer la page parmi ses sœurs |
| Touche Menu | Menu contextuel |
| `Entrée` / `Échap` (nom en cours de saisie) | Valider / annuler. `Échap` sur une page encore « Sans titre » et vide la supprime |

## Titre de la page

| Raccourci | Effet |
|---|---|
| `Entrée` ou `↓` | Valider le titre, curseur au début du contenu |
| `Échap` | Annuler le renommage |
| `↑` au tout début du contenu | Remonter dans le titre |

## Mise en forme

| Raccourci | Effet |
|---|---|
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Gras / italique / souligné |
| `Ctrl+Shift+S` | Barré |
| `Ctrl+E` | Code dans le texte |
| `Ctrl+Alt+1` à `Ctrl+Alt+5` | Titre de niveau 1 à 5 |
| `Ctrl+Alt+0` | Paragraphe |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Annuler / rétablir |
| `/` | Menu des blocs (flèches, `Entrée` ou `Tab` pour valider, `Échap` pour fermer) |

## Saisie Markdown

À taper en début de ligne, suivi d'une espace :

| Saisie | Donne |
|---|---|
| `#` à `#####` | Titre de niveau 1 à 5 |
| `-` ou `*` | Liste à puces |
| `1.` | Liste numérotée |
| `[]` ou `[ ]`, `- [ ]` | Case à cocher (`- [x]` : cochée) |
| ` ``` ` | Bloc de code |

Dans le texte : `**gras**`, `*italique*`, `~~barré~~`, `` `code` ``.

## Blocs

| Raccourci | Effet |
|---|---|
| `Échap` | Sélectionner le bloc du curseur, puis toute la liste, puis rien |
| `↑` / `↓` (bloc sélectionné) | Bloc précédent / suivant |
| `Shift+↑` / `Shift+↓` | Étendre la sélection de blocs |
| `Ctrl+Shift+↑` / `Ctrl+Shift+↓` | Déplacer les blocs sélectionnés, ou le bloc du curseur |
| `Ctrl+D` | Dupliquer |
| `Tab` / `Shift+Tab` | Indenter / désindenter (éléments de liste) |
| `Entrée` (bloc sélectionné) | Revenir au texte, curseur à la fin du bloc |
| `Suppr` / `Retour arrière` (bloc sélectionné) | Supprimer les blocs sélectionnés |
| `Entrée` sur une ligne vide à la fin d'un callout | Sortir du callout |

## Tableaux

| Raccourci | Effet |
|---|---|
| `Tab` / `Shift+Tab` | Cellule suivante / précédente (`Tab` dans la dernière ajoute une ligne) |
| `Ctrl+↑` / `Ctrl+↓` | Cellule au-dessus / en dessous |
| `Ctrl+←` / `Ctrl+→` bref | Mot précédent / suivant |
| `Ctrl+←` / `Ctrl+→` tenu | Cellule précédente / suivante |
| `Entrée` | Cellule du dessous, nouvelle ligne sous la dernière |
| `↓` dans la dernière ligne | Sortir du tableau |
| Grille de `/tableau` : flèches, `Entrée`, `Échap` | Choisir la taille, valider, abandonner |

## Blocs de code

| Raccourci | Effet |
|---|---|
| `Tab` / `Shift+Tab` | Ajouter / retirer deux espaces en début de ligne |
| `Entrée` trois fois à la fin | Sortir du bloc |
| Liste des langages : flèches, `Entrée`, `Échap` | Choisir, valider, fermer |

## Images et fenêtres

| Raccourci | Effet |
|---|---|
| `Échap` | Fermer la visionneuse, la barre d'une image, la question d'un lien d'image collé, le détail de la sync |

## Écran des conflits

| Raccourci | Effet |
|---|---|
| `Ctrl+Shift+↑` / `Ctrl+Shift+↓` (poignée d'une version) | Déplacer la version d'un bloc |
| `←` / `→` (poignée d'un passage) | Déplacer le passage d'un mot |
| `Suppr` ou `Retour arrière` (poignée d'un passage) | Écarter le passage |
