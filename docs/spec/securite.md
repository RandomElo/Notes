# Sécurité et configuration

## Secrets

Règle : aucun identifiant n'est écrit en clair sur le disque, ni dans le vault, ni dans les réglages, ni dans les journaux. Concerne le mot de passe SMB, et les identifiants LanguageTool et Whisper le cas échéant (plus de clé d'API d'IA externe depuis le retrait de LiteLLM). Les secrets sont stockés hors du vault et jamais synchronisés.

- Desktop : `safeStorage` d'Electron, qui s'appuie sur le trousseau du système (`libsecret`, KWallet). Sans trousseau disponible, Electron retomberait sur un stockage non chiffré (backend `basic_text`) : l'app le détecte, refuse d'enregistrer le secret, le garde en mémoire le temps de la session et le redemande au lancement suivant.
- Android : clé générée dans l'Android Keystore, qui chiffre le mot de passe SMB stocké dans le stockage privé de l'app. Seul ce secret est concerné.
- Les secrets ne quittent jamais le processus qui en a besoin : sur desktop ils restent dans le main, le renderer ne les reçoit pas. Le mot de passe SMB est transmis au binaire compagnon par son entrée standard, jamais en argument de ligne de commande (visible dans `ps`) ni par variable d'environnement, et le compagnon ne l'écrit nulle part.
- Rien de sensible dans les messages d'erreur ni dans les logs : ni mot de passe, ni clé, ni en-tête d'autorisation.

## Compte du NAS

L'app se connecte en SMB avec le compte personnel de l'utilisateur, pas avec un compte dédié. La double authentification de ce compte ne couvre pas SMB : le mot de passe enregistré par l'app donne donc accès à tous les partages du compte. C'est ce qui rend la règle ci-dessus non négociable, le mot de passe n'existe sur le poste et sur le téléphone que sous forme chiffrée.

## Emplacement des fichiers

| Fichier | Emplacement | Synchronisé |
|---|---|---|
| Secrets chiffrés | `userData/secrets.enc` | Non |
| Réglages locaux | `userData/settings.json` | Non |
| Index des titres | `userData/cache/titles.json` | Non |
| Index de sync | `userData/cache/sync-index.json` | Non |
| Thème | `vault/.notes/theme.toml` | Oui |
| Dictionnaire | `vault/.notes/dictionary.txt` | Oui |
| Remarques ignorées | `vault/.notes/spelling-ignored.txt` | Oui |
| Démarrage de LanguageTool avec la session | `~/.config/autostart/notes-languagetool.desktop` | Non |
| Historique IA | `vault/.notes/ai-usage.json` | Oui |
| Mémos vocaux en attente | `vault/.notes/memos/` | Oui |
| Serveur de transcription (whisper.cpp) | dans l'AppImage | Non |
| Modèles de transcription | `~/Applications/Whisper/` | Non |
| LanguageTool, son Java et ses n-grammes | `~/Applications/LanguageTool/` | Non |

Sur Android, cache des pages, index et réglages vivent dans le stockage privé de l'application.

## Durcissement

- Electron : `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, IPC via `contextBridge` minimal, CSP stricte, navigation externe bloquée (ouverture via `shell.openExternal`), validation des entrées venant du disque et du NAS.
- Chaque appel IPC est refusé s'il ne vient pas de la page de l'application. Toute demande de permission (caméra, micro, notifications) est refusée par défaut.
- Le port de débogage de Chromium est retiré des versions installées : l'application ne peut pas être pilotée de l'extérieur.
- Le binaire compagnon est lancé sans aucune variable d'environnement du poste, et s'arrête dès que l'application ferme son entrée.
- Android : CSP stricte dans la WebView, aucun contenu distant chargé, liens externes ouverts dans le navigateur du téléphone, pas de permission au-delà du réseau.
- Les deux : le contenu des pages vient du NAS et n'est pas de confiance. Le Markdown est toujours rendu via le schéma TipTap, jamais injecté en HTML brut.


