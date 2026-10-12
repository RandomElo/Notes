#!/usr/bin/env bash
# Construit l'APK de Notes pour Android : application web, synchronisation Capacitor, Gradle.
# Usage : npm run android:apk (APK dans apps/mobile/release/), npm run android:installer (et l'installe par adb).
# Il faut Java 21 (paquet openjdk-21-jdk-headless) et le SDK Android (ANDROID_HOME, /opt/android-sdk par défaut).
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
mobile="$racine/apps/mobile"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/javac" ]] || ! "$JAVA_HOME/bin/javac" -version 2>&1 | grep -q ' 21'; then
  JAVA_HOME="$(ls -d /usr/lib/jvm/java-21-openjdk-* 2>/dev/null | head -1 || true)"
  if [[ -z "$JAVA_HOME" ]]; then
    echo "Java 21 introuvable : sudo apt install openjdk-21-jdk-headless" >&2
    exit 1
  fi
  export JAVA_HOME
fi
[[ -f "$mobile/android/local.properties" ]] || echo "sdk.dir=$ANDROID_HOME" > "$mobile/android/local.properties"

version="$(node -p "require('$mobile/package.json').version")"
(cd "$mobile" && npx vite build && npx cap sync android)
(cd "$mobile/android" && ./gradlew --quiet assembleDebug)
mkdir -p "$mobile/release"
apk="$mobile/release/Notes-$version.apk"
cp "$mobile/android/app/build/outputs/apk/debug/app-debug.apk" "$apk"
echo "APK : $apk"

if [[ "${1:-}" == "installer" ]]; then
  adb="$ANDROID_HOME/platform-tools/adb"
  if [[ "$("$adb" devices | grep -c 'device$')" -ne 1 ]]; then
    echo "Branche le téléphone en USB, débogage USB activé (ou un seul émulateur lancé), puis relance." >&2
    exit 1
  fi
  "$adb" install -r "$apk"
  echo "Notes $version installée sur le téléphone."
fi
