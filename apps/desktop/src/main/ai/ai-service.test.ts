import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lireHistoriqueIa } from '@notes/core';
import type { AiSettings } from '@notes/core';
import { MemoryLocalFs, contexteDeTest } from '@notes/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { consignesParDefaut } from '../../shared/ai-contract';
import { SecretStore } from '../secrets/secret-store';
import { SettingsStore } from '../settings/settings-store';
import { AiService, cleOpenAi, cleValide } from './ai-service';
import { AiError } from './chat';
import type { ChatRequest, ChatResult } from './chat';
import { compterEntree } from './token-count';

const chiffre = {
  disponible: () => true,
  chiffrer: (texte: string) => Buffer.from(texte, 'utf8').reverse(),
  dechiffrer: (donnees: Buffer) => Buffer.from(donnees).reverse().toString('utf8'),
};

type Discussion = (requete: ChatRequest) => Promise<ChatResult>;

async function monter(options: { ia?: Partial<AiSettings>; ollama?: Discussion; openai?: Discussion } = {}) {
  const dossier = await mkdtemp(join(tmpdir(), 'notes-ia-'));
  const reglages = new SettingsStore(join(dossier, 'settings.json'));
  const actuels = await reglages.lire();
  await reglages.ecrire({ ...actuels, ia: { ...actuels.ia, ...options.ia } });
  const secrets = new SecretStore(join(dossier, 'secrets.enc'), chiffre);
  const fs = MemoryLocalFs.depuis({ 'Page/page.md': '' });
  let horloge = new Date(2026, 9, 5, 10, 0).getTime();
  const contexte = contexteDeTest(fs);
  const avancements: string[] = [];
  const surHistorique = vi.fn();
  const service = new AiService({
    reglages,
    secrets,
    contexte: () => contexte,
    enSerie: (tache) => tache(),
    surAvancement: ({ texte }) => avancements.push(texte),
    surHistorique,
    maintenant: () => (horloge += 1000),
    octetsAleatoires: (taille) => crypto.getRandomValues(new Uint8Array(taille)),
    ollama: { lister: async () => ['ministral-3:8b'], discuter: async (_adresse, requete) => (options.ollama ?? (async () => ({ texte: '', entree: 0, sortie: 0 })))(requete) },
    openai: { lister: async () => ['gpt-5.4-mini'], discuter: async (_cle, requete) => (options.openai ?? (async () => ({ texte: '', entree: 0, sortie: 0 })))(requete) },
  });
  return { service, secrets, dossier, contexte, avancements, surHistorique };
}

const page = { fonction: 'relecture' as const, markdown: 'Un texte a relire.\n\n```js\nconst x = 1;\n```\n', titre: 'Page' };
const local = { modeles: { relecture: { fournisseur: 'ollama' as const, modele: 'ministral-3:8b' }, 'mise-au-propre': { fournisseur: 'ollama' as const, modele: '' } } };
const distant = { modeles: { relecture: { fournisseur: 'openai' as const, modele: 'gpt-5.4-mini' }, 'mise-au-propre': { fournisseur: 'ollama' as const, modele: '' } } };

describe('AiService', () => {
  it('demande de choisir un modèle avant toute estimation', async () => {
    const { service } = await monter();
    expect(await service.estimer(page)).toEqual({ ok: false, message: 'Choisis d’abord un modèle pour cette fonction dans les réglages.' });
    expect(await service.estimer({ ...page, fonction: 'autre' })).toEqual({ ok: false, message: 'Demande illisible.' });
  });

  it('estime sans coût ni durée un premier appel local, puis se cale sur lui', async () => {
    const { service } = await monter({ ia: local, ollama: async () => ({ texte: 'Un texte à relire.\n\n[[BLOC-1]]\n', entree: 50, sortie: 20 }) });
    const avant = await service.estimer(page);
    expect(avant).toMatchObject({ ok: true, fournisseur: 'ollama', coutUsd: null, dureeMs: null, appelsConnus: 0, tarifInconnu: false });
    await service.lancer(page);
    const apres = await service.estimer(page);
    expect(apres).toMatchObject({ ok: true, entree: 50, sortie: 20, appelsConnus: 1 });
    expect(apres.ok && apres.dureeMs).toBeGreaterThan(0);
  });

  it('ne montre pas le code au modèle et le remet à sa place dans la proposition nettoyée', async () => {
    let envoye = '';
    const { service, avancements, surHistorique, contexte } = await monter({
      ia: local,
      ollama: async (requete) => {
        envoye = requete.texte;
        requete.surMorceau?.('Voici');
        return { texte: 'Voici le texte relu :\n\nUn texte à relire 🚀.\n\n[[BLOC-1]]\n', entree: 50, sortie: 20 };
      },
    });
    const resultat = await service.lancer(page);
    expect(envoye).toBe('Un texte a relire.\n\n[[BLOC-1]]\n');
    expect(resultat).toMatchObject({ ok: true, markdown: 'Un texte à relire.\n\n```js\nconst x = 1;\n```\n', avertissements: [] });
    expect(avancements).toEqual(['Voici']);
    expect(surHistorique).toHaveBeenCalledOnce();
    expect(await lireHistoriqueIa(contexte)).toEqual([expect.objectContaining({ fournisseur: 'ollama', entree: 50, sortie: 20, coutUsd: null, annule: false })]);
  });

  it('chiffre un appel à OpenAI : estimation et coût réel au tarif du modèle', async () => {
    const { service, secrets, contexte } = await monter({ ia: distant, openai: async () => ({ texte: 'Un texte à relire.\n\n[[BLOC-1]]', entree: 1000, sortie: 400 }) });
    expect(await service.lancer(page)).toEqual({ ok: false, annule: false, message: 'Aucune clé OpenAI n’est enregistrée sur ce poste.' });
    await service.enregistrerCle('sk-proj-abcdefghijklmnopqrstuvwxyz');
    expect(await secrets.lire(cleOpenAi)).toBe('sk-proj-abcdefghijklmnopqrstuvwxyz');
    const estimation = await service.estimer(page);
    expect(estimation.ok && estimation.coutUsd).toBeCloseTo((estimation.ok ? estimation.entree * 0.75 + estimation.sortie * 4.5 : 0) / 1e6);
    const resultat = await service.lancer(page);
    expect(resultat.ok && resultat.appel.coutUsd).toBeCloseTo((1000 * 0.75 + 400 * 4.5) / 1e6);
    const [appel] = await lireHistoriqueIa(contexte);
    expect(appel!.estimation.entreeComptee).toBe(await compterEntree('openai', consignesParDefaut.relecture, 'Un texte a relire.\n\n[[BLOC-1]]\n'));
    expect((await service.etat()).depenseDuJourUsd).toBeCloseTo(0.00255);
  });

  it('garde une demande annulée dans l’historique, sortie comptée par Notes', async () => {
    const { service, contexte } = await monter({
      ia: distant,
      openai: async (requete) => {
        requete.surMorceau?.('Un début de réponse');
        throw new AiError('annule', 'Demande annulée.');
      },
    });
    await service.enregistrerCle('sk-proj-abcdefghijklmnopqrstuvwxyz');
    expect(await service.lancer(page)).toEqual({ ok: false, annule: true, message: 'Demande annulée.' });
    expect(await lireHistoriqueIa(contexte)).toEqual([expect.objectContaining({ annule: true, sortie: 4 })]);
  });

  it('prévient quand le seuil du mois serait dépassé', async () => {
    const { service } = await monter({ ia: { ...distant, seuilMensuelUsd: 0 } });
    expect(await service.estimer(page)).toMatchObject({ ok: true, seuilMensuelUsd: 0, seuilDepasse: true });
  });

  it('dit quand un tarif manque', async () => {
    const { service } = await monter({ ia: { modeles: { relecture: { fournisseur: 'openai', modele: 'gpt-6-luna' }, 'mise-au-propre': { fournisseur: 'ollama', modele: '' } } } });
    expect(await service.estimer(page)).toMatchObject({ ok: true, coutUsd: null, tarifInconnu: true });
  });

  it('n’accepte qu’une clé plausible, et ne l’écrit jamais en clair', async () => {
    const { service, dossier } = await monter();
    expect(cleValide('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(cleValide('mot de passe')).toBe(false);
    await service.enregistrerCle('sk-proj-abcdefghijklmnopqrstuvwxyz');
    expect(await readFile(join(dossier, 'secrets.enc'), 'utf8')).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(await service.etat())).not.toContain('sk-proj');
    expect((await service.oublierCle()).cleOpenAi).toBe('absent');
  });

  it('refuse une page trop longue pour un modèle local', async () => {
    const { service } = await monter({ ia: local });
    expect(await service.estimer({ ...page, markdown: 'mot '.repeat(60_000) })).toMatchObject({ ok: false });
  });
});
