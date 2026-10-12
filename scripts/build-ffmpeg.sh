#!/usr/bin/env bash
# Compile le ffmpeg livré dans l'AppImage (docs/spec/memos.md) : il décode les mémos
# vocaux que Chromium ne sait pas lire (AMR des enregistreurs Android, WMA,
# AIFF, APE...) en WAV 16 kHz mono pour la transcription et l'écoute. Rien à
# installer sur le poste (règle 9).
#
# Version réduite : tous les décodeurs audio, tous les formats de fichier et
# analyseurs, mais aucun décodeur vidéo, aucun accès réseau, et un seul
# encodeur (PCM 16 bits dans un WAV). Compilé sans assembleur (pas de nasm à
# installer) : le décodage d'un mémo n'en a pas besoin. Les sources sont
# téléchargées une fois dans .cache/ ; leur signature a été vérifiée avec la
# clé de publication de FFmpeg avant de figer l'empreinte. Le résultat va dans
# apps/desktop/resources/ffmpeg/, non versionné ; une compilation déjà faite
# pour la même version n'est pas refaite. Il faut gcc et make.
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache="$racine/.cache/ffmpeg-build"
sortie="$racine/apps/desktop/resources/ffmpeg"

version_ffmpeg="9.0.2"
empreinte_ffmpeg="8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e"
signature="ffmpeg $version_ffmpeg, décodeurs audio seulement"

if [[ -x "$sortie/ffmpeg" && "$(cat "$sortie/version.txt" 2>/dev/null)" == "$signature" ]]; then
	echo "ffmpeg : $sortie (déjà compilé)"
	exit 0
fi

for outil in gcc make; do
	command -v "$outil" >/dev/null || { echo "erreur : $outil est nécessaire pour compiler ffmpeg (paquet build-essential)" >&2; exit 1; }
done

mkdir -p "$cache"
cd "$cache"
archive="ffmpeg-$version_ffmpeg.tar.xz"
if [[ ! -f "$archive" ]]; then
	echo "téléchargement de $archive…"
	curl --fail --location --silent --show-error --output "$archive.partiel" "https://ffmpeg.org/releases/$archive"
	mv "$archive.partiel" "$archive"
fi
if [[ "$(sha256sum "$archive" | cut -d' ' -f1)" != "$empreinte_ffmpeg" ]]; then
	echo "erreur : l'empreinte de $archive ne correspond pas" >&2
	rm -f "$archive"
	exit 1
fi
rm -rf "ffmpeg-$version_ffmpeg"
tar -xJf "$archive"
cd "ffmpeg-$version_ffmpeg"

# Décodeurs audio : ceux que libavcodec range entre « audio codecs » et « subtitles » (PCM, DPCM et ADPCM compris).
decodeurs="$(awk '/^\/\* audio codecs \*\//{a=1} /^\/\* subtitles \*\//{a=0} a && /_decoder;/' libavcodec/allcodecs.c | sed -E 's/.*ff_(.*)_decoder;.*/\1/' | paste -sd,)"
[[ -n "$decodeurs" ]] || { echo "erreur : liste des décodeurs audio introuvable" >&2; exit 1; }

echo "compilation de ffmpeg $version_ffmpeg (quelques minutes la première fois)…"
./configure --prefix="$cache/installation" \
	--disable-everything --disable-autodetect --disable-network --disable-doc --disable-debug \
	--disable-x86asm --disable-ffplay --disable-ffprobe --disable-avdevice --disable-swscale \
	--enable-static --disable-shared \
	--enable-protocol=file,pipe \
	--enable-demuxers --enable-parsers \
	--enable-decoder="$decodeurs" \
	--enable-encoder=pcm_s16le --enable-muxer=wav \
	--enable-filter=aresample,aformat,anull,amix,pan >"$cache/configuration.log"
make -j"$(nproc)" ffmpeg >"$cache/compilation.log"

rm -rf "$sortie"
mkdir -p "$sortie"
cp ffmpeg "$sortie/"
cp COPYING.LGPLv2.1 "$sortie/LICENSE-ffmpeg"
strip --strip-unneeded "$sortie/ffmpeg"
echo "$signature" >"$sortie/version.txt"
echo "ffmpeg : $sortie ($(du -sh "$sortie" | cut -f1))"
