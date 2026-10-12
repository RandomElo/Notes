# Éditeur

Section desktop. Sur Android, le même schéma TipTap sert au rendu en lecture seule ([android](android.md)).

## Raccourcis de saisie Markdown

`#` à `#####` (titres), `-` ou `*` (puces), `1.` (ordonnée), `[]` ou `[ ]` (case à cocher), ` ``` ` (code), `**gras**`, `*italique*`, `~~barré~~`, `` `code` ``. `==texte==` reste du texte : pas de surlignage.

Ni citation ni séparateur. `>` et `---` tapés restent du texte, et rien dans l'application n'en crée. Un fichier qui en contient déjà (note venue d'un autre outil) les affiche et les garde tels quels.

Fermeture automatique, comme dans VS Code : `(`, `[`, `{`, `«`, `"` et `'` posent aussi le caractère fermant, curseur au milieu. Chaque paire s'ouvre avec une espace de chaque côté du curseur, `( | )`, `[ | ]`, `{ | }`, `" | "`, `' | '`, et des espaces insécables dans les guillemets français, `« | »`, sauf dans le code ; un crochet en début de ligne ou après un marqueur de liste reste collé, `[]`, pour le raccourci des tâches ; taper le fermant le saute, Retour arrière dans une paire vide efface les deux, une sélection est entourée. La paire ne s'ouvre que devant la fin de la ligne, une espace ou une ponctuation fermante, et un `"` ou une apostrophe collés à un mot restent seuls (élision : « l'arbre »). Jamais l'accent grave ni l'astérisque, qui servent aux raccourcis de mise en forme. Même règle dans les champs du téléphone.

La case à cocher se tape aussi dans une puce, comme en Markdown : `- [ ] ` donne une tâche, `- [x] ` une tâche cochée. Les marques se déclenchent en début de ligne, après une espace, et aussi après une apostrophe, une parenthèse, un guillemet ou un tiret : `l'*italique*` fonctionne.

## Affichage des listes et des titres

- Puces : la forme et la couleur changent à chaque niveau (disque bleu, cercle orange, carré vert), puis le cycle reprend.
- Tâches : cocher une tâche coche aussi ses sous-tâches et leurs sous-tâches, à tous les niveaux ; décocher ne décoche qu'elle. Une page dont le fichier a déjà une tâche cochée avec une sous-tâche ouverte n'est pas corrigée d'office : seule une case cochée à l'instant déclenche la règle.
- Listes ordonnées : 1, 2, 3 au premier niveau, a, b, c au deuxième, i, ii, iii au troisième. C'est un affichage : dans le fichier, Markdown ne connaît que les nombres, les sous-listes y restent numérotées 1, 2, 3.
- Titres : le niveau 1 est le titre de la page, affiché en haut, en grand. Dans le texte, `#` est donc le premier niveau en dessous, et il y en a cinq, chacun avec son signe : `#` en gras, `##` un peu plus petit avec un trait fin dessous, de la couleur du titre, `###` en italique, `####` gris à la taille du texte, `#####` en italique gris sans gras. Pas de filet. Couleurs : palette « Feux », choisie sur comparatif, `#` rouge, `##` orange, `###` jaune, `####` vert, `#####` gris. Les puces suivent (rouge, orange, vert) et l'accent passe au bleu `#60a5fa`. Dans le fichier, `#` reste un titre Markdown de niveau 1. Ces valeurs deviendront celles du thème par défaut en J4.

## Enregistrement

Il n'y a pas de commande pour enregistrer. La page s'enregistre toute seule un peu moins d'une seconde après la dernière frappe, au changement de page et à la fermeture de la fenêtre, qui attend la fin de l'écriture. L'état (« Modifié », « Enregistrement… », « Enregistré ») s'affiche en haut de la page et y reste visible quand elle défile. Un échec s'y affiche aussi, et l'enregistrement est retenté tout seul.

En écrivant en fin de page, la ligne en cours ne descend jamais dans le dernier tiers de la fenêtre : la page défile avant, et un espace vide suit la fin de la page.

Une page qu'on vient de créer et dont on quitte le nom sans l'avoir changé (clic ailleurs que dans la page) est traitée comme un `Échap` : vide, elle est retirée, au lieu de rester en « Sans titre ». Cliquer dans son contenu pour y écrire tout de suite la garde.

Le titre affiché en haut de la page est celui du front-matter. Il se modifie sur place : on clique dedans et on tape. `Entrée` ou `↓` le valide et passe au contenu, `Échap` annule, `↑` au tout début du contenu y remonte. La page est renommée quand on quitte le titre, son dossier aussi, comme avec `F2` dans l'arborescence. Un titre refusé (vide, trop long) n'est pas enregistré : l'ancien revient et la raison s'affiche dessous.

## Syntaxe non gérée

Ce que l'éditeur ne sait pas modifier s'affiche tel quel, en texte brut, dans un bloc à part qu'on ne peut pas modifier : titres de niveau 6, définitions de liens par référence, image au milieu d'une phrase, image dans une cellule de tableau (le tableau entier reste alors brut). Ce texte est réécrit à l'identique dans le fichier. Le HTML n'est jamais interprété : il reste du texte. Deux exceptions : `<u>texte</u>`, lu comme du souligné, et `<br>` dans une cellule de tableau, lu comme un saut de ligne (ailleurs, il reste du texte). Un bloc `notes-callout` mal formé (YAML invalide, clé inconnue, nature inconnue, liste dans le texte) reste un bloc de code, qu'on corrige à la main.

Une liste à puces dont certains items seulement ont une case à cocher reste une liste à puces, la case y est du texte.

## Menu `/`

Titres, paragraphe, listes, tâche, mode liste de tâches ([liste-de-taches](liste-de-taches.md)), code, tableau, image, callout, page enfant, lien, date. En français avec alias anglais, recherche insensible aux accents.

- Il s'ouvre quand on tape `/` en début de bloc ou après une espace, pas dans « et/ou », une date ou un bloc de code. Ce qu'on tape ensuite filtre la liste, y compris par le nom anglais (`quote`, `todo`) ou la syntaxe Markdown (`###`).
- Flèches pour choisir, `Entrée` ou `Tab` pour valider, `Échap` pour fermer sans toucher au texte.
- Dans un bloc vide, la commande transforme le bloc. Dans un bloc qui contient déjà du texte, elle crée le nouveau bloc en dessous.
- « Page enfant » crée une sous-page de la page ouverte et l'ouvre : on tape son nom dans l'arborescence, et une fois le nom validé le curseur est dans son contenu. C'est vrai de toute page qu'on vient de créer (`Ctrl+N`, bouton, menu). « Date » écrit la date du jour en toutes lettres (« 2 octobre 2026 »).
- « Tableau » ouvre une grille : on survole la taille voulue (en-tête compris), on clique ou on valide par `Entrée`. « Image » ouvre le sélecteur de fichiers. « Callout » transforme le paragraphe vide en callout « Info », ou en ajoute un dessous.
- « Lien vers une page » (`/lien`) ouvre le même choix de page que `@`.

## Gestion des blocs au clavier

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

## Barre d'outils flottante

Apparaît quand du texte est sélectionné, à la souris ou au clavier ; un simple clic dans le texte ne la montre pas. Dans une cellule de tableau ou un callout, elle vient aussi au clic, pour leurs menus. Elle disparaît à la frappe, au clic ailleurs ou sur `Échap`. Contenu adapté au type de bloc (texte, titre, cellule, image, code, callout).

Elle se place au-dessus de la ligne du curseur. Elle porte la nature du bloc (texte, titres, listes, code), qu'on change dans une liste déroulante, puis gras, italique, souligné, barré et code. Dans un bloc de code, seule la nature du bloc est proposée. Dans une cellule, la nature du bloc laisse la place à l'étiquette « Tableau », à ses menus d'ajout et de suppression et à l'alignement de la colonne. Dans un callout, elle laisse la place à sa nature (Info, Succès, Attention, Danger, ou retirer le callout) et à son icône. Une image sélectionnée a sa propre barre (voir Images).

## Tableaux

Mise en page uniquement (pas de types, filtres ni tri). Tableaux GFM : la première ligne est toujours l'en-tête, sans cellules fusionnées.

- Largeur : le tableau prend toute la largeur de la page, colonnes fixes, qui ne s'élargissent pas pendant la frappe (le texte passe à la ligne). Elles sont égales, ou réglées en glissant la bordure entre deux colonnes (curseur de redimensionnement à son approche ; chaque colonne garde au moins 5 %). Markdown ne sait pas écrire une largeur : elle va dans l'en-tête de la page (`table_widths`, [stockage](stockage.md)), une liste de pourcentages par tableau, dans l'ordre de la page. Le Markdown du tableau ne change pas. Sur le téléphone, un tableau garde une largeur selon son contenu et défile s'il est trop large. À l'export, colonnes égales sur toute la largeur : les largeurs réglées ne sont pas reprises.
- Saut de ligne dans une cellule : `Ctrl+Entrée` ou `Maj+Entrée`. Il s'écrit `<br>` dans le fichier, la convention de GitHub et d'Obsidian.

- Création par `/tableau` et sa grille de taille. Ensuite, une poignée « + » au bord droit et une au bord bas, chacune visible seulement quand la souris approche de son bord : un clic ajoute une colonne ou une ligne, un glissement en ajoute plusieurs pendant le geste (une colonne tous les 80 px), et en retire en revenant. Seule une colonne ou une ligne vide est retirée, et il reste toujours l'en-tête et une colonne : tirer une poignée ne fait jamais perdre de texte.
- Navigation : `Tab` et `Maj+Tab` passent à la cellule suivante ou précédente (`Tab` dans la dernière cellule ajoute une ligne), `Ctrl+↑/↓` à la cellule du dessus ou du dessous, `Ctrl+←/→` saute un mot en appui bref et passe à la cellule voisine en appui long (plus de 350 ms, puis une cellule de plus à chaque délai). `Entrée` descend d'une cellule, et sous la dernière ligne en ajoute une. Depuis la dernière ligne, `↓` sort du tableau.
- Au survol d'une cellule, une poignée à gauche de sa ligne et une au-dessus de sa colonne, comme dans Notion. Un clic sélectionne toute la ligne ou la colonne et ouvre son menu : mettre en en-tête (une ligne qui n'est pas la première), insérer au-dessus, en dessous, à gauche, à droite, supprimer. Un glissement la déplace, un trait bleu montre où elle tombera. Une ligne glissée en premier devient l'en-tête : GFM n'a d'en-tête que la première ligne, pas de colonne d'en-tête.
- Dans la barre d'outils, une cellule montre l'étiquette « Tableau », un « + » qui ouvre les ajouts (ligne au-dessus, en dessous, colonne à gauche, à droite), une corbeille qui ouvre les suppressions (ligne, colonne, tableau), puis l'alignement.
- L'alignement est celui de la colonne (`:--`, `:-:`, `--:` dans le fichier), réglé depuis la barre d'outils. Il suit la colonne quand elle est déplacée.
- Écrit en colonnes alignées par des espaces, pour rester lisible dans un éditeur de texte. Un tableau qu'on n'a pas modifié garde son texte d'origine.

## Blocs de code

Coloration `lowlight` (highlight.js), limitée à une liste de langages, un nom par entrée (pas de « / ») : Arduino, Assembleur ARM, Assembleur x86, Bash, C, C#, C++, CSS, Diff, Dockerfile, Excel, Go, HTML, INI, Java, JavaScript, JSON, JSX, Kotlin, Makefile, Markdown, Nginx, PHP, PowerShell, Python, Rust, Shell, SQL, TOML, TSX, TypeScript, XML, YAML. Deux noms d'une même grammaire (HTML et XML, JavaScript et JSX, TypeScript et TSX, TOML et INI, Bash et Shell) sont deux entrées qui colorent pareil. Un autre langage déjà écrit dans un fichier reste tel quel, sans couleur. Couleurs du thème « Dark+ » de VS Code ; les mots de contrôle (`if`, `return`, `import`…) ont leur propre couleur. Une barre au-dessus du code donne le langage, qu'on change dans une liste avec recherche (nom, identifiant ou alias comme `ts`, sans accents ni casse ; « Texte brut » retire le langage), et un bouton « Copier ». Du code collé dans un bloc vide sans langage lui donne son langage s'il se reconnaît nettement. `Tab` et `Maj+Tab` indentent de deux espaces. Les numéros de ligne et le retour à la ligne se règlent dans le thème pour tous les blocs (`[code] line_numbers`, `wrap`), rien n'est ajouté au fichier de la page. Avec le retour à la ligne, la suite d'une ligne longue reste alignée sur son texte. Le numéro d'une dernière ligne vide n'est pas affiché.

## Images

Insertion par `/image` (sélecteur de fichiers, plusieurs à la fois), glisser-déposer ou collage. L'image est copiée dans le dossier `assets/` de la page, jamais en remplaçant un fichier : le nom d'origine est gardé sans espaces ni caractères gênants (`Capture d'écran (2).png` devient `Capture-d-écran-2.png`), un nom pris reçoit un numéro, une image collée prend la date. Sa nature est vérifiée par ses premiers octets (PNG, JPEG, GIF, WebP, AVIF, SVG). Toute image reçue (collée, déposée, choisie, téléchargée) est enregistrée en WebP compressé (qualité 82 %), réduite à 1920 px de large au plus, avec l'extension `.webp` ; un GIF (souvent animé) et un SVG (vectoriel) restent tels quels. Une image reçue peut faire jusqu'à 200 Mo, la version enregistrée 50 Mo. Dans les réglages, « Images en WebP » convertit les images déjà dans le dossier des notes : chaque page renvoie à la nouvelle version, l'ancien fichier reste et passe dans les images inutilisées. Une image va au premier niveau de la page, pas dans une cellule, un callout ou un item. Pas de vidéo.

- Dans le fichier : `![texte alternatif](assets/x.png#largeur=66&align=centre "Légende")`. La largeur (un pourcentage entier de 10 à 100) et l'alignement (gauche, centre, droite) vont dans le fragment de l'adresse, que les autres outils ignorent. Pleine largeur et centrage sont les valeurs par défaut, qui ne s'écrivent pas.
- Au survol, une barre sur chaque bord de l'image, comme dans Notion (curseur de redimensionnement) : tirée, elle règle la largeur de 10 à 100 %, l'image suit le geste avec son pourcentage affiché, et le fichier ne change qu'au lâcher. Une image centrée grandit des deux côtés.
- Un clic sélectionne l'image et montre sa barre : taille (Petit 33 %, Moyen 66 %, Grand pour toute la page), alignement, texte alternatif et légende (dans un petit formulaire), agrandir. Un clic dans le vide du bloc, à côté de l'image ou sous sa légende, la quitte et ferme sa barre. Un double-clic ouvre la visionneuse plein écran, légende en bas de l'écran, fermée par `Échap`, le bouton ou un clic à côté.
- Seules les images du dossier des notes s'affichent, servies par le main (protocole `notes-asset:`), qui vérifie le chemin et la nature du fichier. Une image d'Internet n'est jamais chargée : un cadre le dit à sa place.
- Coller le lien d'une image d'Internet (`https://…/x.png`) demande s'il faut la télécharger dans la page. « Télécharger » : le main la récupère (http et https seulement, sans cookies, 20 s et 200 Mo au plus, nature vérifiée par les premiers octets), puis elle est convertie en WebP et copiée dans `assets/` sous le nom de l'adresse. Seul un lien qui finit par une extension d'image déclenche la question. « Garder le lien » ou `Échap` : le lien est collé comme du texte. Sans réseau, ou si le lien ne mène pas à une image, un message le dit et le lien reste en texte.
- Images inutilisées : les réglages listent les fichiers des dossiers `assets/` dont la page ne parle plus, avec « Montrer » pour les voir dans le gestionnaire de fichiers. Rien n'est supprimé par l'application.
- Une image copiée d'une page et collée dans une autre s'affiche aussitôt (son adresse renvoie à la page d'origine), puis son fichier est copié dans les `assets/` de la page, sans rien remplacer, et l'adresse devient locale.

## Callouts

Encadré coloré avec une icône, qui contient un ou plusieurs paragraphes mis en forme (gras, italique, code, liens), sans listes ni titres. Quatre natures, chacune avec sa couleur du thème (`[callout]`) et son icône par défaut : Info 💡, Succès ✅, Attention ⚠️, Danger 🛑. L'icône se change parmi une quinzaine d'emojis ; une icône choisie reste quand la nature change, celle de la nature suit. `Entrée` sur le dernier paragraphe vide sort du callout, `Retour arrière` au début de son premier paragraphe le sort du callout.

Dans le fichier, un bloc fencé `notes-callout` en YAML, clés facultatives, l'icône seulement si elle n'est pas celle de la nature :

```notes-callout
type: warning
text: |-
  Couper le **wifi** avant.

  Deuxième paragraphe.
```

## Bloc des sous-pages

Comme sur Notion, une page qui a des sous-pages les montre sous son titre, avant son contenu, une ligne par sous-page (icône, titre), dans l'ordre de l'arborescence. Une ligne ouvre la sous-page (`Ctrl+clic` ou clic du milieu : dans un nouvel onglet), « Nouvelle sous-page » en crée une, comme « Page enfant » du menu `/`. Le bloc est seulement affiché, calculé depuis l'arborescence : rien dans `page.md`, rien à l'export. Une page sans sous-page n'a pas de bloc. Même bloc sur le téléphone ([android](android.md)).

## Liens et mentions

`@` ou `/lien` pour mentionner une page (icône et titre courant, suit les renommages). URL collée sur une sélection ou seule. Mentions cassées signalées et listées dans les réglages.

- `@` en début de bloc, après une espace ou une parenthèse (pas dans une adresse de courriel) ouvre la liste des pages : les récentes, puis, à la frappe, recherche floue sans accents. Flèches, `Entrée` ou `Tab`, `Échap` comme pour le menu `/`. La mention est suivie d'une espace.
- À l'écran, une mention montre l'icône et le titre du moment de la page, soulignés finement. Le fichier garde le texte écrit, mis à jour au renommage ([stockage](stockage.md)). Une page introuvable : le texte du fichier, barré et gris.
- Tout lien s'ouvre d'un simple clic : une mention ou un lien `notes://` ouvre la page (`Ctrl+clic` ou clic du milieu : nouvel onglet), une adresse web part dans le navigateur, une adresse `mailto:` dans la messagerie. Pour modifier un lien, on y entre au clavier, ou par son infobulle.
- Au survol d'un lien (ou quand le curseur y entre au clavier), une infobulle, collée au lien et qui reste ouverte tant que la souris va vers elle, donne son adresse, « Modifier » (texte et adresse, `exemple.fr` devient `https://exemple.fr`, une adresse vide retire le lien), « Copier l'adresse » et « Retirer le lien » (le texte reste). Sur une mention : le chemin de la page, « Changer de page » (la liste des pages se rouvre) et « Retirer la mention » (le titre reste en texte).
- Une adresse web collée seule devient d'abord un lien dont le texte est l'adresse nettoyée, puis une mention de site : Notes demande au site son titre et sa favicon (http et https seulement, sans cookies, 8 secondes et 512 Ko au plus, favicon de 256 Ko au plus), et le lien prend ce titre, favicon devant, comme une mention de page. Dans le fichier : `[Titre du site](https://exemple.fr "mention")`. La favicon, ramenée à un PNG de 64 px, est gardée dans `.notes/favicons/<site>.png` et synchronisée ; l'affichage ne va jamais la chercher sur Internet (un globe à sa place s'il n'y en a pas). Site injoignable : le lien reste un lien. Dans l'infobulle, « En lien » ramène une mention de site à un simple lien, « Mention » fait l'inverse ; collée sur une sélection d'un seul bloc, elle fait de la sélection un lien. Un lien `notes://` vers une page connue collé devient une mention. Rien de cela dans un bloc de code ou du code en ligne. Le bouton « Lien » de la barre d'outils ouvre le même formulaire sur la sélection.
- Les réglages listent les mentions cassées (« Chercher »), page par page, avec « Ouvrir la page ».

## Icônes de page

Emoji (recherche FR), icône Lucide (table de correspondance FR vers EN), image (recadrage carré 128×128, détourage du fond via ONNX local, à la demande).

- L'icône s'affiche au-dessus du titre de la page, en grand, avec de l'espace au-dessus ; sans icône, le titre reste près du haut, et « Ajouter une icône » est centré dans l'espace au-dessus de lui (même écart en haut et en bas) ; un clic ouvre son choix. Sans icône, « Ajouter une icône » apparaît au survol du haut de la page. Le menu de l'arborescence a aussi « Icône ». Elle s'affiche dans l'arborescence, les onglets, la recherche et les mentions.
- Trois onglets dans le choix. Emoji : tous les emojis d'Unicode, cherchés par leur nom et leurs mots-clés français (Emojibase). Icônes : les icônes Lucide, cherchées par un mot français d'une table tenue à la main (« maison » trouve `house`) ou par leur nom anglais. Image : une image de l'ordinateur, ou d'Internet par son adresse (téléchargée par le main, comme une image collée), recadrée en carré (glisser pour déplacer, molette ou curseur pour zoomer), enregistrée en WebP 128 × 128 sous `assets/icone.webp` (sans rien remplacer : `icone-2.webp`…). « Retirer » enlève l'icône.
- « Retirer le fond » détoure le carré choisi par le modèle silueta (U²-Net allégé, 44 Mo), dans le main, par le moteur ONNX en WebAssembly : rien ne part sur le réseau, environ 2 secondes. Un damier montre ce qui est devenu transparent, « Garder le fond » revient en arrière. Le modèle et le moteur sont livrés dans l'AppImage (`npm run build:models` les prépare, empreinte du modèle vérifiée).
- Une ancienne icône image reste dans `assets/` et passe dans les images inutilisées.


