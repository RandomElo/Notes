import { estId } from '@notes/core';

/**
 * `--page=<id>` : la page à ouvrir au lancement. C'est ainsi que la barre de
 * recherche du poste (`../BarreRecherche`) ouvre une page de Notes, qu'elle
 * soit lancée ou non (README §7). Rien d'autre n'est lu sur la ligne de
 * commande ; un identifiant mal formé est ignoré.
 */
const prefixe = '--page=';

export function pageDemandee(argv: readonly string[]): string | null {
  const argument = argv.find((valeur) => valeur.startsWith(prefixe));
  const id = argument?.slice(prefixe.length).toLowerCase();
  return id !== undefined && estId(id) ? id : null;
}

/** Les arguments sans `--page=`, pour relancer Notes sur une nouvelle version sans rouvrir la même page. */
export function sansPage(argv: readonly string[]): string[] {
  return argv.filter((valeur) => !valeur.startsWith(prefixe));
}
