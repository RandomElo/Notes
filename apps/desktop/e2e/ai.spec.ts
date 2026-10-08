import { createServer } from 'node:http';
import type { Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, lireCorps, ouvrirPage, preparer } from './app';

// Critère de J12 : coût réel égal au coût estimé, sortie propre. Plus le flux complet (estimation, appel
// annulable, comparaison, accepter, Ctrl+Z), le choix du modèle selon la carte, LiteLLM, l'historique et la dépense du jour.

/** Une Radeon de 8 Go, comme celle d'Eloi, et une carte intégrée : l'essai ne dépend pas de la carte du poste. */
const carteDe8Go = JSON.stringify([{ fabricant: 'amd', nom: 'Carte d’essai', vram: 8 * 1024 ** 3, dediee: true }]);
const carteIntegree = JSON.stringify([{ fabricant: 'amd', nom: 'Carte intégrée d’essai', vram: 512 * 1024 ** 2, dediee: false }]);

interface FauxServeur {
  adresse: string;
  /** Textes reçus par chaque fournisseur, dans l'ordre. */
  ollama: string[];
  litellm: string[];
  /** Vrai : Ollama répond un mot de temps en temps, sans jamais finir (annulation). */
  lent: boolean;
  serveur: Server;
}

/**
 * Faux Ollama et faux LiteLLM sur le même port. Ollama a deux modèles, dont
 * un trop gros pour 8 Go ; il « relit » le texte en ajoutant ce que le
 * nettoyage doit retirer (préambule, emoji, conclusion). LiteLLM donne un
 * modèle et son tarif, ajoute un paragraphe et compte toujours les mêmes tokens.
 */
async function fauxServeur(): Promise<FauxServeur> {
  const faux: FauxServeur = { adresse: '', ollama: [], litellm: [], lent: false, serveur: createServer() };
  const lentement = (reponse: ServerResponse, ligne: string): void => {
    const minuteur = setInterval(() => reponse.write(ligne), 200);
    reponse.on('close', () => clearInterval(minuteur));
  };
  faux.serveur.on('request', (requete, reponse) => {
    let corps = '';
    requete.on('data', (morceau: Buffer) => (corps += morceau.toString()));
    requete.on('end', () => {
      const url = requete.url ?? '';
      if (url === '/api/tags') {
        reponse.end(
          JSON.stringify({
            models: [
              { name: 'faux-modele:8b', size: 5_000_000_000, details: { parameter_size: '8.0B', family: 'qwen3' } },
              { name: 'gros-modele:27b', size: 17_000_000_000, details: { parameter_size: '27B', family: 'gemma3' } },
            ],
          }),
        );
        return;
      }
      if (url === '/api/show') {
        reponse.end(JSON.stringify({ model_info: { 'general.architecture': 'qwen3', 'qwen3.block_count': 36, 'qwen3.attention.head_count': 32, 'qwen3.attention.head_count_kv': 8, 'qwen3.attention.key_length': 128 } }));
        return;
      }
      if (url === '/api/ps') {
        reponse.end(JSON.stringify({ models: [{ name: 'faux-modele:8b', size: 6_000_000_000, size_vram: 6_000_000_000 }] }));
        return;
      }
      if (url === '/v1/models') {
        reponse.end(JSON.stringify({ data: [{ id: 'gpt-5.6-luna' }, { id: 'whisper-1' }] }));
        return;
      }
      if (url === '/model/info') {
        reponse.end(JSON.stringify({ data: [{ model_name: 'gpt-5.6-luna', model_info: { input_cost_per_token: 2e-7, output_cost_per_token: 1.2e-6, mode: 'chat' } }] }));
        return;
      }
      const { messages } = JSON.parse(corps) as { messages: { role: string; content: string }[] };
      const texte = messages.find((message) => message.role === 'user')?.content ?? '';
      if (url === '/api/chat') {
        faux.ollama.push(texte);
        if (faux.lent) {
          lentement(reponse, `${JSON.stringify({ message: { content: 'mot ' }, done: false })}\n`);
          return;
        }
        const relu = texte.replace('a relire', 'à relire');
        const morceaux = ['Voici le texte relu :\n\n', '## 🚀 Liste\n\n', relu, "\n\nN'hésitez pas si besoin."];
        for (const morceau of morceaux) {
          reponse.write(`${JSON.stringify({ message: { content: morceau }, done: false })}\n`);
        }
        reponse.end(`${JSON.stringify({ message: { content: '' }, done: true, prompt_eval_count: 200, eval_count: 60 })}\n`);
        return;
      }
      if (url === '/v1/chat/completions') {
        faux.litellm.push(texte);
        const evenement = (donnees: unknown): string => `data: ${JSON.stringify(donnees)}\n\n`;
        reponse.setHeader('Content-Type', 'text/event-stream');
        reponse.write(evenement({ choices: [{ delta: { content: `${texte}\n\nUn paragraphe ajouté.` } }] }));
        reponse.write(evenement({ choices: [], usage: { prompt_tokens: 1200, completion_tokens: 800 } }));
        reponse.end('data: [DONE]\n\n');
        return;
      }
      reponse.statusCode = 404;
      reponse.end('{}');
    });
  });
  await new Promise<void>((resoudre) => faux.serveur.listen(0, '127.0.0.1', resoudre));
  faux.adresse = `http://127.0.0.1:${(faux.serveur.address() as AddressInfo).port}`;
  return faux;
}

const fenetreIa = (page: Page) => page.getByRole('dialog', { name: 'Fonctions IA de la page' });

async function ajouterUnParagraphe(page: Page, texte: string): Promise<void> {
  await editeur(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type(texte, { delay: 10 });
  await attendreEnregistrement(page);
}

test('relecture locale choisie selon la carte, mise au propre par LiteLLM : estimation, annulation, comparaison, acceptation, historique', async () => {
  const faux = await fauxServeur();
  const preparation = await preparer();
  await writeFile(
    join(preparation.profil, 'settings.json'),
    JSON.stringify({
      nas: null,
      vaultLocal: preparation.vault,
      ia: {
        adresseOllama: faux.adresse,
        adresseLitellm: faux.adresse,
        modeles: { relecture: { fournisseur: 'ollama', modele: '' }, 'mise-au-propre': { fournisseur: 'litellm', modele: 'gpt-5.6-luna' } },
      },
    }),
  );
  const session = await lancer(preparation, [], { NOTES_CARTES_ESSAI: carteDe8Go });
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  await ajouterUnParagraphe(page, 'Un texte a relire.');
  const avant = await lireCorps(vault, 'Courses');

  // Relecture par le modèle que Notes choisit pour la carte : pas de coût, durée inconnue avant un premier appel.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  const fenetre = fenetreIa(page);
  await expect(fenetre.getByRole('radio', { name: /Relecture stylistique/ })).toHaveAttribute('aria-checked', 'true');
  await expect(fenetre).toContainText('faux-modele:8b (sur ce poste, choisi par Notes)');
  await expect(fenetre).toContainText('inconnue avant un premier essai');
  await expect(fenetre).not.toContainText('Coût estimé');
  await fenetre.getByRole('button', { name: 'Lancer' }).click();

  // Comparaison : la proposition est nettoyée (ni préambule, ni emoji, ni conclusion), le reste de la page est intact.
  await expect(fenetre.getByRole('button', { name: 'Accepter' })).toBeFocused();
  const comparaison = fenetre.getByLabel('Comparaison avant et après');
  await expect(comparaison.locator('ins')).toContainText(['à']);
  await expect(comparaison).not.toContainText('Voici');
  await expect(comparaison).not.toContainText('🚀');
  await expect(comparaison).not.toContainText('hésitez');
  await expect(comparaison).toContainText('# Liste');
  // Le modèle a reçu la page en Markdown, rien d'autre.
  expect(faux.ollama).toEqual([avant]);
  await fenetre.getByRole('button', { name: 'Une colonne' }).click();
  await expect(comparaison.locator('del')).toContainText(['a']);
  // Rejeter : la page ne change pas.
  await fenetre.getByRole('button', { name: 'Rejeter' }).click();
  await expect(fenetre).toHaveCount(0);
  await expect(editeur(page)).toContainText('Un texte a relire.');

  // Annuler un appel en cours : retour au choix, la page ne change pas.
  faux.lent = true;
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await expect(fenetre).toContainText('environ'); // durée connue après un premier appel
  await fenetre.getByRole('button', { name: 'Lancer' }).click();
  await expect(fenetre).toContainText('reçus');
  await fenetre.getByRole('button', { name: 'Annuler' }).click();
  await expect(fenetre.getByRole('button', { name: 'Lancer' })).toBeVisible();
  faux.lent = false;
  await page.keyboard.press('Escape');
  await expect(fenetre).toHaveCount(0);
  expect(await lireCorps(vault, 'Courses')).toBe(avant);

  // Accepter, puis Ctrl+Z : la page revient telle quelle.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await fenetre.getByRole('button', { name: 'Lancer' }).click();
  await fenetre.getByRole('button', { name: 'Accepter' }).click();
  await expect(fenetre).toHaveCount(0);
  await expect(editeur(page)).toContainText('Un texte à relire.');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain('Un texte à relire.');
  await page.keyboard.press('Control+z');
  await expect(editeur(page)).toContainText('Un texte a relire.');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toBe(avant);

  // Réglages : la carte, le modèle choisi, le trop gros écarté ; la clé de LiteLLM, jamais en clair.
  await page.keyboard.press('Control+,');
  await expect(page.getByText('Carte d’essai, 8 Go de mémoire vidéo')).toBeVisible();
  await expect(page.getByText('IA locale possible. Notes choisit faux-modele:8b.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Modèles installés dans Ollama' })).toContainText('Trop gros pour les 8 Go de la carte.');
  await page.getByLabel('Clé de LiteLLM').fill('sk-litellm-cle-de-test');
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click();
  await expect(page.getByText('1 modèle disponible.')).toBeVisible();
  await expect(page.getByText('Tarif donné par LiteLLM.')).toBeVisible();
  expect(await readFile(join(session.profil, 'settings.json'), 'utf8')).not.toContain('sk-litellm');
  await page.keyboard.press('Escape');

  // Mise au propre par LiteLLM : coût estimé au tarif de LiteLLM, puis réel.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await fenetre.getByRole('radio', { name: /Mise au propre/ }).click();
  await expect(fenetre).toContainText('gpt-5.6-luna (LiteLLM)');
  await expect(fenetre).toContainText('Coût estimé');
  await fenetre.getByRole('button', { name: 'Lancer' }).click();
  await expect(fenetre).toContainText('coût 0,0012 $');
  await fenetre.getByRole('button', { name: 'Accepter' }).click();
  await expect(editeur(page)).toContainText('Un paragraphe ajouté.');
  await page.keyboard.press('Control+z');
  await attendreEnregistrement(page);

  // Critère : sur le même texte, l'estimation calée sur l'appel précédent égale le coût réel.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await expect(fenetre).toContainText('0,0012 $');
  await fenetre.getByRole('button', { name: 'Lancer' }).click();
  await expect(fenetre).toContainText('coût 0,0012 $ pour 0,0012 $ estimés');
  await fenetre.getByRole('button', { name: 'Rejeter' }).click();
  const historique = JSON.parse(await readFile(join(vault, '.notes', 'ai-usage.json'), 'utf8')) as {
    appels: { fournisseur: string; coutUsd: number | null; annule: boolean; estimation: { coutUsd: number | null } }[];
  };
  const dernier = historique.appels[historique.appels.length - 1]!;
  expect(dernier.estimation.coutUsd).toBeCloseTo(dernier.coutUsd!, 10);
  expect(historique.appels.map((appel) => [appel.fournisseur, appel.annule])).toEqual([
    ['ollama', false],
    ['ollama', true],
    ['ollama', false],
    ['litellm', false],
    ['litellm', false],
  ]);

  // Une fonction passe par LiteLLM : la dépense du jour est dans la barre de statut ; un clic ouvre l'historique.
  await page.locator('footer').getByRole('button', { name: /IA aujourd’hui : 0,0024 \$/ }).click();
  await expect(page.getByRole('heading', { name: 'Historique des fonctions IA' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('gpt-5.6-luna');
  await expect(page.getByRole('table')).toContainText('(annulé)');

  await fermer(session);
  faux.serveur.close();
});

test('carte intégrée : pas d’IA locale ni de dépense affichée, l’édition continue', async () => {
  const faux = await fauxServeur();
  const preparation = await preparer();
  await writeFile(join(preparation.profil, 'settings.json'), JSON.stringify({ nas: null, vaultLocal: preparation.vault, ia: { adresseOllama: faux.adresse } }));
  const session = await lancer(preparation, [], { NOTES_CARTES_ESSAI: carteIntegree });
  const { page } = session;
  await ouvrirPage(page, 'Courses');
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  const fenetre = fenetreIa(page);
  await expect(fenetre.getByRole('alert')).toHaveText(/Carte intégrée d’essai est une carte intégrée, trop faible pour un modèle local/);
  await expect(fenetre.getByRole('button', { name: 'Lancer' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await ajouterUnParagraphe(page, 'On écrit toujours.');
  await expect(page.locator('footer')).not.toContainText('IA aujourd’hui');
  expect(faux.ollama).toEqual([]);
  await fermer(session);
  faux.serveur.close();
});

test('sans Ollama, la fonction se désactive sans bloquer l’édition', async () => {
  const preparation = await preparer();
  // Un port fermé : l'Ollama du poste, s'il tourne, n'entre pas dans l'essai.
  await writeFile(join(preparation.profil, 'settings.json'), JSON.stringify({ nas: null, vaultLocal: preparation.vault, ia: { adresseOllama: 'http://127.0.0.1:9' } }));
  const session = await lancer(preparation, [], { NOTES_CARTES_ESSAI: carteDe8Go });
  const { page } = session;
  await ouvrirPage(page, 'Courses');
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await expect(fenetreIa(page).getByRole('alert')).toHaveText(/Ollama ne répond pas/);
  await page.keyboard.press('Escape');
  await ajouterUnParagraphe(page, 'On écrit toujours.');
  await page.keyboard.press('Control+,');
  await expect(page.getByText('Ollama ne répond pas à cette adresse.')).toBeVisible();
  await fermer(session);
});
