import { join } from 'node:path';

/**
 * Port du serveur LanguageTool : celui qu'attend l'extension LanguageTool du
 * navigateur pour un serveur local (`http://localhost:8081/v2`), qu'Eloi
 * utilise aussi (README §11).
 */
export const portDeLanguageTool = 8081;

export const nomDuScript = 'lancer.sh';
export const nomDuPid = 'serveur.pid';
export const nomDesReglages = 'server.properties';

/**
 * Réglages du serveur. `pipelineCaching` est indispensable : sans lui, chaque
 * vérification en français reconstruit la règle d'orthographe et prend environ
 * 760 ms ; avec, 45 ms (mesures du 2026-10-04, README §11).
 */
export function reglagesDuServeur(dossier: string): string {
  return [
    'pipelineCaching=true',
    'pipelinePrewarming=false',
    'maxPipelinePoolSize=50',
    'pipelineExpireTimeInSeconds=3600',
    'cacheSize=1000',
    `languageModel=${join(dossier, 'ngrammes')}`,
    '',
  ].join('\n');
}

/**
 * Script qui lance le serveur, posé dans le dossier de LanguageTool : la
 * session le lance au login, Notes le lance s'il ne tourne pas. Il ne fait
 * rien si le serveur tourne déjà. Les descripteurs hérités sont fermés (sinon
 * le serveur garderait le montage de l'AppImage qui l'a lancé), et Java ne
 * reçoit aucune variable du poste. Sans `--public`, LanguageTool n'écoute que
 * ce poste. Ses journaux, qui pourraient citer du texte, ne sont gardés nulle part.
 */
export function scriptDeLancement(): string {
  return [
    '#!/bin/bash',
    '# Lance le serveur LanguageTool installé par Notes (README §11). Écrit par Notes à chaque démarrage.',
    'for f in /proc/$$/fd/*; do n=${f##*/}; [ "$n" -gt 2 ] 2>/dev/null && eval "exec $n>&-"; done',
    'dossier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `pid="$dossier/${nomDuPid}"`,
    'if [ -f "$pid" ] && grep -qa languagetool-server "/proc/$(cat "$pid")/cmdline" 2>/dev/null; then exit 0; fi',
    'cd "$dossier/languagetool" || exit 1',
    'echo $$ > "$pid"',
    `exec env -i LC_ALL=C.UTF-8 "$dossier/java/bin/java" -Xmx1g -cp languagetool-server.jar org.languagetool.server.HTTPServer --config "$dossier/${nomDesReglages}" --port ${portDeLanguageTool} >/dev/null 2>&1`,
    '',
  ].join('\n');
}

/** Un argument de la ligne `Exec` d'un fichier .desktop, entre guillemets doubles, caractères réservés échappés. */
function argumentDesktop(valeur: string): string {
  return `"${valeur.replace(/[\\"`$]/g, (caractere) => `\\${caractere}`)}"`;
}

/** Fichier de démarrage avec la session (norme freedesktop, lue par Cinnamon). */
export function cheminDuDemarrage(dossierDeConfiguration: string): string {
  return join(dossierDeConfiguration, 'autostart', 'notes-languagetool.desktop');
}

export function contenuDuDemarrage(dossier: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=LanguageTool (Notes)',
    "Comment=Correction orthographique locale, pour Notes et l'extension du navigateur",
    `Exec=/bin/bash ${argumentDesktop(join(dossier, nomDuScript))}`,
    'Terminal=false',
    'NoDisplay=true',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}
