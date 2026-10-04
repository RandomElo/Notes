#!/usr/bin/env bash
# Prépare ce qu'il faut au détourage des icônes (README §6), là où
# l'application desktop le cherche (en développement comme au packaging) :
# le modèle silueta (U²-Net allégé, rembg, licence Apache 2.0), téléchargé
# une fois et vérifié par son empreinte, et le moteur ONNX en WebAssembly
# copié depuis node_modules. Rien n'est versionné.
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dossier="$racine/apps/desktop/resources/background-removal"
modele="$dossier/silueta.onnx"
adresse="https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx"
empreinte="75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb"
moteur="$racine/node_modules/onnxruntime-web/dist"

mkdir -p "$dossier"
verifier() {
	[[ -f "$modele" ]] && [[ "$(sha256sum "$modele" | cut -d' ' -f1)" == "$empreinte" ]]
}
if ! verifier; then
	echo "téléchargement du modèle de détourage (44 Mo)…"
	curl --fail --location --silent --show-error --output "$modele.partiel" "$adresse"
	mv "$modele.partiel" "$modele"
	if ! verifier; then
		echo "erreur : l'empreinte du modèle de détourage ne correspond pas" >&2
		rm -f "$modele"
		exit 1
	fi
fi

cp "$moteur/ort.wasm.bundle.min.mjs" "$moteur/ort-wasm-simd-threaded.wasm" "$dossier/"
echo "détourage : $dossier ($(du -sh "$dossier" | cut -f1))"
