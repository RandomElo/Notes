import type { NasSettings } from '@notes/core';
import { KeyRound, LoaderCircle, PlugZap, Save, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ConnectionTestResult, NasSaveResult, NasState } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { ConnectionTestReport } from './ConnectionTestReport';
import { TextField } from './TextField';

type FormErrors = Extract<NasSaveResult, { ok: false }>['erreurs'];

const reglagesVides: NasSettings = { hote: '', partage: '', utilisateur: '', dossierVault: 'Notes' };

/** Réglages de connexion au NAS, avec un test qui écrit et relit un fichier. */
export function NasConnectionPanel() {
  const [etat, definirEtat] = useState<NasState | null>(null);
  const [saisie, definirSaisie] = useState<NasSettings>(reglagesVides);
  const [motDePasse, definirMotDePasse] = useState('');
  const [erreurs, definirErreurs] = useState<FormErrors>({});
  const [enregistrementEnCours, definirEnregistrementEnCours] = useState(false);
  const [testEnCours, definirTestEnCours] = useState(false);
  const [rapport, definirRapport] = useState<ConnectionTestResult | null>(null);
  const zoneResultat = useRef<HTMLDivElement>(null);

  // Le résultat peut tomber sous le bas de la fenêtre : on l'amène à l'écran et on y place le focus.
  useEffect(() => {
    if (rapport !== null) {
      zoneResultat.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      zoneResultat.current?.focus({ preventScroll: true });
    }
  }, [rapport]);

  useEffect(() => {
    void api.lireEtatNas().then((recu) => {
      definirEtat(recu);
      if (recu.reglages !== null) {
        definirSaisie(recu.reglages);
      }
    });
  }, []);

  const modifier = (champ: keyof NasSettings) => (valeur: string) => {
    definirSaisie((precedent) => ({ ...precedent, [champ]: valeur }));
  };

  const enregistrer = async (): Promise<boolean> => {
    definirEnregistrementEnCours(true);
    try {
      const resultat = await api.enregistrerNas(motDePasse === '' ? saisie : { ...saisie, motDePasse });
      if (!resultat.ok) {
        definirErreurs(resultat.erreurs);
        return false;
      }
      definirErreurs({});
      definirEtat(resultat.etat);
      definirMotDePasse('');
      if (resultat.etat.reglages !== null) {
        definirSaisie(resultat.etat.reglages);
      }
      return true;
    } finally {
      definirEnregistrementEnCours(false);
    }
  };

  const soumettre = (evenement: FormEvent) => {
    evenement.preventDefault();
    void enregistrer();
  };

  const tester = async () => {
    definirRapport(null);
    if (!(await enregistrer())) {
      return;
    }
    definirTestEnCours(true);
    try {
      definirRapport(await api.testerConnexion());
    } finally {
      definirTestEnCours(false);
    }
  };

  const oublier = async () => {
    definirEtat(await api.oublierMotDePasse());
    definirRapport(null);
  };

  if (etat === null) {
    return <p className="text-discret text-sm">Chargement des réglages…</p>;
  }

  const occupe = enregistrementEnCours || testEnCours;

  return (
    <section aria-labelledby="titre-nas" className="space-y-6">
      <div>
        <h2 id="titre-nas" className="text-xl font-semibold">
          Connexion au NAS
        </h2>
        <p className="text-discret mt-1 text-sm">
          Les notes sont synchronisées en SMB 3 chiffré vers un partage du NAS. Le mot de passe ne quitte jamais ce poste.
        </p>
      </div>

      {!etat.stockageChiffre && (
        <div className="border-alerte/40 bg-alerte/10 flex gap-3 rounded-lg border p-4 text-sm" role="status">
          <ShieldAlert className="text-alerte mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            Aucun trousseau système n'est disponible pour chiffrer le mot de passe. Il sera gardé en mémoire jusqu'à la
            fermeture de l'application, puis redemandé au prochain lancement.
          </p>
        </div>
      )}

      <form onSubmit={soumettre} className="border-bordure bg-surface space-y-4 rounded-lg border p-5" noValidate>
        <TextField
          libelle="Adresse du NAS"
          aide="Nom d'hôte ou adresse IP, par exemple l'adresse Tailscale du NAS."
          valeur={saisie.hote}
          surChangement={modifier('hote')}
          erreur={erreurs.hote}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            libelle="Partage"
            aide="Nom du partage seul."
            valeur={saisie.partage}
            surChangement={modifier('partage')}
            erreur={erreurs.partage}
          />
          <TextField
            libelle="Dossier du vault"
            aide="Créé s'il n'existe pas. Vide pour la racine du partage."
            valeur={saisie.dossierVault}
            surChangement={modifier('dossierVault')}
            erreur={erreurs.dossierVault}
          />
          <TextField
            libelle="Utilisateur"
            valeur={saisie.utilisateur}
            surChangement={modifier('utilisateur')}
            erreur={erreurs.utilisateur}
          />
          <TextField
            libelle="Mot de passe"
            type="password"
            aide={aideMotDePasse(etat)}
            indication={etat.motDePasse === 'absent' ? '' : 'Vide : mot de passe actuel gardé'}
            valeur={motDePasse}
            surChangement={definirMotDePasse}
            erreur={erreurs.motDePasse}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={occupe}
            className="border-bordure hover:bg-bordure/60 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Save className="size-4" aria-hidden="true" />
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => void tester()}
            disabled={occupe}
            className="bg-accent text-fond flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50"
          >
            {testEnCours ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlugZap className="size-4" aria-hidden="true" />
            )}
            {testEnCours ? 'Test en cours…' : 'Enregistrer et tester'}
          </button>
          {etat.motDePasse !== 'absent' && (
            <button
              type="button"
              onClick={() => void oublier()}
              disabled={occupe}
              className="text-discret hover:text-texte ml-auto flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Oublier le mot de passe
            </button>
          )}
        </div>

        {/* Le résultat s'affiche sous le bouton qui l'a demandé, pas plus bas dans la page. */}
        <div ref={zoneResultat} tabIndex={-1} aria-live="polite" className="scroll-mb-6 outline-none">
          {rapport !== null && <ConnectionTestReport rapport={rapport} />}
        </div>
      </form>
    </section>
  );
}

function aideMotDePasse(etat: NasState): string {
  switch (etat.motDePasse) {
    case 'enregistre':
      return 'Un mot de passe est enregistré, chiffré par le trousseau du système.';
    case 'session':
      return "Un mot de passe est gardé en mémoire jusqu'à la fermeture de l'application.";
    case 'absent':
      return etat.stockageChiffre
        ? 'Il sera enregistré chiffré par le trousseau du système.'
        : "Il ne sera pas enregistré sur le disque.";
  }
}
