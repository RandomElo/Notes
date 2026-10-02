import type { Editor } from '@tiptap/core';

/** Les natures de bloc proposées par la barre d'outils, dans l'ordre du menu. */
export const typesDeBloc = [
  { cle: 'paragraphe', libelle: 'Texte' },
  { cle: 'titre1', libelle: 'Titre 1' },
  { cle: 'titre2', libelle: 'Titre 2' },
  { cle: 'titre3', libelle: 'Titre 3' },
  { cle: 'titre4', libelle: 'Titre 4' },
  { cle: 'titre5', libelle: 'Titre 5' },
  { cle: 'puces', libelle: 'Liste à puces' },
  { cle: 'numeros', libelle: 'Liste numérotée' },
  { cle: 'taches', libelle: 'Tâches' },
  { cle: 'code', libelle: 'Code' },
] as const;

export type BlockTypeKey = (typeof typesDeBloc)[number]['cle'];

const listes = { puces: ['bulletList', 'listItem'], numeros: ['orderedList', 'listItem'], taches: ['taskList', 'taskItem'] } as const;

/** Nature du bloc où se trouve le curseur. La liste la plus proche l'emporte sur le paragraphe qu'elle contient. */
export function typeCourant(editor: Editor): BlockTypeKey {
  const position = editor.state.selection.$from;
  for (let profondeur = position.depth; profondeur > 0; profondeur--) {
    const noeud = position.node(profondeur);
    switch (noeud.type.name) {
      case 'heading':
        return `titre${Math.min(5, Math.max(1, Number(noeud.attrs['level'])))}` as BlockTypeKey;
      case 'codeBlock':
        return 'code';
      case 'bulletList':
        return 'puces';
      case 'orderedList':
        return 'numeros';
      case 'taskList':
        return 'taches';
    }
  }
  return 'paragraphe';
}

/** Change la nature du bloc du curseur. Le bloc sort d'abord de sa liste, s'il y est. */
export function changerType(editor: Editor, cle: BlockTypeKey): void {
  const actuel = typeCourant(editor);
  if (actuel === cle) {
    return;
  }
  const chaine = editor.chain().focus();
  if (cle === 'puces' || cle === 'numeros' || cle === 'taches') {
    chaine.setParagraph().toggleList(listes[cle][0], listes[cle][1]).run();
    return;
  }
  if (actuel === 'puces' || actuel === 'numeros' || actuel === 'taches') {
    chaine.liftListItem(listes[actuel][1]);
  }
  switch (cle) {
    case 'paragraphe':
      chaine.setParagraph();
      break;
    case 'code':
      chaine.setCodeBlock();
      break;
    default:
      chaine.setHeading({ level: Number(cle.slice(-1)) as 1 | 2 | 3 | 4 | 5 });
  }
  chaine.run();
}
