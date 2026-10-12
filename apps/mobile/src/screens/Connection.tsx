import type { NasSettings, RemoteFsErrorCode } from '@notes/core';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { BoutonIcone, TopBar } from '../components/TopBar';
import { versErreurDistante } from '../platform/smb-remote-fs';
import { useNotes } from '../state/NotesContext';

const messages: Partial<Record<RemoteFsErrorCode, string>> = {
  injoignable: 'Le NAS ne répond pas. Vérifie l’adresse, et que le téléphone est sur le même réseau que lui.',
  identifiants_refuses: 'Utilisateur ou mot de passe refusé par le NAS.',
  partage_introuvable: 'Ce partage n’existe pas sur le NAS.',
  chiffrement_absent: 'Le NAS n’a pas accepté SMB 3.1.1 avec signature et chiffrement : connexion refusée.',
  acces_refuse: 'Accès refusé à ce partage.',
};

/** Adresse du NAS, partage, identifiants (docs/spec/android.md). Le mot de passe part au plugin natif, qui le chiffre et ne le rend jamais. */
export function Connection({ retour }: { retour?: () => void }) {
  const { reglages, seConnecter } = useNotes();
  const [champs, definirChamps] = useState<NasSettings & { hoteTailscale: string }>({
    ...(reglages.nas ?? { hote: '', partage: '', utilisateur: '', dossierVault: '' }),
    hoteTailscale: reglages.hoteTailscale,
  });
  const [motDePasse, definirMotDePasse] = useState('');
  const [envoi, definirEnvoi] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);

  const envoyer = async (evenement: FormEvent): Promise<void> => {
    evenement.preventDefault();
    definirEnvoi(true);
    definirErreur(null);
    try {
      const { hoteTailscale, ...nas } = champs;
      await seConnecter(nas, hoteTailscale, motDePasse);
      definirMotDePasse('');
      retour?.();
    } catch (raison) {
      const distante = versErreurDistante(raison);
      definirErreur(
        distante.code === 'injoignable' && champs.hoteTailscale.trim() !== ''
          ? 'Le NAS ne répond ni à l’adresse locale ni par Tailscale. Active Tailscale sur le téléphone, ou vérifie les adresses.'
          : (messages[distante.code] ?? distante.message),
      );
    } finally {
      definirEnvoi(false);
    }
  };

  const champ = (cle: keyof typeof champs, libelle: string, aide: string, options: { placeholder?: string; facultatif?: boolean } = {}) => (
    <label className="block">
      <span className="text-sm font-medium">{libelle}</span>
      <input
        value={champs[cle]}
        onChange={(evenement) => definirChamps({ ...champs, [cle]: evenement.target.value })}
        placeholder={options.placeholder}
        required={options.facultatif !== true}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="mt-1 h-12 w-full rounded-lg bg-texte/10 px-3 text-base outline-none placeholder:text-discret/60 focus:bg-texte/15"
      />
      <span className="mt-1 block text-xs text-discret">{aide}</span>
    </label>
  );

  return (
    <div className="min-h-dvh">
      <TopBar
        gauche={
          retour !== undefined && (
            <BoutonIcone libelle="Retour" onClick={retour}>
              <ArrowLeft className="size-5" />
            </BoutonIcone>
          )
        }
        titre="Connexion au NAS"
      />
      <form onSubmit={(evenement) => void envoyer(evenement)} className="marge-bas space-y-5 px-5 pt-2 pb-10">
        <p className="text-sm text-discret">Le téléphone lit une copie des pages, gardée pour la consultation sans réseau, et la met à jour depuis le NAS.</p>
        {champ('hote', 'Adresse du NAS', 'Son adresse sur le réseau de la maison, essayée d’abord.', { placeholder: '192.168.1.10' })}
        {champ('hoteTailscale', 'Adresse Tailscale du NAS', 'Essayée quand l’adresse de la maison ne répond pas tout de suite, par exemple dehors. Vide si tu n’utilises pas Tailscale.', {
          placeholder: '100.64.0.1 ou nas.example.ts.net',
          facultatif: true,
        })}
        {champ('partage', 'Partage', 'Le nom du partage SMB seul, sans « \\ » ni « / ».')}
        {champ('dossierVault', 'Dossier des notes dans le partage', 'Le même que sur le PC. Vide si les notes sont à la racine du partage.', { facultatif: true })}
        {champ('utilisateur', 'Utilisateur', 'Le compte du NAS.')}
        <label className="block">
          <span className="text-sm font-medium">Mot de passe</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(evenement) => definirMotDePasse(evenement.target.value)}
            required
            autoComplete="current-password"
            className="mt-1 h-12 w-full rounded-lg bg-texte/10 px-3 text-base outline-none focus:bg-texte/15"
          />
          <span className="mt-1 block text-xs text-discret">Chiffré sur le téléphone par le coffre d’Android, jamais affiché.</span>
        </label>
        {erreur !== null && <p className="rounded-lg bg-erreur/15 px-3 py-2 text-sm text-erreur">{erreur}</p>}
        <button
          type="submit"
          disabled={envoi}
          className="h-12 w-full rounded-lg bg-accent font-medium text-fond outline-none active:bg-accent/80 focus-visible:bg-accent/85 disabled:bg-accent/50"
        >
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
