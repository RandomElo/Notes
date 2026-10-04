import type { SpellcheckStep } from '../../../../shared/ipc-contract';

/** Taille lisible : « 47 Mo », « 1,8 Go ». */
export function taille(octets: number): string {
  if (octets >= 1e9) {
    return `${(octets / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
  }
  return `${Math.max(1, Math.round(octets / 1e6)).toLocaleString('fr-FR')} Mo`;
}

const pourcentage = (etape: SpellcheckStep): number => (etape.total === 0 ? 0 : Math.floor((100 * etape.fait) / etape.total));

/** Où en est une étape de l'installation, en une phrase courte. */
export function libelleDEtape(etape: SpellcheckStep): string {
  switch (etape.etat) {
    case 'a_faire':
      return `${taille(etape.total)} à télécharger`;
    case 'fait':
      return 'Installé';
    case 'echec':
      return 'Échec';
    case 'en_cours':
      switch (etape.phase) {
        case 'verification':
          return "Vérification de l'empreinte";
        case 'decompression':
          return `Décompression : ${pourcentage(etape)} %`;
        default:
          return `Téléchargement : ${pourcentage(etape)} % (${taille(etape.fait)} sur ${taille(etape.total)})`;
      }
  }
}

/** Avancement d'une étape entre 0 et 1, pour sa barre. */
export function avancement(etape: SpellcheckStep): number {
  if (etape.etat === 'fait') {
    return 1;
  }
  return etape.etat === 'en_cours' && etape.phase !== 'verification' && etape.total > 0 ? Math.min(1, etape.fait / etape.total) : 0;
}
