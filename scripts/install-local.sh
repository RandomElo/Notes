#!/usr/bin/env bash
# Construit l'AppImage et l'installe sous un nom fixe, Notes.AppImage, dans
# ~/Applications (ou le dossier NOTES_DOSSIER_INSTALLATION de .env, s'il y est).
# Le remplacement se fait par renommage : une Notes en cours d'exécution garde
# son ancien fichier jusqu'à ce qu'elle se relance, ce qu'elle fait d'elle-même
# (fenêtre fermée) ou propose (fenêtre ouverte).
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Un dossier donné sur la ligne de commande passe avant celui de .env.
demande="${NOTES_DOSSIER_INSTALLATION:-}"
if [[ -f "$racine/.env" ]]; then
	set -a
	# shellcheck disable=SC1091
	source "$racine/.env"
	set +a
fi
dossier="${demande:-${NOTES_DOSSIER_INSTALLATION:-$HOME/Applications}}"

cd "$racine"
npm run package

mkdir -p "$dossier"
temporaire="$dossier/.Notes.AppImage.nouveau"
cp "$racine/apps/desktop/release/Notes.AppImage" "$temporaire"
chmod +x "$temporaire"
mv -f "$temporaire" "$dossier/Notes.AppImage"
echo "Installée : $dossier/Notes.AppImage (version $(node -p "require('./package.json').version"))."
