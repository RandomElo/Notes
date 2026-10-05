import { createServer } from 'node:http';
import type { Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, lireCorps, ouvrirPage, preparer } from './app';

// Critère de J12 : coût réel égal au coût estimé, sortie propre. Plus le flux complet (estimation, appel
// annulable, comparaison, accepter, Ctrl+Z), la clé OpenAI, l'historique et la dépense du jour.

interface FauxServeur {
  adresse: string;
  /** Textes reçus par chaque fournisseur, dans l'ordre. */
  ollama: string[];
  openai: string[];
  /** Vrai : Ollama répond un mot de temps en temps, sans jamais finir (annulation). */
  lent: boolean;
  serveur: Server;
}

/**
 * Faux Ollama et faux OpenAI sur le même port. Ollama « relit » le texte en
 * ajoutant ce que le nettoyage doit retirer (préambule, emoji, conclusion) ;
 * OpenAI ajoute un paragraphe et compte toujours les mêmes tokens.
 */
async function fauxServeur(): Promise<FauxServeur> {
  const faux: FauxServeur = { adresse: '', ollama: [], openai: [], lent: false, serveur: createServer() };
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
        reponse.end(JSON.stringify({ models: [{ name: 'faux-modele:8b' }] }));
        return;
      }
      if (url === '/v1/models') {
        reponse.end(JSON.stringify({ data: [{ id: 'gpt-5.4-mini' }, { id: 'whisper-1' }] }));
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
        const morceaux = ['Voici le texte relu :\n\n', '## 🚀 Liste\n\n', relu, '\n\nN’hésitez pas si besoin.'.replace('’', "'")];
        for (const morceau of morceaux) {
          reponse.write(`${JSON.stringify({ message: { content: morceau }, done: false })}\n`);
        }
        reponse.end(`${JSON.stringify({ message: { content: '' }, done: true, prompt_eval_count: 200, eval_count: 60 })}\n`);
        return;
      }
      if (url === '/v1/chat/completions') {
        faux.openai.push(texte);
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

test('relecture locale, mise au propre par OpenAI : estimation, annulation, comparaison, acceptation, historique', async () => {
  const faux = await fauxServeur();
  const preparation = await preparer();
  await writeFile(
    join(preparation.profil, 'settings.json'),
    JSON.stringify({
      nas: null,
      vaultLocal: preparation.vault,
      ia: {
        adresseOllama: faux.adresse,
        modeles: { relecture: { fournisseur: 'ollama', modele: 'faux-modele:8b' }, 'mise-au-propre': { fournisseur: 'openai', modele: 'gpt-5.4-mini' } },
      },
    }),
  );
  const session = await lancer(preparation, [], { NOTES_OPENAI_ADRESSE: faux.adresse });
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  await ajouterUnParagraphe(page, 'Un texte a relire.');
  const avant = await lireCorps(vault, 'Courses');

  // Relecture par le modèle local : estimation sans coût, durée inconnue avant un premier appel.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  const fenetre = fenetreIa(page);
  await expect(fenetre.getByRole('radio', { name: /Relecture stylistique/ })).toHaveAttribute('aria-checked', 'true');
  await expect(fenetre).toContainText('faux-modele:8b (sur ce poste)');
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
  // Une colonne.
  await fenetre.getByRole('button', { name: 'Une colonne' }).click();
  await expect(comparaison.locator('del')).toContainText(['a']);
  // Rejeter : la page ne change pas.
  await fenetre.getByRole('button', { name: 'Rejeter' }).click();
  await expect(fenetre).toHaveCount(0);
  await expect(editeur(page)).toContainText('Un texte a relire.');

  // Annuler un appel en cours : retour au choix, la page ne change pas.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await expect(fenetre).toContainText('environ'); // durée connue après un premier appel
  await page.keyboard.press('Escape');
  await expect(fenetre).toHaveCount(0);
  faux.lent = true;
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
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

  // OpenAI : la clé s'enregistre dans les réglages, jamais en clair.
  await page.keyboard.press('Control+,');
  await page.getByLabel('Clé d’API').fill('sk-proj-cle-de-test-abcdefghijklmnop');
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click();
  await expect(page.getByText('1 modèle disponible.')).toBeVisible();
  const reglages = await readFile(join(session.profil, 'settings.json'), 'utf8');
  expect(reglages).not.toContain('sk-proj');
  await page.keyboard.press('Escape');

  // Mise au propre par OpenAI : coût estimé, puis réel.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await fenetre.getByRole('radio', { name: /Mise au propre/ }).click();
  await expect(fenetre).toContainText('gpt-5.4-mini (OpenAI)');
  await expect(fenetre).toContainText('Coût estimé');
  await fenetre.getByRole('button', { name: 'Lancer' }).click();
  await expect(fenetre).toContainText('coût 0,0045 $');
  await fenetre.getByRole('button', { name: 'Accepter' }).click();
  await expect(editeur(page)).toContainText('Un paragraphe ajouté.');
  await page.keyboard.press('Control+z');
  await attendreEnregistrement(page);

  // Critère : sur le même texte, l'estimation calée sur l'appel précédent égale le coût réel.
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  await expect(fenetre).toContainText('0,0045 $');
  await fenetre.getByRole('button', { name: 'Lancer' }).click();
  await expect(fenetre).toContainText('coût 0,0045 $ pour 0,0045 $ estimés');
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
    ['openai', false],
    ['openai', false],
  ]);

  // Dépense du jour dans la barre de statut ; un clic ouvre l'historique.
  await page.locator('footer').getByRole('button', { name: /IA aujourd’hui : 0,009 \$/ }).click();
  await expect(page.getByRole('heading', { name: 'Historique des fonctions IA' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('gpt-5.4-mini');
  await expect(page.getByRole('table')).toContainText('(annulé)');

  await fermer(session);
  faux.serveur.close();
});

test('sans Ollama ni modèle choisi, la fonction se désactive sans bloquer l’édition', async () => {
  const preparation = await preparer();
  // Un port fermé : l'Ollama du poste, s'il tourne, n'entre pas dans l'essai.
  await writeFile(join(preparation.profil, 'settings.json'), JSON.stringify({ nas: null, vaultLocal: preparation.vault, ia: { adresseOllama: 'http://127.0.0.1:9' } }));
  const session = await lancer(preparation);
  const { page } = session;
  await ouvrirPage(page, 'Courses');
  await page.getByRole('button', { name: 'Fonctions IA' }).click();
  const fenetre = fenetreIa(page);
  await expect(fenetre.getByRole('alert')).toHaveText('Choisis d’abord un modèle pour cette fonction dans les réglages.');
  await expect(fenetre.getByRole('button', { name: 'Lancer' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await ajouterUnParagraphe(page, 'On écrit toujours.');
  await page.keyboard.press('Control+,');
  await expect(page.getByText('Ollama ne répond pas à cette adresse.')).toBeVisible();
  await fermer(session);
});
