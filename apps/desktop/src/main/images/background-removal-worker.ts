import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import type * as Ort from 'onnxruntime-web';
import type { InferenceSession, Tensor } from 'onnxruntime-web';

/**
 * Worker du détourage : charge le moteur ONNX et le modèle à la première
 * demande, puis répond à chaque tenseur par la carte de premier plan. Il ne
 * lit que les deux fichiers de son dossier, livrés avec l'application.
 */
interface Moteur {
  session: InferenceSession;
  Tensor: typeof Tensor;
}

const { dossier } = workerData as { dossier: string };
let moteur: Promise<Moteur> | null = null;

async function charger(): Promise<Moteur> {
  const ort = (await import(/* @vite-ignore */ pathToFileURL(join(dossier, 'ort.wasm.bundle.min.mjs')).href)) as typeof Ort;
  ort.env.wasm.wasmBinary = await readFile(join(dossier, 'ort-wasm-simd-threaded.wasm'));
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(await readFile(join(dossier, 'silueta.onnx')));
  return { session, Tensor: ort.Tensor };
}

parentPort?.on('message', (demande: { id: number; tenseur: Float32Array; cote: number }) => {
  void (async () => {
    try {
      moteur ??= charger();
      const { session, Tensor: Tenseur } = await moteur;
      const entree = new Tenseur('float32', demande.tenseur, [1, 3, demande.cote, demande.cote]);
      const sorties = await session.run({ [session.inputNames[0] as string]: entree });
      const carte = sorties[session.outputNames[0] as string]?.data;
      if (!(carte instanceof Float32Array)) {
        throw new Error('sortie inattendue du modèle');
      }
      parentPort?.postMessage({ id: demande.id, sortie: carte });
    } catch (erreur) {
      moteur = null;
      const absent = erreur instanceof Error && 'code' in erreur && erreur.code === 'ENOENT';
      parentPort?.postMessage({
        id: demande.id,
        erreur: absent ? "Le détourage n'est pas livré avec cette version de Notes." : "Le fond n'a pas pu être retiré.",
      });
      console.error('Détourage :', erreur instanceof Error ? erreur.message : erreur);
    }
  })();
});
