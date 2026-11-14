# Import de Notion

Desktop uniquement. Tout un espace Notion arrive dans le dossier des notes en une fois, depuis la rubrique « Import Notion » des réglages. Rien ne passe par Internet : Notes lit l'export que Notion fournit.

## L'export

Dans Notion : Paramètres, Général, « Exporter tout le contenu de l'espace », format HTML, avec le contenu des sous-pages et un dossier par sous-page. Le HTML garde ce que le format Markdown de Notion perd : l'icône de chaque page (emoji ou image), l'icône et la couleur des callouts. Notion envoie un lien par courriel ; un gros espace arrive en plusieurs `.zip`, parfois rangés dans un `.zip`. On les choisit tous ensemble.

Les archives sont ouvertes dans un dossier temporaire, au fil de l'eau (jamais une archive entière en mémoire), celles qu'elles contiennent aussi, sur trois niveaux au plus. Un nom qui sortirait du dossier (`../`, chemin absolu) est ignoré. Le dossier temporaire est effacé après l'import, à l'abandon et à la fermeture de Notes.

## Choix des pages

Une fois l'export lu, un écran plein montre l'arborescence de Notion, une case par page, toutes cochées sauf celles que Notes propose de supprimer. Décocher une page décoche ses sous-pages ; cocher une page coche ses sous-pages et les pages au-dessus d'elle (une sous-page ne vient pas sans sa page). Un clic sur une page montre à droite son contenu, converti comme il le sera, en lecture seule, images comprises (les mentions en texte). En haut : le nombre de pages cochées, de pages proposées à la suppression, de PDF inclus et leur poids ; une case réduit l'arbre aux pages signalées ou avec des PDF.

Proposées à la suppression (décochées d'office, chacune avec son badge) :

- Vide : ni texte, ni image, ni fichier joint, ni base, ni propriété remplie, ni sous-page.
- Modèle Notion : une page que Notion crée à l'ouverture d'un compte (« Accueil de l'espace d'équipe », « Guide de démarrage », « People », « Getting Started »…).
- Doublon : même titre et même texte qu'une page vue avant elle dans l'arbre.
- Sans titre : titre vide, « Sans titre » ou « Untitled ».

Les PDF joints ont un badge sur leur page, et leur liste (nom, poids) en tête de son aperçu.

## Bases de données

Notion exporte une base comme une page qui renvoie à son fichier `.csv` (suivi de « Métadonnées : filtres et tris », laissé de côté), ses lignes étant les sous-pages de cette page ; le tableau vient du CSV. Une base plus ancienne, en tableau HTML, est reprise de la même façon.

Chaque base se règle dans l'aperçu de sa page :

- Tableau et sous-pages (par défaut) : un tableau des propriétés dans la page, dont la première colonne mentionne chaque ligne (retrouvée par son titre), devenue une sous-page.
- Sous-pages seules : pas de tableau, chaque ligne devient une sous-page.
- Tableau seul : le tableau, sans mention ; les lignes ne deviennent pas des pages, leur contenu est perdu.
- Ne pas importer : ni tableau ni pages ; une base en pleine page n'est pas créée du tout.

Une ligne devenue page commence par ses propriétés remplies, une puce chacune (`- **Statut** : Lu`).

## L'import

Les pages arrivent à la racine du dossier des notes, dans l'arborescence de Notion : une page `Titre <id>.html` a pour sous-pages celles du dossier `Titre/` à côté (ou `Titre <id>/` dans les exports plus anciens), dans l'ordre où elle les montre, puis par titre. Deux pages sœurs de même titre partagent ce nom de dossier : une sous-page va à celle qui renvoie à elle. Toutes les pages sont créées d'abord, puis leur contenu est écrit : un lien vers une autre page de l'export, par fichier ou par adresse notion.so, devient une mention (`notes://<id>`). Une page existante n'est jamais touchée. L'import passe par la même file que les autres opérations sur le dossier des notes, page par page : on peut continuer à écrire pendant qu'il avance, et l'arrêter (à la page suivante).

Le titre vient de la page, sinon du nom du fichier sans l'identifiant de Notion. L'icône emoji (attribut `data-emoji`, ou texte dans les exports plus anciens) va dans le front-matter, une icône image de l'export est copiée dans `assets/` ; les icônes de Notion servies par son site sont laissées. Les images et les PDF joints de la page sont copiés dans son dossier `assets/`, sauf ceux de plus de 50 Mo ; une image collée dans Notion, écrite dans le HTML même (`data:image/…;base64`), aussi. BMP et ICO, que Notes ne lit pas, manquent.

## Conversion des blocs

Le HTML est lu en arbre, jamais interprété. Le Markdown sort de l'écriture de Notes : il est relu à l'identique.

| Notion | Notes |
|---|---|
| Titres 1 à 3, paragraphes, citations, séparateurs | Les mêmes |
| Listes à puces, numérotées, cases à cocher | Les mêmes, sous-listes comprises ; Notion écrit chaque item dans sa liste, Notes les réunit. Un item sans texte mais avec un contenu (que le Markdown ne relit pas) laisse ce contenu hors de la liste, à sa place |
| Gras, italique, barré, code, souligné, surligné (couleur de fond) | Les mêmes ; la couleur du texte est perdue |
| Bloc de code | Bloc de code, langage en minuscules (« Plain Text » : sans langage) |
| Callout (`aside`, ou `figure` dans les exports plus anciens) | Callout, avec son emoji ; nature selon la couleur : rouge et rose « danger », orange, jaune et marron « attention », vert « succès », le reste « info ». Son contenu devient des paragraphes |
| Bloc dépliable | Puce, son contenu dessous ; un titre dépliable devient un titre suivi de son contenu |
| Tableau simple | Tableau, la première ligne en en-tête ; un saut de ligne dans une cellule devient `<br>` |
| Image | Image copiée, sa légende en texte alternatif ; une image sur le web reste un lien |
| Bloc « page » vers une sous-page | Rien : Notes montre déjà les sous-pages sous le titre |
| Bloc « page » vers une page de l'export non importée | Rien : son titre seul n'aurait plus de sens |
| Autre lien vers une page, mention | Mention de la page importée ; vers une page absente de l'export, le texte seul |
| Signet, intégration | Lien |
| Équation | Bloc de code `latex` ; en ligne, son LaTeX en code |
| Colonnes | Leur contenu, l'une après l'autre |
| PDF joint, lien vers un PDF | PDF copié, lien `[📎 nom](assets/nom.pdf)` qui l'ouvre dans la visionneuse du système |
| Autre fichier joint | Son nom, précédé de 📎 ; le fichier n'est pas copié |
| Table des matières | Rien (Notes a son sommaire) |

À la fin, Notes dit combien de pages sont importées et ce qui n'a pas pu l'être tel quel (images ou PDF manquants, autres fichiers joints, blocs repris en texte), avec le nombre de pages concernées.
