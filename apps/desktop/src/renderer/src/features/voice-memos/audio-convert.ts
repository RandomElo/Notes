/**
 * Conversion d'un mémo vocal pour whisper.cpp (README §13) : n'importe quel
 * format que lit Chromium (AAC d'un `.m4a` de téléphone compris) devient un
 * WAV 16 kHz mono 16 bits. Le décodeur de la page fait le travail ; ce qu'il
 * ne lit pas (AMR, WMA, AIFF…) passe par le ffmpeg livré avec Notes, dans le
 * main (`main/audio/ffmpeg.ts`).
 */

export const frequenceDeWhisper = 16_000;

/** Moyenne des voies : un mémo stéréo devient mono. */
export function melangerVoies(voies: readonly Float32Array[]): Float32Array {
  if (voies.length === 1) {
    return voies[0]!;
  }
  const longueur = Math.min(...voies.map((voie) => voie.length));
  const mono = new Float32Array(longueur);
  for (const voie of voies) {
    for (let index = 0; index < longueur; index++) {
      mono[index]! += voie[index]! / voies.length;
    }
  }
  return mono;
}

/** WAV PCM 16 bits mono : en-tête RIFF de 44 octets, puis les échantillons bornés à [-1, 1]. */
export function encoderWav(echantillons: Float32Array, frequence: number): Uint8Array {
  const octets = new Uint8Array(44 + echantillons.length * 2);
  const vue = new DataView(octets.buffer);
  const ecrire = (position: number, texte: string): void => {
    for (let index = 0; index < texte.length; index++) {
      octets[position + index] = texte.charCodeAt(index);
    }
  };
  ecrire(0, 'RIFF');
  vue.setUint32(4, 36 + echantillons.length * 2, true);
  ecrire(8, 'WAVE');
  ecrire(12, 'fmt ');
  vue.setUint32(16, 16, true);
  vue.setUint16(20, 1, true); // PCM
  vue.setUint16(22, 1, true); // mono
  vue.setUint32(24, frequence, true);
  vue.setUint32(28, frequence * 2, true);
  vue.setUint16(32, 2, true);
  vue.setUint16(34, 16, true);
  ecrire(36, 'data');
  vue.setUint32(40, echantillons.length * 2, true);
  for (let index = 0; index < echantillons.length; index++) {
    const valeur = Math.max(-1, Math.min(1, echantillons[index]!));
    vue.setInt16(44 + index * 2, valeur < 0 ? valeur * 0x8000 : valeur * 0x7fff, true);
  }
  return octets;
}

/** Décode un fichier audio et le rend en WAV 16 kHz mono, avec sa durée en secondes. */
export async function versWav16k(octets: Uint8Array): Promise<{ wav: Uint8Array; duree: number }> {
  // Un contexte à 16 kHz : decodeAudioData rend l'audio à la fréquence du contexte.
  const contexte = new OfflineAudioContext(1, 1, frequenceDeWhisper);
  const audio = await contexte.decodeAudioData(octets.slice().buffer);
  const voies = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
  return { wav: encoderWav(melangerVoies(voies), frequenceDeWhisper), duree: audio.duration };
}
