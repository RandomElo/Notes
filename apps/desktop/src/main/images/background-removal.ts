import type { Worker } from 'node:worker_threads';
import creerWorker from './background-removal-worker?nodeWorker';
import { versMasque, versTenseur } from './background-removal-model';

export type RemovalResult = { ok: true; masque: Uint8Array } | { ok: false; message: string };

/** Un worker qui ne sert plus est arrêté : le modèle chargé occupe de la mémoire. */
const delaiDInactiviteMs = 120_000;
const delaiMaxMs = 60_000;

/**
 * Détourage d'une icône de page (docs/spec/editeur.md) : le modèle silueta tourne dans
 * un worker, par le moteur ONNX en WebAssembly, sans réseau ni module natif.
 * « dossier » contient le modèle et le moteur (scripts/prepare-models.sh).
 */
export class BackgroundRemoval {
  private worker: Worker | null = null;
  private prochain = 0;
  private readonly attentes = new Map<number, (resultat: RemovalResult) => void>();
  private minuteur: NodeJS.Timeout | undefined;

  constructor(private readonly dossier: string) {}

  masque(pixels: Uint8Array, cote: number): Promise<RemovalResult> {
    const worker = this.demarrer();
    const id = this.prochain++;
    clearTimeout(this.minuteur);
    return new Promise<RemovalResult>((resoudre) => {
      const delai = setTimeout(() => {
        this.attentes.delete(id);
        resoudre({ ok: false, message: 'Le détourage a pris trop de temps.' });
      }, delaiMaxMs);
      this.attentes.set(id, (resultat) => {
        clearTimeout(delai);
        resoudre(resultat);
      });
      worker.postMessage({ id, tenseur: versTenseur(pixels, cote), cote });
    }).finally(() => {
      if (this.attentes.size === 0) {
        this.minuteur = setTimeout(() => this.arreter(), delaiDInactiviteMs);
      }
    });
  }

  arreter(): void {
    clearTimeout(this.minuteur);
    void this.worker?.terminate();
    this.worker = null;
    for (const resoudre of this.attentes.values()) {
      resoudre({ ok: false, message: "Le détourage s'est arrêté." });
    }
    this.attentes.clear();
  }

  private demarrer(): Worker {
    if (this.worker !== null) {
      return this.worker;
    }
    const worker = creerWorker({ workerData: { dossier: this.dossier } });
    worker.on('message', (message: { id: number; sortie?: Float32Array; erreur?: string }) => {
      const resoudre = this.attentes.get(message.id);
      this.attentes.delete(message.id);
      resoudre?.(message.sortie === undefined ? { ok: false, message: message.erreur ?? "Le fond n'a pas pu être retiré." } : { ok: true, masque: versMasque(message.sortie) });
    });
    worker.on('error', (erreur) => {
      console.error('Détourage :', erreur.message);
      this.arreter();
    });
    worker.unref();
    this.worker = worker;
    return worker;
  }
}
