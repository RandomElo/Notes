import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lireHistoriqueIa } from '@notes/core';
import type { AiSettings } from '@notes/core';
import { contexteDeTest, MemoryLocalFs } from '@notes/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { consignesParDefaut } from '../../shared/ai-contract';
import { SecretStore } from '../secrets/secret-store';
import { SettingsStore } from '../settings/settings-store';
import { AiService, cleLitellm, cleValide, ollamaSurLePoste } from './ai-service';
import { AiError } from './chat';
import type { ChatRequest, ChatResult } from './chat';
import type { GpuInfo } from './hardware';
import type { InstalledModel } from './ollama-client';
import { compterEntree } from './token-count';

const chiffre = {
  disponible: () => true,
  chiffrer: (texte: string) => Buffer.from(texte, 'utf8').reverse(),
  dechiffrer: (donnees: Buffer) => Buffer.from(donnees).reverse().toString('utf8'),
};

type Discussion = (requete: ChatRequest) => Promise<ChatResult>;

const radeon: GpuInfo = { fabricant: 'amd', nom: 'AMD Radeon RX 7600', vram: 8_573_157_376, dediee: true };
const installes: InstalledModel[] = [
  { nom: 'qwen3:8b', taille: 5_225_388_164, parametres: '8.2B', famille: 'qwen3' },
  { nom: 'gemma3:12b', taille: 8_149_190_253, parametres: '12.2B', famille: 'gemma3' },
];
const architecture = { 'general.architecture': 'qwen3', 'qwen3.block_count': 36, 'qwen3.attention.head_count': 32, 'qwen3.attention.head_count_kv': 8, 'qwen3.attention.key_length': 128 };

interface Montage {
  ia?: Partial<AiSettings>;
  ollama?: Discussion;
  litellm?: Discussion;
  cartes?: GpuInfo[];
  /** Part du modèle chargée en mémoire vidéo après un appel (1 : tout). */
  partEnVram?: number;
}

async function monter(options: Montage = {}) {
  const dossier = await mkdtemp(join(tmpdir(), 'notes-ia-'));
  const reglages = new SettingsStore(join(dossier, 'settings.json'));
  const actuels = await reglages.lire();
  await reglages.ecrire({ ...actuels, ia: { ...actuels.ia, ...options.ia } });
  const secrets = new SecretStore(join(dossier, 'secrets.enc'), chiffre);
  const fs = MemoryLocalFs.depuis({ 'Page/page.md': '' });
  let horloge = new Date(2026, 9, 5, 10, 0).getTime();
  const contexte = contexteDeTest(fs);
  const avancements: string[] = [];
  const envoyes: Array<{ modele: string; contexte?: number }> = [];
  const surHistorique = vi.fn();
  const vide: Discussion = async () => ({ texte: '', entree: 0, sortie: 0 });
  const service = new AiService({
    reglages,
    secrets,
    contexte: () => contexte,
    enSerie: (tache) => tache(),
    surAvancement: ({ texte }) => avancements.push(texte),
    surHistorique,
    cartes: async () => options.cartes ?? [radeon],
    maintenant: () => (horloge += 1000),
    octetsAleatoires: (taille) => crypto.getRandomValues(new Uint8Array(taille)),
    ollama: {
      lister: async () => installes,
      decrire: async () => architecture,
      occupation: async () => envoyes.slice(-1).map(({ modele }) => ({ nom: modele, taille: 6e9, enVram: 6e9 * (options.partEnVram ?? 1) })),
      discuter: async (_adresse, requete) => {
        envoyes.push({ modele: requete.modele, ...(requete.contexte === undefined ? {} : { contexte: requete.contexte }) });
        return (options.ollama ?? vide)(requete);
      },
    },
    litellm: {
      lister: async () => [{ nom: 'gpt-5.6-luna', tarif: { entree: 0.2, sortie: 1.2 } }, { nom: 'sans-tarif', tarif: null }],
      discuter: async (_adresse, _cle, requete) => (options.litellm ?? vide)(requete),
    },
  });
  return { service, secrets, dossier, contexte, avancements, envoyes, surHistorique };
}

const page = { fonction: 'relecture' as const, markdown: 'Un texte a relire.\n\n```js\nconst x = 1;\n```\n', titre: 'Page' };
const parLitellm = (modele = 'gpt-5.6-luna'): Partial<AiSettings> => ({
  adresseLitellm: 'http://192.0.2.10:4000',
  modeles: { relecture: { fournisseur: 'litellm', modele }, 'mise-au-propre': { fournisseur: 'ollama', modele: '' }, memo: { fournisseur: 'ollama', modele: '' } },
});
const relu: Discussion = async () => ({ texte: 'Un texte à relire.\n\n[[BLOC-1]]\n', entree: 50, sortie: 20 });

describe('AiService : modèle local', () => {
  it('choisit seul le modèle qui tient dans la carte, avec un contexte qui y tient aussi', async () => {
    const { service, envoyes } = await monter({ ollama: relu });
    expect(await service.estimer(page)).toMatchObject({ ok: true, fournisseur: 'ollama', modele: 'qwen3:8b', automatique: true, coutUsd: null, dureeMs: null });
    await service.lancer(page);
    expect(envoyes).toEqual([{ modele: 'qwen3:8b', contexte: 4096 }]);
    const etat = await service.etat();
    expect(etat.carte).toEqual({ nom: 'AMD Radeon RX 7600', vram: 8_573_157_376, dediee: true });
    expect(etat.local).toMatchObject({ disponible: true, automatique: 'qwen3:8b' });
    expect(etat.local.modeles.find((modele) => modele.nom === 'gemma3:12b')).toMatchObject({ utilisable: false });
  });

  it('se cale sur le premier appel', async () => {
    const { service } = await monter({ ollama: relu });
    await service.lancer(page);
    const apres = await service.estimer(page);
    expect(apres).toMatchObject({ ok: true, entree: 50, sortie: 20, appelsConnus: 1 });
    expect(apres.ok && apres.dureeMs).toBeGreaterThan(0);
  });

  it('refuse un modèle choisi à la main qui ne tient pas', async () => {
    const { service } = await monter({ ia: { modeles: { relecture: { fournisseur: 'ollama', modele: 'gemma3:12b' }, 'mise-au-propre': { fournisseur: 'ollama', modele: '' }, memo: { fournisseur: 'ollama', modele: '' } } } });
    expect(await service.estimer(page)).toEqual({ ok: false, message: 'gemma3:12b : Trop gros pour les 8 Go de la carte.' });
  });

  it('bloque l’IA locale sur une carte intégrée', async () => {
    const { service } = await monter({ cartes: [{ fabricant: 'amd', nom: 'AMD Radeon Graphics', vram: 512 * 1024 ** 2, dediee: false }] });
    expect(await service.estimer(page)).toMatchObject({ ok: false, message: expect.stringContaining('carte intégrée') });
  });

  it('écarte un modèle qui a débordé de la mémoire vidéo, et le dit', async () => {
    const { service } = await monter({ ollama: relu, partEnVram: 0.7 });
    const resultat = await service.lancer(page);
    expect(resultat.ok && resultat.avertissements).toEqual([expect.stringContaining('a débordé de la mémoire vidéo')]);
    // gemma3:12b ne tient pas non plus : plus rien de local.
    expect(await service.estimer(page)).toMatchObject({ ok: false });
  });

  it('refuse une page trop longue pour la mémoire vidéo', async () => {
    const { service } = await monter();
    expect(await service.estimer({ ...page, markdown: 'mot '.repeat(30_000) })).toMatchObject({ ok: false, message: expect.stringContaining('trop longue pour qwen3:8b') });
  });

  it('ne montre pas le code au modèle et le remet à sa place dans la proposition nettoyée', async () => {
    let envoye = '';
    const { service, avancements, surHistorique, contexte } = await monter({
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
    expect(await lireHistoriqueIa(contexte)).toEqual([expect.objectContaining({ fournisseur: 'ollama', modele: 'qwen3:8b', entree: 50, sortie: 20, coutUsd: null, annule: false })]);
  });

  it('dit Ollama sur le poste ou ailleurs', () => {
    expect(ollamaSurLePoste('http://localhost:11434')).toBe(true);
    expect(ollamaSurLePoste('http://127.0.0.1:11434')).toBe(true);
    expect(ollamaSurLePoste('http://192.0.2.10:11434')).toBe(false);
  });
});

describe('AiService : LiteLLM', () => {
  it('chiffre un appel au tarif donné par LiteLLM : estimation, coût réel, dépense du jour', async () => {
    const { service, secrets, contexte } = await monter({ ia: parLitellm(), litellm: async () => ({ texte: 'Un texte à relire.\n\n[[BLOC-1]]', entree: 1000, sortie: 400 }) });
    expect(await service.lancer(page)).toEqual({ ok: false, annule: false, message: 'Aucune clé LiteLLM n’est enregistrée sur ce poste.' });
    await service.enregistrerCle('sk-litellm-cle-virtuelle');
    expect(await secrets.lire(cleLitellm)).toBe('sk-litellm-cle-virtuelle');
    const estimation = await service.estimer(page);
    expect(estimation.ok && estimation.coutUsd).toBeCloseTo((estimation.ok ? estimation.entree * 0.2 + estimation.sortie * 1.2 : 0) / 1e6);
    const resultat = await service.lancer(page);
    expect(resultat.ok && resultat.appel.coutUsd).toBeCloseTo((1000 * 0.2 + 400 * 1.2) / 1e6);
    const [appel] = await lireHistoriqueIa(contexte);
    expect(appel!.estimation.entreeComptee).toBe(await compterEntree('litellm', consignesParDefaut.relecture, 'Un texte a relire.\n\n[[BLOC-1]]\n'));
    expect((await service.etat()).depenseDuJourUsd).toBeCloseTo(0.00068);
    expect((await service.lireHistorique()).litellmChoisi).toBe(true);
  });

  it('montre les modèles de LiteLLM avec leur tarif et d’où il vient', async () => {
    const { service } = await monter({ ia: { ...parLitellm(), tarifs: { 'sans-tarif': { entree: 1, sortie: 2 } } } });
    expect((await service.etat()).modelesLitellm).toBeNull();
    await service.enregistrerCle('sk-litellm-cle-virtuelle');
    expect((await service.etat()).modelesLitellm).toEqual([
      { nom: 'gpt-5.6-luna', tarif: { entree: 0.2, sortie: 1.2 }, source: 'litellm' },
      { nom: 'sans-tarif', tarif: { entree: 1, sortie: 2 }, source: 'reglages' },
    ]);
  });

  it('garde une demande annulée dans l’historique, sortie comptée par Notes', async () => {
    const { service, contexte } = await monter({
      ia: parLitellm(),
      litellm: async (requete) => {
        requete.surMorceau?.('Un début de réponse');
        throw new AiError('annule', 'Demande annulée.');
      },
    });
    await service.enregistrerCle('sk-litellm-cle-virtuelle');
    expect(await service.lancer(page)).toEqual({ ok: false, annule: true, message: 'Demande annulée.' });
    expect(await lireHistoriqueIa(contexte)).toEqual([expect.objectContaining({ annule: true, sortie: 4 })]);
  });

  it('prévient quand le seuil du mois serait dépassé, et quand un tarif manque', async () => {
    const avecSeuil = await monter({ ia: { ...parLitellm(), seuilMensuelUsd: 0 } });
    await avecSeuil.service.enregistrerCle('sk-litellm-cle-virtuelle');
    expect(await avecSeuil.service.estimer(page)).toMatchObject({ ok: true, seuilMensuelUsd: 0, seuilDepasse: true });
    const sansTarif = await monter({ ia: parLitellm('sans-tarif') });
    await sansTarif.service.enregistrerCle('sk-litellm-cle-virtuelle');
    expect(await sansTarif.service.estimer(page)).toMatchObject({ ok: true, coutUsd: null, tarifInconnu: true });
  });

  it('n’accepte qu’une clé plausible, et ne l’écrit jamais en clair', async () => {
    const { service, dossier } = await monter();
    expect(cleValide('sk-litellm-cle-virtuelle')).toBe(true);
    expect(cleValide('mot de passe')).toBe(false);
    await service.enregistrerCle('sk-litellm-cle-virtuelle');
    expect(await readFile(join(dossier, 'secrets.enc'), 'utf8')).not.toContain('sk-litellm');
    expect(JSON.stringify(await service.etat())).not.toContain('sk-litellm');
    expect((await service.oublierCle()).cleLitellm).toBe('absent');
  });

  it('cache la dépense quand aucune fonction ne passe par LiteLLM', async () => {
    const { service, surHistorique } = await monter();
    expect((await service.lireHistorique()).litellmChoisi).toBe(false);
    await service.enregistrerReglages({ ...(await service.etat()).reglages, ...parLitellm() });
    expect(surHistorique).toHaveBeenCalled();
    expect((await service.lireHistorique()).litellmChoisi).toBe(true);
  });
});
