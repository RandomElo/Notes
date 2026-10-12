# Thème

Thème défini dans `.notes/theme.toml`, converti en variables CSS, rechargé à chaud. Sombre uniquement en v1. Le même thème s'applique sur Android, sans réglage sur le téléphone.

Le point clé est la hiérarchie H1 à H5, nettement différenciée (taille, graisse, italique, trait), le titre de la page tenant lieu de niveau 1 (détail en [editeur](editeur.md)). C'est la correction principale par rapport à AppFlowy.

- Thème par défaut : titres choisis sur comparatif, puces et numérotation par niveau, fond de code. Sans fichier de thème, c'est lui qui s'applique.
- Réglage dans l'application : l'éditeur de thème a son propre écran, pour ne pas se mélanger aux autres réglages. La page des réglages dit seulement où en est le thème (par défaut, personnalisé, réglages ignorés) et porte le bouton « Modifier le thème » qui y mène, un bouton de retour en ramène. Cet écran a un formulaire du thème (couleurs, texte, chaque niveau de titre, puces, code, interface) avec un aperçu d'une page d'exemple à côté. Chaque réglage s'applique tout de suite à l'écran, puis est écrit dans le fichier après un court délai, ou tout de suite si on quitte les réglages ou ferme la fenêtre. Une saisie refusée est signalée sous son champ, n'est pas appliquée et n'est pas écrite. Chaque réglage a son retour au défaut, et tout le thème aussi, après confirmation.
- Le fichier reste la référence, et l'application ne l'écrit que sur un geste : un réglage dans le formulaire, ou le bouton « Créer le fichier de thème ». Il n'est jamais créé tout seul. L'application l'écrit en entier, toutes les valeurs, commentées par section : un commentaire ou un réglage inconnu ajouté à la main disparaît donc au prochain réglage fait dans le formulaire. Le bouton « Ouvrir le fichier de thème » l'ouvre dans l'éditeur de texte du système.
- Ordre du formulaire, celui où on s'en sert : les cinq niveaux de titre d'abord (couleur, taille, graisse, espace au-dessus, italique, trait), puis le texte (interligne, taille, polices), puis la palette. Puces, code et interface sont repliés sous « Autres réglages ».
- Une couleur qui peut renvoyer à la palette (celle d'un titre, par exemple) se règle dans une seule liste où chaque couleur a sa pastille : un nom de la palette, qui suit la palette, ou « Couleur choisie… », qui ouvre le sélecteur de couleur du système et donne une couleur propre à ce réglage. Cette liste est dessinée par l'application (une liste déroulante du système n'affiche que du texte) et se manie au clavier comme une liste ordinaire : flèches, `Entrée`, `Échap`. Un « i » entouré, à côté du libellé ou du titre d'une section, explique au survol (ou au focus clavier) comment marchent les couleurs, la palette et l'interligne.
- Les polices se choisissent dans une liste : la police du système d'abord, puis les polices courantes sous Linux qui sont installées sur le poste (détectées en mesurant du texte, sans rien demander au système). Une police choisie s'écrit avec son repli (`'Noto Sans', sans-serif`), pour le téléphone qui ne l'aurait pas. Une police écrite à la main dans le fichier reste affichée telle quelle.
- Rechargement à chaud : le fichier est relu à chaque modification du dossier des notes, et ses valeurs deviennent des variables CSS posées sur la racine. Une ligne supprimée reprend sa valeur par défaut, un fichier supprimé rend le thème par défaut.
- Citations et séparateurs gardent un affichage fixe, hors du thème : l'application n'en crée plus ([editeur](editeur.md)).
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

La coloration du code, les callouts et les tableaux se servent de leurs réglages, et le formulaire les montre sous « Autres réglages ». `[code]` a deux réglages de plus : `line_numbers` (faux par défaut) et `wrap` (vrai par défaut depuis 0.5.14).

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


