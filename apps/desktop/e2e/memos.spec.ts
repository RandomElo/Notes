import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { fermer, lancer, ligne, preparer } from './app';

// Critère de J13 : un mémo déposé dans `.notes/memos/` devient une page transcrite et mise en forme. Plus l'écoute,
// « Tout transcrire », la corbeille, et le masquage de la page « Mémos vocaux ». La vitesse de Whisper (30 s en
// moins de 5 s) ne se mesure qu'avec le vrai serveur et la vraie carte : elle est dans la recette.

const carteDe8Go = JSON.stringify([{ fabricant: 'amd', nom: 'Carte d’essai', vram: 8 * 1024 ** 3, dediee: true }]);

/** Un vrai WAV 16 kHz mono : une seconde de la note la. Le décodeur de Chromium le lit comme un mémo. */
function memoWav(): Buffer {
  const echantillons = 16_000;
  const octets = Buffer.alloc(44 + echantillons * 2);
  octets.write('RIFF', 0);
  octets.writeUInt32LE(36 + echantillons * 2, 4);
  octets.write('WAVEfmt ', 8);
  octets.writeUInt32LE(16, 16);
  octets.writeUInt16LE(1, 20);
  octets.writeUInt16LE(1, 22);
  octets.writeUInt32LE(16_000, 24);
  octets.writeUInt32LE(32_000, 28);
  octets.writeUInt16LE(2, 32);
  octets.writeUInt16LE(16, 34);
  octets.write('data', 36);
  octets.writeUInt32LE(echantillons * 2, 40);
  for (let i = 0; i < echantillons; i++) {
    octets.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 16_000) * 8000), 44 + i * 2);
  }
  return octets;
}

interface FauxServeurs {
  adresse: string;
  /** WAV reçus par le faux Whisper : leur en-tête dit ce que la page a converti. */
  wav: Buffer[];
  serveur: Server;
}

/** Faux Whisper (`/inference`) et faux Ollama (un modèle qui tient dans 8 Go) sur le même port. */
async function fauxServeurs(): Promise<FauxServeurs> {
  const faux: FauxServeurs = { adresse: '', wav: [], serveur: createServer() };
  faux.serveur.on('request', (requete, reponse) => {
    const morceaux: Buffer[] = [];
    requete.on('data', (morceau: Buffer) => morceaux.push(morceau));
    requete.on('end', () => {
      const corps = Buffer.concat(morceaux);
      const url = requete.url ?? '';
      if (url === '/inference') {
        const debut = corps.indexOf('RIFF');
        faux.wav.push(corps.subarray(debut, debut + 44));
        reponse.end(JSON.stringify({ text: ' euh bon alors penser à acheter du pain\n et appeler le plombier demain\n' }));
      } else if (url === '/api/tags') {
        reponse.end(JSON.stringify({ models: [{ name: 'faux-modele:8b', size: 5_000_000_000, details: { parameter_size: '8.0B', family: 'qwen3' } }] }));
      } else if (url === '/api/show') {
        reponse.end(JSON.stringify({ model_info: { 'general.architecture': 'qwen3', 'qwen3.block_count': 36, 'qwen3.attention.head_count': 32, 'qwen3.attention.head_count_kv': 8, 'qwen3.attention.key_length': 128 } }));
      } else if (url === '/api/ps') {
        reponse.end(JSON.stringify({ models: [] }));
      } else if (url === '/api/chat') {
        const texte = 'Voici le mémo mis en forme :\n\n- Acheter du pain.\n- Appeler le plombier demain.';
        reponse.end(`${JSON.stringify({ message: { content: texte }, done: true, prompt_eval_count: 80, eval_count: 20 })}\n`);
      } else {
        reponse.statusCode = 404;
        reponse.end('{}');
      }
    });
  });
  await new Promise<void>((resoudre) => faux.serveur.listen(0, '127.0.0.1', resoudre));
  faux.adresse = `http://127.0.0.1:${(faux.serveur.address() as AddressInfo).port}`;
  return faux;
}

test('un mémo déposé devient une sous-page transcrite et mise en forme ; écoute, corbeille, masquage', async () => {
  const faux = await fauxServeurs();
  const preparation = await preparer();
  const memos = join(preparation.vault, '.notes', 'memos');
  await mkdir(memos, { recursive: true });
  await writeFile(join(memos, 'memo-2026-10-07-162405.wav'), memoWav());
  await writeFile(join(memos, 'memo-2026-10-08-090000.wav'), memoWav());
  await writeFile(join(preparation.profil, 'settings.json'), JSON.stringify({ nas: null, vaultLocal: preparation.vault, ia: { adresseOllama: faux.adresse } }));
  const session = await lancer(preparation, [], { NOTES_WHISPER_ADRESSE: faux.adresse, NOTES_CARTES_ESSAI: carteDe8Go });
  const { page, vault } = session;

  // La page « Mémos vocaux » apparaît avec les mémos, et les liste du plus ancien au plus récent.
  await expect(ligne(page, 'Mémos vocaux')).toBeVisible();
  await ligne(page, 'Mémos vocaux').click();
  const liste = page.getByRole('region', { name: 'Mémos en attente' });
  await expect(liste.getByRole('heading')).toHaveText('2 mémos en attente');
  await expect(liste.getByRole('listitem')).toHaveText([/Mémo du 7 octobre 2026 à 16 h 24/, /Mémo du 8 octobre 2026 à 9 h 00/]);

  // Écouter : un lecteur audio.
  await liste.getByRole('button', { name: 'Écouter Mémo du 7 octobre 2026 à 16 h 24' }).click();
  await expect(liste.locator('audio')).toHaveCount(1);

  // Transcrire : l'audio part converti en WAV 16 kHz mono, la comparaison montre le brut face à la mise en forme.
  await liste.getByRole('listitem').first().getByRole('button', { name: 'Transcrire', exact: true }).click();
  const fenetre = page.getByRole('dialog', { name: 'Transcription d’un mémo' });
  await expect(fenetre.getByRole('button', { name: 'Accepter' })).toBeFocused();
  const comparaison = fenetre.getByLabel('Comparaison avant et après');
  await expect(comparaison).toContainText('euh bon alors penser à acheter du pain et appeler le plombier demain');
  await expect(comparaison).toContainText('- Acheter du pain.');
  await expect(comparaison).not.toContainText('Voici');
  await expect(fenetre).toContainText('1 s d’audio, transcrites en');
  expect(faux.wav[0]!.readUInt16LE(22)).toBe(1);
  expect(faux.wav[0]!.readUInt32LE(24)).toBe(16_000);
  await fenetre.getByRole('button', { name: 'Accepter' }).click();
  await expect(fenetre).toHaveCount(0);

  // La sous-page porte la date du mémo et le texte accepté ; l'audio est dans la corbeille.
  await expect.poll(() => readdir(join(vault, 'Mémos vocaux'))).toContain('Mémo du 7 octobre 2026 à 16 h 24');
  const sousPage = await readFile(join(vault, 'Mémos vocaux', 'Mémo du 7 octobre 2026 à 16 h 24', 'page.md'), 'utf8');
  expect(sousPage).toMatch(/title: Mémo du 7 octobre 2026 à 16 h 24\n[\s\S]*---\n- Acheter du pain\.\n- Appeler le plombier demain\.\n$/);
  expect(await readdir(memos)).toEqual(['memo-2026-10-08-090000.wav']);
  expect((await readdir(join(vault, '.trash'))).some((entree) => entree.endsWith('memo-2026-10-07-162405.wav'))).toBe(true);
  await expect(liste.getByRole('heading')).toHaveText('Un mémo en attente');

  // Le second mémo part à la corbeille sans être transcrit.
  await liste.getByRole('button', { name: 'Mettre Mémo du 8 octobre 2026 à 9 h 00 à la corbeille' }).click();
  await expect(liste.getByRole('heading')).toHaveText('Aucun mémo en attente');
  expect(await readdir(memos)).toEqual([]);

  // Masquer la page de l'arborescence, puis la réafficher par le clic droit dans le vide.
  await ligne(page, 'Mémos vocaux').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Masquer de l’arborescence' }).click();
  await expect(ligne(page, 'Mémos vocaux')).toHaveCount(0);
  const arbre = page.getByRole('tree');
  const boite = (await arbre.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height - 10, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Réafficher « Mémos vocaux »' }).click();
  await expect(ligne(page, 'Mémos vocaux')).toBeVisible();

  // Masquée, elle réapparaît d'elle-même quand un nouveau mémo arrive.
  await ligne(page, 'Mémos vocaux').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Masquer de l’arborescence' }).click();
  await expect(ligne(page, 'Mémos vocaux')).toHaveCount(0);
  await writeFile(join(memos, 'memo-2026-10-08-120000.wav'), memoWav());
  await expect(ligne(page, 'Mémos vocaux')).toBeVisible();

  await fermer(session);
  faux.serveur.close();
});

/** Le même la en Sun Audio (`.au`, PCM 16 bits gros-boutiste) : Chromium ne le lit pas, le ffmpeg de Notes si. */
function memoAu(): Buffer {
  const echantillons = 16_000;
  const octets = Buffer.alloc(24 + echantillons * 2);
  octets.write('.snd', 0);
  octets.writeUInt32BE(24, 4);
  octets.writeUInt32BE(echantillons * 2, 8);
  octets.writeUInt32BE(3, 12);
  octets.writeUInt32BE(16_000, 16);
  octets.writeUInt32BE(1, 20);
  for (let i = 0; i < echantillons; i++) {
    octets.writeInt16BE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 16_000) * 8000), 24 + i * 2);
  }
  return octets;
}

test('un format que Chromium ne lit pas passe par ffmpeg ; le dossier des mémos s’ouvre depuis la page', async () => {
  const faux = await fauxServeurs();
  const preparation = await preparer();
  const memos = join(preparation.vault, '.notes', 'memos');
  await mkdir(memos, { recursive: true });
  await writeFile(join(memos, 'memo-2026-10-08-093000.au'), memoAu());
  await writeFile(join(preparation.profil, 'settings.json'), JSON.stringify({ nas: null, vaultLocal: preparation.vault, ia: { adresseOllama: faux.adresse } }));
  const session = await lancer(preparation, [], { NOTES_WHISPER_ADRESSE: faux.adresse, NOTES_CARTES_ESSAI: carteDe8Go });
  const { page, application } = session;
  // Le gestionnaire de fichiers ne s'ouvre pas sous l'écran virtuel : on note le dossier demandé.
  await application.evaluate(({ shell }) => {
    shell.openPath = async (chemin: string) => {
      (globalThis as { dossierOuvert?: string }).dossierOuvert = chemin;
      return '';
    };
  });

  await ligne(page, 'Mémos vocaux').click();
  const liste = page.getByRole('region', { name: 'Mémos en attente' });
  await expect(liste.getByRole('heading')).toHaveText('Un mémo en attente');

  await liste.getByRole('button', { name: 'Ouvrir le dossier des mémos' }).click();
  await expect.poll(() => application.evaluate(() => (globalThis as { dossierOuvert?: string }).dossierOuvert)).toBe(join(session.vault, '.notes', 'memos'));

  // Écouter : le lecteur rejoue le mémo en WAV décodé par ffmpeg.
  await liste.getByRole('button', { name: 'Écouter Mémo du 8 octobre 2026 à 9 h 30' }).click();
  await expect(liste.locator('audio')).toHaveCount(1);
  await expect(liste).not.toContainText('ne s’écoute pas');

  await liste.getByRole('button', { name: 'Transcrire', exact: true }).click();
  const fenetre = page.getByRole('dialog', { name: 'Transcription d’un mémo' });
  await expect(fenetre.getByRole('button', { name: 'Accepter' })).toBeFocused();
  await expect(fenetre).toContainText('1 s d’audio, transcrites en');
  expect(faux.wav[0]!.readUInt16LE(22)).toBe(1);
  expect(faux.wav[0]!.readUInt32LE(24)).toBe(16_000);
  await fenetre.getByRole('button', { name: 'Rejeter' }).click();
  await expect(fenetre).toHaveCount(0);

  await fermer(session);
  faux.serveur.close();
});
