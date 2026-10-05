import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Carte graphique du poste, pour décider si un modèle local peut tourner
 * (README §12). Rien n'est installé pour ça : une Radeon se lit dans `/sys`,
 * une NVIDIA par son pilote (`/proc/driver/nvidia`, puis `nvidia-smi`, livré
 * avec lui, s'il est là). Le nom vient de Chromium (`app.getGPUInfo`).
 */

export interface GpuInfo {
  fabricant: 'amd' | 'nvidia' | 'intel' | 'autre';
  nom: string;
  /** Mémoire vidéo en octets, null si on ne sait pas la lire. */
  vram: number | null;
  /** Carte dédiée : une carte intégrée au processeur ne sert pas à un modèle local. */
  dediee: boolean;
}

/** Une Radeon intégrée réserve au plus quelques centaines de Mo, 2 Go sur certaines machines. */
const vramMinDUneCarteDediee = 3 * 1024 ** 3;

export interface HardwareSources {
  /** Contenu d'un fichier, null s'il n'existe pas. */
  lire: (chemin: string) => Promise<string | null>;
  lister: (dossier: string) => Promise<string[]>;
  /** Sortie de `nvidia-smi`, null s'il n'est pas là. */
  nvidiaSmi: () => Promise<string | null>;
  /** Noms des cartes vus par Chromium (`glRenderer`), vide s'il ne les donne pas. */
  nomsVusParChromium: () => Promise<string[]>;
}

const fabricants: Record<string, GpuInfo['fabricant']> = { '0x1002': 'amd', '0x10de': 'nvidia', '0x8086': 'intel' };

/** Le nom d'une carte de ce fabricant parmi ceux de Chromium, sans ce qu'il ajoute entre parenthèses. */
function nomDe(fabricant: GpuInfo['fabricant'], noms: string[]): string | null {
  const motif = fabricant === 'amd' ? /amd|radeon/i : fabricant === 'nvidia' ? /nvidia|geforce|rtx|quadro/i : /intel/i;
  const trouve = noms.find((nom) => motif.test(nom));
  return trouve === undefined ? null : trouve.replace(/\s*\(.*$/, '').trim();
}

export async function detecterCartes(sources: HardwareSources): Promise<GpuInfo[]> {
  const noms = await sources.nomsVusParChromium().catch(() => []);
  const cartes: GpuInfo[] = [];
  const entrees = await sources.lister('/sys/class/drm').catch(() => []);
  for (const entree of entrees.filter((nom) => /^card\d+$/.test(nom))) {
    const dossier = join('/sys/class/drm', entree, 'device');
    const fabricant = fabricants[(await sources.lire(join(dossier, 'vendor')))?.trim() ?? ''] ?? 'autre';
    if (fabricant === 'amd') {
      const vram = Number((await sources.lire(join(dossier, 'mem_info_vram_total')))?.trim());
      const connue = Number.isFinite(vram) && vram > 0 ? vram : null;
      cartes.push({ fabricant, nom: nomDe('amd', noms) ?? 'Carte AMD', vram: connue, dediee: connue !== null && connue >= vramMinDUneCarteDediee });
    } else if (fabricant === 'nvidia') {
      cartes.push(await carteNvidia(sources, noms));
    } else if (fabricant === 'intel') {
      cartes.push({ fabricant, nom: nomDe('intel', noms) ?? 'Carte Intel', vram: null, dediee: false });
    }
  }
  return cartes;
}

async function carteNvidia(sources: HardwareSources, noms: string[]): Promise<GpuInfo> {
  // `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` : « NVIDIA GeForce RTX 4060 Laptop GPU, 8188 ».
  const sortie = await sources.nvidiaSmi();
  const ligne = sortie?.split('\n').find((l) => l.includes(','));
  if (ligne !== undefined) {
    const [nom, memoire] = ligne.split(',').map((morceau) => morceau.trim());
    const mio = Number(memoire);
    if (nom !== undefined && Number.isFinite(mio) && mio > 0) {
      return { fabricant: 'nvidia', nom, vram: mio * 1024 ** 2, dediee: true };
    }
  }
  // Sans nvidia-smi : le nom par le pilote, la mémoire inconnue. Ollama dira après le premier appel si le modèle tient.
  let nom = nomDe('nvidia', noms);
  for (const gpu of await sources.lister('/proc/driver/nvidia/gpus').catch(() => [])) {
    const information = await sources.lire(join('/proc/driver/nvidia/gpus', gpu, 'information'));
    nom = /^Model:\s*(.+)$/m.exec(information ?? '')?.[1]?.trim() ?? nom;
  }
  return { fabricant: 'nvidia', nom: nom ?? 'Carte NVIDIA', vram: null, dediee: true };
}

/** Sources réelles du poste. */
export function sourcesDuPoste(nomsVusParChromium: () => Promise<string[]>): HardwareSources {
  return {
    lire: (chemin) => readFile(chemin, 'utf8').catch(() => null),
    lister: (dossier) => readdir(dossier),
    nvidiaSmi: () =>
      new Promise((resoudre) => {
        // Sans variable du poste, délai court : une absence ou un pilote bloqué ne retient pas Notes.
        execFile('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { timeout: 3000, env: { PATH: '/usr/bin:/bin' } }, (erreur, sortie) =>
          resoudre(erreur === null ? sortie : null),
        );
      }),
    nomsVusParChromium,
  };
}

/** La carte qui fera tourner un modèle local : la dédiée qui a le plus de mémoire, sinon la première. */
export function carteRetenue(cartes: GpuInfo[]): GpuInfo | null {
  const dediees = cartes.filter((carte) => carte.dediee).sort((a, b) => (b.vram ?? 0) - (a.vram ?? 0));
  return dediees[0] ?? cartes[0] ?? null;
}
