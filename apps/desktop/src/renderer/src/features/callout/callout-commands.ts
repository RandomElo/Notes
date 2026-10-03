import { iconesParDefaut, typeDuCallout } from '@notes/document';
import type { CalloutType } from '@notes/document';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/** Libellé de chaque nature de callout, dans l'ordre du menu. */
export const naturesDeCallout: { type: CalloutType; libelle: string }[] = [
  { type: 'info', libelle: 'Info' },
  { type: 'success', libelle: 'Succès' },
  { type: 'warning', libelle: 'Attention' },
  { type: 'danger', libelle: 'Danger' },
];

/** Icônes proposées pour un callout. Une icône choisie est écrite dans le fichier, celle de la nature ne l'est pas. */
export const iconesProposees = ['💡', 'ℹ️', '✅', '⚠️', '🛑', '❗', '❓', '📌', '📝', '🔥', '🚀', '🔒', '🧪', '🐛', '⏳', '💬'];

/** Le callout qui contient le curseur : sa position et ses attributs. null hors d'un callout. */
export function calloutDuCurseur(etat: EditorState): { position: number; type: CalloutType; icon: string | null } | null {
  const { $from } = etat.selection;
  for (let profondeur = $from.depth; profondeur > 0; profondeur--) {
    const noeud = $from.node(profondeur);
    if (noeud.type.name === 'callout') {
      return { position: $from.before(profondeur), type: typeDuCallout(noeud.attrs['type']), icon: (noeud.attrs['icon'] as string | null) ?? null };
    }
  }
  return null;
}

/**
 * Change la nature du callout du curseur. Une icône qui n'était que celle de
 * l'ancienne nature suit la nouvelle ; une icône choisie reste.
 */
export function changerNature(type: CalloutType) {
  return (etat: EditorState): Transaction | null => {
    const callout = calloutDuCurseur(etat);
    if (callout === null) {
      return null;
    }
    const icone = callout.icon === null || callout.icon === iconesParDefaut[callout.type] ? null : callout.icon;
    return etat.tr.setNodeMarkup(callout.position, null, { type, icon: icone });
  };
}

/** Change l'icône du callout du curseur. null : l'icône de sa nature. */
export function changerIcone(icone: string | null) {
  return (etat: EditorState): Transaction | null => {
    const callout = calloutDuCurseur(etat);
    if (callout === null) {
      return null;
    }
    const icon = icone === iconesParDefaut[callout.type] ? null : icone;
    return etat.tr.setNodeMarkup(callout.position, null, { type: callout.type, icon });
  };
}

/** Retire le callout du curseur : ses paragraphes restent, à sa place. */
export function retirerCallout(etat: EditorState): Transaction | null {
  const callout = calloutDuCurseur(etat);
  const noeud = callout === null ? null : etat.doc.nodeAt(callout.position);
  if (callout === null || noeud === null) {
    return null;
  }
  return etat.tr.replaceWith(callout.position, callout.position + noeud.nodeSize, noeud.content);
}
