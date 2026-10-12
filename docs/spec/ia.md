# Fonctions IA

Desktop uniquement. Les fonctions IA tournent en local : Ollama, servi sur le PC, sans rien envoyer sur Internet. Pour passer par un autre outil, la fenêtre d'une fonction copie sa consigne suivie du texte de la page, à coller où l'on veut. Ollama s'installe avec son script officiel (service systemd, qui sert la carte par ROCm sur une Radeon et par CUDA sur une NVIDIA), hors de l'application, qui l'appelle par son API à l'adresse des réglages (`http://localhost:11434` par défaut). Le même modèle sert à la mise en forme des mémos vocaux ([memos](memos.md)). Comme les autres services, l'IA est facultative : sans modèle joignable, ses fonctions se désactivent, l'édition n'est jamais bloquée.

## Choix du modèle local selon la machine

Notes regarde la carte graphique et décide seule : quel modèle d'Ollama utiliser, ou pas d'IA locale du tout si la machine ne suit pas. La carte se lit sans rien installer : une Radeon dans `/sys/class/drm` (mémoire vidéo), une NVIDIA par son pilote (`/proc/driver/nvidia`, puis `nvidia-smi` livré avec lui, s'il est là), le nom par Chromium. Pour chaque modèle installé, Notes calcule la place qu'il prend chargé (poids, plus le contexte d'après son architecture lue par `/api/show`, plus une marge) et la compare à 92 % de la mémoire vidéo.

L'IA locale est bloquée, avec la raison affichée, quand il n'y a pas de carte dédiée, ou qu'aucun modèle installé d'au moins 7 milliards de paramètres ne tient entièrement en mémoire vidéo : un modèle qui déborde sur le processeur est quatre fois plus lent (9 tokens par seconde contre 40). Parmi ceux qui tiennent, Notes prend la plus grande classe de taille, puis, à taille égale, Qwen3, puis Gemma 3, puis les autres, Ministral en dernier (il réécrit trop et invente). Sur une carte de 8 Go, c'est qwen3:8b.

Le contexte demandé à Ollama est plafonné à ce qui tient encore en mémoire vidéo ; une page plus longue est refusée avec un message. Dès le premier morceau de réponse, Notes demande à Ollama (`/api/ps`) quelle part du modèle est en mémoire vidéo : s'il déborde (une autre application occupe la carte), l'appel est abandonné avec un message qui dit quoi faire, plutôt que de continuer très lentement ; le modèle reste proposé. Un modèle peut être choisi à la main dans les réglages, parmi ceux qui conviennent. Ollama sur une autre machine ou NVIDIA sans `nvidia-smi` : la mémoire est inconnue, seul ce contrôle pendant l'appel s'applique.

## Deux fonctions, appliquées à la page entière

- Relecture stylistique : améliore fluidité et formulation sans changer la structure ni le sens.
- Mise au propre : transforme des notes en vrac en document structuré et développé. Ce n'est pas un résumé, c'est l'inverse.

## Mise au propre, section par section

Un modèle de 8 milliards de paramètres à qui l'on donne toute une page la recopie presque telle quelle, sans créer de listes ; sur une section seule, il suit la consigne. La mise au propre se fait donc section par section (`document/ai/note-sections.ts`) :

- Les titres ne passent pas par l'appel de leur section : ils restent à leur place et à leur niveau.
- Avant l'appel, Notes met elle-même en liste les lignes de texte qui se suivent (une ligne finie par « : » reste en tête de sa liste) : le modèle garde une liste, mais en crée rarement une.
- Chaque réponse est bornée en longueur. Une réponse coupée, bien plus longue que les notes ou qui perd un bloc mis de côté laisse les notes de la section, mises en liste : une section d'une ligne pousse sinon le modèle à inventer une suite.
- Les fautes des titres sont corrigées à part, tous les titres en un appel court, avec un exemple de correction dans la consigne (sans lui, le modèle les recopie). Un titre dont la correction change le nombre de mots ou la longueur de plus d'un quart reste tel quel.

Environ 40 s pour une page de 5 000 caractères sur une Radeon RX 7600. La consigne copiée pour un autre outil dit en plus qu'il reçoit la page entière.

## Flux

La fonction se lance par « Fonctions IA » dans le menu « ⋮ » en haut de la page, sans raccourci. Elle porte sur toute la page, ou, si du texte est sélectionné, sur les blocs de premier niveau que la sélection touche, en entier (un bloc dont aucun caractère n'est sélectionné n'en fait pas partie) : la fenêtre le dit (« blocs sélectionnés »), la comparaison ne montre qu'eux, et « Accepter » ne remplace qu'eux. Les blocs de code, les callouts et les images ne sont jamais montrés au modèle : ils partent sous un repère `[[BLOC-n]]` et reviennent tels quels, un bloc oublié par le modèle étant remis à la fin de la page avec un avertissement. Une mention de page disparue est signalée. Jamais de remplacement direct.

Sélection de la fonction, fenêtre d'estimation (modèle, tokens d'entrée et de sortie, durée), exécution annulable, vue de comparaison avant/après (deux colonnes ou une seule), puis accepter ou rejeter. Une acceptation s'annule par `Ctrl+Z`. « Copier le prompt », avant de lancer ou après une erreur, met dans le presse-papiers la consigne de la fonction puis le texte de la page tel quel, code et callouts compris, sans la phrase sur les repères ; aucun modèle n'est appelé.

## Estimation et historique

Rien n'est facturé : l'estimation affiche la taille de la demande et la durée attendue. Tokens d'entrée estimés d'après la longueur du texte, sortie par un ratio. Le calage se fait sur les dix derniers appels du même modèle et de la même fonction : écart entre le compte de Notes et celui d'Ollama pour l'entrée, rapport sortie sur entrée, durée par token.

Pendant l'appel, la fenêtre affiche le temps restant : l'estimation moins le temps écoulé tant que moins d'un cinquième de la réponse attendue est arrivé, puis la vitesse réelle de l'appel (temps écoulé rapporté à la part reçue) ; « presque fini » sous deux secondes. Sans estimation (modèle jamais utilisé), elle affiche le temps écoulé.

Historique dans `.notes/ai-usage.json` (synchronisé), agrégé par jour, semaine, mois et année, avec graphiques des tokens et des appels.

## Nettoyage des sorties

Systématique avant de proposer : suppression des fences englobantes et de la réflexion affichée (`<think>`), des préambules et conclusions, des séparateurs ajoutés, normalisation des puces, cohérence des niveaux de titre, suppression des emojis et du gras ajoutés par le modèle (ce qui était dans l'entrée est gardé). Les blocs de code ne sont jamais touchés. Une relecture qui rend moins de 85 % des mots de la page est signalée : le modèle a sans doute retiré du texte.

## Configuration

Adresse d'Ollama ; modèle par fonction (« Automatique » par défaut, ou choisi à la main parmi ceux qui conviennent) ; consignes modifiables (retour à celles de Notes). Tout est dans les réglages du poste (`settings.json`), pas synchronisé.
