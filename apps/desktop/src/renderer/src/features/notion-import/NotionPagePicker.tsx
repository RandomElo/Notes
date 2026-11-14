import { PageView } from '@notes/ui';
import { ChevronDown, ChevronRight, FileText, LoaderCircle, Paperclip } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { NotionAnalysis, NotionDatabaseChoice, NotionFlag, NotionPageNode, NotionPreviewResult } from '../../../../shared/notion-contract';
import { api } from '../../lib/ipc';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0';
const boutonPrincipal =
  'bg-accent text-fond hover:brightness-110 focus-visible:brightness-125 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0';
const champ = 'bg-fond text-texte focus:bg-texte/15 hover:bg-texte/10 rounded-md px-2 py-1.5 text-sm outline-0';

export const libellesDesChoix: Record<NotionDatabaseChoice, string> = {
  'tableau-et-pages': 'Tableau et sous-pages',
  pages: 'Sous-pages seules',
  tableau: 'Tableau seul',
  ignorer: 'Ne pas importer',
};

const libellesDesSignalements: Record<NotionFlag, string> = {
  vide: 'Vide',
  modele: 'Modèle Notion',
  doublon: 'Doublon',
  'sans-titre': 'Sans titre',
};

const pluriel = (nombre: number, un: string, plusieurs: string): string => `${nombre.toLocaleString('fr-FR')} ${nombre > 1 ? plusieurs : un}`;
const taille = (octets: number): string =>
  octets < 1024 * 1024 ? `${Math.max(1, Math.round(octets / 1024)).toLocaleString('fr-FR')} Ko` : `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

/** Toutes les pages de l'arbre, à plat, avec leur parent. */
function aPlat(arbre: readonly NotionPageNode[]): { noeuds: NotionPageNode[]; parents: Map<string, string | null> } {
  const noeuds: NotionPageNode[] = [];
  const parents = new Map<string, string | null>();
  const parcourir = (liste: readonly NotionPageNode[], parent: string | null): void => {
    for (const noeud of liste) {
      noeuds.push(noeud);
      parents.set(noeud.fichier, parent);
      parcourir(noeud.enfants, noeud.fichier);
    }
  };
  parcourir(arbre, null);
  return { noeuds, parents };
}

/** L'image d'un aperçu, sous son adresse telle quelle ou décodée. */
function imageDeLApercu(images: Record<string, string>, src: string): string | null {
  if (images[src] !== undefined) {
    return images[src];
  }
  const decodee = (adresse: string): string => {
    try {
      return decodeURIComponent(adresse);
    } catch {
      return adresse;
    }
  };
  return Object.entries(images).find(([adresse]) => decodee(adresse) === decodee(src))?.[1] ?? null;
}

const descendants = (noeud: NotionPageNode): string[] => [noeud.fichier, ...noeud.enfants.flatMap(descendants)];

/** Les pages décochées d'office : celles qui sont signalées, et leurs sous-pages. */
export function exclusesParDefaut(arbre: readonly NotionPageNode[]): Set<string> {
  return new Set(aPlat(arbre).noeuds.filter((noeud) => noeud.signalements.length > 0).flatMap(descendants));
}

/** L'arbre réduit aux branches qui mènent à une page signalée ou avec des PDF. */
function elague(arbre: readonly NotionPageNode[]): NotionPageNode[] {
  return arbre.flatMap((noeud) => {
    const enfants = elague(noeud.enfants);
    return noeud.signalements.length > 0 || noeud.pdf.length > 0 || enfants.length > 0 ? [{ ...noeud, enfants }] : [];
  });
}

interface NotionPagePickerProps {
  analyse: NotionAnalysis;
  choix: Record<string, NotionDatabaseChoice>;
  surChoix: (cle: string, choix: NotionDatabaseChoice) => void;
  surImport: (exclues: string[]) => void;
  surAnnulation: () => void;
}

/**
 * Choix des pages à importer (docs/spec/import-notion.md) : l'arbre de Notion
 * à cocher, l'aperçu de la page choisie, les pages proposées à la suppression
 * et les PDF signalés.
 */
export function NotionPagePicker({ analyse, choix, surChoix, surImport, surAnnulation }: NotionPagePickerProps) {
  const { noeuds, parents } = useMemo(() => aPlat(analyse.arbre), [analyse]);
  const [exclues, definirExclues] = useState<Set<string>>(() => exclusesParDefaut(analyse.arbre));
  const [ouverts, definirOuverts] = useState<Set<string>>(() => new Set());
  const [signaleesSeules, definirSignaleesSeules] = useState(false);
  const [choisie, definirChoisie] = useState<NotionPageNode | null>(null);
  const [apercu, definirApercu] = useState<NotionPreviewResult | null>(null);

  const signalees = noeuds.filter((noeud) => noeud.signalements.length > 0).length;
  const pdf = noeuds.flatMap((noeud) => noeud.pdf);
  const cochees = noeuds.length - exclues.size;
  const pdfCoches = noeuds.filter((noeud) => !exclues.has(noeud.fichier)).flatMap((noeud) => noeud.pdf);

  useEffect(() => {
    if (choisie === null) {
      return undefined;
    }
    let actuel = true;
    definirApercu(null);
    void api.apercuNotion({ fichier: choisie.fichier }).then((resultat) => actuel && definirApercu(resultat));
    return () => {
      actuel = false;
    };
  }, [choisie]);

  const basculer = (noeud: NotionPageNode): void => {
    definirExclues((avant) => {
      const apres = new Set(avant);
      if (avant.has(noeud.fichier)) {
        // Cocher une page coche ses sous-pages, et les pages au-dessus d'elle : une sous-page ne vient pas sans sa page.
        descendants(noeud).forEach((fichier) => apres.delete(fichier));
        for (let parent = parents.get(noeud.fichier) ?? null; parent !== null; parent = parents.get(parent) ?? null) {
          apres.delete(parent);
        }
      } else {
        descendants(noeud).forEach((fichier) => apres.add(fichier));
      }
      return apres;
    });
  };

  const arbre = signaleesSeules ? elague(analyse.arbre) : analyse.arbre;
  const estOuvert = (fichier: string): boolean => signaleesSeules || ouverts.has(fichier);

  const ligne = (noeud: NotionPageNode, profondeur: number): ReactNode => (
    <li key={noeud.fichier} role="treeitem" aria-selected={choisie?.fichier === noeud.fichier} aria-expanded={noeud.enfants.length > 0 ? estOuvert(noeud.fichier) : undefined}>
      <div
        className={`flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm ${choisie?.fichier === noeud.fichier ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
        style={{ paddingLeft: `${profondeur * 16 + 4}px` }}
      >
        {noeud.enfants.length > 0 ? (
          <button
            type="button"
            aria-label={estOuvert(noeud.fichier) ? `Replier « ${noeud.titre} »` : `Déplier « ${noeud.titre} »`}
            onClick={() =>
              definirOuverts((avant) => {
                const apres = new Set(avant);
                if (apres.has(noeud.fichier)) {
                  apres.delete(noeud.fichier);
                } else {
                  apres.add(noeud.fichier);
                }
                return apres;
              })
            }
            className="text-discret hover:bg-texte/10 focus-visible:bg-texte/20 flex size-5 shrink-0 items-center justify-center rounded outline-0"
          >
            {estOuvert(noeud.fichier) ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <input
          type="checkbox"
          aria-label={`Importer « ${noeud.titre} »`}
          checked={!exclues.has(noeud.fichier)}
          onChange={() => basculer(noeud)}
          className="accent-accent size-4 shrink-0 cursor-pointer"
        />
        <button type="button" onClick={() => definirChoisie(noeud)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-0 focus-visible:underline">
          <span className="w-5 shrink-0 text-center" aria-hidden="true">
            {noeud.icone ?? <FileText className="text-discret inline size-4" />}
          </span>
          <span className={`truncate ${exclues.has(noeud.fichier) ? 'text-discret line-through' : ''}`}>{noeud.titre}</span>
        </button>
        {noeud.signalements.map((signalement) => (
          <span key={signalement} className="bg-erreur/15 text-erreur shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium">
            {libellesDesSignalements[signalement]}
          </span>
        ))}
        {noeud.pdf.length > 0 && (
          <span className="bg-texte/10 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px]">
            <Paperclip className="size-3" aria-hidden="true" />
            {pluriel(noeud.pdf.length, 'PDF', 'PDF')}
          </span>
        )}
      </div>
      {noeud.enfants.length > 0 && estOuvert(noeud.fichier) && <ul role="group">{noeud.enfants.map((enfant) => ligne(enfant, profondeur + 1))}</ul>}
    </li>
  );

  return (
    <div role="dialog" aria-label="Pages à importer" className="bg-fond fixed inset-0 z-40 flex flex-col">
      <header className="border-bordure flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b px-6 py-3">
        <h2 className="text-lg font-semibold">Pages à importer</h2>
        <p role="status" className="text-discret text-sm">
          {pluriel(cochees, 'page cochée', 'pages cochées')} sur {analyse.pages.toLocaleString('fr-FR')}
          {signalees > 0 && ` · ${pluriel(signalees, 'proposée à la suppression', 'proposées à la suppression')}`}
          {pdf.length > 0 && ` · ${pluriel(pdfCoches.length, 'PDF inclus', 'PDF inclus')} (${taille(pdfCoches.reduce((total, fichier) => total + fichier.taille, 0))})`}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={signaleesSeules} onChange={(evenement) => definirSignaleesSeules(evenement.target.checked)} className="accent-accent size-4" />
          Seulement les pages signalées ou avec des PDF
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={surAnnulation} className={boutonSecondaire}>
            Annuler
          </button>
          <button type="button" onClick={() => surImport([...exclues])} disabled={cochees === 0} className={`${boutonPrincipal} disabled:opacity-50`}>
            Importer
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ul role="tree" aria-label="Pages de l'export" className="border-bordure w-[30rem] shrink-0 overflow-y-auto border-r p-2">
          {arbre.map((noeud) => ligne(noeud, 0))}
        </ul>

        <section aria-label="Aperçu" className="min-w-0 flex-1 overflow-y-auto px-10 py-6">
          {choisie === null ? (
            <p className="text-discret text-sm">
              Clique sur une page pour voir son contenu. Les pages signalées sont décochées d'office : vides, modèles créés par Notion, doublons, sans titre. Les bases de
              données se règlent dans l'aperçu de leur page.
            </p>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              <h3 className="text-2xl font-semibold">
                {choisie.icone !== null && <span className="mr-2">{choisie.icone}</span>}
                {choisie.titre}
              </h3>
              {choisie.pdf.length > 0 && (
                <ul className="bg-surface space-y-1 rounded-lg p-3 text-sm" aria-label="PDF de la page">
                  {choisie.pdf.map((fichier) => (
                    <li key={fichier.nom} className="flex items-center gap-2">
                      <Paperclip className="text-discret size-4" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{fichier.nom}</span>
                      <span className="text-discret">{taille(fichier.taille)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {choisie.bases.map((cle) => {
                const base = analyse.bases.find((candidate) => candidate.cle === cle);
                return base === undefined ? null : (
                  <div key={cle} className="bg-surface flex items-center gap-3 rounded-lg p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">Base « {base.titre} »</p>
                      <p className="text-discret text-xs">{pluriel(base.lignes, 'ligne', 'lignes')}</p>
                    </div>
                    <select aria-label={`Que devient « ${base.titre} »`} value={choix[cle]} onChange={(evenement) => surChoix(cle, evenement.target.value as NotionDatabaseChoice)} className={champ}>
                      {(Object.keys(libellesDesChoix) as NotionDatabaseChoice[]).map((valeur) => (
                        <option key={valeur} value={valeur}>
                          {libellesDesChoix[valeur]}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {apercu === null ? (
                <p className="text-discret flex items-center gap-2 text-sm">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Lecture de la page…
                </p>
              ) : !apercu.ok ? (
                <p role="alert" className="text-erreur text-sm">
                  {apercu.erreur}
                </p>
              ) : apercu.corps.trim() === '' ? (
                <p className="text-discret text-sm">Page sans contenu.</p>
              ) : (
                <PageView corps={apercu.corps} resoudreImage={(src) => imageDeLApercu(apercu.images, src)} />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
