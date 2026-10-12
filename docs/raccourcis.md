# Raccourcis clavier

Tous les raccourcis de l'application desktop, version 0.17.5. Le téléphone n'a pas de raccourci clavier ; ses champs reprennent la saisie Markdown et la fermeture des paires ci-dessous.

Notes n'a plus de recherche à elle depuis la 0.17.4 (ni `Ctrl+K`, ni `Ctrl+Alt+Espace`) : les pages se cherchent avec la barre de recherche du poste.

## Application

| Raccourci | Effet |
|---|---|
| `Ctrl+N` | Nouvelle page juste après la page ouverte, au même niveau (à la racine si aucune page n'est ouverte) |
| `Ctrl+Shift+N` | Nouvelle page à la racine |
| `Ctrl+T` | Nouvel onglet, vide |
| `Ctrl+W` | Fermer l'onglet (le dernier se vide au lieu de se fermer) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Onglet suivant / précédent |
| `Ctrl+1` à `Ctrl+9` | Onglet 1 à 9 |
| Clic du milieu sur un onglet | Fermer l'onglet |
| `Ctrl+\` | Masquer ou montrer la barre latérale |
| `Ctrl+Shift+\` | Masquer ou montrer le sommaire à droite de la page |
| `Ctrl+,` | Ouvrir ou fermer les réglages |
| `Ctrl+Q` | Quitter Notes (comme fermer la fenêtre) |
| `Échap` (réglages) | Revenir aux réglages depuis l'écran du thème, puis à la page |
| `Échap` (corbeille) | Revenir à la page. Pendant une confirmation (« Effacer pour de bon »), l'annule d'abord |
| `Ctrl+Z` (après « Accepter » d'une fonction IA) | Revenir à la page d'avant |

## Sommaire complet

Le sommaire complet de la page (icône au-dessus du sommaire latéral, ou menu « ⋮ ») se pilote au clavier : flèches, `Entrée` pour aller au titre, `Échap`.

## Arborescence

| Raccourci | Effet |
|---|---|
| `↑` / `↓` | Page précédente / suivante |
| `→` / `←` | Déplier, aller au premier enfant / replier, remonter au parent |
| `Début` / `Fin` | Première / dernière page |
| `Entrée` ou `Espace` | Ouvrir la page |
| `Ctrl+Entrée`, `Ctrl+clic`, clic du milieu | Ouvrir la page dans un nouvel onglet |
| `Maj+↑` / `Maj+↓` | Étendre la sélection depuis la page du focus |
| `Maj+clic` | Sélectionner toutes les pages entre la page ouverte (ou le début de la sélection) et la page cliquée, sans l'ouvrir |
| `Échap` | Défaire la sélection |
| Touche Menu ou clic droit | Menu contextuel (flèches pour choisir, `Échap` ou `Tab` le ferme). Sur « Mémos vocaux » : « Ouvrir le dossier des mémos » |
| `Suppr` | Mettre à la corbeille les pages sélectionnées, ou la page du focus. Si l'une a des sous-pages, une confirmation : `Entrée` confirme, `Échap` abandonne |
| `F2` | Renommer |
| `Alt+↑` / `Alt+↓` | Déplacer la page parmi ses sœurs |
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
| `@` | Mentionner une page (mêmes touches que le menu des blocs) |
| Clic, `Ctrl+clic` sur un lien | Ouvrir le lien ou la page mentionnée ; `Ctrl+clic` ou clic du milieu : la page dans un nouvel onglet |

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

## Fermeture des paires

| Saisie | Donne |
|---|---|
| `(`, `[`, `{`, `"`, `'` | La paire avec une espace de chaque côté du curseur : `( \| )`, `[ \| ]`, `{ \| }`, `" \| "`, `' \| '` |
| `«` | `« \| »`, avec des espaces insécables |
| Le caractère fermant | Saute celui qui est déjà là |
| `Retour arrière` dans une paire vide | Efface les deux |
| Un des caractères ouvrants, texte sélectionné | Entoure la sélection |

La paire ne s'ouvre que devant la fin de la ligne, une espace ou une ponctuation fermante. Un `[` en début de ligne ou après `- ` reste collé (`[]` pour une case à cocher), un `"` ou une apostrophe collés à un mot restent seuls (« l'arbre »). Rien dans le code.

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
| `Retour arrière` au tout début d'un callout | Retirer le callout, son texte reste en paragraphes |

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
| `Échap` | Fermer la visionneuse, la barre d'une image, la question d'un lien d'image collé, le détail de la sync, la fenêtre d'export, la bulle d'une faute, la relecture d'un mémo (en arrêtant sa mise en forme) |
| `Échap` (images inutilisées) | Annuler la confirmation « tout supprimer » |
| Choix de l'icône : flèches, `Entrée`, `Échap` | Parcourir les emojis ou les icônes, appliquer, fermer |
| Fenêtre d'export, liste des formats : `↑` / `↓`, `Entrée` ou `Espace`, `Échap` | Ouvrir la liste et choisir, valider, refermer la liste |
| Fonctions IA : `↑` / `↓`, `Entrée`, `Échap` | Passer de « Relecture » à « Mise au propre », lancer, annuler l'appel en cours ou sinon fermer |
| Liste des fautes (clic sur le compteur) : `↑` / `↓`, `Échap` | Faute précédente / suivante, fermer et revenir à la page |

## Écran des conflits

| Raccourci | Effet |
|---|---|
| `Ctrl+Shift+↑` / `Ctrl+Shift+↓` (poignée d'une version) | Déplacer la version d'un bloc |
| `←` / `→` (poignée d'un passage) | Déplacer le passage d'un mot |
| `Suppr` ou `Retour arrière` (poignée d'un passage) | Écarter le passage |
