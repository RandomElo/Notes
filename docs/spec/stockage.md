# Format de stockage

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

## Nommage

Nom de dossier = titre assaini (caractères refusés par SMB remplacés : `\ / : * ? " < > |`, 100 caractères max). L'identifiant réel vit dans le front-matter, pas dans le nom.

## Front-matter YAML

| Champ | Contenu |
|---|---|
| `id` | UUID v7 |
| `title` | Titre de la page |
| `icon` | Emoji (`📚`), nom d'icône Lucide en kebab-case (`book-open`) ou image du dossier `assets/` de la page (`assets/icone.webp`) |
| `created`, `updated` | Dates ISO |
| `mode` | Optionnel, `todo` pour le mode liste de tâches ([liste-de-taches](liste-de-taches.md)) |
| `theme_overrides` | Optionnel, surcharges de couleurs ([theme](theme.md)) |
| `table_widths` | Optionnel, largeur des colonnes des tableaux : une liste par tableau, dans l'ordre de la page, en pourcentages entiers (`- [30, 70]`) ; une liste vide laisse les colonnes égales ([editeur](editeur.md)) |

## Corps

Markdown standard : titres, gras, italique, barré, code, listes, tâches `- [ ]` et `- [x]`, tableaux GFM, code fencé, images.

- Souligné : Markdown n'a pas de syntaxe pour lui, il s'écrit `<u>texte</u>`. C'est la seule balise HTML que l'application reconnaît.

- Blocs avancés sans équivalent Markdown : bloc code fencé `notes-callout` contenant du YAML (type, icône, texte). Reste lisible dans n'importe quel éditeur.
- Liens internes : syntaxe Markdown standard avec cible `notes://uuid` (`[Projets](notes://0199…)`), résolue en titre courant à l'affichage. À l'export Markdown, elle devient le titre de la page en texte simple ; dans une archive en pages web, un lien vers la page si elle est dans l'archive ([export](export.md)). Lien cassé affiché barré. Quand une page est renommée, le texte de ses mentions est réécrit dans les pages qui la citent, seulement dans les blocs concernés. Un lien interne dont le texte est mis en forme (`[*x*](notes://…)`) reste un lien ordinaire, que le renommage ne touche pas.
- Liens externes : label nettoyé si identique à l'URL (`https://www.google.com/` devient `google.com`).
- Couleurs de texte : non supportées en v1 (pas de syntaxe Markdown propre ; couvert par thème et callouts).
- Ordre manuel : fichier `.order` (liste d'UUID) dans chaque dossier qui a des enfants.

## Import de `.md` externes

Détectés et marqués « non importés ». La normalisation (titre, UUID, front-matter) ne se fait que sur demande explicite. Jamais de réécriture silencieuse.

Trois cas, tous affichés en italique dans l'arborescence :

- un fichier `Titre.md` posé dans le vault : l'import crée le dossier `Titre/` et y place le fichier sous le nom `page.md`, avec un front-matter ajouté ;
- un dossier dont le `page.md` n'a pas de front-matter valide : l'import complète le front-matter, en gardant le titre, la date et les clés déjà présentes ;
- un dossier sans `page.md` mais qui contient des notes : l'import y crée une page vide à son nom.

Le texte du fichier n'est jamais modifié. Un élément s'importe après son dossier parent. Les fichiers dont le nom serait refusé par SMB (`:`, `?`, `*`...) ne sont pas affichés : ils ne pourraient pas être synchronisés.

## Vault local

Le dossier du vault sur le poste se choisit au premier lancement (`~/Notes` proposé) et se retient dans les réglages locaux. Il doit être réservé aux notes : la racine du disque et le dossier personnel sont refusés. L'application surveille ce dossier et met l'arborescence à jour quand un autre outil y change quelque chose.

## Ordre d'affichage

Les pages listées dans `.order` viennent d'abord, dans cet ordre. Le reste suit par titre, à la française (accents ignorés, « Page 2 » avant « Page 10 »). Dès qu'on déplace une page à la main, le `.order` du dossier est écrit avec toutes ses pages.

## Écriture

Une page ouverte puis enregistrée sans modification ne change pas d'un octet. Quand l'application modifie le front-matter, elle ne touche qu'aux clés concernées : clés inconnues, commentaires et ordre des clés sont conservés. Toute écriture passe par un fichier temporaire puis un renommage, pour qu'une coupure ne laisse jamais un fichier à moitié écrit.

Le corps suit la même règle, bloc par bloc. À la lecture, chaque bloc de premier niveau (un paragraphe, un titre, une liste entière, un bloc de code) garde son texte d'origine et ce qui le sépare du suivant. À l'enregistrement, un bloc qui n'a pas changé ressort avec ce texte, même s'il a été écrit par un autre outil avec une autre syntaxe (`*` pour les puces, titres soulignés, fins de ligne Windows). Seuls les blocs créés ou modifiés sont écrits, dans la forme de l'application : puces en `-`, emphase en `*`, code entre clôtures, une ligne vide entre deux blocs. Avant d'écrire, l'application relit ce qu'elle a produit et vérifie qu'elle retrouve le même document. Sinon elle réécrit toute la page dans sa forme à elle.

Ce que Markdown ne sait pas écrire n'est pas enregistré : les paragraphes vides et les espaces en début de paragraphe.

Si le fichier a changé sur le disque depuis sa lecture (autre outil, sync) alors que la page est en cours de modification, sa version est d'abord gardée à côté, dans `page.conflit-[date].md`, puis la page est enregistrée. Sans modification en cours, la page ouverte est simplement rechargée.


