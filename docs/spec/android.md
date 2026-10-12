# Application Android

Compagnon pour consulter et retoucher, pas un second éditeur complet. Construite avec Capacitor à partir de `packages/core`, `packages/document` et `packages/ui`, donc même format, même rendu, même thème que le desktop. Icône : la même que sur le PC. Pas de verrouillage par empreinte ou code à l'ouverture : le verrouillage du téléphone suffit.

## Consultation

- Écran d'accueil : l'arborescence des pages, repliable (pas de déplacement de pages). Au-dessus, les 10 pages modifiées le plus récemment sur le NAS, par le PC ou le téléphone, en cartes (icône, titre, page parente, « il y a 2 h ») qui défilent à l'horizontale ; jusqu'à la première réponse du NAS au lancement, des cartes d'attente tiennent la place, pour que rien ne bouge sous le doigt. La date est celle du fichier sur le NAS, relevée par la synchronisation.
- Recherche par titre, floue et insensible aux accents ; vide, elle montre les pages récentes.
- Lecture de toutes les pages avec le rendu complet : titres, code coloré, tableaux (défilement horizontal), images (visionneuse plein écran), callouts, mentions cliquables.
- Sommaire en fenêtre : chaque titre avec ses `#` en petit et en gris, et une taille qui suit son niveau.
- Tout cela fonctionne hors ligne sur le cache local. Une pastille donne l'état du NAS et la date de la dernière synchronisation.

## Cache

- Le cache garde le texte de toutes les pages, l'ordre et le thème, copiés à chaque synchronisation (ouverture, retour dans l'application, toutes les 30 s, en tirant l'accueil).
- Les images (et favicons) ne descendent que lorsqu'une page les affiche, et restent ensuite sur le téléphone. Une image jamais affichée n'est pas lisible hors ligne, mais sa place dans la page le dit (« Image pas encore copiée sur le téléphone »). Une image changée ou retirée sur le NAS est oubliée du cache au cycle suivant.
- Si le NAS ne montre plus aucun fichier alors que le cache en a (mauvais dossier, partage vide), rien n'est retiré du téléphone.
- Un refus du NAS (identifiants, partage, chiffrement) arrête les essais automatiques ; toucher la pastille d'état ou tirer l'accueil réessaie.
- Lancement : l'arborescence et le thème de la dernière fois s'affichent tout de suite (copie dans `arborescence.json`, hors du cache), le cache se relit derrière ; l'éditeur, la liste des emojis et les icônes Lucide ne se chargent qu'à leur premier usage (416 Ko de code au lancement).

## Modifications permises

| Action | Où |
|---|---|
| Enregistrer un mémo vocal ([memos](memos.md)) | Accueil |
| Cocher, décocher une tâche (ses sous-tâches suivent, à tous les niveaux) | Toutes les pages |
| Écrire, ajouter, supprimer, réordonner, décaler des tâches | Pages en mode liste |
| Écrire directement dans la page | Pages classiques |
| Couleur et icône d'un callout, icône de la page (emoji) | Toutes les pages |
| Créer une page (classique ou liste de tâches) | Tiroir |

Toute modification exige une connexion SMB directe au NAS au moment où elle est faite (déroulé en [sync](sync.md)). Deux exceptions : le mémo vocal et la création d'une page, qui attend sur le téléphone et part dès que le NAS répond. Il n'y a pas de file d'attente de modifications.

### Écriture sur le NAS

- Une modification s'affiche tout de suite, puis part sur le NAS en arrière-plan, dans l'ordre. Rien n'est gardé sur le téléphone : chaque écriture remplace sur le NAS le corps qu'elle a vu par le nouveau ; si le NAS a autre chose (page changée sur le PC) ou ne répond plus, elle est refusée, l'écran revient à la version du NAS avec un message, et les suivantes sont abandonnées.
- Chaque écriture passe par `core/sync/direct-write.ts` : NAS joignable (session ouverte ou rouverte), verrou de la page (refus si le PC l'édite : « « pc-fixe » modifie cette page en ce moment »), relecture de `page.md` sur le NAS, refus si la page a changé depuis son affichage (le cache prend la nouvelle version, il suffit de recommencer), opération de `packages/document` appliquée au corps, date `updated` changée, écriture, copie dans le cache, verrou retiré. Le téléphone tient le verrou sous son propre identifiant, tiré au hasard au premier lancement, et sous le nom « téléphone ».
- Le PC a priorité : quand on commence à écrire sur le téléphone, la page est relue sur le NAS sans faire attendre la frappe ; si le PC l'a changée depuis la dernière synchronisation, sa version s'affiche avant la première écriture. Une modification préparée sur l'ancienne version reste refusée.
- Sans NAS : bandeau « Le NAS ne répond pas : lecture seule. » en tête de page, cases et champs sans effet avec un message. Les contrôles ne sont grisés que lorsque le NAS est su injoignable ; avant la première synchronisation, on essaie. Un NAS qui ne répond plus au moment d'écrire : rien n'est modifié, message, pastille passée à « injoignable ».

### Page en mode liste, façon Keep

- Toucher le texte d'une tâche l'édite sur place (Markdown de ligne : `**gras**` reste du gras), Entrée l'enregistre et ouvre la tâche suivante juste en dessous, × la supprime, un texte vidé la supprime aussi. Le texte se centre sur la case quelle que soit la police du téléphone.
- L'enregistrement se fait en quittant la ligne (toucher ailleurs, Entrée) ; le verrou est tenu pendant la saisie et rendu 1,5 s après, ou après une minute sans frappe.
- Un appui long sur une tâche à faire la fait glisser : en hauteur parmi ses sœurs, sous-tâches comprises ; de côté, vers la droite pour la ranger sous la tâche du dessus, vers la gauche pour la remonter d'un niveau. Une tâche en saisie a aussi deux boutons, « Ranger sous la tâche du dessus » et « Remonter d'un niveau », autant de niveaux qu'on veut. Une ligne neuve se décale de la même façon avant d'être écrite, et la suivante se tape au même niveau.
- Les tâches cochées sont dans « Terminé », repliable ; elles et leurs sous-tâches ne glissent pas. Une liste vide, ou toute cochée, montre sa case : la toucher ouvre une tâche en tête. Les blocs posés sous une tâche s'affichent en lecture seule.

### Page classique

- Un éditeur TipTap avec le schéma et les raccourcis de saisie du PC (`- `, `# `, `[] `, `1. `), sans le menu `/`, la gestion des blocs ni la barre flottante ; seuls les blocs modifiés changent dans le fichier.
- Toucher le texte y met le curseur ; toucher sous le dernier bloc le met en fin de page. Une page vide montre « Écrire… » sous son titre.
- Barre au-dessus du clavier : texte, titre (1, 2, 3 en touchant de nouveau), puces, tâches, callout, « Markdown » ; à droite, à part, « Fermer le clavier ». Pas de gras ni d'italique (raccourcis `**` et `*`). « Markdown » ouvre le Markdown du bloc du curseur dans une feuille haute : vidé, le bloc est retiré ; une ligne vide le coupe en plusieurs.
- La page part sur le NAS 0,6 s après la dernière frappe et en quittant le texte ; le verrou est pris sans faire attendre la saisie, gardé tant que le curseur est dans la page, rendu 1,5 s après. Si le PC édite la page, elle repasse en lecture avec un message.
- Une case se coche d'un toucher sans ouvrir le clavier. Un lien ou une image s'ouvrent d'un toucher. Appui long : la sélection et le copier-coller d'Android.
- Callout : toucher son icône ouvre sa couleur (Info, Succès, Attention, Danger) et son icône, ou le retire, sans ouvrir le clavier.
- Icône de page : toucher l'icône, ou « Ajouter une icône » sous le chemin, ouvre le choix d'un emoji, cherché en français, ou « Retirer ». Pas d'image ni de détourage sur le téléphone.
- Une note `.md` venue d'un autre outil reste en lecture seule.

### Création d'une page

« + » en haut du tiroir (racine) et sur chaque page du tiroir (page enfant). Titre, puis « Page classique » ou « Liste de tâches » ; la page s'ouvre tout de suite et se crée sur le NAS en arrière-plan, avec les mêmes règles que sur le PC (nom du dossier, ordre du parent). Le NAS n'est interrogé que pour le parent, les noms pris et l'ordre ; les pages sœurs se lisent dans le cache.

Sans NAS, elle est gardée sur le téléphone (`pages-en-attente.json`, hors du cache), montrée dans le tiroir avec un nuage, et créée sur le NAS au début de la synchronisation suivante. Elle s'écrit tout de suite : ce qu'on y tape attend avec elle et part avec la page, sans conflit possible puisqu'elle n'existe pas encore sur le NAS. Si sa page parente a disparu entre-temps, elle va à la racine.

## Hors périmètre

Menu `/`, gestion des blocs au clavier, barre d'outils flottante, édition de tableaux, insertion d'images, renommage, déplacement et suppression de pages, corbeille, export, onglets, correction orthographique, IA, transcription des mémos, réglage du thème, synchronisation en arrière-plan, widget.

## Réseau

L'app connaît deux adresses du NAS : celle du réseau de la maison, essayée d'abord, et, si elle est réglée, son adresse Tailscale (nom MagicDNS ou IP `100.x`). L'adresse locale a 1,5 s pour répondre sur le port 445 ; sinon l'app passe à l'adresse Tailscale (4 s). Si aucune ne répond, la pastille dit « NAS injoignable, même par Tailscale : est-il activé ? ». Quand le réseau du téléphone change, la session est refaite par l'adresse qui répond. L'app ne pilote pas Tailscale, elle constate seulement que le NAS répond ou non. Le chiffrement SMB 3 reste imposé sur les deux chemins.

Hors de la maison, l'adresse locale peut désigner une autre machine d'un autre réseau. Pour ne pas lui envoyer les identifiants, l'app retient l'identité SMB du NAS (GUID de serveur, annoncé avant l'authentification) vue à l'adresse locale : une machine qui répond là avec une autre identité est ignorée et l'app passe à Tailscale. Seule la toute première connexion, faute d'identité connue, ne peut pas faire ce contrôle : la faire à la maison. Si le NAS est réinstallé, son identité change et l'adresse locale est ignorée jusqu'à un effacement des données de l'app.
