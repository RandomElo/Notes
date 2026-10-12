#!/bin/sh
# Lancé dans le conteneur par scripts/samba-essai.sh. Installe Samba, crée l'utilisateur avec l'identifiant
# du compte du poste (les fichiers du partage restent à lui), puis lance smbd au premier plan.
set -eu
apk add --no-cache samba >/dev/null
addgroup -g "$GID_HOTE" essai 2>/dev/null || true
adduser -D -H -u "$UID_HOTE" -G "$(getent group "$GID_HOTE" | cut -d: -f1)" utilisateur
cat > /etc/samba/smb.conf <<CONF
[global]
  server role = standalone server
  server min protocol = SMB3_11
  server max protocol = SMB3_11
  server signing = mandatory
  server smb encrypt = $CHIFFREMENT
  map to guest = never
  disable netbios = yes
  smb ports = 445
  load printers = no
  log level = 1

[partage]
  path = /partage
  read only = no
  valid users = utilisateur
CONF
printf '%s\n%s\n' "$MOT_DE_PASSE" "$MOT_DE_PASSE" | smbpasswd -s -a utilisateur >/dev/null
( while true; do smbstatus 2>/dev/null > /etat/smbstatus.txt.tmp && mv /etat/smbstatus.txt.tmp /etat/smbstatus.txt; chown "$UID_HOTE" /etat/smbstatus.txt 2>/dev/null; sleep 2; done ) &
exec smbd --foreground --no-process-group --debug-stdout
