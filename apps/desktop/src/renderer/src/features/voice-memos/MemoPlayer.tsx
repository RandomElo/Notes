import { useEffect, useState } from 'react';

const typesAudio: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
};

/** Type MIME d'un fichier audio d'après son nom. */
export function typeAudio(nom: string): string {
  return typesAudio[nom.slice(nom.lastIndexOf('.') + 1).toLowerCase()] ?? 'audio/mp4';
}

interface MemoPlayerProps {
  octets: Uint8Array;
  nom: string;
  libelle: string;
  /** Le même mémo en WAV, décodé par le ffmpeg de Notes, quand le lecteur ne sait pas lire le format d'origine. */
  enWav?: () => Promise<Uint8Array | null>;
}

/**
 * Lecteur d'un mémo vocal (README §13). Les octets viennent du main ; ils
 * sont lus par une adresse `blob:` propre à la page, rendue à sa fermeture.
 * Un format que Chromium ne lit pas (AMR, WMA…) se rejoue en WAV.
 */
export function MemoPlayer({ octets, nom, libelle, enWav }: MemoPlayerProps) {
  const [source, definirSource] = useState<{ octets: Uint8Array; type: string }>({ octets, type: typeAudio(nom) });
  const [adresse, definirAdresse] = useState<string | null>(null);
  const [illisible, definirIllisible] = useState(false);
  useEffect(() => {
    definirSource({ octets, type: typeAudio(nom) });
  }, [octets, nom]);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([source.octets as Uint8Array<ArrayBuffer>], { type: source.type }));
    definirAdresse(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  const surErreur = (): void => {
    // Déjà rejoué en WAV, ou pas de décodeur à côté (corbeille) : rien de plus à essayer.
    if (enWav === undefined || source.octets !== octets) {
      definirIllisible(true);
      return;
    }
    void enWav().then((wav) => (wav === null ? definirIllisible(true) : definirSource({ octets: wav, type: 'audio/wav' })));
  };
  if (illisible) {
    return <p className="text-discret text-xs">Ce mémo ne s’écoute pas ici.</p>;
  }
  return adresse === null ? null : <audio controls preload="metadata" src={adresse} aria-label={libelle} onError={surErreur} className="h-8 w-full max-w-sm" />;
}
