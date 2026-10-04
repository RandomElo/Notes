/** Textes de l'écran de la corbeille, logique pure. */

const jourMs = 24 * 60 * 60 * 1000;
/** Même durée que dans core (`retentionCorbeilleMs`) : une entrée est purgée au-delà. */
const retentionJours = 30;

const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const jourEtAnnee = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function debutDuJour(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** « aujourd'hui à 22:05 », « hier à 10:12 », « le 2 octobre à 10:12 » (l'année seulement si elle diffère). */
export function dateDeSuppression(iso: string, maintenant: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return '';
  }
  const ecart = Math.round((debutDuJour(maintenant) - debutDuJour(ms)) / jourMs);
  const aHeure = `à ${heure.format(ms)}`;
  if (ecart === 0) {
    return `aujourd'hui ${aHeure}`;
  }
  if (ecart === 1) {
    return `hier ${aHeure}`;
  }
  const memeAnnee = new Date(ms).getFullYear() === new Date(maintenant).getFullYear();
  return `le ${(memeAnnee ? jour : jourEtAnnee).format(ms)} ${aHeure}`;
}

/** « Effacée dans 29 jours », « Effacée demain », « Effacée au prochain démarrage », en début de phrase. */
export function delaiAvantEffacement(iso: string, maintenant: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return '';
  }
  const jours = Math.ceil((ms + retentionJours * jourMs - maintenant) / jourMs);
  if (jours <= 0) {
    return 'Effacée au prochain démarrage';
  }
  return jours === 1 ? 'Effacée demain' : `Effacée dans ${jours} jours`;
}

/** « Projets / Refonte » pour l'emplacement d'origine, sans le nom de l'élément lui-même. */
export function emplacementDOrigine(chemin: string): string {
  const morceaux = chemin.split('/').slice(0, -1).filter((morceau) => morceau !== 'assets');
  return morceaux.length === 0 ? 'à la racine' : `dans ${morceaux.join(' / ')}`;
}

const typesDImage: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

/** Nature d'une image d'après son nom, pour son adresse `data:`. */
export function typeDImage(nom: string): string {
  return typesDImage[/\.([^.]+)$/.exec(nom)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}
