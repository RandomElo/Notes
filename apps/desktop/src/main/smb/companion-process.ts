import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { RemoteFsError, versCodeErreur } from '@notes/core';
import type { CompanionRequest, CompanionResponse } from './protocol';

/** Ce dont on a besoin d'un processus enfant, pour pouvoir le simuler en test. */
export interface CompanionChild {
  stdin: Writable;
  stdout: Readable;
  on(evenement: 'exit', ecouteur: () => void): unknown;
  on(evenement: 'error', ecouteur: (erreur: Error) => void): unknown;
  kill(): unknown;
}

export type CompanionLauncher = () => CompanionChild;

interface PendingRequest {
  resoudre: (resultat: unknown) => void;
  rejeter: (erreur: Error) => void;
  minuteur: NodeJS.Timeout;
}

const delaiParDefautMs = 45_000;

/** Lance le binaire sans rien lui transmettre de l'environnement du poste. */
export function lanceurDeBinaire(cheminBinaire: string): CompanionLauncher {
  return () => spawn(cheminBinaire, [], { stdio: ['pipe', 'pipe', 'ignore'], env: {} });
}

/**
 * Pilote le binaire compagnon : le lance à la première requête, associe
 * chaque réponse à sa requête, et le relance s'il s'est arrêté. Il ne garde
 * et ne journalise aucune requête, puisqu'elles peuvent porter le mot de passe.
 */
export class CompanionProcess {
  private enfant: CompanionChild | null = null;
  private prochainId = 1;
  private reste = '';
  private readonly enAttente = new Map<number, PendingRequest>();
  private readonly ecouteursArret = new Set<() => void>();

  constructor(private readonly lancer: CompanionLauncher) {}

  /** Appelé chaque fois que le processus s'arrête : la session SMB est alors perdue. */
  surArret(ecouteur: () => void): void {
    this.ecouteursArret.add(ecouteur);
  }

  envoyer(requete: CompanionRequest, delaiMs = delaiParDefautMs): Promise<unknown> {
    let enfant: CompanionChild;
    try {
      enfant = this.demarrer();
    } catch {
      return Promise.reject(new RemoteFsError('interne', 'Le client SMB embarqué ne démarre pas.'));
    }
    const id = this.prochainId++;
    return new Promise((resoudre, rejeter) => {
      const minuteur = setTimeout(() => {
        this.enAttente.delete(id);
        rejeter(new RemoteFsError('injoignable', "Le NAS n'a pas répondu à temps."));
        // Une réponse en retard arriverait désynchronisée : on repart d'un processus neuf.
        this.arreter();
      }, delaiMs);
      this.enAttente.set(id, { resoudre, rejeter, minuteur });
      enfant.stdin.write(`${JSON.stringify({ id, ...requete })}\n`);
    });
  }

  /** Ferme l'entrée du compagnon, ce qui lui fait fermer la session et s'arrêter. */
  arreter(): void {
    const enfant = this.enfant;
    if (enfant === null) {
      return;
    }
    this.oublierEnfant(enfant);
    enfant.stdin.end();
    // Filet de sécurité si le compagnon est bloqué sur le réseau.
    setTimeout(() => enfant.kill(), 2_000).unref();
  }

  private demarrer(): CompanionChild {
    if (this.enfant !== null) {
      return this.enfant;
    }
    const enfant = this.lancer();
    this.enfant = enfant;
    this.reste = '';
    enfant.stdout.setEncoding('utf8');
    enfant.stdout.on('data', (morceau: string) => {
      if (this.enfant === enfant) {
        this.recevoir(morceau);
      }
    });
    enfant.stdin.on('error', () => this.oublierEnfant(enfant));
    enfant.on('error', () => this.oublierEnfant(enfant));
    enfant.on('exit', () => this.oublierEnfant(enfant));
    return enfant;
  }

  private recevoir(morceau: string): void {
    const lignes = (this.reste + morceau).split('\n');
    this.reste = lignes.pop() ?? '';
    for (const ligne of lignes) {
      if (ligne.trim() !== '') {
        this.traiterLigne(ligne);
      }
    }
  }

  private traiterLigne(ligne: string): void {
    let reponse: CompanionResponse;
    try {
      reponse = JSON.parse(ligne) as CompanionResponse;
    } catch {
      return;
    }
    const attente = this.enAttente.get(reponse.id);
    if (attente === undefined) {
      return;
    }
    this.enAttente.delete(reponse.id);
    clearTimeout(attente.minuteur);
    if (reponse.ok) {
      attente.resoudre(reponse.resultat ?? null);
    } else {
      attente.rejeter(
        new RemoteFsError(versCodeErreur(reponse.erreur?.code), reponse.erreur?.message ?? 'Erreur du client SMB.'),
      );
    }
  }

  private oublierEnfant(enfant: CompanionChild): void {
    if (this.enfant !== enfant) {
      return;
    }
    this.enfant = null;
    for (const [id, attente] of this.enAttente) {
      clearTimeout(attente.minuteur);
      attente.rejeter(new RemoteFsError('interne', "Le client SMB embarqué s'est arrêté."));
      this.enAttente.delete(id);
    }
    for (const ecouteur of this.ecouteursArret) {
      ecouteur();
    }
  }
}
