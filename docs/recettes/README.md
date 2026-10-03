# Procédures de test

Ce dossier rassemble les recettes : ce qu'Eloi vérifie lui-même à la fin de chaque jalon. Chaque jalon livré a la sienne, `J<n>.md`, même quand les tests automatiques (décrits plus bas) couvrent déjà beaucoup : ils ne disent pas si le résultat convient à l'usage.

Un jalon ne passe à « Fait » dans le README qu'une fois sa recette rapportée OK et ses questions tranchées. Le jalon suivant ne commence pas avant.

## Contenu d'une recette

- Le critère de sortie du jalon, et ce qui est déjà vérifié automatiquement.
- Les vérifications, dans l'ordre : la manipulation et le résultat attendu.
- « Questions » : ce à quoi Eloi n'a pas encore répondu (choix faits pendant le jalon, points à confirmer). « Aucune » s'il n'y en a pas. Une question tranchée part au journal des décisions du README et disparaît de la recette.
- « À rapporter » : ce qu'il faut renvoyer.

## Recettes

| Fichier | Jalon | Ce qu'elle vérifie | État |
|---|---|---|---|
| [J5.md](J5.md) | Sync SMB | Deux machines pendant une journée sans perte ni écrasement : passage d'une page d'un poste à l'autre, verrous, conflit, hors ligne, fermeture | Validée le 2026-10-03, retouches comprises |
| [J6.md](J6.md) | Blocs riches | Page technique complète rédigée confortablement : code, tableaux, images, callouts | Validée, retouches faites (0.5.13 à 0.5.23) |

J0 à J4 ont été vérifiés avec Eloi au fil des séances : ils n'ont pas de recette.

## Avant une recette

1. Faire une copie du dossier des notes : `cp -a ~/Notes ~/Notes.avant-<jalon>`. Une recette touche à de vraies notes.
2. Construire la version à tester depuis la racine du dépôt :

   ```bash
   npm install
   npm run package
   ```

   L'AppImage est dans `apps/desktop/release/`. Sur une autre machine, copier ce seul fichier : il contient tout, client SMB compris.
3. Vérifier dans la barre de titre que la version affichée est celle qu'indique la recette.

Pour tester sur le poste de développement sans construire l'AppImage : `npm run dev`.

## Pendant la recette

Suivre les parties dans l'ordre. Chaque partie dit quoi faire et ce qui doit se passer. Si le résultat diffère, ne pas corriger à la main : noter l'heure, faire une capture, et passer à la suite si c'est possible.

Le mot de passe du NAS se tape toujours au clavier, dans l'application ou dans le terminal. Il ne doit apparaître dans aucun fichier, aucune capture, aucun message.

## Rapporter

Pour chaque partie : « OK », ou ce qui s'est passé (ce qui était affiché, capture de la barre de statut ou du détail de la sync, heure). Coller la sortie des commandes demandées telle quelle.

En cas de texte perdu, ne plus rien toucher : la copie `~/Notes.avant-<jalon>`, les fichiers `page.conflit-[date].md` et le contenu du NAS permettent de retrouver ce qui s'est passé.

## Test d'intégration sur le NAS

Plus complet que le bouton « Enregistrer et tester » des réglages : il crée des dossiers imbriqués, écrit, remplace, relit, renomme, liste, vérifie les erreurs attendues et que toutes les réponses du NAS sont chiffrées.

Une seule fois : copier `.env.example` en `.env` à la racine et y mettre l'adresse du NAS, le partage et l'utilisateur. Ce fichier n'est pas versionné, et le mot de passe n'y va pas.

```bash
npm run test:nas
```

Le mot de passe est demandé au clavier. Attendu : `ok` en dernière ligne, et aucun dossier `notes-test-*` laissé sur le NAS.

## Tests automatiques

Lancés par Claude avant de dire qu'un travail est fini. On peut les lancer soi-même depuis la racine du dépôt.

| Commande | Ce qu'elle vérifie | Durée |
|---|---|---|
| `npm run check` | Typage, lint, carte du code, tests Vitest (format des pages, aller-retour Markdown, sync simulée sans NAS, verrous) et tests Go du compagnon | Moins d'une minute |
| `npm run test:e2e` | Construit l'application et la pilote sur une copie du vault d'exemple : éditeur, blocs, blocs riches, thème, barre de statut. Tourne sur un écran virtuel (`xvfb-run`, paquet `xvfb`) : rien ne s'affiche, le poste reste utilisable | Environ une minute |
| `npx vitest run <chemin>` | Un seul fichier de test | Quelques secondes |

Ces tests ne remplacent pas une recette : ils ne parlent jamais au NAS réel et ne font tourner qu'une seule machine.
