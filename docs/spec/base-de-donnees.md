# Base de données

Une base de données à la Notion, en plus simple. Une page devient une base par « Passer en base de données » dans le menu « ⋮ » du haut de la page ; « Quitter la base de données » la ramène en page classique (la configuration reste dans l'en-tête, pour la retrouver). Les lignes sont des sous-pages, ou vivent dans le tableau de la page : voir [base sans pages](base-sans-pages.md). Le menu « ⋮ » d'une base propose aussi « Paramètres de la base » (mode des lignes et colonnes).

## Ce qu'on voit

- Au-dessus du texte de la page, un tableau : une ligne par sous-page de la base, une colonne par champ. La première colonne, « Page », montre le titre (et l'icône) de chaque sous-page ; un clic l'ouvre dans un nouvel onglet (`Ctrl+clic` : à la place de la page affichée).
- La page garde son texte, sous le tableau : on peut y écrire comme dans une autre page.
- Les sous-pages d'une ligne sont ses sous-lignes : décalées sous elle, avec les mêmes colonnes, repliables par la flèche devant leur titre. Elles sont dépliées par défaut ; une ligne repliée est notée dans l'en-tête de la base et le reste, à la réouverture comme sur le téléphone. Sans NAS (téléphone) ou en lecture seule, le repli vaut pour l'écran seulement. Au survol d'une ligne, un « + » lui ajoute une sous-ligne. Une sous-ligne a elle-même ses sous-lignes, jusqu'à six niveaux.
- Au survol d'une ligne, une corbeille à côté de son titre met sa sous-page à la corbeille (elle s'y restaure pendant 30 jours, voir [corbeille](corbeille.md)). Le téléphone n'a pas de corbeille : on n'y retire pas de ligne.
- Le bloc des sous-pages n'est pas montré : les lignes en tiennent lieu. Une sous-page reste une page ordinaire, qu'on ouvre, écrit, déplace ou met à la corbeille comme les autres.

## Vue en liste

Une base se montre en tableau (par défaut) ou en liste, au choix dans « Paramètres de la base », rubrique « Affichage » ; la vue est notée dans l'en-tête (`view: list`) et ne change pas les valeurs.

- Chaque ligne a une case, son titre (qui revient à la ligne) avec à sa droite, sur la même ligne, les étiquettes (pastilles des champs état et choix), puis les autres champs en dessous : le nom du champ en petit au-dessus d'un texte, d'un nombre ou d'un courriel. Un champ vide ne se montre qu'au survol de la ligne (ou au focus clavier), avec son nom, à remplir d'un clic. Les sous-lignes restent décalées et repliables ; le tri des colonnes ne s'applique pas, les lignes suivent leur ordre.
- La case coche le premier champ « case à cocher » de la base, sinon son premier champ « état » : cocher écrit le dernier état de la liste du thème (« Fait »), décocher écrit le premier (« À faire »). Cochée, la ligne est barrée et atténuée. Sans champ de ce genre, pas de case. Ce champ ne s'affiche pas une seconde fois sous le titre.
- « Nouvelle ligne » ouvre un champ de titre ; `Entrée` crée la ligne et rouvre aussitôt un champ pour la suivante (on peut taper sans attendre), `Entrée` sur un champ vide le ferme. Les lignes peuvent avoir leur page ou non, comme dans le tableau.
- Le téléphone montre toujours le tableau.

## Champs

Six types : texte, état, choix, case à cocher, nombre, courriel. Une base neuve a un champ « État ».

- « Nouvelle colonne » (le « + » au bout de l'en-tête, ou le bouton sous le tableau) : un nom et un type. Le nom est unique dans la base, 60 caractères au plus, ni « Page » ni `|`.
- Le menu d'un champ (« ⋮ » de son en-tête) : « Renommer » (le nouveau nom suit dans toutes les lignes), « Type : … » pour changer son type, et « Retirer le champ ». Un champ retiré n'efface rien : ses valeurs restent dans l'en-tête des sous-pages. Changer le type ne réécrit pas les valeurs : elles s'affichent selon le nouveau type (une valeur qui n'y correspond pas s'affiche telle quelle).
- Un champ « choix » a sa propre liste de valeurs possibles (60 caractères au plus chacune, sans `|`, 50 au plus). Elle se règle par « Valeurs possibles… » dans le menu de son en-tête : un clic sur une valeur la renomme, sa pastille de couleur ouvre la palette du thème (bleu, vert, orange, rouge, gris, ou « Auto »), les flèches changent l'ordre, la corbeille la retire, et le champ du bas en ajoute une. Sans couleur choisie, une valeur prend celle de sa place dans la liste (bleu, vert, orange, rouge, gris, puis on recommence). Renommer une valeur la renomme dans toutes les lignes ; la retirer vide la cellule des lignes qui l'avaient.
- Un champ qui devient « choix » prend pour liste les valeurs déjà écrites dans ses lignes, dans l'ordre des lignes.
- Les états proposés viennent du thème (`[database]`, `states` : nom et couleur), dans l'ordre de la liste, avec par défaut « À faire » (gris), « En cours » (accent), « En attente » (alerte) et « Fait » (succès). Ils se règlent dans l'écran du thème, rubrique « Bases de données ».

## Largeur des colonnes

Le bord droit d'un en-tête se tire pour régler la largeur de sa colonne (60 à 800 pixels) ; un double-clic sur ce bord lui rend sa largeur par défaut. Sans largeur réglée, une colonne de champ a une largeur par défaut selon son type (case étroite, texte et courriel plus larges), et la colonne « Page » prend la place qui reste : un titre trop long y revient à la ligne, il ne pousse pas les autres colonnes hors de la vue (une valeur trop longue d'un champ reste rognée). La largeur est gardée dans l'en-tête de la base et suivie par le téléphone.

## Valeurs

Un clic dans une cellule la modifie : l'état se choisit dans sa liste (« Aucun » le retire), un choix aussi, dans une liste où l'on tape pour filtrer (sans tenir compte des accents) : une valeur tapée qui n'y est pas se crée et s'ajoute à la fin de la liste du champ ; la case se coche d'un clic, le reste se tape (`Entrée` valide, `Échap` abandonne). Un nombre accepte la virgule (`3,5`) ; une adresse de courriel doit en avoir la forme. Une valeur vide se retire.

## Tri

Un clic sur l'en-tête d'une colonne trie : croissant, puis décroissant, puis plus de tri. Une flèche montre la colonne triée. Le tri est gardé dans l'en-tête de la base, sur le PC comme sur le téléphone. Une valeur vide va toujours à la fin ; un état suit l'ordre de la liste du thème, un choix celui de la liste du champ (une valeur hors liste après) ; une case cochée vient avant une case vide (en croissant). Sans tri, les lignes suivent l'ordre des sous-pages. Les sous-lignes se trient entre elles, sous leur ligne.

## Dans les fichiers

- La page de la base : `mode: base` et sa configuration dans son en-tête.

```yaml
mode: base
base:
  fields:
    - {name: État, type: state}
    - {name: Priorité, type: number}
    - {name: Type, type: select, options: [{name: Code, color: success}, {name: Autre}]}
  sort:
    field: Priorité
    order: desc
  widths:
    Page: 240
    État: 120
  collapsed:
    - 0199a0b0-0000-7000-8000-000000000004
  view: list
```

  Types écrits : `text`, `state`, `select`, `checkbox`, `number`, `email`. Un champ `select` a ses valeurs possibles sous `options`, dans l'ordre, chacune avec son nom et, si elle a été choisie, sa couleur (`accent`, `success`, `warning`, `error`, `muted`) ; une valeur en double ou mal formée est ignorée, une couleur inconnue aussi. Un champ mal formé ou en double est ignoré à la lecture, comme une largeur hors bornes ou d'une colonne inconnue. `view: list` (absent : tableau) montre la base en liste. `collapsed` liste les identifiants des lignes repliées : un identifiant ne change pas quand la page est renommée ou déplacée.
- Une ligne : ses valeurs dans l'en-tête de la sous-page, sous `props`, en texte (`true` pour une case cochée, un nombre avec un point).

```yaml
props:
  État: En cours
  Priorité: "2.5"
```

- Le corps de la page de la base contient aussi le tableau de l'état du moment, en Markdown ordinaire, pour qu'elle se lise sans l'application : première colonne « Page » faite de mentions (`[Titre](notes://uuid)`), une colonne par champ, case cochée en ✓, nombre à la française. Une sous-ligne suit sa ligne, son titre précédé de « ↳ » (un par niveau). L'application le refait après chaque changement, et à l'ouverture de la base sur le PC s'il ne dit plus vrai (une valeur changée sur le téléphone, une sous-page ajoutée). On le reconnaît à sa première cellule d'en-tête, « Page ». Absent, il s'ajoute à la fin de la page. Dans l'éditeur, il est caché : la vue de la base le remplace.

## Téléphone

La page d'une base montre le même tableau, défilant de côté, le titre d'une ligne revenant à la ligne, avec les sous-lignes décalées et repliables comme sur le PC (même repli, lu dans l'en-tête), et les largeurs réglées sur le PC. Le « + » au bout du titre d'une ligne lui crée une sous-ligne. Toucher un en-tête trie, toucher une cellule la modifie (feuille du bas : liste des états ou des choix, champ à taper), une case se coche d'un toucher. « Nouvelle ligne » crée une sous-page de la base. Chaque changement part sur le NAS sous le verrou de la sous-page, mêlé aux valeurs lues à ce moment, puis le tableau écrit dans la page de la base est refait. Sans NAS, la base se lit seulement. Le téléphone ne crée ni ne retire de champ, ne règle pas les valeurs possibles d'un choix (il choisit seulement dans la liste), et ne passe pas une page en base.
