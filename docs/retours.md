# Retours d'Eloi à traiter

Modifications demandées par Eloi, notées telles quelles, pas encore implémentées. Chacune se discute (questions ci-dessous) avant d'être codée, puis part au journal des décisions du README (§20) et sort de cette liste une fois livrée.

| Date | Demande | État |
|---|---|---|
| 2026-10-08 | Quand une page a des sous-pages, afficher un bloc en haut de la page qui les liste, comme sur Notion. | Fait (0.15.8) |
| 2026-10-08 | Modèle local qui déborde de la mémoire vidéo (réponse à la question 2 de J12) : abandonner l'appel et afficher un message, au lieu de passer à un modèle plus petit. Message à rédiger : dire quoi faire (fermer l'application qui occupe la carte, relancer). | Fait (0.12.6) |
| 2026-10-08 | Nouvelle icône du logiciel déposée dans `~/Téléchargements` : la reprendre à la place de la précédente (détourer si le fond est un faux damier, toutes les tailles de 16 à 1024 dans `apps/desktop/resources/icon/`, vérifier dans l'AppImage). | Fait (0.12.6) |
| 2026-10-09 | Abandon de LiteLLM ; dans la fenêtre d'une fonction IA, pouvoir copier la consigne avec le texte pour un autre outil. | Fait (0.12.6) |
| 2026-10-08 | Le premier bloc d'une page devrait être un callout qui la présente : il sépare visuellement le titre de la page du premier titre `#` du contenu. | À faire |

## Questions à poser avant de coder

Callout de présentation en tête de page :

- Est-il créé d'office pour toute nouvelle page (vide, à remplir), proposé, ou seulement conseillé ?
- Quelle nature et quelle icône par défaut (« Info » 💡, ou l'icône de la page) ?
- Une page qui n'en a pas (pages existantes, notes importées) : on l'ajoute, on le propose, ou rien ?
- Se combine-t-il avec le bloc des sous-pages (lequel en premier) ? Et avec une page en mode liste, qui n'est qu'une liste ?
- Si le but est surtout la séparation visuelle, un espace ou un filet sous le titre de la page ne suffirait-il pas ? (Eloi n'aime pas les filets sous les titres : à confirmer.)
