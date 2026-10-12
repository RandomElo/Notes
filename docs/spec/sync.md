# Synchronisation SMB

Le vault local est la source de travail. Client SMB intégré, pas de montage système. Le moteur de sync est dans `packages/core` et sert aux deux applications, avec un comportement différent selon l'appareil.

| | Desktop | Android |
|---|---|---|
| Copie locale | Vault complet | Cache des pages (texte complet, assets à la demande) |
| Sens | Bidirectionnel | Descendant, plus écriture directe à chaque modification |
| Déclenchement | Toutes les 5 s, une seconde après chaque modification du dossier des notes, au démarrage, à la fermeture | À l'ouverture, au retour au premier plan, au tirer pour rafraîchir, toutes les 30 s au premier plan |
| Édition hors ligne | Oui, poussée au cycle suivant | Non |

## Cycle

Lister l'état distant, comparer à l'index local (chemin, mtime, hash), calculer le delta (push, pull, suppression), transférer, mettre à jour l'index, rafraîchir l'UI. Cycle sauté si rien n'a changé.

Règles précises :

- L'index retient, pour chaque fichier, sa date et sa taille des deux côtés au dernier passage, et l'empreinte SHA-256 du contenu. Un fichier n'a changé d'un côté que si sa date ou sa taille diffère ; si seul l'horodatage a bougé (contenu identique), rien n'est transféré.
- Modifié d'un seul côté : il part de l'autre. Supprimé d'un côté et inchangé de l'autre : supprimé de l'autre. Supprimé d'un côté mais modifié de l'autre : la version modifiée revient. Modifié des deux côtés : les contenus sont comparés, et s'ils diffèrent, c'est un conflit (filet de sécurité ci-dessous).
- Juste avant chaque transfert ou suppression, le fichier est revérifié des deux côtés : s'il a bougé depuis le relevé (frappe en cours), il est laissé au cycle suivant.
- Garde-fou : si un des deux côtés n'a plus aucun fichier alors que l'index en connaît (disque démonté, dossier du NAS vidé, mauvais réglage), l'index est ignoré et les deux côtés sont fusionnés sans rien supprimer.
- Le NAS ne distingue pas les majuscules des minuscules. Un changement de casse (« courses » devenu « Courses ») est appliqué par un renommage, jamais par une suppression suivie d'un envoi. Deux noms qui ne diffèrent que par la casse sont laissés de côté et signalés.
- Ne sont jamais transportés : les verrous `.lock`, les fichiers temporaires d'une écriture en cours (`.nom.xxxx.tmp`), la corbeille `.trash/` du NAS, et les fichiers du poste dont le nom serait refusé par SMB (signalés dans le détail de la sync).
- Toute écriture sur le NAS passe par un fichier temporaire du même dossier, renommé ensuite : l'autre appareil ne lit jamais un fichier à moitié écrit.
- Une erreur réseau arrête le cycle, l'index garde ce qui a été fait. Des identifiants refusés arrêtent les essais automatiques jusqu'à la prochaine modification des réglages, pour ne pas faire verrouiller le compte par le NAS.

## Verrou distant par page

Fichier `.lock` (holder, pid, heartbeat) dans le dossier de la page sur le NAS. Les `.lock` ne sont jamais copiés dans le vault local.

| Situation | Comportement |
|---|---|
| Pas de verrou | Ouverture en écriture |
| Verrou de cet appareil | Reprise normale |
| Verrou d'un autre appareil, heartbeat < 90 s | Lecture seule ; bouton « Forcer l'édition » sur desktop uniquement |
| Verrou périmé (> 90 s) | Reprise automatique |

Le `.lock` est un petit JSON : identifiant de l'appareil (tiré au hasard à l'installation et gardé dans les réglages locaux), nom de la machine, pid, heartbeat en date ISO. Un verrou illisible compte comme périmé. Le heartbeat est rafraîchi à chaque cycle.

Le desktop ne garde le verrou que pendant l'édition active : posé à la première frappe, relâché une fois la page poussée sur le NAS, dès qu'on quitte la page ou après 10 s sans frappe. Quitter la page lance un cycle tout de suite. L'autre appareil le voit à son cycle suivant, 10 s au plus. Sans cette règle, une liste de courses laissée ouverte dans un onglet à la maison resterait verrouillée et le téléphone ne pourrait rien cocher. Une page ouverte mais inactive est rechargée si le cycle détecte une version distante plus récente.

## Écriture depuis Android

Le téléphone n'écrit jamais dans son cache en attendant mieux. Chaque modification suit ce déroulé :

1. Vérifier que le NAS est joignable, sinon refuser avec un message clair.
2. Lire le verrou : s'il est tenu par un autre appareil et vivant, refuser.
3. Poser le verrou, relire `page.md` sur le NAS, appliquer l'opération sur cette version fraîche.
4. Écrire sur le NAS, mettre à jour le cache, retirer le verrou.

Pour une retouche de texte, le verrou est tenu avec heartbeat le temps de la saisie. Conséquence voulue : le téléphone ne peut pas créer de conflit, puisqu'il n'a jamais de modification en attente.

## Filet de sécurité

En cas de divergence détectée, la version distante est sauvegardée en `page.conflit-[date].md`. Jamais d'écrasement silencieux.

Sur le desktop, l'enregistrement d'une page et les écritures de la sync dans le dossier des notes passent par une même file d'attente : la sync vérifie que le fichier n'a pas bougé depuis son relevé et l'écrit sans qu'un enregistrement puisse tomber entre les deux. Une page qui passe en lecture seule (verrou forcé par l'autre appareil) enregistre d'abord sa dernière frappe.

La sauvegarde est posée à côté du fichier sur le poste, puis la version du poste part sur le NAS, sauvegarde comprise : au cycle suivant, l'autre appareil a les deux versions. La même règle vaut pour tout fichier synchronisé (`.order.conflit-[date]`, `theme.conflit-[date].toml`). Les sauvegardes présentes dans le dossier des notes sont listées dans le détail de la sync, avec un bouton qui les montre dans le gestionnaire de fichiers.

## Résolution d'un conflit

Une page qui a une version mise de côté l'annonce par un bandeau en tête de page. Son bouton « Résoudre », comme celui du détail de la sync, ouvre l'écran de résolution à la place de la page. La page (A) et la version mise de côté (B) y sont comparées bloc par bloc, dans la typographie de la page :

- bloc identique : affiché tel quel ;
- bloc présent d'un seul côté : « Garder » ou « Retirer » ;
- bloc entièrement différent : « Garder A », « Garder B » ou « Les deux », B placé après A ;
- paragraphe ou titre dont seul un passage diffère : les deux passages dans le texte, B après A, chacun avec une poignée pour le placer entre deux autres mots et un × pour le retirer. Les passages vont d'une ponctuation à l'autre (« 18 km, » face à « 20 km, »), au mot près s'il n'y en a pas.

Chaque version de bloc a aussi une poignée pour la poser ailleurs dans la page (glisser, ou `Ctrl+Shift+↑/↓`). La version restée en place est alors gardée d'office, sauf si elle avait été écartée. « Tout A » et « Tout B » règlent tout d'un côté, « Aperçu » montre la page qui sortira. « Valider » reste grisé tant qu'une différence n'est pas réglée. Il prend le verrou de la page (refusé si un autre appareil l'édite), enregistre la page, puis supprime la version mise de côté ; si la page a changé entre-temps, sa version du disque est gardée à son tour. « Retour » revient à la page sans rien changer. Pris en entier d'un côté, le résultat est ce fichier à l'octet près ; sinon chaque bloc garde son Markdown d'origine, séparé du suivant par une ligne vide.

## Hors ligne

Le desktop continue de fonctionner sur le vault local. Indicateur d'état dans la barre de statut : synchronisé, en cours, en attente, injoignable, conflit, plus « désactivée » tant que le NAS ou le mot de passe ne sont pas réglés. Injoignable, la barre dit depuis quand : « NAS injoignable depuis 19:02 », heure du premier échec. Le desktop surveille la connexion du poste (une fois par seconde) : câble débranché ou wifi coupé, le cycle en cours est abandonné et le NAS montré injoignable tout de suite ; au retour du réseau, un cycle part. Un clic ouvre le détail : dernière synchronisation, sauvegardes de conflit, fichiers en souffrance, bouton « Synchroniser ». Sur Android, la consultation continue sur le cache et les contrôles de modification sont désactivés.

## Point de vigilance

Le NAS parle SMB 3, c'est la version visée, avec chiffrement du transport. Les libs SMB en JavaScript pur (`@marsaud/smb2` et dérivées) s'arrêtent à SMB 2.0.2 sans chiffrement : elles sont écartées. Côté desktop, le client SMB est embarqué dans l'application : l'AppImage contient tout ce qu'il faut et ne dépend d'aucun paquet du système. Le `smbclient` installé sur le poste est donc écarté lui aussi. La forme retenue est un binaire compagnon lié statiquement, livré dans l'AppImage, qui parle SMB 3 et que le main pilote par messages JSON sur son entrée et sa sortie standard. Il garde la session ouverte, ce qui évite de repayer connexion et authentification à chaque opération.

Il est écrit en Go avec la lib `go-smb2` (Go pur), ce qui donne un exécutable unique d'environ 5 Mo sans aucune dépendance. Validé par un POC sur le NAS réel : SMB 3.1.1 imposé, signature exigée, chiffrement imposé, et environ une milliseconde par opération une fois la session ouverte.

Le NAS est réglé sur « chiffrement défini par le client » : c'est au client de le demander. `go-smb2` ne sait pas le faire d'origine, il ne chiffre que si le serveur l'exige. Le projet embarque donc une copie de la lib avec un correctif d'une dizaine de lignes qui impose le chiffrement et refuse la connexion s'il n'est pas négocié. Vérifié sur le NAS : sans le correctif, aucune réponse chiffrée ; avec, toutes le sont, sans surcoût mesurable. Le correctif est à reporter à chaque mise à jour de la lib.

Un module natif Node lié à `libsmbclient` est écarté : il faudrait embarquer toute la chaîne de bibliothèques Samba et le recompiler à chaque version d'Electron. Dans tous les cas, le client reste derrière l'interface `RemoteFs`, donc remplaçable sans toucher à la sync.

Côté Android, `smbj` gère SMB 3 chiffré, vérifié sur le téléphone avec le NAS réel.

Le compte du NAS a la double authentification activée, mais elle ne s'applique pas à SMB : la connexion se fait par identifiant et mot de passe seulement, vérifié avec le compte réel. La 2FA dépend du mode d'accès au NAS (elle a dû être gérée pour l'outil de sauvegarde, qui passe par un autre accès), pas du compte lui-même. Rien à coder de ce côté.


