# Base sans pages

Une base de données (voir [base de données](base-de-donnees.md)) dont les lignes n'ont pas de page : elles vivent dans le tableau écrit dans la page de la base. Utile quand une ligne n'a besoin que d'un titre et de quelques valeurs.

## Choisir le mode

- « Passer en base de données » demande d'abord : « Une page par ligne » (les sous-pages deviennent les lignes) ou « Lignes sans page ». Dans le second cas, les sous-pages déjà là restent des pages.
- Le menu « ⋮ » d'une base propose « Paramètres de la base » : le mode des lignes, et les colonnes (nom, type, valeurs possibles d'un choix, ordre, retrait, ajout).
- Changer de mode dans les paramètres montre d'abord ce qui va se passer, puis « Convertir » le fait.

## Passer sans pages

- Une sous-page dont le texte tient dans une cellule devient une ligne : texte vide, ou un seul paragraphe de 500 caractères au plus, sans lien, mention, image ni saut de ligne (le gras et l'italique sont perdus). Son texte va dans la colonne « Description » (texte), ajoutée si elle n'existe pas ; si une colonne « Description » existe avec un autre type, la colonne s'appelle « Description 2 ». Ses valeurs suivent.
- Une ligne ne passe que si toutes ses sous-lignes passent aussi. Les autres restent des pages, sous la base ; la fenêtre les nomme avant de convertir, et la base les montre sous son tableau, à ouvrir d'un clic.
- Les sous-pages converties partent à la corbeille (restaurables 30 jours).

## Revenir à une page par ligne

Chaque ligne devient une sous-page, à sa place, avec ses valeurs ; sa Description devient le texte de la page, et la colonne « Description » est retirée. Si la conversion s'arrête en route, les pages déjà créées restent et la base reste sans pages.

## Ce qui change dans la base

- Le titre d'une ligne se modifie d'un clic, comme une valeur. La corbeille d'une ligne la retire avec ses sous-lignes, sans confirmation : il n'y a pas de page à mettre à la corbeille, mais un avis « Ligne retirée » propose « Annuler » (ou `Ctrl+Z` hors d'un champ de saisie) jusqu'au changement suivant.
- Retirer une colonne efface ses valeurs (elles n'ont pas d'autre place que le tableau) : l'application le demande avant. Changer le type d'une colonne réécrit ses valeurs sous la forme du nouveau type ; une valeur qui n'y correspond pas (« oui » dans une case) se perd.
- Le tri ne change que l'affichage : le tableau de la page garde l'ordre des lignes.
- Une ligne repliée est notée par le chemin de ses titres (« Ligne / Sous-ligne ») : renommer la ligne la déplie.

## Dans les fichiers

- La configuration de la base porte `rows: table`.

```yaml
base:
  fields:
    - {name: État, type: state}
  collapsed:
    - Claude / Notes
  rows: table
```

- Le tableau de la page est la seule source des lignes : première colonne « Page » faite des titres en texte (pas de mention), une sous-ligne précédée de « ↳ » par niveau, une colonne par champ, case cochée en ✓, nombre à la française. On peut le modifier sans l'application ; une colonne est reconnue par le nom de son en-tête.

## Téléphone

Comme sur le PC : toucher le titre d'une ligne le renomme ou la retire, « + » ajoute une sous-ligne, « Nouvelle ligne » une ligne, et une cellule se modifie comme ailleurs. Chaque changement part sur le NAS sous le verrou de la page de la base, appliqué au tableau lu à ce moment ; si la ligne a bougé entre-temps (renommée ou déplacée ailleurs), rien n'est écrit et l'écran reprend la version du NAS. Le téléphone ne change pas le mode d'une base.
