# Packaging et distribution

- Linux : AppImage via electron-builder (`Notes.AppImage`), aucune installation requise et aucune dépendance à un paquet du système : le client SMB, whisper.cpp et ffmpeg sont dans l'AppImage. Icône de Notes dans `apps/desktop/resources/icon/`, de 16 à 1024 px, détourée sur fond transparent : icône de l'AppImage, de la fenêtre et de la barre de titre. Build x86_64 uniquement, pour le PC fixe et le portable (Linux Mint, Cinnamon, X11). `.deb` possible en complément.
- Android : APK construit avec Gradle, signé avec une clé locale, installé à la main (transfert du fichier ou `adb install`). Pas de Play Store.
- AppImage au nom fixe `Notes.AppImage`. `npm run installer` la construit et la met dans `~/Applications` (ou le dossier `NOTES_DOSSIER_INSTALLATION` de `.env`), par renommage. Notes ouverte voit la nouvelle version et la barre de titre propose « Relancer » ; fermée, le prochain lancement prend la nouvelle version. Pas de serveur de mises à jour : projet privé. Numéro de version dans la barre de titre.
- La clé de signature Android reste hors du dépôt. La perdre oblige à désinstaller l'app avant de réinstaller une version signée autrement.


