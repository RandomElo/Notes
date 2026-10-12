# Mémos vocaux

Pas de dictée en direct dans l'application. On enregistre un mémo sur le téléphone, le fichier part sur le NAS, et c'est le PC qui le transcrit puis le met en forme avec le modèle local.

## Sur le téléphone

- Un micro rond en bas à droite de l'accueil, et seulement là. Le toucher lance l'enregistrement (AAC en `.m4a`, mono, 16 kHz) ; un écran montre la durée et le niveau du son, « Terminer » l'envoie aussitôt, « Annuler » le jette (pas de réécoute). Pas de raccourci sur l'icône de l'application.
- L'enregistrement continue écran éteint ou application quittée, avec une notification « Enregistrement en cours » qui permet de le terminer. Sur l'écran d'enregistrement, Retour revient à l'accueil sans l'arrêter : une barre en bas de l'accueil montre la durée, la rouvre et a son « Terminer ».
- Le micro est demandé au premier mémo, avec les notifications ; refusé, un message dit où l'autoriser.
- Le mémo s'enregistre dans le stockage privé de l'application (`memos-en-cours/`, puis `memos/` une fois terminé ; un enregistrement coupé net, application tuée, est illisible et jeté au suivant).
- Il part sur le NAS dans `.notes/memos/memo-<date>.m4a` aussitôt terminé si le NAS répond, sinon au début de chaque synchronisation qui le joint (ouverture, retour dans l'application, réseau retrouvé, toutes les 30 s), un mémo à la fois, du plus ancien au plus récent. Il n'est retiré du téléphone qu'une fois écrit. C'est la seule exception à la règle « pas de file d'attente » ([sync](sync.md)) : un mémo n'est pas une page et ne peut pas créer de conflit.
- Le nom d'un mémo est sa date à la seconde : un fichier de ce nom déjà sur le NAS est un mémo déjà envoyé, ni renvoyé ni écrasé.
- Application fermée, une tâche Android (WorkManager) l'envoie dès qu'il y a du réseau, et réessaie plus tard si le NAS ne répond pas (30 s, puis de plus en plus espacé), avec les réglages enregistrés par l'application et le mot de passe du Keystore.
- L'accueil liste les mémos pas encore envoyés (date, taille) ; toucher l'un d'eux propose de le jeter.
- Code : `core/memos/memo-upload.ts`, `apps/mobile/src/features/voice-memos/`, plugin Kotlin `memos/`.

## Sur le PC

- Le dossier `.notes/memos/` fait partie du dossier des notes : la sync l'amène sur le PC comme le reste. Il n'apparaît pas dans l'arborescence.
- Les mémos en attente sont listés en tête d'une page « Mémos vocaux », créée à l'arrivée du premier mémo et reconnue par son en-tête (`role: memos`), même renommée. Chaque mémo s'écoute, se transcrit, ou part à la corbeille sans être transcrit ; « Tout transcrire » les enchaîne, chacun à valider.
- « Transcrire » fait tout d'un coup : l'audio est converti en WAV 16 kHz mono, transcrit par Whisper, puis mis en forme par le modèle de la fonction « Mise en forme des mémos » ([ia](ia.md), réglable comme les deux autres, avec sa consigne). La comparaison montre la transcription brute face à la mise en forme, jamais d'insertion directe ; sans modèle, la transcription brute peut être gardée.
- Chaque mémo accepté devient une sous-page de « Mémos vocaux », titrée par la date seule (« Mémo du 7 octobre 2026 à 16 h 24 »), qu'on déplace ensuite où on veut. L'audio part alors à la corbeille ([corbeille](corbeille.md)), récupérable 30 jours, d'où il revient dans `.notes/memos/`. Un mémo rejeté reste en attente.
- Une icône de dossier en tête de la page, ou « Ouvrir le dossier des mémos » dans son menu du clic droit, ouvre `.notes/memos/` dans le gestionnaire de fichiers (créé s'il manque) : un fichier audio déposé là, sous n'importe quel nom, devient un mémo en attente, même Notes ouverte ; sans date dans son nom, il prend celle du fichier.
- La page peut être masquée de l'arborescence (« Masquer de l'arborescence » dans son menu, réglage propre à ce poste qui retient les mémos présents à ce moment). Elle réapparaît d'elle-même quand un nouveau mémo arrive, et un clic droit dans une zone vide des pages de la barre latérale propose de la réafficher.

## Temps restant

Pendant le traitement d'un mémo, une ligne dit le temps restant pour la transcription et la mise en forme ensemble (« environ 40 s restantes ») ; avec « Tout transcrire », celui de toute la série (« environ 3 min pour les 4 mémos », sans compter le temps passé à relire). À côté du bouton « Tout transcrire », la durée estimée de tous les mémos en attente.

La durée de chaque audio est lue dans son en-tête par le ffmpeg livré, sans le décoder. La transcription est calée sur les dix dernières de ce poste (vitesse par seconde d'audio, démarrage du serveur quand il est arrêté, caractères par seconde d'audio), gardées dans `transcriptions.json` à côté des réglages, pas dans le dossier des notes, puisque la vitesse dépend de la carte. Avant toute mesure : 1/15 de la durée de l'audio avec une carte dédiée, la moitié sans. La mise en forme est estimée comme une fonction IA, sur la longueur probable du texte, puis sur sa vraie longueur une fois transcrit. Un modèle jamais utilisé pour la mise en forme : le temps affiché ajoute « plus la mise en forme ».

## Formats audio

Tous les formats courants sont acceptés. Le décodeur de la page lit l'AAC d'un `.m4a`, le MP3, l'Ogg, l'Opus, le FLAC et le WAV. Le reste (AMR et 3GP des enregistreurs Android, WMA, AIFF, CAF, APE, le son d'une vidéo) passe par ffmpeg 9.0.2, compilé à la construction de Notes (`scripts/build-ffmpeg.sh`, `npm run build:ffmpeg`) avec ses seuls décodeurs audio, sans réseau ni assembleur, et livré dans l'AppImage (8 Mo). L'écoute se replie de même sur un WAV décodé par ffmpeg.

## Whisper

Notes s'occupe de tout, rien n'est à installer à la main.

- Le serveur whisper.cpp 1.9.5 est compilé à la construction de Notes (`scripts/build-whisper.sh`, `npm run build:whisper`) et livré dans l'AppImage : calcul sur la carte graphique par Vulkan (Radeon comme NVIDIA), et une variante du calcul processeur par famille de processeur, choisie au lancement. Les binaires de l'image Docker officielle ne conviennent pas : compilés pour un processeur avec AVX-512, ils plantent sur un Ryzen 7 5800X.
- Le modèle se télécharge une fois, de lui-même à l'arrivée du premier mémo, dans `~/Applications/Whisper/` à côté de l'AppImage, vérifié par son empreinte : `large-v3-turbo` quantifié en 5 bits (574 Mo, environ 0,8 Go de mémoire vidéo, il tient à côté du modèle d'Ollama sur une carte de 8 Go), plus un modèle de détection de la voix (Silero, 885 Ko) qui ne laisse passer que les passages parlés : sans lui, Whisper invente du texte sur la musique ou le silence. Langue française imposée.
- Le serveur se lance à la première transcription, sur 127.0.0.1 et un port libre, sans les variables du poste, et s'arrête après 2 minutes sans demande pour rendre la carte à Ollama. Sans carte dédiée, la transcription se fait sur le processeur, plus lentement. Sur une Radeon RX 7600 : 30 s de parole française transcrites en 1,2 à 1,4 s.
- Repli : modèle pas encore téléchargé ou serveur absent, « Transcrire » est désactivé avec un message explicite ; un mémo sans voix dit « Rien n'a été entendu » ; les mémos attendent, rien n'est perdu.
