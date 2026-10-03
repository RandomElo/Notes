// TextEncoder et TextDecoder existent dans Node comme dans une WebView, mais core se compile sans les
// types du DOM : on déclare ici le peu qu'on en utilise.
declare const TextEncoder: new () => { encode(texte: string): Uint8Array };
declare const TextDecoder: new (encodage: 'utf-8', options: { ignoreBOM: boolean }) => { decode(octets: Uint8Array): string };

const encodeur = new TextEncoder();
// ignoreBOM : la marque d'ordre d'octets reste dans le texte, comme le lit le disque (aller-retour sans perte).
const decodeur = new TextDecoder('utf-8', { ignoreBOM: true });

export function versOctets(texte: string): Uint8Array {
  return encodeur.encode(texte);
}

export function versTexte(octets: Uint8Array): string {
  return decodeur.decode(octets);
}
