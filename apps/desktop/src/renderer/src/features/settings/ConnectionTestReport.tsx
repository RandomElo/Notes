import { CircleCheck, CircleX, Lock } from 'lucide-react';
import type { ConnectionTestResult } from '../../../../shared/ipc-contract';

const conseils: Partial<Record<Extract<ConnectionTestResult, { ok: false }>['erreur']['code'], string>> = {
  injoignable: "Vérifie l'adresse, que le NAS est allumé et, hors de chez toi, que Tailscale est actif.",
  identifiants_refuses: "Vérifie l'utilisateur et le mot de passe.",
  partage_introuvable: 'Vérifie le nom du partage.',
  chiffrement_absent:
    'Le NAS doit accepter SMB 3 avec le chiffrement du transport « défini par le client » ou « forcé ».',
  acces_refuse: "Ce compte n'a pas le droit d'écrire dans ce partage.",
};

/** Résultat du test de connexion : étapes passées, durées, et protection de la session. */
export function ConnectionTestReport({ rapport }: { rapport: ConnectionTestResult }) {
  return (
    <div
      className={`rounded-lg border p-4 ${rapport.ok ? 'border-succes/40 bg-succes/10' : 'border-erreur/40 bg-erreur/10'}`}
    >
      <div className="flex items-center gap-2 font-medium">
        {rapport.ok ? (
          <CircleCheck className="text-succes size-5" aria-hidden="true" />
        ) : (
          <CircleX className="text-erreur size-5" aria-hidden="true" />
        )}
        {rapport.ok ? 'Connexion réussie' : 'Échec du test'}
      </div>

      {!rapport.ok && (
        <div className="mt-2 text-sm">
          <p>{rapport.erreur.message}</p>
          {conseils[rapport.erreur.code] !== undefined && (
            <p className="text-discret mt-1">{conseils[rapport.erreur.code]}</p>
          )}
        </div>
      )}

      {rapport.etapes.length > 0 && (
        <ol className="mt-4 space-y-1 text-sm">
          {rapport.etapes.map((etape) => (
            <li key={etape.libelle} className="flex justify-between gap-4">
              <span>{etape.libelle}</span>
              <span className="text-discret tabular-nums">{etape.dureeMs} ms</span>
            </li>
          ))}
        </ol>
      )}

      {rapport.ok && (
        <p className="text-discret mt-4 flex items-center gap-2 text-sm">
          <Lock className="size-4" aria-hidden="true" />
          {rapport.protection.dialecte}, messages signés, {rapport.protection.reponsesChiffrees} réponses chiffrées sur{' '}
          {rapport.protection.reponsesTotal}.
        </p>
      )}
    </div>
  );
}
