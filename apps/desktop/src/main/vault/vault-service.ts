import { randomBytes } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { VaultError, estCheminAbsolu } from '@notes/core';
import type { VaultContext } from '@notes/core';
import type { VaultState } from '../../shared/ipc-contract';
import { NodeLocalFs } from '../fs/node-local-fs';
import { surveillerVault } from '../fs/watcher';
import type { SettingsStore } from '../settings/settings-store';

/**
 * Le vault ouvert par l'application : son dossier sur le disque, le contexte
 * que core utilise pour y travailler, et la surveillance de ses modifications.
 */
export class VaultService {
  private dossier: string | null = null;
  private arreterSurveillance: (() => void) | null = null;

  constructor(
    private readonly reglages: SettingsStore,
    private readonly surModification: () => void,
    private readonly dossierPropose: string = join(homedir(), 'Notes'),
  ) {}

  /** Rouvre le vault enregistré dans les réglages, s'il existe encore. */
  async demarrer(): Promise<void> {
    const enregistre = (await this.reglages.lire()).vaultLocal;
    if (enregistre !== null && (await estUnDossier(enregistre))) {
      this.ouvrir(enregistre);
    }
  }

  etat(): VaultState {
    return { dossier: this.dossier, dossierPropose: this.dossierPropose };
  }

  /** Choisit le dossier du vault, en le créant s'il manque, et le retient dans les réglages. */
  async definirDossier(chemin: string): Promise<VaultState> {
    const refus = raisonDuRefus(chemin);
    if (refus !== null) {
      throw new VaultError('chemin_invalide', refus);
    }
    const dossier = resolve(chemin);
    await mkdir(dossier, { recursive: true });
    await this.reglages.ecrire({ ...(await this.reglages.lire()), vaultLocal: dossier });
    this.ouvrir(dossier);
    return this.etat();
  }

  /** Contexte pour les opérations de core. Échoue si aucun vault n'est ouvert. */
  contexte(): VaultContext {
    if (this.dossier === null) {
      throw new VaultError('introuvable', "Aucun dossier de vault n'est choisi.");
    }
    return {
      fs: new NodeLocalFs(this.dossier),
      maintenant: () => Date.now(),
      octetsAleatoires: (taille) => new Uint8Array(randomBytes(taille)),
    };
  }

  arreter(): void {
    this.arreterSurveillance?.();
    this.arreterSurveillance = null;
  }

  private ouvrir(dossier: string): void {
    this.arreter();
    this.dossier = dossier;
    this.arreterSurveillance = surveillerVault(dossier, this.surModification);
  }
}

/**
 * Le vault est parcouru en entier à chaque lecture de l'arbre : on refuse les
 * dossiers qui contiennent manifestement autre chose que des notes.
 */
export function raisonDuRefus(chemin: unknown): string | null {
  if (!estCheminAbsolu(chemin)) {
    return 'Le dossier du vault doit être un chemin absolu.';
  }
  const dossier = resolve(chemin);
  if (dossier === '/' || dossier === resolve(homedir())) {
    return 'Choisis un dossier réservé aux notes, pas la racine du disque ni ton dossier personnel.';
  }
  return null;
}

async function estUnDossier(chemin: string): Promise<boolean> {
  try {
    return (await stat(chemin)).isDirectory();
  } catch {
    return false;
  }
}
