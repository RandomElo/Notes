#!/usr/bin/env bash
# Émulateur Android 13 sans fenêtre, pour essayer l'application sur le poste (README §3, « Essais Android sur le poste »).
# Usage : bash scripts/android-emulateur.sh demarrer | arreter
# Le téléphone virtuel « notes-essai » est créé au premier démarrage dans ~/.android/avd/.
# Depuis l'émulateur, le poste est à l'adresse 10.0.2.2 (le Samba d'essai y répond).
set -euo pipefail

sdk="${ANDROID_HOME:-/opt/android-sdk}"
adb="$sdk/platform-tools/adb"
avd=notes-essai
image="system-images;android-33;google_apis;x86_64"

case "${1:-}" in
  demarrer)
    if ! "$sdk/emulator/emulator" -list-avds | grep -qx "$avd"; then
      echo no | "$sdk/cmdline-tools/latest/bin/avdmanager" create avd -n "$avd" -k "$image" -d pixel_6 >/dev/null
    fi
    nohup "$sdk/emulator/emulator" -avd "$avd" -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect >"${TMPDIR:-/tmp}/notes-emulateur.log" 2>&1 &
    "$adb" wait-for-device
    until [[ "$("$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; do sleep 2; done
    echo "Émulateur prêt."
    ;;
  arreter)
    "$adb" emu kill >/dev/null 2>&1 || true
    echo "Émulateur arrêté."
    ;;
  *)
    echo "Usage : bash scripts/android-emulateur.sh demarrer | arreter" >&2
    exit 1
    ;;
esac
