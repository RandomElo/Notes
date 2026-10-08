import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { estWav, transcrireWav } from './client';
import { dossierDeWhisper, modeleInstalle, telechargerModele } from './model';
import type { ModelFile } from './model';
import { environnementDuServeur, WhisperServer } from './server';

const serveurs: Server[] = [];
afterEach(() => {
  for (const serveur of serveurs.splice(0)) {
    serveur.closeAllConnections();
    serveur.close();
  }
});

/** Un WAV de 44 octets d'en-tête et quelques échantillons. */
function wav(echantillons = 4): Uint8Array {
  const octets = new Uint8Array(44 + echantillons * 2);
  octets.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  octets.set([...'WAVE'].map((c) => c.charCodeAt(0)), 8);
  return octets;
}

describe('modèle de transcription', () => {
  const petit = (contenu: string, nom: string): ModelFile => ({
    nom,
    adresse: `https://exemple.test/${nom}`,
    taille: Buffer.byteLength(contenu),
    empreinte: createHash('sha256').update(contenu).digest('hex'),
  });
  const reponses = (contenus: Record<string, string>) => async (adresse: string) => new Response(contenus[adresse.split('/').pop()!] ?? '', { status: 200 });

  it('se range à côté de l’AppImage, ou dans ~/Applications en développement', () => {
    expect(dossierDeWhisper({ APPIMAGE: '/home/u/Applications/Notes.AppImage' }, '/home/u')).toBe('/home/u/Applications/Whisper');
    expect(dossierDeWhisper({}, '/home/u')).toBe('/home/u/Applications/Whisper');
    expect(dossierDeWhisper({ NOTES_DOSSIER_WHISPER: '/tmp/essai' }, '/home/u')).toBe('/tmp/essai');
  });

  it('télécharge chaque fichier vérifié par son empreinte, avec un avancement cumulé', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-whisper-'));
    const liste = [petit('poids du modèle', 'modele.bin'), petit('voix', 'voix.bin')];
    const avancement: number[] = [];
    expect(await modeleInstalle(dossier, liste)).toBe(false);
    await telechargerModele(dossier, reponses({ 'modele.bin': 'poids du modèle', 'voix.bin': 'voix' }), new AbortController().signal, (recus) => avancement.push(recus), liste);
    expect(await modeleInstalle(dossier, liste)).toBe(true);
    expect(await readFile(join(dossier, 'voix.bin'), 'utf8')).toBe('voix');
    expect(avancement.at(-1)).toBe(liste[0]!.taille + liste[1]!.taille);
  });

  it('ne garde rien d’un fichier qui n’a pas la bonne empreinte', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-whisper-'));
    const liste = [petit('poids du modèle', 'modele.bin')];
    await expect(telechargerModele(dossier, reponses({ 'modele.bin': 'poids trafiqué!' }), new AbortController().signal, () => undefined, liste)).rejects.toThrow('empreinte différente');
    expect(await readdir(dossier)).toEqual([]);
  });
});

describe('client de transcription', () => {
  it('envoie le WAV en français et rend le texte en une ligne', async () => {
    let recu = '';
    const serveur = createServer((requete, reponse) => {
      requete.on('data', (morceau: Buffer) => (recu += morceau.toString('latin1')));
      requete.on('end', () => reponse.end(JSON.stringify({ text: ' Bonjour à tous.\n Voici le mémo.\n' })));
    });
    serveurs.push(serveur);
    await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
    const adresse = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
    expect(await transcrireWav(adresse, wav())).toBe('Bonjour à tous. Voici le mémo.');
    expect(recu).toContain('name="language"');
    expect(recu).toContain('fr');
    expect(recu).toContain('filename="memo.wav"');
  });

  it('dit pourquoi la transcription échoue', async () => {
    const serveur = createServer((_, reponse) => {
      reponse.statusCode = 500;
      reponse.end(JSON.stringify({ error: 'failed to read audio' }));
    });
    serveurs.push(serveur);
    await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
    await expect(transcrireWav(`http://127.0.0.1:${(serveur.address() as AddressInfo).port}`, wav())).rejects.toThrow('La transcription a échoué (réponse 500) : failed to read audio.');
  });

  it('ne laisse passer qu’un WAV de taille raisonnable', () => {
    expect(estWav(wav())).toBe(true);
    expect(estWav(new Uint8Array(100))).toBe(false);
    expect(estWav('RIFF')).toBe(false);
  });
});

describe('serveur de transcription', () => {
  // Un faux whisper-server : un petit serveur HTTP sur le port donné en argument.
  const fauxServeur = `const http = require('node:http'); const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
    http.createServer((q, r) => r.end('ok')).listen(port, '127.0.0.1');`;

  it('se lance à la demande, avec la détection de la voix, puis s’arrête après inactivité', async () => {
    const lances: string[][] = [];
    const serveur = new WhisperServer({
      binaire: 'whisper-server',
      modele: '/m/ggml.bin',
      modeleDeVoix: '/m/voix.bin',
      inactiviteMs: 300,
      lancer: (_binaire, arguments_) => {
        lances.push(arguments_);
        return spawn(process.execPath, ['-e', fauxServeur, '--', ...arguments_]);
      },
    });
    const adresse = await serveur.adresse();
    expect(adresse).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await serveur.adresse()).toBe(adresse);
    expect(lances).toHaveLength(1);
    expect(lances[0]).toEqual(expect.arrayContaining(['-m', '/m/ggml.bin', '-l', 'fr', '--vad', '-vm', '/m/voix.bin', '--host', '127.0.0.1']));
    expect(serveur.enMarche()).toBe(true);
    await new Promise((resoudre) => setTimeout(resoudre, 500));
    expect(serveur.enMarche()).toBe(false);
  });

  it('dit qu’il s’est arrêté au démarrage, avec ce qu’il a écrit', async () => {
    const serveur = new WhisperServer({
      binaire: 'whisper-server',
      modele: '/m/ggml.bin',
      modeleDeVoix: '/m/voix.bin',
      lancer: () => spawn(process.execPath, ['-e', "console.error('error: failed to open model'); process.exit(1)"]),
    });
    await expect(serveur.adresse()).rejects.toThrow('Le serveur de transcription s’est arrêté au démarrage. error: failed to open model');
    serveur.arreter();
  });

  it('ne passe au serveur que de quoi trouver le pilote Vulkan', () => {
    expect(environnementDuServeur({ HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1000', SECRET: 'x', PATH: '/opt/bin' })).toEqual({
      PATH: '/usr/bin:/bin',
      LC_ALL: 'C.UTF-8',
      HOME: '/home/u',
      XDG_RUNTIME_DIR: '/run/user/1000',
    });
  });
});
