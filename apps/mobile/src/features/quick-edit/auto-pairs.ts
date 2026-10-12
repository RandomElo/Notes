import { deciderPaire, effacerLaPaire } from '@notes/document';

const branchees = new WeakSet<HTMLTextAreaElement | HTMLInputElement>();

/**
 * Fermeture automatique dans un champ du téléphone, mêmes règles que
 * l'éditeur (document/schema/auto-pairs.ts). Passe par `beforeinput`, que le
 * clavier d'Android envoie aussi quand il ne donne pas les touches. À poser
 * comme `ref` : le champ n'est branché qu'une fois.
 */
export function brancherFermeture(champ: HTMLTextAreaElement | HTMLInputElement | null): void {
  if (champ === null || branchees.has(champ)) {
    return;
  }
  branchees.add(champ);
  champ.addEventListener('beforeinput', (brut) => {
    const evenement = brut as InputEvent;
    const de = champ.selectionStart ?? 0;
    const a = champ.selectionEnd ?? de;
    const valeur = champ.value;
    const avant = valeur.slice(Math.max(0, de - 2), de);
    const apres = valeur.slice(a, a + 2);
    if (evenement.inputType === 'insertText' && evenement.data !== null && evenement.data.length === 1) {
      const decision = deciderPaire(evenement.data, avant, apres, de !== a);
      if (decision === null) {
        return;
      }
      evenement.preventDefault();
      if (decision.genre === 'sauter') {
        champ.setSelectionRange(a + decision.longueur, a + decision.longueur);
        return;
      }
      const { ouvrant, fermant, espace } = decision;
      const milieu = valeur.slice(de, a);
      champ.setRangeText(ouvrant + espace + milieu + espace + fermant, de, a, 'start');
      champ.setSelectionRange(de + 1 + espace.length, de + 1 + espace.length + milieu.length);
    } else if (evenement.inputType === 'deleteContentBackward' && de === a) {
      const effacement = effacerLaPaire(avant, apres);
      if (effacement === null) {
        return;
      }
      evenement.preventDefault();
      champ.setRangeText('', de - effacement.avant, de + effacement.apres, 'start');
    } else {
      return;
    }
    // React ne voit pas `setRangeText` : l'événement `input` lui donne la nouvelle valeur.
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
