import { assemblerVersions, comparerVersions } from '@notes/document';
import { PageView } from '@notes/ui';
import { ArrowLeft, Check, Eye, TriangleAlert } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/ipc';
import { adresseDImage } from '../images/image-url';
import { blocsRetenus, choisirBloc, creerEtat, deplacerBloc, deplacerMorceau, garderTexte, recommencerTexte, restantes, retirerMorceau, toutPrendre } from './conflict-model';
import type { ConflictState, Cote } from './conflict-model';
import { BlockLine, Marque, TextLine } from './ConflictLines';

interface ConflictScreenProps {
  /** Chemin de la version mise de côté (`Page/page.conflit-[date].md`). */
  sauvegarde: string;
  /** Titre de la page, affiché comme sur la page elle-même. */
  titre: string;
  /** Retour à la page : `resolu` vaut vrai une fois la page enregistrée et la sauvegarde supprimée. */
  surFermeture: (resolu: boolean) => void;
}

type Chargement =
  | { etat: 'lecture' }
  | { etat: 'erreur'; message: string }
  | { etat: 'pret'; page: string; corpsPage: string; corpsSauvegarde: string; modifieLePage: string | null; modifieLeSauvegarde: string | null };

const classeBouton = 'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs outline-0 disabled:opacity-45';

function heure(iso: string | null): string {
  if (iso === null || Number.isNaN(Date.parse(iso))) {
    return '';
  }
  return ` le ${new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Écran de résolution d'un conflit (README §5) : la page (A) et la version
 * mise de côté (B) face à face dans la page, bloc par bloc. Rien n'est écrit
 * avant « Valider », qui enregistre la page et supprime la version mise de côté.
 */
export function ConflictScreen({ sauvegarde, titre, surFermeture }: ConflictScreenProps) {
  const [chargement, definirChargement] = useState<Chargement>({ etat: 'lecture' });
  const [etat, definirEtat] = useState<ConflictState>([]);
  const [apercu, definirApercu] = useState(false);
  const [envoi, definirEnvoi] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  // Version de bloc en cours de glisser par sa poignée, et ligne avant laquelle elle tomberait.
  const [prise, definirPrise] = useState<{ id: number; cote: Cote } | null>(null);
  const [cible, definirCible] = useState<number | null>(null);

  useEffect(() => {
    let actif = true;
    void api.lireConflit({ sauvegarde }).then((lu) => {
      if (!actif) {
        return;
      }
      if (!lu.ok) {
        definirChargement({ etat: 'erreur', message: lu.erreur.message });
        return;
      }
      definirChargement({ etat: 'pret', ...lu });
      definirEtat(creerEtat(comparerVersions(lu.corpsPage, lu.corpsSauvegarde)));
    });
    return () => {
      actif = false;
    };
  }, [sauvegarde]);

  const page = chargement.etat === 'pret' ? chargement.page : '';
  const resoudreImage = useCallback((src: string) => adresseDImage(page, src), [page]);
  const resultat = useMemo(
    () => (chargement.etat === 'pret' ? assemblerVersions(blocsRetenus(etat), chargement.corpsPage, chargement.corpsSauvegarde) : ''),
    [chargement, etat],
  );
  const aRegler = restantes(etat);
  const differences = etat.filter((ligne) => ligne.genre !== 'pareil').length;

  const deplacer = (id: number, cote: Cote, avant: number): void => {
    const suivant = deplacerBloc(etat, id, cote, avant);
    definirEtat(suivant.etat);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ligne="${suivant.id}"] [data-poignee="${cote}"]`)?.focus());
  };

  const valider = async (): Promise<void> => {
    if (chargement.etat !== 'pret') {
      return;
    }
    definirEnvoi(true);
    definirErreur(null);
    // Comme une frappe : on n'écrit pas une page qu'un autre appareil est en train de modifier.
    const verrou = await api.prendreVerrou({ chemin: chargement.page });
    if (!verrou.ok) {
      definirEnvoi(false);
      definirErreur(`La page est en cours de modification sur ${verrou.nom === '' ? 'un autre appareil' : `« ${verrou.nom} »`}. Réessaie quand elle sera libre.`);
      return;
    }
    const enregistre = await api.resoudreConflit({ sauvegarde, corps: resultat, corpsDeBase: chargement.corpsPage });
    void api.quitterPage({ chemin: chargement.page });
    definirEnvoi(false);
    if (!enregistre.ok) {
      definirErreur(`La page n'a pas été enregistrée : ${enregistre.erreur.message}`);
      return;
    }
    surFermeture(true);
  };

  return (
    <div className="bg-fond text-texte -mr-6 -ml-12 min-h-full pr-6 pl-12">
      <article className="mx-auto max-w-(--ui-largeur-contenu) pb-24">
        <div className="bg-fond sticky top-0 z-20 -mx-2 flex items-center gap-2 px-2 py-2">
          <p className="text-discret min-w-0 flex-1 truncate text-xs">{page.split('/').join(' / ')}</p>
          {chargement.etat === 'pret' && (
            <>
              <span className="text-discret hidden text-xs whitespace-nowrap lg:inline">{aRegler === 0 ? 'Tout est réglé' : `${aRegler} sur ${differences} à régler`}</span>
              <button type="button" onClick={() => definirEtat(toutPrendre(etat, 'a'))} className={classeBouton}>
                Tout <Marque cote="a" />
              </button>
              <button type="button" onClick={() => definirEtat(toutPrendre(etat, 'b'))} className={classeBouton}>
                Tout <Marque cote="b" />
              </button>
              <button type="button" aria-pressed={apercu} onClick={() => definirApercu(!apercu)} className={`${classeBouton} ${apercu ? 'bg-accent/25' : ''}`}>
                <Eye className="size-3.5" aria-hidden="true" />
                Aperçu
              </button>
              <button
                type="button"
                disabled={aRegler > 0 || envoi}
                onClick={() => void valider()}
                title={aRegler > 0 ? 'Il reste des différences à régler' : 'Enregistrer la page et supprimer la version mise de côté'}
                className={`${classeBouton} bg-accent/30 hover:bg-accent/45`}
              >
                <Check className="size-3.5" aria-hidden="true" />
                Valider
              </button>
            </>
          )}
          <button type="button" onClick={() => surFermeture(false)} title="Revenir à la page sans rien changer" className={classeBouton}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Retour
          </button>
        </div>

        <h1 className="mt-6 mb-6 text-[2.4rem] leading-tight font-extrabold">{titre}</h1>

        {chargement.etat === 'erreur' && (
          <p role="alert" className="bg-erreur/10 rounded-md p-3 text-sm">
            Cette version en conflit n'a pas pu être lue : {chargement.message}
          </p>
        )}

        {chargement.etat === 'pret' && (
          <>
            <div className="border-alerte bg-alerte/12 mb-6 flex gap-3 rounded-md border-l-[3px] p-3 text-sm">
              <TriangleAlert className="text-alerte mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <p>Cette page a été modifiée sur deux appareils en même temps.</p>
                <p className="text-discret">
                  <Marque cote="a" /> la page, modifiée{heure(chargement.modifieLePage)}. <Marque cote="b" /> la version mise de côté, modifiée{heure(chargement.modifieLeSauvegarde)}. Choisis ce que la
                  page garde à chaque différence : rien n'est modifié avant « Valider ».
                </p>
                {differences === 0 && <p>Les deux versions ont le même contenu : « Valider » supprime simplement la version mise de côté.</p>}
              </div>
            </div>

            {erreur !== null && (
              <p role="alert" className="bg-erreur/10 mb-4 rounded-md p-3 text-sm">
                {erreur}
              </p>
            )}

            {apercu ? (
              <PageView corps={resultat} resoudreImage={resoudreImage} />
            ) : (
              <div
                onDragOver={(evenement) => {
                  if (prise === null) {
                    return;
                  }
                  evenement.preventDefault();
                  const ligne = (evenement.target as HTMLElement).closest<HTMLElement>('[data-position]');
                  if (ligne !== null) {
                    const boite = ligne.getBoundingClientRect();
                    definirCible(Number(ligne.dataset['position']) + (evenement.clientY > boite.top + boite.height / 2 ? 1 : 0));
                  }
                }}
                onDrop={(evenement) => {
                  if (prise !== null && cible !== null) {
                    evenement.preventDefault();
                    deplacer(prise.id, prise.cote, cible);
                  }
                  definirPrise(null);
                  definirCible(null);
                }}
              >
                {etat.map((ligne, position) => (
                  <Fragment key={ligne.id}>
                    {cible === position && <div className="bg-accent my-1 h-0.5" aria-hidden="true" />}
                    <div data-position={position} data-ligne={ligne.id} className="relative">
                      {ligne.genre === 'pareil' ? (
                        <div className="mb-3">
                          <PageView corps={ligne.texte} resoudreImage={resoudreImage} />
                        </div>
                      ) : ligne.genre === 'bloc' ? (
                        <BlockLine
                          ligne={ligne}
                          resoudreImage={resoudreImage}
                          surChoix={(choix) => definirEtat(choisirBloc(etat, ligne.id, choix))}
                          surPrise={(cote) => definirPrise({ id: ligne.id, cote })}
                          surFin={() => {
                            definirPrise(null);
                            definirCible(null);
                          }}
                          surPas={(cote, sens) => {
                            const avant = sens === -1 ? position - 1 : position + 2;
                            if (avant >= 0 && avant <= etat.length) {
                              deplacer(ligne.id, cote, avant);
                            }
                          }}
                        />
                      ) : (
                        <TextLine
                          ligne={ligne}
                          surGarde={(garde) => definirEtat(garderTexte(etat, ligne.id, garde))}
                          surRecommencer={() => definirEtat(recommencerTexte(etat, ligne.id))}
                          surRetrait={(indice) => definirEtat(retirerMorceau(etat, ligne.id, indice))}
                          surDeplacement={(de, avant) => definirEtat(deplacerMorceau(etat, ligne.id, de, avant))}
                        />
                      )}
                    </div>
                  </Fragment>
                ))}
                {cible === etat.length && <div className="bg-accent my-1 h-0.5" aria-hidden="true" />}
              </div>
            )}
          </>
        )}
      </article>
    </div>
  );
}
