/**
 * Du titre d'une page au nom de son dossier. Le nom doit être accepté par SMB
 * et par tous les systèmes de fichiers visés ; l'identité de la page reste
 * son identifiant, pas ce nom.
 */

export const longueurMaxNom = 100;
export const longueurMaxTitre = 200;
export const titreParDefaut = 'Sans titre';

// eslint-disable-next-line no-control-regex
const caracteresInterdits = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** Renvoie la raison du refus d'un titre, ou null s'il est acceptable. */
export function verifierTitre(titre: string): string | null {
  if (titre.trim() === '') {
    return 'Le titre est vide.';
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(titre)) {
    return 'Le titre tient sur une seule ligne.';
  }
  if ([...titre.trim()].length > longueurMaxTitre) {
    return `Le titre dépasse ${longueurMaxTitre} caractères.`;
  }
  return null;
}

/** Titre assaini en nom de dossier : caractères interdits remplacés, longueur bornée. */
export function nomDeDossier(titre: string): string {
  let nom = titre.normalize('NFC').replace(caracteresInterdits, '-').replace(/\s+/g, ' ').trim();
  nom = [...nom].slice(0, longueurMaxNom).join('');
  // Un nom ne finit ni par un point ni par une espace, et ne commence pas par un
  // point : les dossiers cachés ne font pas partie de l'arborescence.
  nom = nom.replace(/[ .]+$/, '').replace(/^\.+/, '').trim();
  return nom === '' ? titreParDefaut : nom;
}

/** Clé de comparaison de deux noms : SMB ne distingue pas la casse. */
export function cleDeNom(nom: string): string {
  return nom.normalize('NFC').toLowerCase();
}

/** Premier nom libre parmi « Nom », « Nom 2 », « Nom 3 »... */
export function nomLibre(nomVoulu: string, nomsPris: Iterable<string>): string {
  const pris = new Set([...nomsPris].map(cleDeNom));
  if (!pris.has(cleDeNom(nomVoulu))) {
    return nomVoulu;
  }
  for (let numero = 2; ; numero++) {
    const suffixe = ` ${numero}`;
    const candidat = [...nomVoulu].slice(0, longueurMaxNom - suffixe.length).join('').trimEnd() + suffixe;
    if (!pris.has(cleDeNom(candidat))) {
      return candidat;
    }
  }
}
