const formatUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Vrai pour un UUID écrit en minuscules avec tirets, quelle que soit sa version. */
export function estId(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && formatUuid.test(valeur);
}

/**
 * Construit un UUID v7 : 48 bits d'horodatage puis de l'aléa. Les identifiants
 * se trient donc par date de création. L'aléa (10 octets) est fourni par
 * l'appelant, car core n'a accès à aucune API de plateforme.
 */
export function genererId(horodatageMs: number, aleatoire: Uint8Array): string {
  if (aleatoire.length < 10) {
    throw new Error("Il faut 10 octets d'aléa pour un UUID v7.");
  }
  const octets = new Uint8Array(16);
  let reste = Math.floor(horodatageMs);
  for (let index = 5; index >= 0; index--) {
    octets[index] = reste % 256;
    reste = Math.floor(reste / 256);
  }
  octets.set(aleatoire.subarray(0, 10), 6);
  octets[6] = 0x70 | (octets[6]! & 0x0f); // version 7
  octets[8] = 0x80 | (octets[8]! & 0x3f); // variante RFC 9562

  const hexa = [...octets].map((octet) => octet.toString(16).padStart(2, '0')).join('');
  return `${hexa.slice(0, 8)}-${hexa.slice(8, 12)}-${hexa.slice(12, 16)}-${hexa.slice(16, 20)}-${hexa.slice(20)}`;
}
