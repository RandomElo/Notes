#!/usr/bin/env bash
# Compile le binaire compagnon SMB, lié statiquement, et le dépose là où
# l'application desktop le cherche (en développement comme au packaging).
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sortie="$racine/apps/desktop/resources/bin/smb-companion"
version="$(node -p "require('$racine/package.json').version")"

mkdir -p "$(dirname "$sortie")"
cd "$racine/apps/smb-companion"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
	-trimpath \
	-ldflags "-s -w -X main.version=$version" \
	-o "$sortie" .

# Règle du projet : aucune dépendance au système, donc aucune bibliothèque partagée.
if ldd "$sortie" >/dev/null 2>&1; then
	echo "erreur : le binaire compagnon n'est pas lié statiquement" >&2
	exit 1
fi
echo "compagnon SMB $version : $sortie ($(du -h "$sortie" | cut -f1))"
