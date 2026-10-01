import { RemoteFsError } from '@notes/core';
import type { RemoteEntry, RemoteFs } from '@notes/core';
import type { CompanionProcess } from './companion-process';
import type { CompanionCredentials, CompanionEntry, CompanionRequest, CompanionSessionInfo } from './protocol';

/**
 * RemoteFs du desktop : chaque opération est une requête au binaire
 * compagnon. Les identifiants sont gardés en mémoire jusqu'à fermer(), pour
 * rouvrir la session si le compagnon a dû être relancé.
 */
export class CompanionRemoteFs implements RemoteFs {
  private identifiants: CompanionCredentials | null;
  private sessionOuverte = false;

  constructor(
    private readonly processus: CompanionProcess,
    identifiants: CompanionCredentials,
  ) {
    this.identifiants = identifiants;
    processus.surArret(() => {
      this.sessionOuverte = false;
    });
  }

  /** Ouvre la session SMB. Appelé tout seul à la première opération si besoin. */
  async ouvrir(): Promise<void> {
    if (this.identifiants === null) {
      throw new RemoteFsError('non_connecte', 'Aucune connexion au NAS.');
    }
    this.sessionOuverte = false;
    await this.processus.envoyer({ op: 'connecter', ...this.identifiants });
    this.sessionOuverte = true;
  }

  /** Ferme la session, arrête le compagnon et oublie les identifiants. */
  fermer(): void {
    this.identifiants = null;
    this.sessionOuverte = false;
    this.processus.arreter();
  }

  async infosSession(): Promise<CompanionSessionInfo> {
    return (await this.envoyer({ op: 'infosSession' })) as CompanionSessionInfo;
  }

  async ping(): Promise<void> {
    await this.envoyer({ op: 'ping' });
  }

  async infos(chemin: string): Promise<RemoteEntry | null> {
    const resultat = (await this.envoyer({ op: 'infos', chemin })) as { entree: CompanionEntry | null };
    return resultat.entree;
  }

  async lister(chemin: string): Promise<RemoteEntry[]> {
    const resultat = (await this.envoyer({ op: 'lister', chemin })) as { entrees: CompanionEntry[] | null };
    return resultat.entrees ?? [];
  }

  async lire(chemin: string): Promise<Uint8Array> {
    const resultat = (await this.envoyer({ op: 'lire', chemin })) as { contenu: string };
    return new Uint8Array(Buffer.from(resultat.contenu, 'base64'));
  }

  async ecrire(chemin: string, contenu: Uint8Array): Promise<void> {
    await this.envoyer({ op: 'ecrire', chemin, contenu: Buffer.from(contenu).toString('base64') });
  }

  async creerDossier(chemin: string): Promise<void> {
    await this.envoyer({ op: 'creerDossier', chemin });
  }

  async renommer(chemin: string, vers: string): Promise<void> {
    await this.envoyer({ op: 'renommer', chemin, vers });
  }

  async supprimer(chemin: string): Promise<void> {
    await this.envoyer({ op: 'supprimer', chemin });
  }

  private async envoyer(requete: CompanionRequest): Promise<unknown> {
    if (!this.sessionOuverte) {
      await this.ouvrir();
    }
    return this.processus.envoyer(requete);
  }
}
