import type { Transform } from '@tiptap/pm/transform';

/**
 * Ajoute une tâche non cochée en tête de la dernière liste de tâches de la
 * page (le champ d'ajout rapide du mode liste, README §14), ou dans une
 * nouvelle liste en fin de page s'il n'y en a pas. Le texte est pris tel
 * quel, sans Markdown. Rend la position de la fin de son texte, ou null si le
 * texte est vide.
 */
export function ajouterTache(tr: Transform, texte: string): number | null {
  const propre = texte.replace(/\s+/g, ' ').trim();
  if (propre === '') {
    return null;
  }
  const schema = tr.doc.type.schema;
  const tache = schema.nodes['taskItem']!.create({ checked: false }, schema.nodes['paragraph']!.create(null, schema.text(propre)));
  let derniere: number | null = null;
  tr.doc.forEach((bloc, debut) => {
    if (bloc.type.name === 'taskList') {
      derniere = debut;
    }
  });
  if (derniere !== null) {
    tr.insert(derniere + 1, tache);
    // Ouverture de la liste, de l'item et du paragraphe.
    return derniere + 3 + propre.length;
  }
  const liste = schema.nodes['taskList']!.create({ tight: true }, tache);
  const dernierBloc = tr.doc.lastChild;
  // Le paragraphe vide de fin de page (curseur sous le dernier bloc) laisse sa place à la liste.
  const fin = tr.doc.content.size;
  const debut = dernierBloc !== null && dernierBloc.type.name === 'paragraph' && dernierBloc.content.size === 0 ? fin - dernierBloc.nodeSize : fin;
  tr.replaceWith(debut, fin, liste);
  return debut + 3 + propre.length;
}
