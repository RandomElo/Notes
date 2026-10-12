import { describe, expect, it } from 'vitest';
import { carteRetenue, detecterCartes } from './hardware';
import type { GpuInfo, HardwareSources } from './hardware';
import { evaluerModeles, kvParTokenDe, lireParametres, modeleConseille } from './local-models';
import type { LocalModel } from './local-models';

// Mesures réelles du 2026-10-05 : une Radeon de 8 Go et trois modèles d'Ollama.
const radeon: GpuInfo = { fabricant: 'amd', nom: 'AMD Radeon RX 7600', vram: 8_573_157_376, dediee: true };
const qwen: LocalModel = { nom: 'qwen3:8b', taille: 5_225_388_164, parametres: 8.2, famille: 'qwen3', kvParToken: 147_456 };
const ministral: LocalModel = { nom: 'ministral-3:8b', taille: 6_022_000_000, parametres: 8.9, famille: 'mistral3', kvParToken: 139_264 };
const gemma: LocalModel = { nom: 'gemma3:12b', taille: 8_149_190_253, parametres: 12.2, famille: 'gemma3', kvParToken: 393_216 };
const petit: LocalModel = { nom: 'llama3.2:3b', taille: 2_019_393_189, parametres: 3.2, famille: 'llama', kvParToken: 114_688 };

describe('choix du modèle local selon la carte', () => {
  it('garde ce qui tient dans 8 Go, écarte gemma3:12b, et choisit qwen3:8b', () => {
    const verdict = evaluerModeles([gemma, ministral, qwen, petit], radeon, true);
    expect(verdict.disponible).toBe(true);
    expect(verdict.automatique).toBe('qwen3:8b');
    const parNom = Object.fromEntries(verdict.modeles.map((modele) => [modele.nom, modele]));
    expect(parNom['gemma3:12b']).toMatchObject({ tient: false, utilisable: false, raison: 'Trop gros pour les 8 Go de la carte.' });
    expect(parNom['llama3.2:3b']).toMatchObject({ tient: true, utilisable: false, raison: 'Trop petit (3.2 milliards de paramètres) pour un résultat correct.' });
    expect(parNom['qwen3:8b']?.contexteMax).toBeGreaterThan(14_000);
    expect(parNom['ministral-3:8b']).toMatchObject({ utilisable: true });
  });

  it('prend gemma3:12b sur une carte de 16 Go', () => {
    expect(evaluerModeles([qwen, gemma], { ...radeon, vram: 16 * 1024 ** 3 }, true).automatique).toBe('gemma3:12b');
  });

  it('bloque l’IA locale sans carte dédiée, ou quand rien ne convient', () => {
    expect(evaluerModeles([qwen], null, true)).toMatchObject({ disponible: false, automatique: null });
    expect(evaluerModeles([qwen], { fabricant: 'amd', nom: 'AMD Radeon Graphics', vram: 512 * 1024 ** 2, dediee: false }, true).raison).toBe(
      'AMD Radeon Graphics est une carte intégrée, trop faible pour un modèle local : pas d’IA locale ici.',
    );
    expect(evaluerModeles([gemma, petit], radeon, true)).toMatchObject({ disponible: false, raison: 'Aucun modèle installé ne tient dans les 8 Go de la carte avec une qualité correcte.' });
    expect(evaluerModeles([], radeon, true)).toMatchObject({ disponible: false, raison: 'Aucun modèle n’est installé dans Ollama.' });
  });

  it('sans mémoire connue (NVIDIA sans nvidia-smi, Ollama ailleurs) : décide sur la taille du modèle, vérifie après', () => {
    const verdict = evaluerModeles([qwen, gemma], null, false);
    expect(verdict.disponible).toBe(true);
    expect(verdict.automatique).toBe('gemma3:12b');
    expect(verdict.modeles.every((modele) => modele.tient === null)).toBe(true);
  });

  it('lit les paramètres et le contexte par token d’après Ollama', () => {
    expect(lireParametres('8.2B')).toBe(8.2);
    expect(lireParametres('500M')).toBe(0.5);
    expect(lireParametres(undefined)).toBeNull();
    const qwen3 = { 'general.architecture': 'qwen3', 'qwen3.block_count': 36, 'qwen3.attention.head_count': 32, 'qwen3.attention.head_count_kv': 8, 'qwen3.attention.key_length': 128, 'qwen3.attention.value_length': 128 };
    expect(kvParTokenDe(qwen3)).toBe(147_456);
    // Têtes par couche en liste, longueurs déduites de la largeur.
    expect(kvParTokenDe({ 'general.architecture': 'x', 'x.block_count': 2, 'x.attention.head_count': 4, 'x.attention.head_count_kv': [2, 4], 'x.embedding_length': 512 })).toBe(2 * 4 * 256 * 2);
    expect(kvParTokenDe({})).toBeNull();
  });

  it('conseille un modèle selon la mémoire vidéo', () => {
    expect(modeleConseille(8 * 1024 ** 3)).toBe('qwen3:8b');
    expect(modeleConseille(16 * 1024 ** 3)).toBe('gemma3:12b');
    expect(modeleConseille(4 * 1024 ** 3)).toBeNull();
  });
});

describe('détection de la carte', () => {
  const sources = (fichiers: Record<string, string>, nvidiaSmi: string | null = null, noms: string[] = []): HardwareSources => ({
    lire: async (chemin) => fichiers[chemin] ?? null,
    lister: async (dossier) => {
      const enfants = new Set(Object.keys(fichiers).filter((chemin) => chemin.startsWith(`${dossier}/`)).map((chemin) => chemin.slice(dossier.length + 1).split('/')[0]!));
      if (enfants.size === 0) {
        throw new Error('absent');
      }
      return [...enfants];
    },
    nvidiaSmi: async () => nvidiaSmi,
    nomsVusParChromium: async () => noms,
  });

  it('lit une Radeon dans /sys, nommée par Chromium', async () => {
    const cartes = await detecterCartes(
      sources(
        {
          '/sys/class/drm/card1/device/vendor': '0x1002\n',
          '/sys/class/drm/card1/device/mem_info_vram_total': '8573157376\n',
          '/sys/class/drm/card1-DP-1/status': 'connected',
        },
        null,
        ['AMD Radeon RX 7600 (radeonsi, navi33, LLVM 20.1.2, DRM 3.64)'],
      ),
    );
    expect(cartes).toEqual([radeon]);
  });

  it('lit une NVIDIA par nvidia-smi, ou son nom seul sans lui', async () => {
    const fichiers = { '/sys/class/drm/card0/device/vendor': '0x10de', '/proc/driver/nvidia/gpus/0000:01:00.0/information': 'Model: \t NVIDIA GeForce RTX 4060 Laptop GPU\nIRQ: 120\n' };
    expect(await detecterCartes(sources(fichiers, 'NVIDIA GeForce RTX 4060 Laptop GPU, 8188\n'))).toEqual([
      { fabricant: 'nvidia', nom: 'NVIDIA GeForce RTX 4060 Laptop GPU', vram: 8188 * 1024 ** 2, dediee: true },
    ]);
    expect(await detecterCartes(sources(fichiers))).toEqual([{ fabricant: 'nvidia', nom: 'NVIDIA GeForce RTX 4060 Laptop GPU', vram: null, dediee: true }]);
  });

  it('préfère la carte dédiée à la carte intégrée', async () => {
    const cartes = await detecterCartes(
      sources(
        {
          '/sys/class/drm/card0/device/vendor': '0x1002',
          '/sys/class/drm/card0/device/mem_info_vram_total': String(512 * 1024 ** 2),
          '/sys/class/drm/card1/device/vendor': '0x10de',
        },
        'NVIDIA GeForce RTX 4070, 12282',
      ),
    );
    expect(carteRetenue(cartes)).toMatchObject({ fabricant: 'nvidia', vram: 12282 * 1024 ** 2 });
    expect(carteRetenue([])).toBeNull();
  });
});
