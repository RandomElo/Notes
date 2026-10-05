import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as FluxWeb } from 'node:stream/web';

export type Telecharger = (adresse: string, signal: AbortSignal) => Promise<Response>;

export interface Telechargement {
  adresse: string;
  /** Nom montré dans les messages. */
  libelle: string;
  /** Taille exacte attendue, quand on la connaît. Sinon, `tailleMax` borne ce qu'on accepte. */
  taille?: number;
  tailleMax?: number;
}

/**
 * Télécharge dans un fichier en calculant l'empreinte SHA-256 au passage, et
 * la rend. Un serveur qui envoie plus que prévu est coupé tout de suite : il
 * n'est pas celui qu'on attend, inutile de remplir le disque.
 */
export async function telechargerVers(
  fichier: string,
  { adresse, libelle, taille, tailleMax }: Telechargement,
  telecharger: Telecharger,
  signal: AbortSignal,
  surOctets: (recus: number) => void = () => undefined,
): Promise<string> {
  const reponse = await telecharger(adresse, signal);
  if (!reponse.ok || reponse.body === null) {
    throw new Error(`${libelle} : le téléchargement a échoué (réponse ${reponse.status}).`);
  }
  const limite = taille ?? tailleMax ?? Number.POSITIVE_INFINITY;
  const hachage = createHash('sha256');
  let recus = 0;
  const suivi = new Transform({
    transform: (morceau: Buffer, _encodage, suite) => {
      recus += morceau.length;
      if (recus > limite) {
        suite(new Error(`${libelle} : le fichier reçu est plus gros que prévu. Rien n'a été installé.`));
        return;
      }
      hachage.update(morceau);
      surOctets(recus);
      suite(null, morceau);
    },
  });
  await pipeline(Readable.fromWeb(reponse.body as FluxWeb<Uint8Array>), suivi, createWriteStream(fichier), { signal });
  if (taille !== undefined && recus !== taille) {
    throw new Error(`${libelle} : le téléchargement s'est arrêté avant la fin.`);
  }
  return hachage.digest('hex');
}
