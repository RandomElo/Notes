#!/usr/bin/env bash
# Compile le serveur whisper.cpp livré dans l'AppImage (README §13) : la
# transcription des mémos vocaux tourne sur la carte graphique par Vulkan
# (Radeon comme NVIDIA), sans rien à installer sur le poste. Le binaire de
# l'image Docker officielle ne convient pas : compilé pour un processeur avec
# AVX-512, il plante sur un Ryzen 5800X. Ici, une variante du calcul CPU par
# famille de processeur, choisie au lancement (GGML_CPU_ALL_VARIANTS).
#
# Outils de compilation téléchargés une fois dans .cache/ (versions et
# empreintes fixées, sans sudo) : cmake, le SDK Vulkan (glslc, en-têtes) et
# les sources de whisper.cpp. Il faut seulement gcc et g++ sur la machine qui
# construit Notes, et le chargeur Vulkan (libvulkan1). Le résultat va dans
# apps/desktop/resources/whisper/, non versionné ; une compilation déjà faite
# pour la même version n'est pas refaite.
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache="$racine/.cache/whisper-build"
sortie="$racine/apps/desktop/resources/whisper"

version_whisper="1.9.5"
empreinte_whisper="ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720"
version_cmake="4.4.4"
version_vulkan="1.4.363.0"
empreinte_vulkan="197962f5cbf80baf2775a03336a01cee7c8745686c65aaa70d3f751ade4d7e43"
signature="whisper.cpp $version_whisper, Vulkan, toutes variantes de processeur"

if [[ -x "$sortie/whisper-server" && "$(cat "$sortie/version.txt" 2>/dev/null)" == "$signature" ]]; then
	echo "whisper : $sortie (déjà compilé)"
	exit 0
fi

for outil in gcc g++ make; do
	command -v "$outil" >/dev/null || { echo "erreur : $outil est nécessaire pour compiler whisper.cpp (paquet build-essential)" >&2; exit 1; }
done
chargeur="$(ls /usr/lib/x86_64-linux-gnu/libvulkan.so.1 2>/dev/null || true)"
[[ -n "$chargeur" ]] || { echo "erreur : le chargeur Vulkan est introuvable (paquet libvulkan1)" >&2; exit 1; }

mkdir -p "$cache"
cd "$cache"

# Télécharge un fichier une fois, vérifie son empreinte à chaque fois.
telecharger() {
	local fichier="$1" adresse="$2" empreinte="$3"
	if [[ ! -f "$fichier" ]]; then
		echo "téléchargement de $fichier…"
		curl --fail --location --silent --show-error --output "$fichier.partiel" "$adresse"
		mv "$fichier.partiel" "$fichier"
	fi
	if [[ "$(sha256sum "$fichier" | cut -d' ' -f1)" != "$empreinte" ]]; then
		echo "erreur : l'empreinte de $fichier ne correspond pas" >&2
		rm -f "$fichier"
		exit 1
	fi
}

# cmake : l'empreinte vient du fichier SHA-256 publié avec la version.
archive_cmake="cmake-$version_cmake-linux-x86_64.tar.gz"
curl --fail --location --silent --show-error --output cmake.sha256 "https://github.com/Kitware/CMake/releases/download/v$version_cmake/cmake-$version_cmake-SHA-256.txt"
empreinte_cmake="$(grep " $archive_cmake\$" cmake.sha256 | cut -d' ' -f1)"
[[ -n "$empreinte_cmake" ]] || { echo "erreur : empreinte de cmake introuvable" >&2; exit 1; }
telecharger "$archive_cmake" "https://github.com/Kitware/CMake/releases/download/v$version_cmake/$archive_cmake" "$empreinte_cmake"
telecharger "vulkansdk-$version_vulkan.tar.xz" "https://sdk.lunarg.com/sdk/download/$version_vulkan/linux/vulkansdk-linux-x86_64-$version_vulkan.tar.xz" "$empreinte_vulkan"
telecharger "whisper.cpp-$version_whisper.tar.gz" "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v$version_whisper.tar.gz" "$empreinte_whisper"

[[ -d "cmake-$version_cmake-linux-x86_64" ]] || tar -xzf "$archive_cmake"
[[ -d "$version_vulkan" ]] || { echo "décompression du SDK Vulkan…"; tar -xJf "vulkansdk-$version_vulkan.tar.xz"; }
rm -rf "whisper.cpp-$version_whisper"
tar -xzf "whisper.cpp-$version_whisper.tar.gz"

export VULKAN_SDK="$cache/$version_vulkan/x86_64"
export PATH="$VULKAN_SDK/bin:$cache/cmake-$version_cmake-linux-x86_64/bin:$PATH"

echo "compilation de whisper.cpp $version_whisper (quelques minutes la première fois)…"
cd "whisper.cpp-$version_whisper"
cmake -B build -DCMAKE_BUILD_TYPE=Release \
	-DGGML_VULKAN=ON -DGGML_NATIVE=OFF -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON \
	-DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_SDL2=OFF \
	-DVulkan_INCLUDE_DIR="$VULKAN_SDK/include" -DVulkan_LIBRARY="$chargeur" -DVulkan_GLSLC_EXECUTABLE="$VULKAN_SDK/bin/glslc" \
	-DCMAKE_INSTALL_RPATH='$ORIGIN' -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON >"$cache/configuration.log"
cmake --build build -j"$(nproc)" --target whisper-server >"$cache/compilation.log"

# Le serveur, ses bibliothèques, et les moteurs chargés à la demande (Vulkan, une variante CPU par processeur).
rm -rf "$sortie"
mkdir -p "$sortie"
cp build/bin/whisper-server "$sortie/"
for bibliotheque in libwhisper.so.1 libggml.so.0 libggml-base.so.0; do
	cp -L "build/bin/$bibliotheque" "$sortie/"
done
cp build/bin/libggml-vulkan.so build/bin/libggml-cpu-*.so "$sortie/"
cp LICENSE "$sortie/LICENSE-whisper.cpp"
strip --strip-unneeded "$sortie"/*.so* "$sortie/whisper-server"
echo "$signature" >"$sortie/version.txt"
echo "whisper : $sortie ($(du -sh "$sortie" | cut -f1))"
