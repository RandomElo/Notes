# Retours d'Eloi à traiter

Modifications demandées par Eloi, notées telles quelles, pas encore implémentées. Chacune se discute (questions ci-dessous) avant d'être codée, puis part au journal des décisions du README (§20) et sort de cette liste une fois livrée.

| Date | Demande | État |
|---|---|---|
| 2026-10-08 | Quand une page a des sous-pages, afficher un bloc en haut de la page qui les liste, comme sur Notion. | À faire |
| 2026-10-08 | Modèle local qui déborde de la mémoire vidéo (réponse à la question 2 de J12) : abandonner l'appel et afficher un message, au lieu de passer à un modèle plus petit. Message à rédiger : dire quoi faire (fermer l'application qui occupe la carte, relancer). | À faire |
| 2026-10-08 | Nouvelle icône du logiciel déposée dans `~/Téléchargements` : la reprendre à la place de la précédente (détourer si le fond est un faux damier, toutes les tailles de 16 à 1024 dans `apps/desktop/resources/icon/`, vérifier dans l'AppImage). | À faire |
| 2026-10-08 | Le premier bloc d'une page devrait être un callout qui la présente : il sépare visuellement le titre de la page du premier titre `#` du contenu. | À faire |

## Questions à poser avant de coder

Bloc des sous-pages :

- Le bloc est-il seulement affiché (calculé depuis l'arborescence, rien dans le fichier), ou écrit dans `page.md` ? S'il est écrit, il faut une syntaxe lisible hors de l'application (règle 5).
- Que montre chaque ligne : icône et titre seulement, ou aussi un extrait, une date ?
- Ordre : celui de l'arborescence (`.order`) ?
- Le bloc se replie-t-il ? Peut-on le masquer page par page ?
- Peut-on y créer une sous-page, ou réordonner les sous-pages par glisser-déposer ?
- Sur la page « Mémos vocaux », dont les sous-pages sont les mémos transcrits, faut-il aussi ce bloc ?
- À l'export (PDF, HTML, ZIP), le bloc apparaît-il ?
- Sur Notion, une sous-page est un bloc à l'endroit où on l'a créée, pas une liste en haut. Eloi veut bien une liste en haut de page ?

Callout de présentation en tête de page :

- Est-il créé d'office pour toute nouvelle page (vide, à remplir), proposé, ou seulement conseillé ?
- Quelle nature et quelle icône par défaut (« Info » 💡, ou l'icône de la page) ?
- Une page qui n'en a pas (pages existantes, notes importées) : on l'ajoute, on le propose, ou rien ?
- Se combine-t-il avec le bloc des sous-pages (lequel en premier) ? Et avec une page en mode liste, qui n'est qu'une liste ?
- Si le but est surtout la séparation visuelle, un espace ou un filet sous le titre de la page ne suffirait-il pas ? (Eloi n'aime pas les filets sous les titres : à confirmer.)
