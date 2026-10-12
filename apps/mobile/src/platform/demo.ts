import { RemoteFsError } from '@notes/core';
import { MemoryRemoteFs } from '@notes/core/testing';
import { CapacitorLocalFs, fichierDeLApplication } from './capacitor-local-fs';
import { dossierDesMemosEnAttente, dossierDuCache } from './environment';
import type { Enregistreur, Environnement } from './environment';

/**
 * Démonstration dans un navigateur, en développement seulement (`npm run dev
 * -w @notes/mobile`) : le « NAS » est une copie en mémoire du vault d'exemple,
 * rangée dans le dossier `notes` d'un partage `partage`. Le cache passe par le
 * vrai `CapacitorLocalFs` (IndexedDB dans un navigateur). Mot de passe
 * accepté : « demo ». `?hors-ligne` dans l'adresse simule un NAS injoignable.
 * L'enregistreur des mémos fait semblant : le niveau du son ondule, le mémo
 * terminé est un fichier de quelques octets.
 */
const textes = import.meta.glob(['../../../../fixtures/vault-demo/**/*.md', '../../../../fixtures/vault-demo/**/.order'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const images = import.meta.glob('../../../../fixtures/vault-demo/**/assets/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const prefixe = '../../../../fixtures/vault-demo/';

export async function environnementDeDemo(): Promise<Environnement> {
  const nas = new MemoryRemoteFs();
  for (const [chemin, texte] of Object.entries(textes)) {
    nas.poser(`notes/${chemin.slice(prefixe.length)}`, texte);
  }
  for (const [chemin, adresse] of Object.entries(images)) {
    nas.poser(`notes/${chemin.slice(prefixe.length)}`, new Uint8Array(await (await fetch(adresse)).arrayBuffer()));
  }
  nas.panne = new URLSearchParams(window.location.search).has('hors-ligne');
  let enregistre = false;
  const memosEnAttente = new CapacitorLocalFs(dossierDesMemosEnAttente);
  const retours = new Set<() => void>();
  window.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'Escape') {
      retours.forEach((rappel) => rappel());
    }
  });
  return {
    local: new CapacitorLocalFs(dossierDuCache),
    distant: nas,
    fichiers: fichierDeLApplication,
    async connecter(_reglages, { motDePasse }) {
      await new Promise((fin) => setTimeout(fin, 300));
      if (nas.panne) {
        throw new RemoteFsError('injoignable', 'NAS injoignable (démonstration).');
      }
      if (motDePasse !== undefined) {
        if (motDePasse !== 'demo') {
          throw new RemoteFsError('identifiants_refuses', 'Identifiants refusés.');
        }
        enregistre = true;
      }
      return { dialecte: 'SMB 3.1.1', signee: true, chiffree: true, parTailscale: false };
    },
    async deconnecter() {},
    motDePasseEnregistre: async () => enregistre || (await fichierDeLApplication.lire('reglages.json')) !== null,
    async oublierMotDePasse() {
      enregistre = false;
    },
    reseauPresent: async () => true,
    surOccasionDeSync: () => () => undefined,
    async ouvrirLien(adresse) {
      window.open(adresse, '_blank', 'noopener');
    },
    surRetour(rappel) {
      retours.add(rappel);
      return () => retours.delete(rappel);
    },
    quitter: () => undefined,
    contenuAffiche: () => undefined,
    memosEnAttente,
    enregistreur: enregistreurDeDemo(memosEnAttente),
  };
}

function enregistreurDeDemo(memos: CapacitorLocalFs): Enregistreur {
  let courant: { nom: string; depuis: number } | null = null;
  return {
    async demarrer(nom) {
      courant = { nom, depuis: Date.now() };
    },
    async terminer() {
      const fini = courant;
      courant = null;
      if (fini === null) {
        return null;
      }
      await memos.ecrireOctets(fini.nom, new TextEncoder().encode(`Mémo de démonstration, ${Math.round((Date.now() - fini.depuis) / 1000)} s`));
      return fini.nom;
    },
    async annuler() {
      courant = null;
    },
    async etat() {
      const depuis = courant?.depuis ?? 0;
      return { enCours: courant !== null, depuis, niveau: courant === null ? 0 : 0.5 + 0.4 * Math.sin((Date.now() - depuis) / 180), erreur: null };
    },
  };
}
