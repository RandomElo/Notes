// La déclaration doit suivre ce fichier partout où il est compilé (applications comprises), d'où la référence directe.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./markdown-it-mark.d.ts" />
import MarkdownIt from 'markdown-it';
import surlignage from 'markdown-it-mark';

const ouverture = '<u>';
const fermeture = '</u>';

/**
 * Souligné : `<u>texte</u>`, la seule balise reconnue. Elle devient une marque
 * du schéma, elle n'est pas injectée comme du HTML. Une ouverture sans
 * fermeture, ou l'inverse, reste du texte.
 */
function souligne(md: MarkdownIt): void {
  md.inline.ruler.before('autolink', 'souligne', (etat, silencieux) => {
    // Nombre de soulignés ouverts dans le texte en cours d'analyse.
    const suivi = etat as unknown as { soulignesOuverts?: number };
    const ouverts = suivi.soulignesOuverts ?? 0;
    if (etat.src.startsWith(ouverture, etat.pos)) {
      const fin = etat.src.indexOf(fermeture, etat.pos + ouverture.length);
      if (fin === -1 || fin + fermeture.length > etat.posMax) {
        return false;
      }
      if (!silencieux) {
        etat.push('u_open', 'u', 1);
        suivi.soulignesOuverts = ouverts + 1;
      }
      etat.pos += ouverture.length;
      return true;
    }
    if (ouverts > 0 && etat.src.startsWith(fermeture, etat.pos)) {
      if (!silencieux) {
        etat.push('u_close', 'u', -1);
        suivi.soulignesOuverts = ouverts - 1;
      }
      etat.pos += fermeture.length;
      return true;
    }
    return false;
  });
}

/**
 * L'analyseur Markdown : CommonMark, plus le barré, les tableaux (reconnus pour
 * être gardés tels quels), le surlignage `==texte==` et le souligné
 * `<u>texte</u>`. Le reste du HTML est désactivé : il reste du texte, il n'est
 * jamais interprété.
 */
export const analyseur = new MarkdownIt('commonmark', { html: false, linkify: false, typographer: false })
  .enable(['strikethrough', 'table'])
  .use(surlignage)
  .use(souligne);

/** Jeton de markdown-it. */
export type Jeton = ReturnType<typeof analyseur.parse>[number];
