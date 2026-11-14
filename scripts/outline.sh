#!/usr/bin/env bash
# Plan d'un fichier source : définitions et commentaires de section, avec leur numéro de ligne.
# Sert à lire un gros fichier par morceaux (`npm run plan -- <fichier>`, puis la plage utile)
# au lieu de le lire en entier. Tiré du code à chaque appel, donc jamais périmé.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage : npm run plan -- <fichier> [<fichier>…]" >&2
  exit 1
fi

for fichier in "$@"; do
  echo "== $fichier ($(wc -l < "$fichier") lignes)"
  # Définitions de premier niveau (TS, Go, Kotlin), commentaires en tête de ligne ou indentés de deux espaces
  # (en-têtes de section d'un composant), hooks React d'un composant.
  grep -nE \
    -e '^(export )?(default )?(async )?(function|const|let|class|interface|type|enum) [A-Za-z_]' \
    -e '^(func|type|var|const) ' \
    -e '^(private |internal )?(fun|class|object|data class) ' \
    -e '^ {0,2}// ' \
    -e '^ {2}(const|function) [A-Za-z_]+ = (useCallback|useMemo|useRef|useState)' \
    -e '^ {2}useEffect\(' \
    "$fichier" | cut -c1-140 || true
done
