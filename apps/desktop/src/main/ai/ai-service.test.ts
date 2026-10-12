import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lireHistoriqueIa } from '@notes/core';
import type { AiSettings } from '@notes/core';
import { contexteDeTest, MemoryLocalFs } from '@notes/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings/settings-store';
import { AiService, consigneACopier, ollamaSurLePoste } from './ai-service';
import { AiError } from './chat';
import type { ChatRequest, ChatResult } from './chat';
import type { GpuInfo } from './hardware';
import type { InstalledModel } from './ollama-client';

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
  cartes?: GpuInfo[];
  /** Part du modèle chargée en mémoire vidéo pendant l'appel (1 : tout). */
  partEnVram?: number;
}

async function monter(options: Montage = {}) {
  const dossier = await mkdtemp(join(tmpdir(), 'notes-ia-'));
  const reglages = new SettingsStore(join(dossier, 'settings.json'));
  const actuels = await reglages.lire();
  await reglages.ecrire({ ...actuels, ia: { ...actuels.ia, ...options.ia } });
  const fs = MemoryLocalFs.depuis({ 'Page/page.md': '' });
  let horloge = new Date(2026, 9, 5, 10, 0).getTime();
  const contexte = contexteDeTest(fs);
  const avancements: string[] = [];
  const envoyes: Array<{ modele: string; contexte?: number }> = [];
  const surHistorique = vi.fn();
  const vide: Discussion = async () => ({ texte: '', entree: 0, sortie: 0 });
  const service = new AiService({
    reglages,
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
  });
  return { service, contexte, avancements, envoyes, surHistorique };
}

const page = { fonction: 'relecture' as const, markdown: 'Un texte a relire.\n\n```js\nconst x = 1;\n```\n', titre: 'Page' };
const relu: Discussion = async () => ({ texte: 'Un texte à relire.\n\n[[BLOC-1]]\n', entree: 50, sortie: 20 });

describe('AiService : modèle local', () => {
  it('estime la durée d’un texte dont on ne connaît que la longueur, une fois le modèle déjà utilisé', async () => {
    const { service } = await monter({ ollama: relu });
    expect(await service.dureeEstimee('relecture', 1000)).toBeNull();
    await service.lancer(page);
    const court = await service.dureeEstimee('relecture', 1000);
    const long = await service.dureeEstimee('relecture', 10_000);
    expect(court).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(court!);
  });

  it('n’estime rien sans IA locale', async () => {
    const { service } = await monter({ ollama: relu, cartes: [] });
    expect(await service.dureeEstimee('memo', 1000)).toBeNull();
  });

  it('choisit seul le modèle qui tient dans la carte, avec un contexte qui y tient aussi', async () => {
    const { service, envoyes } = await monter({ ollama: relu });
    expect(await service.estimer(page)).toMatchObject({ ok: true, modele: 'qwen3:8b', automatique: true, dureeMs: null });
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
    const { service } = await monter({ ia: { modeles: { relecture: { modele: 'gemma3:12b' }, 'mise-au-propre': { modele: '' }, memo: { modele: '' } } } });
    expect(await service.estimer(page)).toEqual({ ok: false, message: 'gemma3:12b : Trop gros pour les 8 Go de la carte.' });
  });

  it('bloque l’IA locale sur une carte intégrée', async () => {
    const { service } = await monter({ cartes: [{ fabricant: 'amd', nom: 'AMD Radeon Graphics', vram: 512 * 1024 ** 2, dediee: false }] });
    expect(await service.estimer(page)).toMatchObject({ ok: false, message: expect.stringContaining('carte intégrée') });
  });

  it('abandonne un appel dont le modèle déborde de la mémoire vidéo, avec un message, sans l’écarter', async () => {
    const { service, contexte } = await monter({
      partEnVram: 0.7,
      ollama: async (requete) => {
        requete.surMorceau?.('Un début');
        // Le flux attend la suite ; c'est l'arrêt de Notes qui l'interrompt.
        await new Promise((resoudre) => requete.signal.addEventListener('abort', resoudre));
        throw new AiError('annule', 'Demande annulée.');
      },
    });
    const resultat = await service.lancer(page);
    expect(resultat).toMatchObject({ ok: false, annule: false, message: expect.stringContaining('ne tient pas entièrement dans la mémoire de la carte graphique') });
    expect(await lireHistoriqueIa(contexte)).toEqual([expect.objectContaining({ annule: true })]);
    // Le modèle reste proposé : la carte sera peut-être libre au prochain essai.
    expect(await service.estimer(page)).toMatchObject({ ok: true, modele: 'qwen3:8b' });
  });

  it('va au bout quand le modèle tient en mémoire vidéo', async () => {
    const { service } = await monter({
      ollama: async (requete) => {
        requete.surMorceau?.('Un texte');
        await new Promise((resoudre) => setTimeout(resoudre, 10));
        return { texte: 'Un texte à relire.\n\n[[BLOC-1]]\n', entree: 50, sortie: 20 };
      },
    });
    expect(await service.lancer(page)).toMatchObject({ ok: true, avertissements: [] });
  });

  it('garde une demande annulée dans l’historique, sortie comptée par Notes', async () => {
    const { service, contexte } = await monter({
      ollama: async (requete) => {
        requete.surMorceau?.('Un début de réponse');
        throw new AiError('annule', 'Demande annulée.');
      },
    });
    expect(await service.lancer(page)).toEqual({ ok: false, annule: true, message: 'Demande annulée.' });
    expect(await lireHistoriqueIa(contexte)).toEqual([expect.objectContaining({ annule: true, sortie: 6 })]);
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

  it('met au propre section par section : titres gardés et corrigés à part, lignes mises en liste, réponse qui invente écartée', async () => {
    const recus: Array<{ texte: string; sortieMax?: number }> = [];
    const { service, avancements, contexte } = await monter({
      ollama: async (requete) => {
        recus.push({ texte: requete.texte, ...(requete.sortieMax === undefined ? {} : { sortieMax: requete.sortieMax }) });
        if (requete.systeme.startsWith('Tu es correcteur')) {
          return { texte: '1. Agents\n2. Réseau\n3. Le vide absolu', entree: 10, sortie: 6 };
        }
        if (requete.texte.includes('Suite de')) {
          return { texte: '- Un réseau multicouche empile des couches denses, entraînées par descente de gradient.', entree: 30, sortie: 20 };
        }
        requete.surMorceau?.('- OpenClaw');
        return { texte: '## Agents\n\n- OpenClaw\n- Hermes Agent', entree: 40, sortie: 8 };
      },
    });
    const resultat = await service.lancer({ fonction: 'mise-au-propre', titre: 'Cours', markdown: '## Agents\nOpenClaw\nHermes agent\n\n### Resau\nSuite de\n\n### Vide\n' });
    expect(recus).toEqual([
      { texte: 'Titre de la section : Agents\nNotes :\n- OpenClaw\n- Hermes agent', sortieMax: 51 },
      { texte: 'Titre de la section : Resau\nNotes :\nSuite de', sortieMax: 44 },
      { texte: '1. Agents\n2. Resau\n3. Vide', sortieMax: 52 },
    ]);
    expect(resultat).toMatchObject({ ok: true, markdown: '## Agents\n\n- OpenClaw\n- Hermes Agent\n\n### Réseau\n\nSuite de\n\n### Vide\n' });
    expect(avancements).toEqual(['## Agents\n\n- OpenClaw']);
    expect(await lireHistoriqueIa(contexte)).toEqual([expect.objectContaining({ fonction: 'mise-au-propre', entree: 80, sortie: 34 })]);
  });

  it('dit Ollama sur le poste ou ailleurs', () => {
    expect(ollamaSurLePoste('http://localhost:11434')).toBe(true);
    expect(ollamaSurLePoste('http://127.0.0.1:11434')).toBe(true);
    expect(ollamaSurLePoste('http://192.0.2.10:11434')).toBe(false);
  });
});

describe('consigne à copier', () => {
  it('donne la consigne puis le texte tel quel, sans la phrase sur les blocs mis de côté', async () => {
    const { service } = await monter();
    const resultat = await service.consigne(page);
    expect(resultat.ok).toBe(true);
    const texte = resultat.ok ? resultat.texte : '';
    expect(texte.startsWith('Tu relis un texte en français')).toBe(true);
    expect(texte).not.toContain('[[BLOC');
    expect(texte).toContain('Ne résume pas');
    expect(texte.endsWith('Voici le texte :\n\nUn texte a relire.\n\n```js\nconst x = 1;\n```\n')).toBe(true);
    expect(await service.consigne({ ...page, markdown: '  ' })).toEqual({ ok: false, message: 'La page n’a pas de texte.' });
  });

  it('dit à l’autre outil qu’il reçoit la page entière, exemple de la consigne intact', async () => {
    const { service } = await monter();
    const resultat = await service.consigne({ ...page, fonction: 'mise-au-propre' });
    const texte = resultat.ok ? resultat.texte : '';
    expect(texte).toContain('- Présents :\n  - Paul');
    expect(texte).toContain('- Garde les liens et les URL tels quels.\n\nExemple');
    expect(texte).toContain('Tu reçois ici la page entière');
  });

  it('retire seulement la phrase sur les repères', () => {
    expect(consigneACopier('Relis. Les lignes [[BLOC-1]] restent telles quelles. Sans emoji.', 'Texte')).toBe('Relis. Sans emoji.\n\nVoici le texte :\n\nTexte\n');
  });
});
