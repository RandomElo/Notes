# Notes

Éditeur de notes local-first, inspiré de Notion et AppFlowy, pour un usage personnel. Une application desktop Linux pour écrire, une petite application Android pour consulter et retoucher, une synchronisation SMB vers un NAS. Tout est stocké en Markdown, lisible et modifiable sans l'application.

Version 0.18.0. La roadmap est terminée.

## Pourquoi

Notion est lisible mais tout passe par le réseau, donc lent au quotidien. AppFlowy hébergé chez soi demande une stack trop lourde pour le NAS, et sa version en ligne différencie mal les niveaux de titre. Notes ouvre les pages instantanément (contenu sur disque), reprend le design d'AppFlowy et la gestion des blocs de Notion, corrige la hiérarchie typographique par un thème modifiable et se synchronise en SMB.

Hors périmètre : Windows, iOS, multi-utilisateur, publication de liens, Play Store.

## Ce que fait Notes

Sur le PC :

- Éditeur par blocs : titres, listes, tâches, code coloré, tableaux, images, callouts, mentions de pages et de sites, menu `/`, barre d'outils flottante, gestion des blocs au clavier.
- Arborescence de pages à profondeur illimitée, icônes (emoji, Lucide, image détourée), onglets, sommaire, corbeille avec sélection multiple.
- Synchronisation avec le NAS en SMB 3.1.1 signé et chiffré, verrous entre appareils, conflits mis de côté et résolus bloc par bloc.
- Mode liste de tâches façon Keep, sous-tâches sur plusieurs niveaux.
- Thème réglable (`.notes/theme.toml`), avec aperçu en direct.
- Export PDF, Markdown, HTML ou ZIP.
- Correction orthographique par LanguageTool en local.
- Fonctions IA en local (Ollama) : relecture, mise au propre de notes en vrac.
- Mémos vocaux transcrits par Whisper sur la carte graphique, puis mis en forme.

Sur le téléphone : lecture de toutes les pages hors ligne, écriture directe sur le NAS (pages classiques, listes de tâches, création de pages), enregistrement de mémos vocaux.

Les pages se cherchent avec la barre de recherche du poste (`../BarreRecherche`), qui les ouvre dans Notes.

## Installer

```bash
npm install
npm run installer           # construit l'AppImage et l'installe dans ~/Applications/Notes.AppImage
npm run android:installer   # construit l'APK et l'installe sur le téléphone branché (débogage USB)
```

Notes ouverte voit la nouvelle version et propose de relancer. Au premier lancement, elle demande le dossier des notes puis le NAS ; le mot de passe va dans le trousseau du système. LanguageTool s'installe d'un clic depuis les réglages. Pour l'IA, Ollama s'installe à part (script officiel) ; Notes choisit le modèle selon la carte graphique.

## Développer

| Commande | Effet |
|---|---|
| `npm run dev` | Desktop en développement, rechargement à chaud |
| `npm run check` | Typage, lint, carte du code, tests Vitest, tests Go |
| `npm run test:e2e` | Tests de bout en bout Playwright, sous écran virtuel |
| `npm run build` / `npm run package` | Application construite / AppImage |
| `npm run android:apk` | APK dans `apps/mobile/release/` |
| `npm run dev -w @notes/mobile` | Écrans Android dans un navigateur, sur le vault d'exemple |
| `npm run version:set -- X.Y.Z` | Change la version partout |

Monorepo npm : `packages/core` (fichiers, sync, verrous), `packages/document` (contenu d'une page, Markdown sans perte), `packages/ui` (rendu partagé), `apps/desktop` (Electron), `apps/mobile` (Capacitor), `apps/smb-companion` (client SMB en Go). Détail dans [docs/spec/architecture.md](docs/spec/architecture.md).

## Spécification

Un fichier par sujet, dans `docs/spec/` :

| Sujet | Fichier |
|---|---|
| Architecture, tests, essais Android | [architecture](docs/spec/architecture.md) |
| Format de stockage | [stockage](docs/spec/stockage.md) |
| Synchronisation SMB | [sync](docs/spec/sync.md) |
| Éditeur | [editeur](docs/spec/editeur.md) |
| Navigation et interface | [interface](docs/spec/interface.md) |
| Thème | [theme](docs/spec/theme.md) |
| Export | [export](docs/spec/export.md) |
| Corbeille | [corbeille](docs/spec/corbeille.md) |
| Correction orthographique | [correction](docs/spec/correction.md) |
| Fonctions IA | [ia](docs/spec/ia.md) |
| Mémos vocaux | [memos](docs/spec/memos.md) |
| Mode liste de tâches | [liste-de-taches](docs/spec/liste-de-taches.md) |
| Application Android | [android](docs/spec/android.md) |
| Sécurité et configuration | [securite](docs/spec/securite.md) |
| Packaging | [packaging](docs/spec/packaging.md) |

Raccourcis clavier : [docs/raccourcis.md](docs/raccourcis.md).

## Frise chronologique

Une ligne par version livrée, la plus récente en bas.

| Date | Version | Étape |
|---|---|---|
| 2026-10-01 | | Spécification réécrite, Windows retiré |
| 2026-10-01 | | Application Android spécifiée |
| 2026-10-01 | | POC SMB Android concluant |
| 2026-10-01 | | POC compagnon Go concluant |
| 2026-10-01 | | Chiffrement SMB imposé |
| 2026-10-01 | | Architecture et carte du code |
| 2026-10-01 | 0.1.0 | J0 : socle et connexion NAS |
| 2026-10-01 | 0.1.0 | Connexion validée sur le NAS |
| 2026-10-01 | 0.2.0 | J1 : stockage et arborescence |
| 2026-10-01 | 0.2.0 | Valeurs personnelles sorties du code |
| 2026-10-01 | 0.2.1 | Arborescence : états par le fond |
| 2026-10-01 | 0.2.1 | Barre de titre intégrée |
| 2026-10-02 | 0.3.0 | J2 : éditeur de base |
| 2026-10-02 | 0.3.1 | Souligné, listes, titres |
| 2026-10-02 | 0.3.2 | Hiérarchie des titres arrêtée |
| 2026-10-02 | 0.4.0 | J3 : blocs au clavier |
| 2026-10-02 | 0.4.1 | Retours sur les blocs |
| 2026-10-02 | 0.4.2 | Listes : sélection et déplacement |
| 2026-10-02 | 0.4.3 | Flèches : sélection ou déplacement |
| 2026-10-02 | 0.4.4 | Déplacement : Ctrl+Maj seul |
| 2026-10-02 | 0.5.0 | J4 : thème |
| 2026-10-02 | 0.5.1 | Thème réglable dans les réglages |
| 2026-10-02 | 0.5.2 | Thème : écran à part |
| 2026-10-03 | 0.5.3 | Éditeur de thème plus clair |
| 2026-10-03 | 0.5.4 | Pastilles de couleur |
| 2026-10-03 | 0.5.5 | Trait de titre, liste seule |
| 2026-10-03 | 0.5.6 | Palette Feux |
| 2026-10-03 | 0.5.7 | Cases à cocher alignées |
| 2026-10-03 | 0.5.8 | J5 : sync écrite, en recette |
| 2026-10-03 | 0.5.9 | J6 : blocs riches, en recette |
| 2026-10-03 | 0.5.10 | Sync plus rapide, verrou rendu |
| 2026-10-03 | 0.5.11 | Sync : réseau, forçage, délais |
| 2026-10-03 | 0.5.12 | Écran de résolution des conflits |
| 2026-10-03 | 0.5.13 | Arborescence : Ctrl+N, Échap |
| 2026-10-03 | 0.5.14 | Code : langages, couleurs Dark+ |
| 2026-10-03 | 0.5.15 | Poignée au survol, clic final |
| 2026-10-03 | 0.5.16 | Tableaux : poignées, menus |
| 2026-10-03 | 0.5.17 | Poignée du tableau alignée |
| 2026-10-03 | 0.5.18 | Marge gauche de la page élargie |
| 2026-10-03 | 0.5.19 | Surlignage retiré |
| 2026-10-03 | 0.5.20 | Images : tailles, lien collé |
| 2026-10-03 | 0.5.21 | Image redimensionnée par ses bords |
| 2026-10-03 | 0.5.22 | Barre du texte à la sélection |
| 2026-10-03 | 0.5.23 | Images converties en WebP |
| 2026-10-03 | 0.6.0 | J5 : sync validée |
| 2026-10-03 | 0.7.0 | J6 : blocs riches validés |
| 2026-10-04 | 0.7.1 | J7 : navigation, en recette |
| 2026-10-04 | 0.7.2 | Recherche globale seule |
| 2026-10-04 | 0.7.3 | Recherche globale instantanée |
| 2026-10-04 | 0.7.4 | Sync continue fenêtre fermée |
| 2026-10-04 | 0.7.5 | Sommaire : hauteur limitée |
| 2026-10-04 | 0.7.6 | Mise à jour automatique locale |
| 2026-10-04 | 0.7.7 | Dégradé du sommaire ajusté |
| 2026-10-04 | 0.8.0 | J7 : navigation validée |
| 2026-10-04 | 0.8.1 | J8 : liens et icônes, en recette |
| 2026-10-04 | 0.8.2 | Mentions de site, retouches J8 |
| 2026-10-04 | 0.8.3 | Haut de page, boutons d'icône |
| 2026-10-04 | 0.8.4 | « Ajouter une icône » centré |
| 2026-10-04 | 0.9.0 | J8 : liens et icônes validés |
| 2026-10-04 | 0.9.1 | J9 : export, en recette |
| 2026-10-04 | 0.9.2 | Export : papier, ZIP en HTML |
| 2026-10-04 | 0.9.3 | Exporter retiré du menu |
| 2026-10-04 | 0.9.4 | Fenêtre d'export simplifiée |
| 2026-10-04 | 0.9.5 | Listes de l'export restylées |
| 2026-10-04 | 0.9.6 | PDF : fond, sommaire, ouverture |
| 2026-10-04 | 0.9.7 | PDF : cases des tâches |
| 2026-10-04 | 0.10.0 | J9 : export validé |
| 2026-10-04 | 0.10.1 | J10 : corbeille, en recette |
| 2026-10-04 | 0.10.2 | Corbeille : confirmation, place d'origine |
| 2026-10-04 | 0.11.0 | J10 : corbeille validée |
| 2026-10-04 | 0.11.1 | J11 : correction, en recette |
| 2026-10-05 | 0.11.2 | Liste des fautes de la page |
| 2026-10-05 | 0.11.3 | LanguageTool avec la session |
| 2026-10-05 | 0.11.4 | Mises à jour de LanguageTool |
| 2026-10-05 | 0.12.0 | J11 : correction validée |
| 2026-10-05 | 0.12.1 | J12 : IA, en recette |
| 2026-10-07 | 0.12.2 | IA : carte, LiteLLM |
| 2026-10-08 | 0.12.3 | J13 : mémos, en recette |
| 2026-10-08 | 0.12.4 | J14 : mode liste, en recette |
| 2026-10-08 | 0.12.5 | Retours J13, J14, icône |
| 2026-10-09 | 0.12.6 | LiteLLM retiré, consigne copiable |
| 2026-10-09 | 0.12.7 | Menu ⋮, « Copier le prompt » |
| 2026-10-09 | 0.13.0 | J12 : fonctions IA validées |
| 2026-10-09 | 0.14.0 | J13 : mémos vocaux validés |
| 2026-10-09 | 0.14.1 | Sommaire, liste vide, Sans titre |
| 2026-10-10 | 0.15.0 | J14 : mode liste validé |
| 2026-10-10 | 0.15.1 | J15 : Android, en recette |
| 2026-10-10 | 0.15.2 | Android : deux adresses, démarrage |
| 2026-10-10 | 0.15.3 | Android : image pas encore copiée |
| 2026-10-10 | 0.15.4 | J16 : modification légère, en recette |
| 2026-10-10 | 0.15.5 | Android : éditeur de bloc, sans attente |
| 2026-10-10 | 0.15.6 | Android : édition directe des pages |
| 2026-10-11 | 0.15.7 | Android : accueil, callout, lancement |
| 2026-10-11 | 0.15.8 | Sous-pages, tâches imbriquées |
| 2026-10-11 | 0.15.9 | Sous-tâches cochées avec leur tâche |
| 2026-10-11 | 0.16.0 | J15 : Android, consultation validée |
| 2026-10-11 | 0.17.0 | J16 : modification légère validée |
| 2026-10-11 | 0.17.1 | J17 : mémos du téléphone, en recette |
| 2026-10-11 | 0.17.2 | Retours J16 et J17 du téléphone |
| 2026-10-11 | 0.17.3 | Temps restant des transcriptions |
| 2026-10-12 | 0.17.4 | Mise au propre par sections |
| 2026-10-12 | 0.17.5 | Fermer quitte, `--page` |
| 2026-10-12 | 0.18.0 | J16 et J17 validés, documentation simplifiée |
| 2026-10-12 | 0.18.1 | Tableaux, dépôt de .md, IA sur sélection |
| 2026-10-12 | 0.18.2 | Icône du sommaire retirée |
| 2026-10-12 | 0.18.3 | LanguageTool selon le poste |
| 2026-10-12 | 0.18.4 | LanguageTool sur un bon PC |
