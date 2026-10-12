#!/usr/bin/env bash
# Serveur Samba d'essai pour l'application Android (docs/spec/architecture.md, « Essais Android sur le poste »).
# Imite le NAS : SMB 3.1.1 seul, signature exigée, chiffrement laissé au choix du client.
# Usage, depuis la racine du dépôt :
#   sudo bash scripts/samba-essai.sh demarrer [sans-chiffrement]
#   sudo bash scripts/samba-essai.sh arreter
# Le partage « partage » contient une copie du vault d'exemple dans « notes ». Utilisateur « utilisateur »,
# mot de passe tiré au hasard au premier démarrage, écrit dans .cache/samba-essai/acces.txt (lisible par toi seul) et
# gardé aux démarrages suivants, pour que le téléphone d'essai reste connecté. Le partage repart du vault d'exemple.
# L'état des sessions (chiffrement, signature) est recopié toutes les 2 s dans .cache/samba-essai/smbstatus.txt.
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
travail="$racine/.cache/samba-essai"
nom=notes-samba-essai
image=alpine:3.22

if [[ $EUID -ne 0 || -z "${SUDO_UID:-}" ]]; then
  echo "À lancer avec sudo depuis ton compte : sudo bash scripts/samba-essai.sh demarrer" >&2
  exit 1
fi

case "${1:-}" in
  demarrer)
    docker rm -f "$nom" >/dev/null 2>&1 || true
    mot_de_passe="$(sed -n 's/^mot de passe : //p' "$travail/acces.txt" 2>/dev/null || true)"
    [[ -n "$mot_de_passe" ]] || mot_de_passe="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
    rm -rf "$travail/partage"
    mkdir -p "$travail/partage"
    cp -r "$racine/fixtures/vault-demo" "$travail/partage/notes"
    printf 'adresse depuis l’émulateur : 10.0.2.2\npartage : partage\ndossier : notes\nutilisateur : utilisateur\nmot de passe : %s\n' "$mot_de_passe" > "$travail/acces.txt"
    chmod 600 "$travail/acces.txt"
    chown -R "$SUDO_UID:$SUDO_GID" "$travail"
    chiffrement="if_required"
    [[ "${2:-}" == "sans-chiffrement" ]] && chiffrement="off"
    docker run -d --name "$nom" -p 127.0.0.1:445:445 \
      -v "$travail/partage:/partage" -v "$travail:/etat" -v "$racine/scripts/samba-essai/dans-le-conteneur.sh:/demarrer.sh:ro" \
      -e UID_HOTE="$SUDO_UID" -e GID_HOTE="$SUDO_GID" -e MOT_DE_PASSE="$mot_de_passe" -e CHIFFREMENT="$chiffrement" \
      "$image" sh /demarrer.sh >/dev/null
    echo "Samba d'essai démarré (chiffrement côté serveur : $chiffrement). Accès dans .cache/samba-essai/acces.txt"
    ;;
  arreter)
    docker rm -f "$nom" >/dev/null 2>&1 || true
    echo "Samba d'essai arrêté et supprimé."
    ;;
  *)
    echo "Usage : sudo bash scripts/samba-essai.sh demarrer [sans-chiffrement] | arreter" >&2
    exit 1
    ;;
esac
