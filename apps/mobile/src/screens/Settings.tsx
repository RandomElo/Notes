import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { StatusPill } from '../components/StatusPill';
import { BoutonIcone, TopBar } from '../components/TopBar';
import { useNavigation } from '../state/navigation';
import { useNotes } from '../state/NotesContext';
import { pagesAplaties } from '../state/pages';

/** Réglages du téléphone : la connexion, la sync, la version. */
export function Settings() {
  const { reglages, arbre, voie, oublierMotDePasse } = useNotes();
  const navigation = useNavigation();
  const [confirmer, definirConfirmer] = useState(false);
  const nombreDePages = useMemo(() => pagesAplaties(arbre).length, [arbre]);
  const nas = reglages.nas;

  return (
    <div className="min-h-dvh">
      <TopBar
        gauche={
          <BoutonIcone libelle="Retour" onClick={navigation.retour}>
            <ArrowLeft className="size-5" />
          </BoutonIcone>
        }
        titre="Réglages"
      />
      <main className="marge-bas space-y-6 px-3 pb-10">
        <Groupe titre="Synchronisation">
          <StatusPill />
          <p className="px-3 text-sm text-discret">
            {nombreDePages} {nombreDePages > 1 ? 'pages' : 'page'} sur le téléphone. Mise à jour à l’ouverture, au retour dans l’application, toutes les 30 secondes et en tirant l’accueil vers le bas.
          </p>
        </Groupe>
        {nas !== null && (
          <Groupe titre="NAS">
            <dl className="space-y-2 px-3 text-sm">
              <Ligne nom="Adresse locale">{nas.hote}</Ligne>
              <Ligne nom="Adresse Tailscale">{reglages.hoteTailscale === '' ? 'aucune' : reglages.hoteTailscale}</Ligne>
              {voie !== null && <Ligne nom="Connecté par">{voie === 'tailscale' ? 'Tailscale' : 'le réseau local'}</Ligne>}
              <Ligne nom="Partage">{nas.partage}</Ligne>
              <Ligne nom="Dossier des notes">{nas.dossierVault === '' ? 'racine du partage' : nas.dossierVault}</Ligne>
              <Ligne nom="Utilisateur">{nas.utilisateur}</Ligne>
            </dl>
            <Bouton onClick={() => navigation.ouvrir({ nom: 'connexion' })}>Modifier la connexion</Bouton>
            {confirmer ? (
              <div className="flex gap-2 px-1">
                <Bouton danger onClick={() => void oublierMotDePasse()}>
                  Oublier le mot de passe
                </Bouton>
                <Bouton onClick={() => definirConfirmer(false)}>Annuler</Bouton>
              </div>
            ) : (
              <Bouton onClick={() => definirConfirmer(true)}>Oublier le mot de passe…</Bouton>
            )}
          </Groupe>
        )}
        <p className="px-3 text-sm text-discret">Notes {__VERSION__}</p>
      </main>
    </div>
  );
}

function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-3 pt-2 text-xs font-semibold tracking-wide text-discret uppercase">{titre}</h2>
      {children}
    </section>
  );
}

function Ligne({ nom, children }: { nom: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-discret">{nom}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function Bouton({ onClick, children, danger = false }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-3 text-left outline-none ${danger ? 'bg-erreur/15 text-erreur active:bg-erreur/30' : 'active:bg-texte/10 focus-visible:bg-texte/15'}`}
    >
      {children}
    </button>
  );
}
