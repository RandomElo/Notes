#!/usr/bin/env bash
# Lance le test d'intégration du compagnon SMB contre le NAS réel. L'adresse,
# le partage et l'utilisateur viennent du fichier .env à la racine (jamais du
# code) ; le mot de passe est demandé au clavier.
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$racine/.env" ]]; then
	echo "Fichier .env absent : copie .env.example en .env et remplis-le." >&2
	exit 1
fi
set -a
# shellcheck disable=SC1091
source "$racine/.env"
set +a

for variable in NOTES_NAS_HOTE NOTES_NAS_PARTAGE NOTES_NAS_UTILISATEUR; do
	if [[ -z "${!variable:-}" ]]; then
		echo "$variable est vide dans .env." >&2
		exit 1
	fi
done

cd "$racine/apps/smb-companion"
go test -tags nas -count=1 -v ./internal/smbfs/
