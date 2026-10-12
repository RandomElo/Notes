# Mode liste de tâches

Un mode dédié par page, façon Google Keep, distinct des cases à cocher normales. C'est aussi l'usage principal de l'application Android.

Les cases à cocher classiques ([editeur](editeur.md)) restent un bloc parmi d'autres, inséré via `/tache` ou `[] `, mélangé librement avec du texte et des titres. Leur comportement ne change pas.

Le mode liste s'active page par page, par « Passer en liste de tâches » dans le menu « ⋮ » du haut de la page ou par le menu `/`, ce qui écrit `mode: todo` dans le front-matter. Une page en liste n'est qu'une liste, comme une note Keep :

- Une seule liste de tâches par page, sans titres. Activer le mode convertit la page : paragraphes, titres et items de puces ou numérotés (sous-items compris) deviennent des tâches ; un autre bloc (code, tableau, image, callout) passe sous la tâche qui le précède, ou sous une tâche vide s'il est en tête. Une étape d'annulation. Le curseur est aussitôt dans une tâche vide, prête à écrire.
- Pas de champ d'ajout : tout ce qu'on écrit devient une tâche. Une page en liste encore vide montre sa case, avec l'invite « Nouvelle tâche » ; elle ne va dans le fichier qu'une fois quelque chose écrit. `Entrée` en fin de tâche crée la suivante ; `Entrée` sur une tâche vide ne fait rien. Un clic sous la liste ouvre une tâche vide juste avant « Terminé ». Une tâche laissée vide disparaît quand on la quitte. La tâche vide du curseur montre l'invite « Nouvelle tâche ».
- La règle est rétablie à chaque modification : un titre tapé (`#`, barre d'outils) redevient du texte, un paragraphe rejoint la liste, le curseur reste où il était.
- Sous une tâche, des blocs plus riches sont possibles : dans le menu `/` d'une page en liste, code, tableau, image, callout et « Texte sous la tâche » se rangent sous la tâche du curseur (sous la tâche d'avant si on vient de faire `Entrée`). Le menu n'y propose ni titres ni listes. `Tab` fait toujours une sous-tâche.
- Les tâches cochées passent en style barré et atténué, et descendent dans une section « Terminé » repliable en bas de la liste, dans le fichier aussi : la section est la suite de tâches cochées qui termine la liste. Cochée, une tâche y va en tête avec ses sous-tâches ; décochée, elle remonte après les tâches à faire. Une sous-tâche cochée ne bouge pas. Le titre « Terminé (n) » et son repli ne sont que de l'affichage ; le repli est retenu page par page sur le poste.
- Une page modifiée ailleurs (autre éditeur, téléphone) s'affiche telle qu'elle est, et n'est remise en ordre qu'à la modification suivante.
- Le mode se désactive à tout moment, par l'icône ou « Quitter le mode liste » du menu `/` : la page redevient un éditeur classique, les tâches restent des cases à cocher normales, dans leur état et leur ordre.
- Les opérations (convertir, ranger, cocher, ajouter, retirer les tâches vides) sont dans `packages/document/src/operations/`, pour que le téléphone fasse pareil.

Le stockage reste du Markdown standard (`- [ ]` et `- [x]`). Le flag `mode: todo` ne change que le comportement d'édition, pas le format de fichier : une page en mode liste reste lisible et éditable telle quelle hors de l'application.


