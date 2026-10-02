import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { schema } from '../schema/extensions';
import { finDeLigneDe, ligneEstVide, repererLignes } from './lines';
import { UnsupportedMarkdown, convertirJetons } from './nodes';
import { analyseur } from './tokenizer';
import type { Jeton } from './tokenizer';
import type { ParsedMarkdown, SourceBlock } from './types';

/** Un bloc de premier niveau : ses lignes [debut, fin[ et ses jetons, ou aucun jeton pour du texte non reconnu. */
interface Zone {
  debut: number;
  fin: number;
  jetons: Jeton[] | null;
}

/**
 * Lit le corps Markdown d'une page. Rend le document et, pour chaque bloc de
 * premier niveau, son texte d'origine : ecrireMarkdown s'en sert pour ne
 * réécrire que les blocs modifiés.
 */
export function lireMarkdown(corps: string): ParsedMarkdown {
  const lignes = repererLignes(corps);
  const estVide = (numero: number): boolean => ligneEstVide(corps, lignes, numero);
  const zones = completer(grouper(analyseur.parse(corps, {})), lignes.debuts.length, estVide);

  const blocs: SourceBlock[] = zones.map((zone, index) => {
    const texte = corps.slice(lignes.debuts[zone.debut], lignes.fins[zone.fin - 1]);
    const suivante = zones[index + 1];
    return {
      noeud: versNoeud(zone.jetons, texte),
      texte,
      separateur: corps.slice(lignes.fins[zone.fin - 1], suivante === undefined ? corps.length : lignes.debuts[suivante.debut]),
    };
  });

  const premiere = zones[0];
  return {
    document: schema.topNodeType.createAndFill(null, blocs.map((bloc) => bloc.noeud)) as ProseMirrorNode,
    source: {
      finDeLigne: finDeLigneDe(corps),
      prefixe: premiere === undefined ? corps : corps.slice(0, lignes.debuts[premiere.debut]),
      blocs,
    },
  };
}

/** Regroupe les jetons par bloc de premier niveau. */
function grouper(jetons: Jeton[]): Zone[] {
  const zones: Zone[] = [];
  let debut = 0;
  jetons.forEach((jeton, index) => {
    if (jeton.level !== 0 || jeton.nesting === 1) {
      return;
    }
    const ouverture = jetons[debut] as Jeton;
    const [premiereLigne, ligneSuivante] = ouverture.map ?? [0, 0];
    zones.push({ debut: premiereLigne, fin: ligneSuivante, jetons: jetons.slice(debut, index + 1) });
    debut = index + 1;
  });
  return zones;
}

/**
 * Retire les lignes vides en fin de bloc (elles vont dans le séparateur), puis
 * transforme en zone sans jetons tout texte qui n'appartient à aucun bloc,
 * comme une définition de lien : rien du fichier ne doit rester hors d'un bloc
 * ou d'un séparateur fait de lignes vides.
 */
function completer(zones: Zone[], nombreDeLignes: number, estVide: (numero: number) => boolean): Zone[] {
  const completes: Zone[] = [];
  let curseur = 0;
  const combler = (jusque: number): void => {
    let debut = curseur;
    let fin = jusque;
    while (debut < fin && estVide(debut)) {
      debut++;
    }
    while (fin > debut && estVide(fin - 1)) {
      fin--;
    }
    if (debut < fin) {
      completes.push({ debut, fin, jetons: null });
    }
  };
  for (const zone of zones) {
    let fin = Math.min(zone.fin, nombreDeLignes);
    while (fin > zone.debut + 1 && estVide(fin - 1)) {
      fin--;
    }
    // Un bloc sans ligne (ne devrait pas arriver) ou qui recule est ignoré : son texte sera repris comme zone brute.
    if (zone.debut < curseur || fin <= zone.debut) {
      continue;
    }
    combler(zone.debut);
    completes.push({ ...zone, fin });
    curseur = fin;
  }
  combler(nombreDeLignes);
  return completes;
}

function versNoeud(jetons: Jeton[] | null, texte: string): ProseMirrorNode {
  if (jetons !== null) {
    try {
      const noeuds = convertirJetons(jetons);
      if (noeuds.length === 1) {
        return noeuds[0] as ProseMirrorNode;
      }
    } catch (erreur) {
      if (!(erreur instanceof UnsupportedMarkdown)) {
        throw erreur;
      }
    }
  }
  return (schema.nodes['rawBlock'] as NonNullable<(typeof schema.nodes)[string]>).create({ source: texte });
}
