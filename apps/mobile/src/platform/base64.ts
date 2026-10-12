/** Les octets passent le pont Capacitor en base64, dans les deux sens. */

const morceau = 0x8000;

export function versBase64(octets: Uint8Array): string {
  let binaire = '';
  for (let debut = 0; debut < octets.length; debut += morceau) {
    binaire += String.fromCharCode(...octets.subarray(debut, debut + morceau));
  }
  return btoa(binaire);
}

export function depuisBase64(texte: string): Uint8Array {
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) {
    octets[i] = binaire.charCodeAt(i);
  }
  return octets;
}
